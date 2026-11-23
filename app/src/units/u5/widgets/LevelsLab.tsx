import React, { useMemo, useState } from 'react';
import { Widget, Slider, Segmented, Toggle } from '../../../components/ui';
import { useLiveCanvas } from './useLiveCanvas';
import { phaseColor } from '../../../engine/complex';
import { POTS, solve, type PotKey } from './levels';

const POS = phaseColor(0, 62);
const NEG = phaseColor(Math.PI, 62);

/**
 * Energy levels of adjustable 1D potentials (finite-difference eigen-solver from the engine).
 * Shows V(x), levels E_n spanning the classically allowed region, eigenfunctions (phase colour: real ψ has phase 0 or π),
 * level spacings and the anharmonicity — the key to turning an oscillator into a qubit.
 */
export function LevelsLab({ potentials = ['harmonic', 'quartic', 'transmon'] as PotKey[], initial, levels = 5 }: { potentials?: PotKey[]; initial?: PotKey; levels?: number }) {
  const [key, setKey] = useState<PotKey>(initial ?? potentials[0]);
  const def = POTS[key];
  const [params, setParams] = useState<Record<string, number>>(() => Object.fromEntries(Object.values(POTS).map((p) => [p.key, p.param?.value ?? 0])));
  const param = params[key];
  const [showPsi, setShowPsi] = useState(true);
  const [drive, setDrive] = useState(true);
  const spec = useMemo(() => solve(key, param, levels + 1), [key, param, levels]);
  const E = spec.E;
  const gaps = E.slice(1).map((e, i) => e - E[i]);
  const alpha = gaps.length > 1 ? gaps[1] - gaps[0] : 0;
  const unitScale = key === 'harmonic' || key === 'quartic' ? 1 : 1; // ħω = 1 for these, E_C = 1 for transmon

  const ref = useLiveCanvas(
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const padL = 40, padR = 150, top = 14, bot = h - 26;
      const [xa, xb] = def.range(param);
      const X = (x: number) => padL + ((x - xa) / (xb - xa)) * (w - padL - padR);
      const shown = E.slice(0, levels);
      const Emax = shown[shown.length - 1] + (gaps[shown.length - 2] ?? 1) * 0.9;
      const Emin = Math.min(0, ...Array.from(spec.V));
      const Y = (e: number) => bot - ((e - Emin) / (Emax - Emin)) * (bot - top);
      // potential
      ctx.beginPath();
      let first = true;
      for (let i = 0; i < spec.x.length; i++) {
        const y = Math.max(top - 6, Y(Math.min(spec.V[i], Emax * 1.3)));
        if (first) {
          ctx.moveTo(X(spec.x[i]), y);
          first = false;
        } else ctx.lineTo(X(spec.x[i]), y);
      }
      ctx.strokeStyle = 'rgba(210,215,230,0.85)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.lineTo(X(spec.x[spec.x.length - 1]), top - 6);
      ctx.lineTo(X(spec.x[0]), top - 6);
      ctx.closePath();
      ctx.fillStyle = 'rgba(154,163,181,0.08)';
      ctx.fill();
      // levels + wavefunctions
      const spacingRef = Math.min(...gaps.slice(0, levels - 1).map(Math.abs).filter((g) => g > 1e-9), 1e9);
      let psiMax = 0;
      for (let n = 0; n < shown.length; n++) for (let i = 0; i < spec.x.length; i++) psiMax = Math.max(psiMax, Math.abs(spec.psi[n][i]));
      const A = (spacingRef * 0.42) / (psiMax || 1);
      for (let n = 0; n < shown.length; n++) {
        const En = shown[n];
        // classically allowed region
        let i0 = -1, i1 = -1;
        for (let i = 0; i < spec.x.length; i++)
          if (spec.V[i] <= En) {
            if (i0 < 0) i0 = i;
            i1 = i;
          }
        if (i0 < 0) continue;
        const y = Y(En);
        ctx.strokeStyle = '#fcd34d';
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(X(spec.x[i0]), y);
        ctx.lineTo(X(spec.x[i1]), y);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#fcd34d';
        ctx.font = '11px Segoe UI';
        ctx.fillText(`|${n}⟩`, padL - 26, y + 4);
        if (showPsi) {
          for (let i = 0; i < spec.x.length; i += 1) {
            const v = spec.psi[n][i];
            if (Math.abs(v) < psiMax * 0.01) continue;
            ctx.fillStyle = v > 0 ? POS : NEG;
            ctx.globalAlpha = 0.55;
            const yy = y - v * A;
            const xx = X(spec.x[i]);
            const ww = Math.max(1, X(spec.x[1]) - X(spec.x[0]) + 0.4);
            ctx.fillRect(xx, Math.min(y, yy), ww, Math.abs(yy - y));
          }
          ctx.globalAlpha = 1;
        }
      }
      // spacing annotations
      const ax = w - padR + 24;
      ctx.font = '11px Segoe UI';
      for (let n = 0; n < shown.length - 1; n++) {
        const y0 = Y(shown[n]), y1 = Y(shown[n + 1]);
        ctx.strokeStyle = '#58c4dd';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(ax, y0 - 2);
        ctx.lineTo(ax, y1 + 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ax - 4, y1 + 7);
        ctx.lineTo(ax, y1 + 2);
        ctx.lineTo(ax + 4, y1 + 7);
        ctx.stroke();
        ctx.fillStyle = '#58c4dd';
        ctx.fillText(`${(gaps[n] * unitScale).toFixed(3)} ${def.unit}`, ax + 8, (y0 + y1) / 2 + 4);
      }
      // drive indicator
      if (drive && gaps.length > 1) {
        const d01 = gaps[0];
        const y0 = Y(shown[0]), y1 = Y(shown[1]), y2 = Y(shown[2]);
        const dx2 = ax - 12;
        ctx.strokeStyle = '#e07ab6';
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(dx2, y0);
        ctx.lineTo(dx2, y1);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(dx2 - 6, y1);
        ctx.lineTo(dx2 - 6, y1 - (y0 - y1));
        ctx.stroke();
        ctx.setLineDash([]);
        const yTarget = y1 - (y0 - y1);
        ctx.fillStyle = '#e07ab6';
        ctx.beginPath();
        ctx.arc(dx2 - 6, yTarget, 3, 0, 2 * Math.PI);
        ctx.fill();
        void d01;
        void y2;
      }
      ctx.fillStyle = '#6b7385';
      ctx.font = '10px Segoe UI';
      ctx.fillText(def.xLabel, w - padR - 40, h - 6);
    },
    { height: 340, running: false },
    [spec, showPsi, drive, key, param],
  );

  const relAlpha = gaps[0] ? alpha / gaps[0] : 0;
  const resonantLeak = Math.abs(relAlpha) < 0.01;
  return (
    <Widget title="Level lab — what makes a good qubit?">
      <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <Segmented options={potentials.map((p) => ({ value: p, label: POTS[p].label }))} value={key} onChange={setKey} />
      </div>
      <div className="canvas-wrap">
        <canvas ref={ref} />
      </div>
      {def.param && (
        <Slider
          label={def.param.label}
          value={param}
          min={def.param.min}
          max={def.param.max}
          step={def.param.step}
          onChange={(v) => setParams((p) => ({ ...p, [key]: v }))}
          format={def.param.fmt}
        />
      )}
      <div className="row" style={{ gap: 14, flexWrap: 'wrap', marginTop: 6, fontSize: '0.88rem' }}>
        <Toggle label="wavefunctions" value={showPsi} onChange={setShowPsi} />
        <Toggle label="drive at the 0→1 frequency" value={drive} onChange={setDrive} />
      </div>
      <div className="panel" style={{ padding: 10, marginTop: 8, fontSize: '0.9rem' }}>
        <div className="mono">
          E₁−E₀ = {gaps[0]?.toFixed(3)} {def.unit} · E₂−E₁ = {gaps[1]?.toFixed(3)} {def.unit} · anharmonicity α = (E₂−E₁)−(E₁−E₀) ={' '}
          <b style={{ color: resonantLeak ? 'var(--red)' : 'var(--green)' }}>
            {alpha >= 0 ? '+' : ''}
            {alpha.toFixed(3)} {def.unit}
          </b>{' '}
          ({(relAlpha * 100).toFixed(1)}%)
        </div>
        {drive && (
          <div style={{ marginTop: 6, color: resonantLeak ? 'var(--red)' : 'var(--green)' }}>
            {resonantLeak
              ? '⚠ The pink dashed arrow (a second photon at the same frequency) lands exactly on |2⟩: a drive meant for 0↔1 also drives 1↔2. You cannot isolate a qubit.'
              : `✓ A drive at the 0↔1 frequency is detuned by |α| from the 1↔2 transition, so |2⟩ can be avoided if the Rabi frequency is ≪ |α|.`}
          </div>
        )}
        {key === 'transmon' && (
          <div className="faint" style={{ marginTop: 6 }}>
            With a typical charging energy E_C/h ≈ 250 MHz: f₀₁ ≈ {((gaps[0] * 250) / 1000).toFixed(2)} GHz and α/h ≈ {(alpha * 250).toFixed(0)} MHz. Harmonic estimate √(8E_J E_C) − E_C ={' '}
            {(Math.sqrt(8 * param) - 1).toFixed(2)} E_C.
          </div>
        )}
      </div>
    </Widget>
  );
}
