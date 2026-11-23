/**
 * Tiny spin-1/2 engine for the World 3 games (Stern–Gerlach Sandbox, Hidden State Detective).
 *
 * A pure spin-1/2 state is described by its Bloch unit vector n̂. A Stern–Gerlach analyzer
 * oriented along unit vector m̂ sends the atom to its "+" port with probability
 *   P(+) = (1 + n̂·m̂)/2 = cos²(Δ/2),   Δ = angle between n̂ and m̂,
 * after which the atom's state is +m̂ (or −m̂ for the "−" port).
 * An unpolarised oven beam is the maximally mixed state: P(+) = 1/2 for any analyzer.
 */

export type V3 = [number, number, number];
export type Port = '+' | '-';

export interface Magnet {
  /** Orientation angle in degrees in the x–z plane: 0 = +z, 90 = +x, 180 = −z. */
  theta: number;
  /** If true the magnet points along +y instead (theta ignored). */
  y?: boolean;
  /** Which output port feeds the next magnet (ignored for the last magnet). */
  pass: Port;
}

export type Source = { kind: 'oven' } | { kind: 'pure'; dir: V3 };

export interface Detector {
  magnet: number;
  port: Port;
}

const DEG = Math.PI / 180;

export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const neg3 = (a: V3): V3 => [-a[0], -a[1], -a[2]];
export const norm3 = (a: V3): V3 => {
  const r = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / r, a[1] / r, a[2] / r];
};

export function magnetDir(m: Pick<Magnet, 'theta' | 'y'>): V3 {
  if (m.y) return [0, 1, 0];
  return [Math.sin(m.theta * DEG), 0, Math.cos(m.theta * DEG)];
}

/** Probability that a state n̂ exits the + port of an analyzer along m̂. */
export const pPlus = (n: V3 | null, m: V3) => (n === null ? 0.5 : (1 + dot(n, m)) / 2);

/** Detectors in display order: the "other" port of each non-final magnet, then both final ports. */
export function detectorsOf(magnets: Magnet[]): Detector[] {
  const out: Detector[] = [];
  magnets.forEach((m, i) => {
    if (i < magnets.length - 1) out.push({ magnet: i, port: m.pass === '+' ? '-' : '+' });
    else out.push({ magnet: i, port: '+' }, { magnet: i, port: '-' });
  });
  return out;
}

export function detectorIndex(magnets: Magnet[], magnet: number, port: Port): number {
  return detectorsOf(magnets).findIndex((d) => d.magnet === magnet && d.port === port);
}

/** Exact probability of each detector (same order as detectorsOf). Sums to 1. */
export function exactDistribution(source: Source, magnets: Magnet[]): number[] {
  const probs: number[] = [];
  let mass = 1;
  let state: V3 | null = source.kind === 'oven' ? null : norm3(source.dir);
  magnets.forEach((m, i) => {
    const dir = magnetDir(m);
    const pp = pPlus(state, dir);
    if (i < magnets.length - 1) {
      const pPass = m.pass === '+' ? pp : 1 - pp;
      probs.push(mass * (1 - pPass));
      mass *= pPass;
      state = m.pass === '+' ? dir : neg3(dir);
    } else {
      probs.push(mass * pp, mass * (1 - pp));
    }
  });
  return probs;
}

/** Uniformly random unit vector (one way to "unravel" the maximally mixed state). */
export function randomUnit(rng: () => number): V3 {
  const z = 2 * rng() - 1;
  const ph = 2 * Math.PI * rng();
  const s = Math.sqrt(1 - z * z);
  return [s * Math.cos(ph), s * Math.sin(ph), z];
}

/** Simulate one atom; returns the detector index and the ports it took. */
export function simulateAtom(source: Source, magnets: Magnet[], rng: () => number): { detector: number; ports: Port[] } {
  let state: V3 = source.kind === 'oven' ? randomUnit(rng) : norm3(source.dir);
  const ports: Port[] = [];
  for (let i = 0; i < magnets.length; i++) {
    const m = magnets[i];
    const dir = magnetDir(m);
    const port: Port = rng() < pPlus(state, dir) ? '+' : '-';
    ports.push(port);
    state = port === '+' ? dir : neg3(dir);
    if (i < magnets.length - 1 && port !== m.pass) return { detector: i, ports };
  }
  const last = magnets.length - 1;
  return { detector: last + (ports[last] === '+' ? 0 : 1), ports };
}

/* ------------------------------ Tomography ------------------------------ */

/** Measure a pure state (Bloch vector r) along axis m: returns +1 or −1. */
export const measureAlong = (r: V3, m: V3, rng: () => number): 1 | -1 => (rng() < (1 + dot(r, m)) / 2 ? 1 : -1);

/** Fidelity |⟨a|b⟩|² between two pure states given as Bloch vectors. */
export const fidelity = (a: V3, b: V3) => (1 + dot(norm3(a), norm3(b))) / 2;

/** Estimate ⟨σ⟩ and its standard error from (n+, n−) counts. */
export function estimate(nPlus: number, nMinus: number): { mean: number; err: number; n: number } {
  const n = nPlus + nMinus;
  if (n === 0) return { mean: 0, err: 1, n };
  const mean = (nPlus - nMinus) / n;
  // binomial standard error of 2p−1, floored so 10/10 doesn't claim zero error
  const err = Math.max(2 * Math.sqrt((((1 + mean) / 2) * ((1 - mean) / 2)) / n), 1 / n);
  return { mean, err, n };
}
