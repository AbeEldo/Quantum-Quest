import React, { useMemo, useState } from 'react';
import { Widget, Slider, Tex, Stat } from '../../../components/ui';
import { Plot } from '../../../widgets/Plot';
import { transmission } from '../physics';

/**
 * Exact transmission through a rectangular barrier (ħ = m = 1) vs energy and vs width,
 * with the thick-barrier approximation T ≈ 16 (E/V₀)(1 − E/V₀) e^{−2κa}.
 */
export function TransmissionExplorer() {
  const [V0, setV0] = useState(2);
  const [a, setA] = useState(1);
  const [E, setE] = useState(1);
  const T = transmission(E, [{ width: a, V: V0 }]);
  const kappa = E < V0 ? Math.sqrt(2 * (V0 - E)) : 0;
  const approx = E < V0 ? 16 * (E / V0) * (1 - E / V0) * Math.exp(-2 * kappa * a) : NaN;

  const tVsE = useMemo(() => {
    const pts: [number, number][] = [];
    for (let i = 1; i <= 400; i++) {
      const r = (i / 400) * 3;
      pts.push([r, transmission(r * V0, [{ width: a, V: V0 }])]);
    }
    return pts;
  }, [V0, a]);
  const tVsA = useMemo(() => {
    const ex: [number, number][] = [], ap: [number, number][] = [];
    for (let i = 0; i <= 300; i++) {
      const aa = (i / 300) * 5;
      ex.push([aa, Math.log10(Math.max(1e-12, transmission(E, [{ width: aa, V: V0 }])))]);
      if (E < V0) ap.push([aa, Math.log10(Math.max(1e-12, 16 * (E / V0) * (1 - E / V0) * Math.exp(-2 * kappa * aa)))]);
    }
    return { ex, ap };
  }, [V0, E, kappa]);

  return (
    <Widget title="Tunnelling calculator — exact transmission through a barrier">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
        <div>
          <div className="faint center" style={{ fontSize: '0.82rem' }}>
            T vs energy <Tex>{'E/V_0'}</Tex> (current width)
          </div>
          <Plot
            height={240}
            width={420}
            xRange={[0, 3]}
            yRange={[0, 1.05]}
            xLabel="E / V₀"
            series={[{ points: tVsE, color: '#58c4dd', width: 2.2 }]}
            vlines={[
              { x: 1, color: '#9aa3b5', label: 'barrier top' },
              { x: E / V0, color: '#fcd34d', label: 'your E' },
            ]}
          />
        </div>
        <div>
          <div className="faint center" style={{ fontSize: '0.82rem' }}>
            <Tex>{'\\log_{10} T'}</Tex> vs barrier width <Tex>{'a'}</Tex> (current energy)
          </div>
          <Plot
            height={240}
            width={420}
            xRange={[0, 5]}
            yRange={[-10, 0.2]}
            xLabel="width a"
            series={[
              { points: tVsA.ex, color: '#83c167', width: 2.2, label: 'exact' },
              ...(E < V0 ? [{ points: tVsA.ap, color: '#e07ab6', dashed: true, label: 'thick-barrier approx.' }] : []),
            ]}
            vlines={[{ x: a, color: '#fcd34d', label: 'your a' }]}
          />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '2px 18px', marginTop: 6 }}>
        <Slider label={<span>barrier <Tex>{'V_0'}</Tex></span>} value={V0} min={0.5} max={6} step={0.05} onChange={setV0} format={(v) => v.toFixed(2)} />
        <Slider label={<span>width <Tex>{'a'}</Tex></span>} value={a} min={0.05} max={5} step={0.05} onChange={setA} format={(v) => v.toFixed(2)} />
        <Slider label={<span>energy <Tex>{'E'}</Tex></span>} value={E} min={0.05} max={6} step={0.05} onChange={setE} format={(v) => v.toFixed(2)} />
      </div>
      <div className="row" style={{ gap: 16, flexWrap: 'wrap', marginTop: 4 }}>
        <Stat label="transmission T" value={T < 1e-3 ? T.toExponential(2) : T.toFixed(4)} color="var(--green)" />
        <Stat label="reflection R = 1 − T" value={(1 - T).toFixed(4)} color="var(--red)" />
        <Stat label="decay length 1/κ" value={E < V0 ? (1 / kappa).toFixed(3) : '— (above top)'} />
        <Stat label="thick-barrier approx." value={E < V0 ? (approx < 1e-3 ? approx.toExponential(2) : approx.toFixed(4)) : '—'} color="var(--pink)" />
      </div>
    </Widget>
  );
}
