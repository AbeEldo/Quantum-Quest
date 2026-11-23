/**
 * World 5 physics helpers (ħ = m = 1 unless stated).
 *
 *  - transmission(E, layers): exact plane-wave transmission through a piecewise-constant
 *    potential (transfer matrices for (ψ, ψ')), V = 0 outside.
 *  - freeGaussian(x, t, x0, sigma, k0): analytic free-particle Gaussian packet.
 *  - transmonLevels(EJ, EC, count): eigenenergies of H = 4E_C n² − E_J cos φ (phase basis, hard walls at ±π).
 */
import { boundStates } from '../../engine/wave1d';

export interface Layer {
  /** Width of this layer. */
  width: number;
  /** Potential inside the layer. */
  V: number;
}

/**
 * Transmission probability for a particle of energy E > 0 incident from the left
 * on consecutive layers (V = 0 to the left and right).
 */
export function transmission(E: number, layers: Layer[], mass = 1): number {
  return scatter(E, layers, mass).T;
}

export function scatter(E: number, layers: Layer[], mass = 1): { T: number; R: number } {
  if (E <= 0) return { T: 0, R: 1 };
  // real 2x2 transfer matrix acting on (ψ, ψ')
  let a = 1, b = 0, c = 0, d = 1;
  for (const L of layers) {
    const q2 = 2 * mass * (E - L.V);
    const w = L.width;
    let m00: number, m01: number, m10: number, m11: number;
    if (Math.abs(q2) < 1e-12) {
      m00 = 1; m01 = w; m10 = 0; m11 = 1;
    } else if (q2 > 0) {
      const q = Math.sqrt(q2);
      const co = Math.cos(q * w), si = Math.sin(q * w);
      m00 = co; m01 = si / q; m10 = -q * si; m11 = co;
    } else {
      const kap = Math.sqrt(-q2);
      const ch = Math.cosh(kap * w), sh = Math.sinh(kap * w);
      m00 = ch; m01 = sh / kap; m10 = kap * sh; m11 = ch;
    }
    // P = M · P
    const na = m00 * a + m01 * c, nb = m00 * b + m01 * d;
    const nc = m10 * a + m11 * c, nd = m10 * b + m11 * d;
    a = na; b = nb; c = nc; d = nd;
  }
  const k = Math.sqrt(2 * mass * E);
  // α = i k a − c ; β = −b k² − i d k
  const alR = -c, alI = k * a;
  const beR = -b * k * k, beI = -d * k;
  // r = −(α+β)/(α−β)
  const nR = -(alR + beR), nI = -(alI + beI);
  const dR = alR - beR, dI = alI - beI;
  const den = dR * dR + dI * dI;
  const rR = (nR * dR + nI * dI) / den, rI = (nI * dR - nR * dI) / den;
  // t' = a(1+r) + i b k (1−r),  with  i b k (1 − r) = b k rI + i b k (1 − rR)
  const tR = a * (1 + rR) + b * k * rI;
  const tI = a * rI + b * k * (1 - rR);
  return { T: tR * tR + tI * tI, R: rR * rR + rI * rI };
}

/** Convenience: n identical barriers of height V0 and width a separated by gaps g. */
export function barrierStack(V0: number, a: number, gaps: number[]): Layer[] {
  const out: Layer[] = [{ width: a, V: V0 }];
  for (const g of gaps) {
    out.push({ width: g, V: 0 }, { width: a, V: V0 });
  }
  return out;
}

/** Analytic free Gaussian packet ψ(x,t) (normalised), returns [re, im]. */
export function freeGaussian(x: number, t: number, x0: number, sigma: number, k0: number): [number, number] {
  // ψ = (2πσ²)^(-1/4) (1 + i t/(2σ²))^(-1/2) exp( -(x-x0-k0 t)² / (4σ²(1+ i t/(2σ²))) + i k0 (x - x0) - i k0² t /2 )
  const s2 = sigma * sigma;
  const tau = t / (2 * s2);
  // 1/(1 + i tau) = (1 - i tau)/(1+tau²)
  const den = 1 + tau * tau;
  const u = x - x0 - k0 * t;
  const expRe = (-(u * u) / (4 * s2)) / den;
  const expIm = ((u * u) / (4 * s2)) * (tau / den) + k0 * (x - x0) - (k0 * k0 * t) / 2;
  // (1 + i tau)^(-1/2): modulus den^(-1/4), phase -atan(tau)/2
  const pre = Math.pow(2 * Math.PI * s2, -0.25) * Math.pow(den, -0.25);
  const ph = expIm - Math.atan(tau) / 2;
  const mag = pre * Math.exp(expRe);
  return [mag * Math.cos(ph), mag * Math.sin(ph)];
}

/** Width of a free Gaussian packet at time t: σ(t) = σ √(1 + (t/(2σ²))²). */
export const sigmaAt = (sigma: number, t: number) => sigma * Math.sqrt(1 + (t / (2 * sigma * sigma)) ** 2);

/** Transmon levels E_n (relative to E_0 = 0) in units of E_C. */
export function transmonLevels(EJoverEC: number, count = 5, N = 500): number[] {
  const EC = 1;
  const dphi = (2 * Math.PI) / (N + 1);
  const V = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const phi = -Math.PI + (i + 1) * dphi;
    V[i] = -EJoverEC * EC * Math.cos(phi);
  }
  const mass = 1 / (8 * EC);
  const { E } = boundStates(V, dphi, count, mass);
  return E.map((e) => e - E[0]);
}

/**
 * Rasterise layers (starting at x = start) onto grid points x[i] with spacing dx,
 * using the fraction of each cell [x−dx/2, x+dx/2] covered by each layer (anti-aliased edges).
 */
export function rasterLayers(x: ArrayLike<number>, dx: number, layers: Layer[], start = 0): Float64Array {
  const V = new Float64Array(x.length);
  let x0 = start;
  const bounds = layers.map((L) => {
    const b = { a: x0, b: x0 + L.width, V: L.V };
    x0 += L.width;
    return b;
  });
  for (let i = 0; i < x.length; i++) {
    const c0 = x[i] - dx / 2, c1 = x[i] + dx / 2;
    let v = 0;
    for (const s of bounds) {
      const ov = Math.min(c1, s.b) - Math.max(c0, s.a);
      if (ov > 0) v += (s.V * ov) / dx;
    }
    V[i] = v;
  }
  return V;
}
