/**
 * Interferometer Builder — exact single-photon optics on a grid.
 *
 * A photon is a complex amplitude living on (cell, direction) modes. Pieces act linearly:
 *   mirror        : redirects, amplitude × 1 (ideal mirrors; any phase they add is the same on every path we build)
 *   beam splitter : transmits with amplitude 1/√2, reflects with amplitude i/√2 (symmetric convention)
 *   phase shifter : multiplies by e^{iφ}, φ ∈ {π/2, π, 3π/2}
 *   detector/bomb/wall : absorb
 * Because everything is linear and the photon is monochromatic, the amplitude reaching a detector is the
 * sum over *all* paths (Feynman path sum). We compute that sum by stepping a frontier of amplitudes until
 * nothing is left (loops leak amplitude at every splitter, so they converge geometrically).
 * A detector hit from different directions sees orthogonal modes, so P = Σ_dir |amp_dir|².
 */
import { c, add, mul, scale, abs2, expi, type C } from '../../../engine/complex';

export type Dir = 0 | 1 | 2 | 3; // 0 → right, 1 ↓ down, 2 ← left, 3 ↑ up   (screen coordinates, y grows downward)
export const DX = [1, 0, -1, 0];
export const DY = [0, 1, 0, -1];

export type PieceKind = 'mirror' | 'bs' | 'phase';
/** o: mirror/bs → 0 = "/", 1 = "\" ;  phase → 1,2,3 meaning φ = o·π/2 */
export interface Piece {
  kind: PieceKind;
  o: number;
  fixed?: boolean;
}
export interface PlacedPiece extends Piece {
  x: number;
  y: number;
}

export interface LevelDef {
  id: string;
  title: string;
  /** Rich text task description. */
  brief: string;
  /**
   * Rows of the board. Legend:
   *  'S' source (emits →)   '.' empty, buildable   'x' empty, not buildable
   *  '#' wall (absorbs)     '*' bomb (absorbs)      'A'..'E' detectors (absorb, count)
   *  '/' '\\' fixed mirrors
   */
  layout: string[];
  /** Fixed beam splitters / phase shifters (or extra fixed mirrors). */
  fixed?: PlacedPiece[];
  inventory: Partial<Record<PieceKind, number>>;
  par: number;
  /** Required detector probabilities, e.g. { A: 1 } or { A: 0.25, B: 0.25 }. */
  target: Record<string, number>;
  /** Extra requirement evaluated with every bomb replaced by empty space ("if the bomb were a dud"). */
  dudCheck?: Record<string, number>;
  hint?: string;
  /** Shown after solving: why it works. */
  explain: string;
  /** A known solution (used by tests to prove solvability). */
  solution: PlacedPiece[];
}

export type CellType = 'empty' | 'void' | 'wall' | 'bomb' | 'source' | 'detector' | 'mirror';
export interface Cell {
  type: CellType;
  label?: string; // detector letter
  o?: number; // fixed mirror orientation
}

export function parseLayout(layout: string[]): { W: number; H: number; cells: Cell[][]; source: [number, number] } {
  const H = layout.length;
  const W = Math.max(...layout.map((r) => r.length));
  let source: [number, number] = [0, 0];
  const cells: Cell[][] = [];
  for (let y = 0; y < H; y++) {
    const row: Cell[] = [];
    for (let x = 0; x < W; x++) {
      const ch = layout[y][x] ?? 'x';
      let cell: Cell;
      if (ch === 'S') {
        cell = { type: 'source' };
        source = [x, y];
      } else if (ch === '.') cell = { type: 'empty' };
      else if (ch === '#') cell = { type: 'wall' };
      else if (ch === '*') cell = { type: 'bomb' };
      else if (ch === '/') cell = { type: 'mirror', o: 0 };
      else if (ch === '\\') cell = { type: 'mirror', o: 1 };
      else if (/[A-E]/.test(ch)) cell = { type: 'detector', label: ch };
      else cell = { type: 'void' };
      row.push(cell);
    }
    cells.push(row);
  }
  return { W, H, cells, source };
}

/** Reflection off a "/" (o=0) or "\" (o=1) surface. */
export function reflect(d: Dir, o: number): Dir {
  if (o === 0) return ([3, 2, 1, 0] as Dir[])[d]; // → becomes ↑, ↓ becomes ←, ← becomes ↓, ↑ becomes →
  return ([1, 0, 3, 2] as Dir[])[d]; // → becomes ↓, ↓ becomes →, ← becomes ↑, ↑ becomes ←
}

export const phaseOf = (p: Piece) => (p.o * Math.PI) / 2;

const R2 = Math.SQRT1_2;
const T_AMP = c(R2, 0);
const R_AMP = c(0, R2);

export interface Segment {
  x: number;
  y: number;
  dir: Dir;
  amp: C;
  /** true if this segment leaves the board. */
  exits: boolean;
}

export interface SimResult {
  /** Probability per detector label. */
  det: Record<string, number>;
  /** Amplitudes arriving at each detector, per incoming direction. */
  detAmps: Record<string, C[]>;
  bomb: number;
  /** Absorbed by walls or the source. */
  blocked: number;
  /** Left the board. */
  escaped: number;
  segments: Segment[];
}

export const key = (x: number, y: number) => `${x},${y}`;

/**
 * Run the path sum. `placed` maps "x,y" → piece (player + fixed pieces).
 */
export function simulate(level: LevelDef, placed: Map<string, Piece>, opts: { bombAsEmpty?: boolean } = {}): SimResult {
  const { W, H, cells, source } = parseLayout(level.layout);
  const idx = (x: number, y: number, d: number) => (y * W + x) * 4 + d;
  const seg = new Map<number, C>();
  const detAmps: Record<string, C[]> = {};
  for (const row of cells) for (const cl of row) if (cl.type === 'detector') detAmps[cl.label!] = [c(0), c(0), c(0), c(0)];
  const bombAmps = new Map<number, C>();
  const blockAmps = new Map<number, C>();
  const addTo = (m: Map<number, C>, k: number, a: C) => m.set(k, m.has(k) ? add(m.get(k)!, a) : a);

  // frontier: beams entering cell (x,y) travelling in dir d
  let frontier = new Map<number, C>();
  const emit = (x: number, y: number, d: Dir, a: C, into: Map<number, C>) => {
    addTo(seg, idx(x, y, d), a);
    const nx = x + DX[d], ny = y + DY[d];
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) return; // escapes; accounted via segment
    addTo(into, idx(nx, ny, d), a);
  };
  emit(source[0], source[1], 0, c(1), frontier);

  for (let step = 0; step < 2000 && frontier.size; step++) {
    const next = new Map<number, C>();
    for (const [k, a] of frontier) {
      if (abs2(a) < 1e-24) continue;
      const d = (k % 4) as Dir;
      const cellIdx = (k - d) / 4;
      const x = cellIdx % W, y = (cellIdx - x) / W;
      const cell = cells[y][x];
      const piece = placed.get(key(x, y));
      if (piece) {
        if (piece.kind === 'mirror') emit(x, y, reflect(d, piece.o), a, next);
        else if (piece.kind === 'bs') {
          emit(x, y, d, mul(a, T_AMP), next);
          emit(x, y, reflect(d, piece.o), mul(a, R_AMP), next);
        } else emit(x, y, d, mul(a, expi(phaseOf(piece))), next);
        continue;
      }
      switch (cell.type) {
        case 'empty':
        case 'void':
          emit(x, y, d, a, next);
          break;
        case 'mirror':
          emit(x, y, reflect(d, cell.o!), a, next);
          break;
        case 'bomb':
          if (opts.bombAsEmpty) emit(x, y, d, a, next);
          else addTo(bombAmps, k, a);
          break;
        case 'detector':
          detAmps[cell.label!][d] = add(detAmps[cell.label!][d], a);
          break;
        default:
          addTo(blockAmps, k, a);
      }
    }
    frontier = next;
  }

  const det: Record<string, number> = {};
  for (const L in detAmps) det[L] = detAmps[L].reduce((s, z) => s + abs2(z), 0);
  let bomb = 0;
  for (const z of bombAmps.values()) bomb += abs2(z);
  let blocked = 0;
  for (const z of blockAmps.values()) blocked += abs2(z);
  const segments: Segment[] = [];
  let escaped = 0;
  for (const [k, a] of seg) {
    const d = (k % 4) as Dir;
    const ci = (k - d) / 4;
    const x = ci % W, y = (ci - x) / W;
    const nx = x + DX[d], ny = y + DY[d];
    const exits = nx < 0 || ny < 0 || nx >= W || ny >= H;
    if (exits) escaped += abs2(a);
    segments.push({ x, y, dir: d, amp: a, exits });
  }
  return { det, detAmps, bomb, blocked, escaped, segments };
}

/** Merge fixed pieces from the level with the player's pieces. */
export function boardPieces(level: LevelDef, player: PlacedPiece[]): Map<string, Piece> {
  const m = new Map<string, Piece>();
  for (const p of level.fixed ?? []) m.set(key(p.x, p.y), { kind: p.kind, o: p.o, fixed: true });
  for (const p of player) m.set(key(p.x, p.y), { kind: p.kind, o: p.o });
  return m;
}

export const TOL = 0.005;

export function meetsTarget(res: SimResult, target: Record<string, number>): boolean {
  return Object.entries(target).every(([L, t]) => Math.abs((L === '*' ? res.bomb : res.det[L] ?? 0) - t) < TOL);
}

export function checkLevel(level: LevelDef, player: PlacedPiece[]): { ok: boolean; main: SimResult; dud?: SimResult } {
  const pieces = boardPieces(level, player);
  const main = simulate(level, pieces);
  let ok = meetsTarget(main, level.target);
  let dud: SimResult | undefined;
  if (level.dudCheck) {
    dud = simulate(level, pieces, { bombAsEmpty: true });
    ok = ok && meetsTarget(dud, level.dudCheck);
  }
  return { ok, main, dud };
}

/** Is a player placement legal (empty buildable cell, not occupied by a fixed piece)? */
export function canPlace(level: LevelDef, x: number, y: number): boolean {
  const { cells } = parseLayout(level.layout);
  if (cells[y]?.[x]?.type !== 'empty') return false;
  return !(level.fixed ?? []).some((p) => p.x === x && p.y === y);
}

export function starsFor(level: LevelDef, used: number): number {
  return used <= level.par ? 3 : used <= level.par + 2 ? 2 : 1;
}

// ---------------------------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------------------------

const P = (x: number, y: number, kind: PieceKind, o: number): PlacedPiece => ({ x, y, kind, o });
const BS = (x: number, y: number, o = 0) => P(x, y, 'bs', o);
const M = (x: number, y: number, o = 0) => P(x, y, 'mirror', o);
const PH = (x: number, y: number, o: number) => P(x, y, 'phase', o);

export const LEVELS: LevelDef[] = [
  {
    id: 'mirror',
    title: 'First Light',
    brief: 'The laser fires single photons to the right. Place a **mirror** so every photon lands in detector **A**.',
    layout: ['.....A.', '.......', '.......', 'S......'],
    inventory: { mirror: 2 },
    par: 1,
    target: { A: 1 },
    hint: 'A "/" mirror turns a rightward beam upward. Click a placed piece to rotate it.',
    explain:
      'A mirror just redirects the amplitude: all of it, $|1|^2 = 1$, reaches **A**. No splitting means no choice, so this is still classical. Next we let the photon have options.',
    solution: [M(5, 3, 0)],
  },
  {
    id: 'detour',
    title: 'The Long Way Round',
    brief: 'A wall blocks the direct path. Route the photon around it into **A** using mirrors only.',
    layout: ['........', '...#....', 'S..#..A.', '...#....', '........'],
    inventory: { mirror: 4 },
    par: 3,
    target: { A: 1 },
    hint: 'Up, over, and down: three turns.',
    explain:
      'Three reflections, still one path. Every photon follows the same route, so there is nothing to interfere. Mirrors in this game add no phase, so only splitters and phase shifters can change how paths combine.',
    solution: [M(1, 2, 0), M(1, 0, 0), M(6, 0, 1)],
  },
  {
    id: 'split',
    title: 'Fifty–Fifty',
    brief: 'Use a **beam splitter** so that detectors **A** and **B** each fire half the time.',
    layout: ['...A...', '.......', 'S.....B', '.......'],
    inventory: { bs: 1, mirror: 1 },
    par: 1,
    target: { A: 0.5, B: 0.5 },
    explain:
      'The splitter sends amplitude $\\tfrac{1}{\\sqrt2}$ straight through and $\\tfrac{i}{\\sqrt2}$ around the corner. Each has probability $|\\cdot|^2 = \\tfrac12$. A single photon is **never** split in two: one detector clicks each time, at random. The factor $i$ on reflection doesn\'t matter yet, but it will.',
    solution: [BS(3, 2, 0)],
  },
  {
    id: 'cascade',
    title: 'Cascade',
    brief: 'Make **A** fire 50% of the time and **B** and **C** 25% each.',
    layout: ['..A..B..', '........', 'S......C', '........', '........'],
    inventory: { bs: 2, mirror: 2 },
    par: 2,
    target: { A: 0.5, B: 0.25, C: 0.25 },
    hint: 'Split once, then split one of the halves again.',
    explain:
      'Amplitudes multiply along a path: reaching **B** means transmit then reflect, $\\tfrac{1}{\\sqrt2}\\cdot\\tfrac{i}{\\sqrt2} = \\tfrac{i}{2}$, so $P = \\tfrac14$. With only one path into each detector there is still no interference, and the probabilities behave like coin flips.',
    solution: [BS(2, 2, 0), BS(5, 2, 0)],
  },
  {
    id: 'close-mz',
    title: 'Close the Interferometer',
    brief:
      'Right now the two arms fire **A** and **B** 50/50. Add **one** beam splitter where the arms cross so that **every** photon goes to **A**.',
    layout: ['.....B..', '../....A', '........', 'S..../..'],
    fixed: [BS(2, 3, 0)],
    inventory: { bs: 1 },
    par: 1,
    target: { A: 1 },
    hint: 'Put the splitter at the crossing point and try both orientations.',
    explain:
      'This is a **Mach–Zehnder interferometer**. Two paths lead to each detector. To **A**: reflect·transmit $= \\tfrac{i}{2}$ plus transmit·reflect $= \\tfrac{i}{2}$, which adds up to $i$, so $P = 1$. To **B**: reflect·reflect $= -\\tfrac12$ plus transmit·transmit $= +\\tfrac12$, which cancels to $0$. A second "random" splitter made the outcome **certain**. Classical probabilities can\'t do that, but amplitudes can.',
    solution: [BS(5, 1, 0)],
  },
  {
    id: 'flip',
    title: 'Flip the Port',
    brief: 'The interferometer is complete. Use a **phase shifter** to send every photon to **B** instead.',
    layout: ['.....B..', '../....A', '........', 'S..../..'],
    fixed: [BS(2, 3, 0), BS(5, 1, 0)],
    inventory: { phase: 1 },
    par: 1,
    target: { B: 1 },
    hint: 'Place it in either arm, then click it to change $\\varphi$.',
    explain:
      'A phase shift of $\\pi$ multiplies one arm by $e^{i\\pi} = -1$. At **A** the two paths now give $\\tfrac{i}{2} - \\tfrac{i}{2} = 0$, and at **B** they give $-\\tfrac12 - \\tfrac12 = -1$. Nothing was blocked and no photon was steered. We only rotated the arrow on one path, and that moved the photon to the other detector. In general $P(A) = \\cos^2(\\varphi/2)$.',
    solution: [PH(3, 3, 2)],
  },
  {
    id: 'relative',
    title: 'Only Differences Matter',
    brief: 'Someone glued a $\\pi/2$ phase shifter into the lower arm. Restore **100% at A**.',
    layout: ['.....B..', '../....A', '........', 'S..../..'],
    fixed: [BS(2, 3, 0), BS(5, 1, 0), PH(3, 3, 1)],
    inventory: { phase: 2 },
    par: 1,
    target: { A: 1 },
    hint: 'You can\'t remove the glued shifter, but you can match it in the other arm or add more to its own arm.',
    explain:
      'Interference depends only on the **relative** phase between the arms. Add $\\pi/2$ to the upper arm (equal phases), or $3\\pi/2$ to the lower arm (total $2\\pi \\equiv 0$). Either way the arrows line up again. Shifting *both* arms equally is a **global** phase, which no detector can ever notice.',
    solution: [PH(2, 2, 1)],
  },
  {
    id: 'merge',
    title: 'Build It Yourself',
    brief:
      'The first splitter is fixed. Detector **A** is shielded on every side except its left. Get **100%** of photons into **A**.',
    layout: ['.......A', '.......#', 'S......B', '........', '........'],
    fixed: [BS(1, 2, 0)],
    inventory: { bs: 1, mirror: 3, phase: 1 },
    par: 3,
    target: { A: 1 },
    hint: 'Mirrors can\'t merge two beams into one, but a beam splitter can. Bring both halves together in the top row.',
    explain:
      'Both halves of the amplitude arrive at your splitter, one moving right and one moving up. They leave in two output directions, and the arrows add to $i$ in one and cancel to $0$ in the other. Merging two beams into a single beam with no loss is only possible because the amplitudes **interfere**. Classical coin-flip probabilities can\'t be merged like this.',
    solution: [M(1, 0, 0), M(4, 2, 0), BS(4, 0, 0)],
  },
  {
    id: 'bomb',
    title: 'Seeing in the Dark',
    brief:
      'A live bomb sits in the lower arm. Build a tester: **A** and **B** must each fire 25% of the time **and**, if the bomb were a dud, **B** must stay completely dark.',
    layout: ['.....B..', '.......A', '........', 'S...*/..'],
    fixed: [BS(2, 3, 0)],
    inventory: { bs: 1, mirror: 2 },
    par: 2,
    target: { A: 0.25, B: 0.25 },
    dudCheck: { B: 0 },
    hint: 'Finish the Mach–Zehnder exactly as before. The bomb does the rest.',
    explain:
      'With a dud, the interferometer is balanced and **B** is a dark port: $-\\tfrac12 + \\tfrac12 = 0$. A live bomb absorbs the lower path, which acts as a which-path measurement. Half the time it explodes. Otherwise the photon is known to be in the upper arm, nothing cancels, and **B** fires with $P = |{-\\tfrac12}|^2 = \\tfrac14$. A click at **B** proves the bomb is live even though the photon never touched it. This is the **Elitzur–Vaidman bomb tester** (1993).',
    solution: [M(2, 1, 0), BS(5, 1, 0)],
  },
  {
    id: 'finale',
    title: 'Dark Port, Bright Idea',
    brief:
      'Both splitters are fixed, and a wall blocks the lower arm. Steer **every** photon into **C**. As built, C would be the *dark* port.',
    layout: ['.....C..', '.......A', '........', 'S...#...', '........'],
    fixed: [BS(2, 3, 0), BS(5, 1, 0)],
    inventory: { mirror: 5, phase: 2 },
    par: 4,
    target: { C: 1 },
    hint: 'Two ideas work: add a $\\pi$ phase to one arm, or cross the arms so each enters the second splitter from the other side.',
    explain:
      'A port is dark when its two paths are "reflect, reflect" ($i\\cdot i = -1$) and "transmit, transmit" ($+1$). You can make **C** bright in two ways. One is a $\\pi$ phase shift on one arm, which flips the sign. The other is to swap which arm enters the second splitter from which side, so C collects reflect·transmit + transmit·reflect $= i + i$. Both work, and both are pure amplitude arithmetic.',
    solution: [M(2, 2, 0), M(5, 2, 0), M(3, 3, 0), M(3, 1, 0)],
    // (the phase route also works: M(2,1,0), M(3,3,1), M(3,4,1), M(5,4,0), PH(2,2,2))
  },
];
