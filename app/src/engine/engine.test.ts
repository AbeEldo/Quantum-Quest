import { describe, it, expect } from 'vitest';
import { StateVector, GATES, Rx, Ry, Rz, Rn, DensityMatrix, Noise, mulberry32, ampsToBloch, U3 } from './qsim';
import { runCircuit, circuitUnitary, unitaryOverlap, seq, Circuit, runNoisy } from './circuit';
import { isUnitary, mat2, } from './testutil';
import { Wave1D, boundStates, rectBarrierTransmission, box, oscillator, fft } from './wave1d';
import { c, abs2, matMul, dagger, kron } from './complex';

const close = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('single-qubit gates', () => {
  it('all named gates are unitary', () => {
    for (const g of Object.values(GATES)) expect(isUnitary(mat2(g))).toBe(true);
    for (const t of [0.3, 1.2, Math.PI]) {
      expect(isUnitary(mat2(Rx(t)))).toBe(true);
      expect(isUnitary(mat2(Ry(t)))).toBe(true);
      expect(isUnitary(mat2(Rz(t)))).toBe(true);
      expect(isUnitary(mat2(Rn(t, 0.6, 0, 0.8)))).toBe(true);
      expect(isUnitary(mat2(U3(t, 0.4, 1.1)))).toBe(true);
    }
  });
  it('H|0> = |+>, HZH = X', () => {
    const s = new StateVector(1).h(0);
    close(s.re[0], Math.SQRT1_2);
    close(s.re[1], Math.SQRT1_2);
    const U = circuitUnitary(seq(1, [{ gate: 'H', targets: [0] }, { gate: 'Z', targets: [0] }, { gate: 'H', targets: [0] }]));
    expect(unitaryOverlap(U, mat2(GATES.X))).toBeCloseTo(1, 9);
  });
  it('Bloch vectors of cardinal states', () => {
    const b = (s: StateVector) => s.bloch(0);
    const z0 = b(new StateVector(1));
    close(z0[0], 0);
    close(z0[1], 0);
    close(z0[2], 1);
    const plus = b(new StateVector(1).h(0));
    close(plus[0], 1);
    const pi = b(new StateVector(1).h(0).s(0));
    close(pi[1], 1);
    const [x, y, z] = ampsToBloch(c(Math.SQRT1_2), c(0, Math.SQRT1_2));
    close(y, 1);
    close(x, 0);
    close(z, 0);
  });
  it('Rn about z equals Rz', () => {
    expect(unitaryOverlap(mat2(Rn(0.9, 0, 0, 1)), mat2(Rz(0.9)))).toBeCloseTo(1, 12);
    expect(unitaryOverlap(mat2(Rn(0.9, 1, 0, 0)), mat2(Rx(0.9)))).toBeCloseTo(1, 12);
  });
});

describe('multi-qubit', () => {
  it('Bell state and convention (q0 is leftmost)', () => {
    const s = new StateVector(2).h(0).cx(0, 1);
    close(s.re[0], Math.SQRT1_2);
    close(s.re[3], Math.SQRT1_2);
    close(s.entropy1(0), 1);
    const t = new StateVector(2).x(0); // |10> => index 2
    close(t.re[2], 1);
  });
  it('GHZ correlations', () => {
    const s = new StateVector(3).h(0).cx(0, 1).cx(1, 2);
    const p = s.probabilities();
    close(p[0], 0.5);
    close(p[7], 0.5);
  });
  it('teleportation transfers arbitrary state (deferred measurement)', () => {
    const psi = StateVector.fromBloch([[1.1, 0.7]]);
    const init = StateVector.fromAmplitudes(
      [psi.amplitude(0), psi.amplitude(1)].flatMap((a) => [a, c(0), c(0), c(0)]),
    );
    const circ: Circuit = seq(3, [
      { gate: 'H', targets: [1] },
      { gate: 'CNOT', controls: [1], targets: [2] },
      { gate: 'CNOT', controls: [0], targets: [1] },
      { gate: 'H', targets: [0] },
      { gate: 'CNOT', controls: [1], targets: [2] },
      { gate: 'CZ', controls: [0], targets: [2] },
    ]);
    const { state } = runCircuit(circ, { initial: init });
    const [x, y, z] = state.bloch(2);
    const [x0, y0, z0] = psi.bloch(0);
    close(x, x0, 1e-9);
    close(y, y0, 1e-9);
    close(z, z0, 1e-9);
  });
  it('applyMatrix matches gate application', () => {
    const CNOT = [
      [c(1), c(0), c(0), c(0)],
      [c(0), c(1), c(0), c(0)],
      [c(0), c(0), c(0), c(1)],
      [c(0), c(0), c(1), c(0)],
    ];
    const a = new StateVector(3).h(0).h(2).applyMatrix(CNOT, [2, 1]);
    const b = new StateVector(3).h(0).h(2).cx(2, 1);
    close(a.fidelity(b), 1);
  });
  it('swap', () => {
    const s = new StateVector(2).x(0).swap(0, 1);
    close(s.re[1], 1);
  });
  it('sampling statistics', () => {
    const s = new StateVector(1).apply(Ry(2 * Math.asin(Math.sqrt(0.3))), 0);
    const counts = s.sample(20000, mulberry32(1));
    expect(Math.abs((counts.get(1) ?? 0) / 20000 - 0.3)).toBeLessThan(0.015);
  });
  it('kron matches circuit unitary of H⊗X', () => {
    const U = circuitUnitary({ n: 2, columns: [[{ gate: 'H', targets: [0] }, { gate: 'X', targets: [1] }]] });
    expect(unitaryOverlap(U, kron(mat2(GATES.H), mat2(GATES.X)))).toBeCloseTo(1, 12);
  });
});

describe('algorithms', () => {
  it('Grover on 3 qubits: 2 iterations give ~94.5% success', () => {
    const marked = 5;
    const s = new StateVector(3);
    for (let q = 0; q < 3; q++) s.h(q);
    const oracle = (st: StateVector) => {
      st.re[marked] *= -1;
      st.im[marked] *= -1;
    };
    const diffuse = (st: StateVector) => {
      let mr = 0, mi = 0;
      for (let i = 0; i < 8; i++) {
        mr += st.re[i];
        mi += st.im[i];
      }
      mr /= 8;
      mi /= 8;
      for (let i = 0; i < 8; i++) {
        st.re[i] = 2 * mr - st.re[i];
        st.im[i] = 2 * mi - st.im[i];
      }
    };
    for (let k = 0; k < 2; k++) {
      oracle(s);
      diffuse(s);
    }
    close(s.probabilities()[marked], 0.9453125, 1e-9);
  });
  it('QFT circuit equals DFT matrix', () => {
    const n = 3, N = 8;
    const ops: Circuit['columns'] = [];
    for (let j = 0; j < n; j++) {
      ops.push([{ gate: 'H', targets: [j] }]);
      for (let k = j + 1; k < n; k++) ops.push([{ gate: 'CP', controls: [k], targets: [j], param: Math.PI / 2 ** (k - j) }]);
    }
    for (let j = 0; j < Math.floor(n / 2); j++) ops.push([{ gate: 'SWAP', targets: [j, n - 1 - j] }]);
    const U = circuitUnitary({ n, columns: ops });
    const F = Array.from({ length: N }, (_, a) =>
      Array.from({ length: N }, (_, b) => {
        const t = (2 * Math.PI * a * b) / N;
        return c(Math.cos(t) / Math.sqrt(N), Math.sin(t) / Math.sqrt(N));
      }),
    );
    expect(unitaryOverlap(U, F)).toBeCloseTo(1, 9);
    expect(isUnitary(U)).toBe(true);
  });
  it('Bernstein–Vazirani recovers the secret string', () => {
    const secret = 0b1011, n = 4;
    const s = new StateVector(n);
    for (let q = 0; q < n; q++) s.h(q);
    for (let i = 0; i < 16; i++) {
      const par = popcount(i & secret) & 1;
      if (par) {
        s.re[i] *= -1;
        s.im[i] *= -1;
      }
    }
    for (let q = 0; q < n; q++) s.h(q);
    close(s.probabilities()[secret], 1);
  });
});

function popcount(x: number) {
  let c0 = 0;
  while (x) {
    c0 += x & 1;
    x >>= 1;
  }
  return c0;
}

describe('density matrices & noise', () => {
  it('pure state has purity 1; depolarised Bell pair less', () => {
    const s = new StateVector(2).h(0).cx(0, 1);
    const d = DensityMatrix.fromState(s);
    close(d.purity(), 1);
    close(d.fidelityPure(s), 1);
    d.channel(Noise.depolarizing(0.5), 0);
    expect(d.purity()).toBeLessThan(0.9);
    close(d.trace(), 1);
  });
  it('amplitude damping drives |1> to |0>', () => {
    const d = DensityMatrix.fromState(new StateVector(1).x(0));
    for (let i = 0; i < 200; i++) d.channel(Noise.amplitudeDamping(0.05), 0);
    expect(d.probabilities()[0]).toBeGreaterThan(0.999);
  });
  it('phase damping shrinks x-component but keeps z', () => {
    const d = DensityMatrix.fromState(new StateVector(1).h(0));
    d.channel(Noise.phaseDamping(0.5), 0);
    const [x, , z] = d.bloch(0);
    close(x, Math.sqrt(0.5));
    close(z, 0);
  });
  it('density-matrix gate application matches state vector', () => {
    const circ = seq(2, [
      { gate: 'H', targets: [0] },
      { gate: 'CNOT', controls: [0], targets: [1] },
      { gate: 'T', targets: [1] },
      { gate: 'Rx', targets: [0], param: 0.7 },
    ]);
    const d = runNoisy(circ, {});
    const { state } = runCircuit(circ);
    close(d.fidelityPure(state), 1);
  });
  it('density measurement collapses', () => {
    const d = DensityMatrix.fromState(new StateVector(2).h(0).cx(0, 1));
    const r = d.measure(0, () => 0.1);
    expect(r).toBe(1);
    close(d.probabilities()[3], 1);
  });
});

describe('wave1d', () => {
  it('FFT round-trip', () => {
    const re = new Float64Array(16).map((_, i) => Math.sin(i)), im = new Float64Array(16);
    const r0 = re.slice();
    fft(re, im);
    fft(re, im, true);
    for (let i = 0; i < 16; i++) close(re[i] / 16, r0[i], 1e-12);
  });
  it('split-step conserves norm and moves packet at group velocity', () => {
    const w = new Wave1D({ N: 1024, xmin: -100, xmax: 100, dt: 0.02 });
    w.setGaussian(-20, 3, 2);
    for (let i = 0; i < 500; i++) w.step();
    close(w.norm2(), 1, 1e-9);
    // after t=10, <x> ≈ -20 + k0 t = 0
    expect(Math.abs(w.expectX() - 0)).toBeLessThan(0.05);
  });
  it('Gaussian minimum-uncertainty packet: Δx Δp ≈ 1/2', () => {
    const w = new Wave1D({ N: 2048, xmin: -60, xmax: 60 });
    w.setGaussian(0, 2, 1);
    const { dx, dp } = w.uncertainties();
    close(dx * dp, 0.5, 1e-3);
  });
  it('infinite well bound states match analytic energies', () => {
    const L = 10, N = 800;
    const dx = L / (N + 1);
    const V = new Float64Array(N);
    const { E } = boundStates(V, dx, 4);
    for (let n = 1; n <= 4; n++) expect(Math.abs(E[n - 1] - box.energy(n, L)) / box.energy(n, L)).toBeLessThan(1e-3);
  });
  it('harmonic oscillator levels are (n+½)ω', () => {
    const N = 1200, xmin = -10, xmax = 10;
    const dx = (xmax - xmin) / (N + 1);
    const omega = 1.5;
    const V = new Float64Array(N).map((_, i) => 0.5 * omega * omega * (xmin + (i + 1) * dx) ** 2);
    const { E, psi } = boundStates(V, dx, 5);
    for (let n = 0; n < 5; n++) close(E[n], oscillator.energy(n, omega), 2e-3);
    // compare ground state shape
    const mid = Math.floor(N / 2);
    close(psi[0][mid], oscillator.psi(0, omega, xmin + (mid + 1) * dx), 1e-3);
  });
  it('numerical tunnelling agrees with analytic barrier transmission', () => {
    const w = new Wave1D({ N: 4096, xmin: -400, xmax: 400, dt: 0.02 });
    const V0 = 1, k0 = 1.2; // E = 0.72
    const a = 8 * w.dx; // barrier exactly 8 grid cells wide
    w.setPotential((x) => (x >= -1e-9 && x < a - w.dx / 2 ? V0 : 0));
    w.setGaussian(-120, 25, k0); // narrow in k so analytic comparison is fair
    for (let i = 0; i < 9000; i++) w.step();
    const T = w.probIn(a, 400);
    const Tan = rectBarrierTransmission(k0 * k0 / 2, V0, a);
    expect(Math.abs(T - Tan)).toBeLessThan(0.02);
  }, 120_000);
});

describe('complex matrix helpers', () => {
  it('dagger & matMul', () => {
    const H = mat2(GATES.H);
    const P = matMul(H, dagger(H));
    close(abs2(P[0][0]), 1);
    close(abs2(P[0][1]), 0);
  });
});
