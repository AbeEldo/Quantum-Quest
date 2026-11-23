/**
 * Full state-vector simulation of one round of the 3-qubit bit-flip (or phase-flip) code:
 * data qubits 0,1,2 and syndrome ancillas 3 (parity of q0,q1) and 4 (parity of q1,q2).
 */
import { StateVector, GATES, Ry, Phase, type Mat2, type RNG } from '../../../engine/qsim';
import type { C } from '../../../engine/complex';

export interface RoundOptions {
  theta: number;
  phi: number;
  /** -1 for no error */
  errorQubit: number;
  /** error operator (default X for bit-flip code, Z for phase-flip code) */
  error?: Mat2;
  kind?: 'bit' | 'phase';
  rng?: RNG;
  /** force a particular syndrome outcome (post-selection, for "show this branch") */
  forceSyndrome?: [0 | 1, 0 | 1];
}

export interface RoundResult {
  /** encoded state (3 data qubits) */
  encoded: C[];
  /** after the error, before syndrome extraction */
  afterError: C[];
  /** probabilities of syndromes "00","01","10","11" (s1 = parity q0q1, s2 = parity q1q2) */
  syndromeProbs: Record<string, number>;
  syndrome: [0 | 1, 0 | 1];
  /** data state right after measuring the syndrome */
  afterMeasure: C[];
  /** which qubit the decoder flips (-1 = none) */
  correctedQubit: number;
  corrected: C[];
  fidelityBefore: number;
  fidelityAfterCorrection: number;
}

const dataAmps = (s: StateVector, anc: number): C[] => Array.from({ length: 8 }, (_, i) => s.amplitude((i << 2) | anc));

export function decodeSyndrome(s: [number, number]): number {
  if (s[0] && !s[1]) return 0;
  if (s[0] && s[1]) return 1;
  if (!s[0] && s[1]) return 2;
  return -1;
}

export function encodedState(theta: number, phi: number, kind: 'bit' | 'phase' = 'bit'): StateVector {
  const s = new StateVector(5);
  s.apply(Ry(theta), 0).apply(Phase(phi), 0);
  s.cx(0, 1).cx(0, 2);
  if (kind === 'phase') s.h(0).h(1).h(2);
  return s;
}

export function runSyndromeRound(o: RoundOptions): RoundResult {
  const kind = o.kind ?? 'bit';
  const rng = o.rng ?? Math.random;
  const ideal = encodedState(o.theta, o.phi, kind);
  const s = ideal.clone();
  const encoded = dataAmps(s, 0);
  if (o.errorQubit >= 0) s.apply(o.error ?? (kind === 'bit' ? GATES.X : GATES.Z), o.errorQubit);
  const afterError = dataAmps(s, 0);
  const fidelityBefore = s.fidelity(ideal);
  // syndrome extraction
  if (kind === 'phase') s.h(0).h(1).h(2);
  s.cx(0, 3).cx(1, 3).cx(1, 4).cx(2, 4);
  if (kind === 'phase') s.h(0).h(1).h(2);
  const p = s.probabilities();
  const syndromeProbs: Record<string, number> = { '00': 0, '01': 0, '10': 0, '11': 0 };
  p.forEach((v, i) => {
    const key = `${(i >> 1) & 1}${i & 1}`;
    syndromeProbs[key] += v;
  });
  let s1: 0 | 1, s2: 0 | 1;
  if (o.forceSyndrome) {
    [s1, s2] = o.forceSyndrome;
    s.collapse(3, s1);
    s.collapse(4, s2);
  } else {
    s1 = s.measure(3, rng);
    s2 = s.measure(4, rng);
  }
  const anc = (s1 << 1) | s2;
  const afterMeasure = dataAmps(s, anc);
  // reset ancillas
  if (s1) s.x(3);
  if (s2) s.x(4);
  const q = decodeSyndrome([s1, s2]);
  if (q >= 0) s.apply(kind === 'bit' ? GATES.X : GATES.Z, q);
  const corrected = dataAmps(s, 0);
  return {
    encoded,
    afterError,
    syndromeProbs,
    syndrome: [s1, s2],
    afterMeasure,
    correctedQubit: q,
    corrected,
    fidelityBefore,
    fidelityAfterCorrection: s.fidelity(ideal),
  };
}
