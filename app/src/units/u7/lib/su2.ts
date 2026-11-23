/**
 * Single-qubit unitary helpers for World 7: ZYZ Euler decomposition, axis–angle form,
 * fractional powers, and small 2×2 algebra on Mat2 (row-major [a b; c d]).
 */
import { c, mul, add, conj, abs, arg, expi, scale, type C } from '../../../engine/complex';
import { Rz, Ry, Rn, type Mat2 } from '../../../engine/qsim';

export type Vec3 = [number, number, number];

export const mm2 = (A: Mat2, B: Mat2): Mat2 => [
  add(mul(A[0], B[0]), mul(A[1], B[2])),
  add(mul(A[0], B[1]), mul(A[1], B[3])),
  add(mul(A[2], B[0]), mul(A[3], B[2])),
  add(mul(A[2], B[1]), mul(A[3], B[3])),
];
export const dag2 = (A: Mat2): Mat2 => [conj(A[0]), conj(A[2]), conj(A[1]), conj(A[3])];
export const scale2 = (A: Mat2, z: C): Mat2 => [mul(A[0], z), mul(A[1], z), mul(A[2], z), mul(A[3], z)];
export const apply2 = (A: Mat2, [a, b]: [C, C]): [C, C] => [add(mul(A[0], a), mul(A[1], b)), add(mul(A[2], a), mul(A[3], b))];

/** |Tr(A†B)|/2 — 1 iff A and B are equal up to global phase. */
export function overlap2(A: Mat2, B: Mat2): number {
  const t = add(add(mul(conj(A[0]), B[0]), mul(conj(A[1]), B[1])), add(mul(conj(A[2]), B[2]), mul(conj(A[3]), B[3])));
  return abs(t) / 2;
}

/** Wrap an angle to (−π, π]. */
export function wrap(a: number): number {
  let x = ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  if (x <= -Math.PI + 1e-12) x += 2 * Math.PI;
  return x;
}

export interface ZYZ {
  /** global phase */
  alpha: number;
  beta: number;
  gamma: number;
  delta: number;
}

/**
 * U = e^{iα} Rz(β) Ry(γ) Rz(δ)  (Nielsen & Chuang Thm 4.1), with γ ∈ [0, π] and β, δ ∈ (−π, π].
 * In circuit (time) order: Rz(δ) first, then Ry(γ), then Rz(β).
 */
export function zyz(U: Mat2): ZYZ {
  const det = add(mul(U[0], U[3]), scale(mul(U[1], U[2]), -1));
  const half = arg(det) / 2;
  const ph = expi(-half);
  const a = mul(U[0], ph); // V00
  const b = mul(U[2], ph); // V10
  const ma = abs(a), mb = abs(b);
  const gamma = 2 * Math.atan2(mb, ma);
  let beta: number, delta: number;
  if (mb < 1e-9) {
    delta = 0;
    beta = wrap(-2 * arg(a));
  } else if (ma < 1e-9) {
    delta = 0;
    beta = wrap(2 * arg(b));
  } else {
    beta = wrap(arg(b) - arg(a));
    delta = wrap(-arg(a) - arg(b));
  }
  const W = mm2(Rz(beta), mm2(Ry(gamma), Rz(delta)));
  // U = e^{iα} W  ⇒  Tr(W† U) = 2 e^{iα}
  const t = add(add(mul(conj(W[0]), U[0]), mul(conj(W[1]), U[1])), add(mul(conj(W[2]), U[2]), mul(conj(W[3]), U[3])));
  return { alpha: wrap(arg(t)), beta, gamma, delta };
}

export function fromZYZ({ alpha, beta, gamma, delta }: ZYZ): Mat2 {
  return scale2(mm2(Rz(beta), mm2(Ry(gamma), Rz(delta))), expi(alpha));
}

/**
 * Axis–angle form: U = e^{iα} R_n(ω) with ω ∈ [0, π] … 2π handled by choosing the sign
 * so that cos(ω/2) ≥ 0, i.e. ω ∈ [0, π]. (Rotations by more than π are the same as
 * rotations by less than π about the opposite axis.)
 */
export function axisAngle(U: Mat2): { axis: Vec3; angle: number; alpha: number } {
  const det = add(mul(U[0], U[3]), scale(mul(U[1], U[2]), -1));
  let ph = expi(-arg(det) / 2);
  let alpha = arg(det) / 2;
  let a = mul(U[0], ph), b = mul(U[2], ph);
  if (a.re < 0) {
    ph = scale(ph, -1);
    alpha += Math.PI;
    a = scale(a, -1);
    b = scale(b, -1);
  }
  const co = Math.max(-1, Math.min(1, a.re));
  const angle = 2 * Math.acos(co);
  const si = Math.sin(angle / 2);
  if (si < 1e-9) return { axis: [0, 0, 1], angle: 0, alpha: wrap(alpha) };
  // Rn: V00 = cos − i nz sin, V10 = ny sin − i nx sin
  const axis: Vec3 = [-b.im / si, b.re / si, -a.im / si];
  const n = Math.hypot(...axis);
  return { axis: [axis[0] / n, axis[1] / n, axis[2] / n], angle, alpha: wrap(alpha) };
}

/** U^t along the shortest geodesic (axis fixed, angle and global phase scaled by t). */
export function powU(U: Mat2, t: number): Mat2 {
  const { axis, angle, alpha } = axisAngle(U);
  return scale2(Rn(angle * t, axis[0], axis[1], axis[2]), expi(alpha * t));
}

/** Bloch vector of a single-qubit pure state. */
export function blochOf([a, b]: [C, C]): Vec3 {
  const r01 = mul(a, conj(b));
  return [2 * r01.re, -2 * r01.im, a.re * a.re + a.im * a.im - (b.re * b.re + b.im * b.im)];
}

/** Rotate a Bloch vector about a unit axis by angle a (Rodrigues). */
export function rot(v: Vec3, n: Vec3, a: number): Vec3 {
  const co = Math.cos(a), si = Math.sin(a);
  const d = n[0] * v[0] + n[1] * v[1] + n[2] * v[2];
  const cr: Vec3 = [n[1] * v[2] - n[2] * v[1], n[2] * v[0] - n[0] * v[2], n[0] * v[1] - n[1] * v[0]];
  return [0, 1, 2].map((i) => v[i] * co + cr[i] * si + n[i] * d * (1 - co)) as Vec3;
}

export const ket0: [C, C] = [c(1), c(0)];
