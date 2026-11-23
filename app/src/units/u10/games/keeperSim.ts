/** Physics of the Coherence Keeper game: an ensemble of noise realisations of one qubit under dephasing, T1 and π pulses. */
import { mulberry32 } from '../../../engine/qsim';
import { gauss } from '../widgets/anim';

export type Vec3 = [number, number, number];

export interface Level {
  name: string;
  blurb: string;
  T: number; // µs
  sigmaStatic: number; // rad/µs
  sigmaDrift: number; // rad/µs (stationary std of an Ornstein–Uhlenbeck drift)
  tauC: number; // µs correlation time of the drift
  T2fast: number; // µs, white-noise dephasing (Infinity = none)
  T1: number; // µs (Infinity = none)
  pulseErr: number; // random rotation-angle error (rad, std)
  pulseLoss: number; // contraction per pulse (0..1)
  stars: [number, number, number]; // fidelity thresholds
  lesson: string;
}

export interface Sim {
  t: number;
  v: Vec3[];
  stat: number[];
  drift: number[];
  pulses: number[];
  trace: [number, number][];
  done: boolean;
  flash: number;
  queue: number[];
  rng: () => number;
}

export function newSim(lv: Level, n: number, seed: number, queue: number[] = []): Sim {
  const rng = mulberry32(1000 + seed);
  return {
    t: 0,
    v: Array.from({ length: n }, () => [1, 0, 0] as Vec3),
    stat: Array.from({ length: n }, () => gauss(rng) * lv.sigmaStatic),
    drift: Array.from({ length: n }, () => gauss(rng) * lv.sigmaDrift),
    pulses: [],
    trace: [[0, 1]],
    done: false,
    flash: 0,
    queue: [...queue].sort((a, b) => a - b),
    rng,
  };
}

/** π rotation about x with a random angle error and a small contraction. */
export function applyPulse(s: Sim, lv: Level) {
  s.pulses.push(s.t);
  s.flash = 1;
  const k = 1 - lv.pulseLoss;
  s.v = s.v.map((v) => {
    const a = Math.PI + gauss(s.rng) * lv.pulseErr;
    const c = Math.cos(a), sn = Math.sin(a);
    return [v[0] * k, (v[1] * c - v[2] * sn) * k, (v[1] * sn + v[2] * c) * k] as Vec3;
  });
}

export const fidelity = (s: Sim) => (1 + s.v.reduce((a, v) => a + v[0], 0) / s.v.length) / 2;

/** Advance by sdt µs (in a few sub-steps), firing queued pulses on time. */
export function step(s: Sim, lv: Level, sdt: number, nsub = 4) {
  for (let k = 0; k < nsub; k++) {
    let h2 = sdt / nsub;
    while (s.queue.length && s.queue[0] <= s.t + h2) {
      const tp = s.queue.shift()!;
      const pre = Math.max(0, tp - s.t);
      if (pre > 0) evolve(s, lv, pre);
      h2 -= pre;
      applyPulse(s, lv);
    }
    evolve(s, lv, h2);
  }
}

function evolve(s: Sim, lv: Level, h: number) {
  if (h <= 0) return;
  const decay = Math.exp(-h / lv.tauC);
  const kick = Math.sqrt(lv.sigmaDrift * lv.sigmaDrift * (1 - decay * decay));
  const fast = isFinite(lv.T2fast) ? Math.sqrt((2 * h) / lv.T2fast) : 0;
  const t1xy = isFinite(lv.T1) ? Math.exp(-h / (2 * lv.T1)) : 1;
  const t1z = isFinite(lv.T1) ? 1 - Math.exp(-h / lv.T1) : 0;
  for (let i = 0; i < s.v.length; i++) {
    // midpoint drift for accuracy
    const d0 = s.drift[i];
    if (lv.sigmaDrift > 0) s.drift[i] = d0 * decay + kick * gauss(s.rng);
    const a = (s.stat[i] + 0.5 * (d0 + s.drift[i])) * h + (fast ? fast * gauss(s.rng) : 0);
    const c = Math.cos(a), sn = Math.sin(a);
    const v = s.v[i];
    s.v[i] = [(v[0] * c - v[1] * sn) * t1xy, (v[0] * sn + v[1] * c) * t1xy, v[2] + (1 - v[2]) * t1z];
  }
  s.t += h;
}

/** Run a whole pre-programmed sequence (pulse times as fractions of T); returns the final fidelity. */
export function runProgram(lv: Level, fractions: number[], seed: number, n = 400): number {
  const s = newSim(lv, n, seed, fractions.map((f) => f * lv.T));
  while (s.t < lv.T - 1e-9) step(s, lv, Math.min(0.05, lv.T - s.t), 1);
  return fidelity(s);
}

export const LEVELS: Level[] = [
  {
    name: '1 · Static fog',
    blurb: 'Every run, the qubit frequency is off by an unknown but constant amount.',
    T: 10, sigmaStatic: 1.0, sigmaDrift: 0, tauC: 1, T2fast: Infinity, T1: Infinity, pulseErr: 0, pulseLoss: 0,
    stars: [0.85, 0.93, 0.98],
    lesson: 'Static offsets are perfectly reversible. A single π pulse at exactly T/2 (a Hahn echo) refocuses every spin at the end, whatever its offset. A timing error δt leaves a residual phase 2δ·δt.',
  },
  {
    name: '2 · Drifting field',
    blurb: 'Now the frequency wanders during the run (correlation time ≈ 3 µs).',
    T: 10, sigmaStatic: 0.3, sigmaDrift: 0.7, tauC: 3, T2fast: Infinity, T1: Infinity, pulseErr: 0, pulseLoss: 0,
    stars: [0.75, 0.88, 0.95],
    lesson: 'A single echo only cancels noise that stays put for the whole run. Faster noise needs faster refocusing. Evenly spaced pulses (CPMG) with spacing well below the correlation time act as a high-pass filter, so the slow wander cancels.',
  },
  {
    name: '3 · Imperfect pulses',
    blurb: 'Drift again, but every π pulse is slightly wrong and costs ~2% of coherence.',
    T: 10, sigmaStatic: 0.3, sigmaDrift: 0.7, tauC: 3, T2fast: Infinity, T1: Infinity, pulseErr: 0.15, pulseLoss: 0.02,
    stars: [0.7, 0.78, 0.83],
    lesson: 'More pulses filter more noise, but each one adds its own error. The best sequence balances the two. On real hardware this tradeoff, plus pulse-robust designs like XY4, decides which decoupling sequence a compiler inserts into idle qubits.',
  },
  {
    name: '4 · The T₁ wall',
    blurb: 'Static offsets plus energy relaxation (T₁ = 25 µs) and a little fast noise.',
    T: 10, sigmaStatic: 1.0, sigmaDrift: 0.2, tauC: 3, T2fast: 60, T1: 25, pulseErr: 0.04, pulseLoss: 0.005,
    stars: [0.65, 0.75, 0.81],
    lesson: 'No pulse sequence can undo energy relaxation or truly fast noise. Your best score is capped near ½(1 + e^(−T/2T₁)·e^(−T/T₂)). Beyond this wall you need a different idea: error correction.',
  },
  {
    name: '5 · Boss: the storm',
    blurb: 'Everything at once, for longer (16 µs): big static offsets, drift, imperfect pulses, T₁, fast noise.',
    T: 16, sigmaStatic: 1.4, sigmaDrift: 0.55, tauC: 3, T2fast: 120, T1: 80, pulseErr: 0.08, pulseLoss: 0.008,
    stars: [0.6, 0.7, 0.77],
    lesson: 'Real qubits face all of these at once. Dynamical decoupling buys a lot, but the ceiling set by T₁ and fast noise remains. That ceiling is exactly why the field moved on to quantum error correction.',
  },
];

export const PROGRAMS: { id: string; label: string; times: () => number[] }[] = [
  { id: 'none', label: 'No pulses', times: () => [] },
  { id: 'hahn', label: 'Hahn echo (1 pulse)', times: () => [0.5] },
  { id: 'cpmg2', label: 'CPMG-2', times: () => [0.25, 0.75] },
  { id: 'cpmg4', label: 'CPMG-4', times: () => [1, 2, 3, 4].map((k) => (k - 0.5) / 4) },
  { id: 'cpmg8', label: 'CPMG-8', times: () => Array.from({ length: 8 }, (_, k) => (k + 0.5) / 8) },
  { id: 'cpmg16', label: 'CPMG-16', times: () => Array.from({ length: 16 }, (_, k) => (k + 0.5) / 16) },
  { id: 'cpmg32', label: 'CPMG-32', times: () => Array.from({ length: 32 }, (_, k) => (k + 0.5) / 32) },
  { id: 'udd4', label: 'UDD-4', times: () => [1, 2, 3, 4].map((k) => Math.sin((Math.PI * k) / 10) ** 2) },
  { id: 'udd8', label: 'UDD-8', times: () => Array.from({ length: 8 }, (_, k) => Math.sin((Math.PI * (k + 1)) / 18) ** 2) },
];
