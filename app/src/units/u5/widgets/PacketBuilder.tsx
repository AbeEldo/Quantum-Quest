import React, { useRef, useState } from 'react';
import { Widget, Slider, Tex, Toggle } from '../../../components/ui';
import { useLiveCanvas } from './useLiveCanvas';
import { PHASE_LUT, phaseIndex } from './colors';

const XMIN = -20, XMAX = 70;

/**
 * Build a wave packet by adding plane waves e^{i(kx − ωt)} with Gaussian weights around k₀,
 * then let it evolve with the free-particle dispersion ω = k²/2 (ħ = m = 1).
 * A red marker rides a crest (phase velocity ω/k = k₀/2); a green marker rides the envelope (group velocity dω/dk = k₀).
 */
export function PacketBuilder() {
  const [k0, setK0] = useState(2);
  const [dk, setDk] = useState(0.4);
  const [M, setM] = useState(15);
  const [running, setRunning] = useState(false);
  const [showParts, setShowParts] = useState(true);
  const t = useRef(0);
  const [rk, setRk] = useState(0);
  const P = useRef({ k0, dk, M, showParts });
  P.current = { k0, dk, M, showParts };

  const ref = useLiveCanvas(
    (ctx, w, h, dt) => {
      const { k0, dk, M, showParts } = P.current;
      if (running) t.current += dt * 2;
      const T = t.current;
      ctx.clearRect(0, 0, w, h);
      const padL = 10, padR = 10;
      const X = (x: number) => padL + ((x - XMIN) / (XMAX - XMIN)) * (w - padL - padR);
      // components
      const ks: number[] = [], ws: number[] = [];
      for (let j = 0; j < M; j++) {
        const kj = M === 1 ? k0 : k0 + 3 * dk * ((2 * j) / (M - 1) - 1);
        ks.push(kj);
        ws.push(Math.exp(-((kj - k0) ** 2) / (4 * dk * dk)));
      }
      const wsum = ws.reduce((a, b) => a + b, 0);
      const partsH = showParts ? Math.min(130, h * 0.38) : 0;
      // draw a few components
      if (showParts) {
        const show = Math.min(M, 7);
        const idx = Array.from({ length: show }, (_, i) => Math.round((i * (M - 1)) / Math.max(1, show - 1)));
        const rowH = partsH / show;
        idx.forEach((j, r) => {
          const yc = 8 + rowH * (r + 0.5);
          const amp = (rowH * 0.42 * ws[j]) / Math.max(...ws);
          const om = (ks[j] * ks[j]) / 2;
          ctx.strokeStyle = PHASE_LUT[(j * 37) % 360];
          ctx.globalAlpha = 0.75;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          for (let px = 0; px <= w - padL - padR; px += 2) {
            const x = XMIN + (px / (w - padL - padR)) * (XMAX - XMIN);
            const y = yc - amp * Math.cos(ks[j] * x - om * T);
            if (px === 0) ctx.moveTo(padL + px, y);
            else ctx.lineTo(padL + px, y);
          }
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#6b7385';
          ctx.font = '10px Segoe UI';
          ctx.fillText(`k=${ks[j].toFixed(2)}`, w - padR - 46, yc - 4);
        });
        ctx.fillStyle = '#9aa3b5';
        ctx.font = '11px Segoe UI';
        ctx.fillText(`${M} plane wave${M > 1 ? 's' : ''} (showing ${Math.min(M, 7)}) — each moves at its own speed k/2`, padL + 2, 8);
        ctx.strokeStyle = '#2a3142';
        ctx.beginPath();
        ctx.moveTo(padL, partsH + 12);
        ctx.lineTo(w - padR, partsH + 12);
        ctx.stroke();
      }
      // sum
      const top = partsH + 26, bot = h - 22;
      const mid = (top + bot) / 2;
      const A = (bot - top) * 0.46;
      const Npx = Math.floor(w - padL - padR);
      let prevY = 0;
      // envelope fill coloured by phase
      for (let px = 0; px < Npx; px += 2) {
        const x = XMIN + (px / Npx) * (XMAX - XMIN);
        let re = 0, im = 0;
        for (let j = 0; j < M; j++) {
          const ph = ks[j] * x - ((ks[j] * ks[j]) / 2) * T;
          re += ws[j] * Math.cos(ph);
          im += ws[j] * Math.sin(ph);
        }
        re /= wsum;
        im /= wsum;
        const mag = Math.hypot(re, im);
        ctx.fillStyle = PHASE_LUT[phaseIndex(Math.atan2(im, re))];
        ctx.globalAlpha = 0.28;
        ctx.fillRect(padL + px, mid - mag * A, 2, 2 * mag * A);
        ctx.globalAlpha = 1;
        // Re curve
        const y = mid - re * A;
        if (px > 0) {
          ctx.strokeStyle = '#58c4dd';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(padL + px - 2, prevY);
          ctx.lineTo(padL + px, y);
          ctx.stroke();
        }
        prevY = y;
        // envelope
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillRect(padL + px, mid - mag * A - 1, 2, 1.6);
        ctx.fillRect(padL + px, mid + mag * A - 1, 2, 1.6);
      }
      // markers: group (envelope centre) and phase (a crest)
      const xg = k0 * T;
      const xp = (k0 / 2) * T;
      const wrap = (x: number) => x;
      const gx = X(wrap(xg)), pxm = X(wrap(xp));
      if (xg <= XMAX) {
        ctx.fillStyle = '#83c167';
        ctx.beginPath();
        ctx.moveTo(gx, bot + 2);
        ctx.lineTo(gx - 7, bot + 14);
        ctx.lineTo(gx + 7, bot + 14);
        ctx.closePath();
        ctx.fill();
      }
      if (xp <= XMAX) {
        ctx.fillStyle = '#fc6255';
        ctx.beginPath();
        ctx.arc(pxm, mid - A * 1.02, 5, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = 'rgba(252,98,85,0.5)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(pxm, mid - A);
        ctx.lineTo(pxm, bot);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.font = '11px Segoe UI';
      ctx.fillStyle = '#83c167';
      ctx.fillText(`▲ group velocity dω/dk = k₀ = ${k0.toFixed(2)}`, padL + 2, h - 4);
      ctx.fillStyle = '#fc6255';
      ctx.fillText(`● phase velocity ω/k = k₀/2 = ${(k0 / 2).toFixed(2)}`, padL + 250, h - 4);
      ctx.fillStyle = '#6b7385';
      ctx.fillText(`t = ${T.toFixed(1)}`, w - padR - 44, h - 4);
    },
    { height: 340, running },
    [k0, dk, M, showParts, rk],
  );

  return (
    <Widget title="Packet builder — add plane waves, watch them disperse">
      <div className="canvas-wrap">
        <canvas ref={ref} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '2px 18px', marginTop: 6 }}>
        <Slider label="number of waves" value={M} min={1} max={41} step={2} onChange={setM} format={(v) => String(v)} />
        <Slider label={<span>spread <Tex>{'\\Delta k'}</Tex></span>} value={dk} min={0.05} max={1.2} step={0.01} onChange={setDk} format={(v) => v.toFixed(2)} />
        <Slider label={<span>centre <Tex>{'k_0'}</Tex></span>} value={k0} min={0.5} max={3} step={0.05} onChange={setK0} format={(v) => v.toFixed(2)} />
      </div>
      <div className="row" style={{ gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
        <button className="btn small primary" onClick={() => setRunning((r) => !r)}>
          {running ? '❚❚ pause' : '▶ evolve in time'}
        </button>
        <button className="btn small ghost" onClick={() => {
            t.current = 0;
            setRk((r) => r + 1);
          }}>
          ↺ t = 0
        </button>
        <Toggle label="show component waves" value={showParts} onChange={setShowParts} />
      </div>
    </Widget>
  );
}
