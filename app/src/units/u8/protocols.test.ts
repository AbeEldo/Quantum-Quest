import { describe, it, expect } from 'vitest';
import { mulberry32, StateVector } from '../../engine/qsim';
import { runCircuit } from '../../engine/circuit';
import { parseCircuit } from '../../engine/parse';
import { sendPhoton, expectedQber, e91Round, e91Stats, shorPreskillRate, escapeProb } from './lib/bb84';
import {
  RELAY_LEVELS, initialRelay, stepTick, swapAt, holds, linkFree, endToEnd, teleportFidelity, swapFidelity, FOfW, wOfF, RelayState, discard,
} from './lib/relay';
import { TELEPORT_INIT, TELEPORT_GOAL, teleportedBloch } from './lib/states';

describe('BB84', () => {
  it('no Eve, no noise ⇒ zero errors and ~50% sifting', () => {
    const rng = mulberry32(1);
    let sifted = 0, errors = 0;
    for (let i = 0; i < 20000; i++) {
      const e = sendPhoton(rng, { eveFraction: 0 });
      if (e.sifted) sifted++;
      if (e.error) errors++;
    }
    expect(errors).toBe(0);
    expect(sifted / 20000).toBeGreaterThan(0.48);
    expect(sifted / 20000).toBeLessThan(0.52);
  });
  it('full intercept-resend gives QBER ≈ 25%, partial gives f/4', () => {
    for (const f of [1, 0.5]) {
      const rng = mulberry32(2);
      let s = 0, e = 0, known = 0;
      for (let i = 0; i < 80000; i++) {
        const ev = sendPhoton(rng, { eveFraction: f });
        if (ev.sifted) {
          s++;
          if (ev.error) e++;
          if (ev.eveKnows) known++;
        }
      }
      expect(e / s).toBeCloseTo(expectedQber(f), 2);
      expect(known / s).toBeCloseTo(f / 2, 2);
    }
  });
  it('helpers', () => {
    expect(shorPreskillRate(0)).toBe(1);
    expect(shorPreskillRate(0.12)).toBe(0);
    expect(shorPreskillRate(0.05)).toBeGreaterThan(0.4);
    expect(escapeProb(0.25, 20)).toBeCloseTo(0.75 ** 20, 12);
    expect(expectedQber(0, 0.03)).toBeCloseTo(0.03, 12);
  });
});

describe('E91', () => {
  const run = (eve: 'none' | 'intercept' | 'preprogrammed') => {
    const rng = mulberry32(5);
    const pairs = Array.from({ length: 90000 }, () => e91Round(rng, eve));
    return e91Stats(pairs);
  };
  it('honest source: S ≈ 2√2 and zero key errors', () => {
    const s = run('none');
    expect(s.S!).toBeGreaterThan(2.75);
    expect(s.qber).toBe(0);
  });
  it('intercept-resend: S ≈ √2 and QBER ≈ 25%', () => {
    const s = run('intercept');
    expect(s.S!).toBeCloseTo(Math.SQRT2, 1);
    expect(s.qber!).toBeCloseTo(0.25, 1);
  });
  it('pre-programmed (local) source: S ≈ 2 even though key errors are low', () => {
    const s = run('preprogrammed');
    expect(s.S!).toBeLessThan(2.06);
    expect(s.S!).toBeGreaterThan(1.9);
    expect(s.qber!).toBeLessThan(0.16);
  });
});

describe('teleportation & friends in the circuit engine', () => {
  it('deferred-measurement teleportation moves ψ to q2', () => {
    const circ = parseCircuit('H 1; CNOT 1 2; CNOT 0 1; H 0; CNOT 1 2; CZ 0 2', 3);
    const init = StateVector.fromAmplitudes(TELEPORT_INIT);
    const { state } = runCircuit(circ, { initial: init, measure: 'skip' });
    expect(state.fidelity(StateVector.fromAmplitudes(TELEPORT_GOAL))).toBeCloseTo(1, 10);
    const [x, y, z] = state.bloch(2);
    const t = teleportedBloch();
    expect(x).toBeCloseTo(t[0], 10);
    expect(y).toBeCloseTo(t[1], 10);
    expect(z).toBeCloseTo(t[2], 10);
  });
  it('superdense coding decodes every 2-bit message', () => {
    const enc: Record<string, string> = { '00': '', '01': 'X 0;', '10': 'Z 0;', '11': 'X 0; Z 0;' };
    for (const [msg, ops] of Object.entries(enc)) {
      const circ = parseCircuit(`H 0; CNOT 0 1; ${ops} CNOT 0 1; H 0`, 2);
      const { state } = runCircuit(circ, { measure: 'skip' });
      const p = state.probabilities();
      expect(p[parseInt(msg, 2)]).toBeCloseTo(1, 10);
    }
  });
  it('entanglement swapping (deferred) leaves q0,q3 in Φ+', () => {
    const circ = parseCircuit('H 0, H 2; CNOT 0 1, CNOT 2 3; CNOT 1 2; H 1; CNOT 2 3; CZ 1 3', 4);
    const { state } = runCircuit(circ, { measure: 'skip' });
    // expected |Φ+⟩_{03} ⊗ |+⟩_1 |+⟩_2
    const amps = state.amplitudes();
    const s = Math.SQRT1_2 * 0.5;
    for (let i = 0; i < 16; i++) {
      const q0 = (i >> 3) & 1, q3 = i & 1;
      expect(amps[i].re).toBeCloseTo(q0 === q3 ? s : 0, 10);
      expect(amps[i].im).toBeCloseTo(0, 10);
    }
    expect(state.entropy1(0)).toBeCloseTo(1, 6);
    expect(state.entropy1(1)).toBeCloseTo(0, 6);
  });
});

describe('repeater model', () => {
  it('swap formula equals Werner-parameter multiplication', () => {
    const F1 = 0.93, F2 = 0.88;
    expect(swapFidelity(F1, F2)).toBeCloseTo(FOfW(wOfF(F1) * wOfF(F2)), 12);
    expect(teleportFidelity(1)).toBe(1);
    expect(teleportFidelity(0.5)).toBeCloseTo(2 / 3, 12);
  });

  /** A simple sensible policy: attempt every free link, swap greedily, teleport once possible; discard if hopeless. */
  function greedy(levelIdx: number, seed: number): boolean {
    const lvl = RELAY_LEVELS[levelIdx];
    const rng = mulberry32(seed);
    let s: RelayState = initialRelay();
    while (s.tick < lvl.budget) {
      const armed = Array.from({ length: lvl.hops }, (_, k) => k).filter((k) => linkFree(s, k));
      s = stepTick(s, lvl, armed, rng).state;
      let changed = true;
      while (changed) {
        changed = false;
        for (let n = 1; n < lvl.hops; n++) {
          if (holds(s, n, -1) && holds(s, n, 1)) {
            s = swapAt(s, n, rng, lvl.swapP ?? 1).state;
            changed = true;
          }
        }
      }
      // discard pairs that can no longer reach the target
      for (const p of s.pairs) if (teleportFidelity(p.F) < lvl.target) s = discard(s, p.id);
      const e = endToEnd(s, lvl);
      if (e && teleportFidelity(e.F) >= lvl.target) return true;
    }
    return false;
  }

  it('every level is solvable within budget a decent fraction of the time', () => {
    RELAY_LEVELS.forEach((_, i) => {
      let ok = 0;
      for (let seed = 1; seed <= 300; seed++) if (greedy(i, seed)) ok++;
      expect(ok / 300).toBeGreaterThan(0.35);
    });
  });
});
