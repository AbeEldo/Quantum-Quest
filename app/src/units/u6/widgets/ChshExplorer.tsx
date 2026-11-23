import React, { useState } from 'react';
import { Widget, Segmented } from '../../../components/ui';
import { AngleDial, useTween } from './parts';
import { correlator } from '../lib/bell';

type Mode = 'quantum' | 'local';
const TS = 2 * Math.SQRT2;

/** Horizontal gauge for S from −2√2..2√2 with the classical band shaded. */
function SGauge({ S, sampled }: { S: number; sampled?: { S: number; err: number } | null }) {
  const W = 460, H = 72, pad = 24;
  const x = (s: number) => pad + ((s + 3) / 6) * (W - 2 * pad);
  const St = useTween(S, 450);
  const over = Math.abs(S) > 2 + 1e-9;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
      <rect x={x(-3)} y={22} width={x(3) - x(-3)} height={16} rx={8} fill="#1d2230" stroke="#2a3142" />
      <rect x={x(-2)} y={22} width={x(2) - x(-2)} height={16} fill="rgba(252,211,77,0.18)" />
      <rect x={x(2)} y={22} width={x(TS) - x(2)} height={16} fill="rgba(224,122,182,0.25)" />
      <rect x={x(-TS)} y={22} width={x(-2) - x(-TS)} height={16} fill="rgba(224,122,182,0.25)" />
      {[-TS, -2, 0, 2, TS].map((v) => (
        <g key={v}>
          <line x1={x(v)} x2={x(v)} y1={18} y2={42} stroke={Math.abs(v) === 2 ? '#fcd34d' : Math.abs(v) > 2 ? '#e07ab6' : '#6b7385'} strokeWidth={1.5} strokeDasharray={v === 0 ? undefined : '3 2'} />
          <text x={x(v)} y={56} fill="#9aa3b5" fontSize={11} textAnchor="middle" fontFamily="var(--mono)">
            {Math.abs(v) === TS ? `${v < 0 ? '−' : ''}2√2` : v}
          </text>
        </g>
      ))}
      <text x={x(0)} y={13} fill="#fcd34d" fontSize={10.5} textAnchor="middle">local hidden variables: |S| ≤ 2</text>
      <text x={x(2.45)} y={13} fill="#e07ab6" fontSize={10.5} textAnchor="middle">quantum only</text>
      {sampled && (
        <g>
          <line x1={x(sampled.S - 2 * sampled.err)} x2={x(sampled.S + 2 * sampled.err)} y1={30} y2={30} stroke="#83c167" strokeWidth={3} />
          <circle cx={x(sampled.S)} cy={30} r={4} fill="#83c167" />
        </g>
      )}
      <circle cx={x(St)} cy={30} r={9} fill={over ? '#e07ab6' : '#fcd34d'} stroke="#fff" strokeWidth={1.5} />
      <text x={x(St)} y={68} fill={over ? '#e07ab6' : '#fcd34d'} fontSize={12} fontWeight={700} textAnchor="middle" fontFamily="var(--mono)">
        S = {S.toFixed(3)}
      </text>
    </svg>
  );
}

/** One correlator bar −1..+1. */
function CorrBar({ label, E, sign }: { label: string; E: number; sign: 1 | -1 }) {
  const w = 120;
  const Et = useTween(E, 350);
  return (
    <div className="row" style={{ gap: 8, fontSize: '0.82rem' }}>
      <span className="mono" style={{ width: 92 }}>
        {sign < 0 ? '−' : '+'} E({label})
      </span>
      <svg width={w} height={16}>
        <rect x={0} y={4} width={w} height={8} rx={4} fill="#1d2230" />
        <line x1={w / 2} x2={w / 2} y1={0} y2={16} stroke="#6b7385" />
        <rect x={Et >= 0 ? w / 2 : w / 2 + (Et * w) / 2} y={4} width={(Math.abs(Et) * w) / 2} height={8} rx={2} fill={Et * sign >= 0 ? '#83c167' : '#fc6255'} />
      </svg>
      <span className="mono" style={{ width: 52, textAlign: 'right' }}>{E.toFixed(3)}</span>
    </div>
  );
}

/**
 * CHSH explorer: Alice chooses angles a, a′; Bob b, b′. S = E(a,b) + E(a,b′) + E(a′,b) − E(a′,b′).
 * Quantum mode: E = cos 2(θA − θB). Local mode: the learner fixes ±1 answers and sees |S| = 2.
 */
export function ChshExplorer() {
  const [mode, setMode] = useState<Mode>('quantum');
  const [a, setA] = useState(0);
  const [a2, setA2] = useState(Math.PI / 4);
  const [b, setB] = useState(Math.PI / 8);
  const [b2, setB2] = useState(-Math.PI / 8);
  const [loc, setLoc] = useState<[number, number, number, number]>([1, 1, 1, -1]); // A(a), A(a'), B(b), B(b')
  const [sampled, setSampled] = useState<{ S: number; err: number } | null>(null);

  const E =
    mode === 'quantum'
      ? [correlator(a, b), correlator(a, b2), correlator(a2, b), correlator(a2, b2)]
      : [loc[0] * loc[2], loc[0] * loc[3], loc[1] * loc[2], loc[1] * loc[3]];
  const S = E[0] + E[1] + E[2] - E[3];

  const sample = () => {
    const N = 1000; // per setting pair
    const est = E.map((e) => {
      let s = 0;
      for (let i = 0; i < N; i++) s += Math.random() < (1 + e) / 2 ? 1 : -1;
      return s / N;
    });
    const Ss = est[0] + est[1] + est[2] - est[3];
    const err = Math.sqrt(E.reduce((acc, e) => acc + (1 - e * e) / N, 0));
    setSampled({ S: Ss, err });
  };

  const setAll = (v: [number, number, number, number]) => {
    setA(v[0]);
    setA2(v[1]);
    setB(v[2]);
    setB2(v[3]);
    setSampled(null);
  };

  const pm = (k: number) => (
    <button
      className="btn small"
      style={{ minWidth: 44, fontWeight: 700, color: loc[k] > 0 ? 'var(--green)' : 'var(--red)' }}
      onClick={() => setLoc((l) => l.map((x, i) => (i === k ? -x : x)) as [number, number, number, number])}
    >
      {loc[k] > 0 ? '+1' : '−1'}
    </button>
  );

  return (
    <Widget title="The CHSH inequality: S = E(a,b) + E(a,b′) + E(a′,b) − E(a′,b′)">
      <div className="row" style={{ gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <Segmented
          options={[
            { value: 'quantum' as Mode, label: '⚛ entangled photons' },
            { value: 'local' as Mode, label: '🎩 local instructions (±1 answers)' },
          ]}
          value={mode}
          onChange={(m) => { setMode(m); setSampled(null); }}
        />
        {mode === 'quantum' && (
          <>
            <button className="btn small" onClick={() => setAll([0, Math.PI / 4, Math.PI / 8, -Math.PI / 8])}>optimal angles</button>
            <button className="btn small" onClick={() => setAll([0, 0, 0, 0])}>all equal</button>
            <button className="btn small" onClick={() => setAll([0, Math.PI / 2, Math.PI / 4, -Math.PI / 4])}>a, a′ ⟂</button>
          </>
        )}
      </div>
      {mode === 'quantum' ? (
        <div className="row" style={{ justifyContent: 'space-around', flexWrap: 'wrap', gap: 6 }}>
          <AngleDial value={a} onChange={(v) => { setA(v); setSampled(null); }} color="#58c4dd" label="a" size={104} />
          <AngleDial value={a2} onChange={(v) => { setA2(v); setSampled(null); }} color="#29abca" label="a′" size={104} />
          <AngleDial value={b} onChange={(v) => { setB(v); setSampled(null); }} color="#fcd34d" label="b" size={104} />
          <AngleDial value={b2} onChange={(v) => { setB2(v); setSampled(null); }} color="#f0ac5f" label="b′" size={104} />
        </div>
      ) : (
        <div className="row" style={{ justifyContent: 'space-around', flexWrap: 'wrap', gap: 12 }}>
          <div className="panel" style={{ padding: 10 }}>
            <div style={{ color: 'var(--blue)', fontWeight: 600, marginBottom: 4 }}>Alice's particle carries</div>
            <div className="row" style={{ gap: 6 }}>A(a) {pm(0)} A(a′) {pm(1)}</div>
          </div>
          <div className="panel" style={{ padding: 10 }}>
            <div style={{ color: 'var(--yellow)', fontWeight: 600, marginBottom: 4 }}>Bob's particle carries</div>
            <div className="row" style={{ gap: 6 }}>B(b) {pm(2)} B(b′) {pm(3)}</div>
          </div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginTop: 10, alignItems: 'center' }}>
        <div className="col" style={{ gap: 4 }}>
          <CorrBar label="a,b" E={E[0]} sign={1} />
          <CorrBar label="a,b′" E={E[1]} sign={1} />
          <CorrBar label="a′,b" E={E[2]} sign={1} />
          <CorrBar label="a′,b′" E={E[3]} sign={-1} />
          <div className="faint" style={{ fontSize: '0.75rem' }}>
            {mode === 'quantum' ? 'E(θA, θB) = cos 2(θA − θB) for |Φ⁺⟩ photons' : 'E = A·B: the product of the pre-set answers'}
          </div>
        </div>
        <div>
          <SGauge S={S} sampled={sampled} />
          {mode === 'quantum' && (
            <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
              <button className="btn small" onClick={sample}>🎲 simulate 4000 pairs</button>
              {sampled && (
                <span className="mono" style={{ fontSize: '0.82rem', color: 'var(--green)' }}>
                  measured S = {sampled.S.toFixed(3)} ± {sampled.err.toFixed(3)}
                </span>
              )}
            </div>
          )}
          {mode === 'local' && (
            <div className="faint" style={{ fontSize: '0.82rem', textAlign: 'center' }}>
              S = A(a)·[B(b) + B(b′)] + A(a′)·[B(b) − B(b′)]. One bracket is 0, the other ±2. Try every combination.
            </div>
          )}
        </div>
      </div>
    </Widget>
  );
}
