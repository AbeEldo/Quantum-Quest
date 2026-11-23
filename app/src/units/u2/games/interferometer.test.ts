import { describe, it, expect } from 'vitest';
import { LEVELS, checkLevel, simulate, boardPieces, canPlace, parseLayout, starsFor, type PlacedPiece, type PieceKind } from './interferometerEngine';
import { mulberry32 } from '../../../engine/qsim';

const total = (r: ReturnType<typeof simulate>) => Object.values(r.det).reduce((a, b) => a + b, 0) + r.bomb + r.blocked + r.escaped;

describe('interferometer engine', () => {
  it('has 8–12 levels with unique ids', () => {
    expect(LEVELS.length).toBeGreaterThanOrEqual(8);
    expect(LEVELS.length).toBeLessThanOrEqual(12);
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(LEVELS.length);
  });

  for (const level of LEVELS) {
    it(`level "${level.id}" is solved by its reference solution`, () => {
      // solution respects inventory and placement rules
      const counts: Record<string, number> = {};
      for (const p of level.solution) {
        counts[p.kind] = (counts[p.kind] ?? 0) + 1;
        expect(canPlace(level, p.x, p.y), `${level.id}: cannot place at ${p.x},${p.y}`).toBe(true);
      }
      for (const k in counts) expect(counts[k]).toBeLessThanOrEqual(level.inventory[k as PieceKind] ?? 0);
      const r = checkLevel(level, level.solution);
      expect(r.ok, `${level.id}: ${JSON.stringify(r.main.det)} bomb=${r.main.bomb}`).toBe(true);
      expect(total(r.main)).toBeCloseTo(1, 6);
      expect(level.solution.length).toBeLessThanOrEqual(level.par);
    });
    it(`level "${level.id}" is NOT already solved with an empty board`, () => {
      expect(checkLevel(level, []).ok).toBe(false);
    });
  }

  it('Mach–Zehnder: P(A) = cos²(φ/2)', () => {
    const lvl = LEVELS.find((l) => l.id === 'flip')!;
    for (const o of [1, 2, 3]) {
      const r = simulate(lvl, boardPieces(lvl, [{ x: 3, y: 3, kind: 'phase', o }]));
      expect(r.det.A).toBeCloseTo(Math.cos((o * Math.PI) / 4) ** 2, 9);
    }
  });

  it('conserves probability on random boards (including loops)', () => {
    const rng = mulberry32(7);
    const kinds: PieceKind[] = ['mirror', 'bs', 'phase'];
    for (const level of LEVELS) {
      const { W, H } = parseLayout(level.layout);
      for (let trial = 0; trial < 40; trial++) {
        const pcs: PlacedPiece[] = [];
        for (let k = 0; k < 6; k++) {
          const x = Math.floor(rng() * W), y = Math.floor(rng() * H);
          if (!canPlace(level, x, y) || pcs.some((p) => p.x === x && p.y === y)) continue;
          const kind = kinds[Math.floor(rng() * 3)];
          pcs.push({ x, y, kind, o: kind === 'phase' ? 1 + Math.floor(rng() * 3) : Math.floor(rng() * 2) });
        }
        expect(total(simulate(level, boardPieces(level, pcs)))).toBeCloseTo(1, 5);
      }
    }
  });

  it('finale also solvable via a π phase shift', () => {
    const lvl = LEVELS.find((l) => l.id === 'finale')!;
    const alt: PlacedPiece[] = [
      { x: 2, y: 1, kind: 'mirror', o: 0 }, { x: 3, y: 3, kind: 'mirror', o: 1 }, { x: 3, y: 4, kind: 'mirror', o: 1 },
      { x: 5, y: 4, kind: 'mirror', o: 0 }, { x: 2, y: 2, kind: 'phase', o: 2 },
    ];
    expect(checkLevel(lvl, alt).ok).toBe(true);
  });

  it('stars', () => {
    expect(starsFor(LEVELS[0], 1)).toBe(3);
    expect(starsFor(LEVELS[0], 3)).toBe(2);
    expect(starsFor(LEVELS[0], 4)).toBe(1);
  });
});
