import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGame, GameOverlay, HowToPlay } from '../../../components/game';
import { Stat, ProgressBar } from '../../../components/ui';
import { mulberry32 } from '../../../engine/qsim';
import { repetitionCode, shorCode, syndromeOf, synKey, buildLookup, outcome, pauliString, single, mulP, I0, type Pauli, type StabilizerCode } from '../engine/codes';

type T = 'X' | 'Y' | 'Z';
interface Level {
  name: string;
  code: () => StabilizerCode;
  types: T[];
  p: number;
  rounds: number;
  time: number;
  tip: string;
}
const LEVELS: Level[] = [
  { name: '1 · Bit-flip trio', code: () => repetitionCode(3, 'bit'), types: ['X'], p: 0.12, rounds: 8, time: 9, tip: 'Checks Z0Z1 and Z1Z2. The qubit shared by both lit checks is the culprit; a lone lit check points to the qubit at its outer end.' },
  { name: '2 · Phase-flip trio', code: () => repetitionCode(3, 'phase'), types: ['Z'], p: 0.14, rounds: 8, time: 7, tip: 'Same logic, but the checks are X0X1, X1X2 and the errors are Z (phase) flips.' },
  { name: '3 · Five in a row', code: () => repetitionCode(5, 'bit'), types: ['X'], p: 0.14, rounds: 8, time: 10, tip: 'Four parity checks. Lit checks mark the boundaries of flipped runs. Choose the smallest set of flips that explains them: up to two errors are correctable.' },
  { name: '4 · Shor’s nine', code: shorCode, types: ['X', 'Y', 'Z'], p: 0.05, rounds: 8, time: 12, tip: 'Z-pair checks find X errors inside a block; the two big X-checks find which block has a phase (Z) error. A Y lights both kinds. Any Z in the right block works (degeneracy).' },
];
const COL: Record<string, string> = { X: '#fc6255', Z: '#58c4dd', Y: '#b48ce0', I: '#4a5368' };
const GAME_ID = 'syndrome-sleuth';

function getP(p: Pauli, q: number): 'I' | T {
  const x = (p.x >> q) & 1, z = (p.z >> q) & 1;
  return x && z ? 'Y' : x ? 'X' : z ? 'Z' : 'I';
}

export default function SyndromeSleuth() {
  const g = useGame(GAME_ID);
  const [lvl, setLvl] = useState(0);
  const L = LEVELS[lvl];
  const code = useMemo(() => L.code(), [lvl]);
  const table = useMemo(() => buildLookup(code, L.types, 2), [code]);
  const rng = useRef(mulberry32(Date.now() & 0xffff));
  const [phase, setPhase] = useState<'intro' | 'play' | 'feedback' | 'levelEnd' | 'over'>('intro');
  const [round, setRound] = useState(0);
  const [err, setErr] = useState<Pauli>(I0);
  const [corr, setCorr] = useState<Pauli>(I0);
  const [left, setLeft] = useState(L.time);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean | null; text: string } | null>(null);
  const [flash, setFlash] = useState<'good' | 'bad' | null>(null);

  const newRound = () => {
    let e: Pauli = I0;
    for (let q = 0; q < code.n; q++)
      if (rng.current() < L.p) e = mulP(e, single(q, L.types[Math.floor(rng.current() * L.types.length)]));
    setErr(e);
    setCorr(I0);
    setLeft(L.time);
    setMsg(null);
    setPhase('play');
  };

  const startLevel = (k: number) => {
    setLvl(k);
    setRound(0);
    setPhase('intro');
  };

  useEffect(() => {
    if (phase !== 'play') return;
    const id = setInterval(() => setLeft((t) => t - 0.1), 100);
    return () => clearInterval(id);
  }, [phase]);
  useEffect(() => {
    if (phase === 'play' && left <= 0) submit(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, phase]);

  const syn = syndromeOf(code, err);
  const synNow = syndromeOf(code, mulP(err, corr));

  const toggle = (q: number) => {
    if (phase !== 'play') return;
    const cur = getP(corr, q);
    const cyc: ('I' | T)[] = ['I', ...L.types];
    const nxt = cyc[(cyc.indexOf(cur) + 1) % cyc.length];
    const m = 1 << q;
    let x = corr.x & ~m, z = corr.z & ~m;
    if (nxt === 'X' || nxt === 'Y') x |= m;
    if (nxt === 'Z' || nxt === 'Y') z |= m;
    setCorr({ x, z });
  };

  const submit = (timeout = false) => {
    if (phase !== 'play') return;
    const res = outcome(code, err, corr);
    const dec = table.get(synKey(syn));
    const decRes = dec ? outcome(code, err, dec) : 'logical';
    let ok: boolean | null;
    let text: string;
    if (!timeout && res === 'ok') {
      ok = true;
      const mult = 1 + streak * 0.25;
      const pts = Math.round((100 + left * 10) * mult);
      setScore((s) => s + pts);
      const ns = streak + 1;
      setStreak(ns);
      setBest((b) => Math.max(b, ns));
      if (ns >= 10) g.unlock('syndrome-streak');
      text = `✓ Correct! +${pts}${streak ? ` (combo ×${mult.toFixed(2)})` : ''}. The actual error was ${pauliString(err, code.n).replace(/I/g, '·')}.`;
    } else if (decRes !== 'ok' && !timeout && res !== 'detected') {
      ok = null;
      text = `Too many errors (${pauliString(err, code.n).replace(/I/g, '·')}): even the optimal decoder would have failed. The code was overwhelmed, a logical error no one could prevent. No penalty.`;
    } else {
      ok = false;
      setLives((l) => l - 1);
      setStreak(0);
      text = `${timeout ? '⏱ Time up!' : res === 'detected' ? '✗ Some checks are still lit: your correction doesn’t match the syndrome.' : '✗ Logical error! Your correction plus the error flipped the encoded qubit.'} The error was ${pauliString(err, code.n).replace(/I/g, '·')}; a minimal fix is ${dec ? pauliString(dec, code.n).replace(/I/g, '·') : '?'}.`;
    }
    setFlash(ok === false ? 'bad' : ok ? 'good' : null);
    setTimeout(() => setFlash(null), 400);
    setMsg({ ok, text });
    setPhase('feedback');
  };

  const next = () => {
    if (lives <= 0) {
      setPhase('over');
      g.finish(score, false, { maxLevel: lvl });
      return;
    }
    if (round + 1 >= L.rounds) {
      setPhase('levelEnd');
      const beaten = lvl === LEVELS.length - 1;
      g.finish(score, beaten, { maxLevel: lvl + 1 });
      return;
    }
    setRound((r) => r + 1);
    newRound();
  };

  // ----- drawing -----
  const blocks = code.n === 9 ? 3 : 1;
  const W = 640, qy = 150, qx = (q: number) => 60 + q * ((W - 120) / Math.max(1, code.n - 1)) + (blocks === 3 ? (Math.floor(q / 3) - 1) * 14 : 0);
  const checkSpan = (s: Pauli) => {
    const qs = Array.from({ length: code.n }, (_, q) => q).filter((q) => getP(s, q) !== 'I');
    return [Math.min(...qs), Math.max(...qs)];
  };
  const reveal = phase === 'feedback' || phase === 'levelEnd' || phase === 'over';

  return (
    <div>
      <HowToPlay defaultOpen={g.plays === 0}>
        Errors strike invisibly. All you see is the <b>syndrome</b>: which parity checks light up (−1). Click qubits to place corrections (click again to cycle X → Z → Y where
        allowed), then press <b>Correct!</b> before the timer runs out. A correction counts if it restores the logical state, up to harmless stabilizers. Streaks multiply
        your score. Sometimes too many errors strike and no decoder could win; those rounds don't cost a life. Clear all four levels with lives to spare.
      </HowToPlay>
      <div className="row" style={{ gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
        <Stat label="level" value={`${lvl + 1}/4`} />
        <Stat label="round" value={`${Math.min(round + 1, L.rounds)}/${L.rounds}`} />
        <Stat label="score" value={score} color="var(--yellow)" />
        <Stat label="combo" value={streak ? `×${(1 + streak * 0.25).toFixed(2)}` : '—'} color="var(--pink)" />
        <Stat label="lives" value={'♥'.repeat(Math.max(0, lives)) || '—'} color="var(--red)" />
      </div>
      <div className="panel" style={{ position: 'relative', padding: 12, borderColor: flash === 'good' ? 'var(--green)' : flash === 'bad' ? 'var(--red)' : 'var(--border)', transition: 'border-color .2s' }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <b>{L.name}</b>
          <span className="faint" style={{ fontSize: '0.85rem' }}>physical error rate p = {(L.p * 100).toFixed(0)}% per qubit</span>
        </div>
        {phase === 'play' && <ProgressBar value={left / L.time} color={left < 3 ? 'var(--red)' : 'var(--blue)'} style={{ marginTop: 6 }} />}
        <svg viewBox={`0 0 ${W} 200`} style={{ width: '100%', display: 'block', marginTop: 4 }}>
          {code.stabilizers.map((s, i) => {
            const [a, b] = checkSpan(s);
            const lit = phase !== 'intro' && (reveal ? syn[i] : synNow[i]);
            const isX = getP(s, a) === 'X';
            const level = code.n === 9 ? (isX ? 1 + (i % 2) : 0) : i % 2;
            const y = qy - 40 - level * 30;
            const col = isX ? '#58c4dd' : '#f0ac5f';
            return (
              <g key={i}>
                <path d={`M${qx(a)} ${qy - 16} L${qx(a)} ${y} L${qx(b)} ${y} L${qx(b)} ${qy - 16}`} fill="none" stroke={col} strokeWidth={lit ? 4 : 1.6} opacity={lit ? 1 : 0.35} style={{ filter: lit ? `drop-shadow(0 0 6px ${col})` : undefined }} />
                <rect x={(qx(a) + qx(b)) / 2 - 30} y={y - 10} width={60} height={20} rx={10} fill={lit ? col : '#141821'} stroke={col} />
                <text x={(qx(a) + qx(b)) / 2} y={y + 4} fontSize={10.5} textAnchor="middle" fill={lit ? '#111' : col} fontWeight={700}>
                  {code.labels[i]} {lit ? '−1' : '+1'}
                </text>
              </g>
            );
          })}
          {Array.from({ length: code.n }, (_, q) => {
            const c = getP(corr, q);
            const e = getP(err, q);
            return (
              <g key={q} onClick={() => toggle(q)} style={{ cursor: phase === 'play' ? 'pointer' : 'default' }}>
                <circle cx={qx(q)} cy={qy} r={18} fill={c !== 'I' ? `${COL[c]}44` : '#1d2230'} stroke={c !== 'I' ? COL[c] : '#9aa3b5'} strokeWidth={c !== 'I' ? 3 : 1.5} />
                <text x={qx(q)} y={qy + 5} textAnchor="middle" fontSize={14} fontWeight={700} fill={c !== 'I' ? COL[c] : '#9aa3b5'} fontFamily="var(--serif)">
                  {c !== 'I' ? c : q}
                </text>
                {reveal && e !== 'I' && (
                  <text x={qx(q)} y={qy + 38} textAnchor="middle" fontSize={12} fontWeight={700} fill={COL[e]}>
                    ⚡{e}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
          {phase === 'intro' && (
            <>
              <div className="faint" style={{ maxWidth: 520, fontSize: '0.88rem' }}>💡 {L.tip}</div>
              <button className="btn primary" onClick={newRound}>▶ Start level {lvl + 1}</button>
            </>
          )}
          {phase === 'play' && (
            <>
              <button className="btn ghost" onClick={() => setCorr(I0)}>clear</button>
              <button className="btn primary" onClick={() => submit()}>✔ Correct!</button>
            </>
          )}
          {phase === 'feedback' && (
            <button className="btn primary" onClick={next}>
              {lives <= 0 ? 'Game over…' : 'Next round →'}
            </button>
          )}
        </div>
        {msg && (
          <div className="pop" style={{ marginTop: 8, textAlign: 'center', color: msg.ok ? 'var(--green)' : msg.ok === false ? 'var(--red)' : 'var(--gold)' }}>
            {msg.text}
          </div>
        )}
        {phase === 'levelEnd' && (
          <GameOverlay title={lvl === LEVELS.length - 1 ? '🕵 Case closed!' : `Level ${lvl + 1} cleared`} tone="win">
            <p>Score so far: {score} · best combo {best}</p>
            <p style={{ textAlign: 'left' }}>
              {lvl === 0 && 'You just ran a lookup-table decoder in your head: syndrome → most likely error.'}
              {lvl === 1 && 'Same table, different basis: phase flips are bit flips seen through Hadamards.'}
              {lvl === 2 && 'Longer codes tolerate more errors: a distance-5 repetition code fixes any two flips. Lit checks mark the edges of runs of flips, just like defects in the surface code.'}
              {lvl === 3 && 'You decoded Shor’s code, which handles any single-qubit error. Notice that for Z errors you only had to find the right block, not the qubit: degeneracy.'}
            </p>
            <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
              {lvl < LEVELS.length - 1 ? (
                <button className="btn primary" onClick={() => startLevel(lvl + 1)}>Next level →</button>
              ) : (
                <button className="btn primary" onClick={() => { setScore(0); setLives(3); setStreak(0); startLevel(0); }}>Play again</button>
              )}
            </div>
          </GameOverlay>
        )}
        {phase === 'over' && (
          <GameOverlay title="Out of lives" tone="lose">
            <p>Final score {score}. Best combo {best}.</p>
            <button className="btn primary" onClick={() => { setScore(0); setLives(3); setStreak(0); startLevel(0); }}>Try again</button>
          </GameOverlay>
        )}
      </div>
    </div>
  );
}
