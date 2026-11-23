import React, { useMemo, useRef, useState } from 'react';
import { Widget, Slider, Segmented, Toggle, Tex } from '../../../components/ui';
import { useLiveCanvas } from './useLiveCanvas';
import { PHASE_LUT, phaseIndex } from './colors';

type Shape = 'packet' | 'cat' | 'standing';
const XMIN = -10, XMAX = 10;

function psiFn(shape: Shape, k: number, sigma: number): (x: number) => [number, number] {
  if (shape === 'packet') {
    return (x) => {
      const e = Math.exp(-(x * x) / (4 * sigma * sigma));
      return [e * Math.cos(k * x), e * Math.sin(k * x)];
    };
  }
  if (shape === 'cat') {
    // two humps; the right one carries an extra phase k·(something) — relative phase set by k
    return (x) => {
      const a = Math.exp(-((x + 4) ** 2) / (4 * sigma * sigma * 0.25));
      const b = Math.exp(-((x - 4) ** 2) / (4 * sigma * sigma * 0.25));
      const ph = k * 0.8;
      return [a + b * Math.cos(ph), b * Math.sin(ph)];
    };
  }
  // standing wave in a box [-8, 8], n set by k
  const n = Math.max(1, Math.round(Math.abs(k) * 2) + 1);
  return (x) => (Math.abs(x) > 8 ? [0, 0] : [Math.sin((n * Math.PI * (x + 8)) / 16), 0]);
}

/** Normalised samples of ψ on M points of [XMIN, XMAX]. */
function sample(f: (x: number) => [number, number], M: number) {
  const dx = (XMAX - XMIN) / M;
  const re = new Float64Array(M), im = new Float64Array(M), xs = new Float64Array(M);
  let n = 0;
  for (let i = 0; i < M; i++) {
    const x = XMIN + (i + 0.5) * dx;
    const [r, j] = f(x);
    xs[i] = x;
    re[i] = r;
    im[i] = j;
    n += r * r + j * j;
  }
  return { re, im, xs, dx, n };
}

/**
 * From discrete amplitudes to a continuous wavefunction.
 *  - "bins" view: N sites with probabilities |c_j|² (optionally divided by Δx → density).
 *  - "helix" view: ψ(x) drawn in 3D (x, Re, Im), rotatable — phase is the angle around the axis.
 */
export function WavefunctionBuilder() {
  const [mode, setMode] = useState<'bins' | 'helix'>('bins');
  const [shape, setShape] = useState<Shape>('packet');
  const [logN, setLogN] = useState(3);
  const [k, setK] = useState(1.5);
  const [sigma, setSigma] = useState(2);
  const [density, setDensity] = useState(false);
  const [range, setRange] = useState<[number, number]>([-2, 3]);
  const [alpha, setAlpha] = useState(0.5);
  const [spin, setSpin] = useState(false);
  const alphaRef = useRef(alpha);
  alphaRef.current = alpha;
  const spinA = useRef(alpha);
  const N = Math.round(Math.pow(2, logN + 1)); // 4 .. 256

  const f = useMemo(() => psiFn(shape, k, sigma), [shape, k, sigma]);
  const fine = useMemo(() => {
    const s = sample(f, 800);
    const norm = Math.sqrt(s.n * s.dx);
    for (let i = 0; i < 800; i++) {
      s.re[i] /= norm;
      s.im[i] /= norm;
    }
    return s;
  }, [f]);
  const bins = useMemo(() => {
    const s = sample(f, N);
    const norm = Math.sqrt(s.n);
    for (let i = 0; i < N; i++) {
      s.re[i] /= norm;
      s.im[i] /= norm;
    }
    return s;
  }, [f, N]);

  const pBins = useMemo(() => {
    let p = 0;
    for (let i = 0; i < N; i++) if (bins.xs[i] >= range[0] && bins.xs[i] < range[1]) p += bins.re[i] ** 2 + bins.im[i] ** 2;
    return p;
  }, [bins, range, N]);
  const pExact = useMemo(() => {
    let p = 0;
    for (let i = 0; i < 800; i++) if (fine.xs[i] >= range[0] && fine.xs[i] < range[1]) p += (fine.re[i] ** 2 + fine.im[i] ** 2) * fine.dx;
    return p;
  }, [fine, range]);

  const drag = useRef<0 | 1 | null>(null);

  const ref = useLiveCanvas(
    (ctx, w, h, dt) => {
      ctx.clearRect(0, 0, w, h);
      const padL = 14, padR = 14;
      const X = (x: number) => padL + ((x - XMIN) / (XMAX - XMIN)) * (w - padL - padR);
      if (mode === 'bins') {
        const top = 18, base = h - 26;
        // y scale
        let maxDen = 0;
        for (let i = 0; i < 800; i++) maxDen = Math.max(maxDen, fine.re[i] ** 2 + fine.im[i] ** 2);
        let maxBin = 0;
        for (let i = 0; i < N; i++) maxBin = Math.max(maxBin, bins.re[i] ** 2 + bins.im[i] ** 2);
        const yMax = density ? maxDen * 1.15 : Math.max(maxBin * 1.15, 1e-6);
        const Y = (v: number) => base - (v / yMax) * (base - top);
        // probability window
        ctx.fillStyle = 'rgba(252,211,77,0.08)';
        ctx.fillRect(X(range[0]), top - 8, X(range[1]) - X(range[0]), base - top + 8);
        for (const [j, xv] of range.entries()) {
          ctx.strokeStyle = '#fcd34d';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(X(xv), top - 8);
          ctx.lineTo(X(xv), base);
          ctx.stroke();
          ctx.fillStyle = '#fcd34d';
          ctx.beginPath();
          ctx.arc(X(xv), top - 6, 6, 0, 2 * Math.PI);
          ctx.fill();
          ctx.fillStyle = '#0b0d12';
          ctx.font = 'bold 9px Segoe UI';
          ctx.fillText(j === 0 ? 'a' : 'b', X(xv) - 3, top - 3);
        }
        // bars
        const bw = (X(XMAX) - X(XMIN)) / N;
        for (let i = 0; i < N; i++) {
          const p = bins.re[i] ** 2 + bins.im[i] ** 2;
          const v = density ? p / bins.dx : p;
          const ph = Math.atan2(bins.im[i], bins.re[i]);
          ctx.fillStyle = PHASE_LUT[phaseIndex(ph)];
          ctx.globalAlpha = 0.85;
          const y = Y(v);
          ctx.fillRect(X(bins.xs[i]) - bw * 0.42, y, Math.max(1, bw * 0.84), base - y);
          ctx.globalAlpha = 1;
          if (N <= 16) {
            // small phasor on top of each bar
            const R = Math.min(12, bw * 0.35);
            const cx = X(bins.xs[i]), cy = y - R - 4;
            const mag = Math.sqrt(p / maxBin);
            ctx.strokeStyle = '#3a4256';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(cx, cy, R, 0, 2 * Math.PI);
            ctx.stroke();
            ctx.strokeStyle = PHASE_LUT[phaseIndex(ph)];
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + R * mag * Math.cos(ph), cy - R * mag * Math.sin(ph));
            ctx.stroke();
          }
        }
        // continuous density overlay
        if (density) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          for (let i = 0; i < 800; i++) {
            const y = Y(fine.re[i] ** 2 + fine.im[i] ** 2);
            if (i === 0) ctx.moveTo(X(fine.xs[i]), y);
            else ctx.lineTo(X(fine.xs[i]), y);
          }
          ctx.stroke();
        }
        ctx.strokeStyle = '#2a3142';
        ctx.beginPath();
        ctx.moveTo(padL, base);
        ctx.lineTo(w - padR, base);
        ctx.stroke();
        ctx.fillStyle = '#6b7385';
        ctx.font = '10px Segoe UI';
        for (let xt = -10; xt <= 10; xt += 2) ctx.fillText(String(xt), X(xt) - 4, h - 10);
        ctx.fillStyle = '#9aa3b5';
        ctx.font = '11px Segoe UI';
        ctx.fillText(density ? 'height = |c_j|² / Δx   (white: |ψ(x)|²)' : 'height = |c_j|²  (probability of each site)', padL + 4, 12);
      } else {
        // helix view
        if (spin) {
          spinA.current += dt * 0.7;
        } else spinA.current = alphaRef.current;
        const a = spinA.current;
        const cx = w / 2, mid = h / 2 + 6;
        let amax = 0;
        for (let i = 0; i < 800; i++) amax = Math.max(amax, Math.hypot(fine.re[i], fine.im[i]));
        const A = (h * 0.36) / (amax || 1);
        const yaw = 0.42;
        const P = (x: number, re: number, im: number): [number, number] => {
          // rotate the view about the x axis by a: vertical = re cos a + im sin a
          const vert = re * Math.cos(a) + im * Math.sin(a);
          const dep = -re * Math.sin(a) + im * Math.cos(a);
          const px = X(x);
          return [cx + (px - cx) * Math.cos(yaw) * 1.0 + dep * A * Math.sin(yaw) * 0.9, mid - vert * A + dep * A * 0.18];
        };
        // axes
        ctx.strokeStyle = '#3a4256';
        ctx.lineWidth = 1;
        let [ax0, ay0] = P(XMIN, 0, 0);
        let [ax1, ay1] = P(XMAX, 0, 0);
        ctx.beginPath();
        ctx.moveTo(ax0, ay0);
        ctx.lineTo(ax1, ay1);
        ctx.stroke();
        // Re and Im axis markers at the left end
        const [rx, ry] = P(XMIN, amax, 0);
        const [ix, iy] = P(XMIN, 0, amax);
        ctx.strokeStyle = '#58c4dd';
        ctx.beginPath();
        ctx.moveTo(ax0, ay0);
        ctx.lineTo(rx, ry);
        ctx.stroke();
        ctx.strokeStyle = '#e07ab6';
        ctx.beginPath();
        ctx.moveTo(ax0, ay0);
        ctx.lineTo(ix, iy);
        ctx.stroke();
        ctx.font = '11px Segoe UI';
        ctx.fillStyle = '#58c4dd';
        ctx.fillText('Re', rx + 3, ry);
        ctx.fillStyle = '#e07ab6';
        ctx.fillText('Im', ix + 3, iy);
        // stems
        for (let i = 0; i < 800; i += 8) {
          const re = fine.re[i], im = fine.im[i];
          if (Math.hypot(re, im) < amax * 0.03) continue;
          const [p0x, p0y] = P(fine.xs[i], 0, 0);
          const [p1x, p1y] = P(fine.xs[i], re, im);
          ctx.strokeStyle = PHASE_LUT[phaseIndex(Math.atan2(im, re))];
          ctx.globalAlpha = 0.45;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(p0x, p0y);
          ctx.lineTo(p1x, p1y);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // curve
        ctx.lineWidth = 2.6;
        for (let i = 1; i < 800; i++) {
          const [p0x, p0y] = P(fine.xs[i - 1], fine.re[i - 1], fine.im[i - 1]);
          const [p1x, p1y] = P(fine.xs[i], fine.re[i], fine.im[i]);
          ctx.strokeStyle = PHASE_LUT[phaseIndex(Math.atan2(fine.im[i], fine.re[i]))];
          ctx.beginPath();
          ctx.moveTo(p0x, p0y);
          ctx.lineTo(p1x, p1y);
          ctx.stroke();
        }
        ctx.fillStyle = '#9aa3b5';
        ctx.font = '11px Segoe UI';
        const deg = ((((a * 180) / Math.PI) % 360) + 360) % 360;
        ctx.fillText(`view angle ${deg.toFixed(0)}°  — ${deg < 10 || deg > 350 ? 'looking at Re ψ' : Math.abs(deg - 90) < 10 ? 'looking at Im ψ' : Math.abs(deg - 270) < 10 ? 'looking at −Im ψ' : Math.abs(deg - 180) < 10 ? 'looking at −Re ψ' : 'a mix of Re and Im'}`, 12, 14);
        void ax1;
        void ay1;
      }
    },
    { height: 280, running: mode === 'helix' && spin },
    [mode, fine, bins, density, range, alpha, spin, N],
  );

  const onPointer = (e: React.PointerEvent<HTMLCanvasElement>, kind: 'down' | 'move' | 'up') => {
    if (mode !== 'bins') return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = XMIN + ((e.clientX - r.left - 14) / (r.width - 28)) * (XMAX - XMIN);
    if (kind === 'down') {
      drag.current = Math.abs(x - range[0]) < Math.abs(x - range[1]) ? 0 : 1;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (kind === 'up') {
      drag.current = null;
      return;
    }
    if (drag.current === null) return;
    const xv = Math.max(XMIN, Math.min(XMAX, Math.round(x * 4) / 4));
    setRange((rg) => {
      const n: [number, number] = [...rg] as [number, number];
      n[drag.current!] = xv;
      return n[0] <= n[1] ? n : [n[1], n[0]];
    });
  };

  return (
    <Widget title="From amplitudes to a wavefunction">
      <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <Segmented
          options={[
            { value: 'bins', label: 'discrete → continuous' },
            { value: 'helix', label: '3D helix' },
          ]}
          value={mode}
          onChange={setMode}
        />
        <Segmented
          options={[
            { value: 'packet', label: 'wave packet' },
            { value: 'cat', label: 'two humps' },
            { value: 'standing', label: 'standing wave' },
          ]}
          value={shape}
          onChange={setShape}
        />
      </div>
      <div className="canvas-wrap">
        <canvas
          ref={ref}
          style={{ cursor: mode === 'bins' ? 'ew-resize' : undefined, touchAction: 'none' }}
          onPointerDown={(e) => onPointer(e, 'down')}
          onPointerMove={(e) => onPointer(e, 'move')}
          onPointerUp={(e) => onPointer(e, 'up')}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '2px 18px', marginTop: 6 }}>
        {mode === 'bins' && <Slider label="number of sites N" value={logN} min={1} max={7} step={1} onChange={setLogN} format={() => String(N)} />}
        <Slider label={shape === 'standing' ? 'mode number' : shape === 'cat' ? 'relative phase' : <span>phase winding <Tex>{'k'}</Tex></span>} value={k} min={0} max={4} step={0.05} onChange={setK} format={(v) => (shape === 'standing' ? String(Math.max(1, Math.round(Math.abs(v) * 2) + 1)) : shape === 'cat' ? `${((v * 0.8 * 180) / Math.PI).toFixed(0)}°` : v.toFixed(2))} />
        {shape !== 'standing' && <Slider label={<span>width <Tex>{'\\sigma'}</Tex></span>} value={sigma} min={0.6} max={4} step={0.05} onChange={setSigma} format={(v) => v.toFixed(2)} />}
        {mode === 'helix' && <Slider label="rotate view" value={alpha} min={0} max={2 * Math.PI} step={0.01} onChange={setAlpha} format={(v) => `${((v * 180) / Math.PI).toFixed(0)}°`} />}
      </div>
      <div className="row" style={{ gap: 16, flexWrap: 'wrap', marginTop: 6, fontSize: '0.88rem' }}>
        {mode === 'bins' ? (
          <>
            <Toggle label="divide by Δx (probability density)" value={density} onChange={setDensity} />
            <span className="mono">
              <span style={{ color: 'var(--yellow)' }}>
                P(a ≤ x &lt; b): sum of bins = {pBins.toFixed(3)} · ∫|ψ|²dx = {pExact.toFixed(3)}
              </span>
            </span>
            <span className="faint">Drag the yellow handles.</span>
          </>
        ) : (
          <Toggle label="auto-rotate" value={spin} onChange={setSpin} />
        )}
      </div>
    </Widget>
  );
}
