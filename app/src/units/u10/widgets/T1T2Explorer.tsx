import React, { useRef, useState } from 'react';
import { Widget, Slider, useAnimationFrame } from '../../../components/ui';
import { BlochSphere } from '../../../widgets/BlochSphere';
import { Plot } from '../../../widgets/Plot';
import type { Vec3 } from './rho';

const TMAX = 300; // µs

/** Bloch equations (rotating frame): precession at Δ, transverse decay T2, longitudinal relaxation to |0⟩ with T1. */
function blochAt(t: number, theta0: number, delta: number, T1: number, T2: number): Vec3 {
  const rxy = Math.sin(theta0) * Math.exp(-t / T2);
  const z0 = Math.cos(theta0);
  const z = 1 - (1 - z0) * Math.exp(-t / T1);
  return [rxy * Math.cos(delta * t), rxy * Math.sin(delta * t), z];
}

export function T1T2Explorer() {
  const [theta0, setTheta0] = useState(Math.PI / 2);
  const [T1, setT1] = useState(120);
  const [T2, setT2] = useState(80);
  const [delta, setDelta] = useState(0.08); // rad/µs
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [key, setKey] = useState(0);
  const tRef = useRef(0);
  const T2eff = Math.min(T2, 2 * T1);

  useAnimationFrame((dt) => {
    tRef.current = Math.min(TMAX, tRef.current + dt * 45);
    setT(tRef.current);
    if (tRef.current >= TMAX) setPlaying(false);
  }, playing);

  const restart = (th = theta0) => {
    setTheta0(th);
    tRef.current = 0;
    setT(0);
    setKey((k) => k + 1);
    setPlaying(true);
  };

  const v = blochAt(t, theta0, delta, T1, T2eff);
  const p1 = (s: number) => (1 - blochAt(s, theta0, delta, T1, T2eff)[2]) / 2;
  const coh = (s: number) => Math.hypot(...blochAt(s, theta0, delta, T1, T2eff).slice(0, 2));

  return (
    <Widget title="T₁ and T₂: watching a qubit forget">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(250px,1fr) 1.1fr', gap: 16 }}>
        <div>
          <BlochSphere ball vector={v} trail trailKey={key} height={300} color="#fcd34d" />
          <div className="row" style={{ justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
            <button className="btn small" onClick={() => restart(Math.PI)}>start in |1⟩</button>
            <button className="btn small" onClick={() => restart(Math.PI / 2)}>start in |+⟩</button>
            <button className="btn small" onClick={() => restart((2 * Math.PI) / 3)}>start at θ = 2π/3</button>
          </div>
        </div>
        <div className="col" style={{ gap: 6 }}>
          <Slider label="T₁ (µs)" value={T1} min={10} max={300} step={1} onChange={setT1} format={(x) => `${x.toFixed(0)} µs`} />
          <Slider label="T₂ (µs)" value={T2} min={5} max={400} step={1} onChange={setT2} format={(x) => `${x.toFixed(0)} µs`} />
          {T2 > 2 * T1 && (
            <div className="pill warn" style={{ fontSize: '0.78rem' }}>
              Physics caps T₂ ≤ 2T₁ — using T₂ = {(2 * T1).toFixed(0)} µs
            </div>
          )}
          <Slider label="detuning Δ" value={delta} min={0} max={0.3} step={0.005} onChange={setDelta} format={(x) => `${((x / (2 * Math.PI)) * 1000).toFixed(0)} kHz`} />
          <div className="row" style={{ gap: 6 }}>
            <button className="btn small primary" onClick={() => (t >= TMAX ? restart() : setPlaying((p) => !p))}>
              {playing ? '⏸ pause' : t >= TMAX ? '↻ replay' : '▶ play'}
            </button>
            <button className="btn small ghost" onClick={() => restart()}>↺ restart</button>
            <span className="mono" style={{ color: 'var(--yellow)' }}>t = {t.toFixed(0)} µs</span>
          </div>
          <Plot
            height={190}
            xRange={[0, TMAX]}
            yRange={[0, 1]}
            xLabel="time (µs)"
            series={[
              { f: p1, color: '#fc6255', label: 'P(1) — population' },
              { f: coh, color: '#58c4dd', label: '|r⊥| — coherence' },
            ]}
            vlines={[{ x: t, color: '#fcd34d' }, { x: T1, color: '#fc625577', label: 'T₁' }, { x: T2eff, color: '#58c4dd77', label: 'T₂' }]}
          />
          <div className="mono faint" style={{ fontSize: '0.78rem' }}>
            r = ({v.map((x) => x.toFixed(2)).join(', ')}) · |r| = {Math.hypot(...v).toFixed(2)} · purity {((1 + Math.hypot(...v) ** 2) / 2).toFixed(2)}
          </div>
        </div>
      </div>
    </Widget>
  );
}
