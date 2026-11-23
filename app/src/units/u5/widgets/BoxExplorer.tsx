import React, { useRef, useState } from 'react';
import { Widget, Slider, Segmented, Toggle, Tex, fmtPi } from '../../../components/ui';
import { useLiveCanvas } from './useLiveCanvas';
import { PHASE_LUT, phaseIndex } from './colors';

const NMAX = 6;

/**
 * Particle in an infinite square well [0, L] (ħ = m = 1): ψ_n = √(2/L) sin(nπx/L), E_n = n²π²/(2L²).
 * Mix two levels and watch the density slosh at the Bohr frequency (E_b − E_a)/ħ, with phase clocks on the ladder.
 */
export function BoxExplorer({ initialA = 1, initialB = 2, initialMix = 0 }: { initialA?: number; initialB?: number; initialMix?: number }) {
  const [na, setNa] = useState(initialA);
  const [nb, setNb] = useState(initialB);
  const [mix, setMix] = useState(initialMix);
  const [rel, setRel] = useState(0);
  const [L, setL] = useState(1);
  const [running, setRunning] = useState(true);
  const [showRe, setShowRe] = useState(false);
  const tau = useRef(0); // time in units of the ground-state period T1 = 2π/E1
  const P = useRef({ na, nb, mix, rel, L, showRe });
  P.current = { na, nb, mix, rel, L, showRe };
  const E = (n: number, Lx: number) => (n * n * Math.PI * Math.PI) / (2 * Lx * Lx);

  const ref = useLiveCanvas(
    (ctx, w, h, dt) => {
      const { na, nb, mix, rel, L, showRe } = P.current;
      if (running) tau.current += dt * 0.12;
      const E1 = E(1, L);
      const t = (tau.current * 2 * Math.PI) / E1; // physical time
      ctx.clearRect(0, 0, w, h);
      const ca = Math.sqrt(1 - mix), cb = Math.sqrt(mix);
      const comps =
        na === nb
          ? [{ n: na, c: 1, ph: 0 }]
          : [
              { n: na, c: ca, ph: 0 },
              { n: nb, c: cb, ph: rel },
            ].filter((q) => q.c > 1e-6);
      // ---------- ladder ----------
      const lw = Math.min(220, w * 0.28);
      const top = 22, bot = h - 26;
      const Emax = E(NMAX, L) * 1.05;
      const ey = (e: number) => bot - (e / Emax) * (bot - top);
      ctx.font = '11px Segoe UI';
      ctx.fillStyle = '#6b7385';
      ctx.fillText('energy', 6, 12);
      for (let n = 1; n <= NMAX; n++) {
        const y = ey(E(n, L));
        const sel = comps.find((q) => q.n === n);
        ctx.strokeStyle = sel ? '#fcd34d' : '#4a5266';
        ctx.lineWidth = sel ? 2.4 : 1.4;
        ctx.beginPath();
        ctx.moveTo(30, y);
        ctx.lineTo(lw - 44, y);
        ctx.stroke();
        ctx.fillStyle = sel ? '#fcd34d' : '#9aa3b5';
        ctx.fillText(`n=${n}`, 4, y + 4);
        ctx.fillStyle = '#6b7385';
        ctx.fillText(`${n * n}E₁`, lw - 92, y - 4);
        if (sel) {
          const R = 14;
          const cx = lw - 22, cy = y;
          const ang = -E(n, L) * t + sel.ph;
          ctx.strokeStyle = '#3a4256';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(cx, cy, R, 0, 2 * Math.PI);
          ctx.stroke();
          ctx.strokeStyle = PHASE_LUT[phaseIndex(ang)];
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + R * sel.c * Math.cos(ang), cy - R * sel.c * Math.sin(ang));
          ctx.stroke();
        }
      }
      // ---------- box ----------
      const bx0 = lw + 30, bx1 = w - 20;
      const btop = 26, bbase = h - 34;
      const X = (x: number) => bx0 + (x / L) * (bx1 - bx0);
      ctx.fillStyle = 'rgba(154,163,181,0.25)';
      ctx.fillRect(bx0 - 10, btop - 10, 10, bbase - btop + 10);
      ctx.fillRect(bx1, btop - 10, 10, bbase - btop + 10);
      ctx.strokeStyle = '#9aa3b5';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bx0, btop - 10);
      ctx.lineTo(bx0, bbase);
      ctx.lineTo(bx1, bbase);
      ctx.lineTo(bx1, btop - 10);
      ctx.stroke();
      const dmax = (2 / L) * (ca + cb) ** 2 * 1.08;
      const DY = (p: number) => bbase - (p / dmax) * (bbase - btop);
      const M = Math.floor(bx1 - bx0);
      let mx = 0;
      const reArr: number[] = [];
      for (let px = 0; px <= M; px++) {
        const x = (px / M) * L;
        let re = 0, im = 0;
        for (const q of comps) {
          const amp = q.c * Math.sqrt(2 / L) * Math.sin((q.n * Math.PI * x) / L);
          const ang = -E(q.n, L) * t + q.ph;
          re += amp * Math.cos(ang);
          im += amp * Math.sin(ang);
        }
        const p = re * re + im * im;
        mx += x * p * (L / M);
        reArr.push(re);
        ctx.fillStyle = PHASE_LUT[phaseIndex(Math.atan2(im, re))];
        const y = DY(p);
        ctx.fillRect(bx0 + px, y, 1.2, bbase - y);
      }
      if (showRe) {
        const A = (bbase - btop) / 2 / Math.sqrt(dmax);
        const midY = (bbase + btop) / 2;
        ctx.strokeStyle = '#58c4dd';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        reArr.forEach((r, px) => {
          const y = midY - r * A;
          if (px === 0) ctx.moveTo(bx0 + px, y);
          else ctx.lineTo(bx0 + px, y);
        });
        ctx.stroke();
      }
      // nodes for a single eigenstate
      if (comps.length === 1) {
        const n = comps[0].n;
        for (let j = 1; j < n; j++) {
          const xx = X((j * L) / n);
          ctx.fillStyle = '#fc6255';
          ctx.beginPath();
          ctx.arc(xx, bbase, 4, 0, 2 * Math.PI);
          ctx.fill();
        }
        if (n > 1) {
          ctx.fillStyle = '#fc6255';
          ctx.fillText(`${n - 1} node${n > 2 ? 's' : ''}`, bx0 + 6, bbase + 16);
        }
      }
      // <x> marker
      ctx.fillStyle = '#83c167';
      ctx.beginPath();
      ctx.moveTo(X(mx), bbase + 4);
      ctx.lineTo(X(mx) - 6, bbase + 14);
      ctx.lineTo(X(mx) + 6, bbase + 14);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#83c167';
      ctx.fillText('⟨x⟩', X(mx) + 8, bbase + 14);
      ctx.fillStyle = '#9aa3b5';
      ctx.fillText(`t = ${tau.current.toFixed(2)} T₁   (T₁ = 2πħ/E₁)`, bx1 - 190, 14);
      if (comps.length === 2) {
        const dE = Math.abs(E(comps[1].n, L) - E(comps[0].n, L));
        ctx.fillText(`slosh period 2πħ/ΔE = ${(E1 / dE).toFixed(3)} T₁`, bx0, 14);
      }
    },
    { height: 300, running },
    [na, nb, mix, rel, L, showRe],
  );

  const levelOpts = Array.from({ length: 5 }, (_, i) => ({ value: i + 1, label: String(i + 1) }));
  return (
    <Widget title="Particle in a box — standing waves and sloshing">
      <div className="canvas-wrap">
        <canvas ref={ref} />
      </div>
      <div className="row" style={{ gap: 18, flexWrap: 'wrap', marginTop: 8 }}>
        <div className="row" style={{ gap: 6 }}>
          <span className="dim" style={{ fontSize: '0.88rem' }}>level a</span>
          <Segmented options={levelOpts} value={na} onChange={setNa} />
        </div>
        <div className="row" style={{ gap: 6 }}>
          <span className="dim" style={{ fontSize: '0.88rem' }}>level b</span>
          <Segmented options={levelOpts} value={nb} onChange={setNb} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '2px 18px', marginTop: 6 }}>
        <Slider label={<span>weight of b <Tex>{'|c_b|^2'}</Tex></span>} value={mix} min={0} max={1} step={0.01} onChange={setMix} format={(v) => v.toFixed(2)} />
        <Slider label="relative phase" value={rel} min={0} max={2 * Math.PI} step={Math.PI / 12} onChange={setRel} format={fmtPi} />
        <Slider label="box width L" value={L} min={0.5} max={2} step={0.05} onChange={setL} format={(v) => v.toFixed(2)} />
      </div>
      <div className="row" style={{ gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
        <button className="btn small primary" onClick={() => setRunning((r) => !r)}>
          {running ? '❚❚ pause' : '▶ play'}
        </button>
        <Toggle label="show Re ψ" value={showRe} onChange={setShowRe} />
        <span className="faint" style={{ fontSize: '0.82rem' }}>
          <Tex>{`E_1 = \\pi^2\\hbar^2/2mL^2 = ${E(1, L).toFixed(2)}`}</Tex> (units ħ = m = 1)
        </span>
      </div>
    </Widget>
  );
}
