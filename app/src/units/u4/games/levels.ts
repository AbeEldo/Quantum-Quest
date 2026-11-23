import type { V3 } from '../widgets/spin';

export type PhaseMode = 'x' | 'xy' | 'free';

export interface Probe {
  start: V3;
  target: V3;
  /** Extra detuning felt only by this probe (inhomogeneous ensemble). */
  detune?: number;
}

export interface PulseLevel {
  id: string;
  name: string;
  /** Rich text shown at the top of the level. */
  brief: string;
  probes: Probe[];
  /** Single-probe levels: visit these in order (the probe's own target is ignored). */
  waypoints?: V3[];
  phases: PhaseMode;
  /** Can the player choose the detuning? */
  detuning: boolean;
  /** Detuning the player cannot change (known). */
  fixedDetuning?: number;
  /** Hidden extra detuning (drift): applied to the real evolution, not to the preview. */
  hiddenDrift?: boolean;
  maxOmega: number;
  maxPulses: number;
  par: number;
  threshold: number;
  /** Minimum total elapsed time (for memory/echo levels). */
  minTime?: number;
  hint: string;
  /** Rich text explanation shown after solving. */
  physics: string;
}

export const Z0: V3 = [0, 0, 1];
export const Z1: V3 = [0, 0, -1];
export const XP: V3 = [1, 0, 0];
export const XM: V3 = [-1, 0, 0];
export const YP: V3 = [0, 1, 0];
export const YM: V3 = [0, -1, 0];

export const ECHO_DETUNINGS = [-0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6];

export const LEVELS: PulseLevel[] = [
  {
    id: 'flip',
    name: 'First Flip',
    brief: 'Your qubit sits in $|0\\rangle$. Flip it to $|1\\rangle$ with a single resonant pulse.',
    probes: [{ start: Z0, target: Z1 }],
    phases: 'x',
    detuning: false,
    maxOmega: 1,
    maxPulses: 4,
    par: 1,
    threshold: 0.99,
    hint: 'On resonance the state rotates about the drive axis at rate $\\Omega$. A half turn ($\\pi$) takes time $\\pi/\\Omega$.',
    physics:
      'A **π pulse**: rotation angle $\\Omega t = \\pi$. This is the $X$ gate of quantum computing. On real superconducting qubits it is a shaped microwave burst lasting a few tens of nanoseconds.',
  },
  {
    id: 'half',
    name: 'Halfway There',
    brief: 'Put the qubit on the equator at $|{-i}\\rangle$ (the $-y$ point).',
    probes: [{ start: Z0, target: YM }],
    phases: 'x',
    detuning: false,
    maxOmega: 1,
    maxPulses: 4,
    par: 1,
    threshold: 0.99,
    hint: 'A rotation about $+x$ swings the north pole down through $-y$ first (right-hand rule).',
    physics:
      'A **π/2 pulse** makes an equal superposition: $R_x(\\pi/2)|0\\rangle = \\frac{1}{\\sqrt2}(|0\\rangle - i|1\\rangle)$. The $-i$ is why it lands at $-y$ and not $+x$.',
  },
  {
    id: 'phase',
    name: 'Pick a Phase',
    brief: 'Now reach $|+\\rangle$. You can choose the **phase** of the drive, which turns the rotation axis around the equator.',
    probes: [{ start: Z0, target: XP }],
    phases: 'xy',
    detuning: false,
    maxOmega: 1,
    maxPulses: 4,
    par: 1,
    threshold: 0.99,
    hint: 'Which axis do you need to rotate about so that $+z$ swings onto $+x$? Use the right-hand rule.',
    physics:
      'Shifting the microwave phase by $90°$ turns an $x$ rotation into a $y$ rotation. Hardware does this with **IQ mixing**: two copies of the carrier, 90° apart, with independently shaped envelopes.',
  },
  {
    id: 'tour',
    name: 'Grand Tour',
    brief: 'Visit three checkpoints **in order**: $|+\\rangle$, then $|-\\rangle$, then $|1\\rangle$.',
    probes: [{ start: Z0, target: Z1 }],
    waypoints: [XP, XM, Z1],
    phases: 'xy',
    detuning: false,
    maxOmega: 1,
    maxPulses: 6,
    par: 3,
    threshold: 0.99,
    hint: 'Every leg is a rotation about $\\pm x$ or $\\pm y$. For $|+\\rangle\\to|-\\rangle$ pick an axis perpendicular to both.',
    physics:
      'Any path on the sphere can be built from rotations about two perpendicular axes, an idea known as the **Euler decomposition** $R_z R_y R_z$. A compiler turns every single-qubit gate into a short pulse sequence this way.',
  },
  {
    id: 'locked',
    name: 'Phase-Locked',
    brief: 'Your drive is stuck at phase $x$. Reach $|+\\rangle$ anyway, using the **detuning** and/or free evolution (set $\\Omega = 0$ to just wait).',
    probes: [{ start: Z0, target: XP }],
    phases: 'x',
    detuning: true,
    maxOmega: 1,
    maxPulses: 5,
    par: 1,
    threshold: 0.99,
    hint: 'Two pulses work: $R_x(\\pi/2)$, then wait with $\\Delta \\neq 0$ to precess about $z$. **One** pulse works too: if $\\Omega = \\Delta$ the axis tilts to $45°$, halfway between $z$ and $x$.',
    physics:
      'With $\\Omega = 0$ the rotating-frame Hamiltonian is $\\frac{\\Delta}{2}\\sigma_z$: the qubit precesses about $z$. Real devices do $Z$ rotations "virtually" by shifting the phase of later pulses (McKay *et al.*, 2017). Tilting the axis with $\\Omega = \\Delta$ gives a rotation about $(\\hat x+\\hat z)/\\sqrt2$, which is a Hadamard.',
  },
  {
    id: 'offkey',
    name: 'Off Key',
    brief: 'Your drive is mistuned by $\\Delta = 0.5$ and you can\'t fix it. A single pulse can never fully flip the qubit. Reach $|1\\rangle$ anyway.',
    probes: [{ start: Z0, target: Z1 }],
    phases: 'xy',
    detuning: false,
    fixedDetuning: 0.5,
    maxOmega: 1,
    maxPulses: 6,
    par: 2,
    threshold: 0.99,
    hint: 'The first pulse can take you at most to $z = -0.6$. Stop partway and change the phase. Watch the orange preview arc: you want it to pass through the south pole.',
    physics:
      'Off resonance the axis tilts out of the equator, so one pulse reaches at most $P(1) = \\Omega^2/(\\Omega^2+\\Delta^2) = 0.8$. Chaining pulses with different phases (**composite pulses**) gets around this. NMR spectroscopists developed composite pulses from the late 1970s on (Levitt & Freeman), and they are still used to make gates robust against calibration errors.',
  },
  {
    id: 'hadamard',
    name: 'Hadamard Forge',
    brief: 'Build a **gate**, not just a state: send $|0\\rangle\\to|+\\rangle$ **and** $|+\\rangle\\to|0\\rangle$ with the same pulse sequence.',
    probes: [
      { start: Z0, target: XP },
      { start: XP, target: Z0 },
    ],
    phases: 'xy',
    detuning: true,
    maxOmega: 1,
    maxPulses: 5,
    par: 1,
    threshold: 0.99,
    hint: 'The Hadamard is a half turn about the axis halfway between $x$ and $z$. A detuned pulse with $\\Omega = \\Delta$ has exactly that axis (rate $\\sqrt2\\,\\Omega$).',
    physics:
      'Fixing where two non-parallel vectors go determines the whole rotation, so this is really the full $H$ gate (up to global phase). Two-pulse version: $R_y(\\pi/2)$ followed by $R_x(\\pi)$.',
  },
  {
    id: 'echo',
    name: 'Echo Chamber',
    brief:
      'Seven spins with slightly different frequencies ($\\delta = -0.6 \\dots 0.6$) start together at $|+\\rangle$. **Store** them for at least $t = 8$, then bring them all back to $|+\\rangle$. Just waiting lets them fan out.',
    probes: [-0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6].map((d) => ({ start: XP, target: XP, detune: d })),
    phases: 'xy',
    detuning: false,
    maxOmega: 2,
    maxPulses: 5,
    par: 3,
    threshold: 0.95,
    minTime: 8,
    hint: 'Wait half the time, then flip the fan over with a strong $\\pi$ pulse about $x$, then wait the other half. Spins that were ahead are now behind.',
    physics:
      'This is Erwin **Hahn\'s spin echo** (1950). The π pulse reverses the accumulated phases, so the slow spins catch up exactly as the fast ones get ahead. Echoes cancel *static* frequency spread. Superconducting and trapped-ion qubits use echo sequences (e.g. CPMG, XY-4) to extend coherence, which is why $T_2^{\\text{echo}}$ is longer than $T_2^*$.',
  },
  {
    id: 'drift',
    name: 'Drifted Qubit',
    brief:
      'Your qubit\'s frequency has **drifted** by an unknown amount, so all your pulses are detuned. The orange preview assumes no drift and is now *wrong*. Measure the drift, then cancel it and land on $|1\\rangle$.',
    probes: [{ start: Z0, target: Z1 }],
    phases: 'xy',
    detuning: true,
    hiddenDrift: true,
    maxOmega: 1,
    maxPulses: 8,
    par: 4,
    threshold: 0.98,
    hint: 'Do a $\\pi/2$ pulse to reach the equator, then wait ($\\Omega = 0$) for a known time $t$. The extra azimuth you pick up equals drift $\\times\\ t$. Undo, set $\\Delta = -\\text{drift}$, and flip.',
    physics:
      'You just ran a **Ramsey experiment** (Norman Ramsey, 1949–50): π/2, free precession, read the phase. Labs recalibrate qubit frequencies this way many times a day. Atomic clocks use the same idea.',
  },
];
