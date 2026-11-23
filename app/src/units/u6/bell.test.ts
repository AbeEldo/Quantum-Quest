import { describe, it, expect } from 'vitest';
import { c } from '../../engine/complex';
import { mulberry32, StateVector } from '../../engine/qsim';
import {
  BELL, GHZ, jointProbs, realBasis, equatorialBasis, pAgree, quantumWinRate, chshS, OPTIMAL_QUANTUM, TSIRELSON_WIN,
  allClassicalStrategies, classicalWinRate, playQuantumRound, ghzQuantumWinProbs, GHZ_OPTIMAL, ghzClassicalWins,
  GhzClassical, merminAgreeProb, socksAgree, socksOutcome, concurrence, reducedBloch2, kronVec,
} from './lib/bell';

describe('two-qubit measurement helpers', () => {
  it('Φ+ agrees with probability cos²(Δ) in real-plane bases', () => {
    for (const [ta, tb] of [[0, 0], [0, Math.PI / 8], [0.3, 1.1], [Math.PI / 4, -Math.PI / 8]]) {
      const p = jointProbs(BELL.phiPlus, [realBasis(ta), realBasis(tb)]);
      expect(p[0] + p[3]).toBeCloseTo(pAgree(ta, tb), 10);
      expect(p[0] + p[1]).toBeCloseTo(0.5, 10); // Alice's marginal
      expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    }
  });
  it('matches the state-vector simulator (rotate then measure Z)', () => {
    const s = new StateVector(2).h(0).cx(0, 1);
    const th = 0.7;
    // measuring in basis |θ⟩ = Ry(2θ)|0⟩ ⇔ apply Ry(−2θ) then measure Z
    const co = Math.cos(-th), si = Math.sin(-th);
    s.apply([c(co), c(-si), c(si), c(co)], 0);
    const p = jointProbs(BELL.phiPlus, [realBasis(th), realBasis(0)]);
    const q = s.probabilities();
    for (let i = 0; i < 4; i++) expect(p[i]).toBeCloseTo(q[i], 10);
  });
  it('concurrence and reduced Bloch vectors', () => {
    expect(concurrence(BELL.phiPlus)).toBeCloseTo(1, 10);
    expect(concurrence(kronVec([c(0.6), c(0.8)], [c(Math.SQRT1_2), c(0, Math.SQRT1_2)]))).toBeCloseTo(0, 10);
    const [ra, rb] = reducedBloch2(BELL.psiMinus);
    expect(Math.hypot(...ra)).toBeCloseTo(0, 10);
    expect(Math.hypot(...rb)).toBeCloseTo(0, 10);
    const prod = kronVec([c(Math.SQRT1_2), c(Math.SQRT1_2)], [c(1), c(0)]);
    const [pa, pb] = reducedBloch2(prod);
    expect(pa[0]).toBeCloseTo(1, 10);
    expect(pb[2]).toBeCloseTo(1, 10);
    // compare with engine
    const sv = StateVector.fromAmplitudes(prod);
    expect(sv.bloch(0)[0]).toBeCloseTo(pa[0], 10);
  });
});

describe('CHSH game', () => {
  it('no deterministic classical strategy beats 3/4', () => {
    const rates = allClassicalStrategies().map(classicalWinRate);
    expect(Math.max(...rates)).toBe(0.75);
    expect(rates.filter((r) => r === 0.75).length).toBe(8);
  });
  it('optimal quantum strategy reaches cos²(π/8) and S = 2√2', () => {
    expect(quantumWinRate(OPTIMAL_QUANTUM)).toBeCloseTo(TSIRELSON_WIN, 10);
    expect(chshS(OPTIMAL_QUANTUM)).toBeCloseTo(2 * Math.SQRT2, 10);
    expect(quantumWinRate(OPTIMAL_QUANTUM)).toBeCloseTo(0.5 + chshS(OPTIMAL_QUANTUM) / 8, 10);
  });
  it('noise: advantage disappears below visibility 1/√2', () => {
    expect(quantumWinRate({ ...OPTIMAL_QUANTUM, visibility: Math.SQRT1_2 })).toBeCloseTo(0.75, 10);
  });
  it('Monte-Carlo rounds converge to the exact rate', () => {
    const rng = mulberry32(42);
    let w = 0;
    const N = 40000;
    for (let i = 0; i < N; i++) if (playQuantumRound(OPTIMAL_QUANTUM, rng).win) w++;
    expect(w / N).toBeGreaterThan(0.845);
    expect(w / N).toBeLessThan(0.862);
  });
});

describe('GHZ game', () => {
  it('X/Y strategy wins every question', () => {
    for (const p of ghzQuantumWinProbs(GHZ_OPTIMAL)) expect(p).toBeCloseTo(1, 10);
  });
  it('no classical strategy wins all four', () => {
    let best = 0;
    for (let m = 0; m < 64; m++) {
      const b = (k: number) => ((m >> k) & 1) as 0 | 1;
      const t: GhzClassical = [[b(0), b(1)], [b(2), b(3)], [b(4), b(5)]];
      best = Math.max(best, ghzClassicalWins(t).filter(Boolean).length);
    }
    expect(best).toBe(3);
  });
  it('GHZ equatorial correlations are cos(φ1+φ2+φ3)', () => {
    const ph = [0.3, 1.2, -0.4];
    const p = jointProbs(GHZ, ph.map(equatorialBasis));
    let E = 0;
    for (let o = 0; o < 8; o++) E += p[o] * ((((o >> 2) ^ (o >> 1) ^ o) & 1) ? -1 : 1);
    expect(E).toBeCloseTo(Math.cos(ph[0] + ph[1] + ph[2]), 10);
  });
});

describe('local hidden variables', () => {
  it("Mermin's device: every instruction set agrees ≥ 5/9 of the time", () => {
    for (let m = 0; m < 8; m++) {
      const s = [(m >> 2) & 1, (m >> 1) & 1, m & 1] as [0 | 1, 0 | 1, 0 | 1];
      expect(merminAgreeProb(s)).toBeGreaterThanOrEqual(5 / 9 - 1e-12);
    }
  });
  it('socks model agreement formula matches sampling', () => {
    const rng = mulberry32(7);
    const ta = 0.2, tb = 0.2 + Math.PI / 8;
    let agree = 0;
    const N = 50000;
    for (let i = 0; i < N; i++) {
      const lam = rng() * Math.PI;
      if (socksOutcome(ta, lam) === socksOutcome(tb, lam)) agree++;
    }
    expect(agree / N).toBeCloseTo(socksAgree(ta, tb), 2);
    expect(socksAgree(0, Math.PI / 8)).toBeCloseTo(0.75, 10);
  });
});
