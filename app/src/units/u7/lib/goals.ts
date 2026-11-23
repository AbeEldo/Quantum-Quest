/** Helpers to build CircuitLab goals concisely from MDX. */
import { c, type C } from '../../../engine/complex';
import { StateVector } from '../../../engine/qsim';
import { circuitUnitary, runCircuit } from '../../../engine/circuit';
import { parseCircuit } from '../../../engine/parse';
import type { CircuitGoal } from '../../../widgets/CircuitLab';

const fromPairs = (p: [number, number][]) => StateVector.fromAmplitudes(p.map(([a, b]) => c(a, b)));

/** Goal: implement the unitary of a reference circuit (compact text), up to global phase. */
export function unitaryGoal(reference: string, n: number, label?: string): CircuitGoal {
  return { kind: 'unitary', U: circuitUnitary(parseCircuit(reference, n)), label };
}

/** Goal: reach the state a reference circuit produces from |0…0⟩ (or from `initial`). */
export function stateGoalFromCircuit(reference: string, n: number, label?: string, initial?: [number, number][]): CircuitGoal {
  const { state } = runCircuit(parseCircuit(reference, n), { measure: 'skip', initial: initial ? fromPairs(initial) : undefined });
  return { kind: 'state', amps: state.amplitudes(), label };
}

/** Goal: reach the given amplitudes ([re, im] pairs). */
export function stateGoal(amps: [number, number][], label?: string): CircuitGoal {
  return { kind: 'state', amps: amps.map(([a, b]) => c(a, b)), label };
}

/** Amplitudes ([re, im] pairs) of the state a circuit prepares from |0…0⟩ — handy for initialState props. */
export function ampsOf(reference: string, n: number): [number, number][] {
  const { state } = runCircuit(parseCircuit(reference, n), { measure: 'skip' });
  return state.amplitudes().map((z: C) => [z.re, z.im] as [number, number]);
}

/**
 * Input register of `nIn` qubits in uniform superposition plus one output qubit (last wire) in |0⟩,
 * and the target state Σ_x |x⟩|f(x)⟩ / √(2^nIn). Bits of x: q0 is the most significant.
 */
export function oracleStates(nIn: number, f: (x: number) => number): { initial: [number, number][]; target: [number, number][] } {
  const dim = 1 << (nIn + 1);
  const a = 1 / Math.sqrt(1 << nIn);
  const initial: [number, number][] = Array.from({ length: dim }, (_, i) => [(i & 1) === 0 ? a : 0, 0]);
  const target: [number, number][] = Array.from({ length: dim }, () => [0, 0]);
  for (let x = 0; x < 1 << nIn; x++) target[(x << 1) | (f(x) & 1)] = [a, 0];
  return { initial, target };
}

/** (a ⊕ b) ∧ c on 3 input bits — the Lesson 7.6 clean-computation challenge. */
export const XOR_AND = oracleStates(3, (x) => (((x >> 2) ^ (x >> 1)) & 1) & (x & 1));
