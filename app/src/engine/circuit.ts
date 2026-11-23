/**
 * Circuit model shared by Circuit Lab, puzzles, games and lessons.
 */
import { C, Mat, ONE, ZERO, abs2, mul, conj, c } from './complex';
import { GATES, Mat2, Rx, Ry, Rz, Phase, StateVector, RNG, DensityMatrix, Noise } from './qsim';

export type GateName =
  | 'I' | 'X' | 'Y' | 'Z' | 'H' | 'S' | 'Sdg' | 'T' | 'Tdg' | 'SX'
  | 'Rx' | 'Ry' | 'Rz' | 'P'
  | 'CNOT' | 'CZ' | 'SWAP' | 'CCX' | 'CP'
  | 'M';

export interface Op {
  gate: GateName;
  /** Target qubit(s). SWAP has two targets. */
  targets: number[];
  /** Control qubits (CNOT/CZ/CCX/CP, or any controlled single-qubit gate). */
  controls?: number[];
  /** Angle parameter for Rx/Ry/Rz/P/CP (radians). */
  param?: number;
}

export interface Circuit {
  n: number;
  /** Ops grouped in columns (time steps); ops in a column act on disjoint qubits. */
  columns: Op[][];
}

export interface GateInfo {
  name: GateName;
  label: string;
  color: string;
  qubits: number; // number of wires touched in a default placement
  hasParam?: boolean;
  description: string;
}

export const GATE_INFO: Record<GateName, GateInfo> = {
  I: { name: 'I', label: 'I', color: '#666', qubits: 1, description: 'Identity: does nothing.' },
  X: { name: 'X', label: 'X', color: '#e8655a', qubits: 1, description: 'Pauli-X (quantum NOT): rotates π about the x-axis, swaps |0⟩ and |1⟩.' },
  Y: { name: 'Y', label: 'Y', color: '#83c167', qubits: 1, description: 'Pauli-Y: rotates π about the y-axis.' },
  Z: { name: 'Z', label: 'Z', color: '#58c4dd', qubits: 1, description: 'Pauli-Z (phase flip): rotates π about the z-axis, |1⟩ → −|1⟩.' },
  H: { name: 'H', label: 'H', color: '#f4d35e', qubits: 1, description: 'Hadamard: swaps the z- and x-axes. |0⟩ → |+⟩, |1⟩ → |−⟩.' },
  S: { name: 'S', label: 'S', color: '#9a72ac', qubits: 1, description: 'S gate: quarter turn (π/2) about z. |1⟩ → i|1⟩.' },
  Sdg: { name: 'Sdg', label: 'S†', color: '#9a72ac', qubits: 1, description: 'S-dagger: −π/2 about z. Undoes S.' },
  T: { name: 'T', label: 'T', color: '#c97bd1', qubits: 1, description: 'T gate: eighth turn (π/4) about z. |1⟩ → e^{iπ/4}|1⟩.' },
  Tdg: { name: 'Tdg', label: 'T†', color: '#c97bd1', qubits: 1, description: 'T-dagger: −π/4 about z.' },
  SX: { name: 'SX', label: '√X', color: '#e8655a', qubits: 1, description: 'Square root of X: half of an X rotation.' },
  Rx: { name: 'Rx', label: 'Rx', color: '#ff8a65', qubits: 1, hasParam: true, description: 'Rotate by angle θ about the x-axis.' },
  Ry: { name: 'Ry', label: 'Ry', color: '#a5d6a7', qubits: 1, hasParam: true, description: 'Rotate by angle θ about the y-axis.' },
  Rz: { name: 'Rz', label: 'Rz', color: '#81d4fa', qubits: 1, hasParam: true, description: 'Rotate by angle θ about the z-axis.' },
  P: { name: 'P', label: 'P', color: '#b39ddb', qubits: 1, hasParam: true, description: 'Phase gate: |1⟩ → e^{iφ}|1⟩.' },
  CNOT: { name: 'CNOT', label: '⊕', color: '#e8655a', qubits: 2, description: 'Controlled-NOT: flips the target if the control is |1⟩.' },
  CZ: { name: 'CZ', label: 'CZ', color: '#58c4dd', qubits: 2, description: 'Controlled-Z: phase −1 on |11⟩. Symmetric in its two qubits.' },
  SWAP: { name: 'SWAP', label: '×', color: '#bbb', qubits: 2, description: 'Swaps the states of two qubits.' },
  CCX: { name: 'CCX', label: '⊕', color: '#ff7043', qubits: 3, description: 'Toffoli (CCNOT): flips the target if both controls are |1⟩.' },
  CP: { name: 'CP', label: 'P', color: '#b39ddb', qubits: 2, hasParam: true, description: 'Controlled phase: phase e^{iφ} on |11⟩.' },
  M: { name: 'M', label: 'M', color: '#ddd', qubits: 1, description: 'Measure in the computational basis.' },
};

export function gateMatrix(op: Op): Mat2 | null {
  const p = op.param ?? Math.PI / 2;
  switch (op.gate) {
    case 'I': return GATES.I;
    case 'X': case 'CNOT': case 'CCX': return GATES.X;
    case 'Y': return GATES.Y;
    case 'Z': case 'CZ': return GATES.Z;
    case 'H': return GATES.H;
    case 'S': return GATES.S;
    case 'Sdg': return GATES.Sdg;
    case 'T': return GATES.T;
    case 'Tdg': return GATES.Tdg;
    case 'SX': return GATES.SX;
    case 'Rx': return Rx(p);
    case 'Ry': return Ry(p);
    case 'Rz': return Rz(p);
    case 'P': case 'CP': return Phase(p);
    default: return null;
  }
}

export interface RunOptions {
  /** Run only columns [0, upTo). Default: all. */
  upTo?: number;
  /** How to treat M gates: 'collapse' samples with rng; 'skip' ignores them (pure unitary view). */
  measure?: 'collapse' | 'skip';
  rng?: RNG;
  initial?: StateVector;
}

export interface RunResult {
  state: StateVector;
  /** measurement outcomes in order: [qubit, outcome] */
  measurements: [number, 0 | 1][];
}

export function applyOp(s: StateVector, op: Op, opts: RunOptions = {}, record?: [number, 0 | 1][]) {
  if (op.gate === 'M') {
    if ((opts.measure ?? 'collapse') === 'collapse') {
      for (const q of op.targets) {
        const r = s.measure(q, opts.rng ?? Math.random);
        record?.push([q, r]);
      }
    }
    return;
  }
  if (op.gate === 'SWAP') {
    if (op.controls?.length) {
      // Fredkin via three Toffolis-like controlled swaps
      const [a, b] = op.targets;
      s.apply(GATES.X, b, [a]);
      s.apply(GATES.X, a, [b, ...op.controls]);
      s.apply(GATES.X, b, [a]);
    } else s.swap(op.targets[0], op.targets[1]);
    return;
  }
  const m = gateMatrix(op);
  if (!m) return;
  for (const t of op.targets) s.apply(m, t, op.controls ?? []);
}

export function runCircuit(circ: Circuit, opts: RunOptions = {}): RunResult {
  const s = opts.initial ? opts.initial.clone() : new StateVector(circ.n);
  const measurements: [number, 0 | 1][] = [];
  const upTo = Math.min(opts.upTo ?? circ.columns.length, circ.columns.length);
  for (let col = 0; col < upTo; col++) for (const op of circ.columns[col]) applyOp(s, op, opts, measurements);
  return { state: s, measurements };
}

/** Full unitary of a measurement-free circuit (columns of U are images of basis states). */
export function circuitUnitary(circ: Circuit): Mat {
  const dim = 1 << circ.n;
  const U: Mat = Array.from({ length: dim }, () => Array.from({ length: dim }, () => ZERO));
  for (let j = 0; j < dim; j++) {
    const { state } = runCircuit(circ, { initial: new StateVector(circ.n, j), measure: 'skip' });
    for (let i = 0; i < dim; i++) U[i][j] = state.amplitude(i);
  }
  return U;
}

/** |Tr(A† B)| / dim — equals 1 iff A = e^{iφ} B. */
export function unitaryOverlap(A: Mat, B: Mat): number {
  let re = 0, im = 0;
  for (let i = 0; i < A.length; i++)
    for (let j = 0; j < A.length; j++) {
      const z = mul(conj(A[i][j]), B[i][j]);
      re += z.re;
      im += z.im;
    }
  return Math.hypot(re, im) / A.length;
}

export function countGates(circ: Circuit, exclude: GateName[] = ['I']): number {
  return circ.columns.reduce((acc, col) => acc + col.filter((o) => !exclude.includes(o.gate)).length, 0);
}

export function emptyCircuit(n: number, cols = 12): Circuit {
  return { n, columns: Array.from({ length: cols }, () => []) };
}

/** Build a circuit from a compact list of ops; each op gets its own column. */
export function seq(n: number, ops: Op[]): Circuit {
  return { n, columns: ops.map((o) => [o]) };
}

/** Wires touched by an op (for layout/collision checks). */
export function opWires(op: Op): number[] {
  return [...op.targets, ...(op.controls ?? [])];
}

/** Range of wires spanned by an op (min..max), used to draw vertical connector lines. */
export function opSpan(op: Op): [number, number] {
  const w = opWires(op);
  return [Math.min(...w), Math.max(...w)];
}

/** Run a circuit with a simple noise model on a density matrix (small n only). */
export function runNoisy(
  circ: Circuit,
  noise: { depol1?: number; depol2?: number; t1?: number; t2?: number; readout?: number },
  upTo?: number,
): DensityMatrix {
  const d = new DensityMatrix(circ.n);
  const end = Math.min(upTo ?? circ.columns.length, circ.columns.length);
  for (let col = 0; col < end; col++) {
    for (const op of circ.columns[col]) {
      if (op.gate === 'M') continue;
      if (op.gate === 'SWAP') {
        const [a, b] = op.targets;
        d.apply(GATES.X, b, [a]).apply(GATES.X, a, [b]).apply(GATES.X, b, [a]);
      } else {
        const m = gateMatrix(op);
        if (m) for (const t of op.targets) d.apply(m, t, op.controls ?? []);
      }
      const wires = opWires(op);
      const p = wires.length > 1 ? noise.depol2 ?? 0 : noise.depol1 ?? 0;
      if (p > 0) for (const w of wires) d.channel(Noise.depolarizing(p), w);
    }
    // idle decoherence on every qubit each time step
    for (let q = 0; q < circ.n; q++) {
      if (noise.t1) d.channel(Noise.amplitudeDamping(noise.t1), q);
      if (noise.t2) d.channel(Noise.phaseDamping(noise.t2), q);
    }
  }
  return d;
}

/** Helpers to describe a state as a readable ket string, e.g. "0.707|00⟩ + 0.707|11⟩". */
export function stateToKetString(s: StateVector, digits = 3, maxTerms = 8): string {
  const terms: string[] = [];
  const amps = s.amplitudes();
  const sorted = amps
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => abs2(a) > 1e-6);
  for (const { a, i } of sorted.slice(0, maxTerms)) {
    const label = i.toString(2).padStart(s.n, '0');
    const r = a.re, im = a.im;
    let coef: string;
    const f = (x: number) => x.toFixed(digits).replace(/\.?0+$/, '');
    if (Math.abs(im) < 1e-6) coef = f(r);
    else if (Math.abs(r) < 1e-6) coef = `${f(im)}i`;
    else coef = `(${f(r)}${im < 0 ? '−' : '+'}${f(Math.abs(im))}i)`;
    terms.push(`${coef}|${label}⟩`);
  }
  if (sorted.length > maxTerms) terms.push('…');
  return terms.join(' + ').replace(/\+ -/g, '− ') || '0';
}

export { ONE, ZERO, c };
export type { C };
