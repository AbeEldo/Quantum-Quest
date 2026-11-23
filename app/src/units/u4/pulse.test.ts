import { describe, it, expect } from 'vitest';
import { applySequence, applyPulse, blochFidelity, rabiP1, pulseAxis, rot, type Pulse, type V3 } from './widgets/spin';
import { LEVELS, ECHO_DETUNINGS } from './games/levels';
import { Rn } from '../../engine/qsim';
import { ampsToBloch } from '../../engine/qsim';
import { c, mul, add } from '../../engine/complex';

const P = (omega: number, phase: number, detuning: number, duration: number): Pulse => ({ omega, phase, detuning, duration });
const lvl = (id: string) => LEVELS.find((l) => l.id === id)!;
const fidAll = (id: string, seq: Pulse[], drift = 0) => {
  const L = lvl(id);
  const fids = L.probes.map((p) => blochFidelity(applySequence(p.start, seq.map((s) => ({ ...s, detuning: s.detuning + (L.fixedDetuning ?? 0) })), (p.detune ?? 0) + drift), p.target));
  return fids.reduce((a, b) => a + b, 0) / fids.length;
};

describe('spin toolkit', () => {
  it('pulse rotation matches the SU(2) matrix Rn', () => {
    // compare Bloch rotation with explicit matrix exp(-i θ n·σ/2) on a random state
    const a = c(0.6), b = c(0.48, 0.64);
    const n: V3 = [0.3, -0.5, 0.81];
    const len = Math.hypot(...n);
    const theta = 1.234;
    const U = Rn(theta, n[0] / len, n[1] / len, n[2] / len);
    const a2 = add(mul(U[0], a), mul(U[1], b));
    const b2 = add(mul(U[2], a), mul(U[3], b));
    const expected = ampsToBloch(a2, b2);
    const got = rot(ampsToBloch(a, b), n, theta);
    for (let i = 0; i < 3; i++) expect(got[i]).toBeCloseTo(expected[i], 9);
  });
  it('Rabi formula agrees with the Bloch rotation', () => {
    for (const [om, d, t] of [
      [1, 0, 1.3],
      [0.7, 0.4, 2.2],
      [1.5, -1.1, 5],
    ]) {
      const v = applyPulse([0, 0, 1], P(om, 0.3, d, t));
      expect((1 - v[2]) / 2).toBeCloseTo(rabiP1(om, d, t), 9);
    }
  });
  it('pulseAxis rate is the generalised Rabi frequency', () => {
    expect(pulseAxis(3, 0, 4).rate).toBeCloseTo(5, 12);
  });
});

describe('Pulse Pilot levels are solvable within par', () => {
  it('flip / half / phase', () => {
    expect(fidAll('flip', [P(1, 0, 0, Math.PI)])).toBeGreaterThan(0.999);
    expect(fidAll('half', [P(1, 0, 0, Math.PI / 2)])).toBeGreaterThan(0.999);
    expect(fidAll('phase', [P(1, Math.PI / 2, 0, Math.PI / 2)])).toBeGreaterThan(0.999);
  });
  it('grand tour waypoints', () => {
    let v: V3 = [0, 0, 1];
    v = applyPulse(v, P(1, Math.PI / 2, 0, Math.PI / 2));
    expect(blochFidelity(v, [1, 0, 0])).toBeGreaterThan(0.999);
    v = applyPulse(v, P(1, Math.PI / 2, 0, Math.PI));
    expect(blochFidelity(v, [-1, 0, 0])).toBeGreaterThan(0.999);
    v = applyPulse(v, P(1, (3 * Math.PI) / 2, 0, Math.PI / 2));
    expect(blochFidelity(v, [0, 0, -1])).toBeGreaterThan(0.999);
  });
  it('phase-locked in one pulse; Hadamard forge in one pulse', () => {
    expect(fidAll('locked', [P(1, 0, 1, Math.PI / Math.SQRT2)])).toBeGreaterThan(0.999);
    expect(fidAll('hadamard', [P(1, 0, 1, Math.PI / Math.SQRT2)])).toBeGreaterThan(0.999);
    expect(fidAll('hadamard', [P(1, Math.PI / 2, 0, Math.PI / 2), P(1, 0, 0, Math.PI)])).toBeGreaterThan(0.999);
  });
  it('off key: a single pulse cannot do it, two pulses can (search)', () => {
    let best1 = 0;
    for (let om = 0.05; om <= 1.0001; om += 0.05)
      for (let t = 0; t < 12; t += 0.02) best1 = Math.max(best1, fidAll('offkey', [P(om, 0, 0, t)]));
    expect(best1).toBeLessThan(0.99);
    // two pulses at full power, phases from the allowed set
    let best2 = 0;
    let arg = '';
    for (const ph2 of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2])
      for (let t1 = 0; t1 < 6; t1 += 0.02)
        for (let t2 = 0; t2 < 6; t2 += 0.02) {
          const f = fidAll('offkey', [P(1, 0, 0, t1), P(1, ph2, 0, t2)]);
          if (f > best2) {
            best2 = f;
            arg = `${t1.toFixed(2)} ${ph2.toFixed(2)} ${t2.toFixed(2)}`;
          }
        }
    console.log('offkey best two-pulse', best2, arg);
    expect(best2).toBeGreaterThan(0.99);
  });
  it('spin echo refocuses the ensemble; plain waiting does not', () => {
    const echo = [P(0, 0, 0, 4), P(2, 0, 0, Math.PI / 2), P(0, 0, 0, 4)];
    const wait = [P(0, 0, 0, 8)];
    const fe = fidAll('echo', echo);
    const fw = fidAll('echo', wait);
    console.log('echo', fe, 'wait', fw);
    expect(fe).toBeGreaterThan(0.95);
    expect(fw).toBeLessThan(0.8);
    expect(ECHO_DETUNINGS.length).toBe(7);
  });
  it('drift can be cancelled', () => {
    const d = 0.37;
    expect(fidAll('drift', [P(1, 0, -d, Math.PI)], d)).toBeGreaterThan(0.999);
    expect(fidAll('drift', [P(1, 0, 0, Math.PI)], d)).toBeLessThan(0.98);
  });
});
