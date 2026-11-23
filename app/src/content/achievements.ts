import type { AchievementDef } from './types';

/** App-wide achievements (unit-specific ones live in each unit's index.ts). */
export const CORE_ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-lesson', title: 'First Quantum Leap', description: 'Complete your first lesson.', icon: '🚀', xp: 25 },
  { id: 'ten-lessons', title: 'Superposition of Knowledge', description: 'Complete 10 lessons.', icon: '📚', xp: 100 },
  { id: 'twentyfive-lessons', title: 'Coherent Learner', description: 'Complete 25 lessons.', icon: '🎓', xp: 250 },
  { id: 'xp-1000', title: 'Kilo-XP', description: 'Earn 1,000 XP.', icon: '🔋' },
  { id: 'xp-5000', title: 'Excited State', description: 'Earn 5,000 XP.', icon: '⚡' },
  { id: 'xp-10000', title: 'Population Inversion', description: 'Earn 10,000 XP.', icon: '🌟' },
  { id: 'surprised-5', title: 'Nature Is Weird', description: 'Have 5 predictions overturned by experiment. Feynman would approve.', icon: '😮', xp: 50 },
  { id: 'oracle-15', title: 'Quantum Intuition', description: 'Make 15 correct predictions.', icon: '🔮', xp: 100 },
  { id: 'gamer-5', title: 'Player One', description: 'Beat 5 different games.', icon: '🕹️', xp: 100 },
  { id: 'first-puzzle', title: 'Gate Crasher', description: 'Solve your first circuit puzzle.', icon: '🧩', xp: 25 },
  { id: 'three-star-10', title: 'Optimal Compiler', description: 'Earn 3 stars on 10 circuit puzzles.', icon: '⭐', xp: 150 },
  { id: 'first-boss', title: 'Boss Slayer', description: 'Defeat your first unit boss.', icon: '⚔️', xp: 50 },
  { id: 'boss-6', title: 'Champion of the Hilbert Space', description: 'Defeat 6 unit bosses.', icon: '🏆', xp: 200 },
  { id: 'memory-20', title: 'Long-Term Coherence', description: 'Get 20 flashcards to a 3-week interval.', icon: '🧠', xp: 150 },
  { id: 'streak-3', title: 'Warming Up', description: 'Study 3 days in a row.', icon: '🔥', xp: 30 },
  { id: 'streak-7', title: 'Week of Wonder', description: 'Study 7 days in a row.', icon: '🔥', xp: 100 },
  { id: 'flawless', title: 'Flawless Victory', description: 'Defeat a boss without losing a heart.', icon: '💎', xp: 75 },
  { id: 'night-owl', title: 'Night Owl', description: 'Complete a lesson after midnight.', icon: '🦉', secret: true, xp: 20 },
  { id: 'free-roam', title: 'Many-Worlds Explorer', description: 'Turn on free-roam mode.', icon: '🌌', secret: true },
];
