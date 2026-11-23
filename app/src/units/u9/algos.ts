/**
 * World 9 algorithm toolkit — small, exact implementations used by the lesson widgets and games.
 * Everything that can be done with the shared state-vector engine (qsim) is done with it;
 * array-level helpers below only add things the engine lacks (classical permutations on
 * large registers, register marginals).
 *
 * Register convention (same as the engine): qubit 0 is the most significant bit of an index.
 * When a state has an input register of k qubits followed by an output register of m qubits,
 * basis index i = (x << m) | y.
 */
import { StateVector, GATES, Phase, Rx, Ry, Rz, mulberry32, type RNG, type Mat2 } from '../../engine/qsim';
import { c, type C, type Mat } from '../../engine/complex';

/* ------------------------------------------------------------------ */
/*                               bits                                  */
/* ------------------------------------------------------------------ */

export function popcount(x: number): number {
  let k = 0;
  while (x) {
    k += x & 1;
    x >>>= 1;
  }
  return k;
}
/** Inner product mod 2 of two bit strings. */
export const dot2 = (a: number, b: number) => popcount(a & b) & 1;
export const bitstr = (x: number, n: number) => x.toString(2).padStart(n, '0');

/* ------------------------------------------------------------------ */
/*                      oracles & register helpers                     */
/* ------------------------------------------------------------------ */

/**
 * Apply a classical reversible map to the whole state: |i⟩ → |perm(i)⟩. perm must be a bijection.
 * (Array-level version of StateVector.applyPermutation that avoids building a dense matrix.)
 */
export function permuteState(s: StateVector, perm: (i: number) => number): StateVector {
  const re = new Float64Array(s.dim), im = new Float64Array(s.dim);
  for (let i = 0; i < s.dim; i++) {
    const j = perm(i);
    re[j] = s.re[i];
    im[j] = s.im[i];
  }
  s.re = re;
  s.im = im;
  return s;
}

/** Bit oracle U_f |x⟩|y⟩ = |x⟩|y ⊕ f(x)⟩ on a state of (nIn + nOut) qubits (input register first). */
export function applyBitOracle(s: StateVector, f: (x: number) => number, nIn: number, nOut: number): StateVector {
  const mask = (1 << nOut) - 1;
  if (s.n !== nIn + nOut) throw new Error('register size mismatch');
  return permuteState(s, (i) => {
    const x = i >>> nOut, y = i & mask;
    return (x << nOut) | ((y ^ f(x)) & mask);
  });
}

/** Phase oracle |x⟩ → (−1)^{f(x)} |x⟩ acting on the first nIn qubits (f returns 0/1). */
export function applyPhaseOracle(s: StateVector, f: (x: number) => number, nIn: number): StateVector {
  const shift = s.n - nIn;
  for (let i = 0; i < s.dim; i++) {
    if (f(i >>> shift) & 1) {
      s.re[i] = -s.re[i];
      s.im[i] = -s.im[i];
    }
  }
  return s;
}

/** Probability distribution of the first k qubits (traces out the rest). */
export function registerMarginal(s: StateVector, k: number): number[] {
  const shift = s.n - k;
  const p = new Array<number>(1 << k).fill(0);
  for (let i = 0; i < s.dim; i++) p[i >>> shift] += s.re[i] * s.re[i] + s.im[i] * s.im[i];
  return p;
}

/** Sample an index from a probability vector. */
export function sampleFrom(p: number[], rng: RNG = Math.random): number {
  const tot = p.reduce((a, b) => a + b, 0);
  let r = rng() * tot;
  for (let i = 0; i < p.length; i++) {
    r -= p[i];
    if (r <= 0) return i;
  }
  return p.length - 1;
}

/** The "query rig" used by Oracle Hunter and the lessons: optional H layers around one bit-oracle call. */
export interface QueryRig {
  /** Hadamard on every input qubit before the query. */
  hBefore: boolean;
  /** How every output/ancilla qubit is prepared before the query. */
  ancilla: '0' | '1' | 'minus';
  /** Hadamard on every input qubit after the query. */
  hAfter: boolean;
}

export const CORRECT_PHASE_RIG: QueryRig = { hBefore: true, ancilla: 'minus', hAfter: true };
export const CORRECT_SIMON_RIG: QueryRig = { hBefore: true, ancilla: '0', hAfter: true };

/** Run one oracle query in the given rig and return the full final state (input register first). */
export function runQueryRig(f: (x: number) => number, nIn: number, nOut: number, rig: QueryRig): StateVector {
  const s = new StateVector(nIn + nOut);
  for (let q = nIn; q < nIn + nOut; q++) {
    if (rig.ancilla !== '0') s.x(q);
    if (rig.ancilla === 'minus') s.h(q);
  }
  if (rig.hBefore) for (let q = 0; q < nIn; q++) s.h(q);
  applyBitOracle(s, f, nIn, nOut);
  if (rig.hAfter) for (let q = 0; q < nIn; q++) s.h(q);
  return s;
}

/* ------------------------------------------------------------------ */
/*                        problem generators                           */
/* ------------------------------------------------------------------ */

export const bvOracle = (secret: number) => (x: number) => dot2(x, secret);

/** Truth table of a Deutsch–Jozsa promise function on n bits. */
export function djTable(kind: 'constant0' | 'constant1' | 'balanced', n: number, rng: RNG = Math.random): number[] {
  const N = 1 << n;
  if (kind === 'constant0') return new Array(N).fill(0);
  if (kind === 'constant1') return new Array(N).fill(1);
  const idx = Array.from({ length: N }, (_, i) => i);
  for (let i = N - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const t = new Array(N).fill(0);
  for (let k = 0; k < N / 2; k++) t[idx[k]] = 1;
  return t;
}

/**
 * Truth table of a Simon function on n bits with hidden mask s: f(x) = f(y) ⇔ y ∈ {x, x⊕s}.
 * Outputs are random distinct n-bit labels (one per pair). s = 0 gives a 1-to-1 function.
 */
export function simonTable(n: number, s: number, rng: RNG = Math.random): number[] {
  const N = 1 << n;
  const labels = Array.from({ length: N }, (_, i) => i);
  for (let i = N - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [labels[i], labels[j]] = [labels[j], labels[i]];
  }
  const t = new Array<number>(N).fill(-1);
  let next = 0;
  for (let x = 0; x < N; x++) {
    if (t[x] >= 0) continue;
    t[x] = labels[next];
    t[x ^ s] = labels[next];
    next++;
  }
  return t;
}

/* ------------------------------------------------------------------ */
/*                       linear algebra over GF(2)                     */
/* ------------------------------------------------------------------ */

/** Row-reduce bit-vectors (each an n-bit integer, MSB = column 0). Returns the independent rows in RREF. */
export function gf2RREF(rows: number[], n: number): number[] {
  const m = rows.filter((r) => r !== 0).slice();
  const out: number[] = [];
  for (let col = 0; col < n; col++) {
    const bit = 1 << (n - 1 - col);
    const piv = m.findIndex((r) => r & bit);
    if (piv < 0) continue;
    const p = m.splice(piv, 1)[0];
    for (let i = 0; i < m.length; i++) if (m[i] & bit) m[i] ^= p;
    for (let i = 0; i < out.length; i++) if (out[i] & bit) out[i] ^= p;
    out.push(p);
  }
  return out;
}

export const gf2Rank = (rows: number[], n: number) => gf2RREF(rows, n).length;

/** All n-bit s with y·s = 0 for every row y (brute force; n ≤ 16). */
export function gf2Solutions(rows: number[], n: number): number[] {
  const out: number[] = [];
  for (let s = 0; s < 1 << n; s++) if (rows.every((y) => dot2(y, s) === 0)) out.push(s);
  return out;
}

/* ------------------------------------------------------------------ */
/*                                Grover                               */
/* ------------------------------------------------------------------ */

/** sin θ = √(M/N): half the rotation angle of one Grover iteration. */
export const groverTheta = (N: number, M = 1) => Math.asin(Math.sqrt(M / N));

/** Probability of measuring a marked item after k Grover iterations. */
export const groverSuccess = (N: number, M: number, k: number) => Math.sin((2 * k + 1) * groverTheta(N, M)) ** 2;

/** The textbook iteration count ⌊π / (4θ)⌋ ≈ (π/4)√(N/M). */
export const groverKFormula = (N: number, M = 1) => Math.floor(Math.PI / (4 * groverTheta(N, M)));

/** The iteration count that exactly maximises the success probability. */
export function groverBestK(N: number, M = 1): number {
  const lim = Math.ceil(Math.PI / (4 * groverTheta(N, M))) + 1;
  let best = 0;
  for (let k = 0; k <= lim; k++) if (groverSuccess(N, M, k) > groverSuccess(N, M, best) + 1e-12) best = k;
  return best;
}

/** Per-item amplitudes after k iterations, in the real 2D plane: [marked item, unmarked item]. */
export function groverAmps(N: number, M: number, k: number): { marked: number; other: number; angle: number } {
  const th = groverTheta(N, M);
  const angle = (2 * k + 1) * th;
  return { marked: Math.sin(angle) / Math.sqrt(M), other: M < N ? Math.cos(angle) / Math.sqrt(N - M) : 0, angle };
}

/**
 * Full gate-level Grover on n qubits with the shared engine:
 * H^n, then k × [phase oracle, diffuser = H^n X^n (multi-controlled Z) X^n H^n].
 * The engine's diffuser equals −(2|s⟩⟨s| − I), i.e. the textbook one up to a global phase.
 */
export function groverCircuit(n: number, marked: number[], k: number): StateVector {
  const s = new StateVector(n);
  const all = Array.from({ length: n }, (_, q) => q);
  all.forEach((q) => s.h(q));
  const set = new Set(marked);
  for (let it = 0; it < k; it++) {
    applyPhaseOracle(s, (x) => (set.has(x) ? 1 : 0), n);
    all.forEach((q) => s.h(q));
    all.forEach((q) => s.x(q));
    if (n === 1) s.z(0);
    else s.apply(GATES.Z, n - 1, all.slice(0, n - 1));
    all.forEach((q) => s.x(q));
    all.forEach((q) => s.h(q));
  }
  return s;
}

/* ------------------------------------------------------------------ */
/*                       Quantum Fourier transform                     */
/* ------------------------------------------------------------------ */

/**
 * QFT on the listed qubits (qubits[0] = most significant bit), Nielsen & Chuang circuit:
 * H + controlled phases R_k, then reverse the qubit order with swaps.
 * QFT |x⟩ = 2^{-t/2} Σ_y e^{2πi xy / 2^t} |y⟩.
 */
export function applyQFT(s: StateVector, qubits: number[], inverse = false): StateVector {
  const t = qubits.length;
  const ops: (() => void)[] = [];
  const sign = inverse ? -1 : 1;
  for (let j = 0; j < t; j++) {
    ops.push(() => s.h(qubits[j]));
    for (let k = j + 1; k < t; k++) {
      const ang = (sign * Math.PI) / 2 ** (k - j);
      ops.push(() => s.apply(Phase(ang), qubits[j], [qubits[k]]));
    }
  }
  for (let j = 0; j < Math.floor(t / 2); j++) ops.push(() => s.swap(qubits[j], qubits[t - 1 - j]));
  // every gate in the QFT circuit is self-adjoint except the phases (whose angle we negated),
  // so the inverse circuit is the same gate list in reverse order
  if (inverse) ops.reverse();
  ops.forEach((op) => op());
  return s;
}

/** Number of gates in the textbook QFT circuit on t qubits: t Hadamards, t(t−1)/2 controlled phases, ⌊t/2⌋ swaps. */
export const qftGateCount = (t: number) => ({ h: t, cphase: (t * (t - 1)) / 2, swap: Math.floor(t / 2), total: t + (t * (t - 1)) / 2 + Math.floor(t / 2) });

/** The 2^n × 2^n QFT matrix, F[a][b] = 2^{-n/2} e^{2πi ab / 2^n} (for CircuitLab unitary goals). */
export function qftMatrix(n: number): Mat {
  const N = 1 << n;
  return Array.from({ length: N }, (_, a) =>
    Array.from({ length: N }, (_, b) => {
      const t = (2 * Math.PI * a * b) / N;
      return c(Math.cos(t) / Math.sqrt(N), Math.sin(t) / Math.sqrt(N));
    }),
  );
}

/** The DFT of a vector with the QFT sign convention: y_k = N^{-1/2} Σ_j x_j e^{+2πi jk/N}. */
export function dft(v: C[]): C[] {
  const N = v.length;
  return Array.from({ length: N }, (_, k) => {
    let re = 0, im = 0;
    for (let j = 0; j < N; j++) {
      const a = (2 * Math.PI * j * k) / N;
      re += v[j].re * Math.cos(a) - v[j].im * Math.sin(a);
      im += v[j].re * Math.sin(a) + v[j].im * Math.cos(a);
    }
    return c(re / Math.sqrt(N), im / Math.sqrt(N));
  });
}

/* ------------------------------------------------------------------ */
/*                           Phase estimation                          */
/* ------------------------------------------------------------------ */

/** Exact output distribution of t-qubit phase estimation for eigenphase φ ∈ [0,1): P(m), m = 0..2^t−1. */
export function qpeDistribution(phi: number, t: number): number[] {
  const N = 1 << t;
  return Array.from({ length: N }, (_, m) => {
    const d = phi - m / N;
    let re = 0, im = 0;
    for (let y = 0; y < N; y++) {
      re += Math.cos(2 * Math.PI * y * d);
      im += Math.sin(2 * Math.PI * y * d);
    }
    return (re * re + im * im) / (N * N);
  });
}

/**
 * Gate-level phase estimation with the engine: t counting qubits + 1 target qubit prepared in |1⟩,
 * the eigenstate of U = P(2πφ) with eigenvalue e^{2πiφ}. Counting qubit q controls U^{2^{t−1−q}},
 * then an inverse QFT. Returns the counting-register distribution.
 */
export function qpeSimulate(phi: number, t: number): number[] {
  const s = new StateVector(t + 1);
  s.x(t);
  for (let q = 0; q < t; q++) s.h(q);
  for (let q = 0; q < t; q++) {
    const power = 2 ** (t - 1 - q);
    s.apply(Phase(2 * Math.PI * phi * power), t, [q]);
  }
  applyQFT(s, Array.from({ length: t }, (_, q) => q), true);
  return registerMarginal(s, t);
}

/** The phase each counting qubit picks up by kickback: qubit q gets e^{2πi φ 2^{t−1−q}} (as a fraction of a turn). */
export const qpeKickbackTurns = (phi: number, t: number) => Array.from({ length: t }, (_, q) => (phi * 2 ** (t - 1 - q)) % 1);

/* ------------------------------------------------------------------ */
/*                    Number theory for Shor's algorithm               */
/* ------------------------------------------------------------------ */

export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

export function modpow(a: number, e: number, N: number): number {
  let r = 1 % N, b = a % N;
  while (e > 0) {
    if (e & 1) r = (r * b) % N;
    b = (b * b) % N;
    e = Math.floor(e / 2);
  }
  return r;
}

/** Smallest r > 0 with a^r ≡ 1 (mod N); requires gcd(a,N) = 1. */
export function multiplicativeOrder(a: number, N: number): number {
  if (gcd(a, N) !== 1) throw new Error('a and N must be coprime');
  let r = 1, v = a % N;
  while (v !== 1) {
    v = (v * a) % N;
    r++;
  }
  return r;
}

/** Continued-fraction terms of num/den (num, den ≥ 0 integers). */
export function continuedFraction(num: number, den: number): number[] {
  const terms: number[] = [];
  while (den !== 0) {
    const q = Math.floor(num / den);
    terms.push(q);
    [num, den] = [den, num - q * den];
  }
  return terms;
}

/** Convergents p/q of a continued fraction. */
export function convergents(terms: number[]): [number, number][] {
  const out: [number, number][] = [];
  let p0 = 1, q0 = 0, p1 = terms[0] ?? 0, q1 = 1;
  if (terms.length) out.push([p1, q1]);
  for (let i = 1; i < terms.length; i++) {
    const p2 = terms[i] * p1 + p0, q2 = terms[i] * q1 + q0;
    out.push([p2, q2]);
    [p0, q0, p1, q1] = [p1, q1, p2, q2];
  }
  return out;
}

/**
 * Classical post-processing of a period-finding measurement y (out of Q = 2^t):
 * walk the convergents of y/Q and return the first denominator q < N with a^q ≡ 1 (mod N),
 * also trying small multiples of each denominator (handles the case gcd(k, r) > 1).
 */
export function periodFromMeasurement(y: number, Q: number, a: number, N: number): number | null {
  if (y === 0) return null;
  for (const [, q] of convergents(continuedFraction(y, Q))) {
    if (q >= N || q === 0) break;
    for (let m = 1; m * q < N; m++) if (modpow(a, m * q, N) === 1) return m * q;
  }
  return null;
}

export type ShorOutcome =
  | { ok: true; r: number; x: number; factors: [number, number] }
  | { ok: false; r: number; reason: 'odd-period' | 'trivial-root' };

/** Given the order r of a mod N, try to split N with gcd(a^{r/2} ± 1, N). */
export function splitFromOrder(a: number, N: number, r: number): ShorOutcome {
  if (r % 2 === 1) return { ok: false, r, reason: 'odd-period' };
  const x = modpow(a, r / 2, N);
  if (x === N - 1) return { ok: false, r, reason: 'trivial-root' };
  const p = gcd(x - 1, N), q = gcd(x + 1, N);
  const f = p !== 1 && p !== N ? p : q;
  return { ok: true, r, x, factors: [Math.min(f, N / f), Math.max(f, N / f)] };
}

/** Bits needed for Shor's counting register: smallest t with 2^t ≥ N². */
export const shorCountingBits = (N: number) => Math.ceil(Math.log2(N * N));
/** Bits needed to hold residues mod N. */
export const shorWorkBits = (N: number) => Math.ceil(Math.log2(N));

/**
 * Exact counting-register distribution of order finding with Q = 2^t, without simulating the circuit:
 * P(y) = Σ_{x0 < r} | (1/Q) Σ_{j: x0 + jr < Q} e^{2πi (x0 + jr) y / Q} |².
 */
export function periodFindingDistribution(a: number, N: number, t: number): number[] {
  const Q = 1 << t, r = multiplicativeOrder(a, N);
  const p = new Array<number>(Q).fill(0);
  for (let y = 0; y < Q; y++) {
    let tot = 0;
    for (let x0 = 0; x0 < r; x0++) {
      let re = 0, im = 0;
      for (let x = x0; x < Q; x += r) {
        const ang = (2 * Math.PI * ((x * y) % Q)) / Q;
        re += Math.cos(ang);
        im += Math.sin(ang);
      }
      tot += re * re + im * im;
    }
    p[y] = tot / (Q * Q);
  }
  return p;
}

/**
 * Gate-level order finding on the state-vector engine: t counting qubits + m work qubits (work starts at |1⟩).
 * Counting qubit q controls multiplication by a^{2^{t−1−q}} mod N (a permutation of the work register),
 * then inverse QFT on the counting register. Returns the counting-register distribution.
 * Practical up to ~18 qubits total (N ≤ 39 or so).
 */
export function periodFindingSimulate(a: number, N: number, t = shorCountingBits(N)): number[] {
  const m = shorWorkBits(N);
  const s = new StateVector(t + m, 1); // |0…0⟩|0…01⟩
  for (let q = 0; q < t; q++) s.h(q);
  const wmask = (1 << m) - 1;
  for (let q = 0; q < t; q++) {
    const mult = modpow(a, 2 ** (t - 1 - q), N);
    const cbit = 1 << (t + m - 1 - q);
    // controlled-U_mult: |w⟩ → |mult·w mod N⟩ for w < N (a bijection since gcd(mult, N) = 1); |w⟩ fixed for w ≥ N
    permuteState(s, (i) => {
      if (!(i & cbit)) return i;
      const w = i & wmask;
      return w < N ? (i & ~wmask) | ((mult * w) % N) : i;
    });
  }
  applyQFT(s, Array.from({ length: t }, (_, q) => q), true);
  return registerMarginal(s, t);
}

/** Pick the "nice" values of a for a given N: coprime, not ±1. */
export function goodBases(N: number): number[] {
  const out: number[] = [];
  for (let a = 2; a < N - 1; a++) if (gcd(a, N) === 1) out.push(a);
  return out;
}

/** Full Shor pipeline (simulated) — used by tests: returns the factors found, or null after `tries` attempts. */
export function shorFactor(N: number, seed = 1, tries = 20): [number, number] | null {
  const rng = mulberry32(seed);
  for (let k = 0; k < tries; k++) {
    const a = 2 + Math.floor(rng() * (N - 3));
    const g = gcd(a, N);
    if (g > 1) return [Math.min(g, N / g), Math.max(g, N / g)];
    const t = shorCountingBits(N);
    const dist = periodFindingDistribution(a, N, t);
    const y = sampleFrom(dist, rng);
    const r = periodFromMeasurement(y, 1 << t, a, N);
    if (!r) continue;
    const out = splitFromOrder(a, N, r);
    if (out.ok) return out.factors;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*                       Variational algorithms                        */
/* ------------------------------------------------------------------ */

/** A Hamiltonian as a sum of Pauli strings, e.g. [{ coef: 1, ops: 'ZZ' }, { coef: 0.5, ops: 'XI' }] (ops[q] acts on qubit q). */
export type PauliHamiltonian = { coef: number; ops: string }[];

const PAULI: Record<string, Mat2 | null> = { I: null, X: GATES.X, Y: GATES.Y, Z: GATES.Z };

/** ⟨ψ|H|ψ⟩ computed with the engine. */
export function expectation(s: StateVector, H: PauliHamiltonian): number {
  let e = 0;
  for (const term of H) {
    const t = s.clone();
    [...term.ops].forEach((p, q) => {
      const m = PAULI[p];
      if (m) t.apply(m, q);
    });
    e += term.coef * s.inner(t).re;
  }
  return e;
}

/** Dense real-symmetric matrix of a Pauli Hamiltonian with only I/X/Z terms (for exact diagonalisation). */
export function hamiltonianMatrix(H: PauliHamiltonian, n: number): number[][] {
  const d = 1 << n;
  const M = Array.from({ length: d }, () => new Array<number>(d).fill(0));
  for (let j = 0; j < d; j++) {
    for (const term of H) {
      const s = new StateVector(n, j);
      [...term.ops].forEach((p, q) => {
        const m = PAULI[p];
        if (m) s.apply(m, q);
      });
      for (let i = 0; i < d; i++) M[i][j] += term.coef * s.re[i];
    }
  }
  return M;
}

/** Eigenvalues of a small real symmetric matrix (cyclic Jacobi). Ascending. */
export function symEigenvalues(A0: number[][]): number[] {
  const n = A0.length;
  const A = A0.map((r) => r.slice());
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p][q] ** 2;
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-15) continue;
        const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
        const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const cs = 1 / Math.sqrt(t * t + 1), sn = t * cs;
        for (let k = 0; k < n; k++) {
          const akp = A[k][p], akq = A[k][q];
          A[k][p] = cs * akp - sn * akq;
          A[k][q] = sn * akp + cs * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p][k], aqk = A[q][k];
          A[p][k] = cs * apk - sn * aqk;
          A[q][k] = sn * apk + cs * aqk;
        }
      }
  }
  return A.map((r, i) => r[i]).sort((a, b) => a - b);
}

/** One-qubit ansatz: Ry(θ) then Rz(φ) on |0⟩ — reaches every point of the Bloch sphere. */
export function ansatz1(params: number[]): StateVector {
  return new StateVector(1).apply(Ry(params[0]), 0).apply(Rz(params[1]), 0);
}

/** Two-qubit "hardware-efficient" ansatz: Ry(p0)⊗Ry(p1), CNOT 0→1, Ry(p2)⊗Ry(p3). Real amplitudes only. */
export function ansatz2(params: number[]): StateVector {
  return new StateVector(2).apply(Ry(params[0]), 0).apply(Ry(params[1]), 1).cx(0, 1).apply(Ry(params[2]), 0).apply(Ry(params[3]), 1);
}

/**
 * Parameter-shift gradient: for gates e^{−iθP/2} (Rx, Ry, Rz), ∂E/∂θ = [E(θ + π/2) − E(θ − π/2)] / 2 exactly.
 */
export function parameterShiftGrad(energy: (p: number[]) => number, params: number[]): number[] {
  return params.map((_, k) => {
    const up = params.slice(), dn = params.slice();
    up[k] += Math.PI / 2;
    dn[k] -= Math.PI / 2;
    return (energy(up) - energy(dn)) / 2;
  });
}

/** Standard normal sample (Box–Muller). */
export function gaussian(rng: RNG): number {
  const u = Math.max(1e-12, rng()), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Estimate ⟨H⟩ as a real device would: each Pauli term measured with `shots` shots.
 * (Binomial noise on each term's ±1 outcomes.) shots = Infinity gives the exact value.
 */
export function noisyExpectation(s: StateVector, H: PauliHamiltonian, shots: number, rng: RNG): number {
  if (!Number.isFinite(shots)) return expectation(s, H);
  let e = 0;
  for (const term of H) {
    if (!/[XYZ]/.test(term.ops)) {
      e += term.coef;
      continue;
    }
    const mean = expectation(s, [{ coef: 1, ops: term.ops }]);
    const sd = Math.sqrt(Math.max(0, 1 - mean * mean) / shots);
    e += term.coef * Math.max(-1, Math.min(1, mean + sd * gaussian(rng)));
  }
  return e;
}

/* ------------------------------- QAOA -------------------------------- */

export type Graph = { n: number; edges: [number, number][] };

/** Number of edges cut by the bit-string z (bit for vertex v is qubit v, i.e. bit n−1−v of the index). */
export function cutValue(g: Graph, z: number): number {
  const b = (v: number) => (z >> (g.n - 1 - v)) & 1;
  return g.edges.reduce((acc, [u, v]) => acc + (b(u) !== b(v) ? 1 : 0), 0);
}

export function maxCut(g: Graph): number {
  let m = 0;
  for (let z = 0; z < 1 << g.n; z++) m = Math.max(m, cutValue(g, z));
  return m;
}

/** QAOA state for depth p: |+⟩^n, then p × [e^{−iγ_k C}, e^{−iβ_k Σ X}] (mixer = Rx(2β) on every qubit). */
export function qaoaState(g: Graph, gammas: number[], betas: number[]): StateVector {
  const s = new StateVector(g.n);
  for (let q = 0; q < g.n; q++) s.h(q);
  const cuts = Array.from({ length: s.dim }, (_, z) => cutValue(g, z));
  for (let k = 0; k < gammas.length; k++) {
    for (let z = 0; z < s.dim; z++) {
      const a = -gammas[k] * cuts[z];
      const co = Math.cos(a), si = Math.sin(a);
      const r = s.re[z], i = s.im[z];
      s.re[z] = r * co - i * si;
      s.im[z] = r * si + i * co;
    }
    for (let q = 0; q < g.n; q++) s.apply(Rx(2 * betas[k]), q);
  }
  return s;
}

/** Expected cut ⟨C⟩ of the QAOA state. */
export function qaoaExpectedCut(g: Graph, gammas: number[], betas: number[]): number {
  const p = qaoaState(g, gammas, betas).probabilities();
  return p.reduce((acc, pz, z) => acc + pz * cutValue(g, z), 0);
}
