import React, { useMemo, useState } from 'react';
import { Widget, Slider, Tex, fmtPi, Segmented } from '../../../components/ui';
import { BlochSphere } from '../../../widgets/BlochSphere';
import { MiniBloch } from '../../../widgets/MiniBloch';
import { StateVector, DensityMatrix, Ry, GATES } from '../../../engine/qsim';
import { stateToKetString } from '../../../engine/circuit';
import { DensityHeatmap, mat2Tex, Meter, type Vec3 } from './rho';

type BobAction = 'none' | 'Z' | 'X';

/**
 * Two qubits: Ry(α) on Alice, then a controlled-Ry(β) from Alice to Bob (β = π is a CNOT-like gate).
 * Shows the full 4×4 ρ, Alice's reduced 2×2 ρ_A = Tr_B ρ, its Bloch vector inside the ball, and the purity.
 * Bob may measure his qubit (result kept secret): ρ_A does not change.
 */
export function ReducedStateExplorer() {
  const [alpha, setAlpha] = useState(Math.PI / 2);
  const [beta, setBeta] = useState(Math.PI / 3);
  const [bob, setBob] = useState<BobAction>('none');

  const { sv, dm, rhoA, vA, vB, purity, ent } = useMemo(() => {
    const s = new StateVector(2);
    s.apply(Ry(alpha), 0);
    s.apply(Ry(beta), 1, [0]);
    let d = DensityMatrix.fromState(s);
    if (bob !== 'none') {
      // Bob measures and does not tell Alice: average over outcomes = dephase in his basis
      if (bob === 'X') d.apply(GATES.H, 1);
      const d0 = d.clone(), d1 = d.clone();
      // project onto 0 / 1 on qubit 1 without renormalising
      for (const [dd, keep] of [[d0, 0], [d1, 1]] as [DensityMatrix, number][])
        for (let i = 0; i < 4; i++)
          for (let j = 0; j < 4; j++) if ((i & 1) !== keep || (j & 1) !== keep) { dd.re[i * 4 + j] = 0; dd.im[i * 4 + j] = 0; }
      d = d0;
      for (let k = 0; k < 16; k++) { d.re[k] += d1.re[k]; d.im[k] += d1.im[k]; }
      if (bob === 'X') d.apply(GATES.H, 1);
    }
    const rA = d.reduced1(0);
    const vA = d.bloch(0) as Vec3;
    const vB = d.bloch(1) as Vec3;
    const len = Math.hypot(...vA);
    const l1 = (1 + len) / 2, l2 = (1 - len) / 2;
    const h = (p: number) => (p > 1e-12 ? -p * Math.log2(p) : 0);
    return { sv: s, dm: d, rhoA: rA, vA, vB, purity: (1 + len * len) / 2, ent: h(l1) + h(l2) };
  }, [alpha, beta, bob]);

  return (
    <Widget title="Half of an entangled pair">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(250px,1fr) 1fr', gap: 16 }}>
        <div>
          <BlochSphere ball vector={vA} color="#e07ab6" height={300} />
          <div className="faint center" style={{ fontSize: '0.8rem' }}>Alice's qubit on its own (reduced state ρ_A)</div>
        </div>
        <div className="col" style={{ gap: 8 }}>
          <Slider label={<span>Alice <Tex>{'R_y(\\alpha)'}</Tex></span>} value={alpha} min={0} max={Math.PI} step={Math.PI / 48} onChange={setAlpha} format={fmtPi} />
          <Slider label={<span>entangler <Tex>{'\\beta'}</Tex></span>} value={beta} min={0} max={Math.PI} step={Math.PI / 48} onChange={setBeta} format={fmtPi} />
          <div className="row" style={{ gap: 6 }}>
            <button className="btn small" onClick={() => { setAlpha(Math.PI / 2); setBeta(Math.PI); }}>Bell state Φ⁺</button>
            <button className="btn small" onClick={() => { setAlpha(Math.PI / 2); setBeta(0); }}>product |+⟩|0⟩</button>
          </div>
          <div className="mono" style={{ fontSize: '0.85rem', wordBreak: 'break-word' }}>
            |ψ⟩ = {stateToKetString(sv.clone().canonicalPhase(), 3)}
          </div>
          <div>
            <div className="faint" style={{ fontSize: '0.78rem' }}>Far away, Bob secretly…</div>
            <Segmented value={bob} onChange={setBob} options={[{ value: 'none', label: 'does nothing' }, { value: 'Z', label: 'measures Z' }, { value: 'X', label: 'measures X' }]} />
          </div>
          <Meter label="purity of ρ_A" value={(purity - 0.5) * 2} color="var(--yellow)" fmt={() => purity.toFixed(3)} />
          <Meter label="entropy S(ρ_A)" value={ent} color="var(--pink)" fmt={(v) => `${v.toFixed(3)} bit`} />
          <div className="row" style={{ gap: 10 }}>
            <MiniBloch v={vA} label="Alice" color="#e07ab6" />
            <MiniBloch v={vB} label="Bob" color="#58c4dd" />
          </div>
        </div>
      </div>
      <div className="row" style={{ gap: 20, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <DensityHeatmap get={(i, j) => dm.get(i, j)} dim={4} size={190} title="full ρ (4×4)" />
        <div style={{ fontSize: '1.4rem', color: 'var(--text-faint)' }}>→ Tr_B →</div>
        <DensityHeatmap get={(i, j) => rhoA[i][j]} dim={2} size={130} title="ρ_A (2×2)" labels={['0', '1']} />
        <div style={{ fontSize: '1rem' }}>
          <Tex>{`\\rho_A = ${mat2Tex(rhoA as any)}`}</Tex>
        </div>
      </div>
      {bob !== 'none' && (
        <div className="faint" style={{ fontSize: '0.82rem', marginTop: 6 }}>
          Bob's measurement destroyed the entanglement (the full ρ lost its off-diagonal corners) — yet ρ_A is exactly what it was before. Alice cannot notice
          anything: no signalling.
        </div>
      )}
    </Widget>
  );
}
