import React, { useState } from 'react';
import { BlochSphere, vecFromAngles, anglesFromVec, type Vec3 } from '../../../widgets/BlochSphere';
import { Widget, Slider, Tex, fmtPi, useAnimationFrame, Stat } from '../../../components/ui';
import { rot, dot } from './spin';

/**
 * Larmor precession: H = (ω/2) b̂·σ rotates the Bloch vector about the field direction b̂ at angular rate ω.
 * The component along b̂ (the energy!) is conserved.
 */
export function LarmorDemo() {
  const [bTheta, setBTheta] = useState(0);
  const [omega, setOmega] = useState(1.5);
  const [v, setV] = useState<Vec3>(vecFromAngles(Math.PI / 3, 0));
  const [running, setRunning] = useState(true);
  const [trailKey, setTrailKey] = useState(0);
  const b = vecFromAngles(bTheta, 0);
  useAnimationFrame((dt) => setV((cur) => rot(cur, b, omega * dt)), running);
  const along = dot(v, b);
  return (
    <Widget title="Larmor precession — a spin in a magnetic field">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,1fr)', gap: 16, alignItems: 'center' }}>
        <BlochSphere
          vector={v}
          axis={b}
          trail
          trailKey={trailKey}
          onDrag={(nv) => {
            setV(nv);
            setTrailKey((k) => k + 1);
          }}
          height={320}
        />
        <div className="col" style={{ gap: 10 }}>
          <div className="dim" style={{ fontSize: '0.9rem' }}>
            The orange line is the magnetic field direction <Tex>{'\\hat b'}</Tex>. The Hamiltonian is <Tex>{'H = \\tfrac{\\hbar\\omega}{2}\\,\\hat b\\cdot\\vec\\sigma'}</Tex>. Drag the
            state's tip to start it somewhere else.
          </div>
          <Slider label="field tilt" value={bTheta} min={0} max={Math.PI / 2} step={Math.PI / 48} onChange={(x) => { setBTheta(x); setTrailKey((k) => k + 1); }} format={fmtPi} />
          <Slider label={<Tex>{'\\omega'}</Tex>} value={omega} min={0} max={4} step={0.1} onChange={setOmega} format={(x) => x.toFixed(1)} />
          <div className="row" style={{ gap: 16 }}>
            <Stat label="period 2π/ω" value={omega > 0 ? ((2 * Math.PI) / omega).toFixed(2) : '∞'} />
            <Stat label="⟨b̂·σ⟩ (conserved)" value={along.toFixed(3)} color="var(--orange)" />
            <Stat label="P(0)" value={((1 + v[2]) / 2).toFixed(3)} color="var(--blue)" />
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn small" onClick={() => setRunning((r) => !r)}>
              {running ? '❚❚ pause' : '▶ play'}
            </button>
            <button
              className="btn small ghost"
              onClick={() => {
                setV(anglesFromVec(v).theta < 1e-3 ? [1, 0, 0] : vecFromAngles(Math.PI / 3, 0));
                setTrailKey((k) => k + 1);
              }}
            >
              reset state
            </button>
          </div>
        </div>
      </div>
    </Widget>
  );
}
