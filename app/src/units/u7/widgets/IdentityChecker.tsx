import React, { useMemo, useState } from 'react';
import { Widget, fmtPi } from '../../../components/ui';
import { CircuitLab } from '../../../widgets/CircuitLab';
import { circuitUnitary, unitaryOverlap, stateToKetString, type Circuit, type GateName } from '../../../engine/circuit';
import { parseCircuit } from '../../../engine/parse';
import { StateVector } from '../../../engine/qsim';
import { abs, arg, conj, mul, type Mat } from '../../../engine/complex';
import { MatrixGrid } from './MatrixGrid';

interface Preset {
  name: string;
  n: number;
  A: string;
  B: string;
  note: string;
}

const PRESETS: Preset[] = [
  { name: 'HXH = Z ?', n: 1, A: 'H 0; X 0; H 0', B: 'Z 0', note: 'Conjugating by H swaps the x- and z-axes.' },
  { name: 'HZH = X ?', n: 1, A: 'H 0; Z 0; H 0', B: 'X 0', note: 'The same fact read the other way round.' },
  { name: 'HYH = Y ?', n: 1, A: 'H 0; Y 0; H 0', B: 'Y 0', note: 'H flips the y-axis: HYH = −Y. Equal up to a global phase of −1, so physically the same gate.' },
  { name: 'Rz(π/2) = S ?', n: 1, A: 'Rz(pi/2) 0', B: 'S 0', note: 'Different matrices, same physics: they differ by the global phase e^{−iπ/4}.' },
  { name: 'CNOT flipped by H', n: 2, A: 'H 0 1; CNOT 0 1; H 0 1', B: 'CNOT 1 0', note: 'Hadamards on both wires reverse a CNOT\'s direction.' },
  { name: 'CZ from CNOT', n: 2, A: 'H 1; CNOT 0 1; H 1', B: 'CZ 0 1', note: 'CZ = (I⊗H) CNOT (I⊗H).' },
  { name: 'CZ is symmetric', n: 2, A: 'CZ 0 1', B: 'CZ 1 0', note: 'Control and target are interchangeable for CZ.' },
  { name: 'SWAP = 3 CNOTs', n: 2, A: 'CNOT 0 1; CNOT 1 0; CNOT 0 1', B: 'SWAP 0 1', note: 'The XOR-swap trick, made quantum.' },
  { name: 'Z on control commutes', n: 2, A: 'Z 0; CNOT 0 1', B: 'CNOT 0 1; Z 0', note: 'Z on a control slides straight through.' },
  { name: 'X on control?', n: 2, A: 'X 0; CNOT 0 1', B: 'CNOT 0 1; X 0', note: 'Not equal! Can you fix circuit B by adding one gate?' },
  { name: 'Z on target?', n: 2, A: 'Z 1; CNOT 0 1', B: 'CNOT 0 1; Z 1', note: 'Not equal! Can you fix circuit B by adding one gate?' },
  { name: 'Toffoli controls swap', n: 3, A: 'CCX 0 1 2', B: 'CCX 1 0 2', note: 'The two controls of a Toffoli play identical roles.' },
  { name: 'free play (3 qubits)', n: 3, A: 'H 2; CCX 0 1 2; H 2', B: '', note: 'Build anything. Here A is a doubly-controlled Z — try other qubits as "target".' },
];

const PALETTE: GateName[] = ['H', 'X', 'Y', 'Z', 'S', 'T', 'Rz', 'CNOT', 'CZ', 'SWAP', 'CCX'];

function counterexample(A: Mat, B: Mat, n: number): { label: string; a: string; b: string; fid: number } | null {
  const dim = 1 << n;
  const cands: { label: string; v: StateVector }[] = [];
  for (let j = 0; j < dim; j++) cands.push({ label: `|${j.toString(2).padStart(n, '0')}⟩`, v: new StateVector(n, j) });
  const plus = new StateVector(n);
  for (let q = 0; q < n; q++) plus.h(q);
  cands.push({ label: `|${'+'.repeat(n)}⟩`, v: plus });
  for (let q = 0; q < n; q++) {
    const s = new StateVector(n);
    s.h(q);
    cands.push({ label: `|${Array.from({ length: n }, (_, k) => (k === q ? '+' : '0')).join('')}⟩`, v: s });
  }
  let worst: { label: string; a: string; b: string; fid: number } | null = null;
  for (const { label, v } of cands) {
    const amps = v.amplitudes();
    const apply = (M: Mat) =>
      StateVector.fromAmplitudes(
        M.map((row) => row.reduce((acc, z, j) => ({ re: acc.re + z.re * amps[j].re - z.im * amps[j].im, im: acc.im + z.re * amps[j].im + z.im * amps[j].re }), { re: 0, im: 0 })),
      );
    const sa = apply(A), sb = apply(B);
    const fid = sa.fidelity(sb);
    if (!worst || fid < worst.fid) worst = { label, a: stateToKetString(sa, 3), b: stateToKetString(sb, 3), fid };
  }
  return worst && worst.fid < 0.9999 ? worst : null;
}

/**
 * Two editable circuits; compares their unitaries entry by entry and up to global phase.
 */
export function IdentityChecker() {
  const [pi, setPi] = useState(0);
  const preset = PRESETS[pi];
  const [ca, setCa] = useState<Circuit>(() => parseCircuit(preset.A, preset.n));
  const [cb, setCb] = useState<Circuit>(() => parseCircuit(preset.B, preset.n));

  const choose = (i: number) => {
    setPi(i);
    setCa(parseCircuit(PRESETS[i].A, PRESETS[i].n));
    setCb(parseCircuit(PRESETS[i].B, PRESETS[i].n));
  };

  const { UA, UB, verdict } = useMemo(() => {
    const n = preset.n;
    const UA = circuitUnitary({ ...ca, n });
    const UB = circuitUnitary({ ...cb, n });
    let maxDiff = 0;
    let tr = { re: 0, im: 0 };
    for (let i = 0; i < UA.length; i++)
      for (let j = 0; j < UA.length; j++) {
        maxDiff = Math.max(maxDiff, abs({ re: UA[i][j].re - UB[i][j].re, im: UA[i][j].im - UB[i][j].im }));
        const z = mul(conj(UA[i][j]), UB[i][j]);
        tr = { re: tr.re + z.re, im: tr.im + z.im };
      }
    const ov = unitaryOverlap(UA, UB);
    const verdict =
      maxDiff < 1e-9
        ? { kind: 'same' as const, ov }
        : ov > 0.9999
          ? { kind: 'phase' as const, ov, phase: arg(tr) }
          : { kind: 'diff' as const, ov, cx: counterexample(UA, UB, n) };
    return { UA, UB, verdict };
  }, [ca, cb, preset.n]);

  const cell = preset.n === 1 ? 52 : preset.n === 2 ? 40 : 26;
  const col = verdict.kind === 'diff' ? 'var(--red)' : 'var(--green)';

  return (
    <Widget title="Identity checker: are these two circuits the same gate?">
      <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {PRESETS.map((p, i) => (
          <button key={p.name} className={`btn small ${pi === i ? 'active' : ''}`} onClick={() => choose(i)}>
            {p.name}
          </button>
        ))}
      </div>
      <div className="faint" style={{ fontSize: '0.88rem', marginBottom: 6 }}>{preset.note}</div>
      <CircuitLab
        key={`A-${pi}`}
        title="Circuit A"
        n={preset.n}
        circuit={preset.A}
        gates={PALETTE}
        columns={6}
        showAmplitudes={false}
        showBloch={false}
        showKet={false}
        stepper={false}
        onChange={setCa}
      />
      <CircuitLab
        key={`B-${pi}`}
        title="Circuit B"
        n={preset.n}
        circuit={preset.B}
        gates={PALETTE}
        columns={6}
        showAmplitudes={false}
        showBloch={false}
        showKet={false}
        stepper={false}
        onChange={setCb}
      />
      <div className="panel" style={{ marginTop: 10, padding: 12, borderColor: col }}>
        <div style={{ fontWeight: 700, color: col, fontSize: '1.05rem' }}>
          {verdict.kind === 'same' && '✓ Identical: the two unitaries are equal entry by entry.'}
          {verdict.kind === 'phase' && `✓ Equal up to a global phase: U_B = e^{i·${fmtPi(verdict.phase)}} · U_A — physically the same gate.`}
          {verdict.kind === 'diff' && '✗ Different gates.'}
        </div>
        <div className="faint mono" style={{ fontSize: '0.82rem', marginTop: 2 }}>
          overlap |Tr(U_A† U_B)| / 2^n = {verdict.ov.toFixed(4)}
        </div>
        {verdict.kind === 'diff' && verdict.cx && (
          <div style={{ fontSize: '0.88rem', marginTop: 6 }}>
            Counterexample — input <span className="mono" style={{ color: 'var(--yellow)' }}>{verdict.cx.label}</span>:
            <div className="mono" style={{ marginLeft: 12 }}>
              A → {verdict.cx.a}
              <br />B → {verdict.cx.b}
            </div>
          </div>
        )}
        <div className="row" style={{ gap: 20, justifyContent: 'center', marginTop: 10, flexWrap: 'wrap' }}>
          <MatrixGrid U={UA} cell={cell} title="U_A" />
          <MatrixGrid U={UB} cell={cell} title="U_B" />
        </div>
      </div>
    </Widget>
  );
}
