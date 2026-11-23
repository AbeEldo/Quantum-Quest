/**
 * qsim — a small, exact state-vector & density-matrix quantum simulator.
 *
 * Convention (Nielsen & Chuang): qubit 0 is the TOP wire of a circuit and the
 * LEFT-most symbol in a ket.  |q0 q1 ... q(n-1)>.  So for n=2, index 1 = |01>
 * means q0=0, q1=1.
 */
import { C, Mat, c, ONE, ZERO, abs2, conj, mul, add, scale, expi } from './complex';

export type Mat2 = [C, C, C, C]; // row-major [a b; c d]

const s2 = Math.SQRT1_2;

export const GATES = {
  I: [ONE, ZERO, ZERO, ONE] as Mat2,
  X: [ZERO, ONE, ONE, ZERO] as Mat2,
  Y: [ZERO, c(0, -1), c(0, 1), ZERO] as Mat2,
  Z: [ONE, ZERO, ZERO, c(-1)] as Mat2,
  H: [c(s2), c(s2), c(s2), c(-s2)] as Mat2,
  S: [ONE, ZERO, ZERO, c(0, 1)] as Mat2,
  Sdg: [ONE, ZERO, ZERO, c(0, -1)] as Mat2,
  T: [ONE, ZERO, ZERO, expi(Math.PI / 4)] as Mat2,
  Tdg: [ONE, ZERO, ZERO, expi(-Math.PI / 4)] as Mat2,
  SX: [c(0.5, 0.5), c(0.5, -0.5), c(0.5, -0.5), c(0.5, 0.5)] as Mat2,
};

export const Rx = (t: number): Mat2 => [c(Math.cos(t / 2)), c(0, -Math.sin(t / 2)), c(0, -Math.sin(t / 2)), c(Math.cos(t / 2))];
export const Ry = (t: number): Mat2 => [c(Math.cos(t / 2)), c(-Math.sin(t / 2)), c(Math.sin(t / 2)), c(Math.cos(t / 2))];
export const Rz = (t: number): Mat2 => [expi(-t / 2), ZERO, ZERO, expi(t / 2)];
export const Phase = (p: number): Mat2 => [ONE, ZERO, ZERO, expi(p)];
/** General single-qubit gate U(θ,φ,λ) (OpenQASM convention). */
export const U3 = (t: number, p: number, l: number): Mat2 => [
  c(Math.cos(t / 2)),
  scale(expi(l), -Math.sin(t / 2)),
  scale(expi(p), Math.sin(t / 2)),
  scale(expi(p + l), Math.cos(t / 2)),
];
/** Rotation by angle t about an arbitrary unit axis (nx,ny,nz) on the Bloch sphere. */
export const Rn = (t: number, nx: number, ny: number, nz: number): Mat2 => {
  const co = Math.cos(t / 2), si = Math.sin(t / 2);
  return [c(co, -nz * si), c(-ny * si, -nx * si), c(ny * si, -nx * si), c(co, nz * si)];
};

export function mat2ToMat(m: Mat2): Mat {
  return [
    [m[0], m[1]],
    [m[2], m[3]],
  ];
}

/**
 * Low-level kernel: apply 2x2 matrix m to bit position `bit` (0 = least significant)
 * of the amplitude arrays, only on indices where (idx & ctrlMask) === ctrlVal.
 */
export function applyMat2Raw(re: Float64Array, im: Float64Array, bit: number, m: Mat2, ctrlMask = 0, ctrlVal = 0) {
  const len = re.length;
  const step = 1 << bit;
  const [a, b, cc, d] = m;
  for (let i = 0; i < len; i++) {
    if (i & step) continue;
    if ((i & ctrlMask) !== ctrlVal) continue;
    const j = i | step;
    const r0 = re[i], i0 = im[i], r1 = re[j], i1 = im[j];
    re[i] = a.re * r0 - a.im * i0 + b.re * r1 - b.im * i1;
    im[i] = a.re * i0 + a.im * r0 + b.re * i1 + b.im * r1;
    re[j] = cc.re * r0 - cc.im * i0 + d.re * r1 - d.im * i1;
    im[j] = cc.re * i0 + cc.im * r0 + d.re * i1 + d.im * r1;
  }
}

export type RNG = () => number;

/** Seeded PRNG (mulberry32) so games can be reproducible. */
export function mulberry32(seed: number): RNG {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class StateVector {
  readonly n: number;
  readonly dim: number;
  re: Float64Array;
  im: Float64Array;

  constructor(n: number, basisIndex = 0) {
    this.n = n;
    this.dim = 1 << n;
    this.re = new Float64Array(this.dim);
    this.im = new Float64Array(this.dim);
    this.re[basisIndex] = 1;
  }

  static fromAmplitudes(amps: C[], normalize = true): StateVector {
    const n = Math.round(Math.log2(amps.length));
    if (1 << n !== amps.length) throw new Error('amplitude count must be a power of 2');
    const s = new StateVector(n);
    let nrm = 0;
    amps.forEach((a, i) => {
      s.re[i] = a.re;
      s.im[i] = a.im;
      nrm += abs2(a);
    });
    if (normalize && nrm > 0) {
      const k = 1 / Math.sqrt(nrm);
      for (let i = 0; i < s.dim; i++) {
        s.re[i] *= k;
        s.im[i] *= k;
      }
    }
    return s;
  }

  /** Product state from per-qubit Bloch angles (θ, φ). */
  static fromBloch(angles: [number, number][]): StateVector {
    let amps: C[] = [ONE];
    for (const [t, p] of angles) {
      const q = [c(Math.cos(t / 2)), scale(expi(p), Math.sin(t / 2))];
      const next: C[] = [];
      for (const a of amps) for (const b of q) next.push(mul(a, b));
      amps = next;
    }
    return StateVector.fromAmplitudes(amps, false);
  }

  clone(): StateVector {
    const s = new StateVector(this.n);
    s.re.set(this.re);
    s.im.set(this.im);
    return s;
  }

  /** bit position (from LSB) of qubit q */
  bitOf(q: number) {
    return this.n - 1 - q;
  }

  amplitude(i: number): C {
    return c(this.re[i], this.im[i]);
  }

  amplitudes(): C[] {
    return Array.from({ length: this.dim }, (_, i) => this.amplitude(i));
  }

  /** Apply single-qubit matrix to `target`, optionally controlled on `controls` (all must be |1>, or match controlValues). */
  apply(m: Mat2, target: number, controls: number[] = [], controlValues?: number[]): this {
    let mask = 0, val = 0;
    controls.forEach((q, k) => {
      const b = 1 << this.bitOf(q);
      mask |= b;
      if (!controlValues || controlValues[k]) val |= b;
    });
    applyMat2Raw(this.re, this.im, this.bitOf(target), m, mask, val);
    return this;
  }

  h(q: number) { return this.apply(GATES.H, q); }
  x(q: number) { return this.apply(GATES.X, q); }
  y(q: number) { return this.apply(GATES.Y, q); }
  z(q: number) { return this.apply(GATES.Z, q); }
  s(q: number) { return this.apply(GATES.S, q); }
  t(q: number) { return this.apply(GATES.T, q); }
  cx(c0: number, t: number) { return this.apply(GATES.X, t, [c0]); }
  cz(c0: number, t: number) { return this.apply(GATES.Z, t, [c0]); }
  ccx(c0: number, c1: number, t: number) { return this.apply(GATES.X, t, [c0, c1]); }

  swap(a: number, b: number): this {
    if (a === b) return this;
    const ba = 1 << this.bitOf(a), bb = 1 << this.bitOf(b);
    for (let i = 0; i < this.dim; i++) {
      if (i & ba && !(i & bb)) {
        const j = (i & ~ba) | bb;
        [this.re[i], this.re[j]] = [this.re[j], this.re[i]];
        [this.im[i], this.im[j]] = [this.im[j], this.im[i]];
      }
    }
    return this;
  }

  /** Apply a dense k-qubit unitary (2^k x 2^k) to the listed qubits (targets[0] is most significant). */
  applyMatrix(U: Mat, targets: number[]): this {
    const k = targets.length;
    const sub = 1 << k;
    const bits = targets.map((q) => 1 << this.bitOf(q));
    const allMask = bits.reduce((a, b) => a | b, 0);
    const idx = new Array<number>(sub);
    const vr = new Float64Array(sub), vi = new Float64Array(sub);
    for (let base = 0; base < this.dim; base++) {
      if (base & allMask) continue;
      for (let s = 0; s < sub; s++) {
        let i = base;
        for (let t = 0; t < k; t++) if (s & (1 << (k - 1 - t))) i |= bits[t];
        idx[s] = i;
        vr[s] = this.re[i];
        vi[s] = this.im[i];
      }
      for (let r = 0; r < sub; r++) {
        let ar = 0, ai = 0;
        const row = U[r];
        for (let s = 0; s < sub; s++) {
          ar += row[s].re * vr[s] - row[s].im * vi[s];
          ai += row[s].re * vi[s] + row[s].im * vr[s];
        }
        this.re[idx[r]] = ar;
        this.im[idx[r]] = ai;
      }
    }
    return this;
  }

  /** Apply a classical permutation |x> -> |f(x)> on the listed qubits (f must be a bijection on 0..2^k-1). */
  applyPermutation(f: (x: number) => number, targets: number[]): this {
    const k = targets.length;
    const sub = 1 << k;
    const U: Mat = Array.from({ length: sub }, () => Array.from({ length: sub }, () => ZERO));
    for (let x = 0; x < sub; x++) U[f(x)][x] = ONE;
    return this.applyMatrix(U, targets);
  }

  probabilities(): number[] {
    const p = new Array<number>(this.dim);
    for (let i = 0; i < this.dim; i++) p[i] = this.re[i] ** 2 + this.im[i] ** 2;
    return p;
  }

  /** Probability that qubit q reads 1. */
  prob1(q: number): number {
    const b = 1 << this.bitOf(q);
    let p = 0;
    for (let i = 0; i < this.dim; i++) if (i & b) p += this.re[i] ** 2 + this.im[i] ** 2;
    return p;
  }

  norm(): number {
    let s = 0;
    for (let i = 0; i < this.dim; i++) s += this.re[i] ** 2 + this.im[i] ** 2;
    return Math.sqrt(s);
  }

  normalize(): this {
    const k = 1 / this.norm();
    for (let i = 0; i < this.dim; i++) {
      this.re[i] *= k;
      this.im[i] *= k;
    }
    return this;
  }

  /** Projectively measure qubit q in the computational basis; collapses the state. */
  measure(q: number, rng: RNG = Math.random): 0 | 1 {
    const p1 = this.prob1(q);
    const outcome: 0 | 1 = rng() < p1 ? 1 : 0;
    this.collapse(q, outcome);
    return outcome;
  }

  /** Force qubit q into `outcome` (post-selection) and renormalise. Returns the probability it had. */
  collapse(q: number, outcome: 0 | 1): number {
    const b = 1 << this.bitOf(q);
    let p = 0;
    for (let i = 0; i < this.dim; i++) {
      const bit = i & b ? 1 : 0;
      if (bit !== outcome) {
        this.re[i] = 0;
        this.im[i] = 0;
      } else p += this.re[i] ** 2 + this.im[i] ** 2;
    }
    if (p > 1e-15) {
      const k = 1 / Math.sqrt(p);
      for (let i = 0; i < this.dim; i++) {
        this.re[i] *= k;
        this.im[i] *= k;
      }
    }
    return p;
  }

  measureAll(rng: RNG = Math.random): number {
    const r = rng();
    let acc = 0;
    let out = this.dim - 1;
    for (let i = 0; i < this.dim; i++) {
      acc += this.re[i] ** 2 + this.im[i] ** 2;
      if (r < acc) {
        out = i;
        break;
      }
    }
    this.re.fill(0);
    this.im.fill(0);
    this.re[out] = 1;
    return out;
  }

  /** Sample measurement outcomes of all qubits without collapsing. */
  sample(shots: number, rng: RNG = Math.random): Map<number, number> {
    const p = this.probabilities();
    const cdf: number[] = [];
    let acc = 0;
    for (const x of p) cdf.push((acc += x));
    const counts = new Map<number, number>();
    for (let s = 0; s < shots; s++) {
      const r = rng() * acc;
      let lo = 0, hi = cdf.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cdf[mid] > r) hi = mid;
        else lo = mid + 1;
      }
      counts.set(lo, (counts.get(lo) ?? 0) + 1);
    }
    return counts;
  }

  /** <this|other> */
  inner(other: StateVector): C {
    let re = 0, im = 0;
    for (let i = 0; i < this.dim; i++) {
      re += this.re[i] * other.re[i] + this.im[i] * other.im[i];
      im += this.re[i] * other.im[i] - this.im[i] * other.re[i];
    }
    return c(re, im);
  }

  fidelity(other: StateVector): number {
    return abs2(this.inner(other));
  }

  /** 2x2 reduced density matrix of qubit q. */
  reduced1(q: number): Mat {
    const b = 1 << this.bitOf(q);
    let r00 = 0, r11 = 0, r01re = 0, r01im = 0;
    for (let i = 0; i < this.dim; i++) {
      if (i & b) continue;
      const j = i | b;
      r00 += this.re[i] ** 2 + this.im[i] ** 2;
      r11 += this.re[j] ** 2 + this.im[j] ** 2;
      // rho01 = sum a_i * conj(a_j)
      r01re += this.re[i] * this.re[j] + this.im[i] * this.im[j];
      r01im += this.im[i] * this.re[j] - this.re[i] * this.im[j];
    }
    return [
      [c(r00), c(r01re, r01im)],
      [c(r01re, -r01im), c(r11)],
    ];
  }

  /** Bloch vector (x,y,z) of qubit q's reduced state. Length < 1 means q is entangled with others. */
  bloch(q: number): [number, number, number] {
    return blochFromRho(this.reduced1(q));
  }

  /** Von Neumann entropy (bits) of qubit q's reduced state: 0 = unentangled, 1 = maximally entangled. */
  entropy1(q: number): number {
    const [x, y, z] = this.bloch(q);
    const r = Math.min(1, Math.hypot(x, y, z));
    const l1 = (1 + r) / 2, l2 = (1 - r) / 2;
    const h = (p: number) => (p > 1e-12 ? -p * Math.log2(p) : 0);
    return h(l1) + h(l2);
  }

  /** Remove an overall phase so the first non-negligible amplitude is real positive (for display). */
  canonicalPhase(): this {
    for (let i = 0; i < this.dim; i++) {
      const m = Math.hypot(this.re[i], this.im[i]);
      if (m > 1e-9) {
        const ph = c(this.re[i] / m, -this.im[i] / m);
        for (let j = 0; j < this.dim; j++) {
          const a = mul(c(this.re[j], this.im[j]), ph);
          this.re[j] = a.re;
          this.im[j] = a.im;
        }
        break;
      }
    }
    return this;
  }
}

export function blochFromRho(rho: Mat): [number, number, number] {
  return [2 * rho[0][1].re, -2 * rho[0][1].im, rho[0][0].re - rho[1][1].re];
}

/** Bloch angles (θ, φ) → single-qubit amplitudes. */
export function blochToAmps(theta: number, phi: number): [C, C] {
  return [c(Math.cos(theta / 2)), scale(expi(phi), Math.sin(theta / 2))];
}

/** Single-qubit amplitudes → Bloch vector. */
export function ampsToBloch(a: C, b: C): [number, number, number] {
  // rho01 = a * conj(b)
  const r01 = mul(a, conj(b));
  return [2 * r01.re, -2 * r01.im, abs2(a) - abs2(b)];
}

export function ketLabel(i: number, n: number): string {
  return i.toString(2).padStart(n, '0');
}

/* ------------------------------------------------------------------------ */
/*                          Density-matrix simulator                         */
/* ------------------------------------------------------------------------ */

/**
 * ρ stored as a vector of length 4^n: index (row << n) | col.
 * Left-multiplying by U on qubit q acts on row bit; right-multiplying by U† acts on col bit with conj(U).
 */
export class DensityMatrix {
  readonly n: number;
  readonly dim: number;
  re: Float64Array;
  im: Float64Array;

  constructor(n: number) {
    this.n = n;
    this.dim = 1 << n;
    this.re = new Float64Array(this.dim * this.dim);
    this.im = new Float64Array(this.dim * this.dim);
    this.re[0] = 1;
  }

  static fromState(s: StateVector): DensityMatrix {
    const d = new DensityMatrix(s.n);
    d.re[0] = 0;
    for (let i = 0; i < s.dim; i++)
      for (let j = 0; j < s.dim; j++) {
        const k = i * s.dim + j;
        // a_i conj(a_j)
        d.re[k] = s.re[i] * s.re[j] + s.im[i] * s.im[j];
        d.im[k] = s.im[i] * s.re[j] - s.re[i] * s.im[j];
      }
    return d;
  }

  clone(): DensityMatrix {
    const d = new DensityMatrix(this.n);
    d.re.set(this.re);
    d.im.set(this.im);
    return d;
  }

  get(i: number, j: number): C {
    const k = i * this.dim + j;
    return c(this.re[k], this.im[k]);
  }

  private rowBit(q: number) {
    return this.n + (this.n - 1 - q);
  }
  private colBit(q: number) {
    return this.n - 1 - q;
  }

  apply(m: Mat2, target: number, controls: number[] = []): this {
    let rmask = 0, cmask = 0;
    for (const q of controls) {
      rmask |= 1 << this.rowBit(q);
      cmask |= 1 << this.colBit(q);
    }
    applyMat2Raw(this.re, this.im, this.rowBit(target), m, rmask, rmask);
    const mc: Mat2 = [conj(m[0]), conj(m[1]), conj(m[2]), conj(m[3])];
    applyMat2Raw(this.re, this.im, this.colBit(target), mc, cmask, cmask);
    return this;
  }

  /** Apply a single-qubit channel given by Kraus operators. */
  channel(kraus: Mat2[], target: number): this {
    const accRe = new Float64Array(this.re.length);
    const accIm = new Float64Array(this.im.length);
    for (const K of kraus) {
      const tr = this.re.slice(), ti = this.im.slice();
      applyMat2Raw(tr, ti, this.rowBit(target), K);
      applyMat2Raw(tr, ti, this.colBit(target), [conj(K[0]), conj(K[1]), conj(K[2]), conj(K[3])]);
      for (let i = 0; i < tr.length; i++) {
        accRe[i] += tr[i];
        accIm[i] += ti[i];
      }
    }
    this.re = accRe;
    this.im = accIm;
    return this;
  }

  probabilities(): number[] {
    return Array.from({ length: this.dim }, (_, i) => this.re[i * this.dim + i]);
  }

  purity(): number {
    // Tr(ρ²) = Σ |ρ_ij|²  (ρ Hermitian)
    let s = 0;
    for (let k = 0; k < this.re.length; k++) s += this.re[k] ** 2 + this.im[k] ** 2;
    return s;
  }

  trace(): number {
    let t = 0;
    for (let i = 0; i < this.dim; i++) t += this.re[i * this.dim + i];
    return t;
  }

  /** ⟨ψ|ρ|ψ⟩ */
  fidelityPure(s: StateVector): number {
    let re = 0;
    for (let i = 0; i < this.dim; i++)
      for (let j = 0; j < this.dim; j++) {
        const k = i * this.dim + j;
        // conj(a_i) ρ_ij a_j
        const ai = c(s.re[i], -s.im[i]);
        const aj = c(s.re[j], s.im[j]);
        re += mul(mul(ai, c(this.re[k], this.im[k])), aj).re;
      }
    return re;
  }

  reduced1(q: number): Mat {
    const b = 1 << (this.n - 1 - q);
    const out = [
      [c(0), c(0)],
      [c(0), c(0)],
    ];
    for (let i = 0; i < this.dim; i++)
      for (let j = 0; j < this.dim; j++) {
        // trace out everything except q: need i and j to agree on all bits except b
        if ((i & ~b) !== (j & ~b)) continue;
        const bi = i & b ? 1 : 0, bj = j & b ? 1 : 0;
        const k = i * this.dim + j;
        out[bi][bj] = add(out[bi][bj], c(this.re[k], this.im[k]));
      }
    return out;
  }

  bloch(q: number): [number, number, number] {
    return blochFromRho(this.reduced1(q));
  }

  /** Measure qubit q (computational basis) and collapse. */
  measure(q: number, rng: RNG = Math.random): 0 | 1 {
    const b = 1 << (this.n - 1 - q);
    let p1 = 0;
    for (let i = 0; i < this.dim; i++) if (i & b) p1 += this.re[i * this.dim + i];
    const out: 0 | 1 = rng() < p1 ? 1 : 0;
    const p = out ? p1 : 1 - p1;
    for (let i = 0; i < this.dim; i++)
      for (let j = 0; j < this.dim; j++) {
        const k = i * this.dim + j;
        const keep = (i & b ? 1 : 0) === out && (j & b ? 1 : 0) === out;
        if (!keep) {
          this.re[k] = 0;
          this.im[k] = 0;
        } else {
          this.re[k] /= p;
          this.im[k] /= p;
        }
      }
    return out;
  }
}

/* ------------------------- Standard noise channels ------------------------ */

export const Noise = {
  /** With prob p replace the qubit by the maximally mixed state. */
  depolarizing(p: number): Mat2[] {
    const k0 = Math.sqrt(1 - (3 * p) / 4);
    const k = Math.sqrt(p / 4);
    const sc = (m: Mat2, s: number) => m.map((z) => scale(z, s)) as Mat2;
    return [sc(GATES.I, k0), sc(GATES.X, k), sc(GATES.Y, k), sc(GATES.Z, k)];
  },
  bitFlip(p: number): Mat2[] {
    const sc = (m: Mat2, s: number) => m.map((z) => scale(z, s)) as Mat2;
    return [sc(GATES.I, Math.sqrt(1 - p)), sc(GATES.X, Math.sqrt(p))];
  },
  phaseFlip(p: number): Mat2[] {
    const sc = (m: Mat2, s: number) => m.map((z) => scale(z, s)) as Mat2;
    return [sc(GATES.I, Math.sqrt(1 - p)), sc(GATES.Z, Math.sqrt(p))];
  },
  /** Energy relaxation |1> -> |0> with probability gamma (T1 process). */
  amplitudeDamping(gamma: number): Mat2[] {
    return [
      [ONE, ZERO, ZERO, c(Math.sqrt(1 - gamma))],
      [ZERO, c(Math.sqrt(gamma)), ZERO, ZERO],
    ];
  },
  /** Pure dephasing (T2 process) with parameter lambda. */
  phaseDamping(lambda: number): Mat2[] {
    return [
      [ONE, ZERO, ZERO, c(Math.sqrt(1 - lambda))],
      [ZERO, ZERO, ZERO, c(Math.sqrt(lambda))],
    ];
  },
};
