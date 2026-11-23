import React, { useEffect, useRef, useState } from 'react';
import { Widget, Slider, Toggle, Tex, Stat, useAnimationFrame } from '../../../components/ui';
import { useWidth } from '../../u0/widgets/common';
import { METALS, photonEV, wavelengthCSS, freqFromNm, h, eC } from '../physics';

interface Electron {
  x: number;
  y: number;
  vx: number;
  vy: number;
  K: number;
}
interface Photon {
  t: number; // 0..1 along the beam
  y0: number;
}

export interface PhotoelectricLabProps {
  /** Show the Millikan "record a point" panel. */
  millikan?: boolean;
  initialNm?: number;
  initialMetal?: number;
  /** Hide the work function readout (for mystery-metal play). */
  hidePhi?: boolean;
}

/** Saturation current in µA (arbitrary but proportional to photon number flux). */
export function saturationCurrent(intensity: number, nm: number) {
  return 2.0 * intensity * (nm / 500);
}
/** Photocurrent (µA) with retarding voltage V (volts; negative = accelerating). Kinetic energies uniform in [0, Kmax]. */
export function photocurrent(intensity: number, nm: number, phi: number, V: number) {
  const K = photonEV(nm) - phi;
  if (K <= 0) return 0;
  const Is = saturationCurrent(intensity, nm);
  if (V <= 0) return Is;
  return Is * Math.max(0, 1 - V / K);
}

export function PhotoelectricLab({ millikan = true, initialNm = 450, initialMetal = 2, hidePhi = false }: PhotoelectricLabProps) {
  const [nm, setNm] = useState(initialNm);
  const [intensity, setIntensity] = useState(0.6);
  const [metal, setMetal] = useState(initialMetal);
  const [V, setV] = useState(0);
  const [points, setPoints] = useState<{ f: number; V: number; zero: boolean }[]>([]);
  const [slow, setSlow] = useState(false);
  const { ref: wrapRef, w } = useWidth<HTMLDivElement>(800);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const electrons = useRef<Electron[]>([]);
  const photons = useRef<Photon[]>([]);
  const spawnAcc = useRef(0);
  const collected = useRef<number[]>([]); // timestamps of arrivals (for the flicker of the meter)
  const tNow = useRef(0);

  const M = METALS[metal];
  const E = photonEV(nm);
  const Kmax = E - M.phi;
  const I = photocurrent(intensity, nm, M.phi, V);
  const H = 300;

  // geometry (CSS px)
  const geo = () => {
    const xe = w * 0.27,
      xc = w * 0.73,
      y0 = 60,
      y1 = 200;
    return { xe, xc, y0, y1, lampX: w * 0.08, lampY: 34 };
  };

  useAnimationFrame((dt0) => {
    const dt = slow ? dt0 * 0.3 : dt0;
    tNow.current += dt;
    const g = geo();
    // spawn photons: number flux ∝ intensity × λ  (fixed power, fewer high-energy photons)
    const rate = 40 * intensity * (nm / 500);
    spawnAcc.current += rate * dt;
    while (spawnAcc.current > 1) {
      spawnAcc.current -= 1;
      if (photons.current.length < 120) photons.current.push({ t: 0, y0: g.y0 + 15 + Math.random() * (g.y1 - g.y0 - 30) });
    }
    // advance photons
    const keep: Photon[] = [];
    for (const p of photons.current) {
      p.t += dt * 1.6;
      if (p.t >= 1) {
        if (Kmax > 0 && electrons.current.length < 220) {
          const K = Math.random() * Kmax;
          const alpha = 26000; // px²/s² per eV
          const v0 = Math.sqrt(alpha * K);
          const ang = (Math.random() - 0.5) * 0.9;
          electrons.current.push({ x: g.xe + 6, y: p.y0, vx: v0 * Math.cos(ang), vy: v0 * Math.sin(ang), K });
        }
      } else keep.push(p);
    }
    photons.current = keep;
    // electrons in a uniform retarding field: a = −α V / (2D) so that they reach the collector iff K > eV
    const D = g.xc - g.xe - 6;
    const ax = (-26000 * V) / (2 * D);
    const alive: Electron[] = [];
    for (const e of electrons.current) {
      e.vx += ax * dt;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      if (e.y < g.y0 + 4 || e.y > g.y1 - 4) e.vy = -e.vy;
      if (e.x >= g.xc - 2) {
        collected.current.push(tNow.current);
        continue;
      }
      if (e.x <= g.xe + 2 && e.vx < 0) continue; // fell back into the emitter
      alive.push(e);
    }
    electrons.current = alive;
    collected.current = collected.current.filter((t) => tNow.current - t < 1);
    draw();
  }, true);

  const draw = () => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(H * dpr);
    }
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, H);
    const g = geo();
    ctx.fillStyle = '#0b0e15';
    ctx.fillRect(0, 0, w, H);
    // glass tube
    ctx.strokeStyle = 'rgba(160,190,220,0.35)';
    ctx.lineWidth = 2;
    roundRect(ctx, w * 0.17, g.y0 - 22, w * 0.66, g.y1 - g.y0 + 44, 40);
    ctx.stroke();
    ctx.fillStyle = 'rgba(120,160,200,0.04)';
    ctx.fill();
    ctx.fillStyle = '#6b7385';
    ctx.font = '11px system-ui';
    ctx.fillText('vacuum', w * 0.47, g.y1 + 14);
    // beam
    const col = wavelengthCSS(nm, 1);
    const beamA = Math.min(0.35, 0.06 + intensity * 0.3);
    ctx.fillStyle = wavelengthCSS(nm, beamA);
    ctx.beginPath();
    ctx.moveTo(g.lampX, g.lampY);
    ctx.lineTo(g.xe, g.y0 + 8);
    ctx.lineTo(g.xe, g.y1 - 8);
    ctx.closePath();
    ctx.fill();
    // lamp
    ctx.beginPath();
    ctx.arc(g.lampX, g.lampY, 14, 0, 2 * Math.PI);
    ctx.fillStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur = 20 * intensity;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#9aa3b5';
    ctx.fillText(nm < 380 ? 'UV lamp' : nm > 750 ? 'IR lamp' : 'lamp', g.lampX - 16, g.lampY + 28);
    // photons as little wave packets
    for (const p of photons.current) {
      const x = g.lampX + (g.xe - g.lampX) * p.t;
      const y = g.lampY + (p.y0 - g.lampY) * p.t;
      const dirx = g.xe - g.lampX,
        diry = p.y0 - g.lampY;
      const L = Math.hypot(dirx, diry);
      const ux = dirx / L,
        uy = diry / L;
      ctx.beginPath();
      const k = (2 * Math.PI) / Math.max(4, nm / 60);
      for (let s = -9; s <= 9; s++) {
        const env = Math.exp(-(s * s) / 30);
        const off = 3.2 * env * Math.sin(k * s);
        const px = x + ux * s - uy * off,
          py = y + uy * s + ux * off;
        if (s === -9) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    // plates
    ctx.fillStyle = M.color;
    ctx.fillRect(g.xe - 8, g.y0, 8, g.y1 - g.y0);
    ctx.fillStyle = '#8b97a8';
    ctx.fillRect(g.xc, g.y0, 8, g.y1 - g.y0);
    ctx.fillStyle = '#cfd6e4';
    ctx.fillText(hidePhi ? 'mystery metal' : `${M.name} (emitter)`, g.xe - 40, g.y0 - 28);
    ctx.fillText('collector', g.xc - 18, g.y0 - 28);
    // field direction hint
    if (Math.abs(V) > 0.05) {
      ctx.fillStyle = V > 0 ? 'rgba(252,98,85,0.8)' : 'rgba(131,193,103,0.8)';
      ctx.fillText(V > 0 ? '← retarding field pushes electrons back' : 'accelerating field →', w * 0.4, g.y0 - 8);
    }
    // electrons
    for (const e of electrons.current) {
      ctx.beginPath();
      ctx.arc(e.x, e.y, 2.8, 0, 2 * Math.PI);
      ctx.fillStyle = '#9fe3ff';
      ctx.shadowColor = '#58c4dd';
      ctx.shadowBlur = 6;
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    // circuit
    const yb = H - 40;
    ctx.strokeStyle = '#4b5672';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(g.xe - 4, g.y1);
    ctx.lineTo(g.xe - 4, yb);
    ctx.lineTo(w * 0.42, yb);
    ctx.moveTo(w * 0.47, yb);
    ctx.lineTo(w * 0.58, yb);
    ctx.moveTo(w * 0.66, yb);
    ctx.lineTo(g.xc + 4, yb);
    ctx.lineTo(g.xc + 4, g.y1);
    ctx.stroke();
    // battery
    ctx.strokeStyle = '#e9ecf2';
    ctx.beginPath();
    ctx.moveTo(w * 0.42, yb - 14);
    ctx.lineTo(w * 0.42, yb + 14);
    ctx.moveTo(w * 0.47, yb - 8);
    ctx.lineTo(w * 0.47, yb + 8);
    ctx.stroke();
    ctx.fillStyle = '#fcd34d';
    ctx.font = '12px system-ui';
    ctx.fillText(`${V >= 0 ? '+' : '−'}${Math.abs(V).toFixed(2)} V`, w * 0.405, yb + 30);
    // ammeter
    ctx.beginPath();
    ctx.arc(w * 0.62, yb, 18, 0, 2 * Math.PI);
    ctx.fillStyle = '#161a24';
    ctx.fill();
    ctx.strokeStyle = I > 0 ? '#83c167' : '#6b7385';
    ctx.stroke();
    ctx.fillStyle = I > 0 ? '#83c167' : '#9aa3b5';
    ctx.font = 'bold 12px system-ui';
    ctx.fillText('A', w * 0.62 - 4, yb + 4);
    ctx.font = '12px Consolas, monospace';
    ctx.fillText(`${I.toFixed(2)} µA`, w * 0.62 + 24, yb + 4);
  };

  useEffect(() => {
    electrons.current = [];
  }, [metal]);

  // I–V curve
  const PW = 380,
    PH = 210,
    pl = 40,
    pb = 30;
  const Vmin = -2,
    Vmax = 6;
  const Imax = Math.max(0.5, saturationCurrent(1, 800) * 0.6, saturationCurrent(intensity, nm) * 1.15);
  const px = (v: number) => pl + ((v - Vmin) / (Vmax - Vmin)) * (PW - pl - 10);
  const py = (i: number) => PH - pb - (i / Imax) * (PH - pb - 14);
  const ivPts = Array.from({ length: 161 }, (_, k) => {
    const v = Vmin + (k / 160) * (Vmax - Vmin);
    return `${px(v).toFixed(1)},${py(photocurrent(intensity, nm, M.phi, v)).toFixed(1)}`;
  }).join(' ');

  // Millikan plot: stopping voltage vs frequency
  const MW = 380,
    MH = 210,
    ml = 40,
    mb = 30;
  const fmin = 3,
    fmax = 20; // ×10^14 Hz
  const mx = (f: number) => ml + ((f - fmin) / (fmax - fmin)) * (MW - ml - 10);
  const my = (v: number) => MH - mb - (v / 6) * (MH - mb - 14);
  const good = points.filter((p) => p.zero);
  let fit: { m: number; b: number } | null = null;
  if (good.length >= 2) {
    const n = good.length;
    const sx = good.reduce((a, p) => a + p.f, 0),
      sy = good.reduce((a, p) => a + p.V, 0);
    const sxx = good.reduce((a, p) => a + p.f * p.f, 0),
      sxy = good.reduce((a, p) => a + p.f * p.V, 0);
    const den = n * sxx - sx * sx;
    if (Math.abs(den) > 1e-9) {
      const m = (n * sxy - sx * sy) / den;
      fit = { m, b: (sy - m * sx) / n };
    }
  }
  const hEst = fit ? fit.m * 1e-14 * eC : 0; // slope V per (1e14 Hz) → h = e·slope
  const f14 = freqFromNm(nm) / 1e14;

  return (
    <Widget title="Photoelectric effect lab">
      <div ref={wrapRef} className="canvas-wrap">
        <canvas ref={canvasRef} style={{ width: '100%', height: H, display: 'block', borderRadius: 8 }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,1fr)', gap: 16, marginTop: 10 }}>
        <div>
          <Slider label="wavelength" value={nm} min={150} max={800} step={1} onChange={setNm} format={(v) => `${v.toFixed(0)} nm`} />
          <Slider label="intensity" value={intensity} min={0} max={1} step={0.01} onChange={setIntensity} format={(v) => `${(v * 100).toFixed(0)}%`} />
          <Slider label="voltage V" value={V} min={-2} max={6} step={0.01} onChange={setV} format={(v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)} V`} />
          <div className="row" style={{ gap: 4, marginTop: 4 }}>
            {METALS.map((m, i) => (
              <button key={m.symbol} className={`btn small ${i === metal ? 'active' : ''}`} onClick={() => setMetal(i)} title={m.name}>
                {m.symbol}
              </button>
            ))}
            <Toggle label="slow motion" value={slow} onChange={setSlow} />
          </div>
        </div>
        <div className="col" style={{ gap: 6 }}>
          <div className="row" style={{ gap: 6 }}>
            <Stat label="photon energy hf" value={`${E.toFixed(2)} eV`} color={wavelengthCSS(Math.max(380, Math.min(750, nm)))} />
            {!hidePhi && <Stat label={`work function φ (${M.symbol})`} value={`${M.phi.toFixed(2)} eV`} color="#cfd6e4" />}
          </div>
          <div className="row" style={{ gap: 6 }}>
            <Stat label="current" value={`${I.toFixed(2)} µA`} color={I > 0 ? '#83c167' : '#6b7385'} />
            {!hidePhi && <Stat label="K max = hf − φ" value={Kmax > 0 ? `${Kmax.toFixed(2)} eV` : 'none'} color="#58c4dd" />}
          </div>
          <div className="faint" style={{ fontSize: '0.8rem' }}>
            f = {f14.toFixed(2)} × 10¹⁴ Hz{nm < 380 ? ' (ultraviolet)' : nm > 750 ? ' (infrared)' : ''}. Positive V opposes the electrons.
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: millikan ? 'minmax(0,1fr) minmax(0,1fr)' : 'minmax(0,1fr)', gap: 12, marginTop: 10 }}>
        <svg viewBox={`0 0 ${PW} ${PH}`} style={{ width: '100%', maxWidth: millikan ? undefined : 560, height: 'auto', margin: millikan ? undefined : '0 auto', display: 'block' }}>
          <rect width={PW} height={PH} rx={8} fill="#0d1018" />
          {[-2, 0, 2, 4, 6].map((v) => (
            <g key={v}>
              <line x1={px(v)} x2={px(v)} y1={14} y2={PH - pb} stroke={v === 0 ? '#3a4458' : '#1a2030'} />
              <text x={px(v)} y={PH - pb + 14} fill="#6b7385" fontSize={10} textAnchor="middle">
                {v}
              </text>
            </g>
          ))}
          <text x={(pl + PW) / 2} y={PH - 4} fill="#9aa3b5" fontSize={11} textAnchor="middle" fontStyle="italic">
            retarding voltage V (volts)
          </text>
          <text x={pl + 6} y={20} fill="#9aa3b5" fontSize={11}>
            current vs voltage
          </text>
          <line x1={pl} x2={PW - 10} y1={py(0)} y2={py(0)} stroke="#55607a" />
          <polyline points={ivPts} fill="none" stroke="#83c167" strokeWidth={2.4} />
          <circle cx={px(V)} cy={py(I)} r={5} fill="#fff" />
          {!hidePhi && Kmax > 0 && Kmax < Vmax && (
            <>
              <line x1={px(Kmax)} x2={px(Kmax)} y1={py(0) - 30} y2={py(0)} stroke="#fcd34d" strokeDasharray="3 3" />
              <text x={px(Kmax) + 3} y={py(0) - 34} fill="#fcd34d" fontSize={10}>
                V₀ = {Kmax.toFixed(2)} V
              </text>
            </>
          )}
        </svg>
        {millikan && (
          <div>
            <svg viewBox={`0 0 ${MW} ${MH}`} style={{ width: '100%', height: 'auto' }}>
              <rect width={MW} height={MH} rx={8} fill="#0d1018" />
              {[4, 8, 12, 16, 20].map((f) => (
                <g key={f}>
                  <line x1={mx(f)} x2={mx(f)} y1={14} y2={MH - mb} stroke="#1a2030" />
                  <text x={mx(f)} y={MH - mb + 14} fill="#6b7385" fontSize={10} textAnchor="middle">
                    {f}
                  </text>
                </g>
              ))}
              {[0, 2, 4, 6].map((v) => (
                <text key={v} x={ml - 5} y={my(v) + 4} fill="#6b7385" fontSize={10} textAnchor="end">
                  {v}
                </text>
              ))}
              <text x={(ml + MW) / 2} y={MH - 4} fill="#9aa3b5" fontSize={11} textAnchor="middle" fontStyle="italic">
                frequency (10¹⁴ Hz)
              </text>
              <text x={ml + 6} y={20} fill="#9aa3b5" fontSize={11}>
                your stopping voltages
              </text>
              <line x1={ml} x2={MW - 10} y1={my(0)} y2={my(0)} stroke="#55607a" />
              {fit && <line x1={mx(fmin)} y1={my(fit.m * fmin + fit.b)} x2={mx(fmax)} y2={my(fit.m * fmax + fit.b)} stroke="#e07ab6" strokeWidth={2} strokeDasharray="6 4" />}
              {points.map((p, i) => (
                <circle key={i} cx={mx(p.f)} cy={my(p.V)} r={5} fill={p.zero ? '#fcd34d' : 'none'} stroke="#fcd34d" strokeWidth={1.5} />
              ))}
              <line x1={mx(f14)} x2={mx(f14)} y1={14} y2={MH - mb} stroke="#58c4dd" strokeOpacity={0.5} strokeDasharray="2 3" />
            </svg>
            <div className="row" style={{ gap: 6, marginTop: 4 }}>
              <button className="btn small primary" onClick={() => setPoints((ps) => [...ps, { f: f14, V, zero: I < 1e-9 && V > 0 && V - Kmax < 0.15 }])}>
                Record (f, V)
              </button>
              <button className="btn small" onClick={() => setPoints([])} disabled={!points.length}>
                Clear
              </button>
            </div>
            <div className="faint" style={{ fontSize: '0.78rem', marginTop: 4 }}>
              {fit ? (
                <>
                  Slope = {fit.m.toFixed(3)} V per 10¹⁴ Hz ⇒ <Tex>{`h = e\\times\\text{slope} \\approx ${(hEst / 1e-34).toFixed(2)}\\times10^{-34}\\ \\text{J s}`}</Tex> (true: 6.63). Intercept on the f-axis = threshold frequency.
                </>
              ) : (
                'For each colour, raise V until the current just reaches zero, then record. Filled dots are good stopping voltages; hollow ones still had current, or overshot by more than 0.15 V. Two or more filled dots give a best-fit line.'
              )}
            </div>
          </div>
        )}
      </div>
    </Widget>
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// re-export so the lesson can quote the exact h used
export const PLANCK_H = h;
