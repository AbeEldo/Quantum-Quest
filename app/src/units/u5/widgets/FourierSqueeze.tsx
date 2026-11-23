import React, { useMemo, useRef, useState } from 'react';
import { Widget, Slider, Segmented, Stat, Tex } from '../../../components/ui';
import { Wave1D } from '../../../engine/wave1d';
import { useLiveCanvas } from './useLiveCanvas';
import { PHASE_LUT, phaseIndex } from './colors';

type Shape = 'gauss' | 'chirp' | 'cat' | 'tophat' | 'sech';
const XR: [number, number] = [-40, 40];

function makeState(shape: Shape, s: number, extra: number, k0: number, x: Float64Array) {
  const re = new Float64Array(x.length), im = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const xx = x[i];
    let amp = 0, ph = k0 * xx;
    switch (shape) {
      case 'gauss':
        amp = Math.exp(-(xx * xx) / (4 * s * s));
        break;
      case 'chirp':
        amp = Math.exp(-(xx * xx) / (4 * s * s));
        ph += extra * 0.15 * xx * xx;
        break;
      case 'cat':
        amp = Math.exp(-((xx - extra) ** 2) / (4 * s * s)) + Math.exp(-((xx + extra) ** 2) / (4 * s * s));
        break;
      case 'tophat': {
        const half = s * 1.7;
        const edge = 0.15 + 0.5 * (1 - Math.min(1, extra / 6));
        amp = 0.5 * (Math.tanh((xx + half) / edge) - Math.tanh((xx - half) / edge));
        break;
      }
      case 'sech':
        amp = 1 / Math.cosh(xx / (s * 1.1));
        break;
    }
    re[i] = amp * Math.cos(ph);
    im[i] = amp * Math.sin(ph);
  }
  return { re, im };
}

/**
 * Position ↔ momentum: ψ(x) and |φ(p)|² (FFT), Δx, Δp and their product against the Heisenberg bound ħ/2.
 * A phase-space panel plots (Δx, Δp) above the forbidden hyperbola ΔxΔp < 1/2.
 */
export function FourierSqueeze() {
  const [shape, setShape] = useState<Shape>('gauss');
  const [s, setS] = useState(1.5);
  const [extra, setExtra] = useState(3);
  const [k0, setK0] = useState(0);
  const trail = useRef<[number, number][]>([]);
  const sim = useMemo(() => new Wave1D({ N: 1024, xmin: XR[0], xmax: XR[1], dt: 0.01 }), []);
  const data = useMemo(() => {
    const st = makeState(shape, s, extra, k0, sim.x);
    sim.setState(st.re, st.im);
    const u = sim.uncertainties();
    const mom = sim.momentumDensity();
    return { re: sim.re.slice(), im: sim.im.slice(), u, mom };
  }, [shape, s, extra, k0, sim]);
  const prod = data.u.dx * data.u.dp;
  // trail of (Δx, Δp)
  const last = trail.current[trail.current.length - 1];
  if (!last || Math.abs(last[0] - data.u.dx) + Math.abs(last[1] - data.u.dp) > 1e-3) {
    trail.current.push([data.u.dx, data.u.dp]);
    if (trail.current.length > 60) trail.current.shift();
  }

  const ref = useLiveCanvas(
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const gap = 16;
      const pw = (w - 2 * gap) * 0.36, kw = (w - 2 * gap) * 0.36, sw = w - 2 * gap - pw - kw;
      const top = 22, bot = h - 26;
      // ---- position ----
      const xv = 14;
      const X = (x: number) => ((x + xv) / (2 * xv)) * pw;
      let dmax = 0;
      for (let i = 0; i < sim.N; i++) dmax = Math.max(dmax, data.re[i] ** 2 + data.im[i] ** 2);
      ctx.strokeStyle = '#2a3142';
      ctx.strokeRect(0, top - 8, pw, bot - top + 8);
      for (let i = 0; i < sim.N; i++) {
        const x = sim.x[i];
        if (Math.abs(x) > xv) continue;
        const p = data.re[i] ** 2 + data.im[i] ** 2;
        const y = bot - (p / (dmax * 1.1)) * (bot - top);
        ctx.fillStyle = PHASE_LUT[phaseIndex(Math.atan2(data.im[i], data.re[i]))];
        ctx.fillRect(X(x), y, Math.max(1, pw / ((2 * xv) / sim.dx)) + 0.5, bot - y);
      }
      ctx.fillStyle = '#9aa3b5';
      ctx.font = '11px Segoe UI';
      ctx.fillText('position |ψ(x)|² (colour = phase)', 4, 12);
      // Δx bar
      const mx = sim.expectX();
      ctx.strokeStyle = '#fcd34d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(X(mx - data.u.dx), bot + 10);
      ctx.lineTo(X(mx + data.u.dx), bot + 10);
      ctx.stroke();
      ctx.fillStyle = '#fcd34d';
      ctx.fillText('2Δx', X(mx) - 10, bot + 22);
      // ---- momentum ----
      const ox = pw + gap;
      const kv = 6;
      const K = (k: number) => ox + ((k + kv) / (2 * kv)) * kw;
      const { k, p } = data.mom;
      let pm = 0;
      for (let j = 0; j < k.length; j++) if (Math.abs(k[j]) <= kv) pm = Math.max(pm, p[j]);
      ctx.strokeStyle = '#2a3142';
      ctx.lineWidth = 1;
      ctx.strokeRect(ox, top - 8, kw, bot - top + 8);
      ctx.beginPath();
      ctx.moveTo(K(-kv), bot);
      for (let j = 0; j < k.length; j++) if (Math.abs(k[j]) <= kv) ctx.lineTo(K(k[j]), bot - (p[j] / (pm * 1.1)) * (bot - top));
      ctx.lineTo(K(kv), bot);
      ctx.closePath();
      ctx.fillStyle = 'rgba(92,208,179,0.35)';
      ctx.fill();
      ctx.strokeStyle = '#5cd0b3';
      ctx.stroke();
      ctx.fillStyle = '#9aa3b5';
      ctx.fillText('momentum |φ(p)|²', ox + 4, 12);
      let mk = 0;
      const dk = k[1] - k[0];
      for (let j = 0; j < k.length; j++) mk += k[j] * p[j] * dk;
      ctx.strokeStyle = '#fcd34d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(K(mk - data.u.dp), bot + 10);
      ctx.lineTo(K(mk + data.u.dp), bot + 10);
      ctx.stroke();
      ctx.fillStyle = '#fcd34d';
      ctx.fillText('2Δp', K(mk) - 10, bot + 22);
      // ---- phase-space panel ----
      const sx0 = ox + kw + gap;
      const DXM = 6, DPM = 3;
      const SX = (v: number) => sx0 + 26 + (v / DXM) * (sw - 32);
      const SY = (v: number) => bot - (v / DPM) * (bot - top);
      ctx.fillStyle = 'rgba(252,98,85,0.14)';
      ctx.beginPath();
      ctx.moveTo(SX(0.01), SY(0));
      for (let i = 1; i <= 120; i++) {
        const dxv = (i / 120) * DXM;
        ctx.lineTo(SX(dxv), SY(Math.min(DPM, 0.5 / dxv)));
      }
      ctx.lineTo(SX(DXM), SY(0));
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#fc6255';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 1; i <= 120; i++) {
        const dxv = (i / 120) * DXM;
        const y = SY(Math.min(DPM, 0.5 / dxv));
        if (i === 1) ctx.moveTo(SX(dxv), y);
        else ctx.lineTo(SX(dxv), y);
      }
      ctx.stroke();
      ctx.strokeStyle = '#3a4256';
      ctx.beginPath();
      ctx.moveTo(SX(0), SY(DPM));
      ctx.lineTo(SX(0), SY(0));
      ctx.lineTo(SX(DXM), SY(0));
      ctx.stroke();
      ctx.fillStyle = '#9aa3b5';
      ctx.fillText('Δp', sx0 + 4, top + 4);
      ctx.fillText('Δx', SX(DXM) - 16, bot + 14);
      ctx.fillStyle = '#fc6255';
      ctx.fillText('forbidden: ΔxΔp < ħ/2', SX(0.3), SY(0.12));
      // trail
      ctx.fillStyle = 'rgba(88,196,221,0.35)';
      for (const [a, b] of trail.current) {
        ctx.beginPath();
        ctx.arc(SX(Math.min(a, DXM)), SY(Math.min(b, DPM)), 2, 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.fillStyle = '#fcd34d';
      ctx.beginPath();
      ctx.arc(SX(Math.min(data.u.dx, DXM)), SY(Math.min(data.u.dp, DPM)), 5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = '#9aa3b5';
      ctx.fillText('uncertainty plane', sx0 + 26, 12);
    },
    { height: 280, running: false },
    [data],
  );

  const extraLabel = shape === 'chirp' ? 'chirp (x² phase)' : shape === 'cat' ? 'hump separation' : shape === 'tophat' ? 'edge sharpness' : null;
  return (
    <Widget title="Squeeze it — the position/momentum trade-off">
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <Segmented
          options={[
            { value: 'gauss', label: 'Gaussian' },
            { value: 'chirp', label: 'chirped Gaussian' },
            { value: 'sech', label: 'sech' },
            { value: 'tophat', label: 'top-hat' },
            { value: 'cat', label: 'two humps' },
          ]}
          value={shape}
          onChange={(v) => {
            trail.current = [];
            setShape(v);
          }}
        />
      </div>
      <div className="canvas-wrap">
        <canvas ref={ref} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '2px 18px', marginTop: 6 }}>
        <Slider label={<span>width <Tex>{'\\sigma'}</Tex></span>} value={s} min={0.3} max={5} step={0.02} onChange={setS} format={(v) => v.toFixed(2)} />
        {extraLabel && <Slider label={extraLabel} value={extra} min={0} max={6} step={0.05} onChange={setExtra} format={(v) => v.toFixed(2)} />}
        <Slider label={<span>mean momentum <Tex>{'k_0'}</Tex></span>} value={k0} min={-3} max={3} step={0.05} onChange={setK0} format={(v) => v.toFixed(2)} />
      </div>
      <div className="row" style={{ gap: 16, flexWrap: 'wrap', marginTop: 4 }}>
        <Stat label="Δx" value={data.u.dx.toFixed(3)} />
        <Stat label="Δp (ħ = 1)" value={data.u.dp.toFixed(3)} />
        <Stat label="Δx·Δp" value={prod.toFixed(3)} color={prod < 0.505 ? 'var(--teal)' : 'var(--yellow)'} />
        <Stat label="Heisenberg bound ħ/2" value="0.500" color="var(--red)" />
        <span className="faint" style={{ fontSize: '0.85rem', alignSelf: 'center' }}>{prod < 0.505 ? '◆ minimum-uncertainty state' : `${((prod / 0.5 - 1) * 100).toFixed(0)}% above the bound`}</span>
      </div>
    </Widget>
  );
}
