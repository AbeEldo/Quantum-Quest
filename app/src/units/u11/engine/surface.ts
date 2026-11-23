/**
 * Rotated surface code of odd distance d (d×d data qubits) with a minimum-weight
 * perfect-matching (MWPM) decoder.
 *
 * Layout: data qubit q = y*d + x sits at integer point (x, y), x to the right, y downwards.
 * Plaquette (a, b) is the square with corners (a,b),(a+1,b),(a,b+1),(a+1,b+1), a,b ∈ [-1, d-1].
 *   (a+b) even → X-type check, odd → Z-type check.
 *   Bulk plaquettes (all four corners inside) are weight 4.
 *   Weight-2 boundary plaquettes: X-type only on the top/bottom edges, Z-type only on the left/right edges.
 * This gives d²−1 checks. Logical X̄ = X on any column (top→bottom); logical Z̄ = Z on any row.
 *
 * X errors are detected by Z-checks and can terminate on the top/bottom boundaries;
 * Z errors are detected by X-checks and can terminate on the left/right boundaries.
 */

export type Pauli1 = 'X' | 'Z';

export interface Plaquette {
  id: number;
  type: Pauli1;
  a: number;
  b: number;
  /** data qubits in this check */
  qubits: number[];
  /** centre in qubit coordinates */
  cx: number;
  cy: number;
}

/** Matching graph for one error type: nodes = checks of the detecting type + one boundary node. */
export interface MatchGraph {
  /** detecting check ids (indices into code.plaquettes) in node order */
  checks: number[];
  /** node index of the boundary */
  boundary: number;
  /** adjacency: node → list of [neighbour node, qubit (edge) id] */
  adj: [number, number][][];
  /** check id → node index */
  nodeOf: Map<number, number>;
}

export interface SurfaceCode {
  d: number;
  n: number;
  plaquettes: Plaquette[];
  /** for every data qubit, the ids of checks containing it */
  checksOf: number[][];
  logicalX: number[];
  logicalZ: number[];
  /** matching graph used to decode errors of the given type */
  graph: Record<Pauli1, MatchGraph>;
}

export const qx = (code: SurfaceCode, q: number) => q % code.d;
export const qy = (code: SurfaceCode, q: number) => Math.floor(q / code.d);

/** Check type that detects an error of the given Pauli type. */
export const detector = (err: Pauli1): Pauli1 => (err === 'X' ? 'Z' : 'X');

export function makeSurfaceCode(d: number): SurfaceCode {
  if (d < 3 || d % 2 === 0) throw new Error('d must be odd and ≥ 3');
  const plaquettes: Plaquette[] = [];
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < d && y < d;
  for (let b = -1; b < d; b++)
    for (let a = -1; a < d; a++) {
      const type: Pauli1 = (((a + b) % 2) + 2) % 2 === 0 ? 'X' : 'Z';
      const corners: [number, number][] = [
        [a, b],
        [a + 1, b],
        [a, b + 1],
        [a + 1, b + 1],
      ];
      const qs = corners.filter(([x, y]) => inside(x, y)).map(([x, y]) => y * d + x);
      if (qs.length === 4) {
        plaquettes.push({ id: plaquettes.length, type, a, b, qubits: qs, cx: a + 0.5, cy: b + 0.5 });
      } else if (qs.length === 2) {
        const topBottom = b === -1 || b === d - 1;
        const leftRight = a === -1 || a === d - 1;
        if ((topBottom && type === 'X') || (leftRight && type === 'Z'))
          plaquettes.push({ id: plaquettes.length, type, a, b, qubits: qs, cx: a + 0.5, cy: b + 0.5 });
      }
    }
  const n = d * d;
  const checksOf: number[][] = Array.from({ length: n }, () => []);
  for (const p of plaquettes) for (const q of p.qubits) checksOf[q].push(p.id);
  const mid = (d - 1) / 2;
  const logicalX = Array.from({ length: d }, (_, y) => y * d + mid); // middle column
  const logicalZ = Array.from({ length: d }, (_, x) => mid * d + x); // middle row

  const mkGraph = (checkType: Pauli1): MatchGraph => {
    const checks = plaquettes.filter((p) => p.type === checkType).map((p) => p.id);
    const nodeOf = new Map<number, number>();
    checks.forEach((id, i) => nodeOf.set(id, i));
    const boundary = checks.length;
    const adj: [number, number][][] = Array.from({ length: checks.length + 1 }, () => []);
    for (let q = 0; q < n; q++) {
      const cs = checksOf[q].filter((id) => plaquettes[id].type === checkType).map((id) => nodeOf.get(id)!);
      if (cs.length === 2) {
        adj[cs[0]].push([cs[1], q]);
        adj[cs[1]].push([cs[0], q]);
      } else if (cs.length === 1) {
        adj[cs[0]].push([boundary, q]);
        adj[boundary].push([cs[0], q]);
      }
    }
    return { checks, boundary, adj, nodeOf };
  };

  return { d, n, plaquettes, checksOf, logicalX, logicalZ, graph: { X: mkGraph('Z'), Z: mkGraph('X') } };
}

/** Syndrome (one bit per plaquette id; only checks of the detecting type can light up). */
export function syndrome(code: SurfaceCode, errType: Pauli1, err: ArrayLike<number>): Uint8Array {
  const s = new Uint8Array(code.plaquettes.length);
  const det = detector(errType);
  for (const p of code.plaquettes) {
    if (p.type !== det) continue;
    let par = 0;
    for (const q of p.qubits) par ^= err[q] & 1;
    s[p.id] = par;
  }
  return s;
}

/** List of lit check ids. */
export function defects(code: SurfaceCode, errType: Pauli1, err: ArrayLike<number>): number[] {
  const s = syndrome(code, errType, err);
  const out: number[] = [];
  s.forEach((v, i) => v && out.push(i));
  return out;
}

/** BFS from a node: distances and parent edges. */
function bfs(g: MatchGraph, src: number) {
  const N = g.adj.length;
  const dist = new Int32Array(N).fill(-1);
  const parent = new Int32Array(N).fill(-1);
  const parentEdge = new Int32Array(N).fill(-1);
  const queue = [src];
  dist[src] = 0;
  for (let h = 0; h < queue.length; h++) {
    const u = queue[h];
    for (const [v, e] of g.adj[u]) {
      // boundary node is a sink: paths may end there but not pass through it
      if (dist[v] >= 0) continue;
      dist[v] = dist[u] + 1;
      parent[v] = u;
      parentEdge[v] = e;
      if (v !== g.boundary) queue.push(v);
    }
  }
  return { dist, parent, parentEdge };
}

export interface Matching {
  /** pairs of defect check ids; second = -1 means matched to the boundary */
  pairs: [number, number][];
  /** total weight (number of qubits flipped, before XOR cancellations) */
  weight: number;
  /** correction: 1 on qubits to flip */
  correction: Uint8Array;
}

/**
 * Minimum-weight perfect matching of defects (with optional boundary matches), exact by
 * dynamic programming over subsets for up to `exactLimit` defects, greedy beyond that.
 */
export function decodeMWPM(code: SurfaceCode, errType: Pauli1, defectIds: number[], exactLimit = 14): Matching {
  const g = code.graph[errType];
  const nodes = defectIds.map((id) => g.nodeOf.get(id)!);
  const k = nodes.length;
  const trees = nodes.map((u) => bfs(g, u));
  const D = (i: number, j: number) => trees[i].dist[nodes[j]];
  const B = (i: number) => trees[i].dist[g.boundary];
  const pairs: [number, number][] = [];
  let weight = 0;

  if (k <= exactLimit) {
    const size = 1 << k;
    const f = new Float64Array(size).fill(Infinity);
    const choice = new Int32Array(size).fill(-2); // partner index, -1 = boundary
    f[0] = 0;
    for (let mask = 1; mask < size; mask++) {
      // lowest set bit
      let i = 0;
      while (!(mask & (1 << i))) i++;
      const rest = mask ^ (1 << i);
      let best = B(i) + f[rest];
      let ch = -1;
      for (let j = i + 1; j < k; j++) {
        if (!(rest & (1 << j))) continue;
        const v = D(i, j) + f[rest ^ (1 << j)];
        if (v < best) {
          best = v;
          ch = j;
        }
      }
      f[mask] = best;
      choice[mask] = ch;
    }
    let mask = size - 1;
    while (mask) {
      let i = 0;
      while (!(mask & (1 << i))) i++;
      const j = choice[mask];
      if (j === -1) {
        pairs.push([defectIds[i], -1]);
        weight += B(i);
        mask ^= 1 << i;
      } else {
        pairs.push([defectIds[i], defectIds[j]]);
        weight += D(i, j);
        mask ^= (1 << i) | (1 << j);
      }
    }
  } else {
    // greedy: repeatedly take the globally cheapest available pairing
    const left = new Set(Array.from({ length: k }, (_, i) => i));
    while (left.size) {
      let best = Infinity, bi = -1, bj = -1;
      for (const i of left) {
        if (B(i) < best) { best = B(i); bi = i; bj = -1; }
        for (const j of left) if (j > i && D(i, j) < best) { best = D(i, j); bi = i; bj = j; }
      }
      left.delete(bi);
      if (bj >= 0) left.delete(bj);
      pairs.push([defectIds[bi], bj >= 0 ? defectIds[bj] : -1]);
      weight += best;
    }
  }

  const correction = new Uint8Array(code.n);
  for (const [a, b] of pairs) {
    const i = defectIds.indexOf(a);
    const target = b === -1 ? g.boundary : g.nodeOf.get(b)!;
    const t = trees[i];
    let v = target;
    while (v !== nodes[i] && v >= 0) {
      const e = t.parentEdge[v];
      if (e < 0) break;
      correction[e] ^= 1;
      v = t.parent[v];
    }
  }
  return { pairs, weight, correction };
}

/** Does a syndrome-free residual error implement a logical operator? */
export function isLogicalFlip(code: SurfaceCode, errType: Pauli1, residual: ArrayLike<number>): boolean {
  // X-type residual flips the logical iff it anticommutes with Z̄ (odd overlap with a row), and vice versa.
  const line = errType === 'X' ? code.logicalZ : code.logicalX;
  let par = 0;
  for (const q of line) par ^= residual[q] & 1;
  return par === 1;
}

/** Sample iid errors of one type with probability p. */
export function sampleErrors(code: SurfaceCode, p: number, rng: () => number): Uint8Array {
  const e = new Uint8Array(code.n);
  for (let q = 0; q < code.n; q++) e[q] = rng() < p ? 1 : 0;
  return e;
}

/** One code-capacity trial: sample, decode with MWPM, return true if a logical error resulted. */
export function trialLogicalError(code: SurfaceCode, errType: Pauli1, p: number, rng: () => number): boolean {
  const e = sampleErrors(code, p, rng);
  const defs = defects(code, errType, e);
  const m = decodeMWPM(code, errType, defs);
  const r = new Uint8Array(code.n);
  for (let q = 0; q < code.n; q++) r[q] = e[q] ^ m.correction[q];
  return isLogicalFlip(code, errType, r);
}

export function xorArr(a: ArrayLike<number>, b: ArrayLike<number>): Uint8Array {
  const r = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) r[i] = (a[i] ^ b[i]) & 1;
  return r;
}

export function weightOf(a: ArrayLike<number>): number {
  let w = 0;
  for (let i = 0; i < a.length; i++) w += a[i] & 1;
  return w;
}
