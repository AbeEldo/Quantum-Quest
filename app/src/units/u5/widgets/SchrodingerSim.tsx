import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Widget, Slider, Toggle, Segmented, Tex } from '../../../components/ui';
import { Wave1D, boundStates } from '../../../engine/wave1d';
import { useLiveCanvas } from './useLiveCanvas';
import { rasterLayers, type Layer } from '../physics';
import { PHASE_LUT, phaseIndex } from './colors';

export type PresetName = 'free' | 'barrier' | 'double' | 'step' | 'well' | 'box' | 'harmonic' | 'custom';
export type Readout = 'x' | 'dx' | 'dp' | 'E' | 'T' | 't' | 'norm';

const PRESET_LABEL: Record<PresetName, string> = {
  free: 'free',
  barrier: 'barrier',
  double: 'double barrier',
  step: 'step',
  well: 'well',
  box: 'box',
  harmonic: 'harmonic',
  custom: '✏ custom',
};
const OPEN: Record<PresetName, boolean> = { free: true, barrier: true, double: true, step: true, well: true, box: false, harmonic: false, custom: true };

export interface SchrodingerSimProps {
  title?: string;
  preset?: PresetName;
  /** Preset buttons to show (default: just the initial preset). */
  presets?: PresetName[];
  x0?: number;
  sigma?: number;
  k0?: number;
  /** Barrier/well height, width, gap; oscillator ω; box length. */
  V0?: number;
  width?: number;
  gap?: number;
  omega?: number;
  boxL?: number;
  xRange?: [number, number];
  N?: number;
  dt?: number;
  showMomentum?: boolean;
  /** Start in a superposition of bound states: [n (0-based), re, im]. */
  initialEigen?: [number, number, number][];
  readouts?: Readout[];
  height?: number;
  autoplay?: boolean;
  /** Hide the packet sliders. */
  lockPacket?: boolean;
  /** Hide potential parameter sliders. */
  lockPotential?: boolean;
  view?: 'phase' | 'reim';
  /** Show a "measure position" button. */
  measure?: boolean;
  /** Steps per frame (speed) initial value. */
  speed?: number;
}

interface SimState {
  sim: Wave1D;
  mask: Float64Array | null;
  lostL: number;
  lostR: number;
  dScale: number;
  E0: number;
  kHist: { k: Float64Array; p: Float64Array } | null;
  frame: number;
  flash: { x: number; t: number } | null;
  view: { emin: number; emax: number; top: number; base: number };
}

const ABSORB = 8;

function buildPotential(preset: PresetName, p: { V0: number; width: number; gap: number; omega: number; boxL: number }, sim: Wave1D, custom: Float64Array | null): Float64Array {
  const { x, dx, N } = sim;
  const out = new Float64Array(N);
  const layers = (ls: Layer[], start: number) => rasterLayers(x, dx, ls, start);
  switch (preset) {
    case 'free':
      return out;
    case 'barrier':
      return layers([{ width: p.width, V: p.V0 }], 0);
    case 'double':
      return layers(
        [
          { width: p.width, V: p.V0 },
          { width: p.gap, V: 0 },
          { width: p.width, V: p.V0 },
        ],
        -p.gap / 2 - p.width,
      );
    case 'step':
      for (let i = 0; i < N; i++) out[i] = x[i] >= 0 ? p.V0 : 0;
      return out;
    case 'well':
      return layers([{ width: p.width, V: -p.V0 }], -p.width / 2);
    case 'box':
      for (let i = 0; i < N; i++) out[i] = Math.abs(x[i]) <= p.boxL / 2 ? 0 : 400;
      return out;
    case 'harmonic':
      for (let i = 0; i < N; i++) out[i] = 0.5 * p.omega * p.omega * x[i] * x[i];
      return out;
    case 'custom':
      if (custom) out.set(custom);
      return out;
  }
}

/**
 * Real-time 1D Schrödinger simulator (split-step Fourier via Wave1D, ħ = m = 1).
 * |ψ|² is drawn filled and coloured by the phase of ψ; V(x) in grey with ⟨E⟩ dashed.
 */
export function SchrodingerSim({
  title = 'Schrödinger simulator',
  preset: preset0 = 'free',
  presets,
  x0: x00 = -15,
  sigma: sigma0 = 2,
  k0: k00 = 2,
  V0: V00 = 2,
  width: width0 = 1,
  gap: gap0 = 4,
  omega: omega0 = 0.25,
  boxL: boxL0 = 30,
  xRange = [-50, 50],
  N = 1024,
  dt = 0.01,
  showMomentum: showMomentum0 = false,
  initialEigen,
  readouts = ['t', 'x', 'dx', 'dp', 'E'],
  height = 300,
  autoplay = false,
  lockPacket = false,
  lockPotential = false,
  view: view0 = 'phase',
  measure = false,
  speed: speed0 = 4,
}: SchrodingerSimProps) {
  const [preset, setPreset] = useState<PresetName>(preset0);
  const [x0, setX0] = useState(x00);
  const [sigma, setSigma] = useState(sigma0);
  const [k0, setK0] = useState(k00);
  const [V0, setV0] = useState(V00);
  const [width, setWidth] = useState(width0);
  const [gap, setGap] = useState(gap0);
  const [omega, setOmega] = useState(omega0);
  const [boxL, setBoxL] = useState(boxL0);
  const [running, setRunning] = useState(autoplay);
  const [speed, setSpeed] = useState(speed0);
  const [view, setView] = useState<'phase' | 'reim'>(view0);
  const [showK, setShowK] = useState(showMomentum0);
  const [drawMode, setDrawMode] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const custom = useRef<Float64Array | null>(null);
  const readRef = useRef<HTMLDivElement>(null);

  const S = useRef<SimState | null>(null);
  if (!S.current) {
    S.current = { sim: new Wave1D({ N, xmin: xRange[0], xmax: xRange[1], dt }), mask: null, lostL: 0, lostR: 0, dScale: 1, E0: 1, kHist: null, frame: 0, flash: null, view: { emin: 0, emax: 1, top: 14, base: 270 } };
  }
  const pot = { V0, width, gap, omega, boxL };
  const open = OPEN[preset];

  // structure edges for T/R readouts
  const edges = useMemo((): [number, number] => {
    switch (preset) {
      case 'barrier':
        return [0, width];
      case 'double':
        return [-gap / 2 - width, gap / 2 + width];
      case 'step':
        return [0, 0];
      case 'well':
        return [-width / 2, width / 2];
      default:
        return [0, 0];
    }
  }, [preset, width, gap]);

  // (re)initialise the simulation when parameters change
  useEffect(() => {
    const st = S.current!;
    const sim = st.sim;
    const V = buildPotential(preset, pot, sim, custom.current);
    sim.setPotential(V);
    // absorbing mask
    if (open) {
      const m = new Float64Array(sim.N);
      for (let i = 0; i < sim.N; i++) {
        const d = Math.min(sim.x[i] - sim.xmin, sim.xmax - sim.x[i]);
        if (d >= ABSORB) m[i] = 1;
        else {
          const s = 1 - d / ABSORB;
          m[i] = Math.exp(-0.6 * s * s * sim.dt * 10);
        }
      }
      st.mask = m;
    } else st.mask = null;
    if (initialEigen && initialEigen.length) {
      const maxN = Math.max(...initialEigen.map((e) => e[0])) + 1;
      const { psi } = boundStates(V, sim.dx, maxN);
      const re = new Float64Array(sim.N), im = new Float64Array(sim.N);
      for (const [n, cr, ci] of initialEigen) {
        const f = psi[n];
        for (let i = 0; i < sim.N; i++) {
          re[i] += cr * f[i];
          im[i] += ci * f[i];
        }
      }
      sim.setState(re, im);
    } else sim.setGaussian(x0, sigma, k0);
    st.lostL = st.lostR = 0;
    st.frame = 0;
    st.flash = null;
    const d = sim.density();
    st.dScale = Math.max(...d) * 1.25 || 1;
    st.E0 = sim.energy();
    st.kHist = sim.momentumDensity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, x0, sigma, k0, V0, width, gap, omega, boxL, resetKey]);

  const advance = (steps: number) => {
    const st = S.current!;
    const sim = st.sim;
    for (let s = 0; s < steps; s++) {
      sim.step(1);
      const m = st.mask;
      if (m) {
        const { re, im, N: n } = sim;
        for (let i = 0; i < n; i++) {
          if (m[i] === 1) continue;
          const p = re[i] * re[i] + im[i] * im[i];
          const lost = p * (1 - m[i] * m[i]) * sim.dx;
          if (i < n / 2) st.lostL += lost;
          else st.lostR += lost;
          re[i] *= m[i];
          im[i] *= m[i];
        }
      }
    }
  };

  const ref = useLiveCanvas(
    (ctx, w, h, dtFrame) => {
      const st = S.current!;
      const sim = st.sim;
      if (running && dtFrame > 0) advance(speed);
      st.frame++;
      const kH = showK ? 110 : 0;
      const mainH = h - kH;
      ctx.clearRect(0, 0, w, h);
      const padL = 8, padR = 8;
      const X = (x: number) => padL + ((x - sim.xmin) / (sim.xmax - sim.xmin)) * (w - padL - padR);
      const top = 14, base = mainH - 30;
      const band = mainH - 22;
      // energy scale
      let vmin = 0, vmaxFinite = 0;
      for (let i = 0; i < sim.N; i++) {
        vmin = Math.min(vmin, sim.V[i]);
        if (sim.V[i] < 100) vmaxFinite = Math.max(vmaxFinite, sim.V[i]);
      }
      const Eref = Math.max(st.E0, 0.05);
      const emax = Math.max(Eref * 1.7, Math.min(vmaxFinite * 1.15, Eref * 4), 0.5);
      const emin = vmin < 0 ? vmin * 1.1 : 0;
      const EY = (e: number) => base - ((e - emin) / (emax - emin)) * (base - top);
      st.view = { emin, emax, top, base };
      // absorbing zones
      if (st.mask) {
        ctx.fillStyle = 'rgba(255,255,255,0.025)';
        ctx.fillRect(X(sim.xmin), top - 10, X(sim.xmin + ABSORB) - X(sim.xmin), base - top + 10);
        ctx.fillRect(X(sim.xmax - ABSORB), top - 10, X(sim.xmax) - X(sim.xmax - ABSORB), base - top + 10);
      }
      // potential
      ctx.beginPath();
      ctx.moveTo(X(sim.xmin), EY(Math.max(emin, 0)));
      for (let i = 0; i < sim.N; i++) ctx.lineTo(X(sim.x[i]), Math.max(top - 10, EY(Math.min(sim.V[i], emax * 1.5))));
      ctx.lineTo(X(sim.xmax), EY(Math.max(emin, 0)));
      ctx.closePath();
      ctx.fillStyle = 'rgba(154,163,181,0.16)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(200,205,220,0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < sim.N; i++) {
        const y = Math.max(top - 10, EY(Math.min(sim.V[i], emax * 1.5)));
        if (i === 0) ctx.moveTo(X(sim.x[i]), y);
        else ctx.lineTo(X(sim.x[i]), y);
      }
      ctx.stroke();
      // energy line
      const Enow = st.frame % 10 === 0 || !running ? sim.energy() : st.E0;
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = 'rgba(252,211,77,0.75)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(X(sim.xmin), EY(st.E0));
      ctx.lineTo(X(sim.xmax), EY(st.E0));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(252,211,77,0.9)';
      ctx.font = '11px Segoe UI, sans-serif';
      ctx.fillText('⟨E⟩', w - padR - 26, EY(st.E0) - 4);
      {
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath();
        ctx.moveTo(X(sim.xmin), EY(0));
        ctx.lineTo(X(sim.xmax), EY(0));
        ctx.stroke();
      }
      // density scale (grow if needed)
      const dens = sim.density();
      let dmax = 0;
      for (let i = 0; i < sim.N; i++) dmax = Math.max(dmax, dens[i]);
      if (dmax > st.dScale) st.dScale = dmax * 1.1;
      const DY = (p: number) => base - (p / st.dScale) * (base - top);
      const ampMax = Math.sqrt(st.dScale);
      // per-pixel columns
      const pxW = Math.max(1, (w - padL - padR) / sim.N);
      if (view === 'phase') {
        for (let i = 0; i < sim.N; i++) {
          const p = dens[i];
          if (p < st.dScale * 0.002) continue;
          const ph = Math.atan2(sim.im[i], sim.re[i]);
          ctx.fillStyle = PHASE_LUT[phaseIndex(ph)];
          const y = DY(p);
          ctx.fillRect(X(sim.x[i]) - pxW / 2, y, pxW + 0.6, base - y);
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i < sim.N; i++) {
          const y = DY(dens[i]);
          if (i === 0) ctx.moveTo(X(sim.x[i]), y);
          else ctx.lineTo(X(sim.x[i]), y);
        }
        ctx.stroke();
      } else {
        const mid = (base + top) / 2;
        const AY = (a: number) => mid - (a / ampMax) * ((base - top) / 2);
        const curve = (arr: Float64Array, col: string, sign = 1) => {
          ctx.strokeStyle = col;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          for (let i = 0; i < sim.N; i++) {
            const y = AY(sign * arr[i]);
            if (i === 0) ctx.moveTo(X(sim.x[i]), y);
            else ctx.lineTo(X(sim.x[i]), y);
          }
          ctx.stroke();
        };
        const env = new Float64Array(sim.N);
        for (let i = 0; i < sim.N; i++) env[i] = Math.sqrt(dens[i]);
        ctx.globalAlpha = 0.5;
        curve(env, '#ffffff');
        curve(env, '#ffffff', -1);
        ctx.globalAlpha = 1;
        curve(sim.re, '#58c4dd');
        curve(sim.im, '#e07ab6');
        ctx.fillStyle = '#58c4dd';
        ctx.fillText('Re ψ', padL + 6, top + 4);
        ctx.fillStyle = '#e07ab6';
        ctx.fillText('Im ψ', padL + 44, top + 4);
        ctx.fillStyle = '#cfd6e4';
        ctx.fillText('±|ψ|', padL + 82, top + 4);
      }
      // phase band
      for (let i = 0; i < sim.N; i++) {
        const a = Math.sqrt(dens[i]) / ampMax;
        if (a < 0.02) continue;
        ctx.globalAlpha = Math.min(1, a * 1.3);
        ctx.fillStyle = PHASE_LUT[phaseIndex(Math.atan2(sim.im[i], sim.re[i]))];
        ctx.fillRect(X(sim.x[i]) - pxW / 2, band, pxW + 0.6, 9);
      }
      ctx.globalAlpha = 1;
      // x ticks
      ctx.fillStyle = '#6b7385';
      ctx.font = '10px Segoe UI, sans-serif';
      const span = sim.xmax - sim.xmin;
      const stepT = span > 60 ? 10 : 5;
      for (let xt = Math.ceil(sim.xmin / stepT) * stepT; xt <= sim.xmax; xt += stepT) {
        const px = X(xt);
        ctx.fillRect(px, band + 10, 1, 3);
        ctx.fillText(String(xt), px - 6, mainH - 1);
      }
      // measurement flash
      if (st.flash) {
        const age = (performance.now() - st.flash.t) / 1000;
        if (age > 1.2) st.flash = null;
        else {
          ctx.strokeStyle = `rgba(255,255,255,${1 - age / 1.2})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(X(st.flash.x), top - 8);
          ctx.lineTo(X(st.flash.x), base);
          ctx.stroke();
          ctx.fillStyle = `rgba(255,255,255,${1 - age / 1.2})`;
          ctx.fillText('click! found here', X(st.flash.x) + 5, top + 6);
        }
      }
      // momentum panel
      if (showK) {
        if (st.frame % 3 === 0 || !running || !st.kHist) st.kHist = sim.momentumDensity();
        const { k, p } = st.kHist;
        const k0v = Math.abs(k00) + Math.abs(k0) + 2;
        const kv = Math.max(4, Math.min(k[k.length - 1], k0v + 3 / Math.max(0.3, sigma)));
        const y0 = mainH + 8, y1 = h - 18;
        const KX = (kk: number) => padL + ((kk + kv) / (2 * kv)) * (w - padL - padR);
        let pm = 0;
        for (let j = 0; j < k.length; j++) if (Math.abs(k[j]) <= kv) pm = Math.max(pm, p[j]);
        ctx.strokeStyle = '#2a3142';
        ctx.strokeRect(padL, y0, w - padL - padR, y1 - y0);
        ctx.fillStyle = 'rgba(92,208,179,0.35)';
        ctx.strokeStyle = '#5cd0b3';
        ctx.beginPath();
        let started = false;
        for (let j = 0; j < k.length; j++) {
          if (Math.abs(k[j]) > kv) continue;
          const xx = KX(k[j]), yy = y1 - (p[j] / (pm * 1.1 || 1)) * (y1 - y0);
          if (!started) {
            ctx.moveTo(xx, y1);
            started = true;
          }
          ctx.lineTo(xx, yy);
        }
        ctx.lineTo(KX(kv), y1);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#6b7385';
        ctx.fillText('momentum space |φ(p)|²', padL + 6, y0 + 12);
        for (const kt of [-Math.floor(kv), 0, Math.floor(kv)]) ctx.fillText(`p=${kt}`, KX(kt) - 10, h - 4);
      }
      // readouts (DOM, throttled)
      if (readRef.current && (st.frame % 6 === 0 || !running)) {
        const parts: string[] = [];
        const n2 = sim.norm2();
        for (const r of readouts) {
          if (r === 't') parts.push(`t = ${sim.t.toFixed(1)}`);
          if (r === 'x') parts.push(`⟨x⟩ = ${n2 > 1e-4 ? sim.expectX().toFixed(2) : '—'}`);
          if (r === 'dx' || r === 'dp') {
            const u = n2 > 1e-4 ? sim.uncertainties() : { dx: NaN, dp: NaN };
            if (r === 'dx') parts.push(`Δx = ${u.dx.toFixed(2)}`);
            if (r === 'dp') parts.push(`Δp = ${u.dp.toFixed(2)}`);
          }
          if (r === 'E') parts.push(`⟨E⟩ = ${(n2 > 1e-4 ? Enow : st.E0).toFixed(3)}`);
          if (r === 'norm') parts.push(`∫|ψ|² = ${n2.toFixed(3)}`);
          if (r === 'T') {
            const Tn = sim.probIn(edges[1] + 1e-9, sim.xmax) + st.lostR;
            const Rn = sim.probIn(sim.xmin, edges[0]) + st.lostL;
            parts.push(`transmitted = ${(Tn * 100).toFixed(1)}%`, `reflected = ${(Rn * 100).toFixed(1)}%`);
          }
        }
        readRef.current.textContent = parts.join('   ·   ');
      }
    },
    { height: height + (showK ? 110 : 0), running },
    [preset, x0, sigma, k0, V0, width, gap, omega, boxL, resetKey, view, showK],
  );

  // drawing a custom potential
  const drawing = useRef(false);
  const paint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawMode || !drawing.current) return;
    const st = S.current!;
    const sim = st.sim;
    const r = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - r.left - 8) / (r.width - 16);
    const py = e.clientY - r.top;
    const x = sim.xmin + fx * (sim.xmax - sim.xmin);
    const { emin, emax, top, base } = st.view;
    const e2 = Math.max(0, emin + ((base - py) / (base - top)) * (emax - emin));
    if (!custom.current) custom.current = new Float64Array(sim.N);
    for (let i = 0; i < sim.N; i++) if (Math.abs(sim.x[i] - x) < 0.8) custom.current[i] = e2 < 0.04 * emax ? 0 : e2;
    sim.setPotential(custom.current);
  };

  const doMeasure = () => {
    const st = S.current!;
    const sim = st.sim;
    const d = sim.density();
    const tot = d.reduce((a, b) => a + b, 0);
    if (tot <= 0) return;
    let u = Math.random() * tot;
    let idx = 0;
    for (; idx < sim.N - 1; idx++) {
      u -= d[idx];
      if (u <= 0) break;
    }
    const xm = sim.x[idx];
    const t = sim.t;
    sim.setGaussian(xm, 0.5, 0);
    sim.t = t;
    st.flash = { x: xm, t: performance.now() };
    st.lostL = st.lostR = 0;
    st.dScale = Math.max(...sim.density()) * 1.25;
  };

  const showPresetButtons = (presets?.length ?? 0) > 1;
  return (
    <Widget title={title}>
      <div className="canvas-wrap" style={{ cursor: drawMode ? 'crosshair' : undefined }}>
        <canvas
          ref={ref}
          onPointerDown={(e) => {
            if (!drawMode) return;
            drawing.current = true;
            if (preset !== 'custom') {
              custom.current = new Float64Array(S.current!.sim.V);
              setPreset('custom');
            }
            (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
            paint(e);
          }}
          onPointerMove={paint}
          onPointerUp={() => (drawing.current = false)}
          style={{ touchAction: drawMode ? 'none' : undefined }}
        />
      </div>
      <div ref={readRef} className="mono faint" style={{ fontSize: '0.8rem', marginTop: 4, minHeight: '1.2em' }} />
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <button className="btn small primary" onClick={() => setRunning((r) => !r)}>
          {running ? '❚❚ pause' : '▶ play'}
        </button>
        <button
          className="btn small"
          onClick={() => {
            setResetKey((k) => k + 1);
          }}
        >
          ↺ reset
        </button>
        {measure && (
          <button className="btn small gold" onClick={doMeasure}>
            📍 measure position
          </button>
        )}
        <Segmented
          options={[
            { value: 'phase', label: '|ψ|² + phase' },
            { value: 'reim', label: 'Re / Im' },
          ]}
          value={view}
          onChange={setView}
        />
        <Toggle label="momentum panel" value={showK} onChange={setShowK} />
        <div style={{ minWidth: 200, flex: 1 }}>
          <Slider label="speed" value={speed} min={1} max={16} step={1} onChange={setSpeed} format={(v) => `${v}×`} />
        </div>
      </div>
      {showPresetButtons && (
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          <span className="faint" style={{ fontSize: '0.82rem' }}>Potential:</span>
          {presets!.map((p) => (
            <button
              key={p}
              className={`btn small ${preset === p ? 'active' : ''}`}
              onClick={() => {
                if (p === 'custom') {
                  if (!custom.current) custom.current = new Float64Array(S.current!.sim.N);
                  setDrawMode(true);
                } else setDrawMode(false);
                setPreset(p);
                setResetKey((k) => k + 1);
              }}
            >
              {PRESET_LABEL[p]}
            </button>
          ))}
          {presets!.includes('custom') && (
            <>
              <Toggle label="draw with mouse" value={drawMode} onChange={setDrawMode} />
              {preset === 'custom' && (
                <button
                  className="btn small ghost"
                  onClick={() => {
                    custom.current = new Float64Array(S.current!.sim.N);
                    S.current!.sim.setPotential(custom.current);
                    setResetKey((k) => k + 1);
                  }}
                >
                  clear
                </button>
              )}
            </>
          )}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '2px 18px', marginTop: 6 }}>
        {!lockPacket && !initialEigen && (
          <>
            <Slider label={<span>start <Tex>{'x_0'}</Tex></span>} value={x0} min={xRange[0] + 0.15 * (xRange[1] - xRange[0])} max={xRange[1] - 0.15 * (xRange[1] - xRange[0])} step={0.5} onChange={setX0} format={(v) => v.toFixed(1)} />
            <Slider label={<span>width <Tex>{'\\sigma'}</Tex></span>} value={sigma} min={0.4} max={8} step={0.1} onChange={setSigma} format={(v) => v.toFixed(1)} />
            <Slider label={<span>momentum <Tex>{'k_0'}</Tex></span>} value={k0} min={-5} max={5} step={0.05} onChange={setK0} format={(v) => v.toFixed(2)} />
          </>
        )}
        {!lockPotential && (preset === 'barrier' || preset === 'double' || preset === 'step' || preset === 'well') && (
          <Slider label={<span>{preset === 'well' ? 'depth' : 'height'} <Tex>{'V_0'}</Tex></span>} value={V0} min={0} max={8} step={0.05} onChange={setV0} format={(v) => v.toFixed(2)} />
        )}
        {!lockPotential && (preset === 'barrier' || preset === 'double' || preset === 'well') && (
          <Slider label={<span>width <Tex>{'a'}</Tex></span>} value={width} min={0.1} max={preset === 'well' ? 20 : 6} step={0.05} onChange={setWidth} format={(v) => v.toFixed(2)} />
        )}
        {!lockPotential && preset === 'double' && <Slider label="gap" value={gap} min={0.5} max={15} step={0.05} onChange={setGap} format={(v) => v.toFixed(2)} />}
        {!lockPotential && preset === 'harmonic' && <Slider label={<Tex>{'\\omega'}</Tex>} value={omega} min={0.05} max={1} step={0.01} onChange={setOmega} format={(v) => v.toFixed(2)} />}
        {!lockPotential && preset === 'box' && <Slider label="box length L" value={boxL} min={8} max={80} step={1} onChange={setBoxL} format={(v) => v.toFixed(0)} />}
      </div>
    </Widget>
  );
}
