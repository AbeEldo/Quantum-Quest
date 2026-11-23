import { describe, it, expect } from 'vitest';
import { LEVELS, PROGRAMS, runProgram } from './games/keeperSim';
const prog = (id: string) => PROGRAMS.find((p) => p.id === id)!.times();
describe('Coherence Keeper physics', () => {
  it('Hahn echo perfectly refocuses static offsets', () => {
    expect(runProgram(LEVELS[0], prog('hahn'), 1)).toBeGreaterThan(0.99);
    expect(runProgram(LEVELS[0], prog('none'), 1)).toBeLessThan(0.6);
  });
  it('every level can reach at least one star with some program', () => {
    for (const lv of LEVELS) {
      const best = Math.max(...PROGRAMS.map((p) => runProgram(lv, p.times(), 3)));
      expect(best).toBeGreaterThan(lv.stars[0]);
    }
  });
});
