/** Pure logic for the Bomb Tester game (testable without React). */

export const PRIOR_LIVE = 0.6;
export const SHIFT_SIZE = 10;
export const BUDGET = 100;

export const PTS = {
  certified: 100, // live bomb certified without exploding
  dudFound: 30, // dud identified
  boom: -80, // explosion
  shipLiveLucky: 40, // shipped as live without certification, and it was live
  shipDud: -60, // shipped a dud
  scrapDud: 30, // scrapped a dud
  scrapLive: -40, // scrapped a good bomb
} as const;

/** Elitzur–Vaidman (50/50 splitters) single-shot outcome probabilities. */
export function evProbs(live: boolean) {
  return live ? { boom: 0.5, dark: 0.25, bright: 0.25 } : { boom: 0, dark: 0, bright: 1 };
}

export function sampleEV(live: boolean, rng: () => number): 'boom' | 'dark' | 'bright' {
  if (!live) return 'bright';
  const u = rng();
  return u < 0.5 ? 'boom' : u < 0.75 ? 'dark' : 'bright';
}

/** Probability that a live bomb survives N Zeno cycles of rotation π/(2N): cos^{2N}(π/2N). */
export function zenoSurvive(N: number): number {
  return Math.cos(Math.PI / (2 * N)) ** (2 * N);
}

/** For a live bomb: index of the cycle (0-based) at which the photon is found in the bomb arm, or null if it survives. */
export function sampleZeno(live: boolean, N: number, rng: () => number): number | null {
  if (!live) return null;
  const pStay = Math.cos(Math.PI / (2 * N)) ** 2;
  for (let k = 0; k < N; k++) if (rng() >= pStay) return k;
  return null;
}

/** Posterior P(live) after k inconclusive (bright) EV shots with no explosion. */
export function posteriorLive(k: number, prior = PRIOR_LIVE): number {
  const a = prior * 0.25 ** k;
  return a / (a + (1 - prior));
}

export function makeShift(rng: () => number, n = SHIFT_SIZE): boolean[] {
  for (;;) {
    const s = Array.from({ length: n }, () => rng() < PRIOR_LIVE);
    const live = s.filter(Boolean).length;
    if (live >= 4 && live <= 8) return s;
  }
}

export const maxScore = (shift: boolean[]) => shift.reduce((a, live) => a + (live ? PTS.certified : PTS.dudFound), 0);
