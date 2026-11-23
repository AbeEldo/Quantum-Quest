import React, { useMemo, useState } from 'react';
import { Widget, Slider, Tex } from '../../../components/ui';
import { Plot } from '../../../widgets/Plot';

/**
 * Three ways to step iħ dψ/dt = Hψ for a spin with H = (ω/2)σx, ω = 1, starting in |0⟩:
 *  - forward Euler   ψ ← (1 − iH dt) ψ          (NOT unitary: norm grows)
 *  - Crank–Nicolson  ψ ← (1 + iH dt/2)⁻¹(1 − iH dt/2) ψ   (unitary: norm exactly 1)
 *  - exact           ψ(t) = e^{−iHt} ψ(0)
 */
export function IntegratorRace() {
  const [dt, setDt] = useState(0.25);
  const Tmax = 30;
  const data = useMemo(() => {
    const w = 1;
    const steps = Math.ceil(Tmax / dt);
    const eulerN: [number, number][] = [], cnN: [number, number][] = [];
    const eulerP: [number, number][] = [], cnP: [number, number][] = [];
    // state (a, b) complex as [ar, ai, br, bi]
    let e = [1, 0, 0, 0];
    let k = [1, 0, 0, 0];
    const h = (w * dt) / 2; // Euler: ψ ← ψ − i h σx ψ
    const K = (w * dt) / 4; // CN
    const cA = (1 - K * K) / (1 + K * K), cB = (2 * K) / (1 + K * K); // U = cA·I − i cB·σx
    for (let n = 0; n <= steps; n++) {
      const t = n * dt;
      const ne = e[0] ** 2 + e[1] ** 2 + e[2] ** 2 + e[3] ** 2;
      const nk = k[0] ** 2 + k[1] ** 2 + k[2] ** 2 + k[3] ** 2;
      eulerN.push([t, ne]);
      cnN.push([t, nk]);
      eulerP.push([t, e[2] ** 2 + e[3] ** 2]);
      cnP.push([t, k[2] ** 2 + k[3] ** 2]);
      // Euler: a' = a − i h b ; b' = b − i h a.   −i(x+iy) = y − ix
      e = [e[0] + h * e[3], e[1] - h * e[2], e[2] + h * e[1], e[3] - h * e[0]];
      // CN: a' = cA a − i cB b ; b' = cA b − i cB a
      k = [cA * k[0] + cB * k[3], cA * k[1] - cB * k[2], cA * k[2] + cB * k[1], cA * k[3] - cB * k[0]];
    }
    return { eulerN, cnN, eulerP, cnP, finalEuler: eulerN[eulerN.length - 1][1] };
  }, [dt]);
  const yMax = Math.min(8, Math.max(1.5, data.finalEuler * 1.05));
  return (
    <Widget title="Integrator race: who conserves probability?">
      <Slider label={<span>time step <Tex>{'\\Delta t'}</Tex></span>} value={dt} min={0.02} max={0.6} step={0.01} onChange={setDt} format={(v) => v.toFixed(2)} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
        <div>
          <div className="faint center" style={{ fontSize: '0.82rem' }}>
            total probability <Tex>{'\\langle\\psi|\\psi\\rangle'}</Tex>
          </div>
          <Plot
            height={230}
            width={420}
            xRange={[0, Tmax]}
            yRange={[0, yMax]}
            xLabel="t"
            series={[
              { points: data.eulerN, color: '#fc6255', label: 'Euler', width: 2.2 },
              { points: data.cnN, color: '#83c167', label: 'Crank–Nicolson', width: 2.2 },
              { f: () => 1, color: '#fcd34d', dashed: true, label: 'exact' },
            ]}
          />
        </div>
        <div>
          <div className="faint center" style={{ fontSize: '0.82rem' }}>
            "probability" of <Tex>{'|1\\rangle'}</Tex> (Rabi-like flopping)
          </div>
          <Plot
            height={230}
            width={420}
            xRange={[0, Tmax]}
            yRange={[0, Math.min(yMax, 3)]}
            xLabel="t"
            series={[
              { points: data.eulerP, color: '#fc6255', label: 'Euler', width: 2 },
              { points: data.cnP, color: '#83c167', label: 'CN', width: 2 },
              { f: (t) => Math.sin(t / 2) ** 2, color: '#fcd34d', dashed: true, label: 'exact', samples: 300 },
            ]}
          />
        </div>
      </div>
      <div className="row" style={{ gap: 16, fontSize: '0.85rem', marginTop: 4, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--red)' }}>■ forward Euler: total probability at t = 30 is {data.finalEuler.toFixed(2)}</span>
        <span style={{ color: 'var(--green)' }}>■ Crank–Nicolson (unitary): stays 1.000</span>
        <span style={{ color: 'var(--yellow)' }}>┄ exact</span>
      </div>
    </Widget>
  );
}
