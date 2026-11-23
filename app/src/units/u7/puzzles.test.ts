import { describe, it, expect } from 'vitest';
import { PUZZLES } from './puzzles';
import { StateVector } from '../../engine/qsim';
import { runCircuit, circuitUnitary, unitaryOverlap, countGates, opWires } from '../../engine/circuit';
import { parseCircuit } from '../../engine/parse';
import { c } from '../../engine/complex';

/** Intended par-length solution for every puzzle (compact circuit text, one gate per op). */
const SOLUTIONS: Record<string, string> = {
  'p-plus': 'H 0',
  'p-minus': 'X 0; H 0',
  'p-plus-i': 'H 0; S 0',
  'p-minus-i': 'H 0; S 0; Z 0',
  'p-root-not': 'SX 0; SX 0',
  'p-quarter-turns': 'S 0; S 0',
  'p-t-state': 'H 0; T 0',
  'p-three-eighths': 'H 0; S 0; T 0',
  'p-minus-eighth': 'H 0; Z 0; S 0; T 0',
  'p-h-axis': 'H 0; T 0; H 0; T 0; T 0',
  'p-graph2': 'H 0 1; CZ 0 1',
  'p-bell': 'H 0; CNOT 0 1',
  'p-phi-minus': 'H 0; Z 0; CNOT 0 1',
  'p-psi-plus': 'H 0, X 1; CNOT 0 1',
  'p-psi-minus': 'X 0, X 1; H 0; CNOT 0 1',
  'p-bell-cz': 'H 0 1; CZ 0 1; H 1',
  'p-bell-flip': 'Z 0; X 0',
  'p-ghz3': 'H 0; CNOT 0 1; CNOT 1 2',
  'p-ghz4': 'H 0; CNOT 0 1; CNOT 0 2, CNOT 1 3',
  'p-ghz-x': 'H 0 1; CNOT 0 2; CNOT 1 2',
  'p-cluster3': 'H 0 1 2; CZ 0 1; CZ 1 2',
  'p-w4': 'H 0 1, X 2; CNOT 0 2; CCX 0 1 3; CNOT 3 0; CNOT 3 1; CNOT 1 2',
  'p-unbell': 'CNOT 0 1; H 0',
  'p-ghz-decode': 'CNOT 0 2; CNOT 0 1; H 0',
  'p-move-qubit': 'CNOT 0 1; CNOT 1 0',
  'p-kickback': 'CNOT 0 1',
  'p-toffoli-kickback': 'CCX 0 1 2',
  'p-x-from-hz': 'H 0; Z 0; H 0',
  'p-y-from-xz': 'Z 0; X 0',
  'p-cnot-from-cz': 'H 1; CZ 0 1; H 1',
  'p-hh-cnot-hh': 'CNOT 1 0',
  'p-swap-cnot': 'CNOT 0 1; CNOT 1 0; CNOT 0 1',
  'p-swap-cz': 'H 1; CZ 0 1; H 1, H 0; CZ 0 1; H 0, H 1; CZ 0 1; H 1',
  'p-cy': 'Sdg 1; CNOT 0 1; S 1',
  'p-ch': 'Ry(pi/4) 1; CNOT 0 1; Ry(-pi/4) 1',
  'p-cs': 'T 0, T 1; CNOT 0 1; Tdg 1; CNOT 0 1',
  'p-half-adder': 'CCX 0 1 2; CNOT 0 1',
  'p-or': 'CNOT 0 2; CNOT 1 2; CCX 0 1 2',
  'p-ccz': 'H 2; CCX 0 1 2; H 2',
  'p-fredkin': 'CNOT 2 1; CCX 0 1 2; CNOT 2 1',
  'p-clean-and': 'CCX 0 1 3; CCX 2 3 4; CCX 0 1 3',
  'p-toffoli-ht':
    'H 2; CNOT 1 2; Tdg 2; CNOT 0 2; T 2; CNOT 1 2; Tdg 2; CNOT 0 2; T 1, T 2; H 2, CNOT 0 1; T 0, Tdg 1; CNOT 0 1',
};

/** Alternative solutions mentioned in explanations — also checked so the prose is honest. */
const ALTERNATIVES: [string, string][] = [
  ['p-minus', 'H 0; Z 0'],
  ['p-minus-i', 'H 0; S 0; H 0'],
  ['p-phi-minus', 'H 0; CNOT 0 1; Z 1'],
  ['p-ghz-x', 'H 0; CNOT 0 1; CNOT 0 2; H 0 1 2'],
  ['p-swap-cz', 'H 0 1; CZ 0 1; H 0 1; CZ 0 1; H 0 1; CZ 0 1'],
  ['p-ccz', 'H 0; CCX 1 2 0; H 0'],
  ['p-or', 'X 0 1; CCX 0 1 2; X 0 1 2'],
];

function score(id: string, text: string): number {
  const p = PUZZLES.find((q) => q.id === id)!;
  const circ = parseCircuit(text, p.n);
  if (p.goal.kind === 'state') {
    const init = p.initialState ? StateVector.fromAmplitudes(p.initialState.map(([a, b]) => c(a, b))) : undefined;
    const { state } = runCircuit(circ, { measure: 'skip', initial: init });
    return state.fidelity(StateVector.fromAmplitudes(p.goal.amps.map(([a, b]) => c(a, b))));
  }
  return unitaryOverlap(circuitUnitary(circ), circuitUnitary(parseCircuit(p.goal.circuit, p.n)));
}

describe('World 7 circuit puzzles', () => {
  it('has unique ids, keeps the original two, and every puzzle has a solution', () => {
    const ids = PUZZLES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('p-plus');
    expect(ids).toContain('p-bell');
    expect(PUZZLES.length).toBeGreaterThanOrEqual(36);
    for (const id of ids) expect(SOLUTIONS[id], `missing solution for ${id}`).toBeDefined();
    const chapters = new Set(PUZZLES.map((p) => p.chapter));
    expect(chapters.size).toBeGreaterThanOrEqual(6);
    expect(chapters.size).toBeLessThanOrEqual(8);
  });

  it('data is well-formed (normalised states of the right size, parseable references, no stray control chars)', () => {
    for (const p of PUZZLES) {
      const dim = 1 << p.n;
      const check = (a: [number, number][], what: string) => {
        expect(a.length, `${p.id} ${what} length`).toBe(dim);
        const norm = a.reduce((s, [x, y]) => s + x * x + y * y, 0);
        expect(Math.abs(norm - 1), `${p.id} ${what} norm`).toBeLessThan(1e-9);
      };
      if (p.goal.kind === 'state') check(p.goal.amps, 'goal');
      else expect(parseCircuit(p.goal.circuit, p.n).n).toBe(p.n);
      if (p.initialState) check(p.initialState, 'initialState');
      // single-backslash escapes like "\r" or "\f" in a TS string would silently corrupt the TeX
      for (const s of [p.title, p.description, p.hint ?? '', p.explain ?? '']) expect(/[\r\f\t\v\b]/.test(s), `${p.id}: control character in text`).toBe(false);
    }
  });

  for (const p of PUZZLES) {
    it(`${p.id} is solvable at par ${p.par} with its own gate palette`, () => {
      const sol = SOLUTIONS[p.id];
      const circ = parseCircuit(sol, p.n);
      expect(circ.n).toBe(p.n);
      for (const col of circ.columns)
        for (const op of col) {
          expect(p.gates, `${p.id}: gate ${op.gate} not in palette`).toContain(op.gate);
          for (const w of opWires(op)) expect(w).toBeLessThan(p.n);
        }
      expect(countGates(circ, ['I', 'M'])).toBeLessThanOrEqual(p.par);
      if (p.maxGates !== undefined) expect(p.par).toBeLessThanOrEqual(p.maxGates);
      expect(score(p.id, sol)).toBeGreaterThan(0.999);
    });
  }

  it('the empty circuit never already solves a puzzle', () => {
    for (const p of PUZZLES) expect(score(p.id, ''), p.id).toBeLessThan(0.99);
  });

  it('alternative solutions quoted in the explanations are correct', () => {
    for (const [id, text] of ALTERNATIVES) expect(score(id, text), `${id}: ${text}`).toBeGreaterThan(0.999);
  });

  it('a garbage-leaving AND does not solve the clean-up puzzle', () => {
    expect(score('p-clean-and', 'CCX 0 1 3; CCX 2 3 4')).toBeLessThan(0.9);
  });
});
