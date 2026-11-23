import React, { useState } from 'react';
import { BlochSphere, vecFromAngles, anglesFromVec } from '../../../widgets/BlochSphere';
import { AmplitudeView, PhaseLegend } from '../../../widgets/AmplitudeView';
import { Slider, Widget, fmtPi, Tex } from '../../../components/ui';
import { blochToAmps } from '../../../engine/qsim';

/** Two sliders (θ, φ) ↔ point on the Bloch sphere ↔ amplitudes. The tip is also draggable. */
export function BlochAnglesExplorer() {
  const [theta, setTheta] = useState(Math.PI / 3);
  const [phi, setPhi] = useState(Math.PI / 4);
  const amps = blochToAmps(theta, phi);
  const v = vecFromAngles(theta, phi);
  const p0 = Math.cos(theta / 2) ** 2;
  return (
    <Widget title="Angles → sphere → amplitudes">
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 16, alignItems: 'center' }}>
        <BlochSphere
          vector={v}
          height={300}
          onDrag={(nv) => {
            const a = anglesFromVec(nv);
            setTheta(a.theta);
            setPhi(a.phi);
          }}
        />
        <div className="col" style={{ gap: 10 }}>
          <Slider label={<Tex>{'\\theta'}</Tex>} value={theta} min={0} max={Math.PI} step={Math.PI / 48} onChange={setTheta} format={fmtPi} />
          <Slider label={<Tex>{'\\phi'}</Tex>} value={phi} min={0} max={2 * Math.PI} step={Math.PI / 48} onChange={setPhi} format={fmtPi} />
          <div style={{ fontSize: '1.05rem' }}>
            <Tex>{`|\\psi\\rangle = ${Math.cos(theta / 2).toFixed(3)}\\,|0\\rangle + e^{i\\,${(phi / Math.PI).toFixed(2)}\\pi}\\,${Math.sin(theta / 2).toFixed(3)}\\,|1\\rangle`}</Tex>
          </div>
          <AmplitudeView amps={amps} n={1} />
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="faint" style={{ fontSize: '0.85rem' }}>
              P(0) = {(p0 * 100).toFixed(1)}% &nbsp; P(1) = {((1 - p0) * 100).toFixed(1)}%
            </span>
            <PhaseLegend size={40} />
          </div>
          <div className="mono faint" style={{ fontSize: '0.8rem' }}>
            Bloch vector = ({v.map((x) => x.toFixed(2)).join(', ')})
          </div>
        </div>
      </div>
    </Widget>
  );
}
