/**
 * Tiny Pauli/stabilizer toolkit for small codes (n ≤ 16), using the binary symplectic picture:
 * a Pauli on n qubits (ignoring phase) is a pair of bitmasks (x, z); qubit i ↔ bit i.
 *   X_i: x has bit i;  Z_i: z has bit i;  Y_i: both.
 * Two Paulis commute iff popcount((a.x & b.z) ^ (a.z & b.x)) is even.
 */

export interface Pauli {
  x: number;
  z: number;
}

export const I0: Pauli = { x: 0, z: 0 };

export function popcount(v: number): number {
  let c = 0;
  while (v) {
    v &= v - 1;
    c++;
  }
  return c;
}

export const commutes = (a: Pauli, b: Pauli) => popcount((a.x & b.z) ^ (a.z & b.x)) % 2 === 0;
export const mulP = (a: Pauli, b: Pauli): Pauli => ({ x: a.x ^ b.x, z: a.z ^ b.z });
export const weight = (a: Pauli) => popcount(a.x | a.z);

/** Parse e.g. "ZZI", "XXXXXXIII" (left-most character = qubit 0). */
export function P(s: string): Pauli {
  let x = 0, z = 0;
  [...s].forEach((ch, i) => {
    if (ch === 'X' || ch === 'Y') x |= 1 << i;
    if (ch === 'Z' || ch === 'Y') z |= 1 << i;
  });
  return { x, z };
}

export function pauliString(p: Pauli, n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) {
    const xb = (p.x >> i) & 1, zb = (p.z >> i) & 1;
    s += xb && zb ? 'Y' : xb ? 'X' : zb ? 'Z' : 'I';
  }
  return s;
}

export function single(q: number, t: 'X' | 'Y' | 'Z'): Pauli {
  return { x: t === 'Z' ? 0 : 1 << q, z: t === 'X' ? 0 : 1 << q };
}

export interface StabilizerCode {
  name: string;
  n: number;
  k: number;
  d: number;
  stabilizers: Pauli[];
  /** human labels for the generators */
  labels: string[];
  logicalX: Pauli;
  logicalZ: Pauli;
}

/** Syndrome bits: 1 where the error anticommutes with a generator. */
export function syndromeOf(code: StabilizerCode, e: Pauli): number[] {
  return code.stabilizers.map((s) => (commutes(s, e) ? 0 : 1));
}

export const synKey = (s: number[]) => s.join('');

/** Is p (up to phase) an element of the stabilizer group? (in the normalizer and commutes with the logicals) */
export function inStabilizerGroup(code: StabilizerCode, p: Pauli): boolean {
  return code.stabilizers.every((s) => commutes(s, p)) && commutes(p, code.logicalX) && commutes(p, code.logicalZ);
}

export type Outcome = 'ok' | 'logical' | 'detected';

/** After applying correction c to error e: was the logical state restored? */
export function outcome(code: StabilizerCode, e: Pauli, c: Pauli): Outcome {
  const r = mulP(e, c);
  if (!code.stabilizers.every((s) => commutes(s, r))) return 'detected';
  return inStabilizerGroup(code, r) ? 'ok' : 'logical';
}

/**
 * Lookup-table decoder: for every syndrome, the lowest-weight Pauli producing it
 * (restricted to `types`, e.g. only X errors for a bit-flip code). Ties broken by enumeration order.
 */
export function buildLookup(code: StabilizerCode, types: ('X' | 'Y' | 'Z')[] = ['X', 'Y', 'Z'], maxWeight = 2): Map<string, Pauli> {
  const table = new Map<string, Pauli>();
  table.set(synKey(syndromeOf(code, I0)), I0);
  const singles: Pauli[] = [];
  for (let q = 0; q < code.n; q++) for (const t of types) singles.push(single(q, t));
  let frontier: { p: Pauli; last: number }[] = [{ p: I0, last: -1 }];
  for (let w = 1; w <= maxWeight; w++) {
    const next: { p: Pauli; last: number }[] = [];
    for (const { p, last } of frontier)
      for (let i = 0; i < singles.length; i++) {
        const s = singles[i];
        const q = Math.floor(i / types.length);
        if (q <= last) continue;
        const np = mulP(p, s);
        next.push({ p: np, last: q });
        const key = synKey(syndromeOf(code, np));
        if (!table.has(key)) table.set(key, np);
      }
    frontier = next;
  }
  return table;
}

/* ------------------------------- the codes -------------------------------- */

export function repetitionCode(n: number, kind: 'bit' | 'phase' = 'bit'): StabilizerCode {
  const ch = kind === 'bit' ? 'Z' : 'X';
  const other = kind === 'bit' ? 'X' : 'Z';
  const stabilizers: Pauli[] = [];
  const labels: string[] = [];
  for (let i = 0; i < n - 1; i++) {
    const s = Array.from({ length: n }, (_, j) => (j === i || j === i + 1 ? ch : 'I')).join('');
    stabilizers.push(P(s));
    labels.push(`${ch}${i}${ch}${i + 1}`);
  }
  return {
    name: `${n}-qubit ${kind}-flip code`,
    n,
    k: 1,
    d: 1, // as a quantum code: one error of the "other" type is a logical error
    stabilizers,
    labels,
    logicalX: P(other.repeat(n)),
    logicalZ: P(ch + 'I'.repeat(n - 1)),
  };
}

/** Shor's 9-qubit code (qubits 0..8 in three blocks of three). */
export function shorCode(): StabilizerCode {
  const gens = ['ZZIIIIIII', 'IZZIIIIII', 'IIIZZIIII', 'IIIIZZIII', 'IIIIIIZZI', 'IIIIIIIZZ', 'XXXXXXIII', 'IIIXXXXXX'];
  return {
    name: "Shor's 9-qubit code",
    n: 9,
    k: 1,
    d: 3,
    stabilizers: gens.map(P),
    labels: ['Z0Z1', 'Z1Z2', 'Z3Z4', 'Z4Z5', 'Z6Z7', 'Z7Z8', 'X0–X5', 'X3–X8'],
    // |0_L⟩ = (|000⟩+|111⟩)^⊗3: Z̄ = X^⊗9 flips sign of |1_L⟩ ... X̄ = Z^⊗9 swaps blocks' signs
    logicalX: P('ZZZZZZZZZ'),
    logicalZ: P('XXXXXXXXX'),
  };
}

/** Steane's [[7,1,3]] code (Hamming-code checks for both X and Z). */
export function steaneCode(): StabilizerCode {
  const h = ['IIIXXXX', 'IXXIIXX', 'XIXIXIX'];
  return {
    name: 'Steane [[7,1,3]] code',
    n: 7,
    k: 1,
    d: 3,
    stabilizers: [...h.map(P), ...h.map((s) => P(s.replace(/X/g, 'Z')))],
    labels: ['X-check 1', 'X-check 2', 'X-check 3', 'Z-check 1', 'Z-check 2', 'Z-check 3'],
    logicalX: P('XXXXXXX'),
    logicalZ: P('ZZZZZZZ'),
  };
}
