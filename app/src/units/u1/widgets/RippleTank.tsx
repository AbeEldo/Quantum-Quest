import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Widget, Slider, Segmented, Toggle, useAnimationFrame, fmtPi } from '../../../components/ui';
import { phaseRGB } from '../../../engine/complex';
import { useWidth } from '../../u0/widgets/common';

type Mode = 'wave' | 'intensity' | 'phase';

const GW = 240; // simulation grid width (cells)
const GH = 150; // grid height
const TANK_CM = 40; // physical width of the tank in cm

export interface RippleTankProps {
  /** Initial number of sources. */
  sources?: number;
  wavelength?: number;
  separation?: number;
  mode?: Mode;
}

/**
 * A 2D ripple tank: N point sources, each emitting circular waves e^{i(kr − ωt)}/√r.
 * The total field is a phasor sum per pixel, computed once per parameter change; each animation
 * frame just rotates it by e^{−iωt}. A screen on the right shows the time-averaged intensity.
 */
export function RippleTank({ sources: n0 = 2, wavelength: l0 = 2.5, separation: d0 = 8, mode: m0 = 'wave' }: RippleTankProps) {
  const [n, setN] = useState(n0);
  const [lam, setLam] = useState(l0); // cm
  const [d, setD] = useState(d0); // cm
  const [dphi, setDphi] = useState(0);
  const [mode, setMode] = useState<Mode>(m0);
  const [play, setPlay] = useState(true);
  const [showScreen, setShowScreen] = useState(true);
  const { ref: wrapRef, w } = useWidth<HTMLDivElement>(800);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const off = useRef<HTMLCanvasElement | null>(null);
  const tRef = useRef(0);
  const cssH = Math.round(w * (GH / GW));

  const cell = TANK_CM / GW; // cm per cell
  const field = useMemo(() => {
    const re = new Float32Array(GW * GH),
      im = new Float32Array(GW * GH);
    const k = (2 * Math.PI) / lam;
    const sx = 0.08 * GW;
    const ys: number[] = [];
    for (let s = 0; s < n; s++) ys.push(GH / 2 + ((s - (n - 1) / 2) * d) / cell);
    let maxA = 0;
    for (let j = 0; j < GH; j++)
      for (let i = 0; i < GW; i++) {
        let a = 0,
          b = 0;
        for (let s = 0; s < n; s++) {
          const r = Math.hypot(i - sx, j - ys[s]) * cell;
          const amp = 1 / Math.sqrt(r + 0.6);
          const ph = k * r - s * dphi;
          a += amp * Math.cos(ph);
          b += amp * Math.sin(ph);
        }
        re[j * GW + i] = a;
        im[j * GW + i] = b;
        if (i > GW * 0.2) maxA = Math.max(maxA, Math.hypot(a, b));
      }
    // screen profile on the right edge
    const prof = new Float32Array(GH);
    let pm = 0;
    for (let j = 0; j < GH; j++) {
      const q = j * GW + (GW - 1);
      prof[j] = re[q] * re[q] + im[q] * im[q];
      pm = Math.max(pm, prof[j]);
    }
    return { re, im, maxA: maxA || 1, prof, pm: pm || 1, ys, sx };
  }, [n, lam, d, dphi, cell]);

  const draw = () => {
    const cv = canvasRef.current;
    if (!cv) return;
    if (!off.current) {
      off.current = document.createElement('canvas');
      off.current.width = GW;
      off.current.height = GH;
    }
    const octx = off.current.getContext('2d')!;
    const img = octx.createImageData(GW, GH);
    const data = img.data;
    const wt = tRef.current * 2 * Math.PI * 0.6; // ω t
    const cw = Math.cos(wt),
      sw = Math.sin(wt);
    const { re, im, maxA } = field;
    const norm = 1 / (maxA * 0.75);
    for (let p = 0; p < GW * GH; p++) {
      // field × e^{-iωt}
      const fr = re[p] * cw + im[p] * sw;
      const fi = im[p] * cw - re[p] * sw;
      let r = 0,
        g = 0,
        b = 0;
      if (mode === 'wave') {
        const v = Math.max(-1, Math.min(1, fr * norm));
        if (v >= 0) {
          r = 20 + 120 * v;
          g = 40 + 190 * v;
          b = 70 + 185 * v;
        } else {
          r = 20 + 12 * v;
          g = 40 + 30 * v;
          b = 70 + 50 * v;
        }
      } else if (mode === 'intensity') {
        const I = Math.min(1, (re[p] * re[p] + im[p] * im[p]) * norm * norm * 0.55);
        const v = Math.pow(I, 0.7);
        r = 255 * v;
        g = 215 * v;
        b = 90 * v + 12;
      } else {
        const A = Math.min(1, Math.hypot(fr, fi) * norm);
        const [pr, pg, pb] = phaseRGB(Math.atan2(fi, fr), 1);
        r = pr * A;
        g = pg * A;
        b = pb * A;
      }
      const q = p * 4;
      data[q] = r;
      data[q + 1] = g;
      data[q + 2] = b;
      data[q + 3] = 255;
    }
    octx.putImageData(img, 0, 0);
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(w * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(cssH * dpr);
    }
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(off.current, 0, 0, w, cssH);
    // sources
    const scale = w / GW;
    for (const y of field.ys) {
      ctx.beginPath();
      ctx.arc(field.sx * scale, y * scale, 5, 0, 2 * Math.PI);
      ctx.fillStyle = '#fcd34d';
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.stroke();
    }
    // screen + intensity profile
    if (showScreen) {
      const x0 = w - 4;
      ctx.fillStyle = 'rgba(10,12,18,0.55)';
      ctx.fillRect(w - 90, 0, 90, cssH);
      ctx.beginPath();
      for (let j = 0; j < GH; j++) {
        const v = field.prof[j] / field.pm;
        const x = x0 - v * 80;
        const y = (j + 0.5) * scale;
        if (j === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = '#fcd34d';
      ctx.lineWidth = 2;
      ctx.stroke();
      // fringe strip
      for (let j = 0; j < GH; j++) {
        const v = Math.pow(field.prof[j] / field.pm, 0.8);
        ctx.fillStyle = `rgba(252, 211, 77, ${v})`;
        ctx.fillRect(w - 6, j * scale, 6, scale + 1);
      }
      ctx.fillStyle = '#cfd6e4';
      ctx.font = '11px system-ui';
      ctx.fillText('screen', w - 84, 14);
      ctx.fillText('intensity', w - 84, 28);
    }
    // scale bar
    ctx.fillStyle = '#e9ecf2';
    const px10 = (10 / TANK_CM) * w;
    ctx.fillRect(12, cssH - 14, px10, 3);
    ctx.font = '11px system-ui';
    ctx.fillText('10 cm', 14, cssH - 20);
  };

  useAnimationFrame((dt) => {
    tRef.current += dt;
    draw();
  }, play && mode !== 'intensity');

  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field, mode, w, showScreen, play]);

  return (
    <Widget title="Ripple tank">
      <div ref={wrapRef} className="canvas-wrap">
        <canvas ref={canvasRef} style={{ width: '100%', height: cssH, display: 'block', borderRadius: 8 }} />
      </div>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 10 }}>
        <Segmented<Mode>
          options={[
            { value: 'wave', label: 'Instantaneous wave' },
            { value: 'intensity', label: 'Time-averaged intensity' },
            { value: 'phase', label: 'Phase as colour' },
          ]}
          value={mode}
          onChange={setMode}
        />
        <div className="row" style={{ gap: 12 }}>
          <Toggle label="animate" value={play} onChange={setPlay} />
          <Toggle label="screen" value={showScreen} onChange={setShowScreen} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16, marginTop: 6 }}>
        <div>
          <Slider label="wavelength λ" value={lam} min={1} max={5} step={0.1} onChange={setLam} format={(v) => `${v.toFixed(1)} cm`} />
          <Slider label="separation d" value={d} min={0} max={16} step={0.25} onChange={setD} format={(v) => `${v.toFixed(2)} cm`} />
        </div>
        <div>
          <Slider label="sources" value={n} min={1} max={6} step={1} onChange={setN} format={(v) => String(v)} />
          <Slider label="phase step Δφ" value={dphi} min={0} max={2 * Math.PI} step={Math.PI / 24} onChange={setDphi} format={fmtPi} />
        </div>
      </div>
      <div className="faint" style={{ fontSize: '0.8rem', marginTop: 4 }}>
        d/λ = {(d / lam).toFixed(2)} · bright directions where d·sin θ = mλ (m = 0, ±1, …) · {n > 2 ? 'more sources ⇒ sharper bright fringes (a diffraction grating)' : 'the dark "nodal lines" are where the two waves arrive half a wavelength out of step'}
      </div>
    </Widget>
  );
}
