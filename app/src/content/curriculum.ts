import type { UnitDef, LessonDef, GameDef, AchievementDef, Flashcard, Source } from './types';
import { unit as u0 } from '../units/u0';
import { unit as u1 } from '../units/u1';
import { unit as u2 } from '../units/u2';
import { unit as u3 } from '../units/u3';
import { unit as u4 } from '../units/u4';
import { unit as u5 } from '../units/u5';
import { unit as u6 } from '../units/u6';
import { unit as u7 } from '../units/u7';
import { unit as u8 } from '../units/u8';
import { unit as u9 } from '../units/u9';
import { unit as u10 } from '../units/u10';
import { unit as u11 } from '../units/u11';
import { unit as u12 } from '../units/u12';
import { CORE_ACHIEVEMENTS } from './achievements';
import { setAchievementLookup } from '../state/progress';

export const UNITS: UnitDef[] = [u0, u1, u2, u3, u4, u5, u6, u7, u8, u9, u10, u11, u12];

export const ALL_LESSONS: (LessonDef & { unit: UnitDef; index: number })[] = UNITS.flatMap((u) => u.lessons.map((l, index) => ({ ...l, unit: u, index })));
export const ALL_GAMES: (GameDef & { unit: UnitDef })[] = UNITS.flatMap((u) => u.games.map((g) => ({ ...g, unit: u })));
export const ALL_ACHIEVEMENTS: AchievementDef[] = [...CORE_ACHIEVEMENTS, ...UNITS.flatMap((u) => u.achievements ?? [])];
export const ALL_CARDS: (Flashcard & { lessonId: string; unit: UnitDef })[] = ALL_LESSONS.flatMap((l) => (l.cards ?? []).map((c) => ({ ...c, lessonId: l.id, unit: l.unit })));
export const ALL_SOURCES: (Source & { lessonId: string; lessonTitle: string; unit: UnitDef })[] = ALL_LESSONS.flatMap((l) =>
  (l.sources ?? []).map((s) => ({ ...s, lessonId: l.id, lessonTitle: l.title, unit: l.unit })),
);

const achMap = new Map(ALL_ACHIEVEMENTS.map((a) => [a.id, a]));
setAchievementLookup((id) => achMap.get(id));

export const lessonById = (id: string) => ALL_LESSONS.find((l) => l.id === id);
export const gameById = (id: string) => ALL_GAMES.find((g) => g.id === id);
export const unitById = (id: string) => UNITS.find((u) => u.id === id);
export const cardById = (id: string) => ALL_CARDS.find((c) => c.id === id);
