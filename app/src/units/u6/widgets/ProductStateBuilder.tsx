import React, { useState } from 'react';
import { Widget, Slider, Tex, fmtPi } from '../../../components/ui';
import { C, mul, fmt, abs2, sub } from '../../../engine/complex';
import { blochToAmps } from '../../../engine/qsim';
import { MiniBloch } from '../../../widgets/MiniBloch';
import { AmplitudeView, PhasorClock, PhaseLegend } from '../../../widgets/AmplitudeView';
import { vecFromAngles } from '../../../widgets/BlochSphere';

const PRESETS: { label: string; t: number; p: number }[] = [
  { label: '|0⟩', t: 0, p: 0 },
  { label: '|1⟩', t: Math.PI, p: 0 },
  { label: '|+⟩', t: Math.PI / 2, p: 0 },
  { label: '|−⟩', t: Math.PI / 2, p: Math.PI },
  { label: '|+i⟩', t: Math.PI / 2, p: Math.PI / 2 },
];

function QubitControl({ name, color, t, p, setT, setP }: { name: string; color: string; t: number; p: number; setT: (v: number) => void; setP: (v: number) => void }) {
  const [a0, a1] = blochToAmps(t, p);
  return (
    <div className="panel" style={{ padding: 10, borderColor: `${color}55` }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 700, color }}>{name}</div>
          <div className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
            {fmt(a0, 2)}|0⟩ + {fmt(a1, 2)}|1⟩
          </div>
        </div>
        <MiniBloch v={vecFromAngles(t, p)} size={78} color={color} />
      </div>
      <Slider label={<Tex>{'\\theta'}</Tex>} value={t} min={0} max={Math.PI} step={Math.PI / 24} onChange={setT} format={fmtPi} />
      <Slider label={<Tex>{'\\phi'}</Tex>} value={p} min={0} max={2 * Math.PI} step={Math.PI / 24} onChange={setP} format={fmtPi} />
      <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
        {PRESETS.map((pr) => (
          <button
            key={pr.label}
            className={`btn small ${Math.abs(pr.t - t) < 1e-6 && (pr.t === 0 || pr.t === Math.PI || Math.abs(pr.p - p) < 1e-6) ? 'active' : ''}`}
            onClick={() => {
              setT(pr.t);
              setP(pr.p);
            }}
          >
            {pr.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Two single-qubit states → their tensor (Kronecker) product, drawn as a multiplication table:
 * q0's amplitudes down the side, q1's along the top, the four products in the grid.
 */
export function ProductStateBuilder() {
  const [t0, setT0] = useState(Math.PI / 2);
  const [p0, setP0] = useState(0);
  const [t1, setT1] = useState(Math.PI / 3);
  const [p1, setP1] = useState(Math.PI / 2);
  const A = blochToAmps(t0, p0);
  const B = blochToAmps(t1, p1);
  const prod: C[] = [mul(A[0], B[0]), mul(A[0], B[1]), mul(A[1], B[0]), mul(A[1], B[1])];
  const det = sub(mul(prod[0], prod[3]), mul(prod[1], prod[2]));
  const P = prod.map(abs2);
  const cellSize = 66;

  const head = (z: C, label: string, color: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <PhasorClock z={z} size={40} />
      <span className="mono" style={{ fontSize: '0.7rem', color }}>{label}</span>
    </div>
  );

  return (
    <Widget title="Tensor product builder: two qubits → four amplitudes">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        <QubitControl name="q0 (left bit)" color="#58c4dd" t={t0} p={p0} setT={setT0} setP={setP0} />
        <QubitControl name="q1 (right bit)" color="#fcd34d" t={t1} p={p1} setT={setT1} setP={setP1} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, marginTop: 14, alignItems: 'center' }}>
        <div style={{ justifySelf: 'center' }}>
          <div className="faint" style={{ fontSize: '0.78rem', marginBottom: 6, textAlign: 'center' }}>
            multiplication table: cell = (q0 amplitude) × (q1 amplitude)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `70px ${cellSize}px ${cellSize}px`, gap: 6, alignItems: 'center', justifyItems: 'center' }}>
            <span style={{ fontSize: '1.4rem', color: 'var(--text-faint)' }}>⊗</span>
            {head(B[0], 'q1: 0', '#fcd34d')}
            {head(B[1], 'q1: 1', '#fcd34d')}
            {[0, 1].map((r) => (
              <React.Fragment key={r}>
                {head(A[r], `q0: ${r}`, '#58c4dd')}
                {[0, 1].map((cc) => {
                  const i = r * 2 + cc;
                  return (
                    <div
                      key={cc}
                      style={{
                        width: cellSize,
                        height: cellSize,
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                        background: 'var(--panel-2)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <PhasorClock z={prod[i]} size={40} />
                      <span className="mono" style={{ fontSize: '0.66rem', color: 'var(--text-dim)' }}>
                        |{r}{cc}⟩ {(P[i] * 100).toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
        <div>
          <div className="faint" style={{ fontSize: '0.78rem', marginBottom: 4 }}>
            the same four numbers as a column vector in ℂ⁴ (order 00, 01, 10, 11)
          </div>
          <AmplitudeView amps={prod} n={2} compact />
          <div className="row" style={{ marginTop: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <PhaseLegend size={40} />
            <div className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
              P(00)·P(11) − P(01)·P(10) = {(P[0] * P[3] - P[1] * P[2]).toFixed(3)}
              <br />
              <span title="Keep this in mind for the next lesson">a·d − b·c = {fmt(det, 3)}</span>
            </div>
          </div>
        </div>
      </div>
    </Widget>
  );
}
