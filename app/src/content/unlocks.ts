import type { UnitDef, GameDef } from './types';
import { UNITS, ALL_LESSONS } from './curriculum';
import type { ProgressState } from '../state/progress';

type P = Pick<ProgressState, 'lessons' | 'bosses' | 'settings'>;

export function unitComplete(u: UnitDef, p: P): boolean {
  if (p.bosses[`${u.id}`]?.defeated || (u.boss && p.bosses[u.boss.id]?.defeated)) return true;
  return u.lessons.length > 0 && u.lessons.every((l) => p.lessons[l.id]);
}

export function unitProgress(u: UnitDef, p: P): number {
  if (!u.lessons.length) return 0;
  return u.lessons.filter((l) => p.lessons[l.id]).length / u.lessons.length;
}

export function isUnitUnlocked(u: UnitDef, p: P): boolean {
  if (p.settings.freeRoam) return true;
  if (u.number <= 1) return true;
  // find previous unit that has content
  const idx = UNITS.findIndex((x) => x.id === u.id);
  for (let i = idx - 1; i >= 0; i--) {
    const prev = UNITS[i];
    if (prev.lessons.length === 0 && !prev.boss) continue;
    return unitComplete(prev, p);
  }
  return true;
}

export function isLessonUnlocked(lessonId: string, p: P): boolean {
  const l = ALL_LESSONS.find((x) => x.id === lessonId);
  if (!l) return false;
  if (p.settings.freeRoam) return true;
  if (!isUnitUnlocked(l.unit, p)) return false;
  if (l.index === 0) return true;
  return !!p.lessons[l.unit.lessons[l.index - 1].id] || !!p.lessons[l.id];
}

export function isGameUnlocked(g: GameDef, p: P): boolean {
  if (p.settings.freeRoam) return true;
  return !!p.lessons[g.unlockAfter];
}

/** The next lesson the learner should do. */
export function nextLesson(p: P) {
  for (const l of ALL_LESSONS) if (!p.lessons[l.id] && isLessonUnlocked(l.id, p)) return l;
  return undefined;
}
