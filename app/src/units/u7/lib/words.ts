/**
 * Breadth-first enumeration of the single-qubit states reachable from |0⟩ with words in a
 * finite gate set (e.g. {H, T}), shortest word first. Used by the universality widget and
 * the Gate Golf game.
 */
import { GATES, type Mat2 } from '../../../engine/qsim';

export type WordGate = 'H' | 'T' | 'S' | 'X' | 'Z' | 'Tdg' | 'Sdg';

const MATS: Record<WordGate, Mat2> = { H: GATES.H, T: GATES.T, S: GATES.S, X: GATES.X, Z: GATES.Z, Tdg: GATES.Tdg, Sdg: GATES.Sdg };

export interface WordCloud {
  gates: WordGate[];
  /** number of distinct states found */
  count: number;
  /** Bloch vectors, 3 floats per state */
  xyz: Float64Array;
  /** canonical amplitudes (a real ≥ 0, b complex): [a, bRe, bIm] per state */
  amp: Float64Array;
  /** length of the shortest word reaching each state */
  len: Uint16Array;
  /** BFS tree: parent state index (−1 for |0⟩) and the gate index applied last */
  parent: Int32Array;
  gate: Uint8Array;
  /** cumulative count of states with word length ≤ L (index L) */
  cumulative: number[];
  /** true if the enumeration stopped because maxPoints was reached */
  truncated: boolean;
}

/**
 * Enumerate states reachable by words of length ≤ maxLen (stops early at maxPoints), starting
 * from |0⟩ or from `start` = [a, b] given as [[aRe, aIm], [bRe, bIm]].
 */
export function enumerateWords(gates: WordGate[], maxLen: number, maxPoints = 150000, start?: [[number, number], [number, number]]): WordCloud {
  const cap = maxPoints + 64;
  const xyz = new Float64Array(cap * 3);
  const amp = new Float64Array(cap * 3);
  const len = new Uint16Array(cap);
  const parent = new Int32Array(cap);
  const gate = new Uint8Array(cap);
  const seen = new Map<string, number>();
  let count = 0;
  const push = (a: number, br: number, bi: number, L: number, p: number, g: number): boolean => {
    // canonical: a is real ≥ 0 already (we keep it that way)
    const x = 2 * a * br, y = 2 * a * bi, z = a * a - (br * br + bi * bi);
    const key = `${Math.round(x * 1e7)},${Math.round(y * 1e7)},${Math.round(z * 1e7)}`;
    if (seen.has(key)) return false;
    seen.set(key, count);
    xyz[3 * count] = x;
    xyz[3 * count + 1] = y;
    xyz[3 * count + 2] = z;
    amp[3 * count] = a;
    amp[3 * count + 1] = br;
    amp[3 * count + 2] = bi;
    len[count] = L;
    parent[count] = p;
    gate[count] = g;
    count++;
    return true;
  };
  if (start) {
    const [[ar, ai], [br, bi]] = start;
    const ma = Math.hypot(ar, ai);
    if (ma > 1e-12) {
      const cr = ar / ma, ci = -ai / ma;
      push(ma, br * cr - bi * ci, br * ci + bi * cr, 0, -1, 0);
    } else push(0, Math.hypot(br, bi), 0, 0, -1, 0);
  } else push(1, 0, 0, 0, -1, 0);
  const cumulative = [1];
  let frontierStart = 0, frontierEnd = 1;
  let truncated = false;
  for (let L = 1; L <= maxLen && !truncated; L++) {
    for (let i = frontierStart; i < frontierEnd && !truncated; i++) {
      const a = amp[3 * i], br = amp[3 * i + 1], bi = amp[3 * i + 2];
      for (let g = 0; g < gates.length; g++) {
        const m = MATS[gates[g]];
        // new = m · (a, b)
        let nar = m[0].re * a + m[1].re * br - m[1].im * bi;
        let nai = m[0].im * a + m[1].re * bi + m[1].im * br;
        let nbr = m[2].re * a + m[3].re * br - m[3].im * bi;
        let nbi = m[2].im * a + m[3].re * bi + m[3].im * br;
        // canonicalise: rotate so that first amplitude is real ≥ 0
        const ma = Math.hypot(nar, nai);
        if (ma > 1e-12) {
          const cr = nar / ma, ci = -nai / ma;
          const tbr = nbr * cr - nbi * ci, tbi = nbr * ci + nbi * cr;
          nar = ma;
          nai = 0;
          nbr = tbr;
          nbi = tbi;
        } else {
          nar = 0;
          nbr = Math.hypot(nbr, nbi);
          nbi = 0;
        }
        push(nar, nbr, nbi, L, i, g);
        if (count >= maxPoints) {
          truncated = true;
          break;
        }
      }
    }
    frontierStart = frontierEnd;
    frontierEnd = count;
    cumulative.push(count);
  }
  return { gates, count, xyz, amp, len, parent, gate, cumulative, truncated };
}

/** The (shortest) word reaching state i, in time order. */
export function wordOf(cloud: WordCloud, i: number): WordGate[] {
  const w: WordGate[] = [];
  while (i > 0) {
    w.push(cloud.gates[cloud.gate[i]]);
    i = cloud.parent[i];
  }
  return w.reverse();
}

/** Best state (max fidelity with Bloch vector t) among words of length ≤ L. */
export function bestApprox(cloud: WordCloud, t: [number, number, number], L: number): { index: number; fidelity: number } {
  const end = cloud.cumulative[Math.min(L, cloud.cumulative.length - 1)] ?? cloud.count;
  let best = 0, bd = -2;
  for (let i = 0; i < end; i++) {
    const d = cloud.xyz[3 * i] * t[0] + cloud.xyz[3 * i + 1] * t[1] + cloud.xyz[3 * i + 2] * t[2];
    if (d > bd) {
      bd = d;
      best = i;
    }
  }
  return { index: best, fidelity: (1 + bd) / 2 };
}

/** Evenly spread points on the sphere (Fibonacci lattice). */
export function fibonacciSphere(n: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  const g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const z = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - z * z);
    out.push([r * Math.cos(g * i), r * Math.sin(g * i), z]);
  }
  return out;
}

/**
 * Worst-case infidelity ε(L) = max over test directions of (1 − best fidelity) using words
 * of length ≤ L, for L = 0..maxL. (A covering-radius estimate.)
 */
export function worstInfidelity(cloud: WordCloud, tests: [number, number, number][]): number[] {
  const bestDot = new Float64Array(tests.length).fill(-2);
  const out: number[] = [];
  let start = 0;
  for (let L = 0; L < cloud.cumulative.length; L++) {
    const end = cloud.cumulative[L];
    for (let k = 0; k < tests.length; k++) {
      const [tx, ty, tz] = tests[k];
      let bd = bestDot[k];
      for (let i = start; i < end; i++) {
        const d = cloud.xyz[3 * i] * tx + cloud.xyz[3 * i + 1] * ty + cloud.xyz[3 * i + 2] * tz;
        if (d > bd) bd = d;
      }
      bestDot[k] = bd;
    }
    start = end;
    let worst = 0;
    for (let k = 0; k < tests.length; k++) worst = Math.max(worst, (1 - bestDot[k]) / 2);
    out.push(worst);
  }
  return out;
}
