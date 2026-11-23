import React, { useRef, useState } from 'react';
import { Widget, ProgressBar } from '../../../components/ui';
import { C, c, abs, abs2, arg, phaseColor, fmt, mul, sub, conj, add, scale } from '../../../engine/complex';
import { MiniBloch } from '../../../widgets/MiniBloch';
import { PhaseLegend } from '../../../widgets/AmplitudeView';
import { concurrence, normalize, reducedBloch2 } from '../lib/bell';

const S2 = Math.SQRT1_2;
const PRESETS: { label: string; amps: C[] }[] = [
  { label: '|00⟩', amps: [c(1), c(0), c(0), c(0)] },
  { label: '|+⟩|+⟩', amps: [c(0.5), c(0.5), c(0.5), c(0.5)] },
  { label: '|0⟩|−⟩', amps: [c(S2), c(-S2), c(0), c(0)] },
  { label: 'Φ⁺', amps: [c(S2), c(0), c(0), c(S2)] },
  { label: 'Ψ⁻', amps: [c(0), c(S2), c(-S2), c(0)] },
  { label: 'cos(π/8)|00⟩+sin(π/8)|11⟩', amps: [c(Math.cos(Math.PI / 8)), c(0), c(0), c(Math.sin(Math.PI / 8))] },
  { label: '½(1,1,1,−1)', amps: [c(0.5), c(0.5), c(0.5), c(-0.5)] },
];

/** A draggable complex amplitude: drag the arrow tip anywhere inside the circle. */
function DragPhasor({ z, display, onChange, size = 86, label }: { z: C; display: C; onChange: (z: C) => void; size?: number; label: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const drag = useRef(false);
  const R = size / 2 - 8;
  const set = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    let x = (e.clientX - r.left - r.width / 2) / R;
    let y = -(e.clientY - r.top - r.height / 2) / R;
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    if (Math.hypot(x, y) < 0.06) {
      x = 0;
      y = 0;
    }
    onChange(c(x, y));
  };
  const rr = Math.min(1, abs(z));
  const th = arg(z);
  const col = phaseColor(th);
  const p = abs2(display);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg
        ref={ref}
        width={size}
        height={size}
        viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}
        style={{ cursor: 'crosshair', touchAction: 'none' }}
        onPointerDown={(e) => {
          drag.current = true;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          set(e);
        }}
        onPointerMove={(e) => drag.current && set(e)}
        onPointerUp={() => (drag.current = false)}
      >
        <rect x={-size / 2 + 1} y={-size / 2 + 1} width={size - 2} height={size - 2} rx={12} fill="var(--panel-2)" stroke="var(--border)" />
        <circle r={R} fill="none" stroke="#3a4256" />
        <line x1={-R} x2={R} y1={0} y2={0} stroke="#2a3142" />
        <line y1={-R} y2={R} x1={0} x2={0} stroke="#2a3142" />
        <circle r={R * rr} fill={col} fillOpacity={0.18} />
        {rr > 0.01 && <line x1={0} y1={0} x2={R * rr * Math.cos(th)} y2={-R * rr * Math.sin(th)} stroke={col} strokeWidth={3} strokeLinecap="round" />}
        <circle cx={R * rr * Math.cos(th)} cy={-R * rr * Math.sin(th)} r={6} fill={rr > 0.01 ? col : '#666'} stroke="#fff" strokeWidth={1.2} />
      </svg>
      <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
        {label} {fmt(display, 2)} <span className="faint">({(p * 100).toFixed(0)}%)</span>
      </span>
    </div>
  );
}

/** Try to factor a product state into |α⟩⊗|β⟩ (only meaningful when concurrence ≈ 0). */
function factor(amps: C[]): [C[], C[]] {
  const rows = [
    [amps[0], amps[1]],
    [amps[2], amps[3]],
  ];
  const r = abs2(rows[0][0]) + abs2(rows[0][1]) >= abs2(rows[1][0]) + abs2(rows[1][1]) ? 0 : 1;
  const n = Math.sqrt(abs2(rows[r][0]) + abs2(rows[r][1]));
  let beta = [scale(rows[r][0], 1 / n), scale(rows[r][1], 1 / n)];
  let alpha = rows.map((row) => add(mul(conj(beta[0]), row[0]), mul(conj(beta[1]), row[1])));
  // tidy global phases: make first non-zero entries real positive
  const tidy = (v: C[]) => {
    const k = abs(v[0]) > 1e-6 ? v[0] : v[1];
    const ph = c(k.re / abs(k), -k.im / abs(k));
    return v.map((x) => mul(x, ph));
  };
  beta = tidy(beta);
  alpha = rows.map((row) => add(mul(conj(beta[0]), row[0]), mul(conj(beta[1]), row[1])));
  return [alpha, beta];
}

const ketStr = (v: C[]) => `${fmt(v[0], 2)}|0⟩ + ${fmt(v[1], 2)}|1⟩`.replace('+ -', '− ');

/**
 * Drag the four amplitudes of a two-qubit state (auto-normalised) and watch the entanglement test:
 * the state is a product iff ad − bc = 0. Shows each qubit's reduced Bloch vector.
 */
export function EntanglementTester() {
  const [raw, setRaw] = useState<C[]>(PRESETS[3].amps);
  const amps = normalize(raw.some((z) => abs(z) > 1e-9) ? raw : [c(1), c(0), c(0), c(0)]);
  const det = sub(mul(amps[0], amps[3]), mul(amps[1], amps[2]));
  const C2 = concurrence(amps);
  const [rA, rB] = reducedBloch2(amps);
  const product = C2 < 0.02;
  const [fa, fb] = product ? factor(amps) : [null, null];
  const lenA = Math.hypot(...rA);
  const labels = ['a = |00⟩', 'b = |01⟩', 'c = |10⟩', 'd = |11⟩'];

  return (
    <Widget title="Entanglement tester: is this state a product?">
      <div className="row" style={{ gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
        <span className="faint" style={{ fontSize: '0.85rem' }}>presets:</span>
        {PRESETS.map((p) => (
          <button key={p.label} className="btn small" onClick={() => setRaw(p.amps)}>
            {p.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 18, alignItems: 'center' }}>
        <div style={{ justifySelf: 'center' }}>
          <div className="faint" style={{ fontSize: '0.78rem', textAlign: 'center', marginBottom: 6 }}>
            drag the arrow tips (rows: q0, columns: q1). The state is renormalised automatically.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '24px auto auto', gap: 8, alignItems: 'center' }}>
            <span />
            <span className="mono faint" style={{ textAlign: 'center' }}>q1 = 0</span>
            <span className="mono faint" style={{ textAlign: 'center' }}>q1 = 1</span>
            {[0, 1].map((r) => (
              <React.Fragment key={r}>
                <span className="mono faint" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', textAlign: 'center' }}>q0 = {r}</span>
                {[0, 1].map((cc) => {
                  const i = 2 * r + cc;
                  return (
                    <DragPhasor
                      key={cc}
                      z={raw[i]}
                      display={amps[i]}
                      label={labels[i]}
                      onChange={(z) => setRaw((old) => old.map((o, k) => (k === i ? z : o)))}
                    />
                  );
                })}
              </React.Fragment>
            ))}
          </div>
          <div style={{ marginTop: 6 }}>
            <PhaseLegend size={36} />
          </div>
        </div>

        <div className="col" style={{ gap: 10 }}>
          <div className="panel" style={{ padding: 12, borderColor: product ? 'var(--yellow)' : 'var(--pink)', transition: 'border-color .3s' }}>
            <div className="mono" style={{ fontSize: '0.9rem' }}>
              a·d − b·c = <b style={{ color: product ? 'var(--yellow)' : 'var(--pink)' }}>{fmt(det, 3)}</b>
            </div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, marginTop: 4, color: product ? 'var(--yellow)' : 'var(--pink)' }}>
              {product ? 'PRODUCT STATE' : 'ENTANGLED'}
            </div>
            {product && fa && fb ? (
              <div className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: 4 }}>
                = ({ketStr(fa)}) ⊗ ({ketStr(fb)})
              </div>
            ) : (
              <div className="dim" style={{ fontSize: '0.85rem', marginTop: 4 }}>No way to write this as (state of q0) ⊗ (state of q1).</div>
            )}
            <div style={{ marginTop: 10 }}>
              <div className="row" style={{ justifyContent: 'space-between', fontSize: '0.8rem' }}>
                <span className="faint">entanglement (concurrence 2|ad − bc|)</span>
                <span className="mono" style={{ color: 'var(--pink)' }}>{C2.toFixed(3)}</span>
              </div>
              <ProgressBar value={C2} color="var(--pink)" />
            </div>
          </div>
          <div>
            <div className="faint" style={{ fontSize: '0.78rem', marginBottom: 4 }}>each qubit on its own (reduced Bloch vectors)</div>
            <div className="row" style={{ gap: 14 }}>
              <MiniBloch v={rA} size={92} label={`q0 · length ${lenA.toFixed(2)}`} color={product ? '#fcd34d' : '#e07ab6'} />
              <MiniBloch v={rB} size={92} label={`q1 · length ${Math.hypot(...rB).toFixed(2)}`} color={product ? '#fcd34d' : '#e07ab6'} />
            </div>
            <div className="faint" style={{ fontSize: '0.75rem', marginTop: 4 }}>
              For pure two-qubit states, length² + concurrence² = 1. Maximal entanglement means each arrow shrinks to a dot.
            </div>
          </div>
        </div>
      </div>
    </Widget>
  );
}
