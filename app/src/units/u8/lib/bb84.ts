/**
 * BB84 / E91 simulation helpers for World 8.
 *
 * BB84 conventions: basis 0 = rectilinear "+" (bit 0 → 0° H, bit 1 → 90° V),
 *                   basis 1 = diagonal "×"    (bit 0 → 45° D, bit 1 → 135° A).
 */
import type { RNG } from '../../../engine/qsim';
import { pAgree, socksOutcome } from '../../u6/lib/bell';

export type Basis = 0 | 1;
export type Bit = 0 | 1;

/** Polarisation angle (degrees) of the photon encoding `bit` in `basis`. */
export const polAngle = (basis: Basis, bit: Bit) => (basis === 0 ? (bit ? 90 : 0) : bit ? 135 : 45);
export const BASIS_SYMBOL = ['+', '×'];

/** Measure a photon prepared as (basis, bit) in basis `m`: same basis → same bit, otherwise a fair coin. */
export function measurePhoton(prep: Basis, bit: Bit, m: Basis, rng: RNG): Bit {
  if (prep === m) return bit;
  return rng() < 0.5 ? 0 : 1;
}

export type EveStrategy = 'random' | 'rect' | 'diag';

export interface ChannelOpts {
  /** Probability that Eve intercepts (measures and resends) each photon. */
  eveFraction: number;
  eveStrategy?: EveStrategy;
  /** Probability the channel flips Bob's result (intrinsic noise / misalignment). */
  noise?: number;
}

export interface PhotonEvent {
  aBit: Bit;
  aBasis: Basis;
  /** Eve's measurement, if she intercepted this photon. */
  eve: { basis: Basis; bit: Bit } | null;
  /** The photon actually arriving at Bob (after any resend). */
  wireBasis: Basis;
  wireBit: Bit;
  bBasis: Basis;
  bBit: Bit;
  noiseFlip: boolean;
  /** Bases matched, so the bit goes into the sifted key. */
  sifted: boolean;
  /** Sifted and Alice's bit ≠ Bob's bit. */
  error: boolean;
  /** Eve learns this bit with certainty once bases are announced (she used the right basis). */
  eveKnows: boolean;
}

export function sendPhoton(rng: RNG, opts: ChannelOpts, forced?: Partial<Pick<PhotonEvent, 'aBit' | 'aBasis' | 'bBasis'>>): PhotonEvent {
  const aBit = forced?.aBit ?? ((rng() < 0.5 ? 0 : 1) as Bit);
  const aBasis = forced?.aBasis ?? ((rng() < 0.5 ? 0 : 1) as Basis);
  let wireBasis: Basis = aBasis;
  let wireBit: Bit = aBit;
  let eve: PhotonEvent['eve'] = null;
  if (opts.eveFraction > 0 && rng() < opts.eveFraction) {
    const strat = opts.eveStrategy ?? 'random';
    const eb: Basis = strat === 'rect' ? 0 : strat === 'diag' ? 1 : rng() < 0.5 ? 0 : 1;
    const ebit = measurePhoton(aBasis, aBit, eb, rng);
    eve = { basis: eb, bit: ebit };
    wireBasis = eb;
    wireBit = ebit;
  }
  const bBasis = forced?.bBasis ?? ((rng() < 0.5 ? 0 : 1) as Basis);
  let bBit = measurePhoton(wireBasis, wireBit, bBasis, rng);
  const noiseFlip = (opts.noise ?? 0) > 0 && rng() < (opts.noise ?? 0);
  if (noiseFlip) bBit = (1 - bBit) as Bit;
  const sifted = aBasis === bBasis;
  return {
    aBit,
    aBasis,
    eve,
    wireBasis,
    wireBit,
    bBasis,
    bBit,
    noiseFlip,
    sifted,
    error: sifted && aBit !== bBit,
    eveKnows: !!eve && eve.basis === aBasis,
  };
}

/** Expected QBER for intercept-resend on a fraction f of photons plus independent flip noise p. */
export function expectedQber(f: number, p = 0): number {
  const e = f / 4;
  return e * (1 - p) + (1 - e) * p;
}

/** Probability that k checked sifted bits show *no* error when the true error rate is q. */
export const escapeProb = (q: number, k: number) => (1 - q) ** k;

/** Binary entropy (bits). */
export function h2(p: number): number {
  if (p <= 0 || p >= 1) return 0;
  return -p * Math.log2(p) - (1 - p) * Math.log2(1 - p);
}

/** Asymptotic BB84 secret-key fraction (Shor–Preskill): r = 1 − 2 h(Q). Positive only for Q ≲ 11%. */
export const shorPreskillRate = (q: number) => Math.max(0, 1 - 2 * h2(q));

/* ----------------------------------- E91 ----------------------------------- */

/** Analyser angles (radians) for entanglement-based QKD (polarisation version of Ekert 1991). */
export const E91_ALICE = [0, Math.PI / 8, Math.PI / 4];
export const E91_BOB = [Math.PI / 8, Math.PI / 4, (3 * Math.PI) / 8];

export type E91Eve = 'none' | 'intercept' | 'preprogrammed';

export interface E91Pair {
  ai: number;
  bi: number;
  a: Bit;
  b: Bit;
}

/**
 * One E91 round. The source emits |Φ+⟩ (with visibility V), or:
 *  - 'intercept': Eve measures both photons in the same random basis (0° or 45°) and resends product states;
 *  - 'preprogrammed': Eve replaces the source with a local hidden-variable one (both photons carry polarisation λ).
 */
export function e91Round(rng: RNG, eve: E91Eve, V = 1): E91Pair {
  const ai = Math.floor(rng() * 3), bi = Math.floor(rng() * 3);
  const ta = E91_ALICE[ai], tb = E91_BOB[bi];
  let a: Bit, b: Bit;
  if (eve === 'preprogrammed') {
    const lam = rng() * Math.PI;
    a = socksOutcome(ta, lam);
    b = socksOutcome(tb, lam);
  } else if (eve === 'intercept') {
    const e = rng() < 0.5 ? 0 : Math.PI / 4;
    const s: Bit = rng() < 0.5 ? 0 : 1; // Eve's outcome (same for both photons of |Φ+⟩)
    const ang = e + (s ? Math.PI / 2 : 0); // polarisation of the resent photons
    a = rng() < Math.cos(ta - ang) ** 2 ? 0 : 1;
    b = rng() < Math.cos(tb - ang) ** 2 ? 0 : 1;
  } else {
    a = rng() < 0.5 ? 0 : 1;
    b = rng() < pAgree(ta, tb, V) ? a : ((1 - a) as Bit);
  }
  return { ai, bi, a, b };
}

export interface E91Stats {
  keyLength: number;
  keyErrors: number;
  qber: number | null;
  S: number | null;
  /** Correlator estimates E[ai][bi] (null if no data). */
  E: (number | null)[][];
}

/** Key from matching settings (A1,B0) = 22.5° and (A2,B1) = 45°; CHSH from A0, A2 × B0, B2. */
export function e91Stats(pairs: E91Pair[]): E91Stats {
  const sum = [0, 1, 2].map(() => [0, 0, 0]);
  const cnt = [0, 1, 2].map(() => [0, 0, 0]);
  let keyLength = 0, keyErrors = 0;
  for (const p of pairs) {
    sum[p.ai][p.bi] += p.a === p.b ? 1 : -1;
    cnt[p.ai][p.bi]++;
    if ((p.ai === 1 && p.bi === 0) || (p.ai === 2 && p.bi === 1)) {
      keyLength++;
      if (p.a !== p.b) keyErrors++;
    }
  }
  const E = sum.map((row, i) => row.map((s, j) => (cnt[i][j] ? s / cnt[i][j] : null)));
  const need = [E[0][0], E[0][2], E[2][0], E[2][2]];
  const S = need.every((x) => x !== null) ? (need[0]! - need[1]! + need[2]! + need[3]!) : null;
  return { keyLength, keyErrors, qber: keyLength ? keyErrors / keyLength : null, S, E };
}
