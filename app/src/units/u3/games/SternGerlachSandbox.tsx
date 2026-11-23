import React, { useMemo, useRef, useState } from 'react';
import { Slider, Toggle, Segmented, Stat, RichText, useAnimationFrame } from '../../../components/ui';
import { useGame, GameOverlay, HowToPlay } from '../../../components/game';
import { mulberry32 } from '../../../engine/qsim';
import {
  exactDistribution,
  simulateAtom,
  detectorsOf,
  detectorIndex,
  type Magnet,
  type Source,
  type Port,
  type V3,
} from './spinEngine';

/* ============================== Level data ============================== */

interface MagnetCfg extends Magnet {
  lockTheta?: boolean;
  lockPass?: boolean;
  /** Cannot be removed. */
  fixed?: boolean;
}

interface Level {
  id: string;
  title: string;
  brief: string;
  source: Source;
  sourceLabel: string;
  magnets: MagnetCfg[];
  maxMagnets: number;
  allowY?: boolean;
  /** Which port of the LAST magnet the learner predicts the count for. */
  predict: Port;
  goalText: string;
  goal: (dist: number[], mags: Magnet[]) => boolean;
  explain: string;
}

const finalP = (dist: number[], mags: Magnet[], port: Port) => dist[detectorIndex(mags, mags.length - 1, port)] ?? 0;

const OVEN: Source = { kind: 'oven' };
const Z_UP: Source = { kind: 'pure', dir: [0, 0, 1] };

const LEVELS: Level[] = [
  {
    id: 'two-spots',
    title: 'Two Spots',
    brief: 'Silver atoms leave a hot oven with their magnetic moments pointing every which way. One magnet, oriented along $z$.',
    source: OVEN,
    sourceLabel: 'Ag oven',
    magnets: [{ theta: 0, pass: '+', lockTheta: true, lockPass: true, fixed: true }],
    maxMagnets: 1,
    predict: '+',
    goalText: 'Predict how many of the 200 atoms land in the **+** spot, then fire the oven.',
    goal: () => true,
    explain:
      'Classically, randomly oriented little magnets would be deflected by every amount in between, painting a continuous smear. Instead every atom lands in one of **two** spots, about half in each. Along any axis, a spin-½ particle has only two possible outcomes, $+\\tfrac{\\hbar}{2}$ or $-\\tfrac{\\hbar}{2}$.',
  },
  {
    id: 'repeatable',
    title: 'Ask Again',
    brief: 'SG 1 keeps only the atoms that went **up** along $z$. SG 2 is yours to orient.',
    source: OVEN,
    sourceLabel: 'Ag oven',
    magnets: [
      { theta: 0, pass: '+', lockTheta: true, lockPass: true, fixed: true },
      { theta: 60, pass: '+', fixed: true },
    ],
    maxMagnets: 2,
    predict: '-',
    goalText: 'Orient SG 2 so that **no atom ever** reaches its **−** port.',
    goal: (d, m) => finalP(d, m, '-') < 0.001,
    explain:
      'Measure $S_z$, get $+$, measure $S_z$ again: you get $+$ every single time. A measurement leaves the atom in the state it reported, $|{\\uparrow}\\rangle$ stays $|{\\uparrow}\\rangle$. Any tilt at all lets some atoms leak into the − port, with probability $\\sin^2(\\theta/2)$.',
  },
  {
    id: 'sideways',
    title: 'Sideways Glance',
    brief: 'Same z-filter first. What does a $z$-up atom do in a magnet turned sideways?',
    source: OVEN,
    sourceLabel: 'Ag oven',
    magnets: [
      { theta: 0, pass: '+', lockTheta: true, lockPass: true, fixed: true },
      { theta: 0, pass: '+', fixed: true },
    ],
    maxMagnets: 2,
    predict: '+',
    goalText: 'Make **exactly 25%** of all oven atoms land in SG 2’s **+** port.',
    goal: (d, m) => Math.abs(finalP(d, m, '+') - 0.25) <= 0.005,
    explain:
      'A $z$-up atom entering an $x$-magnet ($\\theta = 90°$) goes up or down with 50% each: knowing $S_z$ tells you **nothing** about $S_x$. Half the oven passes SG 1, half of those go up in SG 2: $\\tfrac12\\cdot\\tfrac12 = 25\\%$. (θ = −90° works too, since it just swaps the ports.)',
  },
  {
    id: 'memory-eraser',
    title: 'The Memory Eraser',
    brief: 'z-filter, then an $x$-magnet, then $z$ again. Every atom reaching SG 3 passed a “spin-up only” filter…',
    source: OVEN,
    sourceLabel: 'Ag oven',
    magnets: [
      { theta: 0, pass: '+', lockTheta: true, lockPass: true, fixed: true },
      { theta: 90, pass: '+', lockTheta: true, fixed: true },
      { theta: 0, pass: '+', lockTheta: true, fixed: true },
    ],
    maxMagnets: 3,
    predict: '-',
    goalText: 'Predict how many of 200 atoms reach the **final − (spin-down!)** port. You may choose which port of SG 2 continues.',
    goal: () => true,
    explain:
      'The $x$ measurement **erases** the $z$ information. The atoms leaving SG 2 are $|{\\pm x}\\rangle = (|{\\uparrow}\\rangle \\pm |{\\downarrow}\\rangle)/\\sqrt2$, which are 50/50 in $z$ again. So $\\tfrac12\\cdot\\tfrac12\\cdot\\tfrac12 = \\tfrac18$ of the oven, about 25 atoms, come out spin-**down**, even though SG 1 removed every spin-down atom. Measurement is not passive reading of a pre-existing value.',
  },
  {
    id: 'tilt-75',
    title: 'Three Quarters',
    brief: 'Now the beam is already prepared spin-up along $z$ (as if filtered). One tiltable magnet.',
    source: Z_UP,
    sourceLabel: 'z+ beam',
    magnets: [{ theta: 0, pass: '+', fixed: true }],
    maxMagnets: 1,
    predict: '+',
    goalText: 'Tilt the magnet so that **75%** (±1%) of atoms exit its **+** port.',
    goal: (d, m) => Math.abs(finalP(d, m, '+') - 0.75) <= 0.01,
    explain:
      'For a magnet tilted by $\\theta$ from the spin direction, $P(+) = \\cos^2(\\theta/2)$. $\\cos^2(30°) = 3/4$, so $\\theta = 60°$. Notice the **half angle**: tilting by 90° gives 50%, not 0%. You need to turn the magnet a full 180° to make the outcome certain the other way.',
  },
  {
    id: 'one-in-ten',
    title: 'One in Ten',
    brief: 'Same prepared $z$+ beam.',
    source: Z_UP,
    sourceLabel: 'z+ beam',
    magnets: [{ theta: 0, pass: '+', fixed: true }],
    maxMagnets: 1,
    predict: '+',
    goalText: 'Let only **10%** (between 9% and 11%) of atoms out of the **+** port.',
    goal: (d, m) => {
      const p = finalP(d, m, '+');
      return p >= 0.09 && p <= 0.11;
    },
    explain:
      'Solve $\\cos^2(\\theta/2) = 0.1$: $\\theta = 2\\arccos\\sqrt{0.1} \\approx 143°$. A tunable magnet is a tunable **coin**: any bias you like, set by geometry. This is exactly how a qubit measured along a tilted axis behaves.',
  },
  {
    id: 'out-of-plane',
    title: 'Out of Plane',
    brief: 'A **mystery beam**, polarised along some unknown direction. The y-axis switch is now available.',
    source: { kind: 'pure', dir: [0, 1, 0] },
    sourceLabel: 'mystery',
    magnets: [{ theta: 0, pass: '+', fixed: true }],
    maxMagnets: 1,
    allowY: true,
    predict: '+',
    goalText: 'Find an orientation where **every** atom (≥ 99%) exits the **+** port.',
    goal: (d, m) => finalP(d, m, '+') >= 0.99,
    explain:
      'The beam was polarised along $+y$. Every axis in the $x$–$z$ plane is perpendicular to $y$, so all of them gave 50/50, no matter how you tilted. Spin directions live on a **sphere**, not a circle, and in the state vector the third direction shows up as a complex phase: $|{+y}\\rangle = (|{\\uparrow}\\rangle + i|{\\downarrow}\\rangle)/\\sqrt2$. (In a real lab the beam must travel perpendicular to the magnet, so a $y$-analyzer means re-routing the beam line.)',
  },
  {
    id: 'turn-it-over',
    title: 'Turn It Over',
    brief: 'The last magnet points along $-z$, so a $z$+ atom has **zero** chance of leaving its + port directly. Unless…',
    source: Z_UP,
    sourceLabel: 'z+ beam',
    magnets: [{ theta: 180, pass: '+', lockTheta: true, fixed: true }],
    maxMagnets: 4,
    predict: '+',
    goalText: 'Add up to 3 magnets in front so that **at least 50%** of atoms exit the final **+** port.',
    goal: (d, m) => finalP(d, m, '+') >= 0.5,
    explain:
      'Each magnet re-prepares the spin along its own axis, so you can walk the spin around in small steps. Four steps of 45° each keep $\\cos^2(22.5°)^4 \\approx 0.854^4 \\approx 53\\%$; three steps of 60° keep only $0.75^3 \\approx 42\\%$. With $N$ tiny steps you keep $\\cos^{2N}(\\pi/2N) \\to 1$. That is the quantum Zeno trick from World 2, done with magnets.',
  },
  {
    id: 'one-eighth',
    title: 'Exactly One Eighth',
    brief: 'Free build from the oven. Design your own chain.',
    source: OVEN,
    sourceLabel: 'Ag oven',
    magnets: [{ theta: 0, pass: '+' }],
    maxMagnets: 3,
    predict: '+',
    goalText: 'Using **exactly three** magnets, send **12.5%** (±0.3%) of the oven’s atoms to the final **+** port.',
    goal: (d, m) => m.length === 3 && Math.abs(finalP(d, m, '+') - 0.125) <= 0.003,
    explain:
      'The classic recipe is $z, x, z$: $\\tfrac12\\cdot\\tfrac12\\cdot\\tfrac12$. But any chain with $\\tfrac12\\cos^2(\\alpha/2)\\cos^2(\\beta/2) = \\tfrac18$ works, where $\\alpha, \\beta$ are the angles between consecutive magnets. Probabilities simply **multiply** along the chain because each magnet resets the spin to its own axis: the atom keeps no memory of anything earlier.',
  },
];

/* ============================== Geometry ============================== */

type Pt = [number, number];
type Seg = (t: number) => Pt;

const VW = 1000;
const VH = 300;
const Y0 = 150;
const X0 = 122;
const SLOT = 215;
const MW = 88;
const SPEED = 380; // px / s
const GREY = '#c9cfdb';
const COL_UP = '#58c4dd';
const COL_DN = '#e07ab6';

const mx = (i: number) => X0 + i * SLOT;
const sgn = (p: Port) => (p === '+' ? -1 : 1); // svg y-direction of a port

const line = (a: Pt, b: Pt): Seg => (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const cubic = (p0: Pt, p1: Pt, p2: Pt, p3: Pt): Seg => (t) => {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
};
const exitPt = (i: number, p: Port): Pt => [mx(i) + MW, Y0 + sgn(p) * 12];
const insideSeg = (i: number, p: Port): Seg => (t) => [mx(i) + MW * t, Y0 + sgn(p) * 12 * t * t];
const transferSeg = (i: number, p: Port): Seg => {
  const e = exitPt(i, p);
  return cubic(e, [e[0] + 40, e[1] + sgn(p) * 14], [mx(i + 1) - 50, Y0], [mx(i + 1), Y0]);
};
const sideDetPos = (i: number, p: Port): Pt => [mx(i) + MW + 70, Y0 + sgn(p) * 92];
const sideSeg = (i: number, p: Port): Seg => {
  const e = exitPt(i, p);
  const [cx, cy] = sideDetPos(i, p);
  const s = sgn(p);
  return cubic(e, [e[0] + 35, e[1] + s * 25], [cx, cy - s * 50], [cx, cy - s * 20]);
};
const finalDetPos = (i: number, p: Port): Pt => [mx(i) + MW + 98, Y0 + sgn(p) * 62];
const finalSeg = (i: number, p: Port): Seg => {
  const e = exitPt(i, p);
  const [cx, cy] = finalDetPos(i, p);
  return cubic(e, [e[0] + 30, e[1] + sgn(p) * 10], [cx - 70, cy], [cx - 38, cy]);
};
const sourceSeg = line([102, Y0], [X0, Y0]);

const segLen = (s: Seg) => {
  let L = 0;
  let prev = s(0);
  for (let k = 1; k <= 14; k++) {
    const p = s(k / 14);
    L += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    prev = p;
  }
  return L;
};
const segPath = (s: Seg) => {
  const pts: string[] = [];
  for (let k = 0; k <= 24; k++) {
    const p = s(k / 24);
    pts.push(`${k ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`);
  }
  return pts.join(' ');
};

interface Flying {
  segs: Seg[];
  cols: string[];
  cum: number[]; // cumulative lengths
  total: number;
  spawn: number; // seconds after start
  det: number;
  arrived: boolean;
}

function buildFlight(mags: Magnet[], ports: Port[], det: number, spawn: number): Flying {
  const segs: Seg[] = [sourceSeg];
  const cols: string[] = [GREY];
  let col = GREY;
  ports.forEach((p, i) => {
    segs.push(insideSeg(i, p));
    cols.push(col);
    col = p === '+' ? COL_UP : COL_DN;
    if (i === mags.length - 1) segs.push(finalSeg(i, p));
    else if (p === mags[i].pass) segs.push(transferSeg(i, p));
    else segs.push(sideSeg(i, p));
    cols.push(col);
  });
  const cum: number[] = [];
  let tot = 0;
  for (const s of segs) {
    tot += segLen(s);
    cum.push(tot);
  }
  return { segs, cols, cum, total: tot, spawn, det, arrived: false };
}

function flightPos(f: Flying, dist: number): { p: Pt; col: string } {
  let k = 0;
  while (k < f.cum.length - 1 && f.cum[k] < dist) k++;
  const start = k ? f.cum[k - 1] : 0;
  const t = Math.max(0, Math.min(1, (dist - start) / (f.cum[k] - start || 1)));
  return { p: f.segs[k](t), col: f.cols[k] };
}

/* ============================== SVG pieces ============================== */

function MagnetIcon({ m, x, y }: { m: Magnet; x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <circle r={25} fill="#121620" stroke="#2a3142" />
      <line x1={-20} y1={0} x2={20} y2={0} stroke="#3a4256" strokeDasharray="2 3" />
      <line x1={0} y1={-20} x2={0} y2={20} stroke="#3a4256" strokeDasharray="2 3" />
      <text x={21} y={-3} fontSize={8} fill="#6b7385">x</text>
      <text x={3} y={-19} fontSize={8} fill="#6b7385">z</text>
      {m.y ? (
        <g>
          <circle r={9} fill="none" stroke="#fcd34d" strokeWidth={2} />
          <circle r={2.6} fill="#fcd34d" />
          <text x={11} y={13} fontSize={9} fill="#fcd34d">+y</text>
        </g>
      ) : (
        <g transform={`rotate(${m.theta})`} style={{ transition: 'transform .35s cubic-bezier(.2,.8,.2,1)' }}>
          {/* knife-edge north pole */}
          <path d="M-9,-21 L9,-21 L2,-9 L-2,-9 Z" fill="#c4514a" />
          {/* grooved south pole */}
          <path d="M-11,21 L11,21 L11,10 L4,10 L2,14 L-2,14 L-4,10 L-11,10 Z" fill="#4a72c4" />
          <line x1={0} y1={6} x2={0} y2={-6} stroke="#fcd34d" strokeWidth={2} />
          <path d="M-3,-3 L0,-8 L3,-3 Z" fill="#fcd34d" />
        </g>
      )}
    </g>
  );
}

function MagnetBody({ i, m, flux }: { i: number; m: Magnet; flux?: number }) {
  const x = mx(i);
  return (
    <g>
      <rect x={x} y={Y0 - 32} width={MW} height={64} rx={8} fill="url(#sgSteel)" stroke="#3a4256" />
      <path d={`M${x + 8},${Y0 - 32} L${x + MW - 8},${Y0 - 32} L${x + MW / 2 + 6},${Y0 - 13} L${x + MW / 2 - 6},${Y0 - 13} Z`} fill="#c4514a" opacity={0.85} />
      <path
        d={`M${x + 8},${Y0 + 32} L${x + MW - 8},${Y0 + 32} L${x + MW - 8},${Y0 + 15} L${x + MW / 2 + 12},${Y0 + 15} L${x + MW / 2 + 6},${Y0 + 22} L${x + MW / 2 - 6},${Y0 + 22} L${x + MW / 2 - 12},${Y0 + 15} L${x + 8},${Y0 + 15} Z`}
        fill="#4a72c4"
        opacity={0.85}
      />
      <text x={x + 12} y={Y0 - 19} fontSize={10} fill="#fff" opacity={0.8}>N</text>
      <text x={x + 12} y={Y0 + 28} fontSize={10} fill="#fff" opacity={0.8}>S</text>
      <MagnetIcon m={m} x={x + MW / 2} y={Y0 - 82} />
      <text x={x + MW / 2} y={Y0 + 50} fontSize={12} fill="#e9ecf2" textAnchor="middle" fontWeight={600}>
        SG {i + 1}
      </text>
      <text x={x + MW / 2} y={Y0 + 64} fontSize={11} fill="#9aa3b5" textAnchor="middle">
        {m.y ? 'axis +y' : `θ = ${Math.round(m.theta)}°`}
      </text>
      {flux !== undefined && (
        <text x={x - 6} y={Y0 - 6} fontSize={9} fill="#6b7385" textAnchor="end">
          {(flux * 100).toFixed(flux < 0.1 ? 1 : 0)}%
        </text>
      )}
    </g>
  );
}

function DetectorBox({ cx, cy, w, h, label, count, N, expect, flash, color }: { cx: number; cy: number; w: number; h: number; label: string; count: number; N: number; expect?: number; flash: number; color: string }) {
  const frac = N ? count / N : 0;
  return (
    <g>
      <rect x={cx - w / 2 - 3} y={cy - h / 2 - 3} width={w + 6} height={h + 6} rx={9} fill={color} opacity={flash * 0.45} />
      <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={7} fill="#11141c" stroke={color} strokeOpacity={0.7} />
      <rect x={cx - w / 2 + 2} y={cy + h / 2 - 2 - (h - 4) * Math.min(1, frac)} width={w - 4} height={(h - 4) * Math.min(1, frac)} rx={5} fill={color} opacity={0.18} />
      <text x={cx} y={cy + 2} fontSize={h > 45 ? 18 : 15} fill="#e9ecf2" textAnchor="middle" fontWeight={700} style={{ fontFamily: 'var(--mono)' }}>
        {count}
      </text>
      <text x={cx} y={cy + h / 2 - 5} fontSize={8.5} fill="#9aa3b5" textAnchor="middle">
        {label}
      </text>
      {expect !== undefined && (
        <text x={cx} y={cy - h / 2 + 10} fontSize={8.5} fill="#fcd34d" textAnchor="middle">
          theory {(expect * 100).toFixed(expect < 0.1 && expect > 0 ? 1 : 0)}%
        </text>
      )}
    </g>
  );
}

/* ============================== Component ============================== */

type Phase = 'setup' | 'running' | 'done';
type Mode = 'challenges' | 'sandbox';

interface RunResult {
  counts: number[];
  dist: number[];
  N: number;
  predicted: number | null;
  predIdx: number;
  goalMet: boolean;
  stars: number;
}

const SANDBOX_SOURCES: { value: string; label: string; src: Source; short: string }[] = [
  { value: 'oven', label: 'Oven', src: OVEN, short: 'Ag oven' },
  { value: '+z', label: '+z', src: { kind: 'pure', dir: [0, 0, 1] }, short: 'z+ beam' },
  { value: '-z', label: '−z', src: { kind: 'pure', dir: [0, 0, -1] }, short: 'z− beam' },
  { value: '+x', label: '+x', src: { kind: 'pure', dir: [1, 0, 0] }, short: 'x+ beam' },
  { value: '+y', label: '+y', src: { kind: 'pure', dir: [0, 1, 0] }, short: 'y+ beam' },
];

const cloneMags = (m: MagnetCfg[]) => m.map((x) => ({ ...x }));

export default function SternGerlachSandbox() {
  const g = useGame('stern-gerlach-sandbox');
  const savedStars = (g.data.stars ?? {}) as Record<string, number>;
  const [stars, setStars] = useState<Record<string, number>>(savedStars);
  const [mode, setMode] = useState<Mode>('challenges');
  const firstOpen = Math.max(0, LEVELS.findIndex((l) => !(savedStars[l.id] > 0)));
  const [levelIdx, setLevelIdx] = useState(firstOpen === -1 ? 0 : firstOpen);
  const level = LEVELS[levelIdx];

  const [mags, setMags] = useState<MagnetCfg[]>(() => cloneMags(LEVELS[levelIdx].magnets));
  const [sbSource, setSbSource] = useState('oven');
  const [sbN, setSbN] = useState(200);
  const [showTheory, setShowTheory] = useState(false);
  const [predPort, setPredPort] = useState<Port>('+');
  const [predText, setPredText] = useState('');
  const [phase, setPhase] = useState<Phase>('setup');
  const [result, setResult] = useState<RunResult | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [, setFrame] = useState(0);

  const flights = useRef<Flying[]>([]);
  const counts = useRef<number[]>([]);
  const flash = useRef<number[]>([]);
  const t0 = useRef(0);
  const runActive = useRef(false);
  const runInfo = useRef<{ N: number; dist: number[]; predicted: number | null; predIdx: number }>({ N: 0, dist: [], predicted: null, predIdx: 0 });

  const isSandbox = mode === 'sandbox';
  const source: Source = isSandbox ? SANDBOX_SOURCES.find((s) => s.value === sbSource)!.src : level.source;
  const sourceLabel = isSandbox ? SANDBOX_SOURCES.find((s) => s.value === sbSource)!.short : level.sourceLabel;
  const N = isSandbox ? sbN : 200;
  const maxMagnets = isSandbox ? 4 : level.maxMagnets;
  const allowY = isSandbox ? true : !!level.allowY;
  const thePredPort: Port = isSandbox ? predPort : level.predict;

  const dets = useMemo(() => detectorsOf(mags), [mags]);
  const dist = useMemo(() => exactDistribution(source, mags), [source, mags]);
  const showExpect = phase === 'done' || (isSandbox && showTheory);

  // reset when level / mode changes
  const loadLevel = (idx: number, m: Mode = mode) => {
    setLevelIdx(idx);
    setPhase('setup');
    setResult(null);
    setPredText('');
    counts.current = [];
    flights.current = [];
    if (m === 'challenges') setMags(cloneMags(LEVELS[idx].magnets));
  };
  const switchMode = (m: Mode) => {
    setMode(m);
    setPhase('setup');
    setResult(null);
    setPredText('');
    counts.current = [];
    flights.current = [];
    if (m === 'sandbox') setMags([{ theta: 0, pass: '+' }, { theta: 90, pass: '+' }]);
    else setMags(cloneMags(LEVELS[levelIdx].magnets));
  };

  const editMag = (i: number, patch: Partial<MagnetCfg>) => {
    if (phase === 'running') return;
    setMags((ms) => ms.map((m, k) => (k === i ? { ...m, ...patch } : m)));
    if (phase === 'done') {
      setPhase('setup');
      setResult(null);
      counts.current = [];
    }
  };
  const addMag = () => {
    if (mags.length >= maxMagnets || phase === 'running') return;
    setMags((ms) => {
      const last = ms[ms.length - 1];
      const fresh: MagnetCfg = { theta: 90, pass: '+' };
      if (last?.fixed && !isSandbox) return [...ms.slice(0, -1), fresh, last];
      return [...ms, fresh];
    });
    setPhase('setup');
    setResult(null);
    counts.current = [];
  };
  const removeMag = (i: number) => {
    if (mags.length <= 1 || mags[i].fixed || phase === 'running') return;
    setMags((ms) => ms.filter((_, k) => k !== i));
    setPhase('setup');
    setResult(null);
    counts.current = [];
  };

  const predicted = predText.trim() === '' ? null : Math.round(Number(predText));
  const predValid = predicted !== null && Number.isFinite(predicted) && predicted >= 0 && predicted <= N;
  const canRun = phase !== 'running' && (isSandbox ? predText.trim() === '' || predValid : predValid);

  const run = () => {
    if (!canRun) return;
    const rng = mulberry32((Date.now() ^ (Math.random() * 1e9)) >>> 0);
    const interval = Math.min(0.06, 7 / N);
    const plain: Magnet[] = mags.map(({ theta, y, pass }) => ({ theta, y, pass }));
    flights.current = Array.from({ length: N }, (_, k) => {
      const r = simulateAtom(source, plain, rng);
      return buildFlight(plain, r.ports, r.detector, k * interval);
    });
    counts.current = new Array(dets.length).fill(0);
    flash.current = new Array(dets.length).fill(0);
    t0.current = performance.now();
    runInfo.current = {
      N,
      dist,
      predicted: predValid ? predicted : null,
      predIdx: detectorIndex(plain, plain.length - 1, thePredPort),
    };
    setResult(null);
    runActive.current = true;
    setPhase('running');
  };

  const finishRun = () => {
    if (!runActive.current) return;
    runActive.current = false;
    const info = runInfo.current;
    const cs = counts.current.slice();
    let goalMet = true;
    let st = 0;
    if (!isSandbox) {
      goalMet = level.goal(info.dist, mags);
      if (goalMet && info.predicted !== null) {
        const p = info.dist[info.predIdx];
        const sigma = Math.sqrt(info.N * p * (1 - p));
        const err = Math.abs(info.predicted - cs[info.predIdx]);
        st = 1 + (err <= Math.max(6, 4 * sigma) ? 1 : 0) + (err <= Math.max(3, 2 * sigma) ? 1 : 0);
      }
      const prevStars = stars[level.id] ?? 0;
      const newStars = { ...stars, [level.id]: Math.max(prevStars, st) };
      setStars(newStars);
      const total = Object.values(newStars).reduce((a, b) => a + b, 0);
      const allBeaten = LEVELS.every((l) => (newStars[l.id] ?? 0) > 0);
      const wasBeaten = LEVELS.every((l) => (stars[l.id] ?? 0) > 0);
      g.finish(total, allBeaten, { stars: newStars });
      if (LEVELS.every((l) => (newStars[l.id] ?? 0) >= 3)) g.unlock('u3-sg-master');
      if (allBeaten && !wasBeaten) setCelebrate(true);
    }
    setResult({ counts: cs, dist: info.dist, N: info.N, predicted: info.predicted, predIdx: info.predIdx, goalMet, stars: st });
    setPhase('done');
  };

  const skip = () => {
    for (const f of flights.current) {
      if (!f.arrived) {
        f.arrived = true;
        counts.current[f.det]++;
      }
    }
    finishRun();
  };

  useAnimationFrame(() => {
    if (!runActive.current) return;
    const el = (performance.now() - t0.current) / 1000;
    let allDone = true;
    for (const f of flights.current) {
      if (f.arrived) continue;
      if (el - f.spawn >= f.total / SPEED) {
        f.arrived = true;
        counts.current[f.det]++;
        flash.current[f.det] = performance.now();
      } else allDone = false;
    }
    setFrame((x) => (x + 1) % 1e6);
    if (allDone) finishRun();
  }, phase === 'running');

  /* --------------------------- render helpers --------------------------- */

  const now = performance.now();
  const el = (now - t0.current) / 1000;
  const liveCounts = phase === 'setup' ? new Array(dets.length).fill(0) : counts.current.length === dets.length ? counts.current : new Array(dets.length).fill(0);

  // flux into each magnet (exact), for the faint labels
  const fluxIn: number[] = [];
  {
    let m = 1;
    dist.forEach((p, k) => {
      const d = dets[k];
      if (d.magnet < mags.length - 1) {
        fluxIn[d.magnet] = m;
        m -= p;
      }
    });
    fluxIn[mags.length - 1] = m;
  }

  const guideWidth = (p: number) => (showExpect ? 1 + 6 * Math.sqrt(Math.max(0, p)) : 1.6);

  const dots: React.ReactNode[] = [];
  if (phase === 'running') {
    flights.current.forEach((f, k) => {
      if (f.arrived) return;
      const d = (el - f.spawn) * SPEED;
      if (d < 0) return;
      const { p, col } = flightPos(f, d);
      dots.push(
        <g key={k}>
          <circle cx={p[0]} cy={p[1]} r={5.5} fill={col} opacity={0.18} />
          <circle cx={p[0]} cy={p[1]} r={2.6} fill={col} />
        </g>,
      );
    });
  }

  const predIdxNow = detectorIndex(mags, mags.length - 1, thePredPort);
  const totalStars = Object.values(stars).reduce((a, b) => a + b, 0);
  const levelUnlocked = (i: number) => i === 0 || (stars[LEVELS[i - 1].id] ?? 0) > 0 || (stars[LEVELS[i].id] ?? 0) > 0;

  return (
    <div>
      <HowToPlay defaultOpen={g.plays === 0}>
        <p style={{ marginTop: 0 }}>
          A beam of silver atoms flies left to right through a chain of up to four <b>Stern–Gerlach analyzers</b>. Each analyzer measures the spin along its own axis
          (the little dial above it: 0° = <i>z</i>, 90° = <i>x</i>) and sends every atom to its <b style={{ color: COL_UP }}>+</b> or <b style={{ color: COL_DN }}>−</b> port.
          Choose which port continues to the next magnet; the other port ends in a counter.
        </p>
        <p>
          <b>Challenges:</b> each level has a target. Before firing, <b>predict</b> how many of the 200 atoms will land in the highlighted final port. Hitting the target earns ★; a prediction within
          statistical noise earns ★★★. <b>Sandbox:</b> free play with any source, any chain, and an optional "show theory" overlay.
        </p>
        <p style={{ marginBottom: 0 }}>
          The rule behind everything: an atom with spin along <RichText text="$\hat n$" /> entering a magnet along <RichText text="$\hat m$" /> exits <b>+</b> with probability{' '}
          <RichText text="$\cos^2(\Delta/2) = (1+\hat n\cdot\hat m)/2$" />, and leaves with its spin along <RichText text="$\pm\hat m$" />.
        </p>
      </HowToPlay>

      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
        <Segmented
          options={[
            { value: 'challenges' as Mode, label: '🎯 Challenges' },
            { value: 'sandbox' as Mode, label: '🧪 Sandbox' },
          ]}
          value={mode}
          onChange={(m) => phase !== 'running' && switchMode(m)}
        />
        {!isSandbox && <Stat label="total stars" value={`${totalStars} / ${LEVELS.length * 3}`} color="var(--yellow)" />}
      </div>

      {!isSandbox && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {LEVELS.map((l, i) => {
            const s = stars[l.id] ?? 0;
            const open = levelUnlocked(i);
            return (
              <button
                key={l.id}
                className={`btn small ${i === levelIdx ? 'active' : 'ghost'}`}
                disabled={!open || phase === 'running'}
                onClick={() => loadLevel(i)}
                title={l.title}
                style={{ minWidth: 64, flexDirection: 'column', gap: 0, lineHeight: 1.15 }}
              >
                <span>{open ? i + 1 : '🔒'}</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--yellow)' }}>{'★'.repeat(s)}<span style={{ color: 'var(--text-faint)' }}>{'★'.repeat(3 - s)}</span></span>
              </button>
            );
          })}
        </div>
      )}

      {!isSandbox && (
        <div className="panel" style={{ marginBottom: 12, padding: '12px 16px' }}>
          <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>
            Level {levelIdx + 1}: {level.title}
          </div>
          <div className="dim" style={{ marginTop: 4 }}>
            <RichText text={level.brief} />
          </div>
          <div style={{ marginTop: 6 }}>
            🎯 <RichText text={level.goalText} />
          </div>
        </div>
      )}

      {/* ---------------------------- Apparatus ---------------------------- */}
      <div className="panel" style={{ padding: 8, background: 'radial-gradient(ellipse at 30% 40%, #151b28 0%, #0d1017 75%)' }}>
        <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" style={{ display: 'block' }}>
          <defs>
            <linearGradient id="sgSteel" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#3b4458" />
              <stop offset="0.5" stopColor="#252b3a" />
              <stop offset="1" stopColor="#3b4458" />
            </linearGradient>
            <radialGradient id="sgOvenGlow">
              <stop offset="0" stopColor="#ff8c42" stopOpacity="0.9" />
              <stop offset="1" stopColor="#ff8c42" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* source */}
          <g>
            {source.kind === 'oven' && <circle cx={55} cy={Y0} r={46} fill="url(#sgOvenGlow)" opacity={phase === 'running' ? 0.55 + 0.25 * Math.sin(now / 120) : 0.35} />}
            <rect x={18} y={Y0 - 28} width={74} height={56} rx={10} fill={source.kind === 'oven' ? '#3a2418' : '#1b2a33'} stroke={source.kind === 'oven' ? '#ff8c42' : '#58c4dd'} strokeOpacity={0.7} />
            <rect x={92} y={Y0 - 6} width={12} height={12} fill="#3a4256" />
            <text x={55} y={Y0 + 4} fontSize={13} textAnchor="middle" fill="#e9ecf2" fontWeight={600}>
              {source.kind === 'oven' ? '🔥 Ag' : sourceLabel === 'mystery' ? '❓' : '→ ψ'}
            </text>
            <text x={55} y={Y0 + 46} fontSize={11} textAnchor="middle" fill="#9aa3b5">
              {sourceLabel === 'mystery' ? 'mystery beam' : sourceLabel}
            </text>
            <text x={55} y={Y0 + 60} fontSize={9.5} textAnchor="middle" fill="#6b7385">
              {source.kind === 'oven' ? 'unpolarised' : 'pure state'}
            </text>
          </g>

          {/* guide rails */}
          <path d={segPath(sourceSeg)} stroke={GREY} strokeOpacity={0.25} strokeWidth={guideWidth(1)} fill="none" />
          {mags.map((m, i) => {
            const last = i === mags.length - 1;
            const pp = dist[detectorIndex(mags, i, '+')];
            const pm = dist[detectorIndex(mags, i, '-')];
            // probability flowing out of each port
            const outP = last ? pp : m.pass === '+' ? fluxIn[i + 1] ?? 0 : pp;
            const outM = last ? pm : m.pass === '-' ? fluxIn[i + 1] ?? 0 : pm;
            const pathFor = (p: Port) => (last ? finalSeg(i, p) : p === m.pass ? transferSeg(i, p) : sideSeg(i, p));
            return (
              <g key={`g${i}`}>
                <path d={segPath(insideSeg(i, '+'))} stroke={COL_UP} strokeOpacity={0.22} strokeWidth={guideWidth(outP)} fill="none" />
                <path d={segPath(insideSeg(i, '-'))} stroke={COL_DN} strokeOpacity={0.22} strokeWidth={guideWidth(outM)} fill="none" />
                <path d={segPath(pathFor('+'))} stroke={COL_UP} strokeOpacity={0.28} strokeWidth={guideWidth(outP)} fill="none" strokeDasharray={!last && m.pass !== '+' ? '4 4' : undefined} />
                <path d={segPath(pathFor('-'))} stroke={COL_DN} strokeOpacity={0.28} strokeWidth={guideWidth(outM)} fill="none" strokeDasharray={!last && m.pass !== '-' ? '4 4' : undefined} />
              </g>
            );
          })}

          {mags.map((m, i) => (
            <MagnetBody key={`m${i}`} i={i} m={m} flux={showExpect && i > 0 ? fluxIn[i] : undefined} />
          ))}

          {/* detectors */}
          {dets.map((d, k) => {
            const last = d.magnet === mags.length - 1;
            const [cx, cy] = last ? finalDetPos(d.magnet, d.port) : sideDetPos(d.magnet, d.port);
            const fl = Math.max(0, 1 - (now - (flash.current[k] ?? 0)) / 260);
            const isPred = k === predIdxNow && (!isSandbox || predText.trim() !== '');
            return (
              <g key={`d${k}`}>
                {isPred && (
                  <rect
                    x={cx - (last ? 44 : 36)}
                    y={cy - (last ? 31 : 24)}
                    width={last ? 88 : 72}
                    height={last ? 62 : 48}
                    rx={11}
                    fill="none"
                    stroke="#fcd34d"
                    strokeWidth={1.5}
                    strokeDasharray="5 3"
                  />
                )}
                <DetectorBox
                  cx={cx}
                  cy={cy}
                  w={last ? 76 : 62}
                  h={last ? 50 : 38}
                  label={`SG${d.magnet + 1} ${d.port === '+' ? '+' : '−'}${last ? '' : ' (stop)'}`}
                  count={liveCounts[k] ?? 0}
                  N={N}
                  expect={showExpect ? dist[k] : undefined}
                  flash={phase === 'running' ? fl : 0}
                  color={d.port === '+' ? COL_UP : COL_DN}
                />
              </g>
            );
          })}

          {dots}
        </svg>
      </div>

      {/* ---------------------------- Controls ---------------------------- */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(200px, 1fr))`, gap: 10, marginTop: 10, opacity: phase === 'running' ? 0.55 : 1, pointerEvents: phase === 'running' ? 'none' : 'auto' }}>
        {mags.map((m, i) => {
          const last = i === mags.length - 1;
          return (
            <div key={i} className="panel" style={{ padding: 10 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <b>SG {i + 1}</b>
                {!m.fixed && mags.length > 1 && (
                  <button className="btn small ghost" onClick={() => removeMag(i)} title="remove magnet">
                    ✕
                  </button>
                )}
                {m.fixed && !isSandbox && <span className="faint" style={{ fontSize: '0.8rem' }}>fixed</span>}
              </div>
              {m.lockTheta ? (
                <div className="dim" style={{ fontSize: '0.9rem', margin: '6px 0' }}>
                  🔒 axis {m.y ? '+y' : `θ = ${m.theta}°`}
                </div>
              ) : (
                <>
                  {!m.y && (
                    <>
                      <Slider label="θ" value={m.theta} min={-180} max={180} step={1} onChange={(v) => editMag(i, { theta: v })} format={(v) => `${Math.round(v)}°`} />
                      <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                        {[0, 45, 90, 135, 180].map((a) => (
                          <button key={a} className={`btn small ${m.theta === a ? 'active' : 'ghost'}`} style={{ padding: '2px 7px' }} onClick={() => editMag(i, { theta: a })}>
                            {a === 0 ? 'z' : a === 90 ? 'x' : a === 180 ? '−z' : `${a}°`}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {allowY && (
                    <div style={{ marginTop: 6 }}>
                      <Toggle label="point along +y" value={!!m.y} onChange={(v) => editMag(i, { y: v })} />
                    </div>
                  )}
                </>
              )}
              {!last && (
                <div style={{ marginTop: 8 }}>
                  {m.lockPass ? (
                    <span className="dim" style={{ fontSize: '0.9rem' }}>
                      🔒 <b style={{ color: m.pass === '+' ? COL_UP : COL_DN }}>{m.pass === '+' ? '+' : '−'}</b> port continues
                    </span>
                  ) : (
                    <Segmented
                      options={[
                        { value: '+' as Port, label: <span style={{ color: m.pass === '+' ? undefined : COL_UP }}>+ continues</span> },
                        { value: '-' as Port, label: <span style={{ color: m.pass === '-' ? undefined : COL_DN }}>− continues</span> },
                      ]}
                      value={m.pass}
                      onChange={(v) => editMag(i, { pass: v })}
                    />
                  )}
                </div>
              )}
              {last && <div className="faint" style={{ fontSize: '0.8rem', marginTop: 8 }}>both ports counted</div>}
            </div>
          );
        })}
        {mags.length < maxMagnets && (
          <button className="btn ghost" style={{ minHeight: 90, borderStyle: 'dashed' }} onClick={addMag}>
            ＋ Add magnet
          </button>
        )}
      </div>

      {/* ---------------------------- Predict & run ---------------------------- */}
      <div className="panel" style={{ marginTop: 12, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        {isSandbox && (
          <>
            <div className="col" style={{ gap: 4 }}>
              <span className="faint" style={{ fontSize: '0.8rem' }}>source</span>
              <Segmented options={SANDBOX_SOURCES.map((s) => ({ value: s.value, label: s.label }))} value={sbSource} onChange={(v) => { setSbSource(v); setPhase('setup'); setResult(null); counts.current = []; }} />
            </div>
            <div className="col" style={{ gap: 4 }}>
              <span className="faint" style={{ fontSize: '0.8rem' }}>atoms</span>
              <Segmented options={[100, 200, 1000].map((n) => ({ value: n, label: String(n) }))} value={sbN} onChange={(v) => { setSbN(v); setPhase('setup'); setResult(null); counts.current = []; }} />
            </div>
            <Toggle label="show theory" value={showTheory} onChange={setShowTheory} />
          </>
        )}
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <span>
            🔮 Predict: of <b>{N}</b> atoms, how many reach the final
          </span>
          {isSandbox ? (
            <Segmented
              options={[
                { value: '+' as Port, label: '+ port' },
                { value: '-' as Port, label: '− port' },
              ]}
              value={predPort}
              onChange={setPredPort}
            />
          ) : (
            <b style={{ color: thePredPort === '+' ? COL_UP : COL_DN }}>{thePredPort === '+' ? '+ port' : '− port'}</b>
          )}
          <span>?</span>
          <input
            type="number"
            min={0}
            max={N}
            value={predText}
            disabled={phase === 'running'}
            placeholder={isSandbox ? 'optional' : 'your guess'}
            onChange={(e) => {
              setPredText(e.target.value);
              if (phase === 'done') {
                setPhase('setup');
                setResult(null);
                counts.current = [];
              }
            }}
            onKeyDown={(e) => e.key === 'Enter' && run()}
            style={{ width: 96 }}
          />
        </div>
        <div style={{ marginLeft: 'auto' }} className="row">
          {phase === 'running' ? (
            <button className="btn" onClick={skip}>
              ⏩ Skip animation
            </button>
          ) : (
            <button className="btn primary" disabled={!canRun} onClick={run}>
              {phase === 'done' ? '🔁 Fire again' : '▶ Fire the beam'}
            </button>
          )}
        </div>
      </div>

      {/* ---------------------------- Result ---------------------------- */}
      {phase === 'done' && result && (
        <div className="panel pop" style={{ marginTop: 12, borderColor: isSandbox ? 'var(--border)' : result.goalMet ? 'var(--green)' : 'var(--red)' }}>
          {!isSandbox && (
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: result.goalMet ? 'var(--green)' : 'var(--red)' }}>
                {result.goalMet ? (result.stars === 3 ? '🎉 Perfect!' : '✓ Target reached') : '✗ Target not reached'}
              </div>
              <div style={{ fontSize: '1.6rem', letterSpacing: 4 }}>
                {[0, 1, 2].map((k) => (
                  <span key={k} className={k < result.stars ? 'pop' : ''} style={{ color: k < result.stars ? 'var(--yellow)' : 'var(--text-faint)', display: 'inline-block', animationDelay: `${k * 0.12}s` }}>
                    ★
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="row" style={{ gap: 18, flexWrap: 'wrap', margin: '8px 0' }}>
            <Stat label={`actual (final ${thePredPort === '+' ? '+' : '−'})`} value={result.counts[result.predIdx]} />
            {result.predicted !== null && <Stat label="your prediction" value={result.predicted} color="var(--yellow)" />}
            <Stat label="theory (expected)" value={(result.dist[result.predIdx] * result.N).toFixed(1)} color="var(--teal)" />
            <Stat label="± noise (1σ)" value={Math.sqrt(result.N * result.dist[result.predIdx] * (1 - result.dist[result.predIdx])).toFixed(1)} />
          </div>
          {!isSandbox && !result.goalMet && (
            <div style={{ color: 'var(--red)', marginBottom: 6 }}>
              The configuration doesn’t meet the target yet: <RichText text={level.goalText} /> Adjust the magnets and fire again.
            </div>
          )}
          {!isSandbox && result.goalMet && result.predicted !== null && result.stars < 3 && (
            <div className="dim" style={{ marginBottom: 6 }}>
              Your prediction was off by {Math.abs(result.predicted - result.counts[result.predIdx])}. For ★★★, land within about 2σ of the actual count (the theory value is the best guess).
            </div>
          )}
          {(isSandbox || result.goalMet) && (
            <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 8, marginTop: 4 }}>
              {isSandbox ? (
                <span className="dim">
                  Each count fluctuates around <i>N·p</i> by about √(N·p(1−p)). Turn on <b>show theory</b> to compare with the exact probabilities, and try a z → x → z chain to watch “erased” spin-down atoms reappear.
                </span>
              ) : (
                <>
                  <b>🧠 The physics: </b>
                  <span className="dim">
                    <RichText text={level.explain} />
                  </span>
                </>
              )}
            </div>
          )}
          {!isSandbox && result.goalMet && levelIdx < LEVELS.length - 1 && (
            <button className="btn primary" style={{ marginTop: 10 }} onClick={() => loadLevel(levelIdx + 1)}>
              Next level →
            </button>
          )}
        </div>
      )}

      {celebrate && (
        <GameOverlay title="🧭 All analyzers mastered!" onClose={() => setCelebrate(false)}>
          You beat every Stern–Gerlach challenge. You’ve seen quantisation (two spots), repeatability, the memory-erasing surprise, the <i>cos²(θ/2)</i> rule, a third
          dimension hidden in phase, and the Zeno staircase. Go back for ★★★ on every level, or play in the sandbox.
        </GameOverlay>
      )}
    </div>
  );
}
