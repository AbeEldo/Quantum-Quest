import { describe, it, expect } from 'vitest';
import { makeSurfaceCode, syndrome, defects, decodeMWPM, isLogicalFlip, xorArr, trialLogicalError, weightOf, type Pauli1 } from './engine/surface';
import { repetitionCode, shorCode, steaneCode, commutes, buildLookup, syndromeOf, synKey, outcome, single, mulP, P } from './engine/codes';
import { mulberry32, StateVector, Rx } from '../../engine/qsim';
import { runSyndromeRound } from './engine/bitflip';

describe('rotated surface code geometry', () => {
  for (const d of [3, 5, 7]) {
    it(`d=${d}: d²−1 checks, all commute, logicals ok`, () => {
      const code = makeSurfaceCode(d);
      expect(code.plaquettes.length).toBe(d * d - 1);
      const xs = code.plaquettes.filter((p) => p.type === 'X');
      const zs = code.plaquettes.filter((p) => p.type === 'Z');
      expect(xs.length).toBe((d * d - 1) / 2);
      expect(zs.length).toBe((d * d - 1) / 2);
      // every X-check overlaps every Z-check on an even number of qubits
      for (const a of xs) for (const b of zs) expect(a.qubits.filter((q) => b.qubits.includes(q)).length % 2).toBe(0);
      // logical X (column) commutes with all Z checks; logical Z (row) with all X checks
      for (const b of zs) expect(b.qubits.filter((q) => code.logicalX.includes(q)).length % 2).toBe(0);
      for (const a of xs) expect(a.qubits.filter((q) => code.logicalZ.includes(q)).length % 2).toBe(0);
      expect(code.logicalX.filter((q) => code.logicalZ.includes(q)).length).toBe(1);
    });
  }
});

describe('MWPM decoder', () => {
  for (const t of ['X', 'Z'] as Pauli1[]) {
    it(`d=3 corrects every single ${t} error`, () => {
      const code = makeSurfaceCode(3);
      for (let q = 0; q < code.n; q++) {
        const e = new Uint8Array(code.n);
        e[q] = 1;
        const m = decodeMWPM(code, t, defects(code, t, e));
        const r = xorArr(e, m.correction);
        expect(syndrome(code, t, r).every((v) => v === 0)).toBe(true);
        expect(isLogicalFlip(code, t, r)).toBe(false);
      }
    });
  }
  it('d=5 corrects every weight-2 X error', () => {
    const code = makeSurfaceCode(5);
    for (let a = 0; a < code.n; a++)
      for (let b = a + 1; b < code.n; b++) {
        const e = new Uint8Array(code.n);
        e[a] = e[b] = 1;
        const m = decodeMWPM(code, 'X', defects(code, 'X', e));
        const r = xorArr(e, m.correction);
        expect(syndrome(code, 'X', r).every((v) => v === 0)).toBe(true);
        expect(isLogicalFlip(code, 'X', r)).toBe(false);
      }
  });
  it('a full column of X is an undetectable logical error', () => {
    const code = makeSurfaceCode(5);
    const e = new Uint8Array(code.n);
    for (const q of code.logicalX) e[q] = 1;
    expect(defects(code, 'X', e).length).toBe(0);
    expect(isLogicalFlip(code, 'X', e)).toBe(true);
  });
  it('below threshold, bigger codes do better; above, worse', () => {
    const rate = (d: number, p: number, N: number) => {
      const code = makeSurfaceCode(d);
      const rng = mulberry32(1234 + d);
      let f = 0;
      for (let i = 0; i < N; i++) if (trialLogicalError(code, 'X', p, rng)) f++;
      return f / N;
    };
    const low3 = rate(3, 0.03, 3000), low5 = rate(5, 0.03, 3000);
    expect(low5).toBeLessThan(low3);
    const hi3 = rate(3, 0.2, 1500), hi5 = rate(5, 0.2, 1500);
    expect(hi5).toBeGreaterThan(hi3 - 0.02);
  });
  it('matching weight equals correction weight for isolated defects', () => {
    const code = makeSurfaceCode(5);
    const e = new Uint8Array(code.n);
    e[12] = 1;
    const m = decodeMWPM(code, 'X', defects(code, 'X', e));
    expect(m.weight).toBe(1);
    expect(weightOf(m.correction)).toBe(1);
  });
});

describe('small stabilizer codes', () => {
  const codes = [repetitionCode(3, 'bit'), repetitionCode(3, 'phase'), repetitionCode(5, 'bit'), shorCode(), steaneCode()];
  for (const code of codes) {
    it(`${code.name}: generators commute, logicals valid`, () => {
      for (const a of code.stabilizers) for (const b of code.stabilizers) expect(commutes(a, b)).toBe(true);
      for (const s of code.stabilizers) {
        expect(commutes(s, code.logicalX)).toBe(true);
        expect(commutes(s, code.logicalZ)).toBe(true);
      }
      expect(commutes(code.logicalX, code.logicalZ)).toBe(false);
    });
  }
  it('Shor & Steane codes correct every single-qubit Pauli error', () => {
    for (const code of [shorCode(), steaneCode()]) {
      const table = buildLookup(code, ['X', 'Y', 'Z'], 1);
      for (let q = 0; q < code.n; q++)
        for (const t of ['X', 'Y', 'Z'] as const) {
          const e = single(q, t);
          const c = table.get(synKey(syndromeOf(code, e)))!;
          expect(c).toBeDefined();
          expect(outcome(code, e, c)).toBe('ok');
        }
    }
  });
  it('Shor code is degenerate: Z0 and Z1 have the same syndrome and both fix each other', () => {
    const code = shorCode();
    expect(synKey(syndromeOf(code, single(0, 'Z')))).toBe(synKey(syndromeOf(code, single(1, 'Z'))));
    expect(outcome(code, single(0, 'Z'), single(1, 'Z'))).toBe('ok');
  });
  it('3-qubit bit-flip code: two X errors cause a logical error after decoding', () => {
    const code = repetitionCode(3, 'bit');
    const table = buildLookup(code, ['X'], 1);
    const e = mulP(single(0, 'X'), single(1, 'X'));
    const c = table.get(synKey(syndromeOf(code, e)))!;
    expect(outcome(code, e, c)).toBe('logical');
    expect(outcome(code, P('XII'), P('XII'))).toBe('ok');
  });
});

describe('bit-flip code syndrome extraction (state vector)', () => {
  it('discretizes a small rotation into "no error" or "full flip"', () => {
    const eps = 0.4;
    let flips = 0;
    const N = 4000;
    const rng = mulberry32(7);
    for (let i = 0; i < N; i++) {
      const r = runSyndromeRound({ theta: 1.1, phi: 0.7, errorQubit: 1, error: Rx(eps), rng });
      if (r.syndrome[0] === 1 && r.syndrome[1] === 1) flips++;
      expect(r.fidelityAfterCorrection).toBeGreaterThan(0.999999);
    }
    expect(Math.abs(flips / N - Math.sin(eps / 2) ** 2)).toBeLessThan(0.015);
  });
  it('encodes into α|000⟩ + β|111⟩', () => {
    const r = runSyndromeRound({ theta: 1.1, phi: 0.7, errorQubit: -1, rng: mulberry32(1) });
    expect(r.syndrome).toEqual([0, 0]);
    expect(r.fidelityAfterCorrection).toBeGreaterThan(0.999999);
    const s = new StateVector(1);
    expect(s.n).toBe(1);
  });
});
