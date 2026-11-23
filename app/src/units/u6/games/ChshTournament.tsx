import React, { useEffect, useRef, useState } from 'react';
import { useGame, GameOverlay, HowToPlay } from '../../../components/game';
import { Slider } from '../../../components/ui';
import { sfx } from '../../../state/sfx';
import { AngleDial, WinMeter, RunningChart, deg } from '../widgets/parts';
import { chshWins, quantumWinRate, QuantumStrategy, pAgree, TSIRELSON_WIN } from '../lib/bell';

type Ans = 0 | 1 | 'r'; // fixed answer or random coin
interface Round {
  x: 0 | 1;
  y: 0 | 1;
  a: 0 | 1;
  b: 0 | 1;
  win: boolean;
}
type Stage = 'classical' | 'quantum';

const ROUNDS_TO_UNLOCK = 100;
const TARGET_ROUNDS = 200;
const TARGET_RATE = 0.8;

function coin(): 0 | 1 {
  return Math.random() < 0.5 ? 0 : 1;
}

/** Animated referee scene: question cards fly out, answers pop up, verdict flashes. */
function Arena({ round, stage, phase }: { round: Round | null; stage: Stage; phase: number }) {
  const W = 760, H = 210;
  const ax = 140, bx = W - 140, py = 150, ry = 38;
  const qx = (side: 'A' | 'B') => (phase >= 1 ? (side === 'A' ? ax : bx) : W / 2);
  const qy = phase >= 1 ? py - 58 : ry + 6;
  const col = round ? (round.win ? '#83c167' : '#fc6255') : '#3a4256';
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block', background: 'radial-gradient(ellipse at 50% 0%, rgba(224,122,182,0.08), transparent 60%)', borderRadius: 12 }}>
      {/* wall */}
      <rect x={W / 2 - 4} y={80} width={8} height={H - 90} rx={3} fill="#2a3142" />
      <text x={W / 2} y={H - 4} fontSize={10} fill="#6b7385" textAnchor="middle">no communication</text>
      {/* referee */}
      <circle cx={W / 2} cy={ry} r={22} fill="#1d2230" stroke="#9aa3b5" strokeWidth={2} />
      <text x={W / 2} y={ry + 7} fontSize={20} textAnchor="middle">🧑‍⚖️</text>
      {/* players */}
      {[
        { x: ax, name: 'Alice', c: '#58c4dd', emoji: '👩‍🔬' },
        { x: bx, name: 'Bob', c: '#fcd34d', emoji: '👨‍🔬' },
      ].map((p) => (
        <g key={p.name}>
          <circle cx={p.x} cy={py} r={30} fill="#141821" stroke={p.c} strokeWidth={2.5} style={{ filter: phase >= 3 && round ? `drop-shadow(0 0 8px ${col})` : 'none' }} />
          <text x={p.x} y={py + 9} fontSize={26} textAnchor="middle">{p.emoji}</text>
          <text x={p.x} y={py + 48} fontSize={12} fill={p.c} textAnchor="middle">{p.name}</text>
        </g>
      ))}
      {stage === 'quantum' && (
        <g>
          <path d={`M ${ax + 32} ${py} Q ${W / 2} ${py + 40} ${bx - 32} ${py}`} fill="none" stroke="#e07ab6" strokeWidth={2} strokeDasharray="5 5" opacity={0.7}>
            <animate attributeName="stroke-dashoffset" from="0" to="-20" dur="1s" repeatCount="indefinite" />
          </path>
          <text x={W / 2 + 26} y={py + 30} fontSize={10} fill="#e07ab6">shared |Φ⁺⟩</text>
        </g>
      )}
      {round && (
        <>
          {/* question cards */}
          {(['A', 'B'] as const).map((s) => (
            <g key={s} style={{ transition: 'transform .35s cubic-bezier(.2,.8,.2,1)', transform: `translate(${qx(s)}px, ${qy}px)` }}>
              <rect x={-17} y={-15} width={34} height={30} rx={6} fill="#f4f1e8" stroke="#bbb" />
              <text x={0} y={6} fontSize={15} fontWeight={700} textAnchor="middle" fill="#111" fontFamily="var(--mono)">
                {s === 'A' ? `x=${round.x}` : `y=${round.y}`}
              </text>
            </g>
          ))}
          {/* answers */}
          {phase >= 2 &&
            (['A', 'B'] as const).map((s) => (
              <g key={s} className="pop" transform={`translate(${s === 'A' ? ax + 62 : bx - 62}, ${py})`}>
                <circle r={16} fill={s === 'A' ? '#58c4dd' : '#fcd34d'} />
                <text y={6} fontSize={16} fontWeight={700} textAnchor="middle" fill="#111" fontFamily="var(--mono)">
                  {s === 'A' ? round.a : round.b}
                </text>
              </g>
            ))}
          {phase >= 3 && (
            <g className="pop">
              <rect x={W / 2 - 120} y={ry + 32} width={240} height={30} rx={8} fill={`${col}22`} stroke={col} />
              <text x={W / 2} y={ry + 52} fontSize={13} fill={col} textAnchor="middle" fontFamily="var(--mono)" fontWeight={700}>
                a⊕b = {round.a ^ round.b}, x∧y = {round.x & round.y} → {round.win ? 'WIN' : 'LOSE'}
              </text>
            </g>
          )}
        </>
      )}
    </svg>
  );
}

export default function ChshTournament() {
  const g = useGame('chsh-tournament');
  const [stage, setStage] = useState<Stage>('classical');
  const [unlocked, setUnlocked] = useState<boolean>(!!g.data.quantumUnlocked);
  // classical rulebooks
  const [ra, setRa] = useState<[Ans, Ans]>([0, 0]);
  const [rb, setRb] = useState<[Ans, Ans]>([0, 0]);
  // quantum angles + noise
  const [al, setAl] = useState<[number, number]>([0, 0]);
  const [be, setBe] = useState<[number, number]>([0, 0]);
  const [vis, setVis] = useState(1);
  // session stats (reset whenever the strategy changes)
  const [hist, setHist] = useState<number[]>([]);
  const [wins, setWins] = useState(0);
  const [classicalTotal, setClassicalTotal] = useState(0);
  const [round, setRound] = useState<Round | null>(null);
  const [phase, setPhase] = useState(0);
  const [busy, setBusy] = useState(false);
  const [overlay, setOverlay] = useState<null | 'unlock' | 'win'>(null);
  const [best, setBest] = useState<number>(typeof g.data.bestQuantum === 'number' ? (g.data.bestQuantum as number) : 0);
  const timers = useRef<number[]>([]);
  const stopFlag = useRef(false);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const n = hist.length;
  const rate = n ? wins / n : null;

  const sessionRecorded = useRef(false);
  const sessionBeaten = useRef(false);
  const winShown = useRef(false);

  const resetSession = () => {
    sessionRecorded.current = false;
    sessionBeaten.current = false;
    setHist([]);
    setWins(0);
    setRound(null);
    setPhase(0);
  };

  const strat: QuantumStrategy = { alpha: al, beta: be, visibility: vis };
  const exactQ = quantumWinRate(strat);

  const playOne = (): Round => {
    const x = coin(), y = coin();
    let a: 0 | 1, b: 0 | 1;
    if (stage === 'classical') {
      const pa = ra[x], pb = rb[y];
      a = pa === 'r' ? coin() : pa;
      b = pb === 'r' ? coin() : pb;
    } else {
      a = coin();
      b = Math.random() < pAgree(al[x], be[y], vis) ? a : ((1 - a) as 0 | 1);
    }
    return { x, y, a, b, win: chshWins(x, y, a, b) };
  };

  const commit = (rs: Round[]) => {
    let w = wins;
    const h = [...hist];
    for (const r of rs) {
      if (r.win) w++;
      h.push(w / (h.length + 1));
    }
    setWins(w);
    setHist(h);
    if (stage === 'classical') {
      const tot = classicalTotal + rs.length;
      setClassicalTotal(tot);
      if (!unlocked && tot >= ROUNDS_TO_UNLOCK) {
        setUnlocked(true);
        g.save({ ...g.data, quantumUnlocked: true });
        setOverlay('unlock');
        sfx.levelUp();
      }
    } else if (h.length >= TARGET_ROUNDS) {
      const r = w / h.length;
      const beaten = r > TARGET_RATE;
      const newBest = Math.max(best, r);
      if (r > best) setBest(r);
      if (!sessionRecorded.current || (beaten && !sessionBeaten.current)) {
        g.finish(Math.round(r * 1000) / 10, beaten, { ...g.data, quantumUnlocked: true, bestQuantum: newBest });
        sessionRecorded.current = true;
        if (beaten) {
          sessionBeaten.current = true;
          g.unlock('spooky-action');
          if (!winShown.current) {
            winShown.current = true;
            setOverlay('win');
            sfx.achievement();
          }
        }
      }
    }
  };

  const playAnimated = (count: number) => {
    if (busy) return;
    setBusy(true);
    stopFlag.current = false;
    let left = count;
    // rounds are committed through the pending queue (see flush) so stats always use fresh state
    const step = () => {
      if (left <= 0 || stopFlag.current) {
        setBusy(false);
        return;
      }
      left--;
      const r = playOne();
      setRound(r);
      setPhase(0);
      const dt = count > 1 ? 90 : 260;
      timers.current.push(window.setTimeout(() => setPhase(1), 20));
      timers.current.push(window.setTimeout(() => setPhase(2), dt * 1.4));
      timers.current.push(
        window.setTimeout(() => {
          setPhase(3);
          if (count === 1) (r.win ? sfx.correct : sfx.wrong)();
          pending.current.push(r);
          flush();
        }, dt * 2.4),
      );
      timers.current.push(window.setTimeout(step, dt * 3.2));
    };
    step();
  };

  // Pending rounds are flushed through an effect so commit() always sees fresh state.
  const pending = useRef<Round[]>([]);
  const [flushTick, setFlushTick] = useState(0);
  const flush = () => setFlushTick((t) => t + 1);
  useEffect(() => {
    if (!pending.current.length) return;
    const rs = pending.current;
    pending.current = [];
    commit(rs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flushTick]);

  const playFast = (count: number) => {
    if (busy) return;
    const rs = Array.from({ length: count }, playOne);
    setRound(rs[rs.length - 1]);
    setPhase(3);
    commit(rs);
  };

  const ansBtn = (v: Ans, set: (v: Ans) => void, color: string) => (
    <div className="row" style={{ gap: 3 }}>
      {([0, 1, 'r'] as Ans[]).map((o) => (
        <button
          key={String(o)}
          className="btn small mono"
          onClick={() => { set(o); resetSession(); }}
          style={{ minWidth: 34, borderColor: v === o ? color : 'var(--border)', background: v === o ? `${color}33` : 'transparent', color: v === o ? color : 'var(--text-dim)' }}
          disabled={busy}
        >
          {o === 'r' ? '🎲' : o}
        </button>
      ))}
    </div>
  );

  const switchStage = (s: Stage) => {
    if (busy) return;
    setStage(s);
    resetSession();
  };

  return (
    <div>
      <HowToPlay defaultOpen={g.plays === 0}>
        <p>
          Each round the referee hands Alice a random bit <b>x</b> and Bob a random bit <b>y</b>. They each answer a bit (<b>a</b>, <b>b</b>) without talking.
          They <b>win if a ⊕ b = x ∧ y</b>: answers must differ when both questions are 1, and agree otherwise.
        </p>
        <p>
          <b>League 1, classical:</b> write any rulebook you like (fixed answers or coin flips) and play at least {ROUNDS_TO_UNLOCK} rounds. Can you get past the yellow 75% line?
          <br />
          <b>League 2, quantum:</b> Alice and Bob share a Bell pair and answer by measuring at angles you choose. Beat <b>80% over at least {TARGET_ROUNDS} rounds</b> (with one fixed strategy) to win the tournament and the <i>Spooky Action</i> badge.
        </p>
      </HowToPlay>

      <div className="row" style={{ gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <button className={`btn ${stage === 'classical' ? 'active' : ''}`} onClick={() => switchStage('classical')}>
          🎩 League 1: classical
        </button>
        <button className={`btn ${stage === 'quantum' ? 'active' : ''}`} onClick={() => unlocked && switchStage('quantum')} disabled={!unlocked} title={unlocked ? '' : `Play ${ROUNDS_TO_UNLOCK} classical rounds first`}>
          {unlocked ? '⚛' : '🔒'} League 2: Bell pairs
        </button>
        <span className="faint" style={{ marginLeft: 'auto', fontSize: '0.85rem' }}>
          best quantum score: <b className="mono" style={{ color: best > TARGET_RATE ? 'var(--pink)' : 'var(--text)' }}>{best ? `${(best * 100).toFixed(1)}%` : '—'}</b>
        </span>
      </div>

      <div className="panel" style={{ padding: 12 }}>
        <Arena round={round} stage={stage} phase={phase} />

        {stage === 'classical' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginTop: 8 }}>
            <div className="panel" style={{ padding: 10 }}>
              <div style={{ color: 'var(--blue)', fontWeight: 600, marginBottom: 6 }}>Alice's rulebook</div>
              <div className="row" style={{ gap: 8 }}>x=0 → {ansBtn(ra[0], (v) => setRa([v, ra[1]]), '#58c4dd')}</div>
              <div className="row" style={{ gap: 8, marginTop: 4 }}>x=1 → {ansBtn(ra[1], (v) => setRa([ra[0], v]), '#58c4dd')}</div>
            </div>
            <div className="panel" style={{ padding: 10 }}>
              <div style={{ color: 'var(--yellow)', fontWeight: 600, marginBottom: 6 }}>Bob's rulebook</div>
              <div className="row" style={{ gap: 8 }}>y=0 → {ansBtn(rb[0], (v) => setRb([v, rb[1]]), '#fcd34d')}</div>
              <div className="row" style={{ gap: 8, marginTop: 4 }}>y=1 → {ansBtn(rb[1], (v) => setRb([rb[0], v]), '#fcd34d')}</div>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 8 }}>
            <div className="row" style={{ justifyContent: 'space-around', flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: 'var(--blue)', fontWeight: 600, fontSize: '0.85rem' }}>Alice measures at…</div>
                <div className="row" style={{ gap: 4 }}>
                  <AngleDial value={al[0]} onChange={(v) => { setAl([v, al[1]]); resetSession(); }} color="#58c4dd" label="x=0" size={96} disabled={busy} />
                  <AngleDial value={al[1]} onChange={(v) => { setAl([al[0], v]); resetSession(); }} color="#29abca" label="x=1" size={96} disabled={busy} />
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: 'var(--yellow)', fontWeight: 600, fontSize: '0.85rem' }}>Bob measures at…</div>
                <div className="row" style={{ gap: 4 }}>
                  <AngleDial value={be[0]} onChange={(v) => { setBe([v, be[1]]); resetSession(); }} color="#fcd34d" label="y=0" size={96} disabled={busy} />
                  <AngleDial value={be[1]} onChange={(v) => { setBe([be[0], v]); resetSession(); }} color="#f0ac5f" label="y=1" size={96} disabled={busy} />
                </div>
              </div>
            </div>
            <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 260 }}>
                <Slider label="pair quality V" value={vis} min={0.5} max={1} step={0.01} onChange={(v) => { setVis(v); resetSession(); }} format={(v) => `${(v * 100).toFixed(0)}%`} disabled={busy} />
              </div>
              <span className="faint" style={{ fontSize: '0.8rem' }}>
                theory for these settings: <b className="mono">{(exactQ * 100).toFixed(1)}%</b> · angle gaps {deg(Math.abs(al[0] - be[0]))}°, {deg(Math.abs(al[0] - be[1]))}°, {deg(Math.abs(al[1] - be[0]))}°, {deg(Math.abs(al[1] - be[1]))}°
              </span>
            </div>
          </div>
        )}

        <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button className="btn primary" onClick={() => playAnimated(1)} disabled={busy}>▶ 1 round</button>
          <button className="btn" onClick={() => playAnimated(20)} disabled={busy}>▶▶ 20 rounds</button>
          <button className="btn" onClick={() => playFast(200)} disabled={busy}>⚡ 200 rounds</button>
          {busy && <button className="btn ghost" onClick={() => (stopFlag.current = true)}>■ stop</button>}
          <button className="btn ghost" onClick={resetSession} disabled={busy}>reset session</button>
          <span className="mono faint" style={{ marginLeft: 'auto', fontSize: '0.85rem' }}>
            this session: {wins}/{n} won{stage === 'classical' && !unlocked ? ` · ${Math.max(0, ROUNDS_TO_UNLOCK - classicalTotal)} classical rounds to unlock Bell pairs` : ''}
          </span>
        </div>
        <WinMeter rate={rate} label="session win rate" />
        {n > 0 && <RunningChart series={[{ points: hist, color: stage === 'quantum' ? '#e07ab6' : '#58c4dd' }]} height={140} minX={TARGET_ROUNDS} />}
        {stage === 'quantum' && n > 0 && n < TARGET_ROUNDS && (
          <div className="faint" style={{ fontSize: '0.8rem' }}>Keep going: scores count once a session reaches {TARGET_ROUNDS} rounds.</div>
        )}
      </div>

      <div className="panel" style={{ marginTop: 12, padding: 12, fontSize: '0.92rem' }}>
        <b>What's going on?</b>{' '}
        {stage === 'classical' ? (
          <span className="dim">
            Any fixed rulebook wins at most 3 of the 4 question pairs: the four win conditions XOR to 0 = 1. Coin flips just average over fixed rulebooks, so they can't help.
            Over many rounds every classical strategy settles at or below 75%. Small runs can poke above it by luck, so watch the chart settle.
          </span>
        ) : (
          <span className="dim">
            With a shared |Φ⁺⟩ the answers agree with probability cos²(θ_A − θ_B). Put the three "must agree" pairs 22.5° apart and the "must differ" pair 67.5° apart
            (e.g. Alice 0°, 45°; Bob 22.5°, −22.5°) and every question is won with probability cos²(π/8) ≈ {(TSIRELSON_WIN * 100).toFixed(1)}%, the most quantum mechanics allows.
            Lower the pair quality: below V ≈ 71% the advantage disappears.
          </span>
        )}
      </div>

      {overlay === 'unlock' && (
        <GameOverlay title="🔓 Bell pairs unlocked!" tone="info" onClose={() => { setOverlay(null); switchStage('quantum'); }}>
          You've played {ROUNDS_TO_UNLOCK} classical rounds and hit the 75% wall. Now Alice and Bob may share entangled qubits before each round. Choose measurement angles and see if
          you can break through.
        </GameOverlay>
      )}
      {overlay === 'win' && (
        <GameOverlay title="👻 Spooky Action!" tone="win" onClose={() => setOverlay(null)}>
          {(best * 100).toFixed(1)}% over {n} rounds. No classical strategy can sustain that. You won the CHSH tournament with correlations no local hidden-variable
          model can produce, and without sending a single message.
        </GameOverlay>
      )}
    </div>
  );
}
