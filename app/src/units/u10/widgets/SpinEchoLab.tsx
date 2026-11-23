import React, { useRef, useState } from 'react';
import { Widget, Slider, Segmented } from '../../../components/ui';
import { Plot } from '../../../widgets/Plot';
import { mulberry32 } from '../../../engine/qsim';
import { useAnimCanvas, easeInOut, gauss, SANS, SERIF } from './anim';
import type { Vec3 } from './rho';

type Mode = 'fid' | 'echo' | 'ramsey';
type Axis = 'x' | 'y' | '-y';

const N = 44;
const TMAX = 20; // µs
const SPEED = 3.2; // simulated µs per real second
const PULSE_TIME = 0.45; // real seconds per pulse animation

function rot(v: Vec3, axis: Axis, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a);
  const [x, y, z] = v;
  if (axis === 'x') return [x, y * c - z * s, y * s + z * c];
  const sa = axis === 'y' ? s : -s;
  return [x * c + z * sa, y, -x * sa + z * c];
}

interface Sim {
  t: number;
  d: number[];
  v: Vec3[];
  running: boolean;
  pulse: null | { axis: Axis; angle: number; p: number; from: Vec3[]; label: string; then?: () => void };
  events: { t: number; label: string; color: string }[];
  trace: [number, number][];
  echoDone: boolean;
  result: number | null;
}

/** An ensemble of spins fanning out on the equator; π pulses refocus them (Hahn echo); Ramsey fringes. */
export function SpinEchoLab() {
  const [mode, setMode] = useState<Mode>('echo');
  const [sigma, setSigma] = useState(0.9); // rad/µs spread of detunings
  const [T2, setT2] = useState(40); // µs irreversible
  const [tau, setTau] = useState(5);
  const [delta0, setDelta0] = useState(1.6);
  const [tR, setTR] = useState(3);
  const [status, setStatus] = useState('Press ▶ to run the pulse sequence.');
  const [fringe, setFringe] = useState<[number, number][] | null>(null);
  const [, force] = useState(0);
  const seed = useRef(11);
  const params = useRef({ mode, sigma, T2, tau, delta0, tR });
  params.current = { mode, sigma, T2, tau, delta0, tR };

  const mkSim = (): Sim => {
    const rng = mulberry32(seed.current++);
    const d = Array.from({ length: N }, () => gauss(rng) * params.current.sigma);
    d.sort((a, b) => a - b);
    return { t: 0, d, v: d.map(() => [0, 0, 1] as Vec3), running: false, pulse: null, events: [], trace: [], echoDone: false, result: null };
  };
  const sim = useRef<Sim>(mkSim());
  const noiseRng = useRef(mulberry32(99));

  const startPulse = (axis: Axis, angle: number, label: string, color: string, then?: () => void) => {
    const s = sim.current;
    s.pulse = { axis, angle, p: 0, from: s.v.map((x) => [...x] as Vec3), label, then };
    s.events.push({ t: s.t, label, color });
  };

  const run = () => {
    sim.current = mkSim();
    setFringe(null);
    setStatus('π/2 pulse: tipping every spin onto the equator…');
    startPulse('y', Math.PI / 2, 'π/2', '#83c167', () => {
      sim.current.running = true;
      setStatus(params.current.mode === 'echo' ? `Free evolution — the spins fan out. Echo pulse scheduled at τ = ${params.current.tau.toFixed(1)} µs.` : 'Free evolution — the spins fan out…');
    });
    force((x) => x + 1);
  };

  const manualPi = () => {
    const s = sim.current;
    if (!s.running || s.pulse) return;
    s.echoDone = true;
    s.running = false;
    const tt = s.t;
    startPulse('x', Math.PI, 'π', '#fc6255', () => {
      sim.current.running = true;
      setStatus(`π pulse at t = ${tt.toFixed(1)} µs — every spin's phase is mirrored. Watch t = ${(2 * tt).toFixed(1)} µs…`);
    });
  };

  const ref = useAnimCanvas(420, (ctx, w, h, dt) => {
    const s = sim.current;
    const P = params.current;
    // ---- physics ----
    if (s.pulse) {
      s.pulse.p = Math.min(1, s.pulse.p + dt / PULSE_TIME);
      const a = s.pulse.angle * easeInOut(s.pulse.p);
      s.v = s.pulse.from.map((v) => rot(v, s.pulse!.axis, a));
      if (s.pulse.p >= 1) {
        const then = s.pulse.then;
        s.pulse = null;
        then?.();
      }
    } else if (s.running) {
      const sdt = dt * SPEED;
      const off = P.mode === 'ramsey' ? P.delta0 : 0;
      const kick = Math.sqrt((2 * sdt) / P.T2);
      s.v = s.v.map((v, i) => {
        const a = (off + s.d[i]) * sdt + kick * gauss(noiseRng.current);
        const c = Math.cos(a), sn = Math.sin(a);
        return [v[0] * c - v[1] * sn, v[0] * sn + v[1] * c, v[2]];
      });
      s.t += sdt;
      const mx = s.v.reduce((acc, v) => acc + v[0], 0) / N;
      const my = s.v.reduce((acc, v) => acc + v[1], 0) / N;
      s.trace.push([s.t, Math.hypot(mx, my)]);
      if (P.mode === 'echo' && !s.echoDone && s.t >= P.tau) {
        s.echoDone = true;
        s.running = false;
        startPulse('x', Math.PI, 'π', '#fc6255', () => {
          sim.current.running = true;
          setStatus(`π pulse at τ = ${P.tau.toFixed(1)} µs mirrors every phase: fast spins are now behind. Watch 2τ = ${(2 * P.tau).toFixed(1)} µs…`);
        });
      }
      if (P.mode === 'ramsey' && s.t >= P.tR) {
        s.running = false;
        startPulse('-y', Math.PI / 2, 'π/2', '#83c167', () => {
          const p0 = s.v.reduce((acc, v) => acc + (1 + v[2]) / 2, 0) / N;
          s.result = p0;
          setStatus(`Second π/2 pulse maps phase onto population: P(0) = ${(p0 * 100).toFixed(0)}%. Change the wait time or sweep the whole fringe.`);
        });
      }
      if (s.t >= TMAX) {
        s.running = false;
        setStatus('Done. Try another τ, more spread, or a shorter T₂.');
      }
    }

    // ---- draw sphere view ----
    const H1 = 270;
    const cx = w / 2, cy = 135, R = Math.min(118, w * 0.22);
    const ky = 0.4, kz = 0.92;
    const proj = (v: Vec3): [number, number] => [cx + R * v[0], cy - R * (ky * v[1] + kz * v[2])];
    // equator ellipse
    ctx.strokeStyle = 'rgba(88,196,221,.45)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.ellipse(cx, cy, R, R * ky, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(88,196,221,.18)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, R, R * kz, 0, 0, Math.PI * 2);
    ctx.stroke();
    // axes
    ctx.strokeStyle = '#3a4458';
    ctx.beginPath();
    ctx.moveTo(...proj([-1.15, 0, 0]));
    ctx.lineTo(...proj([1.15, 0, 0]));
    ctx.moveTo(...proj([0, 0, -1.08]));
    ctx.lineTo(...proj([0, 0, 1.08]));
    ctx.moveTo(...proj([0, -1.2, 0]));
    ctx.lineTo(...proj([0, 1.2, 0]));
    ctx.stroke();
    ctx.fillStyle = '#7d8699';
    ctx.font = `12px ${SERIF}`;
    ctx.textAlign = 'center';
    ctx.fillText('|0⟩', ...proj([0, 0, 1.2]));
    ctx.fillText('|1⟩', proj([0, 0, -1.25])[0], proj([0, 0, -1.25])[1] + 8);
    ctx.fillText('+x', ...proj([1.28, 0, 0.04]));
    ctx.fillText('+y', ...proj([0, 1.35, 0]));
    // spins: draw far side first
    const order = s.v.map((v, i) => i).sort((a, b) => s.v[b][1] - s.v[a][1]);
    for (const i of order) {
      const v = s.v[i];
      const [x, y] = proj(v);
      const hue = 220 - (i / (N - 1)) * 220;
      const col = `hsla(${hue}, 85%, 62%, ${0.55 + 0.4 * (v[1] < 0 ? 1 : 0.6)})`;
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // net magnetisation
    const m: Vec3 = [0, 1, 2].map((k) => s.v.reduce((acc, v) => acc + v[k], 0) / N) as Vec3;
    const [mx2, my2] = proj(m);
    ctx.strokeStyle = '#fcd34d';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#fcd34d';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(mx2, my2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fcd34d';
    ctx.beginPath();
    ctx.arc(mx2, my2, 5, 0, Math.PI * 2);
    ctx.fill();
    // legend
    ctx.textAlign = 'left';
    ctx.font = `12px ${SANS}`;
    ctx.fillStyle = '#fcd34d';
    ctx.fillText('— net signal (average of all spins)', 12, 20);
    ctx.fillStyle = '#9aa3b5';
    ctx.fillText('thin arrows: individual spins, coloured slow → fast', 12, 38);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#e9ecf2';
    ctx.font = `600 14px ${SANS}`;
    ctx.fillText(`t = ${s.t.toFixed(1)} µs`, w - 12, 22);
    if (s.pulse) {
      ctx.fillStyle = s.pulse.label === 'π' ? '#fc6255' : '#83c167';
      ctx.font = `700 22px ${SERIF}`;
      ctx.fillText(`${s.pulse.label} pulse`, w - 12, 52);
    }

    // ---- strip chart ----
    const top = H1 + 6, bot = h - 22, left = 40, right = w - 12;
    const sx = (t: number) => left + (t / TMAX) * (right - left);
    const sy = (y: number) => bot - y * (bot - top);
    ctx.strokeStyle = '#2a3142';
    ctx.lineWidth = 1;
    ctx.strokeRect(left, top, right - left, bot - top);
    ctx.fillStyle = '#7d8699';
    ctx.font = `11px ${SANS}`;
    ctx.textAlign = 'center';
    for (let k = 0; k <= TMAX; k += 5) ctx.fillText(`${k}`, sx(k), bot + 14);
    ctx.textAlign = 'right';
    ctx.fillText('1', left - 6, top + 8);
    ctx.fillText('0', left - 6, bot);
    ctx.save();
    ctx.translate(12, (top + bot) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('signal', 0, 0);
    ctx.restore();
    // irreversible envelope
    ctx.strokeStyle = 'rgba(252,98,85,.6)';
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    for (let k = 0; k <= 100; k++) {
      const t = (k / 100) * TMAX;
      const y = sy(Math.exp(-t / P.T2));
      if (k) ctx.lineTo(sx(t), y);
      else ctx.moveTo(sx(t), y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(252,98,85,.8)';
    ctx.textAlign = 'right';
    ctx.fillText('e^(−t/T₂): the irreversible limit', right - 4, top + 12);
    // events
    for (const e of s.events) {
      ctx.strokeStyle = e.color;
      ctx.beginPath();
      ctx.moveTo(sx(e.t), top);
      ctx.lineTo(sx(e.t), bot);
      ctx.stroke();
      ctx.fillStyle = e.color;
      ctx.textAlign = 'left';
      ctx.font = `600 12px ${SERIF}`;
      ctx.fillText(e.label, sx(e.t) + 3, top + 12);
    }
    // trace
    ctx.strokeStyle = '#fcd34d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    s.trace.forEach(([t, y], k) => (k ? ctx.lineTo(sx(t), sy(y)) : ctx.moveTo(sx(t), sy(y))));
    ctx.stroke();
    ctx.font = `11px ${SANS}`;
    ctx.fillStyle = '#7d8699';
    ctx.textAlign = 'center';
    ctx.fillText('time (µs)', (left + right) / 2, h - 2);
  });

  const sweep = () => {
    const rng = mulberry32(seed.current++);
    const d = Array.from({ length: 400 }, () => gauss(rng) * sigma);
    const pts: [number, number][] = [];
    for (let k = 0; k <= 240; k++) {
      const t = (k / 240) * 12;
      let acc = 0;
      for (const di of d) acc += Math.cos((delta0 + di) * t + gauss(rng) * Math.sqrt((2 * t) / T2));
      pts.push([t, (1 + acc / d.length) / 2]);
    }
    setFringe(pts);
  };

  const T2star = Math.sqrt(2) / sigma;

  return (
    <Widget title="Spin-echo & Ramsey lab">
      <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <Segmented
          value={mode}
          onChange={(m) => {
            setMode(m);
            setFringe(null);
          }}
          options={[
            { value: 'fid', label: 'Free decay' },
            { value: 'echo', label: 'Spin echo' },
            { value: 'ramsey', label: 'Ramsey' },
          ]}
        />
        <button className="btn small primary" onClick={run}>▶ run sequence</button>
        {mode !== 'ramsey' && (
          <button className="btn small danger" onClick={manualPi} title="Fire a π pulse right now">
            ⚡ π pulse now
          </button>
        )}
      </div>
      <div style={{ width: '100%' }}>
        <canvas ref={ref} style={{ display: 'block' }} />
      </div>
      <div className="faint" style={{ fontSize: '0.86rem', minHeight: 22, margin: '4px 0' }}>{status}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 18px' }}>
        <Slider label="detuning spread σ" value={sigma} min={0.1} max={2} step={0.05} onChange={setSigma} format={(x) => `${x.toFixed(2)} rad/µs`} />
        <Slider label="irreversible T₂" value={T2} min={4} max={200} step={1} onChange={setT2} format={(x) => `${x.toFixed(0)} µs`} />
        {mode === 'echo' && <Slider label="echo time τ" value={tau} min={1} max={9.5} step={0.1} onChange={setTau} format={(x) => `${x.toFixed(1)} µs`} />}
        {mode === 'ramsey' && <Slider label="drive detuning Δ₀" value={delta0} min={0} max={4} step={0.05} onChange={setDelta0} format={(x) => `${x.toFixed(2)} rad/µs`} />}
        {mode === 'ramsey' && <Slider label="wait time t" value={tR} min={0.2} max={12} step={0.1} onChange={setTR} format={(x) => `${x.toFixed(1)} µs`} />}
        <div className="mono faint" style={{ fontSize: '0.8rem', alignSelf: 'center' }}>
          T₂* ≈ √2/σ = {T2star.toFixed(1)} µs (dephasing from the spread)
        </div>
      </div>
      {mode === 'ramsey' && (
        <div style={{ marginTop: 8 }}>
          <button className="btn small" onClick={sweep}>📈 sweep the Ramsey fringe (400 spins × 240 wait times)</button>
          {fringe && (
            <Plot
              height={200}
              xRange={[0, 12]}
              yRange={[0, 1]}
              xLabel="wait time t between the π/2 pulses (µs)"
              yLabel="P(0)"
              series={[
                { points: fringe, color: '#83c167', label: 'measured P(0)' },
                { f: (t) => 0.5 + 0.5 * Math.exp(-(sigma * sigma * t * t) / 2 - t / T2), color: '#fcd34d', dashed: true, label: 'envelope' },
                { f: (t) => 0.5 - 0.5 * Math.exp(-(sigma * sigma * t * t) / 2 - t / T2), color: '#fcd34d', dashed: true },
              ]}
            />
          )}
        </div>
      )}
    </Widget>
  );
}
