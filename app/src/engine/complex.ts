/** Minimal complex-number toolkit used across the app. */
export interface C {
  re: number;
  im: number;
}

export const c = (re: number, im = 0): C => ({ re, im });
export const ZERO: C = c(0, 0);
export const ONE: C = c(1, 0);
export const I: C = c(0, 1);

export const add = (a: C, b: C): C => c(a.re + b.re, a.im + b.im);
export const sub = (a: C, b: C): C => c(a.re - b.re, a.im - b.im);
export const mul = (a: C, b: C): C => c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
export const scale = (a: C, s: number): C => c(a.re * s, a.im * s);
export const conj = (a: C): C => c(a.re, -a.im);
export const abs2 = (a: C): number => a.re * a.re + a.im * a.im;
export const abs = (a: C): number => Math.hypot(a.re, a.im);
export const arg = (a: C): number => Math.atan2(a.im, a.re);
export const expi = (theta: number): C => c(Math.cos(theta), Math.sin(theta));
export const polar = (r: number, theta: number): C => c(r * Math.cos(theta), r * Math.sin(theta));
export const div = (a: C, b: C): C => {
  const d = abs2(b);
  return c((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
};
export const neg = (a: C): C => c(-a.re, -a.im);
export const close = (a: C, b: C, eps = 1e-9) => Math.abs(a.re - b.re) < eps && Math.abs(a.im - b.im) < eps;

/** Pretty-print a complex number compactly, e.g. "0.707", "-0.5i", "0.5+0.5i". */
export function fmt(a: C, digits = 3): string {
  const r = Math.abs(a.re) < 10 ** -digits / 2 ? 0 : a.re;
  const i = Math.abs(a.im) < 10 ** -digits / 2 ? 0 : a.im;
  const f = (x: number) => {
    const s = x.toFixed(digits);
    return s.replace(/\.?0+$/, '');
  };
  if (i === 0) return f(r);
  if (r === 0) return (i === 1 ? '' : i === -1 ? '-' : f(i)) + 'i';
  return `${f(r)}${i < 0 ? '−' : '+'}${Math.abs(i) === 1 ? '' : f(Math.abs(i))}i`;
}

/** Map a phase angle to a colour on the standard phase wheel (used everywhere in the app). */
export function phaseColor(theta: number, lightness = 60, sat = 85): string {
  let deg = (theta * 180) / Math.PI;
  deg = ((deg % 360) + 360) % 360;
  return `hsl(${deg.toFixed(1)}, ${sat}%, ${lightness}%)`;
}

/** Same as phaseColor but returns [r,g,b] in 0..255 for pixel buffers. */
export function phaseRGB(theta: number, value = 1): [number, number, number] {
  let h = ((theta / (2 * Math.PI)) % 1 + 1) % 1;
  const s = 0.85;
  const l = 0.5 * value + 0.05 * value;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [hue2rgb(h + 1 / 3) * 255, hue2rgb(h) * 255, hue2rgb(h - 1 / 3) * 255];
}

/** Dense complex matrix helpers (small matrices only). */
export type Mat = C[][];

export function matMul(A: Mat, B: Mat): Mat {
  const n = A.length, m = B[0].length, k = B.length;
  const out: Mat = [];
  for (let i = 0; i < n; i++) {
    const row: C[] = [];
    for (let j = 0; j < m; j++) {
      let re = 0, im = 0;
      for (let t = 0; t < k; t++) {
        const a = A[i][t], b = B[t][j];
        re += a.re * b.re - a.im * b.im;
        im += a.re * b.im + a.im * b.re;
      }
      row.push(c(re, im));
    }
    out.push(row);
  }
  return out;
}

export function matVec(A: Mat, v: C[]): C[] {
  return A.map((row) => row.reduce((acc, a, j) => add(acc, mul(a, v[j])), ZERO));
}

export function dagger(A: Mat): Mat {
  return A[0].map((_, j) => A.map((row) => conj(row[j])));
}

export function kron(A: Mat, B: Mat): Mat {
  const out: Mat = [];
  for (let i = 0; i < A.length; i++)
    for (let k = 0; k < B.length; k++) {
      const row: C[] = [];
      for (let j = 0; j < A[0].length; j++) for (let l = 0; l < B[0].length; l++) row.push(mul(A[i][j], B[k][l]));
      out.push(row);
    }
  return out;
}

export function identity(n: number): Mat {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? ONE : ZERO)));
}

export function isUnitary(A: Mat, eps = 1e-9): boolean {
  const P = matMul(A, dagger(A));
  return P.every((row, i) => row.every((v, j) => close(v, i === j ? ONE : ZERO, eps)));
}

export function inner(a: C[], b: C[]): C {
  let re = 0, im = 0;
  for (let i = 0; i < a.length; i++) {
    re += a[i].re * b[i].re + a[i].im * b[i].im;
    im += a[i].re * b[i].im - a[i].im * b[i].re;
  }
  return c(re, im);
}

/** Eigen-decomposition of a 2x2 Hermitian matrix [[a, b],[b*, d]]. Returns ascending eigenvalues. */
export function eigHermitian2(M: Mat): { values: [number, number]; vectors: [C[], C[]] } {
  const a = M[0][0].re, d = M[1][1].re, b = M[0][1];
  const tr = (a + d) / 2;
  const disc = Math.sqrt(((a - d) / 2) ** 2 + abs2(b));
  const l1 = tr - disc, l2 = tr + disc;
  if (abs(b) < 1e-12) {
    return a <= d
      ? { values: [a, d], vectors: [[ONE, ZERO], [ZERO, ONE]] }
      : { values: [d, a], vectors: [[ZERO, ONE], [ONE, ZERO]] };
  }
  const vec = (l: number): C[] => {
    // (a-l) x + b y = 0  -> x = b, y = l - a   (or use second row if degenerate)
    let x: C, y: C;
    if (abs(b) > 1e-12) {
      x = b;
      y = c(l - a, 0);
    } else {
      x = Math.abs(a - l) < 1e-12 ? ONE : ZERO;
      y = Math.abs(a - l) < 1e-12 ? ZERO : ONE;
    }
    const n = Math.sqrt(abs2(x) + abs2(y));
    return [scale(x, 1 / n), scale(y, 1 / n)];
  };
  return { values: [l1, l2], vectors: [vec(l1), vec(l2)] };
}
