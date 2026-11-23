/**
 * World 6 physics helpers: two/three-qubit measurements in arbitrary bases,
 * the CHSH game, the GHZ/Mermin game and local-hidden-variable models.
 *
 * Conventions: qubit 0 is the LEFT-most bit of a ket (index = binary q0 q1 …).
 * A "real-plane angle" θ means measuring in the basis
 *   outcome 0: |θ⟩  = cos θ |0⟩ + sin θ |1⟩
 *   outcome 1: |θ⊥⟩ = −sin θ |0⟩ + cos θ |1⟩
 * which is exactly a linear polariser at angle θ (0 = |0⟩/H, π/4 = |+⟩/D, …).
 */
import { C, c, abs2, conj, mul, add, expi, scale } from '../../../engine/complex';
import type { RNG } from '../../../engine/qsim';

const S2 = Math.SQRT1_2;

/** A measurement basis for one qubit: [vector for outcome 0, vector for outcome 1]. */
export type Basis1 = [[C, C], [C, C]];

/** Real-plane (polariser) basis at angle θ. */
export function realBasis(theta: number): Basis1 {
  const co = Math.cos(theta), si = Math.sin(theta);
  return [
    [c(co), c(si)],
    [c(-si), c(co)],
  ];
}

/** Equatorial Bloch-sphere basis at azimuth φ: outcome 0 = (|0⟩+e^{iφ}|1⟩)/√2, outcome 1 = (|0⟩−e^{iφ}|1⟩)/√2. φ=0 is X, φ=π/2 is Y. */
export function equatorialBasis(phi: number): Basis1 {
  const e = expi(phi);
  return [
    [c(S2), scale(e, S2)],
    [c(S2), scale(e, -S2)],
  ];
}

/**
 * Joint outcome probabilities when each qubit k of an n-qubit state is measured in bases[k].
 * Returns an array of length 2^n indexed by the outcome bit-string (q0 = most significant bit).
 */
export function jointProbs(amps: C[], bases: Basis1[]): number[] {
  const n = bases.length;
  const dim = 1 << n;
  if (amps.length !== dim) throw new Error('state/basis size mismatch');
  const out = new Array<number>(dim).fill(0);
  for (let o = 0; o < dim; o++) {
    // amplitude <e_o | psi> = sum_i prod_k conj(e_{o_k}[i_k]) psi_i
    let acc = c(0);
    for (let i = 0; i < dim; i++) {
      if (amps[i].re === 0 && amps[i].im === 0) continue;
      let coef = c(1);
      for (let k = 0; k < n; k++) {
        const ok = (o >> (n - 1 - k)) & 1;
        const ik = (i >> (n - 1 - k)) & 1;
        coef = mul(coef, conj(bases[k][ok][ik]));
      }
      acc = add(acc, mul(coef, amps[i]));
    }
    out[o] = abs2(acc);
  }
  return out;
}

/** Sample an index from a probability vector. */
export function sampleIndex(p: number[], rng: RNG): number {
  const r = rng();
  let acc = 0;
  for (let i = 0; i < p.length; i++) {
    acc += p[i];
    if (r < acc) return i;
  }
  return p.length - 1;
}

/* ------------------------------ Named states ------------------------------ */

export const BELL = {
  phiPlus: [c(S2), c(0), c(0), c(S2)] as C[],
  phiMinus: [c(S2), c(0), c(0), c(-S2)] as C[],
  psiPlus: [c(0), c(S2), c(S2), c(0)] as C[],
  psiMinus: [c(0), c(S2), c(-S2), c(0)] as C[],
};

export const GHZ: C[] = [c(S2), c(0), c(0), c(0), c(0), c(0), c(0), c(S2)];

/** Kronecker product of state vectors. */
export function kronVec(a: C[], b: C[]): C[] {
  const out: C[] = [];
  for (const x of a) for (const y of b) out.push(mul(x, y));
  return out;
}

/** Concurrence of a pure 2-qubit state a|00⟩+b|01⟩+c|10⟩+d|11⟩: 2|ad − bc| (0 = product, 1 = maximally entangled). */
export function concurrence(amps: C[]): number {
  const [a, b, cc, d] = amps;
  const det = add(mul(a, d), scale(mul(b, cc), -1));
  return 2 * Math.sqrt(abs2(det));
}

/** Reduced Bloch vectors (x,y,z) of both qubits of a pure 2-qubit state. */
export function reducedBloch2(amps: C[]): [[number, number, number], [number, number, number]] {
  const [a, b, cc, d] = amps;
  // rho_A = [[|a|²+|b|², a c* + b d*], [.., |c|²+|d|²]]
  const rA01 = add(mul(a, conj(cc)), mul(b, conj(d)));
  const rB01 = add(mul(a, conj(b)), mul(cc, conj(d)));
  const zA = abs2(a) + abs2(b) - abs2(cc) - abs2(d);
  const zB = abs2(a) + abs2(cc) - abs2(b) - abs2(d);
  return [
    [2 * rA01.re, -2 * rA01.im, zA],
    [2 * rB01.re, -2 * rB01.im, zB],
  ];
}

/** Normalise a state vector. */
export function normalize(amps: C[]): C[] {
  const n = Math.sqrt(amps.reduce((s, a) => s + abs2(a), 0));
  return n > 0 ? amps.map((a) => scale(a, 1 / n)) : amps;
}

/* -------------------------------- The CHSH game -------------------------------- */

/** Deterministic classical strategy: Alice answers a[x], Bob answers b[y]. */
export interface ClassicalStrategy {
  a: [0 | 1, 0 | 1];
  b: [0 | 1, 0 | 1];
}

/** CHSH win condition: a ⊕ b = x ∧ y. */
export const chshWins = (x: number, y: number, a: number, b: number) => (a ^ b) === (x & y);

/** Fraction of the four (equally likely) questions a deterministic strategy wins. */
export function classicalWinRate(s: ClassicalStrategy): number {
  let w = 0;
  for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) if (chshWins(x, y, s.a[x], s.b[y])) w++;
  return w / 4;
}

/** All 16 deterministic strategies. */
export function allClassicalStrategies(): ClassicalStrategy[] {
  const out: ClassicalStrategy[] = [];
  for (let m = 0; m < 16; m++)
    out.push({ a: [((m >> 3) & 1) as 0 | 1, ((m >> 2) & 1) as 0 | 1], b: [((m >> 1) & 1) as 0 | 1, (m & 1) as 0 | 1] });
  return out;
}

/** Quantum strategy: shared |Φ+⟩ (with optional white-noise visibility V), Alice measures at alpha[x], Bob at beta[y]. */
export interface QuantumStrategy {
  alpha: [number, number];
  beta: [number, number];
  /** Visibility of the shared state (1 = perfect |Φ+⟩, 0 = pure noise). Werner state ρ = V|Φ+⟩⟨Φ+| + (1−V) I/4. */
  visibility?: number;
}

/** P(a = b) for real-plane measurements on a (noisy) |Φ+⟩: (1 + V cos 2Δ)/2. */
export function pAgree(thA: number, thB: number, V = 1): number {
  return (1 + V * Math.cos(2 * (thA - thB))) / 2;
}

/** Correlator E = P(same) − P(different) = V cos 2(θA − θB). */
export function correlator(thA: number, thB: number, V = 1): number {
  return V * Math.cos(2 * (thA - thB));
}

/** Probability of winning question (x, y) with a quantum strategy. */
export function quantumWinProb(s: QuantumStrategy, x: number, y: number): number {
  const pa = pAgree(s.alpha[x], s.beta[y], s.visibility ?? 1);
  return x & y ? 1 - pa : pa;
}

/** Average win probability over the four questions. */
export function quantumWinRate(s: QuantumStrategy): number {
  let t = 0;
  for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) t += quantumWinProb(s, x, y);
  return t / 4;
}

/** CHSH value S = E(a0,b0) + E(a0,b1) + E(a1,b0) − E(a1,b1). Win rate = 1/2 + S/8. */
export function chshS(s: QuantumStrategy): number {
  const V = s.visibility ?? 1;
  return (
    correlator(s.alpha[0], s.beta[0], V) +
    correlator(s.alpha[0], s.beta[1], V) +
    correlator(s.alpha[1], s.beta[0], V) -
    correlator(s.alpha[1], s.beta[1], V)
  );
}

export const OPTIMAL_QUANTUM: QuantumStrategy = { alpha: [0, Math.PI / 4], beta: [Math.PI / 8, -Math.PI / 8] };
export const TSIRELSON_WIN = Math.cos(Math.PI / 8) ** 2; // ≈ 0.8536

export interface ChshRound {
  x: 0 | 1;
  y: 0 | 1;
  a: 0 | 1;
  b: 0 | 1;
  win: boolean;
}

/** Play one round of CHSH with a quantum strategy (outcomes sampled from the exact joint distribution). */
export function playQuantumRound(s: QuantumStrategy, rng: RNG): ChshRound {
  const x = (rng() < 0.5 ? 0 : 1) as 0 | 1;
  const y = (rng() < 0.5 ? 0 : 1) as 0 | 1;
  const pa = pAgree(s.alpha[x], s.beta[y], s.visibility ?? 1);
  const a = (rng() < 0.5 ? 0 : 1) as 0 | 1; // each marginal is exactly 50/50
  const b = (rng() < pa ? a : 1 - a) as 0 | 1;
  return { x, y, a, b, win: chshWins(x, y, a, b) };
}

/** Play one round with a classical strategy (deterministic, or a mixture chosen by shared randomness). */
export function playClassicalRound(s: ClassicalStrategy | ((rng: RNG) => ClassicalStrategy), rng: RNG): ChshRound {
  const strat = typeof s === 'function' ? s(rng) : s;
  const x = (rng() < 0.5 ? 0 : 1) as 0 | 1;
  const y = (rng() < 0.5 ? 0 : 1) as 0 | 1;
  const a = strat.a[x], b = strat.b[y];
  return { x, y, a, b, win: chshWins(x, y, a, b) };
}

/* ------------------------------ The GHZ / Mermin game ------------------------------ */

/** The four allowed questions (x, y, z) with x ⊕ y ⊕ z = 0. */
export const GHZ_QUESTIONS: [0 | 1, 0 | 1, 0 | 1][] = [
  [0, 0, 0],
  [0, 1, 1],
  [1, 0, 1],
  [1, 1, 0],
];

/** Win iff a ⊕ b ⊕ c = x ∨ y ∨ z. */
export const ghzWins = (q: number[], ans: number[]) => (ans[0] ^ ans[1] ^ ans[2]) === (q[0] | q[1] | q[2]);

/** Classical deterministic GHZ strategy: table[player][input] = output bit. */
export type GhzClassical = [[0 | 1, 0 | 1], [0 | 1, 0 | 1], [0 | 1, 0 | 1]];

export function ghzClassicalWins(t: GhzClassical): boolean[] {
  return GHZ_QUESTIONS.map((q) => ghzWins(q, [t[0][q[0]], t[1][q[1]], t[2][q[2]]]));
}

/** Quantum GHZ strategy: player k on input i measures along the equatorial axis at azimuth phi[k][i]. */
export type GhzQuantum = [[number, number], [number, number], [number, number]];

/** Joint outcome distribution (8 entries, index = a b c) for question q. */
export function ghzQuantumProbs(s: GhzQuantum, q: number[]): number[] {
  return jointProbs(GHZ, [equatorialBasis(s[0][q[0]]), equatorialBasis(s[1][q[1]]), equatorialBasis(s[2][q[2]])]);
}

/** Win probability for each of the four questions. */
export function ghzQuantumWinProbs(s: GhzQuantum): number[] {
  return GHZ_QUESTIONS.map((q) => {
    const p = ghzQuantumProbs(s, q);
    let w = 0;
    for (let o = 0; o < 8; o++) if (ghzWins(q, [(o >> 2) & 1, (o >> 1) & 1, o & 1])) w += p[o];
    return w;
  });
}

export const GHZ_OPTIMAL: GhzQuantum = [
  [0, Math.PI / 2],
  [0, Math.PI / 2],
  [0, Math.PI / 2],
];

/* --------------------------- Local hidden variables --------------------------- */

/**
 * Mermin's three-setting device. An "instruction set" assigns an outcome (0 = red, 1 = green)
 * to each of the 3 settings; both particles carry the same set (so equal settings always agree).
 * Returns the probability that the two lights agree when both settings are chosen uniformly at random.
 */
export function merminAgreeProb(set: [0 | 1, 0 | 1, 0 | 1]): number {
  let agree = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (set[i] === set[j]) agree++;
  return agree / 9;
}

/** Quantum prediction for Mermin's device: settings at 0°, 60°, 120° (real-plane), |Φ+⟩ → P(agree) = 1/3·1 + 2/3·cos²60° = 1/2. */
export const MERMIN_ANGLES = [0, Math.PI / 3, (2 * Math.PI) / 3];

/** "Bertlmann's socks" style local model: each pair carries the same hidden polarisation λ; outcome 0 iff the analyser is within 45° of λ. */
export function socksOutcome(theta: number, lambda: number): 0 | 1 {
  let d = (((theta - lambda) % Math.PI) + Math.PI) % Math.PI; // [0, π)
  if (d > Math.PI / 2) d = Math.PI - d; // distance between lines, [0, π/2]
  return d < Math.PI / 4 ? 0 : 1;
}

/** Agreement probability of the socks model: 1 − 2|Δ|/π for |Δ| ≤ π/2 (folded). */
export function socksAgree(thA: number, thB: number): number {
  let d = (((thA - thB) % Math.PI) + Math.PI) % Math.PI;
  if (d > Math.PI / 2) d = Math.PI - d;
  return 1 - (2 * d) / Math.PI;
}
