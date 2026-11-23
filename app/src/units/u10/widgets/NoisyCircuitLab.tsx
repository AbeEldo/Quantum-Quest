import React, { useMemo, useState } from 'react';
import { Widget, Slider, Segmented } from '../../../components/ui';
import { Plot } from '../../../widgets/Plot';
import { mulberry32, StateVector, DensityMatrix } from '../../../engine/qsim';
import { runNoisy, type Circuit, type Op, type GateName } from '../../../engine/circuit';
import { DensityHeatmap } from './rho';

type Family = 'mirror' | 'ghz';
interface NoiseModel {
  depol1: number;
  depol2: number;
  t1: number;
  t2: number;
}

const PRESETS: { label: string; m: NoiseModel }[] = [
  { label: 'Perfect', m: { depol1: 0, depol2: 0, t1: 0, t2: 0 } },
  { label: 'Good (≈ today’s best)', m: { depol1: 0.0005, depol2: 0.003, t1: 0.0005, t2: 0.001 } },
  { label: 'Mediocre', m: { depol1: 0.002, depol2: 0.01, t1: 0.002, t2: 0.004 } },
  { label: 'Bad', m: { depol1: 0.01, depol2: 0.04, t1: 0.01, t2: 0.02 } },
];

const ONEQ: GateName[] = ['H', 'S', 'T', 'X', 'Y', 'Z', 'Sdg', 'Tdg'];
const INV: Partial<Record<GateName, GateName>> = { S: 'Sdg', Sdg: 'S', T: 'Tdg', Tdg: 'T' };

/** k random layers (1q gates + CNOT brickwork) followed by their exact inverse: ideally returns to |0…0⟩. */
function mirrorCircuit(n: number, k: number, seed: number): Circuit {
  const rng = mulberry32(seed);
  const layers: Op[][][] = [];
  for (let l = 0; l < 64; l++) {
    const one: Op[] = Array.from({ length: n }, (_, q) => ({ gate: ONEQ[Math.floor(rng() * ONEQ.length)], targets: [q] }));
    const two: Op[] = [];
    for (let q = l % 2; q + 1 < n; q += 2) two.push({ gate: 'CNOT', controls: [q], targets: [q + 1] });
    layers.push([one, two]);
  }
  const fwd = layers.slice(0, k);
  const cols: Op[][] = [];
  for (const [one, two] of fwd) {
    cols.push(one);
    if (two.length) cols.push(two);
  }
  for (const [one, two] of [...fwd].reverse()) {
    if (two.length) cols.push(two);
    cols.push(one.map((o) => ({ ...o, gate: INV[o.gate] ?? o.gate })));
  }
  return { n, columns: cols };
}

/** Prepare an n-qubit GHZ state, then let it sit idle for k time steps. */
function ghzCircuit(n: number, k: number): Circuit {
  const cols: Op[][] = [[{ gate: 'H', targets: [0] }]];
  for (let q = 0; q + 1 < n; q++) cols.push([{ gate: 'CNOT', controls: [q], targets: [q + 1] }]);
  for (let i = 0; i < k; i++) cols.push([]);
  return { n, columns: cols };
}

function ghzState(n: number): StateVector {
  const s = new StateVector(n);
  s.h(0);
  for (let q = 0; q + 1 < n; q++) s.cx(q, q + 1);
  return s;
}

function counts(c: Circuit) {
  let g1 = 0, g2 = 0;
  for (const col of c.columns) for (const o of col) (o.controls?.length ? g2++ : g1++);
  return { g1, g2, depth: c.columns.length };
}

/** Noisy Circuit Lab: fidelity vs depth under a tunable noise model (density-matrix simulation). */
export function NoisyCircuitLab() {
  const [family, setFamily] = useState<Family>('mirror');
  const [n, setN] = useState(3);
  const [m, setM] = useState<NoiseModel>(PRESETS[2].m);
  const [k, setK] = useState(6);
  const [seed, setSeed] = useState(5);
  const KMAX = family === 'mirror' ? 30 : 120;
  const kk = Math.min(k, KMAX);

  const build = (kv: number) => (family === 'mirror' ? mirrorCircuit(n, kv, seed) : ghzCircuit(n, kv));
  const ideal = useMemo(() => (family === 'mirror' ? new StateVector(n) : ghzState(n)), [family, n]);
  const fidOf = (d: DensityMatrix) => d.fidelityPure(ideal);

  const curve = useMemo(() => {
    const pts: [number, number][] = [];
    const step = family === 'mirror' ? 1 : 4;
    for (let kv = 0; kv <= KMAX; kv += step) pts.push([kv, fidOf(runNoisy(build(kv), m))]);
    return pts;
  }, [family, n, m, seed]);
  const circ = build(kk);
  const dm = useMemo(() => runNoisy(circ, m), [family, n, m, seed, kk]);
  const F = fidOf(dm);
  const { g1, g2, depth } = counts(circ);
  const setNoise = (patch: Partial<NoiseModel>) => setM((o) => ({ ...o, ...patch }));
  const pct = (x: number) => `${(x * 100).toFixed(2)}%`;

  return (
    <Widget title="Noisy Circuit Lab">
      <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <Segmented
          value={family}
          onChange={(f) => {
            setFamily(f);
            setK(f === 'mirror' ? 6 : 40);
          }}
          options={[
            { value: 'mirror', label: 'Mirror circuit (U then U†)' },
            { value: 'ghz', label: 'GHZ state, then idle' },
          ]}
        />
        <Segmented value={n} onChange={setN} options={[2, 3, 4].map((v) => ({ value: v, label: `${v} qubits` }))} />
        {family === 'mirror' && (
          <button className="btn small" onClick={() => setSeed((s) => s + 1)}>🎲 new random circuit</button>
        )}
      </div>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        <span className="faint" style={{ fontSize: '0.82rem' }}>Noise presets:</span>
        {PRESETS.map((p) => (
          <button key={p.label} className={`btn small ${JSON.stringify(p.m) === JSON.stringify(m) ? 'active' : ''}`} onClick={() => setM(p.m)}>
            {p.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 18px' }}>
        <Slider label="1-qubit gate error" value={m.depol1} min={0} max={0.02} step={0.0005} onChange={(v) => setNoise({ depol1: v })} format={pct} />
        <Slider label="2-qubit gate error" value={m.depol2} min={0} max={0.06} step={0.0005} onChange={(v) => setNoise({ depol2: v })} format={pct} />
        <Slider label="T₁ decay / step (γ)" value={m.t1} min={0} max={0.02} step={0.0005} onChange={(v) => setNoise({ t1: v })} format={pct} />
        <Slider label="dephasing / step (λ)" value={m.t2} min={0} max={0.03} step={0.0005} onChange={(v) => setNoise({ t2: v })} format={pct} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px,1.4fr) auto', gap: 16, alignItems: 'center', marginTop: 6 }}>
        <div>
          <Plot
            height={230}
            xRange={[0, KMAX]}
            yRange={[0, 1]}
            xLabel={family === 'mirror' ? 'layers k (circuit = k layers + k inverse layers)' : 'idle time steps'}
            yLabel="fidelity"
            series={[
              { points: curve, color: '#83c167', label: 'fidelity with ideal output' },
              { f: () => 1 / (1 << n), color: '#fc6255', dashed: true, label: 'random guessing' },
            ]}
            vlines={[{ x: kk, color: '#fcd34d' }]}
          />
          <Slider label={family === 'mirror' ? 'layers k' : 'idle steps'} value={kk} min={0} max={KMAX} step={1} onChange={setK} format={(x) => `${x}`} />
        </div>
        <div className="col" style={{ gap: 6, alignItems: 'center' }}>
          <DensityHeatmap get={(i, j) => dm.get(i, j)} dim={1 << n} size={n === 4 ? 230 : 200} title="final ρ (simulated)" />
          <div className="mono" style={{ fontSize: '0.82rem', textAlign: 'center' }}>
            F = <b style={{ color: F > 0.9 ? 'var(--green)' : F > 0.5 ? 'var(--yellow)' : 'var(--red)' }}>{F.toFixed(3)}</b> · purity {dm.purity().toFixed(3)}
            <br />
            {g1} one-qubit + {g2} two-qubit gates, {depth} time steps
          </div>
        </div>
      </div>
    </Widget>
  );
}
