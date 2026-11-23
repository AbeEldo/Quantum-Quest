import { describe, it, expect } from 'vitest';
import { planck, rayleighJeans, wienPeak, photonEV, hydrogenLambda, hydrogenE, deBroglieFromK, me, eC, blackbodyRGB, hcEVnm, sigmaSB } from './physics';

describe('World 1 physics helpers', () => {
  it('hc ≈ 1239.84 eV nm', () => {
    expect(hcEVnm).toBeCloseTo(1239.84, 1);
    expect(photonEV(500)).toBeCloseTo(2.48, 2);
  });
  it('Wien peak of the Sun (5772 K) is ~502 nm', () => {
    expect(wienPeak(5772) * 1e9).toBeCloseTo(502, 0);
  });
  it('Planck curve peaks where Wien says', () => {
    const T = 3000;
    let best = 0,
      bestL = 0;
    for (let nm = 200; nm < 3000; nm += 1) {
      const v = planck(nm * 1e-9, T);
      if (v > best) {
        best = v;
        bestL = nm;
      }
    }
    expect(Math.abs(bestL - wienPeak(T) * 1e9)).toBeLessThan(2);
  });
  it('Planck → Rayleigh–Jeans at long wavelength', () => {
    const T = 5000,
      l = 1e-3;
    expect(planck(l, T) / rayleighJeans(l, T)).toBeCloseTo(1, 2);
  });
  it('integrated Planck radiance gives Stefan–Boltzmann', () => {
    const T = 1000;
    let s = 0;
    const dl = 1e-8;
    for (let l = dl; l < 2e-4; l += dl) s += planck(l, T) * dl;
    // radiant exitance = π × radiance
    expect((Math.PI * s) / (sigmaSB * T ** 4)).toBeCloseTo(1, 2);
  });
  it('Balmer lines (vacuum)', () => {
    expect(hydrogenLambda(3, 2)).toBeCloseTo(656.5, 0);
    expect(hydrogenLambda(4, 2)).toBeCloseTo(486.3, 0);
    expect(hydrogenLambda(2, 1)).toBeCloseTo(121.6, 0);
    expect(hydrogenE(3) - hydrogenE(2)).toBeCloseTo(1.89, 2);
  });
  it('de Broglie wavelength of a 54 eV electron ≈ 0.167 nm', () => {
    expect(deBroglieFromK(me, 54 * eC) * 1e9).toBeCloseTo(0.167, 3);
  });
  it('blackbody colours: 1500 K reddish, 6500 K near white, 15000 K bluish', () => {
    const [r1, , b1] = blackbodyRGB(1500);
    expect(r1).toBeGreaterThan(b1 + 100);
    const [r2, g2, b2] = blackbodyRGB(6500);
    expect(Math.min(r2, g2, b2)).toBeGreaterThan(200);
    const [r3, , b3] = blackbodyRGB(15000);
    expect(b3).toBeGreaterThan(r3);
  });
});
