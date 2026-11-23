import React, { useRef, useState } from 'react';
import { Widget, Slider, Toggle, Tex } from '../../../components/ui';
import { phaseColor } from '../../../engine/complex';
import { useLiveCanvas } from './useLiveCanvas';
import { arrow, clock, label } from './draw';

/**
 * Stationary states as spinning phase clocks.
 * |ψ(t)⟩ = c₁e^{−iE₁t}|E₁⟩ + c₂e^{−iE₂t}|E₂⟩  (ħ = 1).
 * Energy probabilities never change; the probability of the "mixed" outcome
 * |+⟩ = (|E₁⟩+|E₂⟩)/√2 beats at the Bohr frequency (E₂ − E₁)/ħ.
 */
export function PhaseClocks() {
  const [E1, setE1] = useState(1);
  const [E2, setE2] = useState(2.5);
  const [p2, setP2] = useState(0.5);
  const [shift, setShift] = useState(false);
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(1);
  const t = useRef(0);
  const hist = useRef<{ t: number; p: number }[]>([]);
  const params = useRef({ E1, E2, p2, shift, speed });
  params.current = { E1, E2, p2, shift, speed };

  const reset = () => {
    t.current = 0;
    hist.current = [];
  };

  const ref = useLiveCanvas(
    (ctx, w, h, dt) => {
      const P = params.current;
      t.current += dt * P.speed;
      const T = t.current;
      const off = P.shift ? 3 : 0;
      const e1 = P.E1 + off, e2 = P.E2 + off;
      const c1 = Math.sqrt(1 - P.p2), c2 = Math.sqrt(P.p2);
      const a1 = -e1 * T, a2 = -e2 * T;
      const z1 = [c1 * Math.cos(a1), c1 * Math.sin(a1)];
      const z2 = [c2 * Math.cos(a2), c2 * Math.sin(a2)];
      const s = Math.SQRT1_2;
      const amp = [(z1[0] + z2[0]) * s, (z1[1] + z2[1]) * s];
      const pPlus = amp[0] ** 2 + amp[1] ** 2;
      const H = hist.current;
      if (!H.length || T - H[H.length - 1].t > 0.01) H.push({ t: T, p: pPlus });
      const window = 14;
      while (H.length && H[0].t < T - window) H.shift();

      ctx.clearRect(0, 0, w, h);
      const narrow = w < 640;
      // ---------- energy ladder ----------
      const lw = narrow ? w * 0.42 : w * 0.3;
      const top = 22, bot = h - 26;
      const Emax = 9;
      const ey = (E: number) => bot - (E / Emax) * (bot - top);
      ctx.strokeStyle = '#2a3142';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(18, top - 6);
      ctx.lineTo(18, bot);
      ctx.lineTo(lw - 8, bot);
      ctx.stroke();
      label(ctx, 'energy', 4, top - 10, '#6b7385', 11);
      const R = Math.min(26, (bot - top) / 7);
      const lev = [
        { E: e1, z: z1, c: c1, name: 'E₁' },
        { E: e2, z: z2, c: c2, name: 'E₂' },
      ];
      for (const L of lev) {
        const y = ey(L.E);
        ctx.strokeStyle = '#9aa3b5';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(26, y);
        ctx.lineTo(lw - 2.6 * R - 10, y);
        ctx.stroke();
        label(ctx, `${L.name} = ${L.E.toFixed(1)}`, 28, y - 6, '#cfd6e4', 12);
        clock(ctx, lw - 1.3 * R - 6, y, R, L.z[0], L.z[1], 1);
      }
      label(ctx, `P(E₂) = ${P.p2.toFixed(2)} — constant`, 26, bot + 17, '#e07ab6', 11);

      // ---------- phasor sum ----------
      const mx0 = lw + 10;
      const mw = narrow ? w - mx0 : w * 0.27;
      const mh = narrow ? h * 0.55 : h;
      const cx = mx0 + mw / 2, cy = narrow ? mh / 2 + 6 : h / 2 + 4;
      const S = Math.min(mw, mh) * 0.36;
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#3a4256';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, S, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.setLineDash([]);
      const p1x = cx + S * z1[0] * s, p1y = cy - S * z1[1] * s;
      const p2x = p1x + S * z2[0] * s, p2y = p1y - S * z2[1] * s;
      arrow(ctx, cx, cy, p1x, p1y, phaseColor(a1), 2.2);
      arrow(ctx, p1x, p1y, p2x, p2y, phaseColor(a2), 2.2);
      arrow(ctx, cx, cy, p2x, p2y, '#fcd34d', 3.2, 9);
      label(ctx, '⟨+|ψ(t)⟩ = sum of the two arrows', cx, narrow ? 12 : 16, '#9aa3b5', 11, 'center');
      label(ctx, `P(+) = |sum|² = ${pPlus.toFixed(2)}`, cx, narrow ? mh - 2 : h - 10, '#fcd34d', 12, 'center');

      // ---------- trace ----------
      const px0 = narrow ? lw + 30 : lw + mw + 34;
      const px1 = w - 10;
      const py0 = narrow ? mh + 22 : 24, py1 = h - 26;
      if (!narrow || h > 0) {
        ctx.strokeStyle = '#2a3142';
        ctx.lineWidth = 1;
        ctx.strokeRect(px0, py0, px1 - px0, py1 - py0);
        const ty = (p: number) => py1 - p * (py1 - py0);
        const tx = (tt: number) => px1 - ((T - tt) / window) * (px1 - px0);
        label(ctx, '1', px0 - 12, py0 + 4, '#6b7385', 11);
        label(ctx, '0', px0 - 12, py1 + 4, '#6b7385', 11);
        // P(E2) line
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = '#e07ab6';
        ctx.beginPath();
        ctx.moveTo(px0, ty(P.p2));
        ctx.lineTo(px1, ty(P.p2));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = '#fcd34d';
        ctx.lineWidth = 2;
        ctx.beginPath();
        H.forEach((pt, i) => {
          const x = tx(pt.t), y = ty(pt.p);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        label(ctx, 'P(+) over time', px0 + 6, py0 + 14, '#fcd34d', 11);
        label(ctx, 'P(E₂)', px1 - 40, ty(P.p2) - 5, '#e07ab6', 11);
        const dE = Math.abs(P.E2 - P.E1);
        label(ctx, dE > 1e-6 ? `beat period 2πħ/ΔE = ${((2 * Math.PI) / dE).toFixed(2)}` : 'ΔE = 0: no beating', px0 + 6, py1 + 17, '#9aa3b5', 11);
        label(ctx, `t = ${T.toFixed(1)}`, px1 - 50, py1 + 17, '#6b7385', 11);
      }
    },
    { height: 300, running },
  );

  return (
    <Widget title="Stationary states are spinning clocks">
      <div className="canvas-wrap">
        <canvas ref={ref} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '4px 18px', marginTop: 8 }}>
        <Slider label={<Tex>{'E_1'}</Tex>} value={E1} min={0} max={5} step={0.1} onChange={setE1} format={(v) => v.toFixed(1)} />
        <Slider label={<Tex>{'E_2'}</Tex>} value={E2} min={0} max={5} step={0.1} onChange={setE2} format={(v) => v.toFixed(1)} />
        <Slider label={<Tex>{'|c_2|^2'}</Tex>} value={p2} min={0} max={1} step={0.01} onChange={setP2} format={(v) => v.toFixed(2)} />
        <Slider label="speed" value={speed} min={0.1} max={2} step={0.1} onChange={setSpeed} format={(v) => v.toFixed(1) + '×'} />
      </div>
      <div className="row" style={{ gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
        <button className="btn small" onClick={() => setRunning((r) => !r)}>
          {running ? '❚❚ pause' : '▶ play'}
        </button>
        <button className="btn small ghost" onClick={reset}>
          reset t = 0
        </button>
        <Toggle label="add +3 to every energy" value={shift} onChange={setShift} />
      </div>
    </Widget>
  );
}
