import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { toast } from './toasts';

export interface CardState {
  due: number; // epoch ms
  interval: number; // days
  ease: number;
  reps: number;
  lapses: number;
}

export interface GameRecord {
  plays: number;
  best: number;
  completed: boolean;
  /** free-form per-game data (e.g. levels beaten) */
  data?: Record<string, unknown>;
}

export interface ProgressState {
  xp: number;
  lessons: Record<string, { completedAt: number }>;
  lessonStep: Record<string, number>;
  quizzes: Record<string, { correct: boolean; attempts: number }>;
  predictions: Record<string, { correct: boolean }>;
  games: Record<string, GameRecord>;
  puzzles: Record<string, { stars: number; gates: number }>;
  bosses: Record<string, { defeated: boolean; attempts: number; bestHearts?: number }>;
  achievements: Record<string, number>;
  cards: Record<string, CardState>;
  streak: { last: string; count: number; best: number };
  journal: { id: string; text: string; time: number }[];
  settings: { freeRoam: boolean; reducedMotion: boolean; sound: boolean };
  xpLog: { day: string; xp: number }[];

  addXp: (amount: number, reason?: string) => void;
  completeLesson: (id: string, xp: number, cardIds: string[]) => boolean;
  setLessonStep: (id: string, step: number) => void;
  recordQuiz: (id: string, correct: boolean, xp?: number) => void;
  recordPrediction: (id: string, correct: boolean, note?: string) => void;
  recordGame: (id: string, score: number, completed: boolean, xpOnComplete: number, data?: Record<string, unknown>) => void;
  recordPuzzle: (id: string, stars: number, gates: number, xpPerStar?: number) => void;
  recordBoss: (id: string, defeated: boolean, hearts: number, xp: number) => void;
  unlock: (id: string) => void;
  reviewCard: (id: string, grade: 0 | 1 | 2 | 3) => void;
  addCards: (ids: string[]) => void;
  touchStreak: () => void;
  setSetting: <K extends keyof ProgressState['settings']>(k: K, v: ProgressState['settings'][K]) => void;
  reset: () => void;
}

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const DAY = 86400000;

const initial = {
  xp: 0,
  lessons: {},
  lessonStep: {},
  quizzes: {},
  predictions: {},
  games: {},
  puzzles: {},
  bosses: {},
  achievements: {},
  cards: {},
  streak: { last: '', count: 0, best: 0 },
  journal: [],
  settings: { freeRoam: false, reducedMotion: false, sound: true },
  xpLog: [],
};

/** Achievement metadata lookup is injected by the curriculum module to avoid import cycles. */
let achievementLookup: (id: string) => { title: string; icon: string; xp?: number } | undefined = () => undefined;
export function setAchievementLookup(fn: typeof achievementLookup) {
  achievementLookup = fn;
}

export const useProgress = create<ProgressState>()(
  persist(
    (set, get) => ({
      ...initial,

      addXp: (amount, reason) => {
        if (amount <= 0) return;
        const before = get().xp;
        const d = today();
        set((s) => {
          const log = [...s.xpLog];
          const last = log[log.length - 1];
          if (last && last.day === d) log[log.length - 1] = { day: d, xp: last.xp + amount };
          else log.push({ day: d, xp: amount });
          return { xp: s.xp + amount, xpLog: log.slice(-60) };
        });
        toast.xp(amount, reason);
        const r0 = rankFor(before), r1 = rankFor(before + amount);
        if (r1.index > r0.index) toast.rank(r1.title, r1.icon);
        get().touchStreak();
        const x = get().xp;
        if (x >= 1000) get().unlock('xp-1000');
        if (x >= 5000) get().unlock('xp-5000');
        if (x >= 10000) get().unlock('xp-10000');
      },

      completeLesson: (id, xp, cardIds) => {
        if (get().lessons[id]) return false;
        set((s) => ({ lessons: { ...s.lessons, [id]: { completedAt: Date.now() } } }));
        get().addXp(xp, 'Lesson complete');
        get().addCards(cardIds);
        const n = Object.keys(get().lessons).length;
        if (n >= 1) get().unlock('first-lesson');
        if (n >= 10) get().unlock('ten-lessons');
        if (n >= 25) get().unlock('twentyfive-lessons');
        return true;
      },

      setLessonStep: (id, step) => set((s) => ({ lessonStep: { ...s.lessonStep, [id]: step } })),

      recordQuiz: (id, correct, xp = 15) => {
        const prev = get().quizzes[id];
        const attempts = (prev?.attempts ?? 0) + 1;
        const firstSolve = correct && !prev?.correct;
        set((s) => ({ quizzes: { ...s.quizzes, [id]: { correct: correct || !!prev?.correct, attempts } } }));
        if (firstSolve) get().addXp(attempts === 1 ? xp : Math.round(xp / 2), attempts === 1 ? 'Correct!' : 'Got it');
      },

      recordPrediction: (id, correct, note) => {
        if (get().predictions[id]) return;
        set((s) => ({ predictions: { ...s.predictions, [id]: { correct } } }));
        get().addXp(correct ? 10 : 5, correct ? 'Good prediction' : 'Prediction logged');
        if (!correct && note) set((s) => ({ journal: [{ id, text: note, time: Date.now() }, ...s.journal].slice(0, 200) }));
        const preds = Object.values(get().predictions);
        if (preds.filter((p) => !p.correct).length >= 5) get().unlock('surprised-5');
        if (preds.filter((p) => p.correct).length >= 15) get().unlock('oracle-15');
      },

      recordGame: (id, score, completed, xpOnComplete, data) => {
        const prev = get().games[id];
        const first = completed && !prev?.completed;
        set((s) => ({
          games: {
            ...s.games,
            [id]: {
              plays: (prev?.plays ?? 0) + 1,
              best: Math.max(prev?.best ?? -Infinity, score),
              completed: completed || !!prev?.completed,
              data: { ...(prev?.data ?? {}), ...(data ?? {}) },
            },
          },
        }));
        if (first) get().addXp(xpOnComplete, 'Game beaten!');
        if (Object.values(get().games).filter((g) => g.completed).length >= 5) get().unlock('gamer-5');
      },

      recordPuzzle: (id, stars, gates, xpPerStar = 20) => {
        const prev = get().puzzles[id];
        const prevStars = prev?.stars ?? 0;
        if (stars > prevStars || !prev)
          set((s) => ({ puzzles: { ...s.puzzles, [id]: { stars: Math.max(stars, prevStars), gates: Math.min(gates, prev?.gates ?? Infinity) } } }));
        if (stars > prevStars) get().addXp((stars - prevStars) * xpPerStar, `${'★'.repeat(stars)} puzzle`);
        const ps = Object.values(get().puzzles);
        if (ps.length >= 1) get().unlock('first-puzzle');
        if (ps.filter((p) => p.stars === 3).length >= 10) get().unlock('three-star-10');
      },

      recordBoss: (id, defeated, hearts, xp) => {
        const prev = get().bosses[id];
        const first = defeated && !prev?.defeated;
        set((s) => ({
          bosses: {
            ...s.bosses,
            [id]: {
              defeated: defeated || !!prev?.defeated,
              attempts: (prev?.attempts ?? 0) + 1,
              bestHearts: defeated ? Math.max(hearts, prev?.bestHearts ?? 0) : prev?.bestHearts,
            },
          },
        }));
        if (first) {
          get().addXp(xp, 'Boss defeated!');
          get().unlock('first-boss');
          if (Object.values(get().bosses).filter((b) => b.defeated).length >= 6) get().unlock('boss-6');
        }
      },

      unlock: (id) => {
        if (get().achievements[id]) return;
        const meta = achievementLookup(id);
        if (!meta) return;
        set((s) => ({ achievements: { ...s.achievements, [id]: Date.now() } }));
        toast.achievement(meta.title, meta.icon);
        if (meta.xp) setTimeout(() => get().addXp(meta.xp!, 'Achievement'), 400);
      },

      addCards: (ids) => {
        const now = Date.now();
        set((s) => {
          const cards = { ...s.cards };
          for (const id of ids) if (!cards[id]) cards[id] = { due: now, interval: 0, ease: 2.5, reps: 0, lapses: 0 };
          return { cards };
        });
      },

      /** SM-2 style scheduling. grade: 0 again, 1 hard, 2 good, 3 easy */
      reviewCard: (id, grade) => {
        const c = get().cards[id];
        if (!c) return;
        let { interval, ease, reps, lapses } = c;
        if (grade === 0) {
          reps = 0;
          lapses++;
          interval = 0;
          ease = Math.max(1.3, ease - 0.2);
        } else {
          reps++;
          if (reps === 1) interval = grade === 3 ? 3 : 1;
          else if (reps === 2) interval = grade === 1 ? 3 : 6;
          else interval = Math.round(interval * (grade === 1 ? 1.2 : grade === 3 ? ease * 1.3 : ease));
          ease = Math.max(1.3, ease + (grade === 1 ? -0.15 : grade === 3 ? 0.15 : 0));
        }
        const due = grade === 0 ? Date.now() + 60_000 : Date.now() + interval * DAY;
        set((s) => ({ cards: { ...s.cards, [id]: { due, interval, ease, reps, lapses } } }));
        if (grade > 0) get().addXp(3, undefined);
        const mature = Object.values(get().cards).filter((x) => x.interval >= 21).length;
        if (mature >= 20) get().unlock('memory-20');
      },

      touchStreak: () => {
        const d = today();
        const st = get().streak;
        if (st.last === d) return;
        const y = new Date(Date.now() - DAY);
        const yd = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
        const count = st.last === yd ? st.count + 1 : 1;
        set({ streak: { last: d, count, best: Math.max(st.best, count) } });
        if (count >= 3) get().unlock('streak-3');
        if (count >= 7) get().unlock('streak-7');
      },

      setSetting: (k, v) => set((s) => ({ settings: { ...s.settings, [k]: v } })),

      reset: () => set({ ...initial }),
    }),
    { name: 'quantum-quest-progress', version: 1 },
  ),
);

export const RANKS = [
  { xp: 0, title: 'Classical Thinker', icon: '🍎' },
  { xp: 400, title: 'Wave Watcher', icon: '🌊' },
  { xp: 1200, title: 'Photon Counter', icon: '💡' },
  { xp: 2500, title: 'Spin Doctor', icon: '🧲' },
  { xp: 4000, title: 'Qubit Wrangler', icon: '🎯' },
  { xp: 6000, title: 'Entanglement Engineer', icon: '🔗' },
  { xp: 8500, title: 'Circuit Sorcerer', icon: '⚡' },
  { xp: 11500, title: 'Algorithm Architect', icon: '🏛️' },
  { xp: 15000, title: 'Error-Correction Expert', icon: '🛡️' },
  { xp: 19000, title: 'Fault-Tolerant Master', icon: '👑' },
];

export function rankFor(xp: number) {
  let index = 0;
  for (let i = 0; i < RANKS.length; i++) if (xp >= RANKS[i].xp) index = i;
  const r = RANKS[index];
  const next = RANKS[index + 1];
  return { ...r, index, next, progress: next ? (xp - r.xp) / (next.xp - r.xp) : 1 };
}
