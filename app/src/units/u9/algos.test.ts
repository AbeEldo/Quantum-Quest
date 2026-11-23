import { describe, it, expect } from 'vitest';
import { StateVector, mulberry32 } from '../../engine/qsim';
import { circuitUnitary, unitaryOverlap } from '../../engine/circuit';
import { parseCircuit } from '../../engine/parse';
import { c } from '../../engine/complex';
import {
  applyBitOracle, applyPhaseOracle, registerMarginal, runQueryRig, CORRECT_PHASE_RIG, CORRECT_SIMON_RIG, bvOracle, djTable, simonTable,
  gf2RREF, gf2Rank, gf2Solutions, dot2, groverTheta, groverSuccess, groverKFormula, groverBestK, groverAmps, groverCircuit,
  applyQFT, dft, qftGateCount, qftMatrix, qpeDistribution, qpeSimulate, gcd, modpow, multiplicativeOrder, continuedFraction, convergents,
  periodFromMeasurement, splitFromOrder, periodFindingDistribution, periodFindingSimulate, shorCountingBits, shorFactor,
  expectation, hamiltonianMatrix, symEigenvalues, ansatz1, ansatz2, parameterShiftGrad, qaoaExpectedCut, maxCut, cutValue, goodBases,
} from './algos';

const close = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('oracles', () => {
  it('bit oracle is the map |x,y> -> |x, y xor f(x)>', () => {
    const f = (x: number) => (x * 3 + 1) & 3;
    for (let i = 0; i < 16; i++) {
      const s = applyBitOracle(new StateVector(4, i), f, 2, 2);
      const x = i >> 2, y = i & 3;
      close(s.re[(x << 2) | (y ^ f(x))], 1);
    }
  });
  it('phase kickback: bit oracle with |-> ancilla equals phase oracle', () => {
    const f = (x: number) => [0, 1, 1, 0, 1, 0, 0, 1][x];
    const a = new StateVector(4);
    a.x(3).h(3);
    for (let q = 0; q < 3; q++) a.h(q);
    applyBitOracle(a, f, 3, 1);
    const b = new StateVector(4);
    b.x(3).h(3);
    for (let q = 0; q < 3; q++) b.h(q);
    applyPhaseOracle(b, f, 3);
    close(a.fidelity(b), 1);
  });
  it("Deutsch: one query separates constant from balanced", () => {
    const fs = [(x: number) => 0, (x: number) => 1, (x: number) => x, (x: number) => 1 - x];
    fs.forEach((f, k) => {
      const p = registerMarginal(runQueryRig(f, 1, 1, CORRECT_PHASE_RIG), 1);
      close(p[k < 2 ? 0 : 1], 1);
    });
  });
  it('Deutsch–Jozsa: constant -> always 0…0, balanced -> never 0…0', () => {
    const rng = mulberry32(3);
    for (const kind of ['constant0', 'constant1', 'balanced', 'balanced', 'balanced'] as const) {
      const t = djTable(kind, 4, rng);
      const p = registerMarginal(runQueryRig((x) => t[x], 4, 1, CORRECT_PHASE_RIG), 4);
      close(p[0], kind === 'balanced' ? 0 : 1);
    }
  });
  it('Bernstein–Vazirani recovers every 4-bit secret in one query', () => {
    for (let sec = 0; sec < 16; sec++) {
      const p = registerMarginal(runQueryRig(bvOracle(sec), 4, 1, CORRECT_PHASE_RIG), 4);
      close(p[sec], 1);
    }
  });
  it('a broken rig (ancilla |0>) gives a uniformly random BV output', () => {
    const p = registerMarginal(runQueryRig(bvOracle(0b1011), 4, 1, { hBefore: true, ancilla: '0', hAfter: true }), 4);
    // ancilla entangled with the input: output distribution is spread out, secret not certain
    expect(p[0b1011]).toBeLessThan(0.6);
  });
  it('Simon: every outcome y satisfies y·s = 0, uniformly over s-perp', () => {
    const rng = mulberry32(7);
    for (const s of [0b101, 0b110, 0b011, 0b111]) {
      const t = simonTable(3, s, rng);
      for (let x = 0; x < 8; x++) expect(t[x]).toBe(t[x ^ s]);
      const p = registerMarginal(runQueryRig((x) => t[x], 3, 3, CORRECT_SIMON_RIG), 3);
      for (let y = 0; y < 8; y++) close(p[y], dot2(y, s) === 0 ? 1 / 4 : 0);
    }
  });
});

describe('GF(2)', () => {
  it('row reduction, rank and null space', () => {
    const rows = [0b110, 0b011, 0b101]; // dependent: 110 ^ 011 = 101
    expect(gf2Rank(rows, 3)).toBe(2);
    expect(gf2Solutions(rows, 3)).toEqual([0, 0b111]);
    expect(gf2RREF([0b1100, 0b0110], 4)).toEqual([0b1010, 0b0110]);
  });
});

describe('Grover', () => {
  it('N=8, one marked: 2 iterations -> 94.53%, matches the gate-level circuit', () => {
    close(groverSuccess(8, 1, 2), 0.9453125, 1e-9);
    const s = groverCircuit(3, [5], 2);
    close(s.probabilities()[5], 0.9453125, 1e-9);
  });
  it('N=4: a single iteration finds the item with certainty', () => {
    close(groverSuccess(4, 1, 1), 1, 1e-12);
    close(groverCircuit(2, [2], 1).probabilities()[2], 1, 1e-12);
  });
  it('analytic 2D picture equals the engine for several N, M, k', () => {
    for (const [n, marked] of [[4, [3]], [4, [1, 9]], [5, [0, 7, 30]], [6, [42]]] as [number, number[]][]) {
      const N = 1 << n, M = marked.length;
      for (let k = 0; k < 6; k++) {
        const p = groverCircuit(n, marked, k).probabilities();
        const pm = marked.reduce((a, i) => a + p[i], 0);
        close(pm, groverSuccess(N, M, k), 1e-9);
        const amps = groverAmps(N, M, k);
        close(p[marked[0]], amps.marked ** 2, 1e-9);
      }
    }
  });
  it('iteration counts ~ (pi/4) sqrt(N/M) and overshooting hurts', () => {
    expect(groverBestK(16)).toBe(3);
    expect(groverBestK(1024)).toBe(25);
    expect(groverBestK(1 << 20)).toBe(804);
    for (const N of [16, 64, 256, 1024, 4096]) {
      expect(groverKFormula(N)).toBe(groverBestK(N));
      const k = groverBestK(N);
      expect(groverSuccess(N, 1, k)).toBeGreaterThan(0.96);
      if (N >= 256) expect(groverSuccess(N, 1, 2 * k + 1)).toBeLessThan(0.05); // twice as far: back near the start
    }
    expect(groverBestK(64, 4)).toBe(3);
    close(groverTheta(4), Math.PI / 6, 1e-12);
  });
});

describe('QFT', () => {
  it('applyQFT matches the DFT on random states, and the inverse undoes it', () => {
    const rng = mulberry32(11);
    for (const t of [1, 2, 3, 4, 5]) {
      const amps = Array.from({ length: 1 << t }, () => c(rng() - 0.5, rng() - 0.5));
      const s = StateVector.fromAmplitudes(amps);
      const want = dft(s.amplitudes());
      applyQFT(s, Array.from({ length: t }, (_, q) => q));
      want.forEach((w, i) => {
        close(s.re[i], w.re, 1e-9);
        close(s.im[i], w.im, 1e-9);
      });
      const back = s.clone();
      applyQFT(back, Array.from({ length: t }, (_, q) => q), true);
      close(back.fidelity(StateVector.fromAmplitudes(amps)), 1, 1e-9);
    }
  });
  it('periodic input -> peaks at multiples of N/r', () => {
    const N = 16, r = 4;
    const amps = Array.from({ length: N }, (_, x) => c(x % r === 1 ? 1 : 0));
    const s = StateVector.fromAmplitudes(amps);
    applyQFT(s, [0, 1, 2, 3]);
    const p = s.probabilities();
    for (let y = 0; y < N; y++) close(p[y], y % (N / r) === 0 ? 1 / r : 0, 1e-9);
  });
  it('the 2-qubit challenge solution (H, CP(pi/2), H, SWAP) equals the QFT matrix', () => {
    const U = circuitUnitary(parseCircuit('H 0; CP(pi/2) 1 0; H 1; SWAP 0 1', 2));
    expect(unitaryOverlap(U, qftMatrix(2))).toBeCloseTo(1, 9);
    const U3 = circuitUnitary(parseCircuit('H 0; CP(pi/2) 1 0; CP(pi/4) 2 0; H 1; CP(pi/2) 2 1; H 2; SWAP 0 2', 3));
    expect(unitaryOverlap(U3, qftMatrix(3))).toBeCloseTo(1, 9);
  });
  it('gate count is O(n^2)', () => {
    expect(qftGateCount(3).total).toBe(3 + 3 + 1);
    expect(qftGateCount(10).cphase).toBe(45);
  });
});

describe('phase estimation', () => {
  it('engine simulation equals the analytic distribution', () => {
    for (const [phi, t] of [[0.3, 4], [0.125, 3], [0.7071, 6], [0.5, 1]]) {
      const a = qpeDistribution(phi, t), b = qpeSimulate(phi, t);
      a.forEach((x, i) => close(x, b[i], 1e-9));
    }
  });
  it('exact binary fractions are read out with certainty', () => {
    close(qpeSimulate(5 / 8, 3)[5], 1, 1e-9);
    close(qpeSimulate(0.25, 4)[4], 1, 1e-9);
  });
  it('otherwise the nearest t-bit estimate has probability >= 4/pi^2', () => {
    for (const phi of [0.1, 0.33, 0.6180339, 0.9]) {
      for (const t of [3, 5, 7]) {
        const p = qpeDistribution(phi, t);
        const best = Math.round(phi * 2 ** t) % 2 ** t;
        expect(p[best]).toBeGreaterThanOrEqual(4 / Math.PI ** 2 - 1e-9);
        expect(p.indexOf(Math.max(...p))).toBe(best);
      }
    }
  });
});

describe('number theory', () => {
  it('gcd, modpow, order', () => {
    expect(gcd(48, 15)).toBe(3);
    expect(gcd(50, 15)).toBe(5);
    expect(modpow(7, 4, 15)).toBe(1);
    expect(multiplicativeOrder(7, 15)).toBe(4);
    expect(multiplicativeOrder(2, 21)).toBe(6);
    expect(multiplicativeOrder(2, 35)).toBe(12);
  });
  it('continued fractions & convergents', () => {
    expect(continuedFraction(427, 512)).toEqual([0, 1, 5, 42, 2]);
    const conv = convergents(continuedFraction(427, 512));
    expect(conv.slice(0, 3)).toEqual([[0, 1], [1, 1], [5, 6]]);
  });
  it('worked example N=15, a=7 -> r=4 -> factors 3 and 5', () => {
    const out = splitFromOrder(7, 15, 4);
    expect(out.ok && out.factors).toEqual([3, 5]);
    if (out.ok) expect(out.x).toBe(4);
  });
  it('bad bases are detected', () => {
    expect(splitFromOrder(14, 15, multiplicativeOrder(14, 15)).ok).toBe(false); // 14 = -1, r = 2, trivial root
    const r = multiplicativeOrder(4, 21); // 4 has order 3: odd
    expect(splitFromOrder(4, 21, r)).toMatchObject({ ok: false, reason: 'odd-period' });
  });
});

describe('period finding (Shor)', () => {
  it('N=15, a=7: engine and analytic agree; four exact peaks at multiples of 2^t/4', () => {
    const t = shorCountingBits(15);
    expect(t).toBe(8);
    const a = periodFindingDistribution(7, 15, t), b = periodFindingSimulate(7, 15, t);
    a.forEach((x, i) => close(x, b[i], 1e-9));
    for (const y of [0, 64, 128, 192]) close(b[y], 0.25, 1e-9);
  });
  it('N=21, a=2 (r=6): engine and analytic agree; peaks near multiples of 512/6', () => {
    const t = shorCountingBits(21);
    expect(t).toBe(9);
    const a = periodFindingDistribution(2, 21, t), b = periodFindingSimulate(2, 21, t);
    a.forEach((x, i) => close(x, b[i], 1e-9));
    const near = [0, 85, 171, 256, 341, 427];
    const mass = near.reduce((s, y) => s + b[y], 0);
    expect(mass).toBeGreaterThan(0.6);
    // continued fractions recover r = 6 from a typical peak
    expect(periodFromMeasurement(427, 512, 2, 21)).toBe(6);
    expect(periodFromMeasurement(85, 512, 2, 21)).toBe(6);
  });
  it('probability that post-processing finds r from one run is substantial', () => {
    for (const [a, N] of [[7, 15], [2, 21], [5, 21], [2, 33], [3, 35]]) {
      const t = shorCountingBits(N);
      const p = periodFindingDistribution(a, N, t);
      const r = multiplicativeOrder(a, N);
      const pr = p.reduce((s, py, y) => s + (periodFromMeasurement(y, 1 << t, a, N) === r ? py : 0), 0);
      expect(pr).toBeGreaterThan(0.3);
      close(p.reduce((s, x) => s + x, 0), 1, 1e-9);
    }
  });
  it('full pipeline factors 15, 21, 33, 35', () => {
    for (const N of [15, 21, 33, 35]) {
      const f = shorFactor(N, 5);
      expect(f).not.toBeNull();
      expect(f![0] * f![1]).toBe(N);
      expect(f![0]).toBeGreaterThan(1);
    }
    expect(goodBases(15)).toEqual([2, 4, 7, 8, 11, 13]);
  });
});

describe('variational', () => {
  const H1 = [{ coef: 1, ops: 'Z' }, { coef: 0.8, ops: 'X' }];
  const H2 = [{ coef: 1, ops: 'ZZ' }, { coef: 0.6, ops: 'XI' }, { coef: 0.6, ops: 'IX' }];
  it('expectation matches matrix element; eigen solver', () => {
    const s = ansatz1([1.1, 0]);
    const M = hamiltonianMatrix(H1, 1);
    const a0 = s.re[0], a1 = s.re[1];
    close(expectation(s, H1), M[0][0] * a0 * a0 + 2 * M[0][1] * a0 * a1 + M[1][1] * a1 * a1, 1e-12);
    const ev = symEigenvalues(M);
    close(ev[0], -Math.hypot(1, 0.8), 1e-9);
  });
  it('variational principle: no ansatz state goes below the ground energy', () => {
    const E0 = symEigenvalues(hamiltonianMatrix(H2, 2))[0];
    const rng = mulberry32(2);
    for (let i = 0; i < 200; i++) {
      const p = [0, 0, 0, 0].map(() => (rng() - 0.5) * 2 * Math.PI);
      expect(expectation(ansatz2(p), H2)).toBeGreaterThanOrEqual(E0 - 1e-9);
    }
  });
  it('parameter-shift gradient equals finite differences; gradient descent reaches E0', () => {
    const E = (p: number[]) => expectation(ansatz2(p), H2);
    const p0 = [0.3, -0.4, 0.9, 0.2];
    const g = parameterShiftGrad(E, p0);
    g.forEach((gk, k) => {
      const h = 1e-5;
      const up = p0.slice(), dn = p0.slice();
      up[k] += h;
      dn[k] -= h;
      close(gk, (E(up) - E(dn)) / (2 * h), 1e-6);
    });
    let p = p0.slice();
    for (let it = 0; it < 400; it++) {
      const gr = parameterShiftGrad(E, p);
      p = p.map((x, k) => x - 0.2 * gr[k]);
    }
    const E0 = symEigenvalues(hamiltonianMatrix(H2, 2))[0];
    close(E(p), E0, 1e-4);
  });
  it('QAOA p=1 on the 4-cycle reaches expected cut 3 (= 3/4 of the max 4)', () => {
    const g = { n: 4, edges: [[0, 1], [1, 2], [2, 3], [3, 0]] as [number, number][] };
    expect(maxCut(g)).toBe(4);
    expect(cutValue(g, 0b0101)).toBe(4);
    let best = 0;
    for (let i = 0; i <= 60; i++)
      for (let j = 0; j <= 60; j++) best = Math.max(best, qaoaExpectedCut(g, [(i / 60) * Math.PI], [(j / 60) * (Math.PI / 2)]));
    close(best, 3, 0.01);
    close(qaoaExpectedCut(g, [0], [0]), 2, 1e-9); // uniform superposition: half the edges
  });
});
