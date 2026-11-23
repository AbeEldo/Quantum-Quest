import { describe, it, expect } from 'vitest';
import { machZehnder, chainTransmission, zenoSurvival, makeSampler, fraunhofer, visibilityFromD } from './optics';
import { mulberry32 } from '../../../engine/qsim';

describe('Mach–Zehnder (t = 1/√2, r = i/√2)', () => {
  it('balanced: all photons to D1', () => {
    const r = machZehnder({ phi: 0 });
    expect(r.pD1).toBeCloseTo(1, 12);
    expect(r.pD0).toBeCloseTo(0, 12);
  });
  it('P(D1) = cos²(φ/2), P(D0) = sin²(φ/2)', () => {
    for (const phi of [0.3, 1, Math.PI / 3, 2, Math.PI, 5]) {
      const r = machZehnder({ phi });
      expect(r.pD1).toBeCloseTo(Math.cos(phi / 2) ** 2, 12);
      expect(r.pD0).toBeCloseTo(Math.sin(phi / 2) ** 2, 12);
    }
  });
  it('without BS2: 50/50 independent of phase', () => {
    for (const phi of [0, 1, 2]) {
      const r = machZehnder({ phi, bs2: false });
      expect(r.pD1).toBeCloseTo(0.5, 12);
      expect(r.pD0).toBeCloseTo(0.5, 12);
    }
  });
  it('blocked lower arm: 1/4, 1/4, 1/2 absorbed', () => {
    const r = machZehnder({ phi: 0, block: true });
    expect(r.pD1).toBeCloseTo(0.25, 12);
    expect(r.pD0).toBeCloseTo(0.25, 12);
    expect(r.pBlock + r.pD0 + r.pD1).toBeCloseTo(1, 12);
  });
});

describe('polarizers', () => {
  it('three-polarizer paradox gives 1/8', () => {
    expect(chainTransmission(null, [0, Math.PI / 2])).toBeCloseTo(0, 12);
    expect(chainTransmission(null, [0, Math.PI / 4, Math.PI / 2])).toBeCloseTo(1 / 8, 12);
  });
  it('Malus for polarized input', () => {
    expect(chainTransmission(0, [Math.PI / 3])).toBeCloseTo(0.25, 12);
  });
});

describe('Zeno', () => {
  it('known values', () => {
    expect(zenoSurvival(1)).toBeCloseTo(0, 12);
    expect(zenoSurvival(2)).toBeCloseTo(0.25, 12);
    expect(zenoSurvival(5)).toBeCloseTo(0.605, 3);
    expect(zenoSurvival(10)).toBeCloseTo(0.7805, 3);
  });
});

describe('sampler & patterns', () => {
  it('samples proportional to weights', () => {
    const s = makeSampler([1, 0, 3]);
    const rng = mulberry32(7);
    const counts = [0, 0, 0];
    for (let i = 0; i < 20000; i++) counts[Math.floor(s(rng))]++;
    expect(counts[1]).toBe(0);
    expect(counts[2] / counts[0]).toBeGreaterThan(2.7);
    expect(counts[2] / counts[0]).toBeLessThan(3.3);
  });
  it('fraunhofer: incoherent sum has no zeros, coherent has dark fringes', () => {
    const sDark = 0.5 / 10; // d/λ = 10 → first dark fringe at sinθ = λ/(2d)
    expect(fraunhofer(sDark, 10, 1, 1, 1)).toBeCloseTo(0, 10);
    expect(fraunhofer(sDark, 10, 1, 1, 0)).toBeGreaterThan(0.4);
  });
  it('V² + D² = 1 for pure markers', () => {
    for (const D of [0, 0.3, 0.6, 1]) expect(visibilityFromD(D) ** 2 + D * D).toBeCloseTo(1, 12);
  });
});
