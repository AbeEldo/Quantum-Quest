import React, { useMemo, useState } from 'react';
import { useGame, GameOverlay, HowToPlay } from '../../../components/game';
import { Toggle, Segmented } from '../../../components/ui';
import { mulberry32 } from '../../../engine/qsim';
import { BitToggles, ProbBars } from '../widgets/viz';
import {
  bitstr, dot2, djTable, simonTable, runQueryRig, registerMarginal, sampleFrom, gf2Rank, gf2Solutions, type QueryRig,
} from '../algos';

type Kind = 'dj' | 'bv' | 'simon';
interface LevelDef {
  name: string;
  kind: Kind;
  n: number;
  bot: 'exact' | 'gambler' | 'bv' | 'birthday';
  brief: string;
  lesson: string;
}

const LEVELS: LevelDef[] = [
  {
    name: "Deutsch's Box", kind: 'dj', n: 1, bot: 'exact',
    brief: 'A 1-bit function: constant or balanced? The bot must ask f(0) and f(1).',
    lesson: "Classically, one value of f says nothing about whether f(0) = f(1). With the ancilla in |−⟩ the query writes (−1)^f(x) into the phase, and the final H turns the relative sign into a definite bit: 0 = constant, 1 = balanced.",
  },
  {
    name: 'Secret Agent', kind: 'bv', n: 4, bot: 'bv',
    brief: 'f(x) = s·x mod 2 hides a 4-bit secret. The bot queries 1000, 0100, … one bit at a time.',
    lesson: "Each classical query returns one bit, so n bits need n queries. Quantumly, the phase query on a uniform superposition produces H⊗ⁿ|s⟩, and the final Hadamard layer returns |s⟩. All n bits come from one query.",
  },
  {
    name: 'The Promise', kind: 'dj', n: 4, bot: 'exact',
    brief: '4-bit constant-or-balanced function. The bot insists on certainty: it may need 2³ + 1 = 9 queries.',
    lesson: 'The amplitude of 0000 after the final Hadamards is the average of (−1)^f(x): ±1 if constant, 0 if balanced. One query, total interference.',
  },
  {
    name: 'Long Secret', kind: 'bv', n: 6, bot: 'bv',
    brief: 'A 6-bit secret this time. Same oracle family, more bits for the bot to dig out.',
    lesson: 'The quantum cost stays at 1 query whatever n is, while the classical cost grows to n. That separation is linear rather than exponential, but it holds even against randomized classical algorithms.',
  },
  {
    name: 'The Gambler', kind: 'dj', n: 6, bot: 'gambler',
    brief: 'A new bot: it samples just 3 random inputs and guesses. Fast, but can it be fooled?',
    lesson: "The Gambler is a randomized classical algorithm. On a balanced function, 3 random answers all agree with probability 2·(1/2)³ = 1/4, and k queries push the error to 2^(1−k). That is why Deutsch–Jozsa's exponential advantage disappears once classical algorithms may use randomness and tolerate a small error.",
  },
  {
    name: 'Hidden Mask', kind: 'simon', n: 5, bot: 'birthday',
    brief: "Simon's problem: f(x) = f(x⊕s). The bot hunts for a collision (birthday attack). At n = 5 it's a real race.",
    lesson: "Each quantum run gives a random y with y·s = 0. After n − 1 independent equations, Gaussian elimination over GF(2) pins down s. At n = 5 the birthday bot is competitive, since 2^(n/2) ≈ 6 is not much bigger than n.",
  },
  {
    name: 'Deep Mask', kind: 'simon', n: 8, bot: 'birthday',
    brief: 'n = 8 (256 inputs). The bot needs about 2⁴ = 16 or more queries for a collision; you need about 8.',
    lesson: 'Here the exponential separation starts to show: about n quantum queries against about 2^(n/2) classical ones. At n = 100 that would be about 100 against 10¹⁵.',
  },
];

interface Round {
  table: number[];
  secret: number; // BV: s, Simon: s, DJ: 0 constant / 1 balanced
  botQueried: number[];
  botLog: string[];
  botDone: null | { answer: number; correct: boolean };
  botOut: boolean; // gambler guessed wrong
  myQueries: number;
  wasted: number;
  results: { kind: 'q' | 'c'; text: string; y?: number; good?: boolean }[];
  ys: number[];
  status: 'play' | 'won' | 'lost';
  wrongSubmits: number;
}

function newRound(L: LevelDef, seed: number): Round {
  const rng = mulberry32(seed);
  const N = 1 << L.n;
  let table: number[] = [], secret = 0;
  if (L.kind === 'dj') {
    const balanced = rng() < 0.5;
    secret = balanced ? 1 : 0;
    table = djTable(balanced ? 'balanced' : rng() < 0.5 ? 'constant0' : 'constant1', L.n, rng);
  } else if (L.kind === 'bv') {
    secret = 1 + Math.floor(rng() * (N - 1));
    table = Array.from({ length: N }, (_, x) => dot2(x, secret));
  } else {
    secret = 1 + Math.floor(rng() * (N - 1));
    table = simonTable(L.n, secret, rng);
  }
  return { table, secret, botQueried: [], botLog: [], botDone: null, botOut: false, myQueries: 0, wasted: 0, results: [], ys: [], status: 'play', wrongSubmits: 0 };
}

/** One bot action: either submit (if it has enough information) or make another query. */
function botStep(L: LevelDef, r: Round, rng: () => number): Round {
  if (r.botDone || r.botOut) return r;
  const N = 1 << L.n;
  const q = r.botQueried;
  const vals = q.map((x) => r.table[x]);
  // can the bot submit?
  let ready: null | number = null;
  if (L.kind === 'dj') {
    const distinct = new Set(vals).size;
    if (distinct > 1) ready = 1;
    else if (L.bot === 'gambler' && q.length >= 3) ready = 0;
    else if (q.length >= N / 2 + 1) ready = 0;
  } else if (L.kind === 'bv') {
    if (q.length >= L.n) ready = q.reduce((s, x, i) => s | (vals[i] ? x : 0), 0);
  } else {
    for (let i = 0; i < q.length && ready === null; i++)
      for (let j = i + 1; j < q.length; j++)
        if (vals[i] === vals[j]) {
          ready = q[i] ^ q[j];
          break;
        }
  }
  if (ready !== null) {
    const correct = ready === r.secret;
    const what = L.kind === 'dj' ? (ready ? 'balanced' : 'constant') : `s = ${bitstr(ready, L.n)}`;
    if (!correct && L.bot === 'gambler') return { ...r, botOut: true, botLog: [...r.botLog, `🎲 guesses "${what}"… and is WRONG. The Gambler is out.`] };
    return { ...r, botDone: { answer: ready, correct }, botLog: [...r.botLog, `🤖 submits: ${what}`] };
  }
  // otherwise query
  let x: number;
  if (L.kind === 'bv') x = 1 << (L.n - 1 - q.length);
  else {
    const left = Array.from({ length: N }, (_, i) => i).filter((i) => !q.includes(i));
    x = left[Math.floor(rng() * left.length)];
  }
  const fx = r.table[x];
  return { ...r, botQueried: [...q, x], botLog: [...r.botLog, `f(${bitstr(x, L.n)}) = ${L.kind === 'simon' ? bitstr(fx, L.n) : fx}`] };
}

export default function OracleHunter() {
  const g = useGame('oracle-hunter');
  const saved = (g.data.cleared as number[] | undefined) ?? [];
  const [cleared, setCleared] = useState<number[]>(saved);
  const [perfect, setPerfect] = useState<boolean[]>(() => (g.data.perfect as boolean[] | undefined) ?? []);
  const [li, setLi] = useState(() => Math.min(saved.length ? Math.max(...saved) + 1 : 0, LEVELS.length - 1));
  const [seed, setSeed] = useState(() => (Date.now() & 0xffff) + 1);
  const L = LEVELS[li];
  const [round, setRound] = useState<Round>(() => newRound(L, seed));
  const [rig, setRig] = useState<QueryRig>({ hBefore: false, ancilla: '0', hAfter: false });
  const [classX, setClassX] = useState(0);
  const [guess, setGuess] = useState(0);
  const [flash, setFlash] = useState<null | 'good' | 'bad'>(null);
  const [overlay, setOverlay] = useState<null | 'won' | 'lost' | 'final'>(null);
  const rng = useMemo(() => mulberry32(seed * 7 + 3), [seed]);
  const N = 1 << L.n;
  const nOut = L.kind === 'simon' ? L.n : 1;

  const startLevel = (k: number) => {
    const s = (Date.now() & 0xffff) + k * 101;
    setLi(k);
    setSeed(s);
    setRound(newRound(LEVELS[k], s));
    setRig({ hBefore: false, ancilla: '0', hAfter: false });
    setGuess(0);
    setClassX(0);
    setOverlay(null);
  };

  const bump = (kind: 'good' | 'bad') => {
    setFlash(kind);
    setTimeout(() => setFlash(null), 450);
  };

  const afterMyAction = (r: Round, botActions = 1): Round => {
    let next = r;
    for (let i = 0; i < botActions; i++) next = botStep(L, next, rng);
    if (next.botDone && next.botDone.correct && next.status === 'play') {
      next = { ...next, status: 'lost' };
      setTimeout(() => setOverlay('lost'), 500);
    }
    return next;
  };

  const quantumQuery = () => {
    if (round.status !== 'play') return;
    const st = runQueryRig((x) => round.table[x], L.n, nOut, rig);
    const p = registerMarginal(st, L.n);
    const y = sampleFrom(p);
    // was the rig informative? (correct configs for the level)
    const good = L.kind === 'simon' ? rig.hBefore && rig.hAfter && rig.ancilla !== 'minus' : rig.hBefore && rig.hAfter && rig.ancilla === 'minus';
    bump(good ? 'good' : 'bad');
    const r: Round = {
      ...round,
      myQueries: round.myQueries + 1,
      wasted: round.wasted + (good ? 0 : 1),
      results: [...round.results, { kind: 'q', text: `⚛ quantum query → measured ${bitstr(y, L.n)}`, y, good }],
      ys: L.kind === 'simon' && good ? [...round.ys, y] : round.ys,
    };
    setRound(afterMyAction(r));
  };

  const classicalQuery = () => {
    if (round.status !== 'play') return;
    const fx = round.table[classX];
    const r: Round = {
      ...round,
      myQueries: round.myQueries + 1,
      results: [...round.results, { kind: 'c', text: `classical query f(${bitstr(classX, L.n)}) = ${L.kind === 'simon' ? bitstr(fx, L.n) : fx}` }],
    };
    setRound(afterMyAction(r));
  };

  const submit = (answer: number) => {
    if (round.status !== 'play') return;
    if (answer === round.secret) {
      bump('good');
      const isPerfect = round.wasted === 0 && round.wrongSubmits === 0;
      const r: Round = { ...round, status: 'won' };
      setRound(r);
      const nextCleared = Array.from(new Set([...cleared, li])).sort((a, b) => a - b);
      const nextPerfect = perfect.slice();
      nextPerfect[li] = nextPerfect[li] || isPerfect;
      setCleared(nextCleared);
      setPerfect(nextPerfect);
      const all = nextCleared.length === LEVELS.length;
      g.finish(nextCleared.length, all, { cleared: nextCleared, perfect: nextPerfect });
      if (all && LEVELS.every((_, k) => nextPerfect[k])) g.unlock('oracle-whisperer');
      setTimeout(() => setOverlay(all && li === LEVELS.length - 1 ? 'final' : 'won'), 350);
    } else {
      bump('bad');
      const r: Round = {
        ...round,
        wrongSubmits: round.wrongSubmits + 1,
        results: [...round.results, { kind: 'c', text: `✗ wrong answer (${L.kind === 'dj' ? (answer ? 'balanced' : 'constant') : bitstr(answer, L.n)}): the bot gets 2 free moves` }],
      };
      setRound(afterMyAction(r, 2));
    }
  };

  const goodRig = L.kind === 'simon' ? rig.hBefore && rig.hAfter && rig.ancilla !== 'minus' : rig.hBefore && rig.hAfter && rig.ancilla === 'minus';
  const rank = gf2Rank(round.ys, L.n);
  const sols = L.kind === 'simon' ? gf2Solutions(round.ys, L.n).filter((s) => s !== 0) : [];

  // distribution of the player's current rig (shown after the level ends)
  const rigDist = useMemo(() => {
    if (round.status === 'play') return null;
    return registerMarginal(runQueryRig((x) => round.table[x], L.n, nOut, rig), L.n);
  }, [round.status, round.table, rig, L.n, nOut]);

  return (
    <div>
      <HowToPlay defaultOpen={g.plays === 0}>
        <p style={{ margin: '0 0 6px' }}>
          Each level hides a function inside an oracle. You race a <b>classical bot</b>: every time you make a query, the bot makes one too, and when the bot
          has enough information it submits. Identify the hidden property <b>before</b> the bot does.
        </p>
        <p style={{ margin: '0 0 6px' }}>
          Your quantum query goes through a <b>rig</b> you configure: Hadamards on the input register before and/or after the oracle, and how the
          ancilla (output register) is prepared. A wrong rig still costs a query, and the measured output will be misleading or useless. A wrong
          final answer gives the bot two free moves.
        </p>
        <p style={{ margin: 0 }}>Clear all {LEVELS.length} levels to beat the game. Clear every level without a single wasted query for a bonus achievement.</p>
      </HowToPlay>

      <div className="row" style={{ gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {LEVELS.map((lv, k) => {
          const unlocked = k === 0 || cleared.includes(k - 1) || cleared.includes(k);
          return (
            <button key={k} className={`btn small ${k === li ? 'active' : ''}`} disabled={!unlocked} onClick={() => startLevel(k)} title={lv.brief}>
              {cleared.includes(k) ? (perfect[k] ? '★' : '✓') : unlocked ? `${k + 1}` : '🔒'} {lv.name}
            </button>
          );
        })}
      </div>

      <div
        className={`panel ${flash === 'bad' ? 'shake' : ''}`}
        style={{
          padding: 14,
          borderColor: flash === 'good' ? 'var(--green)' : flash === 'bad' ? 'var(--red)' : undefined,
          transition: 'border-color .2s',
        }}
      >
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div>
            <b style={{ fontSize: '1.1rem' }}>
              Level {li + 1}: {L.name}
            </b>
            <span className="pill" style={{ marginLeft: 8 }}>
              {L.kind === 'dj' ? 'Deutsch–Jozsa' : L.kind === 'bv' ? 'Bernstein–Vazirani' : 'Simon'} · n = {L.n}
            </span>
          </div>
          <div className="row" style={{ gap: 14 }}>
            <span>
              you: <b style={{ color: 'var(--blue)' }}>{round.myQueries}</b> quer{round.myQueries === 1 ? 'y' : 'ies'}
            </span>
            <span>
              bot: <b style={{ color: 'var(--red)' }}>{round.botQueried.length}</b>
            </span>
          </div>
        </div>
        <div className="dim" style={{ fontSize: '0.9rem', margin: '6px 0 10px' }}>{L.brief}</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1.3fr) minmax(220px, 1fr)', gap: 16 }}>
          {/* -------- player side -------- */}
          <div>
            <RigDiagram rig={rig} n={L.n} nOut={nOut} />
            <div className="row" style={{ gap: 14, flexWrap: 'wrap', margin: '8px 0' }}>
              <Toggle label="H before query" value={rig.hBefore} onChange={(v) => setRig({ ...rig, hBefore: v })} />
              <Toggle label="H after query" value={rig.hAfter} onChange={(v) => setRig({ ...rig, hAfter: v })} />
            </div>
            <div className="row" style={{ gap: 8, marginBottom: 10 }}>
              <span className="dim" style={{ fontSize: '0.88rem' }}>ancilla{nOut > 1 ? ` register (${nOut} qubits)` : ''}:</span>
              <Segmented
                options={[
                  { value: '0', label: '|0⟩' },
                  { value: '1', label: '|1⟩' },
                  { value: 'minus', label: '|−⟩' },
                ]}
                value={rig.ancilla}
                onChange={(v) => setRig({ ...rig, ancilla: v })}
              />
            </div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button className="btn primary" disabled={round.status !== 'play'} onClick={quantumQuery}>
                ⚛ Quantum query
              </button>
              <span className="faint" style={{ fontSize: '0.8rem' }}>or classical:</span>
              <BitToggles n={L.n} value={classX} onChange={setClassX} disabled={round.status !== 'play'} color="var(--blue)" />
              <button className="btn small" disabled={round.status !== 'play'} onClick={classicalQuery}>
                ask f(x)
              </button>
            </div>

            <div className="panel" style={{ marginTop: 10, padding: 10, maxHeight: 170, overflowY: 'auto', background: 'var(--bg-2)' }}>
              {round.results.length === 0 && <span className="faint">Your results appear here.</span>}
              {round.results.map((r, k) => (
                <div key={k} className="mono" style={{ fontSize: '0.84rem', color: r.kind === 'q' ? 'var(--text)' : 'var(--text-dim)' }}>
                  {r.text}
                </div>
              ))}
            </div>

            {/* answer */}
            <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <b>Answer:</b>
              {L.kind === 'dj' ? (
                <>
                  <button className="btn" disabled={round.status !== 'play'} onClick={() => submit(0)}>
                    constant
                  </button>
                  <button className="btn" disabled={round.status !== 'play'} onClick={() => submit(1)}>
                    balanced
                  </button>
                </>
              ) : (
                <>
                  <span className="dim">s =</span>
                  <BitToggles n={L.n} value={guess} onChange={setGuess} disabled={round.status !== 'play'} />
                  <button className="btn gold" disabled={round.status !== 'play' || guess === 0} onClick={() => submit(guess)}>
                    submit
                  </button>
                </>
              )}
            </div>
            {L.kind === 'simon' && (
              <div className="faint" style={{ fontSize: '0.82rem', marginTop: 6 }}>
                Equations from good runs: {round.ys.length ? round.ys.map((y) => `${bitstr(y, L.n)}·s=0`).join(', ') : 'none yet'} · rank {rank}/{L.n - 1}
                {guess !== 0 && round.ys.length > 0 && <> · your s satisfies {round.ys.filter((y) => dot2(y, guess) === 0).length}/{round.ys.length}</>}
                {rank === L.n - 1 && <span style={{ color: 'var(--green)' }}> · enough equations: solve for s!</span>}
              </div>
            )}
          </div>

          {/* -------- bot side -------- */}
          <div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <b style={{ color: 'var(--red)' }}>{L.bot === 'gambler' ? '🎲 The Gambler' : '🤖 Classical bot'}</b>
              <span className="faint" style={{ fontSize: '0.8rem' }}>
                {L.bot === 'exact' ? 'deterministic, must be certain' : L.bot === 'gambler' ? 'randomized, 3 samples then guess' : L.bot === 'bv' ? 'queries unit vectors' : 'birthday collision search'}
              </span>
            </div>
            <div className="panel" style={{ marginTop: 6, padding: 10, height: 268, overflowY: 'auto', background: 'var(--bg-2)' }}>
              {round.botLog.length === 0 && <span className="faint">Waiting for your first move…</span>}
              {round.botLog.map((t, k) => (
                <div key={k} className="mono" style={{ fontSize: '0.82rem', color: t.startsWith('🤖') || t.startsWith('🎲') ? 'var(--red)' : 'var(--text-dim)' }}>
                  {t}
                </div>
              ))}
            </div>
            {L.kind === 'simon' && (
              <div className="faint" style={{ fontSize: '0.78rem', marginTop: 4 }}>
                Birthday odds: after q queries the bot has checked about q²/2 pairs out of {N * (N - 1) / 2}, with {N / 2} colliding pairs.
              </div>
            )}
          </div>
        </div>

        {round.status !== 'play' && (
          <div className="panel" style={{ marginTop: 12, padding: 12, borderColor: round.status === 'won' ? 'var(--green)' : 'var(--red)' }}>
            <b>{round.status === 'won' ? '✓ Level cleared' : '✗ The bot got there first'}</b>
            <span className="dim">
              {' '}
              ({L.kind === 'dj' ? `f was ${round.secret ? 'balanced' : 'constant'}` : `s = ${bitstr(round.secret, L.n)}`})
            </span>
            <div className="dim" style={{ fontSize: '0.9rem', marginTop: 6 }}>{L.lesson}</div>
            {rigDist && (
              <>
                <div className="faint" style={{ fontSize: '0.8rem', marginTop: 8 }}>
                  What your final rig really produces (the full output distribution of one query){goodRig ? '' : ': not the right rig'}:
                </div>
                <ProbBars bars={rigDist.map((p, y) => ({ value: p, label: bitstr(y, L.n), highlight: L.kind !== 'dj' && y === round.secret }))} height={120} labelEvery={L.n > 4 ? Math.max(1, N / 16) : 1} />
              </>
            )}
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <button className="btn small" onClick={() => startLevel(li)}>
                replay level ↻
              </button>
              {round.status === 'won' && li < LEVELS.length - 1 && (
                <button className="btn small primary" onClick={() => startLevel(li + 1)}>
                  next level →
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {overlay === 'won' && (
        <GameOverlay title={`Level ${li + 1} cleared!`} onClose={() => setOverlay(null)}>
          You used {round.myQueries} quer{round.myQueries === 1 ? 'y' : 'ies'}; the bot had made {round.botQueried.length}.
          {round.wasted === 0 && round.wrongSubmits === 0 ? ' Flawless: no wasted queries. ★' : ''}
        </GameOverlay>
      )}
      {overlay === 'lost' && (
        <GameOverlay title="The bot wins this round" tone="lose" onClose={() => setOverlay(null)}>
          {L.kind === 'simon' && L.n <= 5
            ? 'At small n the birthday attack is fast. That is the honest truth about this separation: it only becomes dramatic as n grows. Replay with a fresh function.'
            : 'Check your rig: which layers turn a phase oracle into a measurable answer? Replay with a fresh function.'}
        </GameOverlay>
      )}
      {overlay === 'final' && (
        <GameOverlay title="🏆 Oracle Hunter complete!" onClose={() => setOverlay(null)}>
          You beat every classical bot. Remember the fine print: Deutsch–Jozsa loses its edge against randomized algorithms (the Gambler), Bernstein–Vazirani's
          gap is linear, and Simon's exponential gap is what pointed Peter Shor toward factoring.
        </GameOverlay>
      )}
    </div>
  );
}

/** Small circuit sketch of the configured rig. */
function RigDiagram({ rig, n, nOut }: { rig: QueryRig; n: number; nOut: number }) {
  const W = 360, H = 104;
  const yIn = 32, yOut = 78;
  const box = (x: number, y: number, label: string, color: string, on: boolean) => (
    <g opacity={on ? 1 : 0.18}>
      <rect x={x - 15} y={y - 14} width={30} height={28} rx={6} fill="#141821" stroke={color} strokeWidth={2} />
      <text x={x} y={y + 5} fontSize={14} fill={color} textAnchor="middle" fontWeight={700}>
        {label}
      </text>
    </g>
  );
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: W, display: 'block' }}>
      <text x={4} y={yIn + 5} fontSize={12} fill="#9aa3b5" fontFamily="var(--mono)">x: {n}q</text>
      <text x={4} y={yOut + 5} fontSize={12} fill="#9aa3b5" fontFamily="var(--mono)">a: {nOut}q</text>
      <line x1={56} x2={W - 10} y1={yIn} y2={yIn} stroke="#4a5368" strokeWidth={3} />
      <line x1={56} x2={W - 10} y1={yOut} y2={yOut} stroke="#4a5368" strokeWidth={3} />
      {rig.ancilla !== '0' && box(80, yOut, 'X', '#e8655a', true)}
      {rig.ancilla === 'minus' && box(118, yOut, 'H', '#f4d35e', true)}
      {box(118, yIn, 'H', '#f4d35e', rig.hBefore)}
      <rect x={160} y={14} width={64} height={82} rx={8} fill="#1d2230" stroke="#e07ab6" strokeWidth={2} />
      <text x={192} y={58} fontSize={15} fill="#e07ab6" textAnchor="middle" fontWeight={700}>U_f</text>
      {box(260, yIn, 'H', '#f4d35e', rig.hAfter)}
      <rect x={300} y={yIn - 14} width={30} height={28} rx={6} fill="#1d2230" stroke="#bbb" />
      <path d={`M${304} ${yIn + 7} A 11 11 0 0 1 ${326} ${yIn + 7}`} fill="none" stroke="#ddd" strokeWidth={1.5} />
      <line x1={315} y1={yIn + 7} x2={322} y2={yIn - 7} stroke="#fcd34d" strokeWidth={1.6} />
    </svg>
  );
}
