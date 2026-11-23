import type { ComponentType } from 'react';

/** A "Go deeper" reference attached to a lesson. */
export interface Source {
  title: string;
  /** e.g. "3Blue1Brown", "Nielsen & Chuang §1.2", "Veritasium" */
  by?: string;
  url?: string;
  kind: 'video' | 'book' | 'paper' | 'article' | 'course' | 'interactive';
  note?: string;
}

/** Spaced-repetition flashcard. front/back accept $inline$ and $$display$$ math and **bold**. */
export interface Flashcard {
  id: string;
  front: string;
  back: string;
}

export interface LessonDef {
  /** Globally unique, e.g. "u3-l4" */
  id: string;
  title: string;
  subtitle?: string;
  minutes: number;
  /** XP for completing the lesson (default 100). Quizzes inside award extra. */
  xp?: number;
  /** Lazy-loaded MDX module. */
  load: () => Promise<{ default: ComponentType<any> }>;
  cards?: Flashcard[];
  sources?: Source[];
}

export interface GameDef {
  /** Globally unique, e.g. "chsh-tournament" */
  id: string;
  title: string;
  description: string;
  /** Single emoji or short symbol shown on the map. */
  icon: string;
  /** Lesson id after which the game unlocks. */
  unlockAfter: string;
  /** XP the first time the game is "completed" (beaten). */
  xp: number;
  load: () => Promise<{ default: ComponentType<any> }>;
  /** Is this a sandbox (no win condition)? */
  sandbox?: boolean;
}

export type BossQuestion =
  | {
      type: 'mc';
      prompt: string;
      options: string[];
      answer: number;
      explain: string;
    }
  | {
      type: 'numeric';
      prompt: string;
      answer: number;
      tolerance: number;
      unit?: string;
      explain: string;
    }
  | {
      /** Build a circuit producing the target state (up to global phase). */
      type: 'circuit';
      prompt: string;
      n: number;
      /** Target amplitudes, length 2^n, as [re, im] pairs. */
      target: [number, number][];
      gates: string[];
      maxGates?: number;
      explain: string;
    };

export interface BossDef {
  id: string;
  name: string;
  /** Short villain flavour text. */
  taunt: string;
  /** Emoji / symbol for the boss avatar. */
  avatar: string;
  /** Hit points = number of correct answers required. */
  hp: number;
  hearts: number;
  xp: number;
  questions: BossQuestion[];
}

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: string;
  /** Hidden until earned. */
  secret?: boolean;
  xp?: number;
}

export interface UnitDef {
  id: string;
  number: number;
  title: string;
  tagline: string;
  /** Accent colour for this unit. */
  color: string;
  icon: string;
  lessons: LessonDef[];
  games: GameDef[];
  boss?: BossDef;
  achievements?: AchievementDef[];
}

/** Circuit puzzle (Puzzles page). Stars: 3 if gates ≤ par, 2 if ≤ par + 2, else 1. */
export interface PuzzleDef {
  id: string;
  /** Chapter heading the puzzle is grouped under, e.g. "1 · Single-qubit warm-ups". */
  chapter: string;
  title: string;
  /** Rich text ($math$, **bold**) describing the task. */
  description: string;
  n: number;
  /** Gate palette, e.g. ['H','X','CNOT']. Names: I X Y Z H S Sdg T Tdg SX Rx Ry Rz P CNOT CZ SWAP CCX CP M */
  gates: string[];
  /** Target: a state (amplitudes as [re, im], length 2^n, up to global phase) or a unitary given by a reference circuit. */
  goal: { kind: 'state'; amps: [number, number][] } | { kind: 'unitary'; circuit: string };
  /** Optional input state (default |0…0⟩). */
  initialState?: [number, number][];
  par: number;
  maxGates?: number;
  hint?: string;
  /** Shown after solving: why the solution works. */
  explain?: string;
}
