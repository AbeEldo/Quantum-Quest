import { describe, it, expect } from 'vitest';
import { zenoSurvive, sampleZeno, sampleEV, posteriorLive, makeShift, maxScore, PTS } from './bombEngine';
import { mulberry32 } from '../../../engine/qsim';

describe('bomb tester engine', () => {
  it('Zeno survival matches cos^{2N}(π/2N)', () => {
    expect(zenoSurvive(1)).toBeCloseTo(0, 12);
    expect(zenoSurvive(2)).toBeCloseTo(0.25, 12);
    expect(zenoSurvive(10)).toBeCloseTo(0.7805, 3);
    expect(zenoSurvive(1000)).toBeGreaterThan(0.997);
  });
  it('Monte Carlo agrees with formulas', () => {
    const rng = mulberry32(42);
    const n = 40000;
    let surv = 0, dark = 0, boom = 0;
    for (let i = 0; i < n; i++) {
      if (sampleZeno(true, 6, rng) === null) surv++;
      const o = sampleEV(true, rng);
      if (o === 'dark') dark++;
      if (o === 'boom') boom++;
    }
    expect(surv / n).toBeCloseTo(zenoSurvive(6), 1);
    expect(dark / n).toBeCloseTo(0.25, 1);
    expect(boom / n).toBeCloseTo(0.5, 1);
    expect(sampleZeno(false, 6, rng)).toBeNull();
    expect(sampleEV(false, rng)).toBe('bright');
  });
  it('posterior and shifts', () => {
    expect(posteriorLive(0)).toBeCloseTo(0.6);
    expect(posteriorLive(1)).toBeCloseTo(0.15 / 0.55);
    const s = makeShift(mulberry32(1));
    expect(s.length).toBe(10);
    expect(maxScore(s)).toBe(s.filter(Boolean).length * PTS.certified + s.filter((x) => !x).length * PTS.dudFound);
  });
});
