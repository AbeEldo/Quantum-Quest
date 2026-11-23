/**
 * Small optics helpers for World 2 widgets (double slit, which-path, polarizers, Mach–Zehnder, Zeno).
 * Pure functions, no React — tested in optics.test.ts.
 */
import { c, add, mul, expi, abs2, type C } from '../../../engine/complex';

/* ------------------------------------------------------------------ */
/* Double slit: exact 2D (cylindrical-wave) amplitude sum              */
/* ------------------------------------------------------------------ */

export interface SlitGeom {
  /** x of the barrier (px) */
  xb: number;
  /** y of the centre line (px) */
  cy: number;
  /** slit centre separation (px) */
  d: number;
  /** slit width (px) */
  a: number;
  /** wavelength (px) */
  lambda: number;
  /** which slits are open */
  open: [boolean, boolean];
  /** point sources per slit (Huygens) */
  pts?: number;
}

/** Huygens point sources of each slit: [slitIndex, y][] */
export function slitSources(g: SlitGeom): [number, number][] {
  const M = g.pts ?? 5;
  const out: [number, number][] = [];
  for (let s = 0; s < 2; s++) {
    if (!g.open[s]) continue;
    const yc = g.cy + (s === 0 ? -g.d / 2 : g.d / 2);
    for (let j = 0; j < M; j++) {
      const off = M === 1 ? 0 : -g.a / 2 + (g.a * j) / (M - 1);
      out.push([s, yc + off]);
    }
  }
  return out;
}

/** Amplitude from each slit separately at (x, y): returns [ψ1, ψ2]. 2D waves fall off as 1/√r. */
export function slitAmplitudes(g: SlitGeom, x: number, y: number): [C, C] {
  const k = (2 * Math.PI) / g.lambda;
  let r0 = 0, i0 = 0, r1 = 0, i1 = 0;
  for (const [s, ys] of slitSources(g)) {
    const dx = x - g.xb, dy = y - ys;
    const r = Math.sqrt(dx * dx + dy * dy) + 1e-6;
    const amp = 1 / Math.sqrt(r);
    const ph = k * r;
    if (s === 0) {
      r0 += amp * Math.cos(ph);
      i0 += amp * Math.sin(ph);
    } else {
      r1 += amp * Math.cos(ph);
      i1 += amp * Math.sin(ph);
    }
  }
  return [c(r0, i0), c(r1, i1)];
}

/**
 * Intensity along a screen at x = xs for pixel rows 0..H-1.
 * coherence γ ∈ [0,1]: 1 = indistinguishable paths (amplitudes add), 0 = fully distinguishable (probabilities add).
 */
export function screenIntensity(g: SlitGeom, xs: number, H: number, coherence = 1): Float64Array {
  const I = new Float64Array(H);
  for (let y = 0; y < H; y++) {
    const [p1, p2] = slitAmplitudes(g, xs, y + 0.5);
    const cross = 2 * (p1.re * p2.re + p1.im * p2.im); // 2 Re(ψ1* ψ2)
    I[y] = Math.max(0, abs2(p1) + abs2(p2) + coherence * cross);
  }
  return I;
}

/** Build a sampler from a non-negative weight array; returns a function rng → (fractional) index. */
export function makeSampler(w: ArrayLike<number>): (rng: () => number) => number {
  const n = w.length;
  const cdf = new Float64Array(n);
  let s = 0;
  for (let i = 0; i < n; i++) {
    s += Math.max(0, w[i]);
    cdf[i] = s;
  }
  return (rng) => {
    if (s <= 0) return rng() * n;
    const u = rng() * s;
    let lo = 0, hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < u) lo = mid + 1;
      else hi = mid;
    }
    return lo + rng();
  };
}

/** Far-field (Fraunhofer) two-slit pattern used for compact plots: I(s) with s = sinθ. */
export function fraunhofer(s: number, d: number, a: number, lambda: number, coherence = 1): number {
  const beta = (Math.PI * a * s) / lambda;
  const env = Math.abs(beta) < 1e-9 ? 1 : (Math.sin(beta) / beta) ** 2;
  const delta = (2 * Math.PI * d * s) / lambda; // phase difference between slits
  return env * 0.5 * (1 + coherence * Math.cos(delta));
}

/* ------------------------------------------------------------------ */
/* Mach–Zehnder interferometer (symmetric beam splitter, i on reflection) */
/* ------------------------------------------------------------------ */

const R2 = Math.SQRT1_2;
/** Beam splitter amplitudes: transmission t = 1/√2, reflection r = i/√2. */
export const BS_T: C = c(R2, 0);
export const BS_R: C = c(0, R2);

export interface MZOptions {
  /** phase shift added in the lower arm */
  phi: number;
  /** second beam splitter present? */
  bs2?: boolean;
  /** lower arm blocked (absorber / live bomb)? */
  block?: boolean;
}

export interface MZResult {
  /** amplitude in the lower arm (transmitted at BS1), after the phase shifter */
  lower: C;
  /** amplitude in the upper arm (reflected at BS1) */
  upper: C;
  /** contributions to D1 (exit travelling right): [via upper, via lower] */
  d1Paths: [C, C];
  /** contributions to D0 (exit travelling up): [via upper, via lower] */
  d0Paths: [C, C];
  d1: C;
  d0: C;
  pD1: number;
  pD0: number;
  /** probability the photon is absorbed by the block */
  pBlock: number;
}

/**
 * Geometry: photon enters BS1 travelling right. Transmitted → lower arm (→ phase shifter → mirror → up into BS2).
 * Reflected → upper arm (↑ → mirror → right into BS2). D1 sits to the right of BS2, D0 above it.
 * Mirrors add the same phase to both arms, so they are ignored.
 */
export function machZehnder({ phi, bs2 = true, block = false }: MZOptions): MZResult {
  const lower = block ? c(0) : mul(BS_T, expi(phi));
  const upper = BS_R;
  let d1Paths: [C, C], d0Paths: [C, C];
  if (bs2) {
    // upper arm arrives travelling right: transmitted → D1, reflected → D0
    // lower arm arrives travelling up:   transmitted → D0, reflected → D1
    d1Paths = [mul(upper, BS_T), mul(lower, BS_R)];
    d0Paths = [mul(upper, BS_R), mul(lower, BS_T)];
  } else {
    d1Paths = [upper, c(0)];
    d0Paths = [c(0), lower];
  }
  const d1 = add(d1Paths[0], d1Paths[1]);
  const d0 = add(d0Paths[0], d0Paths[1]);
  return { lower, upper, d1Paths, d0Paths, d1, d0, pD1: abs2(d1), pD0: abs2(d0), pBlock: block ? 0.5 : 0 };
}

/* ------------------------------------------------------------------ */
/* Polarizers                                                          */
/* ------------------------------------------------------------------ */

/** Malus: fraction of polarized light at angle `pol` passing a polarizer at `axis` (radians). */
export const malus = (pol: number, axis: number) => Math.cos(pol - axis) ** 2;

/** Transmission of a chain of polarizers. `input` = polarization angle, or null for unpolarized light. */
export function chainTransmission(input: number | null, axes: number[]): number {
  if (!axes.length) return 1;
  let T = input === null ? 0.5 : malus(input, axes[0]);
  for (let i = 1; i < axes.length; i++) T *= malus(axes[i - 1], axes[i]);
  return T;
}

/* ------------------------------------------------------------------ */
/* Quantum Zeno bomb test                                             */
/* ------------------------------------------------------------------ */

/** Probability that a live bomb survives N cycles of rotation by π/(2N) and the photon exits H. */
export const zenoSurvival = (N: number) => Math.cos(Math.PI / (2 * N)) ** (2 * N);

/** Visibility for a which-path marker with overlap γ: V = |γ|, D = √(1−|γ|²). */
export const visibilityFromD = (D: number) => Math.sqrt(Math.max(0, 1 - D * D));

