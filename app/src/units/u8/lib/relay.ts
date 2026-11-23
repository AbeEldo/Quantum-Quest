/**
 * A tiny quantum-repeater model for the "Teleport Relay" puzzle.
 *
 * Nodes 0..N sit on a line (0 = Alice, N = Bob). Each stored Bell pair is a Werner state with
 * fidelity F (equivalently Werner parameter w = (4F − 1)/3).
 *  - Link generation between neighbours succeeds with probability p per attempt (one tick), fidelity F0.
 *  - Entanglement swapping at a node holding two pairs joins them: w = w1 · w2  ⇔  F = F1F2 + (1−F1)(1−F2)/3.
 *  - Memories decohere: every tick, w ← w · exp(−1/T)  (depolarising noise).
 *  - Teleporting through a pair of fidelity F gives average fidelity (2F + 1)/3.
 */
import type { RNG } from '../../../engine/qsim';

export interface Pair {
  id: number;
  /** End nodes, a < b. */
  a: number;
  b: number;
  F: number;
}

export interface RelayLevel {
  name: string;
  hops: number;
  /** Success probability per attempt for each link (length = hops). */
  p: number[];
  F0: number;
  /** Memory coherence time in ticks (Infinity = perfect memories). */
  T: number;
  /** Required teleportation fidelity. */
  target: number;
  /** Tick budget. */
  budget: number;
  /** Swap success probability (default 1). */
  swapP?: number;
  blurb: string;
}

export const wOfF = (F: number) => (4 * F - 1) / 3;
export const FOfW = (w: number) => (3 * w + 1) / 4;
export const swapFidelity = (F1: number, F2: number) => F1 * F2 + ((1 - F1) * (1 - F2)) / 3;
export const teleportFidelity = (F: number) => (2 * F + 1) / 3;
export const decay = (F: number, T: number, ticks = 1) => (Number.isFinite(T) ? FOfW(wOfF(F) * Math.exp(-ticks / T)) : F);

export interface RelayState {
  tick: number;
  pairs: Pair[];
  nextId: number;
  log: string[];
}

export const initialRelay = (): RelayState => ({ tick: 0, pairs: [], nextId: 1, log: [] });

/** Does node `n` already hold a pair end facing `side` (−1 = left, +1 = right)? */
export function holds(s: RelayState, n: number, side: -1 | 1): Pair | undefined {
  return s.pairs.find((p) => (side === 1 ? p.a === n : p.b === n));
}

/** Can link k (between node k and k+1) attempt generation? Both memories on that side must be free. */
export const linkFree = (s: RelayState, k: number) => !holds(s, k, 1) && !holds(s, k + 1, -1);

/**
 * Advance one tick: attempt the armed links, then decohere all stored pairs.
 * Returns the new state and the list of links that succeeded.
 */
export function stepTick(s: RelayState, lvl: RelayLevel, armed: number[], rng: RNG): { state: RelayState; succeeded: number[]; failed: number[] } {
  let pairs = s.pairs.map((p) => ({ ...p, F: decay(p.F, lvl.T) }));
  let nextId = s.nextId;
  const succeeded: number[] = [], failed: number[] = [];
  for (const k of armed) {
    if (!linkFree({ ...s, pairs }, k)) continue;
    if (rng() < lvl.p[k]) {
      pairs = [...pairs, { id: nextId++, a: k, b: k + 1, F: lvl.F0 }];
      succeeded.push(k);
    } else failed.push(k);
  }
  return { state: { ...s, tick: s.tick + 1, pairs, nextId, log: s.log }, succeeded, failed };
}

/** Entanglement swap at node n (must hold a pair on each side). */
export function swapAt(s: RelayState, n: number, rng: RNG, swapP = 1): { state: RelayState; ok: boolean } {
  const L = holds(s, n, -1), R = holds(s, n, 1);
  if (!L || !R) return { state: s, ok: false };
  const rest = s.pairs.filter((p) => p.id !== L.id && p.id !== R.id);
  if (rng() >= swapP) return { state: { ...s, pairs: rest }, ok: false };
  const np: Pair = { id: s.nextId, a: L.a, b: R.b, F: swapFidelity(L.F, R.F) };
  return { state: { ...s, pairs: [...rest, np], nextId: s.nextId + 1 }, ok: true };
}

/** Discard a pair (free its memories). */
export function discard(s: RelayState, id: number): RelayState {
  return { ...s, pairs: s.pairs.filter((p) => p.id !== id) };
}

/** The end-to-end pair, if any. */
export const endToEnd = (s: RelayState, lvl: RelayLevel) => s.pairs.find((p) => p.a === 0 && p.b === lvl.hops);

export const RELAY_LEVELS: RelayLevel[] = [
  {
    name: '1 · First relay',
    hops: 2,
    p: [0.5, 0.5],
    F0: 0.97,
    T: Infinity,
    target: 0.9,
    budget: 12,
    blurb: 'Two fibre links, perfect memories. Build both links, swap in the middle, teleport.',
  },
  {
    name: '2 · Leaky memories',
    hops: 3,
    p: [0.45, 0.45, 0.45],
    F0: 0.97,
    T: 20,
    target: 0.85,
    budget: 20,
    blurb: 'Three links, and stored pairs now decohere. Pairs that wait too long lose fidelity, so swap as soon as you can.',
  },
  {
    name: '3 · The weak link',
    hops: 4,
    p: [0.6, 0.2, 0.6, 0.5],
    F0: 0.96,
    T: 24,
    target: 0.8,
    budget: 32,
    blurb: 'One link is long and lossy (20%). Don’t build the easy links too early. Their pairs will rot while you wait for the hard one. Discard stale pairs if needed.',
  },
  {
    name: '4 · Continental',
    hops: 5,
    p: [0.5, 0.35, 0.35, 0.35, 0.5],
    F0: 0.97,
    T: 24,
    target: 0.78,
    budget: 45,
    swapP: 0.9,
    blurb: 'Five links and imperfect swaps (90% success: a failed swap destroys both pairs). Plan your swaps.',
  },
];
