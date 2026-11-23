import React, { useState } from 'react';
import { useGame, GameOverlay, HowToPlay } from '../../../components/game';
import { phaseColor } from '../../../engine/complex';
import { sfx } from '../../../state/sfx';
import { WinMeter } from '../widgets/parts';
import {
  GHZ_QUESTIONS, ghzWins, GhzClassical, ghzClassicalWins, GhzQuantum, ghzQuantumProbs, ghzQuantumWinProbs, sampleIndex,
} from '../lib/bell';

type Mode = 'classical' | 'quantum';
const PLAYERS = [
  { name: 'Alice', color: '#58c4dd', emoji: '👩‍🔬' },
  { name: 'Bob', color: '#fcd34d', emoji: '👨‍🔬' },
  { name: 'Charlie', color: '#83c167', emoji: '🧑‍🔬' },
];
const STREAK_GOAL = 64;
const AXIS_NAME: Record<number, string> = { 0: 'X', 2: 'Y', 4: '−X', 6: '−Y' };

interface Round {
  q: number[];
  ans: number[];
  win: boolean;
}

/** Pick a measurement axis on the Bloch-sphere equator (multiples of 45°). Colour = phase. */
function EquatorPicker({ k, onChange, size = 92 }: { k: number; onChange: (k: number) => void; size?: number }) {
  const R = size / 2 - 12;
  const phi = (k * Math.PI) / 4;
  const col = phaseColor(phi);
  return (
    <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}>
      <circle r={R} fill="rgba(88,196,221,0.05)" stroke="#3a4256" />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        const x = R * Math.cos(a), y = -R * Math.sin(a);
        return (
          <g key={i} style={{ cursor: 'pointer' }} onClick={() => onChange(i)}>
            <circle cx={x} cy={y} r={9} fill="transparent" />
            <circle cx={x} cy={y} r={i === k ? 6 : 3.5} fill={phaseColor(a)} opacity={i === k ? 1 : 0.6} />
            {AXIS_NAME[i] && (
              <text x={x * 1.32} y={y * 1.32 + 3} fontSize={8.5} fill="#9aa3b5" textAnchor="middle">
                {AXIS_NAME[i]}
              </text>
            )}
          </g>
        );
      })}
      <line x1={0} y1={0} x2={R * Math.cos(phi)} y2={-R * Math.sin(phi)} stroke={col} strokeWidth={3} strokeLinecap="round" />
      <circle r={2.5} fill="#9aa3b5" />
    </svg>
  );
}

export default function GhzGame() {
  const g = useGame('ghz-game');
  const [mode, setMode] = useState<Mode>('classical');
  const [table, setTable] = useState<GhzClassical>([
    [0, 0],
    [0, 0],
    [0, 0],
  ]);
  // measurement axes as multiples of π/4: [player][input]
  const [axes, setAxes] = useState<number[][]>([
    [0, 0],
    [0, 0],
    [0, 0],
  ]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState<number>(typeof g.data.bestStreak === 'number' ? (g.data.bestStreak as number) : 0);
  const [won, setWon] = useState(false);
  const [classicalPlayed, setClassicalPlayed] = useState(false);

  const strat: GhzQuantum = axes.map((p) => p.map((k) => (k * Math.PI) / 4)) as GhzQuantum;
  const qProbs = ghzQuantumWinProbs(strat);
  const cWins = ghzClassicalWins(table);
  const exact = mode === 'classical' ? cWins.filter(Boolean).length / 4 : qProbs.reduce((a, b) => a + b, 0) / 4;

  const reset = () => {
    setRounds([]);
    setStreak(0);
  };

  const play = (n: number) => {
    const out: Round[] = [];
    let s = streak;
    let bs = bestStreak;
    for (let i = 0; i < n; i++) {
      const q = GHZ_QUESTIONS[Math.floor(Math.random() * 4)];
      let ans: number[];
      if (mode === 'classical') ans = [table[0][q[0]], table[1][q[1]], table[2][q[2]]];
      else {
        const o = sampleIndex(ghzQuantumProbs(strat, q), Math.random);
        ans = [(o >> 2) & 1, (o >> 1) & 1, o & 1];
      }
      const win = ghzWins(q, ans);
      out.push({ q, ans, win });
      s = win ? s + 1 : 0;
      if (mode === 'quantum') bs = Math.max(bs, s);
    }
    const last = out[out.length - 1];
    if (n === 1) (last.win ? sfx.correct : sfx.wrong)();
    setRounds((r) => [...out.reverse(), ...r].slice(0, 400));
    setStreak(s);
    if (mode === 'classical') setClassicalPlayed(true);
    if (mode === 'quantum' && bs > bestStreak) {
      setBestStreak(bs);
      if (bs >= STREAK_GOAL && bestStreak < STREAK_GOAL) {
        g.finish(bs, true, { ...g.data, bestStreak: bs });
        g.unlock('ghz-perfect');
        setWon(true);
        sfx.achievement();
      } else if (bs < STREAK_GOAL) g.save({ ...g.data, bestStreak: bs });
    }
  };

  const recent = rounds.slice(0, 60);
  const winRate = rounds.length ? rounds.filter((r) => r.win).length / rounds.length : null;
  const last = rounds[0];

  return (
    <div>
      <HowToPlay defaultOpen={g.plays === 0}>
        <p>
          Three players in three sealed rooms. The referee hands each a bit <b>x, y, z</b>, always with an <b>even number of 1s</b> (questions 000, 011, 101, 110, equally likely). Each
          answers a bit <b>a, b, c</b>. They win if <b>a ⊕ b ⊕ c = x ∨ y ∨ z</b>: an even parity of answers for question 000, an odd parity for the others.
        </p>
        <p>
          <b>Classical:</b> fill in a rulebook. You'll find you can always satisfy 3 of the 4 questions, never all 4. <b>Quantum:</b> the players share the GHZ state
          (|000⟩ + |111⟩)/√2 and each measures along an axis on the equator of their Bloch sphere, one axis for input 0 and one for input 1. Find axes that win <b>every</b> round,
          then reach a streak of {STREAK_GOAL} wins.
        </p>
      </HowToPlay>

      <div className="row" style={{ gap: 8, marginBottom: 10 }}>
        <button className={`btn ${mode === 'classical' ? 'active' : ''}`} onClick={() => { setMode('classical'); reset(); }}>🎩 classical rulebook</button>
        <button className={`btn ${mode === 'quantum' ? 'active' : ''}`} onClick={() => { setMode('quantum'); reset(); }}>⚛ shared GHZ state</button>
        <span className="faint" style={{ marginLeft: 'auto', fontSize: '0.85rem' }}>
          best quantum streak: <b className="mono" style={{ color: bestStreak >= STREAK_GOAL ? 'var(--green)' : 'var(--text)' }}>{bestStreak}</b> / {STREAK_GOAL}
        </span>
      </div>

      <div className="panel" style={{ padding: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {PLAYERS.map((p, k) => (
            <div key={p.name} className="panel" style={{ padding: 10, textAlign: 'center', borderColor: `${p.color}66` }}>
              <div style={{ fontSize: '1.6rem' }}>{p.emoji}</div>
              <div style={{ color: p.color, fontWeight: 600 }}>{p.name}</div>
              {last && (
                <div key={rounds.length} className="pop mono" style={{ fontSize: '0.85rem', margin: '4px 0' }}>
                  got {last.q[k]} → answered <b style={{ color: p.color }}>{last.ans[k]}</b>
                </div>
              )}
              {mode === 'classical' ? (
                <div className="col" style={{ gap: 4, alignItems: 'center', marginTop: 6 }}>
                  {[0, 1].map((inp) => (
                    <div key={inp} className="row" style={{ gap: 6 }}>
                      <span className="mono faint" style={{ fontSize: '0.8rem' }}>if {inp} →</span>
                      {[0, 1].map((v) => (
                        <button
                          key={v}
                          className="btn small mono"
                          style={{ minWidth: 32, borderColor: table[k][inp] === v ? p.color : 'var(--border)', background: table[k][inp] === v ? `${p.color}33` : 'transparent' }}
                          onClick={() => {
                            setTable((t) => t.map((row, i) => (i === k ? row.map((x, j) => (j === inp ? v : x)) : row)) as GhzClassical);
                            reset();
                          }}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="row" style={{ justifyContent: 'center', gap: 2, marginTop: 4 }}>
                  {[0, 1].map((inp) => (
                    <div key={inp} style={{ textAlign: 'center' }}>
                      <div className="mono faint" style={{ fontSize: '0.72rem' }}>input {inp}</div>
                      <EquatorPicker
                        k={axes[k][inp]}
                        size={86}
                        onChange={(v) => {
                          setAxes((a) => a.map((row, i) => (i === k ? row.map((x, j) => (j === inp ? v : x)) : row)));
                          reset();
                        }}
                      />
                      <div className="mono" style={{ fontSize: '0.72rem', color: phaseColor((axes[k][inp] * Math.PI) / 4) }}>
                        {AXIS_NAME[axes[k][inp]] ?? `${axes[k][inp] * 45}°`}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 10 }}>
          {GHZ_QUESTIONS.map((q, i) => {
            const p = mode === 'classical' ? (cWins[i] ? 1 : 0) : qProbs[i];
            const hl = last && last.q.join('') === q.join('');
            return (
              <div key={i} className="panel" style={{ padding: 6, textAlign: 'center', borderColor: hl ? (last.win ? 'var(--green)' : 'var(--red)') : 'var(--border)' }}>
                <div className="mono">xyz = {q.join('')}</div>
                <div className="faint" style={{ fontSize: '0.72rem' }}>need parity {q[0] | q[1] | q[2] ? 'odd' : 'even'}</div>
                <div className="mono" style={{ fontWeight: 700, color: p > 0.999 ? 'var(--green)' : p < 0.001 ? 'var(--red)' : 'var(--yellow)' }}>
                  {mode === 'classical' ? (p ? 'WIN' : 'LOSE') : `${(p * 100).toFixed(1)}%`}
                </div>
              </div>
            );
          })}
        </div>
        <WinMeter rate={exact} label={mode === 'classical' ? 'rulebook wins' : 'exact win probability'} lines={[{ v: 0.75, label: 'classical max 75%', color: '#fcd34d' }, { v: 1, label: '100%', color: '#83c167' }]} />

        <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <button className="btn primary" onClick={() => play(1)}>▶ 1 round</button>
          <button className="btn" onClick={() => play(16)}>▶▶ 16 rounds</button>
          <button className="btn" onClick={() => play(STREAK_GOAL)}>⚡ {STREAK_GOAL} rounds</button>
          <button className="btn ghost" onClick={reset}>reset</button>
          <span className="mono" style={{ marginLeft: 'auto', fontSize: '0.85rem' }}>
            streak <b style={{ color: streak >= STREAK_GOAL ? 'var(--green)' : 'var(--text)' }}>{streak}</b> · session {winRate === null ? '—' : `${(winRate * 100).toFixed(1)}%`} of {rounds.length}
          </span>
        </div>
        <div className="row" style={{ gap: 2, marginTop: 8, flexWrap: 'wrap' }}>
          {recent.map((r, i) => (
            <span key={rounds.length - i} title={`xyz=${r.q.join('')} abc=${r.ans.join('')}`} style={{ width: 10, height: 14, borderRadius: 2, background: r.win ? '#83c167' : '#fc6255', opacity: 1 - i / 90 }} />
          ))}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 12, padding: 12, fontSize: '0.92rem' }}>
        <b>Why?</b>{' '}
        {mode === 'classical' ? (
          <span className="dim">
            Write the answers as ±1 numbers A₀, A₁, B₀, B₁, C₀, C₁. Winning all four questions needs A₀B₀C₀ = +1 and A₀B₁C₁ = A₁B₀C₁ = A₁B₁C₀ = −1. Multiply all four
            equations: every variable appears twice, so the left side is +1, but the right side is (+1)(−1)³ = −1. Contradiction. At most 3 of 4 can hold, so the classical maximum is 75%
            {classicalPlayed ? '. You can check it with any rulebook above.' : '.'}
          </span>
        ) : (
          <span className="dim">
            For the GHZ state, measuring along equatorial axes φ₁, φ₂, φ₃ gives outcomes whose product has average cos(φ₁ + φ₂ + φ₃). Choose X (φ = 0) for input 0 and Y (φ = 90°)
            for input 1: question 000 gives cos 0 = +1 (even parity, always), and each of 011, 101, 110 gives cos 180° = −1 (odd parity, always). The quantum players win{' '}
            <b>every</b> round. No local hidden variables could, and no probabilities or statistics are needed to see it.
          </span>
        )}
      </div>

      {won && (
        <GameOverlay title="🎯 Perfect nonlocality!" tone="win" onClose={() => setWon(false)}>
          {STREAK_GOAL} wins in a row. A classical team loses a quarter of all rounds whatever its rulebook, so the chance of a {STREAK_GOAL}-round streak by luck is
          (3/4)^{STREAK_GOAL} ≈ {(0.75 ** STREAK_GOAL).toExponential(1)}. The GHZ state makes the impossible certain.
        </GameOverlay>
      )}
    </div>
  );
}
