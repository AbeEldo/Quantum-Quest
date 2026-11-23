import { describe, it, expect } from 'vitest';
import { scatter, transmission, barrierStack, freeGaussian, sigmaAt, transmonLevels, rasterLayers } from './physics';
import { rectBarrierTransmission, Wave1D } from '../../engine/wave1d';

describe('transfer-matrix transmission', () => {
  it('matches the analytic rectangular barrier (below and above the top)', () => {
    for (const [E, V0, a] of [
      [1, 2, 0.6],
      [0.5, 3, 1.2],
      [2.5, 2, 1.0],
      [4, 1, 3.3],
      [2, 2, 0.8],
    ]) {
      expect(transmission(E, [{ width: a, V: V0 }])).toBeCloseTo(rectBarrierTransmission(E, V0, a), 9);
    }
  });
  it('conserves probability T + R = 1', () => {
    const layers = [
      { width: 0.7, V: 2 },
      { width: 1.3, V: -1 },
      { width: 0.4, V: 5 },
      { width: 2, V: 0.5 },
    ];
    for (const E of [0.3, 1, 2.2, 6]) {
      const { T, R } = scatter(E, layers);
      expect(T + R).toBeCloseTo(1, 9);
    }
  });
  it('empty potential transmits fully; a well transmits partially', () => {
    expect(transmission(1, [])).toBeCloseTo(1, 12);
    expect(transmission(1, [{ width: 1, V: -3 }])).toBeLessThan(1);
  });
  it('symmetric double barrier has a perfect resonance below the barrier top', () => {
    let best = 0;
    for (let g = 0.5; g < 8; g += 0.001) best = Math.max(best, transmission(1, barrierStack(3, 0.5, [g])));
    expect(best).toBeGreaterThan(0.999);
    expect(transmission(1, barrierStack(3, 0.5, []))).toBeLessThan(0.5);
  });
  it('agrees with a split-step wave-packet simulation (narrow momentum spread)', () => {
    const E = 1.2, V0 = 1.5, a = 1;
    const sim = new Wave1D({ N: 4096, xmin: -200, xmax: 200, dt: 0.02, absorb: 0 });
    sim.setPotential(rasterLayers(sim.x, sim.dx, [{ width: a, V: V0 }]));
    sim.setGaussian(-80, 12, Math.sqrt(2 * E));
    sim.step(Math.round(140 / 0.02 / Math.sqrt(2 * E)));
    const Tsim = sim.probIn(a, 200);
    // average plane-wave T over the packet's momentum distribution
    const k0 = Math.sqrt(2 * E), dk = 1 / (2 * 12);
    let num = 0, den = 0;
    for (let k = k0 - 5 * dk; k <= k0 + 5 * dk; k += dk / 20) {
      const w = Math.exp(-((k - k0) ** 2) / (2 * dk * dk));
      num += w * transmission((k * k) / 2, [{ width: a, V: V0 }]);
      den += w;
    }
    expect(Tsim).toBeCloseTo(num / den, 2);
  });
});

describe('free Gaussian packet', () => {
  it('stays normalised and spreads as σ(t)', () => {
    const sigma = 1.5, t = 6;
    let n = 0, m = 0, m2 = 0;
    const dx = 0.01;
    for (let x = -60; x < 60; x += dx) {
      const [re, im] = freeGaussian(x, t, -5, sigma, 1.3);
      const p = re * re + im * im;
      n += p * dx;
      m += x * p * dx;
      m2 += x * x * p * dx;
    }
    expect(n).toBeCloseTo(1, 6);
    expect(m).toBeCloseTo(-5 + 1.3 * t, 5);
    expect(Math.sqrt(m2 - m * m)).toBeCloseTo(sigmaAt(sigma, t), 5);
  });
  it('matches the split-step solver', () => {
    const sim = new Wave1D({ N: 2048, xmin: -60, xmax: 60, dt: 0.005 });
    sim.setGaussian(-10, 1.2, 2);
    sim.step(800); // t = 4
    let err = 0;
    for (let i = 0; i < sim.N; i += 7) {
      const [r0, i0] = freeGaussian(sim.x[i], 4, -10, 1.2, 2);
      // Wave1D uses e^{i k0 x} (not e^{i k0 (x - x0)}): multiply by e^{i k0 x0} = e^{-20 i}
      const c = Math.cos(-20), sn = Math.sin(-20);
      const re = r0 * c - i0 * sn, im = r0 * sn + i0 * c;
      err = Math.max(err, Math.abs(sim.re[i] - re), Math.abs(sim.im[i] - im));
    }
    expect(err).toBeLessThan(2e-3);
  });
});

describe('transmon levels', () => {
  it('reproduce the Koch et al. asymptotics: E01 ≈ √(8EJEC) − EC, α ≈ −EC', () => {
    const E = transmonLevels(50, 4);
    const e01 = E[1], e12 = E[2] - E[1];
    expect(e01).toBeCloseTo(Math.sqrt(8 * 50) - 1, 0);
    expect(e12 - e01).toBeGreaterThan(-1.3);
    expect(e12 - e01).toBeLessThan(-0.8);
  });
});
