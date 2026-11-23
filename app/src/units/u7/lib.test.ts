import { describe, it, expect } from 'vitest';
import { GATES, Rn, Rx, Ry, Rz, U3, mulberry32, type Mat2 } from '../../engine/qsim';
import { c } from '../../engine/complex';
import { zyz, fromZYZ, axisAngle, powU, overlap2, mm2, blochOf, apply2, rot, ket0 } from './lib/su2';
import { enumerateWords, wordOf, bestApprox, worstInfidelity, fibonacciSphere } from './lib/words';
import { unitaryGoal, stateGoal, ampsOf } from './lib/goals';
import { runCircuit, circuitUnitary, unitaryOverlap } from '../../engine/circuit';
import { parseCircuit } from '../../engine/parse';

const exactEq = (A: Mat2, B: Mat2) => A.every((z, i) => Math.abs(z.re - B[i].re) < 1e-9 && Math.abs(z.im - B[i].im) < 1e-9);

describe('ZYZ Euler decomposition', () => {
  const rng = mulberry32(7);
  const samples: Mat2[] = [GATES.H, GATES.X, GATES.Y, GATES.Z, GATES.S, GATES.T, GATES.SX, GATES.I, Rx(0.7), Ry(-2.1), Rz(3)];
  for (let k = 0; k < 40; k++) samples.push(U3(rng() * Math.PI, rng() * 6.28 - 3.14, rng() * 6.28 - 3.14));
  it('reconstructs every sample exactly (including global phase), with γ ∈ [0, π]', () => {
    for (const U of samples) {
      const d = zyz(U);
      expect(d.gamma).toBeGreaterThanOrEqual(-1e-12);
      expect(d.gamma).toBeLessThanOrEqual(Math.PI + 1e-12);
      expect(exactEq(fromZYZ(d), U)).toBe(true);
    }
  });
  it('H = e^{iπ/2} Ry(π/2) Rz(π) — γ = π/2', () => {
    const d = zyz(GATES.H);
    expect(d.gamma).toBeCloseTo(Math.PI / 2, 9);
    // the time-ordered circuit Rz(δ); Ry(γ); Rz(β) equals H up to phase
    expect(overlap2(mm2(Rz(d.beta), mm2(Ry(d.gamma), Rz(d.delta))), GATES.H)).toBeCloseTo(1, 9);
    expect(overlap2(mm2(Ry(Math.PI / 2), Rz(Math.PI)), GATES.H)).toBeCloseTo(1, 9);
  });
});

describe('axis–angle and powers', () => {
  it('recovers the axis and angle of a rotation', () => {
    const n: [number, number, number] = [0.48, 0.6, 0.64];
    const { axis, angle } = axisAngle(Rn(1.3, ...n));
    expect(angle).toBeCloseTo(1.3, 9);
    axis.forEach((v, i) => expect(v).toBeCloseTo(n[i], 9));
  });
  it('H is a half-turn about (x+z)/√2, T an eighth-turn about z', () => {
    const h = axisAngle(GATES.H);
    expect(h.angle).toBeCloseTo(Math.PI, 9);
    expect(Math.abs(h.axis[0])).toBeCloseTo(Math.SQRT1_2, 9);
    expect(Math.abs(h.axis[2])).toBeCloseTo(Math.SQRT1_2, 9);
    const t = axisAngle(GATES.T);
    expect(t.angle).toBeCloseTo(Math.PI / 4, 9);
    expect(t.axis[2]).toBeCloseTo(1, 9);
  });
  it('powU(U, 1) = U and powU(U, 1/2)^2 = U', () => {
    for (const U of [GATES.H, GATES.X, GATES.S, Ry(2.2), U3(1, 2, 3)]) {
      expect(exactEq(powU(U, 1), U)).toBe(true);
      const r = powU(U, 0.5);
      expect(exactEq(mm2(r, r), U)).toBe(true);
    }
  });
  it('gate action on Bloch vectors matches the rotation picture', () => {
    const psi = apply2(U3(1.1, 0.4, 0), ket0);
    const v = blochOf(psi);
    for (const U of [GATES.H, GATES.S, Rx(0.9)]) {
      const { axis, angle } = axisAngle(U);
      const w = blochOf(apply2(U, psi));
      const r = rot(v, axis, angle);
      w.forEach((x, i) => expect(x).toBeCloseTo(r[i], 9));
    }
  });
});

describe('H/T word enumeration', () => {
  it('Clifford words {H, S} reach exactly the 6 stabilizer states', () => {
    const cl = enumerateWords(['H', 'S'], 20);
    expect(cl.count).toBe(6);
  });
  it('{H, T} words keep producing new states and approximations improve', () => {
    const cl = enumerateWords(['H', 'T'], 16);
    expect(cl.count).toBeGreaterThan(300);
    const eps = worstInfidelity(cl, fibonacciSphere(200));
    expect(eps[16]).toBeLessThan(eps[6]);
    expect(eps[16]).toBeLessThan(0.05);
  });
  it('the reconstructed word really prepares the stored state', () => {
    const cl = enumerateWords(['H', 'T'], 12);
    for (const i of [5, 77, cl.count - 1]) {
      const w = wordOf(cl, i);
      expect(w.length).toBe(cl.len[i]);
      const { state } = runCircuit(parseCircuit(w.map((g) => `${g} 0`).join('; '), 1));
      const [x, y, z] = state.bloch(0);
      expect(x).toBeCloseTo(cl.xyz[3 * i], 6);
      expect(y).toBeCloseTo(cl.xyz[3 * i + 1], 6);
      expect(z).toBeCloseTo(cl.xyz[3 * i + 2], 6);
    }
  });
  it('finds the H-axis state with a 5-letter word', () => {
    const cl = enumerateWords(['H', 'T'], 8);
    const s = Math.SQRT1_2;
    const b = bestApprox(cl, [s, 0, s], 5);
    expect(b.fidelity).toBeGreaterThan(0.999999);
  });
});

describe('goal helpers', () => {
  it('unitaryGoal / stateGoal / ampsOf', () => {
    const g = unitaryGoal('H 1; CZ 0 1; H 1', 2);
    expect(g.kind).toBe('unitary');
    if (g.kind === 'unitary') expect(unitaryOverlap(g.U, circuitUnitary(parseCircuit('CNOT 0 1', 2)))).toBeCloseTo(1, 9);
    const s = stateGoal([[1, 0], [0, 0]]);
    expect(s.kind).toBe('state');
    const a = ampsOf('H 0; CNOT 0 1', 2);
    expect(a[0][0]).toBeCloseTo(Math.SQRT1_2, 9);
    expect(a[3][0]).toBeCloseTo(Math.SQRT1_2, 9);
    void c;
  });
});

import { XOR_AND, oracleStates } from './lib/goals';
import { StateVector } from '../../engine/qsim';
describe('Lesson 7.6 clean-computation challenge', () => {
  const run = (text: string) => {
    const init = StateVector.fromAmplitudes(XOR_AND.initial.map(([a, b]) => c(a, b)));
    const { state } = runCircuit(parseCircuit(text, 4), { measure: 'skip', initial: init });
    return state.fidelity(StateVector.fromAmplitudes(XOR_AND.target.map(([a, b]) => c(a, b))));
  };
  it('in-place trick solves it with 3 gates; the ancilla-free garbage version does not', () => {
    expect(run('CNOT 0 1; CCX 1 2 3; CNOT 0 1')).toBeGreaterThan(0.999);
    expect(run('CNOT 0 1; CCX 1 2 3')).toBeLessThan(0.9);
    expect(run('')).toBeLessThan(0.9);
  });
  it('oracleStates is normalised', () => {
    const { initial, target } = oracleStates(2, (x) => x & 1);
    const nrm = (v: [number, number][]) => v.reduce((s, [a, b]) => s + a * a + b * b, 0);
    expect(nrm(initial)).toBeCloseTo(1, 12);
    expect(nrm(target)).toBeCloseTo(1, 12);
  });
});

import { stateGoal as sg } from './lib/goals';
describe('lesson challenges are solvable with the offered palettes', () => {
  const uni = (text: string, ref: string, n: number) => unitaryOverlap(circuitUnitary(parseCircuit(text, n)), circuitUnitary(parseCircuit(ref, n)));
  const st = (text: string, n: number, init: [number, number][], tgt: [number, number][]) => {
    const { state } = runCircuit(parseCircuit(text, n), { measure: 'skip', initial: StateVector.fromAmplitudes(init.map(([a, b]) => c(a, b))) });
    const g = sg(tgt);
    return g.kind === 'state' ? state.fidelity(StateVector.fromAmplitudes(g.amps)) : 0;
  };
  const s = Math.SQRT1_2;
  it('u7l1-euler-h: Rz(π) then Ry(π/2) is H', () => expect(uni('Rz(pi) 0; Ry(pi/2) 0', 'H 0', 1)).toBeGreaterThan(0.999));
  it('u7l1-rot-target: Rx(−π/3)|0⟩ sits at θ = π/3, φ = π/2', () => {
    const [x, y, z] = blochOf(apply2(Rx(-Math.PI / 3), ket0));
    expect(x).toBeCloseTo(0, 9);
    expect(y).toBeCloseTo(Math.sin(Math.PI / 3), 9);
    expect(z).toBeCloseTo(Math.cos(Math.PI / 3), 9);
  });
  it('u7l2-swap, u7l3-cz-from-cnot, u7l3-cy', () => {
    expect(uni('CNOT 0 1; CNOT 1 0; CNOT 0 1', 'SWAP 0 1', 2)).toBeGreaterThan(0.999);
    expect(uni('H 1; CNOT 0 1; H 1', 'CZ 0 1', 2)).toBeGreaterThan(0.999);
    expect(uni('Sdg 1; CNOT 0 1; S 1', 'CZ 0 1; CNOT 0 1; S 0', 2)).toBeGreaterThan(0.999);
  });
  it('u7l2-and: one Toffoli', () => {
    const init: [number, number][] = [[0.5, 0], [0, 0], [0.5, 0], [0, 0], [0.5, 0], [0, 0], [0.5, 0], [0, 0]];
    const tgt: [number, number][] = [[0.5, 0], [0, 0], [0.5, 0], [0, 0], [0.5, 0], [0, 0], [0, 0], [0.5, 0]];
    expect(st('CCX 0 1 2', 3, init, tgt)).toBeGreaterThan(0.999);
  });
  it('u7l4-cp-kick: CP(π/2) kicks a quarter turn', () => {
    expect(st('CP(pi/2) 0 1', 2, [[0, 0], [s, 0], [0, 0], [s, 0]], [[0, 0], [s, 0], [0, 0], [0, s]])).toBeGreaterThan(0.999);
    expect(st('CP(pi/2) 1 0', 2, [[0, 0], [s, 0], [0, 0], [s, 0]], [[0, 0], [s, 0], [0, 0], [0, s]])).toBeGreaterThan(0.999);
  });
  it('kickback widget claims: controlled-Rz(π) on |+⟩|0⟩ gives |−i⟩ on the control', () => {
    // controlled-Rz(π): build as diag on target via Rz with control — use StateVector.apply
    const sv = new StateVector(2).h(0);
    sv.apply(Rz(Math.PI), 1, [0]);
    const [x, y] = sv.bloch(0);
    expect(x).toBeCloseTo(0, 9);
    expect(y).toBeCloseTo(-1, 9);
  });
});

import { analyse, circuitText } from './widgets/GarbageDemo';
describe('garbage demo numbers quoted in Lesson 7.6', () => {
  it('xor: clean → |11⟩ always; dirty → 50/50 on 00 and 11, purity 1/2', () => {
    const cl = analyse(circuitText('xor', true)), d = analyse(circuitText('xor', false));
    expect(cl.px[3]).toBeCloseTo(1, 9);
    expect(cl.purity).toBeCloseTo(1, 9);
    expect(d.px[0]).toBeCloseTo(0.5, 9);
    expect(d.px[3]).toBeCloseTo(0.5, 9);
    expect(d.purity).toBeCloseTo(0.5, 9);
  });
  it('x0: clean → |10⟩; constant: garbage harmless', () => {
    expect(analyse(circuitText('x0', true)).px[2]).toBeCloseTo(1, 9);
    const a = analyse(circuitText('one', true)), b = analyse(circuitText('one', false));
    a.px.forEach((p, i) => expect(p).toBeCloseTo(b.px[i], 9));
    expect(b.purity).toBeCloseTo(1, 9);
  });
});
