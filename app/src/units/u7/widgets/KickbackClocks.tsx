import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Widget, Slider, Segmented, Tex, fmtPi } from '../../../components/ui';
import { MiniBloch } from '../../../widgets/MiniBloch';
import { PhaseLegend } from '../../../widgets/AmplitudeView';
import { c, abs, arg, conj, mul, add, phaseColor, type C } from '../../../engine/complex';
import { GATES, Phase, Rz, type Mat2 } from '../../../engine/qsim';
import { powU, apply2 } from '../lib/su2';

type UKey = 'P' | 'Rz' | 'X';
type TKey = '0' | '1' | '+' | '-' | '+i';
const s = Math.SQRT1_2;
const TARGETS: Record<TKey, [C, C]> = {
  '0': [c(1), c(0)],
  '1': [c(0), c(1)],
  '+': [c(s), c(s)],
  '-': [c(s), c(-s)],
  '+i': [c(s), c(0, s)],
};
const TLABEL: Record<TKey, string> = { '0': '|0⟩', '1': '|1⟩', '+': '|+⟩', '-': '|−⟩', '+i': '|+i⟩' };

/** One big phasor clock. `ghost` draws the "before" hand faintly. */
function Clock({ z, ghost, size = 74 }: { z: C; ghost?: C; size?: number }) {
  const R = size / 2 - 5;
  const m = Math.min(1, abs(z) / s); // amplitudes here are ≤ 1/√2; scale so 1/√2 fills the clock
  const th = arg(z);
  const col = phaseColor(th);
  const hand = (w: C, color: string, width: number, op = 1) => {
    const mm = Math.min(1, abs(w) / s);
    if (mm < 0.02) return null;
    const a = arg(w);
    return <line x1={0} y1={0} x2={R * mm * Math.cos(a)} y2={-R * mm * Math.sin(a)} stroke={color} strokeWidth={width} strokeLinecap="round" opacity={op} />;
  };
  return (
    <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}>
      <circle r={R} fill="rgba(255,255,255,0.03)" stroke="#3a4256" />
      {[0, 1, 2, 3].map((k) => (
        <line key={k} x1={(R - 4) * Math.cos((k * Math.PI) / 2)} y1={(R - 4) * Math.sin((k * Math.PI) / 2)} x2={R * Math.cos((k * Math.PI) / 2)} y2={R * Math.sin((k * Math.PI) / 2)} stroke="#4a5368" />
      ))}
      {m > 0.02 && <circle r={R * m} fill={col} fillOpacity={0.14} />}
      {ghost && hand(ghost, '#9aa3b5', 2, 0.35)}
      {hand(z, col, 3.2)}
      {m > 0.02 && <circle cx={R * m * Math.cos(th)} cy={-R * m * Math.sin(th)} r={3.2} fill={col} />}
      {m <= 0.02 && <circle r={2} fill="#4a5368" />}
    </svg>
  );
}

/** Top-down view of the control's Bloch equator: the arrow is its relative phase (and coherence). */
function PhaseDial({ v, size = 150 }: { v: [number, number, number]; size?: number }) {
  const R = size / 2 - 24;
  const rr = Math.hypot(v[0], v[1]);
  const a = Math.atan2(v[1], v[0]);
  const col = phaseColor(a);
  return (
    <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}>
      {Array.from({ length: 36 }, (_, k) => {
        const t0 = (k / 36) * 2 * Math.PI, t1 = ((k + 1) / 36) * 2 * Math.PI;
        return (
          <path
            key={k}
            d={`M${(R + 4) * Math.cos(t0)} ${-(R + 4) * Math.sin(t0)} A ${R + 4} ${R + 4} 0 0 0 ${(R + 4) * Math.cos(t1)} ${-(R + 4) * Math.sin(t1)}`}
            stroke={phaseColor(t0)}
            strokeWidth={4}
            fill="none"
            opacity={0.55}
          />
        );
      })}
      <circle r={R} fill="rgba(88,196,221,0.05)" stroke="#3a4256" />
      <text x={R + 9} y={4} fontSize={10} fill="#8a93a6" textAnchor="start">+x</text>
      <text x={0} y={-R - 10} fontSize={10} fill="#8a93a6" textAnchor="middle">+y</text>
      <text x={-R - 9} y={4} fontSize={10} fill="#8a93a6" textAnchor="end">−x</text>
      <text x={0} y={R + 18} fontSize={10} fill="#8a93a6" textAnchor="middle">−y</text>
      {rr > 0.02 ? (
        <>
          <line x1={0} y1={0} x2={R * rr * Math.cos(a)} y2={-R * rr * Math.sin(a)} stroke={col} strokeWidth={3.5} strokeLinecap="round" />
          <circle cx={R * rr * Math.cos(a)} cy={-R * rr * Math.sin(a)} r={4} fill={col} />
        </>
      ) : (
        <circle r={3} fill="#e07ab6" />
      )}
    </svg>
  );
}

/**
 * Phase kickback, visualised: control |+⟩, target in a chosen state, apply controlled-U.
 * Shows the four joint amplitudes as clocks (rows = control value) and the control's phase dial.
 */
export function KickbackClocks() {
  const [u, setU] = useState<UKey>('P');
  const [phi, setPhi] = useState(Math.PI / 2);
  const [tk, setTk] = useState<TKey>('1');
  const [t, setT] = useState(1);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const U: Mat2 = u === 'P' ? Phase(phi) : u === 'Rz' ? Rz(phi) : GATES.X;
  const tau = TARGETS[tk];
  // U^t: diagonal gates turn their phases smoothly; X^t = e^{iπt/2} Rx(πt) (exactly X at t = 1)
  const Ut = useMemo(() => (u === 'P' ? Phase(phi * t) : u === 'Rz' ? Rz(phi * t) : powU(GATES.X, t)), [u, phi, t]);
  const row0: [C, C] = [mul(tau[0], c(s)), mul(tau[1], c(s))];
  const row1: [C, C] = apply2(Ut, row0);

  // control reduced state: ρ01 = Σ_k row0_k · conj(row1_k)
  const r01 = add(mul(row0[0], conj(row1[0])), mul(row0[1], conj(row1[1])));
  const vc: [number, number, number] = [2 * r01.re, -2 * r01.im, 0];
  // target reduced state ρ_t = row0 row0† + row1 row1†
  const t00 = abs(row0[0]) ** 2 + abs(row1[0]) ** 2;
  const t11 = abs(row0[1]) ** 2 + abs(row1[1]) ** 2;
  const t01 = add(mul(row0[0], conj(row0[1])), mul(row1[0], conj(row1[1])));
  const vt: [number, number, number] = [2 * t01.re, -2 * t01.im, t00 - t11];

  const full = apply2(U, tau);
  const lam = add(mul(conj(tau[0]), full[0]), mul(conj(tau[1]), full[1])); // ⟨τ|U|τ⟩
  const eigen = abs(lam) > 0.9999;
  const coherence = Math.hypot(vc[0], vc[1]);
  const p0 = (1 + vc[0]) / 2;

  const play = () => {
    cancelAnimationFrame(raf.current);
    const t0 = performance.now();
    const step = () => {
      const x = Math.min(1, (performance.now() - t0) / 1600);
      setT(x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
      if (x < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };

  const uTex = u === 'P' ? `P(${fmtPi(phi)})` : u === 'Rz' ? `R_z(${fmtPi(phi)})` : 'X';

  return (
    <Widget title="Phase kickback: watch the phase land on the control">
      <div className="row" style={{ gap: 14, flexWrap: 'wrap', marginBottom: 8 }}>
        <span className="faint" style={{ fontSize: '0.85rem' }}>controlled-</span>
        <Segmented
          options={[
            { value: 'P', label: 'P(φ)' },
            { value: 'Rz', label: 'Rz(φ)' },
            { value: 'X', label: 'X (CNOT)' },
          ]}
          value={u}
          onChange={(v) => setU(v)}
        />
        <span className="faint" style={{ fontSize: '0.85rem' }}>target:</span>
        <Segmented options={(Object.keys(TARGETS) as TKey[]).map((k) => ({ value: k, label: TLABEL[k] }))} value={tk} onChange={(v) => setTk(v)} />
      </div>
      {u !== 'X' && <Slider label={<Tex>{'\\varphi'}</Tex>} value={phi} min={0} max={2 * Math.PI} step={Math.PI / 24} onChange={setPhi} format={fmtPi} />}
      <div className="row" style={{ gap: 10, marginTop: 4 }}>
        <button className="btn small primary" onClick={play}>
          ▶ Apply controlled-U
        </button>
        <div style={{ flex: 1, maxWidth: 360 }}>
          <Slider label="progress" value={t} min={0} max={1} step={0.01} onChange={setT} format={(x) => `${Math.round(x * 100)}%`} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 1.1fr) 1fr', gap: 16, marginTop: 10, alignItems: 'start' }}>
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '92px 1fr 1fr', alignItems: 'center', justifyItems: 'center', rowGap: 6 }}>
            <span />
            <span className="mono faint" style={{ fontSize: '0.8rem' }}>target |0⟩</span>
            <span className="mono faint" style={{ fontSize: '0.8rem' }}>target |1⟩</span>
            <span className="mono faint" style={{ fontSize: '0.8rem', justifySelf: 'end' }}>control |0⟩</span>
            <Clock z={row0[0]} />
            <Clock z={row0[1]} />
            <span className="mono" style={{ fontSize: '0.8rem', justifySelf: 'end', color: 'var(--yellow)' }}>control |1⟩</span>
            <Clock z={row1[0]} ghost={row0[0]} />
            <Clock z={row1[1]} ghost={row0[1]} />
          </div>
          <div className="faint" style={{ fontSize: '0.8rem', marginTop: 6 }}>
            Each clock is one amplitude of |control, target⟩. Controlled-U only touches the bottom row (control = 1). Faint hands = before.
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            <PhaseLegend size={40} />
          </div>
        </div>
        <div className="col" style={{ gap: 8, alignItems: 'center' }}>
          <div className="faint" style={{ fontSize: '0.8rem' }}>control's relative phase (top view of its Bloch equator)</div>
          <PhaseDial v={vc} />
          <div className="row" style={{ gap: 14 }}>
            <MiniBloch v={vc} size={84} label="control" color={coherence < 0.999 ? '#e07ab6' : '#fcd34d'} />
            <MiniBloch v={vt} size={84} label="target" color={coherence < 0.999 ? '#e07ab6' : '#fcd34d'} />
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 10, padding: 10, borderColor: eigen ? 'var(--green)' : 'var(--pink)' }}>
        {eigen ? (
          <div>
            <b style={{ color: 'var(--green)' }}>
              {TLABEL[tk]} is an eigenvector of {uTex.replace('_z', 'z')} with eigenvalue e^(i·{fmtPi(((arg(lam) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI))}).
            </b>{' '}
            The whole bottom row turns rigidly by that angle, so the phase factors out of the target and becomes a{' '}
            <i>relative phase of the control</i>. The target is untouched.
          </div>
        ) : (
          <div>
            <b style={{ color: 'var(--pink)' }}>{TLABEL[tk]} is not an eigenvector of {uTex.replace('_z', 'z')}.</b> The two clocks in the bottom row
            turn by different amounts — the rows stop being proportional, the qubits become entangled, and the control's arrow shrinks (length {coherence.toFixed(2)}).
          </div>
        )}
        <div className="faint" style={{ fontSize: '0.85rem', marginTop: 4 }}>
          Read-out preview: apply H to the control and measure → P(0) = (1 + x)/2 = <span className="mono">{p0.toFixed(3)}</span>
        </div>
      </div>
    </Widget>
  );
}
