import React, { useMemo, useState } from 'react';
import { Widget, Segmented, Toggle } from '../../../components/ui';
import { CircuitLab } from '../../../widgets/CircuitLab';
import { runCircuit } from '../../../engine/circuit';
import { parseCircuit } from '../../../engine/parse';
import { abs2, conj, mul, add, c, type C } from '../../../engine/complex';

type F = 'xor' | 'x0' | 'and' | 'or' | 'one';
const FUNCS: Record<F, { label: string; tex: string; compute: string[] }> = {
  xor: { label: 'x₀ ⊕ x₁', tex: 'XOR', compute: ['CNOT 0 2', 'CNOT 1 2'] },
  x0: { label: 'x₀', tex: 'copy x₀', compute: ['CNOT 0 2'] },
  and: { label: 'x₀ ∧ x₁', tex: 'AND', compute: ['CCX 0 1 2'] },
  or: { label: 'x₀ ∨ x₁', tex: 'OR', compute: ['CNOT 0 2', 'CNOT 1 2', 'CCX 0 1 2'] },
  one: { label: '1 (constant)', tex: 'constant 1', compute: ['X 2'] },
};

export function circuitText(f: F, uncompute: boolean): string {
  const comp = FUNCS[f].compute;
  const parts = ['H 0 1', ...comp, 'Z 2', ...(uncompute ? [...comp].reverse() : []), 'H 0 1'];
  return parts.join('; ');
}

/** Marginal distribution of the x register (q0 q1) and the purity of its reduced state. */
export function analyse(text: string) {
  const { state } = runCircuit(parseCircuit(text, 3), { measure: 'skip' });
  const a = state.amplitudes(); // index = 4 q0 + 2 q1 + q2
  const px = [0, 1, 2, 3].map((x) => abs2(a[2 * x]) + abs2(a[2 * x + 1]));
  // ρ_x[i][j] = Σ_w a(i,w) a(j,w)*
  let purity = 0;
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      let z: C = c(0);
      for (let w = 0; w < 2; w++) z = add(z, mul(a[2 * i + w], conj(a[2 * j + w])));
      purity += abs2(z);
    }
  // probability the garbage qubit reads 1 at the end
  const pw = [0, 1, 2, 3].reduce((s, x) => s + abs2(a[2 * x + 1]), 0);
  return { px, purity, pw };
}

function Bars({ px, color, title }: { px: number[]; color: string; title: string }) {
  return (
    <div style={{ flex: 1, minWidth: 200 }}>
      <div className="faint" style={{ fontSize: '0.8rem', marginBottom: 4, textAlign: 'center' }}>{title}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 130, padding: '0 8px', borderBottom: '1px solid var(--border)' }}>
        {px.map((p, k) => (
          <div key={k} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
            <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{(p * 100).toFixed(1)}%</span>
            <div style={{ width: '70%', height: `${p * 100}px`, background: color, borderRadius: '4px 4px 0 0', transition: 'height .45s cubic-bezier(.2,.8,.2,1)' }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, padding: '2px 8px' }}>
        {['00', '01', '10', '11'].map((s) => (
          <span key={s} className="mono faint" style={{ flex: 1, textAlign: 'center', fontSize: '0.78rem' }}>{s}</span>
        ))}
      </div>
    </div>
  );
}

/**
 * Phase oracle by compute → Z → uncompute, inside a Hadamard "interferometer". Toggle the
 * uncompute step and watch the garbage qubit wreck (or not) the interference pattern.
 */
export function GarbageDemo() {
  const [f, setF] = useState<F>('xor');
  const [unc, setUnc] = useState(true);
  const clean = useMemo(() => analyse(circuitText(f, true)), [f]);
  const dirty = useMemo(() => analyse(circuitText(f, false)), [f]);
  const cur = unc ? clean : dirty;
  const text = circuitText(f, unc);
  const harmed = Math.abs(clean.purity - dirty.purity) > 1e-6;

  return (
    <Widget title="Garbage ruins interference">
      <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <span className="faint" style={{ fontSize: '0.85rem' }}>f(x) =</span>
        <Segmented options={(Object.keys(FUNCS) as F[]).map((k) => ({ value: k, label: FUNCS[k].label }))} value={f} onChange={setF} />
        <Toggle label="uncompute the scratch qubit" value={unc} onChange={setUnc} />
      </div>
      <div className="faint" style={{ fontSize: '0.86rem', marginBottom: 6 }}>
        Recipe: Hadamards on x · compute f(x) into the scratch qubit “tmp” · Z on tmp gives the phase (−1)<sup>f(x)</sup> · {unc ? 'run the computation backwards to clean tmp' : <b style={{ color: 'var(--red)' }}>leave f(x) sitting in tmp</b>} · Hadamards on x · measure x.
      </div>
      <CircuitLab
        key={text}
        title={unc ? 'Clean phase oracle (compute, phase, uncompute)' : 'Dirty phase oracle (garbage left behind)'}
        n={3}
        circuit={text}
        editable={false}
        qubitLabels={['x₀', 'x₁', 'tmp']}
        showAmplitudes={false}
        showBloch
        stepper
        columns={4}
      />
      <div className="row" style={{ gap: 18, marginTop: 10, flexWrap: 'wrap' }}>
        <Bars px={clean.px} color="linear-gradient(180deg,#83c167,#5a9a43)" title="x outcomes WITH uncomputation" />
        <Bars px={dirty.px} color="linear-gradient(180deg,#fc6255,#c2453b)" title="x outcomes with garbage left behind" />
      </div>
      <div className="panel" style={{ marginTop: 10, padding: 10, borderColor: harmed ? (unc ? 'var(--green)' : 'var(--red)') : 'var(--border)' }}>
        <div style={{ fontSize: '0.9rem' }}>
          Purity of the x register: <span className="mono" style={{ color: cur.purity > 0.999 ? 'var(--green)' : 'var(--red)' }}>{cur.purity.toFixed(3)}</span>
          {cur.purity > 0.999 ? ' — a pure state, free to interfere.' : ' — mixed: the scratch qubit holds which-path information about x.'}
        </div>
        <div className="faint" style={{ fontSize: '0.85rem', marginTop: 4 }}>
          {!harmed
            ? 'Here the garbage is the same for every x (it carries no information about x), so it is harmless: it factors out, like a global phase.'
            : f === 'xor'
              ? 'Clean: (−1)^(x₀⊕x₁) interferes into |11⟩ with certainty. Dirty: the scratch qubit "knows" the parity, and the pattern washes out to a coin flip.'
              : f === 'x0'
                ? 'Clean: the answer |10⟩ every time. Dirty: tmp has copied x₀ — a which-path detector — so x₀ no longer interferes at all.'
                : 'Compare the two histograms: the scratch qubit is entangled with x, so the x register alone is no longer in a pure superposition.'}
        </div>
      </div>
    </Widget>
  );
}
