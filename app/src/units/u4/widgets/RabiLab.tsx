import React, { useEffect, useRef, useState } from 'react';
import { useChallengeGate } from '../../../components/lesson/gates';
import { useProgress } from '../../../state/progress';
import { BlochSphere, type Vec3 } from '../../../widgets/BlochSphere';
import { Widget, Slider, Tex, fmtPi, Segmented, Stat, useAnimationFrame } from '../../../components/ui';
import { rot, pulseAxis, rabiP1, blochFidelity, type V3 } from './spin';
import { useLiveCanvas } from './useLiveCanvas';
import { label } from './draw';

const OMEGA_Q = 9; // qubit frequency used for the (slowed-down) lab-frame view

/**
 * Rabi drive simulator. Rotating-frame Hamiltonian (ħ = 1, RWA):
 *   H = (Δ/2)σz + (Ω/2)(cos φ σx + sin φ σy)
 * The Bloch vector rotates about (Ω cos φ, Ω sin φ, Δ) at rate Ω_eff = √(Ω² + Δ²).
 * Lab frame = rotating frame turned about z by the drive phase ω_d t.
 */
export function RabiLab({ chevron = true, target, challengeId, title }: { chevron?: boolean; target?: V3; challengeId?: string; title?: string }) {
  const [Om, setOm] = useState(1);
  const [Det, setDet] = useState(0);
  const [ph, setPh] = useState(0);
  const [speed, setSpeed] = useState(0.6);
  const [frame, setFrame] = useState<'rot' | 'lab'>('rot');
  const [running, setRunning] = useState(false);
  const [v, setV] = useState<V3>([0, 0, 1]);
  const [trailKey, setTrailKey] = useState(0);
  const sim = useRef({ t: 0, v: [0, 0, 1] as V3, stopAt: Infinity, hist: [] as { t: number; p: number }[], tLab: 0 });
  const { axis, rate } = pulseAxis(Om, ph, Det);
  const fid = target ? blochFidelity(v, target) : 0;
  const recordQuiz = useProgress((s) => s.recordQuiz);
  const solvedBefore = useProgress((s) => (challengeId ? !!s.quizzes[`rabi:${challengeId}`]?.correct : false));
  const [solved, setSolved] = useState(false);
  useChallengeGate(challengeId ?? 'rabi-none', !challengeId || solved || solvedBefore);
  useEffect(() => {
    if (target && challengeId && !running && fid > 0.98 && !solved) {
      setSolved(true);
      recordQuiz(`rabi:${challengeId}`, true, 25);
    }
  }, [running, fid > 0.98]); // eslint-disable-line react-hooks/exhaustive-deps

  useAnimationFrame((dt) => {
    const S = sim.current;
    let step = dt * speed * 2;
    let stop = false;
    if (S.t + step >= S.stopAt) {
      step = S.stopAt - S.t;
      stop = true;
    }
    S.v = rot(S.v, axis, rate * step);
    S.t += step;
    S.tLab += step;
    S.hist.push({ t: S.t, p: (1 - S.v[2]) / 2 });
    if (S.hist.length > 3000) S.hist.shift();
    setV(S.v);
    if (stop) {
      S.stopAt = Infinity;
      setRunning(false);
    }
  }, running);

  const reset = () => {
    sim.current = { t: 0, v: [0, 0, 1], stopAt: Infinity, hist: [], tLab: 0 };
    setV([0, 0, 1]);
    setTrailKey((k) => k + 1);
    setRunning(false);
  };
  const pulse = (angle: number) => {
    if (rate < 1e-9) return;
    sim.current.stopAt = sim.current.t + angle / rate;
    setRunning(true);
  };

  const wd = OMEGA_Q - Det; // drive frequency
  const labV: Vec3 = frame === 'lab' ? (rot(v, [0, 0, 1], wd * sim.current.tLab) as Vec3) : (v as Vec3);
  const labAxis: Vec3 | null = frame === 'lab' ? (rot(axis, [0, 0, 1], wd * sim.current.tLab) as Vec3) : (axis as Vec3);
  const Weff = rate;
  const pmax = Weff > 0 ? (Om * Om) / (Weff * Weff) : 0;

  const traceRef = useLiveCanvas(
    (ctx, w, h) => {
      const S = sim.current;
      ctx.clearRect(0, 0, w, h);
      const pl = 30, pr = 8, pt = 8, pb = 22;
      const Tw = Math.max(4 * Math.PI, S.t);
      const x = (t: number) => pl + (t / Tw) * (w - pl - pr);
      const y = (p: number) => h - pb - p * (h - pt - pb);
      ctx.strokeStyle = '#2a3142';
      ctx.strokeRect(pl, pt, w - pl - pr, h - pt - pb);
      label(ctx, '1', pl - 12, pt + 8, '#6b7385', 11);
      label(ctx, '0', pl - 12, h - pb + 2, '#6b7385', 11);
      label(ctx, 'P(|1⟩) vs time', pl + 6, pt + 14, '#9aa3b5', 11);
      // pi marks
      for (let k = 1; k * Math.PI <= Tw; k++) {
        const xx = x(k * Math.PI);
        ctx.strokeStyle = '#1f2533';
        ctx.beginPath();
        ctx.moveTo(xx, pt);
        ctx.lineTo(xx, h - pb);
        ctx.stroke();
        label(ctx, `${k}π`, xx - 6, h - 6, '#6b7385', 10);
      }
      // theory from |0>
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = 'rgba(252,211,77,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i <= 300; i++) {
        const t = (i / 300) * Tw;
        const p = rabiP1(Om, Det, t);
        if (i === 0) ctx.moveTo(x(t), y(p));
        else ctx.lineTo(x(t), y(p));
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = '#58c4dd';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      S.hist.forEach((pt2, i) => {
        if (i === 0) ctx.moveTo(x(pt2.t), y(pt2.p));
        else ctx.lineTo(x(pt2.t), y(pt2.p));
      });
      ctx.stroke();
      label(ctx, 'time t', w - 46, h - 6, '#6b7385', 10);
    },
    { height: 150, running },
    [Om, Det, trailKey, v],
  );

  const chevRef = useLiveCanvas(
    (ctx, w, h) => {
      const S = sim.current;
      ctx.clearRect(0, 0, w, h);
      const pl = 34, pb = 26, pt = 18, pr = 8;
      const W = w - pl - pr, Hh = h - pt - pb;
      const nx = 70, ny = 60;
      const dMax = 3, tMax = 4 * Math.PI;
      for (let i = 0; i < nx; i++)
        for (let j = 0; j < ny; j++) {
          const d = -dMax + ((i + 0.5) / nx) * 2 * dMax;
          const t = ((j + 0.5) / ny) * tMax;
          const p = rabiP1(Om, d, t);
          const r = Math.round(30 + 222 * p), g = Math.round(40 + 171 * p), b = Math.round(70 - 20 * p);
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(pl + (i / nx) * W, pt + Hh - ((j + 1) / ny) * Hh, W / nx + 1, Hh / ny + 1);
        }
      label(ctx, 'Rabi chevron  P(|1⟩)', pl, 12, '#9aa3b5', 11);
      label(ctx, '−3', pl - 4, h - 10, '#6b7385', 10);
      label(ctx, '0', pl + W / 2 - 3, h - 10, '#6b7385', 10);
      label(ctx, '+3', pl + W - 14, h - 10, '#6b7385', 10);
      label(ctx, 'detuning Δ', pl + W / 2 + 14, h - 10, '#9aa3b5', 10);
      label(ctx, 't', 8, pt + Hh / 2, '#9aa3b5', 11);
      label(ctx, '4π', 6, pt + 8, '#6b7385', 10);
      // marker
      const mx = pl + ((Det + dMax) / (2 * dMax)) * W;
      const my = pt + Hh - (Math.min(S.t, tMax) / tMax) * Hh;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(mx, pt);
      ctx.lineTo(mx, pt + Hh);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#58c4dd';
      ctx.beginPath();
      ctx.arc(mx, my, 5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    },
    { height: 200, running: running && chevron },
    [Om, Det, trailKey, v],
  );

  return (
    <Widget title={title ?? 'Rabi lab — drive a qubit with a resonant field'}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
        <div>
          <BlochSphere vector={labV} axis={labAxis} trail trailKey={`${trailKey}${frame}`} height={320} target={target && frame === 'rot' ? (target as Vec3) : null} />
          <div className="row" style={{ justifyContent: 'center', marginTop: 4 }}>
            <Segmented
              options={[
                { value: 'rot', label: 'rotating frame' },
                { value: 'lab', label: 'lab frame' },
              ]}
              value={frame}
              onChange={(f) => setFrame(f)}
            />
          </div>
        </div>
        <div className="col" style={{ gap: 6 }}>
          <Slider label={<span>Rabi freq <Tex>{'\\Omega'}</Tex></span>} value={Om} min={0} max={2} step={0.05} onChange={setOm} format={(x) => x.toFixed(2)} />
          <Slider label={<span>detuning <Tex>{'\\Delta'}</Tex></span>} value={Det} min={-3} max={3} step={0.05} onChange={setDet} format={(x) => x.toFixed(2)} />
          <Slider label={<span>drive phase <Tex>{'\\varphi'}</Tex></span>} value={ph} min={0} max={2 * Math.PI} step={Math.PI / 12} onChange={setPh} format={fmtPi} />
          <Slider label="sim speed" value={speed} min={0.1} max={2} step={0.1} onChange={setSpeed} format={(x) => x.toFixed(1) + '×'} />
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <button className="btn small primary" onClick={() => setRunning((r) => !r)}>
              {running ? '❚❚ pause' : '▶ drive'}
            </button>
            <button className="btn small gold" onClick={() => pulse(Math.PI)} disabled={running}>
              π pulse
            </button>
            <button className="btn small gold" onClick={() => pulse(Math.PI / 2)} disabled={running}>
              π/2 pulse
            </button>
            <button className="btn small ghost" onClick={reset}>
              reset to |0⟩
            </button>
          </div>
          {target && (
            <div className="panel" style={{ padding: 8, borderColor: solved || solvedBefore ? 'var(--green)' : 'var(--yellow)', fontSize: '0.88rem' }}>
              {solved || solvedBefore ? (
                <span style={{ color: 'var(--green)' }}>✓ Target reached (fidelity {(fid * 100).toFixed(1)}%).</span>
              ) : (
                <span>
                  🎯 Steer the state onto the green target and <b>stop there</b> (fidelity &gt; 98%). Now: {(fid * 100).toFixed(1)}%
                </span>
              )}
            </div>
          )}
          <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
            <Stat label="Ω_eff = √(Ω²+Δ²)" value={Weff.toFixed(2)} />
            <Stat label="max P(1) = Ω²/Ω_eff²" value={pmax.toFixed(3)} color="var(--yellow)" />
            <Stat label="P(1) now" value={((1 - v[2]) / 2).toFixed(3)} color="var(--blue)" />
          </div>
          <div className="canvas-wrap">
            <canvas ref={traceRef} />
          </div>
        </div>
      </div>
      {chevron && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16, marginTop: 10, alignItems: 'center' }}>
          <div className="canvas-wrap">
            <canvas ref={chevRef} />
          </div>
          <div className="dim" style={{ fontSize: '0.88rem' }}>
            <b>The chevron</b> is what a real Rabi experiment looks like: sweep the drive frequency (detuning) and pulse length, measure <Tex>{'P(|1\\rangle)'}</Tex> each time. On
            resonance (centre) the qubit flops all the way. Off resonance it oscillates <i>faster</i> but never fully flips. The blue dot is your current experiment.
            {frame === 'lab' && (
              <p className="faint" style={{ fontSize: '0.82rem' }}>
                Lab-frame view: the qubit's own precession is shown slowed down to {OMEGA_Q}× the Rabi frequency. In a real superconducting qubit (≈5 GHz) driven at a Rabi frequency of tens of MHz, the ratio is in the hundreds.
              </p>
            )}
          </div>
        </div>
      )}
    </Widget>
  );
}
