import React, { useRef, useState } from 'react';
import { Widget, Slider, Segmented } from '../../../components/ui';
import { mulberry32 } from '../../../engine/qsim';
import { useAnimCanvas, SANS, SERIF } from './anim';
import { DensityHeatmap, Meter } from './rho';

type Init = 'plus' | 'zero' | 'one' | 'tilt';
const INITS: Record<Init, { label: string; a: number; b: number }> = {
  plus: { label: '|+⟩', a: Math.SQRT1_2, b: Math.SQRT1_2 },
  tilt: { label: 'cos(π/6)|0⟩ + sin(π/6)|1⟩', a: Math.cos(Math.PI / 6), b: Math.sin(Math.PI / 6) },
  zero: { label: '|0⟩', a: 1, b: 0 },
  one: { label: '|1⟩', a: 0, b: 1 },
};

interface Mol {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hit: boolean;
  /** branch splitting angle (radians) after the hit */
  theta: number;
  life: number;
}

/**
 * A qubit bathed in a gas of environment particles. Each particle that scatters off the qubit ends up in a slightly
 * different state depending on whether the qubit is |0⟩ or |1⟩ (it carries away "which-state" information).
 * The qubit's reduced coherence is multiplied by the overlap ⟨E0|E1⟩ = Π cos(θₖ/2).
 */
export function EnvironmentDecoherence() {
  const [init, setInit] = useState<Init>('plus');
  const [g, setG] = useState(0.6);
  const [rate, setRate] = useState(3);
  const [running, setRunning] = useState(true);
  const [stats, setStats] = useState({ hits: 0, overlap: 1 });
  const mols = useRef<Mol[]>([]);
  const st = useRef({ hits: 0, overlap: 1, history: [[0, 1]] as [number, number][], t: 0, spawn: 0 });
  const rng = useRef(mulberry32(31));
  const params = useRef({ g, rate, running });
  params.current = { g, rate, running };
  const { a, b } = INITS[init];

  const reset = () => {
    mols.current = [];
    st.current = { hits: 0, overlap: 1, history: [[0, 1]], t: 0, spawn: 0 };
    setStats({ hits: 0, overlap: 1 });
  };

  const ref = useAnimCanvas(300, (ctx, w, h, dt) => {
    const P = params.current;
    const S = st.current;
    const cx = Math.min(w * 0.36, 230), cy = h / 2;
    const r0 = 26;
    if (P.running) {
      S.t += dt;
      S.spawn += dt * P.rate;
      while (S.spawn > 1) {
        S.spawn -= 1;
        // spawn on a circle aimed roughly at the qubit
        const ang = rng.current() * Math.PI * 2;
        const R = Math.max(w, h);
        const aim = (rng.current() - 0.5) * 0.5;
        const sp = 150 + rng.current() * 60;
        const x = cx + Math.cos(ang) * R * 0.6, y = cy + Math.sin(ang) * R * 0.6;
        const dir = Math.atan2(cy - y, cx - x) + aim;
        mols.current.push({ x, y, vx: Math.cos(dir) * sp, vy: Math.sin(dir) * sp, hit: false, theta: 0, life: 0 });
      }
      for (const m of mols.current) {
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.life += dt;
        if (!m.hit && Math.hypot(m.x - cx, m.y - cy) < r0 + 4) {
          m.hit = true;
          // scattering angle relative to qubit state: strength g with randomness
          m.theta = Math.min(Math.PI, P.g * (0.4 + 1.2 * rng.current()));
          // deflect the "average" trajectory
          const out = Math.atan2(m.y - cy, m.x - cx) + (rng.current() - 0.5) * 1.2;
          const sp = Math.hypot(m.vx, m.vy);
          m.vx = Math.cos(out) * sp;
          m.vy = Math.sin(out) * sp;
          S.hits++;
          S.overlap *= Math.cos(m.theta / 2);
          S.history.push([S.hits, S.overlap]);
        }
      }
      mols.current = mols.current.filter((m) => m.life < 6 && m.x > -60 && m.y > -60 && m.x < w + 60 && m.y < h + 60);
    }
    // draw particles
    for (const m of mols.current) {
      if (!m.hit) {
        ctx.fillStyle = 'rgba(207,214,228,.75)';
        ctx.beginPath();
        ctx.arc(m.x, m.y, 2.6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // two branches: rotate velocity by ±θ/2 (exaggerated for visibility)
        const dx = m.x - cx, dy = m.y - cy;
        const ang = (m.theta / 2) * 0.9;
        const show = b > 1e-6 && a > 1e-6;
        for (const [s, col] of [[-1, '#58c4dd'], [1, '#fc6255']] as [number, string][]) {
          if (!show && ((s === -1 && a < 1e-6) || (s === 1 && b < 1e-6))) continue;
          const c = Math.cos(s * ang), sn = Math.sin(s * ang);
          const x = cx + (show ? dx * c - dy * sn : dx), y = cy + (show ? dx * sn + dy * c : dy);
          ctx.fillStyle = show ? col : '#cfd6e4';
          ctx.globalAlpha = 0.8;
          ctx.beginPath();
          ctx.arc(x, y, 2.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    }
    // the qubit
    const coh = 2 * a * b * S.overlap;
    const grd = ctx.createRadialGradient(cx, cy, 2, cx, cy, r0 + 14);
    grd.addColorStop(0, `rgba(252,211,77,${0.35 + 0.5 * coh})`);
    grd.addColorStop(1, 'rgba(252,211,77,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(cx, cy, r0 + 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#161a24';
    ctx.strokeStyle = '#fcd34d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fcd34d';
    ctx.font = `600 14px ${SERIF}`;
    ctx.textAlign = 'center';
    ctx.fillText('qubit', cx, cy + 5);
    // coherence history plot on the right
    const left = Math.min(w * 0.62, w - 240), right = w - 14, top = 30, bot = h - 34;
    ctx.strokeStyle = '#2a3142';
    ctx.lineWidth = 1;
    ctx.strokeRect(left, top, right - left, bot - top);
    const maxHits = Math.max(30, S.hits);
    const sx = (k: number) => left + (k / maxHits) * (right - left);
    const sy = (v: number) => bot - v * (bot - top);
    ctx.strokeStyle = '#e07ab6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    S.history.forEach(([k, v], i) => (i ? ctx.lineTo(sx(k), sy(v)) : ctx.moveTo(sx(k), sy(v))));
    ctx.stroke();
    ctx.fillStyle = '#9aa3b5';
    ctx.font = `11px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.fillText('number of particles scattered', (left + right) / 2, h - 14);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e07ab6';
    ctx.fillText('|⟨E₀|E₁⟩| (environment overlap)', left + 4, top - 8);
    ctx.fillStyle = '#7d8699';
    ctx.textAlign = 'right';
    ctx.fillText('1', left - 4, top + 8);
    ctx.fillText('0', left - 4, bot);
    ctx.textAlign = 'left';
    ctx.font = `12px ${SANS}`;
    ctx.fillStyle = '#58c4dd';
    ctx.fillText('● branch where qubit = |0⟩', 10, h - 30);
    ctx.fillStyle = '#fc6255';
    ctx.fillText('● branch where qubit = |1⟩', 10, h - 12);
    // occasional UI sync
    if (S.hits !== stats.hits) setStats({ hits: S.hits, overlap: S.overlap });
  });

  const ov = stats.overlap;
  const rho01 = a * b * ov;
  const vis = 2 * Math.abs(rho01);
  const dist = Math.sqrt(Math.max(0, 1 - ov * ov));
  const purity = a ** 4 + b ** 4 + 2 * rho01 * rho01;

  return (
    <Widget title="Decoherence: the environment is watching">
      <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <span className="faint" style={{ fontSize: '0.82rem' }}>qubit starts in</span>
        <Segmented value={init} onChange={(v) => { setInit(v); reset(); }} options={(Object.keys(INITS) as Init[]).map((k) => ({ value: k, label: INITS[k].label }))} />
        <button className="btn small" onClick={() => setRunning((r) => !r)}>{running ? '⏸ pause' : '▶ run'}</button>
        <button className="btn small ghost" onClick={reset}>↺ reset</button>
      </div>
      <div style={{ width: '100%' }}>
        <canvas ref={ref} style={{ display: 'block' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'center', marginTop: 6 }}>
        <div className="col" style={{ gap: 6 }}>
          <Slider label="coupling per hit" value={g} min={0} max={2.5} step={0.05} onChange={setG} format={(x) => `${x.toFixed(2)} rad`} />
          <Slider label="hits per second" value={rate} min={0.5} max={12} step={0.5} onChange={setRate} format={(x) => x.toFixed(1)} />
          <Meter label="coherence |ρ₀₁|" value={2 * Math.abs(rho01)} color="var(--pink)" fmt={() => Math.abs(rho01).toFixed(3)} />
          <Meter label="fringe visibility V" value={vis} color="var(--blue)" />
          <Meter label="which-state info D" value={b > 0 && a > 0 ? dist : 0} color="var(--red)" />
          <Meter label="purity Tr ρ²" value={(purity - 0.5) * 2} color="var(--yellow)" fmt={() => purity.toFixed(3)} />
          <div className="faint" style={{ fontSize: '0.8rem' }}>
            {stats.hits} particles scattered · for an equal superposition, V² + D² = 1: every bit of which-state information the environment gains costs interference.
          </div>
        </div>
        <div className="col" style={{ alignItems: 'center', gap: 6 }}>
          <DensityHeatmap get={(i, j) => (i === j ? { re: i === 0 ? a * a : b * b, im: 0 } : { re: rho01, im: 0 })} dim={2} size={150} labels={['0', '1']} title="qubit's reduced ρ" />
          <Fringes v={vis} />
        </div>
      </div>
    </Widget>
  );
}

/** Interference pattern 1 + V cos(x) as a strip of bands. */
function Fringes({ v }: { v: number }) {
  const bands = Array.from({ length: 60 }, (_, i) => {
    const I = 0.5 * (1 + v * Math.cos((i / 60) * Math.PI * 8));
    return <rect key={i} x={i * 3} y={0} width={3} height={34} fill={`rgba(131,193,103,${(0.1 + 0.9 * I).toFixed(3)})`} />;
  });
  return (
    <div style={{ textAlign: 'center' }}>
      <svg width={180} height={34} style={{ display: 'block', borderRadius: 4 }}>{bands}</svg>
      <span className="faint" style={{ fontSize: '0.75rem' }}>interference fringes on a screen</span>
    </div>
  );
}
