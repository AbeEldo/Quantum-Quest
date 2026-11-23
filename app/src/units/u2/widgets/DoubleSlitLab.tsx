import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Widget, Slider, Toggle, Segmented, useAnimationFrame } from '../../../components/ui';
import { phaseRGB } from '../../../engine/complex';
import { slitAmplitudes, screenIntensity, makeSampler, type SlitGeom } from './optics';
import { useSizedCanvas, useInView } from './canvas';

export type SlitMode = 'water' | 'light' | 'photons' | 'electrons' | 'bullets';

const MODE_LABEL: Record<SlitMode, string> = {
  water: '🌊 Water',
  light: '💡 Bright light',
  photons: '✨ Single photons',
  electrons: '⚛ Electrons',
  bullets: '🔫 Bullets',
};

const MODE_BLURB: Record<SlitMode, string> = {
  water: 'Ripples spread from each slit. Where crest meets crest the water heaves; where crest meets trough it stays flat.',
  light: 'Colour shows the phase of the light wave (it cycles as the wave travels); brightness shows the amplitude. Dark lines = cancellation.',
  photons: 'The source is so dim that only one photon is in the apparatus at a time. Each photon lands as a single dot.',
  electrons: 'Electrons fired one at a time. In real experiments λ is a few picometres; here everything is scaled up so you can see it.',
  bullets: 'Classical particles: each goes through one slit or the other, so the two single-slit piles simply add.',
};

const DOT_COLOR: Record<SlitMode, string> = {
  water: '#58c4dd',
  light: '#fcd34d',
  photons: '#fff3b0',
  electrons: '#7fe7ff',
  bullets: '#f0ac5f',
};

const BINS = 80;

interface Dot {
  y: number; // px
  x: number; // jitter 0..1
}

export function DoubleSlitLab({
  modes = ['water', 'light', 'photons', 'electrons', 'bullets'],
  initialMode,
  title = 'Double-slit lab',
  height = 360,
}: {
  modes?: SlitMode[];
  initialMode?: SlitMode;
  title?: string;
  height?: number;
}) {
  const [mode, setMode] = useState<SlitMode>(initialMode ?? modes[0]);
  const [d, setD] = useState(70);
  const [lambda, setLambda] = useState(18);
  const [open1, setOpen1] = useState(true);
  const [open2, setOpen2] = useState(true);
  const [rate, setRate] = useState(1.3); // log10 dots per second
  const [showWave, setShowWave] = useState(false);
  const [showTheory, setShowTheory] = useState(false);
  const [running, setRunning] = useState(true);
  const [count, setCount] = useState(0);

  const { ref, w: W, h: H, getCtx } = useSizedCanvas({ height });
  const inView = useInView(ref);

  const particle = mode === 'photons' || mode === 'electrons' || mode === 'bullets';

  // geometry
  const xb = Math.round(W * 0.15);
  const xs = Math.round(W * 0.66);
  const plateW = 20;
  const hx0 = xs + plateW + 14;
  const hx1 = W - 10;
  const cy = H / 2;

  const geom: SlitGeom = useMemo(
    () => ({ xb, cy, d, a: 7, lambda, open: [open1, open2], pts: 5 }),
    [xb, cy, d, lambda, open1, open2],
  );

  // Pre-compute field magnitude & phase on a coarse grid (behind the barrier).
  const CELL = 3;
  const field = useMemo(() => {
    const nx = Math.max(1, Math.ceil((xs - xb) / CELL));
    const ny = Math.max(1, Math.ceil(H / CELL));
    const mag = new Float32Array(nx * ny);
    const ph = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const x = xb + (i + 0.5) * CELL, y = (j + 0.5) * CELL;
        const [a, b] = slitAmplitudes(geom, x, y);
        const re = a.re + b.re, im = a.im + b.im;
        mag[j * nx + i] = Math.hypot(re, im);
        ph[j * nx + i] = Math.atan2(im, re);
      }
    }
    const nOpen = (open1 ? 1 : 0) + (open2 ? 1 : 0);
    const ref = (nOpen * 5 * 1.1) / Math.sqrt(Math.max(40, xs - xb));
    return { nx, ny, mag, ph, ref };
  }, [geom, xs, xb, H, open1, open2]);

  // Screen intensity: coherent for waves/quantum particles, incoherent for bullets.
  const intensity = useMemo(() => screenIntensity(geom, xs, Math.max(1, Math.round(H)), mode === 'bullets' ? 0 : 1), [geom, xs, H, mode]);
  const sampler = useMemo(() => makeSampler(intensity), [intensity]);
  const binProb = useMemo(() => {
    const p = new Float64Array(BINS);
    let tot = 0;
    for (let y = 0; y < intensity.length; y++) {
      const b = Math.min(BINS - 1, Math.floor((y / intensity.length) * BINS));
      p[b] += intensity[y];
      tot += intensity[y];
    }
    for (let b = 0; b < BINS; b++) p[b] /= tot || 1;
    return p;
  }, [intensity]);

  // particle state
  const dots = useRef<Dot[]>([]);
  const bins = useRef(new Float64Array(BINS));
  const flashes = useRef<{ y: number; t: number; from?: number }[]>([]);
  const acc = useRef(0);
  const plate = useRef<HTMLCanvasElement | null>(null);
  const t = useRef(0);

  const reset = () => {
    dots.current = [];
    bins.current = new Float64Array(BINS);
    flashes.current = [];
    acc.current = 0;
    setCount(0);
    redrawPlate();
  };

  // Changing the physics clears the screen.
  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, lambda, open1, open2, mode, H]);

  const redrawPlate = () => {
    if (!plate.current) plate.current = document.createElement('canvas');
    const pc = plate.current;
    const dpr = window.devicePixelRatio || 1;
    pc.width = Math.round(plateW * dpr);
    pc.height = Math.round(H * dpr);
    const pctx = pc.getContext('2d')!;
    pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pctx.clearRect(0, 0, plateW, H);
    for (const dt of dots.current) drawDot(pctx, dt);
  };
  useEffect(redrawPlate, [H]); // eslint-disable-line react-hooks/exhaustive-deps

  const drawDot = (pctx: CanvasRenderingContext2D, dt: Dot) => {
    pctx.fillStyle = DOT_COLOR[mode];
    pctx.globalAlpha = 0.85;
    pctx.fillRect(2 + dt.x * (plateW - 5), dt.y - 0.7, 1.6, 1.6);
    pctx.globalAlpha = 1;
  };

  const fire = (n: number) => {
    if (!plate.current) redrawPlate();
    const pctx = plate.current!.getContext('2d')!;
    for (let k = 0; k < n; k++) {
      const y = sampler(Math.random);
      const dot = { y, x: Math.random() };
      if (dots.current.length < 60000) dots.current.push(dot);
      drawDot(pctx, dot);
      const b = Math.min(BINS - 1, Math.max(0, Math.floor((y / H) * BINS)));
      bins.current[b]++;
      if (flashes.current.length < 40) {
        let from: number | undefined;
        if (mode === 'bullets') {
          // a bullet came through one definite slit: pick it with the right conditional probability
          const [a, bb] = slitAmplitudes(geom, xs, y);
          const p1 = a.re * a.re + a.im * a.im, p2 = bb.re * bb.re + bb.im * bb.im;
          from = Math.random() * (p1 + p2) < p1 ? cy - d / 2 : cy + d / 2;
        }
        flashes.current.push({ y, t: 0, from });
      }
    }
    setCount((c) => c + n);
  };

  useAnimationFrame((dt) => {
    t.current += dt;
    if (particle && running) {
      acc.current += 10 ** rate * dt;
      const n = Math.min(400, Math.floor(acc.current));
      if (n > 0) {
        acc.current -= n;
        fire(n);
      }
    }
    for (const f of flashes.current) f.t += dt;
    flashes.current = flashes.current.filter((f) => f.t < 0.5);
    draw();
  }, inView);

  // offscreen image for the field
  const img = useRef<{ c: HTMLCanvasElement; data: ImageData } | null>(null);

  const draw = () => {
    const ctx = getCtx();
    if (!ctx) return;
    const time = t.current;
    const omega = 2 * Math.PI * 0.9;
    const k = (2 * Math.PI) / lambda;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(0, 0, W, H);

    const waveVisible = mode === 'water' || mode === 'light' || ((mode === 'photons' || mode === 'electrons') && showWave);
    const dim = mode === 'photons' || mode === 'electrons' ? 0.55 : 1;

    // incoming plane wave
    if (mode === 'water' || mode === 'light' || waveVisible) {
      for (let x = 0; x < xb; x += 3) {
        const phase = k * (x - xb) - omega * time;
        if (mode === 'water') {
          const v = Math.cos(phase);
          const l = 0.25 + 0.25 * v;
          ctx.fillStyle = `rgb(${Math.round(30 + 120 * l)},${Math.round(80 + 140 * l)},${Math.round(140 + 115 * l)})`;
        } else {
          const [r, g, b] = phaseRGB(phase, 0.85 * dim);
          ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
        }
        ctx.fillRect(x, 0, 3, H);
      }
    }

    // field behind the barrier
    if (waveVisible) {
      const { nx, ny, mag, ph, ref } = field;
      if (!img.current || img.current.data.width !== nx || img.current.data.height !== ny) {
        const c = document.createElement('canvas');
        c.width = nx;
        c.height = ny;
        img.current = { c, data: new ImageData(nx, ny) };
      }
      const data = img.current.data.data;
      for (let idx = 0; idx < nx * ny; idx++) {
        const m = mag[idx] / ref;
        const p = ph[idx] - omega * time;
        let r: number, g: number, b: number;
        if (mode === 'water') {
          const v = Math.tanh(m * 0.9) * Math.cos(p); // signed height
          const l = 0.5 + 0.5 * v;
          r = 10 + 150 * l * l;
          g = 30 + 190 * l;
          b = 60 + 195 * l;
        } else {
          const bright = Math.tanh(m * m * 0.9) * dim;
          [r, g, b] = phaseRGB(p, bright);
        }
        const o = idx * 4;
        data[o] = r;
        data[o + 1] = g;
        data[o + 2] = b;
        data[o + 3] = 255;
      }
      const ictx = img.current.c.getContext('2d')!;
      ictx.putImageData(img.current.data, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img.current.c, xb, 0, nx * CELL, ny * CELL);
    }

    // source
    if (particle) {
      ctx.fillStyle = '#1d2230';
      ctx.fillRect(8, cy - 18, 30, 36);
      ctx.strokeStyle = '#3a4256';
      ctx.strokeRect(8, cy - 18, 30, 36);
      ctx.fillStyle = DOT_COLOR[mode];
      ctx.globalAlpha = 0.4 + 0.6 * Math.max(0, ...flashes.current.map((f) => 1 - f.t / 0.15));
      ctx.beginPath();
      ctx.arc(38, cy, 4, 0, 2 * Math.PI);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#6b7385';
      ctx.font = '11px system-ui';
      ctx.fillText(mode === 'bullets' ? 'gun' : 'source', 8, cy + 32);
    }

    // bullet tracers (classical particles have definite trajectories)
    if (mode === 'bullets') {
      for (const f of flashes.current) {
        if (f.from === undefined) continue;
        const a = 1 - f.t / 0.5;
        ctx.strokeStyle = `rgba(240,172,95,${0.35 * a})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(38, cy);
        ctx.lineTo(xb, f.from);
        ctx.lineTo(xs, f.y);
        ctx.stroke();
      }
    }

    // barrier with slits
    ctx.fillStyle = '#566078';
    const slitTop = (s: number) => cy + (s === 0 ? -d / 2 : d / 2) - geom.a / 2;
    const segs: [number, number][] = [];
    let yCur = 0;
    for (const s of [0, 1]) {
      const y0 = slitTop(s);
      segs.push([yCur, y0]);
      yCur = y0 + geom.a;
    }
    segs.push([yCur, H]);
    for (const [y0, y1] of segs) ctx.fillRect(xb - 3, y0, 6, Math.max(0, y1 - y0));
    for (const s of [0, 1]) {
      const isOpen = s === 0 ? open1 : open2;
      if (!isOpen) {
        ctx.fillStyle = '#fc6255';
        ctx.fillRect(xb - 4, slitTop(s) - 1, 8, geom.a + 2);
        ctx.fillStyle = '#566078';
      }
    }

    // screen / plate
    ctx.fillStyle = '#05070b';
    ctx.fillRect(xs, 0, plateW, H);
    ctx.strokeStyle = '#2a3142';
    ctx.strokeRect(xs + 0.5, 0.5, plateW - 1, H - 1);
    let Imax = 0;
    for (let y = 0; y < intensity.length; y++) Imax = Math.max(Imax, intensity[y]);
    if (!particle) {
      for (let y = 0; y < H; y++) {
        const v = intensity[Math.min(intensity.length - 1, y)] / (Imax || 1);
        if (mode === 'water') ctx.fillStyle = `rgba(120,220,255,${v})`;
        else ctx.fillStyle = `rgba(255,236,150,${v})`;
        ctx.fillRect(xs + 1, y, plateW - 2, 1);
      }
    } else if (plate.current) {
      ctx.drawImage(plate.current, xs, 0, plateW, H);
    }
    // fresh hits flash
    for (const f of flashes.current) {
      const a = 1 - f.t / 0.5;
      ctx.strokeStyle = `rgba(255,255,255,${a})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(xs + plateW / 2, f.y, 3 + 10 * f.t, 0, 2 * Math.PI);
      ctx.stroke();
    }

    // histogram / intensity plot
    const hw = hx1 - hx0;
    ctx.strokeStyle = '#2a3142';
    ctx.beginPath();
    ctx.moveTo(hx0, 0);
    ctx.lineTo(hx0, H);
    ctx.stroke();
    const N = dots.current.length ? bins.current.reduce((s, v) => s + v, 0) : 0;
    let pmax = 0;
    for (let b = 0; b < BINS; b++) pmax = Math.max(pmax, binProb[b]);
    if (particle) {
      let cmax = 0;
      for (let b = 0; b < BINS; b++) cmax = Math.max(cmax, bins.current[b]);
      const scaleMax = Math.max(cmax, showTheory ? N * pmax : 0, 1);
      const bh = H / BINS;
      for (let b = 0; b < BINS; b++) {
        const len = (bins.current[b] / scaleMax) * hw;
        ctx.fillStyle = DOT_COLOR[mode];
        ctx.globalAlpha = 0.75;
        ctx.fillRect(hx0, b * bh + 0.5, len, Math.max(1, bh - 1));
      }
      ctx.globalAlpha = 1;
      if (showTheory && N > 0) {
        ctx.strokeStyle = '#fc6255';
        ctx.lineWidth = 1.6;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        for (let b = 0; b < BINS; b++) {
          const x = hx0 + ((N * binProb[b]) / scaleMax) * hw;
          const y = (b + 0.5) * bh;
          if (b === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
    } else {
      ctx.beginPath();
      ctx.moveTo(hx0, 0);
      for (let y = 0; y < H; y += 2) {
        const v = intensity[Math.min(intensity.length - 1, y)] / (Imax || 1);
        ctx.lineTo(hx0 + v * hw, y);
      }
      ctx.lineTo(hx0, H);
      ctx.closePath();
      ctx.fillStyle = mode === 'water' ? 'rgba(88,196,221,0.35)' : 'rgba(252,211,77,0.35)';
      ctx.fill();
      ctx.strokeStyle = mode === 'water' ? '#58c4dd' : '#fcd34d';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // labels
    ctx.fillStyle = '#9aa3b5';
    ctx.font = '11px system-ui';
    ctx.fillText(particle ? `hits: ${N}` : mode === 'water' ? 'wave height²' : 'intensity', hx0 + 4, 14);
    ctx.fillText('screen', xs - 2, H - 6);
  };

  const fmtRate = (v: number) => {
    const r = 10 ** v;
    return r < 10 ? `${r.toFixed(1)}/s` : `${Math.round(r)}/s`;
  };

  return (
    <Widget title={title}>
      {modes.length > 1 && (
        <div style={{ marginBottom: 10 }}>
          <Segmented options={modes.map((m) => ({ value: m, label: MODE_LABEL[m] }))} value={mode} onChange={setMode} />
        </div>
      )}
      <div style={{ width: '100%', minWidth: 0 }}>
        <canvas ref={ref} style={{ display: 'block', borderRadius: 10, border: '1px solid var(--border)' }} />
      </div>
      <div className="faint" style={{ fontSize: '0.85rem', margin: '8px 0 10px' }}>
        {MODE_BLURB[mode]}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '6px 18px' }}>
        <Slider label="slit spacing" value={d} min={30} max={130} step={1} onChange={setD} format={(v) => `${v.toFixed(0)} px`} />
        <Slider
          label={mode === 'electrons' ? 'λ (via momentum)' : 'wavelength λ'}
          value={lambda}
          min={8}
          max={34}
          step={0.5}
          onChange={setLambda}
          format={(v) => `${v.toFixed(1)} px`}
        />
        {particle && <Slider label="arrival rate" value={rate} min={0} max={3.3} step={0.05} onChange={setRate} format={fmtRate} />}
      </div>
      <div className="row" style={{ gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
        <Toggle label="slit 1 open" value={open1} onChange={setOpen1} />
        <Toggle label="slit 2 open" value={open2} onChange={setOpen2} />
        {(mode === 'photons' || mode === 'electrons') && <Toggle label="show the (unobservable) amplitude" value={showWave} onChange={setShowWave} />}
        {particle && <Toggle label="overlay prediction |ψ|²" value={showTheory} onChange={setShowTheory} />}
        {particle && (
          <>
            <button className="btn small" onClick={() => setRunning((r) => !r)}>
              {running ? '⏸ Pause' : '▶ Run'}
            </button>
            <button className="btn small" onClick={() => fire(1)}>
              Fire one
            </button>
            <button className="btn small ghost" onClick={reset}>
              Clear screen
            </button>
            <span className="faint mono" style={{ fontSize: '0.85rem' }}>
              {count} hits
            </span>
          </>
        )}
      </div>
    </Widget>
  );
}
