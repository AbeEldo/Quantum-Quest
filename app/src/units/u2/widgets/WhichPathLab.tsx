import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Widget, Slider, useAnimationFrame } from '../../../components/ui';
import { c, expi, scale, add, abs2, type C } from '../../../engine/complex';
import { PhasorClock } from '../../../widgets/AmplitudeView';
import { makeSampler, visibilityFromD } from './optics';
import { useSizedCanvas, useInView } from './canvas';

const BINS = 120;
const S = 0.42; // range of sinθ shown
const D_OVER_L = 9; // slit spacing / wavelength
const A_OVER_L = 1.4; // slit width / wavelength

/** single-slit amplitudes at screen coordinate s = sinθ (Fraunhofer) */
function amps(s: number): [C, C] {
  const beta = Math.PI * A_OVER_L * s;
  const env = Math.abs(beta) < 1e-9 ? 1 : Math.sin(beta) / beta;
  const half = Math.PI * D_OVER_L * s; // half the phase difference
  return [scale(expi(-half), env * Math.SQRT1_2), scale(expi(half), env * Math.SQRT1_2)];
}

function intensity(s: number, V: number) {
  const [a, b] = amps(s);
  return abs2(a) + abs2(b) + 2 * V * (a.re * b.re + a.im * b.im);
}

/**
 * Two-slit pattern with a tunable which-path detector.
 * D = distinguishability of the two paths, V = fringe visibility, pure marker states: V² + D² = 1.
 */
export function WhichPathLab() {
  const [D, setD] = useState(0);
  const [rate, setRate] = useState(2.2);
  const [sel, setSel] = useState(0.0);
  const [count, setCount] = useState(0);
  const V = visibilityFromD(D);
  const { ref, w: W, h: H, getCtx } = useSizedCanvas({ height: 230 });
  const inView = useInView(ref);

  const plateH = 64;
  const curve = useMemo(() => {
    const arr = new Float64Array(BINS);
    for (let i = 0; i < BINS; i++) arr[i] = intensity(-S + ((i + 0.5) / BINS) * 2 * S, V);
    return arr;
  }, [V]);
  const sampler = useMemo(() => makeSampler(curve), [curve]);
  const pTot = useMemo(() => curve.reduce((s, v) => s + v, 0), [curve]);

  const hits = useRef<number[]>([]);
  const bins = useRef(new Float64Array(BINS));
  const acc = useRef(0);
  const fresh = useRef<{ x: number; t: number }[]>([]);

  useEffect(() => {
    hits.current = [];
    bins.current = new Float64Array(BINS);
    fresh.current = [];
    setCount(0);
  }, [D]);

  useAnimationFrame((dt) => {
    acc.current += 10 ** rate * dt;
    const n = Math.min(300, Math.floor(acc.current));
    acc.current -= n;
    for (let k = 0; k < n; k++) {
      const f = sampler(Math.random) / BINS; // 0..1
      if (hits.current.length < 30000) hits.current.push(f);
      bins.current[Math.min(BINS - 1, Math.floor(f * BINS))]++;
      if (fresh.current.length < 30) fresh.current.push({ x: f, t: 0 });
    }
    if (n) setCount((c) => c + n);
    fresh.current.forEach((f) => (f.t += dt));
    fresh.current = fresh.current.filter((f) => f.t < 0.4);
    draw();
  }, inView);

  const draw = () => {
    const ctx = getCtx();
    if (!ctx) return;
    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(0, 0, W, H);
    // photographic plate
    ctx.fillStyle = '#05070b';
    ctx.fillRect(0, 0, W, plateH);
    ctx.fillStyle = '#fff3b0';
    ctx.globalAlpha = 0.7;
    const hs = hits.current;
    for (let i = 0; i < hs.length; i++) {
      // deterministic pseudo-random vertical jitter per hit
      const jy = ((i * 2654435761) % 1000) / 1000;
      ctx.fillRect(hs[i] * W, 4 + jy * (plateH - 8), 1.4, 1.4);
    }
    ctx.globalAlpha = 1;
    for (const f of fresh.current) {
      ctx.strokeStyle = `rgba(255,255,255,${1 - f.t / 0.4})`;
      ctx.beginPath();
      ctx.arc(f.x * W, plateH / 2, 3 + 14 * f.t, 0, 2 * Math.PI);
      ctx.stroke();
    }
    // histogram
    const y0 = plateH + 12, y1 = H - 18, hh = y1 - y0;
    const N = hs.length;
    let cmax = 0;
    for (let b = 0; b < BINS; b++) cmax = Math.max(cmax, bins.current[b]);
    let pmax = 0;
    for (let b = 0; b < BINS; b++) pmax = Math.max(pmax, intensity(-S + ((b + 0.5) / BINS) * 2 * S, 1));
    // scale so that the fully-coherent curve's peak sits at the top
    const expPeak = (N * pmax) / pTot;
    const scaleMax = Math.max(cmax, expPeak, 1);
    const bw = W / BINS;
    for (let b = 0; b < BINS; b++) {
      const h = (bins.current[b] / scaleMax) * hh;
      ctx.fillStyle = 'rgba(252,211,77,0.55)';
      ctx.fillRect(b * bw + 0.5, y1 - h, Math.max(1, bw - 1), h);
    }
    // theory curves
    const line = (Vv: number, color: string, dash: number[]) => {
      ctx.strokeStyle = color;
      ctx.setLineDash(dash);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i <= 300; i++) {
        const f = i / 300;
        const s = -S + f * 2 * S;
        const v = N > 0 ? (N * intensity(s, Vv)) / pTot / scaleMax : intensity(s, Vv) / pmax;
        const y = y1 - v * hh;
        if (i === 0) ctx.moveTo(f * W, y);
        else ctx.lineTo(f * W, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };
    line(1, 'rgba(88,196,221,0.35)', [3, 4]);
    line(0, 'rgba(224,122,182,0.45)', [3, 4]);
    line(V, '#fc6255', []);
    // selected point
    const sx = ((sel + S) / (2 * S)) * W;
    ctx.strokeStyle = '#83c167';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, y1);
    ctx.stroke();
    ctx.fillStyle = '#9aa3b5';
    ctx.font = '11px system-ui';
    ctx.fillText(`${N} photons`, 6, H - 4);
    ctx.fillStyle = 'rgba(88,196,221,0.8)';
    ctx.fillText('- - no detector (V=1)', W - 270, H - 4);
    ctx.fillStyle = 'rgba(224,122,182,0.9)';
    ctx.fillText('- - perfect detector (V=0)', W - 150, H - 4);
  };

  const onPick = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const f = (e.clientX - r.left) / r.width;
    setSel(-S + f * 2 * S);
  };

  // amplitudes at the selected point
  const [a1, a2] = amps(sel);
  const coh = add(a1, a2);
  const pAmp = abs2(coh), pProb = abs2(a1) + abs2(a2), pNow = intensity(sel, V);
  const maxR = 1.0;

  // detector-state fan & V–D circle
  const alpha = Math.acos(Math.min(1, V)); // angle between marker states
  const fan = 70;

  return (
    <Widget title="Which-path detector at the slits">
      <div style={{ width: '100%', minWidth: 0 }}>
        <canvas ref={ref} onPointerDown={onPick} style={{ display: 'block', borderRadius: 10, border: '1px solid var(--border)', cursor: 'crosshair' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16, marginTop: 12 }}>
        <div className="col" style={{ gap: 8 }}>
          <Slider label="which-path info D" value={D} min={0} max={1} step={0.01} onChange={setD} format={(v) => v.toFixed(2)} />
          <Slider label="photons/s" value={rate} min={0.5} max={3.2} step={0.05} onChange={setRate} format={(v) => `${Math.round(10 ** v)}`} />
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <button className="btn small" onClick={() => setD(0)}>Detector off</button>
            <button className="btn small" onClick={() => setD(0.6)}>Weak detector</button>
            <button className="btn small" onClick={() => setD(1)}>Perfect detector</button>
          </div>
          <div className="row" style={{ gap: 18 }}>
            <span>
              Visibility <b style={{ color: 'var(--red)' }}>V = {V.toFixed(2)}</b>
            </span>
            <span>
              <b style={{ color: 'var(--pink)' }}>D = {D.toFixed(2)}</b>
            </span>
            <span className="mono faint">V²+D² = {(V * V + D * D).toFixed(2)}</span>
          </div>
        </div>
        <div className="row" style={{ gap: 14, justifyContent: 'center' }}>
          <svg width={150} height={130} viewBox="-10 -110 150 130">
            <text x={0} y={-96} fill="var(--text-dim)" fontSize={11}>detector states</text>
            <line x1={0} y1={0} x2={fan} y2={0} stroke="var(--blue)" strokeWidth={2.5} />
            <line x1={0} y1={0} x2={fan * Math.cos(alpha)} y2={-fan * Math.sin(alpha)} stroke="var(--pink)" strokeWidth={2.5} />
            <text x={fan + 4} y={4} fill="var(--blue)" fontSize={12}>|d₁⟩</text>
            <text x={fan * Math.cos(alpha) + 4} y={-fan * Math.sin(alpha) - 2} fill="var(--pink)" fontSize={12}>|d₂⟩</text>
            <path d={`M ${22} 0 A 22 22 0 0 0 ${22 * Math.cos(alpha)} ${-22 * Math.sin(alpha)}`} fill="none" stroke="var(--text-faint)" />
            <text x={4} y={14} fill="var(--text-faint)" fontSize={10}>
              overlap ⟨d₁|d₂⟩ = {V.toFixed(2)}
            </text>
          </svg>
          <svg width={120} height={130} viewBox="-14 -112 124 130">
            <text x={0} y={-98} fill="var(--text-dim)" fontSize={11}>V² + D² ≤ 1</text>
            <path d="M 0 -90 A 90 90 0 0 1 90 0" fill="none" stroke="var(--text-faint)" strokeDasharray="3 3" />
            <line x1={0} y1={0} x2={95} y2={0} stroke="var(--border)" />
            <line x1={0} y1={0} x2={0} y2={-95} stroke="var(--border)" />
            <text x={92} y={12} fill="var(--pink)" fontSize={11}>D</text>
            <text x={-12} y={-86} fill="var(--red)" fontSize={11}>V</text>
            <circle cx={D * 90} cy={-V * 90} r={5} fill="var(--yellow)" />
          </svg>
        </div>
        <div className="col" style={{ gap: 6 }}>
          <div className="faint" style={{ fontSize: '0.82rem' }}>At the green line (click the pattern to move it):</div>
          <div className="row" style={{ gap: 10 }}>
            <div className="col center" style={{ gap: 2, alignItems: 'center' }}>
              <PhasorClock z={a1} size={46} maxR={maxR} />
              <span className="faint" style={{ fontSize: '0.75rem' }}>via slit 1</span>
            </div>
            <span className="dim">+</span>
            <div className="col center" style={{ gap: 2, alignItems: 'center' }}>
              <PhasorClock z={a2} size={46} maxR={maxR} />
              <span className="faint" style={{ fontSize: '0.75rem' }}>via slit 2</span>
            </div>
            <span className="dim">=</span>
            <div className="col center" style={{ gap: 2, alignItems: 'center' }}>
              <PhasorClock z={coh} size={46} maxR={maxR * 1.42} />
              <span className="faint" style={{ fontSize: '0.75rem' }}>sum</span>
            </div>
          </div>
          <div className="mono" style={{ fontSize: '0.8rem', lineHeight: 1.5 }}>
            <div>|ψ₁+ψ₂|² = {pAmp.toFixed(3)} <span className="faint">(amplitudes add)</span></div>
            <div>|ψ₁|²+|ψ₂|² = {pProb.toFixed(3)} <span className="faint">(probabilities add)</span></div>
            <div style={{ color: 'var(--red)' }}>actual = {pNow.toFixed(3)}</div>
          </div>
        </div>
      </div>
    </Widget>
  );
}

