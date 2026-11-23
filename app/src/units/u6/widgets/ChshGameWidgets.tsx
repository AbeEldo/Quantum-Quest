import React, { useMemo, useState } from 'react';
import { Widget } from '../../../components/ui';
import { useChallengeGate } from '../../../components/lesson/gates';
import { AngleDial, WinMeter, RunningChart, deg } from './parts';
import {
  ClassicalStrategy, classicalWinRate, chshWins, allClassicalStrategies, QuantumStrategy, quantumWinProb, quantumWinRate,
  playQuantumRound, ChshRound,
} from '../lib/bell';

const bitBtn = (v: 0 | 1, onClick: () => void, color: string) => (
  <button
    className="btn small mono"
    onClick={onClick}
    style={{ minWidth: 38, fontWeight: 700, fontSize: '1rem', borderColor: color, color: v ? '#111' : color, background: v ? color : 'transparent' }}
  >
    {v}
  </button>
);

/** Design a deterministic classical strategy for the CHSH game and see its score on all four questions. */
export function ClassicalChshTable() {
  const [s, setS] = useState<ClassicalStrategy>({ a: [0, 0], b: [0, 0] });
  const rate = classicalWinRate(s);
  const all = useMemo(() => allClassicalStrategies().map((st) => ({ st, r: classicalWinRate(st) })), []);
  const flip = (who: 'a' | 'b', i: 0 | 1) =>
    setS((o) => ({ ...o, [who]: o[who].map((v, k) => (k === i ? 1 - v : v)) as [0 | 1, 0 | 1] }));
  return (
    <Widget title="Design a classical strategy">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        <div className="col" style={{ gap: 10 }}>
          <div className="panel" style={{ padding: 10 }}>
            <div style={{ color: 'var(--blue)', fontWeight: 600 }}>Alice's rulebook</div>
            <div className="row" style={{ gap: 10, marginTop: 6 }}>
              <span>if x = 0 answer</span> {bitBtn(s.a[0], () => flip('a', 0), '#58c4dd')}
              <span>if x = 1 answer</span> {bitBtn(s.a[1], () => flip('a', 1), '#58c4dd')}
            </div>
          </div>
          <div className="panel" style={{ padding: 10 }}>
            <div style={{ color: 'var(--yellow)', fontWeight: 600 }}>Bob's rulebook</div>
            <div className="row" style={{ gap: 10, marginTop: 6 }}>
              <span>if y = 0 answer</span> {bitBtn(s.b[0], () => flip('b', 0), '#fcd34d')}
              <span>if y = 1 answer</span> {bitBtn(s.b[1], () => flip('b', 1), '#fcd34d')}
            </div>
          </div>
          <WinMeter rate={rate} lines={[{ v: 0.75, label: '75%', color: '#fcd34d' }]} />
        </div>
        <div>
          <table className="mono" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 4px', fontSize: '0.88rem' }}>
            <thead>
              <tr className="faint" style={{ fontSize: '0.78rem' }}>
                <td>x y</td>
                <td>need a⊕b = x∧y</td>
                <td>a b</td>
                <td>a⊕b</td>
                <td />
              </tr>
            </thead>
            <tbody>
              {[0, 1].flatMap((x) =>
                [0, 1].map((y) => {
                  const a = s.a[x], b = s.b[y];
                  const w = chshWins(x, y, a, b);
                  return (
                    <tr key={`${x}${y}`} style={{ background: w ? 'rgba(131,193,103,0.1)' : 'rgba(252,98,85,0.12)' }}>
                      <td style={{ padding: '4px 6px' }}>{x} {y}</td>
                      <td>{x & y ? '1 (differ)' : '0 (agree)'}</td>
                      <td>{a} {b}</td>
                      <td>{a ^ b}</td>
                      <td style={{ color: w ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>{w ? 'WIN' : 'LOSE'}</td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
          <div className="faint" style={{ fontSize: '0.78rem', marginTop: 8 }}>All 16 deterministic strategies (click one to load it):</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 3, marginTop: 4 }}>
            {all.map(({ st, r }, k) => {
              const cur = st.a[0] === s.a[0] && st.a[1] === s.a[1] && st.b[0] === s.b[0] && st.b[1] === s.b[1];
              return (
                <button
                  key={k}
                  onClick={() => setS(st)}
                  title={`a=${st.a.join('')} b=${st.b.join('')}`}
                  className="mono"
                  style={{
                    padding: '3px 0',
                    fontSize: '0.66rem',
                    borderRadius: 5,
                    cursor: 'pointer',
                    border: cur ? '1px solid #fff' : '1px solid var(--border)',
                    background: r === 0.75 ? 'rgba(252,211,77,0.35)' : r === 0.5 ? 'rgba(88,196,221,0.18)' : 'rgba(252,98,85,0.25)',
                    color: 'var(--text)',
                  }}
                >
                  {r * 100}%
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Widget>
  );
}

/**
 * Quantum CHSH player: pick the four measurement angles, see the exact win probability of each
 * question, then play rounds (sampled from the real joint distribution) and watch the win rate.
 */
export function ChshQuantumPlayer({ challengeId }: { challengeId?: string }) {
  const [al, setAl] = useState<[number, number]>([0, Math.PI / 2]);
  const [be, setBe] = useState<[number, number]>([0, Math.PI / 4]);
  const strat: QuantumStrategy = { alpha: al, beta: be };
  const rate = quantumWinRate(strat);
  const [hist, setHist] = useState<number[]>([]);
  const [wins, setWins] = useState(0);
  const [last, setLast] = useState<ChshRound | null>(null);
  const [roundKey, setRoundKey] = useState(0);
  useChallengeGate(challengeId ?? 'chsh-q-none', !challengeId || rate > 0.85);

  const reset = () => {
    setHist([]);
    setWins(0);
    setLast(null);
  };
  const play = (n: number) => {
    let w = wins;
    const h = [...hist];
    let r: ChshRound | null = null;
    for (let i = 0; i < n; i++) {
      r = playQuantumRound(strat, Math.random);
      if (r.win) w++;
      h.push(w / (h.length + 1));
    }
    setHist(h);
    setWins(w);
    setLast(r);
    setRoundKey((k) => k + 1);
  };
  const setA = (i: 0 | 1) => (v: number) => { setAl((o) => (i ? [o[0], v] : [v, o[1]])); reset(); };
  const setB = (i: 0 | 1) => (v: number) => { setBe((o) => (i ? [o[0], v] : [v, o[1]])); reset(); };
  const N = hist.length;

  return (
    <Widget title="Quantum strategy: choose the measurement angles">
      <div className="row" style={{ justifyContent: 'space-around', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: 'var(--blue)', fontSize: '0.85rem', fontWeight: 600 }}>Alice</div>
          <div className="row" style={{ gap: 4 }}>
            <AngleDial value={al[0]} onChange={setA(0)} color="#58c4dd" label="x=0" size={100} />
            <AngleDial value={al[1]} onChange={setA(1)} color="#29abca" label="x=1" size={100} />
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: 'var(--yellow)', fontSize: '0.85rem', fontWeight: 600 }}>Bob</div>
          <div className="row" style={{ gap: 4 }}>
            <AngleDial value={be[0]} onChange={setB(0)} color="#fcd34d" label="y=0" size={100} />
            <AngleDial value={be[1]} onChange={setB(1)} color="#f0ac5f" label="y=1" size={100} />
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 8 }}>
        {[0, 1].flatMap((x) =>
          [0, 1].map((y) => {
            const p = quantumWinProb(strat, x, y);
            let d = Math.abs(deg(al[x] - be[y])) % 180;
            if (d > 90) d = 180 - d;
            const hl = last && last.x === x && last.y === y;
            return (
              <div key={`${x}${y}`} className="panel" style={{ padding: 6, textAlign: 'center', borderColor: hl ? (last!.win ? 'var(--green)' : 'var(--red)') : 'var(--border)', transition: 'border-color .2s' }}>
                <div className="mono" style={{ fontSize: '0.8rem' }}>x={x}, y={y}</div>
                <div className="faint" style={{ fontSize: '0.7rem' }}>
                  need {x & y ? 'differ' : 'agree'} · Δ = {d}°
                </div>
                <div className="mono" style={{ fontWeight: 700, color: p > 0.8 ? 'var(--pink)' : p > 0.6 ? 'var(--blue)' : 'var(--text-dim)' }}>{(p * 100).toFixed(1)}%</div>
              </div>
            );
          }),
        )}
      </div>
      <WinMeter rate={rate} label="exact win probability" />
      <div className="row" style={{ gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
        <button className="btn primary small" onClick={() => play(1)}>▶ play 1 round</button>
        <button className="btn small" onClick={() => play(100)}>▶▶ 100 rounds</button>
        <button className="btn small" onClick={() => play(1000)}>⚡ 1000 rounds</button>
        <button className="btn small ghost" onClick={reset}>reset</button>
        {last && (
          <span key={roundKey} className="pop mono" style={{ fontSize: '0.82rem' }}>
            referee: x={last.x}, y={last.y} → Alice measures at {deg(al[last.x])}° → a={last.a}; Bob at {deg(be[last.y])}° → b={last.b} ·{' '}
            a⊕b={last.a ^ last.b}, x∧y={last.x & last.y} →{' '}
            <b style={{ color: last.win ? 'var(--green)' : 'var(--red)' }}>{last.win ? 'WIN' : 'LOSE'}</b>
          </span>
        )}
      </div>
      {hist.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div className="faint" style={{ fontSize: '0.78rem' }}>
            running win rate: {(hist[hist.length - 1] * 100).toFixed(1)}% after {N} rounds
          </div>
          <RunningChart series={[{ points: hist, color: '#83c167' }]} height={150} />
        </div>
      )}
      {challengeId && rate <= 0.85 && (
        <div className="faint" style={{ fontSize: '0.8rem', marginTop: 6 }}>
          🎯 To continue: find angles whose exact win probability exceeds 85%.
        </div>
      )}
      {challengeId && rate > 0.85 && (
        <div className="pill good" style={{ marginTop: 6 }}>✓ {(rate * 100).toFixed(1)}%: that's the quantum maximum, cos²(π/8)</div>
      )}
    </Widget>
  );
}
