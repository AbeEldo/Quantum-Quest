import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../../engine/qsim';
import { exactDistribution, simulateAtom, detectorsOf, detectorIndex, fidelity, estimate, type Magnet, type Source } from './spinEngine';

const oven: Source = { kind: 'oven' };
const zUp: Source = { kind: 'pure', dir: [0, 0, 1] };

describe('Stern–Gerlach engine', () => {
  it('single z magnet on oven gives 50/50', () => {
    const d = exactDistribution(oven, [{ theta: 0, pass: '+' }]);
    expect(d[0]).toBeCloseTo(0.5);
    expect(d[1]).toBeCloseTo(0.5);
  });

  it('z then z is repeatable', () => {
    const mags: Magnet[] = [{ theta: 0, pass: '+' }, { theta: 0, pass: '+' }];
    const d = exactDistribution(oven, mags);
    expect(d[detectorIndex(mags, 1, '-')]).toBeCloseTo(0);
    expect(d[detectorIndex(mags, 1, '+')]).toBeCloseTo(0.5);
  });

  it('z → x → z brings back spin-down (1/8 of the oven)', () => {
    const mags: Magnet[] = [{ theta: 0, pass: '+' }, { theta: 90, pass: '+' }, { theta: 0, pass: '+' }];
    const d = exactDistribution(oven, mags);
    expect(d[detectorIndex(mags, 2, '-')]).toBeCloseTo(0.125);
    expect(d.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it('tilted magnet obeys cos²(θ/2)', () => {
    for (const th of [30, 60, 90, 143.13]) {
      const d = exactDistribution(zUp, [{ theta: th, pass: '+' }]);
      expect(d[0]).toBeCloseTo(Math.cos((th * Math.PI) / 360) ** 2);
    }
  });

  it('y magnet: y-polarised beam is fully transmitted, x–z magnets give 50%', () => {
    const yUp: Source = { kind: 'pure', dir: [0, 1, 0] };
    expect(exactDistribution(yUp, [{ theta: 0, y: true, pass: '+' }])[0]).toBeCloseTo(1);
    expect(exactDistribution(yUp, [{ theta: 37, pass: '+' }])[0]).toBeCloseTo(0.5);
  });

  it('Monte Carlo matches exact distribution', () => {
    const mags: Magnet[] = [{ theta: 0, pass: '+' }, { theta: 60, pass: '-' }, { theta: 150, pass: '+' }];
    const exact = exactDistribution(oven, mags);
    const counts = new Array(detectorsOf(mags).length).fill(0);
    const rng = mulberry32(7);
    const N = 40000;
    for (let i = 0; i < N; i++) counts[simulateAtom(oven, mags, rng).detector]++;
    counts.forEach((c, i) => expect(Math.abs(c / N - exact[i])).toBeLessThan(0.01));
  });
});

describe('tomography helpers', () => {
  it('fidelity of antipodes is 0, identical is 1', () => {
    expect(fidelity([0, 0, 1], [0, 0, -1])).toBeCloseTo(0);
    expect(fidelity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
    expect(fidelity([1, 0, 0], [0, 0, 1])).toBeCloseTo(0.5);
  });
  it('estimate', () => {
    const e = estimate(7, 3);
    expect(e.mean).toBeCloseTo(0.4);
    expect(e.err).toBeGreaterThan(0.2);
  });
});
