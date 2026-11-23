import React, { useMemo, useRef, useState } from 'react';
import { useGame, GameOverlay, HowToPlay } from '../../../components/game';
import { RichText, Stat } from '../../../components/ui';
import { c, add, mul, abs, arg, expi, phaseColor, type C } from '../../../engine/complex';
import { Arrow, svgPoint, fx, deg } from '../widgets/common';

type Club = { kind: 'arrow'; len: number } | { kind: 'rotate' } | { kind: 'multiply' };
type Op = { kind: 'arrow'; v: C; club: number } | { kind: 'rotate'; w: C; club: number } | { kind: 'multiply'; w: C; club: number };

interface Level {
  name: string;
  target: [number, number];
  tol: number;
  clubs: Club[];
  par: number;
  snapDeg: number;
  start?: [number, number][];
  hazards?: { x: number; y: number; r: number }[];
  brief: string;
  lesson: string;
}

const r2 = Math.SQRT2;
const LEVELS: Level[] = [
  {
    name: 'Tee off',
    target: [2, 0],
    tol: 0.15,
    clubs: [{ kind: 'arrow', len: 1 }, { kind: 'arrow', len: 1 }, { kind: 'arrow', len: 1 }],
    par: 2,
    snapDeg: 15,
    brief: 'Pick an arrow club, aim with the mouse, click to place it at the ball. Sink the ball in the green hole.',
    lesson: 'Two arrows pointing the same way add to an arrow twice as long. This is **constructive** addition: the phases match.',
  },
  {
    name: 'Straight up',
    target: [0, 2],
    tol: 0.15,
    clubs: [{ kind: 'arrow', len: 2 }, { kind: 'arrow', len: 1 }, { kind: 'arrow', len: 1 }],
    par: 1,
    snapDeg: 15,
    brief: 'The hole is at $2i$. One club will do it.',
    lesson: 'An arrow of length 2 at angle 90° is the complex number $2e^{i\\pi/2} = 2i$.',
  },
  {
    name: 'Diagonal',
    target: [1, 1],
    tol: 0.15,
    clubs: [{ kind: 'arrow', len: 1 }, { kind: 'arrow', len: 1 }, { kind: 'arrow', len: r2 }],
    par: 1,
    snapDeg: 15,
    brief: 'The hole is at $1+i$. You could take two shots. Can you take one?',
    lesson: '$1 + i = \\sqrt2\\,e^{i\\pi/4}$. Polar form tells you exactly which club and which angle.',
  },
  {
    name: 'Cancel out',
    target: [0, 0],
    tol: 0.15,
    start: [[1.5 * Math.cos(Math.PI / 6), 1.5 * Math.sin(Math.PI / 6)]],
    clubs: [{ kind: 'arrow', len: 0.75 }, { kind: 'arrow', len: 1 }, { kind: 'arrow', len: 0.75 }, { kind: 'arrow', len: 0.5 }],
    par: 2,
    snapDeg: 15,
    brief: 'A 1.5-long arrow at 30° is already on the course. Bring the ball **back to the origin**.',
    lesson: 'To cancel an arrow you need the same total length pointing the opposite way, 180° out of phase. This is **destructive interference**: $a + b = 0$ means $b = -a = |a|e^{i(\\varphi+\\pi)}$.',
  },
  {
    name: 'Hexagon',
    target: [-1, Math.sqrt(3)],
    tol: 0.15,
    clubs: [{ kind: 'arrow', len: 1 }, { kind: 'arrow', len: 1 }, { kind: 'arrow', len: 1 }, { kind: 'arrow', len: 1 }],
    par: 2,
    snapDeg: 30,
    brief: 'Hole at $2e^{i\\,2\\pi/3}$. Angles snap to 30° on this course.',
    lesson: 'Two unit arrows at 120° give length 2 only if they point the same way. In general $|a+b|$ depends on the angle between them.',
  },
  {
    name: 'Spin the course',
    target: [0, -3],
    tol: 0.15,
    start: [[3, 0]],
    clubs: [{ kind: 'arrow', len: 1 }, { kind: 'rotate' }, { kind: 'arrow', len: 1 }, { kind: 'arrow', len: 1 }],
    par: 1,
    snapDeg: 15,
    brief: 'New club: **rotate**. It multiplies the whole path by $e^{i\\theta}$, spinning it about the origin. (The arrow clubs can\'t reach from here.)',
    lesson: 'Multiplying by $e^{-i\\pi/2} = -i$ turns everything a quarter-turn clockwise: $3 \\cdot (-i) = -3i$. Unit-modulus factors are pure rotations: **phases**.',
  },
  {
    name: 'Rotate & scale',
    target: [-2, 2],
    tol: 0.15,
    start: [
      [1, 0],
      [0, 1],
    ],
    clubs: [{ kind: 'arrow', len: 1 }, { kind: 'multiply' }, { kind: 'arrow', len: 1 }],
    par: 1,
    snapDeg: 15,
    brief: 'New club: **multiply by w**. It multiplies the whole path by any complex number $w$ (snapping to lengths in steps of 0.25 and angles in steps of 15°).',
    lesson: 'The ball is at $1+i$ and must reach $-2+2i$, so $w = \\frac{-2+2i}{1+i} = 2i$: double the length and turn 90°.',
  },
  {
    name: 'Water hazard',
    target: [3, 0],
    tol: 0.15,
    hazards: [{ x: 1.5, y: 0, r: 0.75 }],
    clubs: [{ kind: 'arrow', len: 2 }, { kind: 'arrow', len: 2 }, { kind: 'arrow', len: 1 }, { kind: 'arrow', len: 1 }, { kind: 'arrow', len: 1 }],
    par: 2,
    snapDeg: 1,
    brief: 'The ball must not stop in the water. Angles snap to 1° here.',
    lesson: 'Two arrows of length 2 at $\\pm\\theta$ sum to $4\\cos\\theta$ along the real axis (their imaginary parts cancel). $4\\cos\\theta = 3$ gives $\\theta \\approx 41.4°$.',
  },
  {
    name: 'Grand finale',
    target: [0, 2 * r2],
    tol: 0.15,
    start: [
      [1, 0],
      [0, 1],
    ],
    hazards: [{ x: 0, y: 1.6, r: 0.55 }],
    clubs: [{ kind: 'arrow', len: 1 }, { kind: 'multiply' }, { kind: 'arrow', len: 1 }, { kind: 'rotate' }],
    par: 1,
    snapDeg: 15,
    brief: 'Hole at $2\\sqrt2\\,i$, guarded by a pond. Find the single best club.',
    lesson: 'The ball is at $1+i = \\sqrt2 e^{i\\pi/4}$ and the hole is $2\\sqrt2\\, e^{i\\pi/2}$. Divide: $w = 2e^{i\\pi/4}$. Multiplying by $w$ doubles every length and adds 45° to every angle: the whole path swings over the pond.',
  },
];

const W = 560,
  H = 560,
  R = 3.6;
const s = W / (2 * R);
const X = (x: number) => W / 2 + x * s;
const Y = (y: number) => H / 2 - y * s;

function pathFrom(level: Level, ops: Op[]): C[] {
  let segs: C[] = (level.start ?? []).map(([x, y]) => c(x, y));
  for (const op of ops) {
    if (op.kind === 'arrow') segs = [...segs, op.v];
    else segs = segs.map((v) => mul(v, op.w));
  }
  return segs;
}
const verts = (segs: C[]) => {
  const out: C[] = [c(0)];
  for (const v of segs) out.push(add(out[out.length - 1], v));
  return out;
};
const inHazard = (p: C, level: Level) => (level.hazards ?? []).some((h) => Math.hypot(p.re - h.x, p.im - h.y) < h.r);

export default function PhasorGolf() {
  const g = useGame('phasor-golf');
  const [li, setLi] = useState(0);
  const [ops, setOps] = useState<Op[]>([]);
  const [club, setClub] = useState<number | null>(null);
  const [aim, setAim] = useState<C | null>(null);
  const [strokes, setStrokes] = useState(0);
  const [stars, setStars] = useState<number[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const [holed, setHoled] = useState(false);
  const [finished, setFinished] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const level = LEVELS[li];

  const segs = useMemo(() => pathFrom(level, ops), [level, ops]);
  const vs = verts(segs);
  const tip = vs[vs.length - 1];
  const used = new Set(ops.map((o) => o.club));

  const snapAng = (a: number, step: number) => Math.round(a / ((step * Math.PI) / 180)) * ((step * Math.PI) / 180);

  // compute the pending op from the aim point
  const pending: Op | null = useMemo(() => {
    if (club === null || !aim) return null;
    const cl = level.clubs[club];
    if (cl.kind === 'arrow') {
      const a = snapAng(Math.atan2(aim.im - tip.im, aim.re - tip.re), level.snapDeg);
      return { kind: 'arrow', v: c(cl.len * Math.cos(a), cl.len * Math.sin(a)), club };
    }
    if (abs(tip) < 1e-6) return null;
    if (cl.kind === 'rotate') {
      const a = snapAng(arg(aim) - arg(tip), 15);
      return { kind: 'rotate', w: expi(a), club };
    }
    // multiply: w = aim / tip, snapped in polar coordinates
    const wr = Math.max(0.25, Math.round((abs(aim) / abs(tip)) / 0.25) * 0.25);
    const wa = snapAng(arg(aim) - arg(tip), 15);
    return { kind: 'multiply', w: c(wr * Math.cos(wa), wr * Math.sin(wa)), club };
  }, [club, aim, tip, level]);

  const ghost = pending ? verts(pathFrom(level, [...ops, pending])) : null;
  const ghostWet = ghost ? ghost.slice(1).some((p) => inHazard(p, level)) : false;

  const place = () => {
    if (!pending || holed) return;
    const nv = verts(pathFrom(level, [...ops, pending]));
    setStrokes((k) => k + 1);
    if (nv.slice(1).some((p) => inHazard(p, level))) {
      setFlash('💦 Splash! The ball landed in the water. +1 stroke, ball returned.');
      setClub(null);
      setTimeout(() => setFlash(null), 1800);
      return;
    }
    const nops = [...ops, pending];
    setOps(nops);
    setClub(null);
    setAim(null);
    const ntip = nv[nv.length - 1];
    if (Math.hypot(ntip.re - level.target[0], ntip.im - level.target[1]) < level.tol) {
      const k = strokes + 1;
      const st = k <= level.par ? 3 : k <= level.par + 1 ? 2 : 1;
      const nst = [...stars];
      nst[li] = Math.max(nst[li] ?? 0, st);
      setStars(nst);
      setHoled(true);
    }
  };

  const nextLevel = () => {
    setHoled(false);
    setOps([]);
    setStrokes(0);
    setClub(null);
    if (li + 1 >= LEVELS.length) {
      const total = stars.reduce((a, b) => a + (b ?? 0), 0);
      const all = stars.filter((x) => x).length === LEVELS.length;
      g.finish(total, all, { stars });
      if (all && stars.every((x) => x === 3)) g.unlock('phasor-perfect');
      setFinished(true);
    } else setLi(li + 1);
  };

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current || club === null) return;
    const [px, py] = svgPoint(e, svgRef.current, W, H);
    setAim(c((px - W / 2) / s, (H / 2 - py) / s));
  };

  const currentStars = stars[li];
  const totalStars = stars.reduce((a, b) => a + (b ?? 0), 0);

  const describe = (cl: Club) => (cl.kind === 'arrow' ? `→ ${fx(cl.len, 2)}` : cl.kind === 'rotate' ? '⟳ rotate' : '✕ multiply');
  const pendingText = pending
    ? pending.kind === 'arrow'
      ? `arrow ${fx(abs(pending.v))} at ${deg(arg(pending.v)).toFixed(0)}°`
      : pending.kind === 'rotate'
        ? `rotate by ${deg(arg(pending.w)).toFixed(0)}°`
        : `multiply by w = ${fx(abs(pending.w))}·e^(i${deg(arg(pending.w)).toFixed(0)}°)`
    : '';

  return (
    <div style={{ position: 'relative' }}>
      <HowToPlay defaultOpen={li === 0 && !finished}>
        Each hole is a point in the complex plane. The ball starts at the origin (or wherever the pre-placed arrows leave it). Your <b>clubs</b> are complex operations: <b>arrow</b> clubs add a fixed-length arrow at any angle you choose (tip-to-tail addition);
        the <b>rotate</b> club multiplies the whole path by <i>e<sup>iθ</sup></i>; the <b>multiply</b> club multiplies the whole path by any complex number <i>w</i>. Each club can be used once. Sink the ball within par for 3 stars. Undo is allowed, but every shot still counts.
      </HowToPlay>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <b style={{ fontSize: '1.1rem' }}>
            Hole {li + 1}/{LEVELS.length}: {level.name}
          </b>
          <div className="dim" style={{ fontSize: '0.92rem', marginTop: 2 }}>
            <RichText text={level.brief} />
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Stat label="strokes" value={strokes} color={strokes <= level.par ? '#83c167' : '#fcd34d'} />
          <Stat label="par" value={level.par} />
          <Stat label="stars" value={`${totalStars}/${LEVELS.length * 3}`} color="#fcd34d" />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 14 }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', height: 'auto', touchAction: 'none', cursor: club !== null ? 'crosshair' : 'default', userSelect: 'none' }}
          onPointerMove={onMove}
          onPointerDown={(e) => {
            onMove(e);
          }}
          onPointerUp={() => place()}
        >
          <defs>
            <radialGradient id="pg-green" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor="#12301f" />
              <stop offset="100%" stopColor="#0b1410" />
            </radialGradient>
            <radialGradient id="pg-water" cx="50%" cy="40%" r="60%">
              <stop offset="0%" stopColor="#2b6f9a" />
              <stop offset="100%" stopColor="#163a55" />
            </radialGradient>
          </defs>
          <rect width={W} height={H} rx={12} fill="url(#pg-green)" />
          {Array.from({ length: 15 }, (_, i) => (i - 7) * 0.5).map((t) => (
            <g key={t}>
              <line x1={X(t)} x2={X(t)} y1={0} y2={H} stroke={Number.isInteger(t) ? '#1d3a2a' : '#152a1f'} />
              <line y1={Y(t)} y2={Y(t)} x1={0} x2={W} stroke={Number.isInteger(t) ? '#1d3a2a' : '#152a1f'} />
            </g>
          ))}
          <line x1={0} x2={W} y1={Y(0)} y2={Y(0)} stroke="#3c6a50" strokeWidth={1.4} />
          <line y1={0} y2={H} x1={X(0)} x2={X(0)} stroke="#3c6a50" strokeWidth={1.4} />
          {[1, 2, 3].map((k) => (
            <g key={k}>
              <text x={X(k)} y={Y(0) + 14} fill="#4f7d63" fontSize={11} textAnchor="middle">{k}</text>
              <text x={X(-k)} y={Y(0) + 14} fill="#4f7d63" fontSize={11} textAnchor="middle">{-k}</text>
              <text x={X(0) + 5} y={Y(k) + 4} fill="#4f7d63" fontSize={11}>{k}i</text>
              <text x={X(0) + 5} y={Y(-k) + 4} fill="#4f7d63" fontSize={11}>{-k}i</text>
            </g>
          ))}
          {(level.hazards ?? []).map((h, i) => (
            <g key={i}>
              <circle cx={X(h.x)} cy={Y(h.y)} r={h.r * s} fill="url(#pg-water)" stroke="#58c4dd" strokeOpacity={0.6} />
              <circle cx={X(h.x)} cy={Y(h.y)} r={h.r * s * 0.5} fill="none" stroke="#9fd9e8" strokeOpacity={0.35}>
                <animate attributeName="r" values={`${h.r * s * 0.2};${h.r * s * 0.9}`} dur="2.4s" repeatCount="indefinite" />
                <animate attributeName="stroke-opacity" values="0.5;0" dur="2.4s" repeatCount="indefinite" />
              </circle>
            </g>
          ))}
          {/* hole */}
          <circle cx={X(level.target[0])} cy={Y(level.target[1])} r={level.tol * s} fill="#05080a" stroke="#83c167" strokeWidth={2} />
          <line x1={X(level.target[0])} y1={Y(level.target[1])} x2={X(level.target[0])} y2={Y(level.target[1]) - 46} stroke="#e9ecf2" strokeWidth={2} />
          <polygon points={`${X(level.target[0])},${Y(level.target[1]) - 46} ${X(level.target[0]) + 22},${Y(level.target[1]) - 39} ${X(level.target[0])},${Y(level.target[1]) - 32}`} fill="#fc6255" />
          {/* ghost */}
          {ghost && (
            <g opacity={0.65}>
              {ghost.slice(1).map((p, i) => (
                <Arrow key={i} x1={X(ghost[i].re)} y1={Y(ghost[i].im)} x2={X(p.re)} y2={Y(p.im)} color={ghostWet ? '#fc6255' : '#ffffff'} width={2} dashed />
              ))}
            </g>
          )}
          {/* path */}
          {vs.slice(1).map((p, i) => (
            <Arrow key={i} x1={X(vs[i].re)} y1={Y(vs[i].im)} x2={X(p.re)} y2={Y(p.im)} color={phaseColor(arg(segs[i]))} width={3.2} />
          ))}
          {/* ball */}
          <circle cx={X(tip.re)} cy={Y(tip.im)} r={8} fill="#fff" stroke="#cfd6e4" />
          {holed && (
            <circle cx={X(tip.re)} cy={Y(tip.im)} r={10} fill="none" stroke="#fcd34d" strokeWidth={3}>
              <animate attributeName="r" values="8;60" dur="0.9s" repeatCount="2" />
              <animate attributeName="stroke-opacity" values="1;0" dur="0.9s" repeatCount="2" />
            </circle>
          )}
        </svg>
        <div className="col" style={{ gap: 10 }}>
          <div className="panel" style={{ padding: 12 }}>
            <div className="faint" style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
              Your bag
            </div>
            <div className="row" style={{ gap: 6 }}>
              {level.clubs.map((cl, i) => (
                <button key={i} className={`btn small ${club === i ? 'active' : ''}`} disabled={used.has(i) || holed} onClick={() => setClub(club === i ? null : i)} style={{ minWidth: 70 }}>
                  {describe(cl)}
                </button>
              ))}
            </div>
            <div className="dim" style={{ fontSize: '0.85rem', marginTop: 8, minHeight: 20 }}>
              {club === null ? 'Select a club.' : pending ? <>Aiming: <b>{pendingText}</b>. Click to shoot.</> : 'Move the mouse over the course to aim.'}
            </div>
          </div>
          <div className="mono dim" style={{ fontSize: '0.85rem' }}>
            ball at {fx(tip.re)} {tip.im < 0 ? '−' : '+'} {fx(Math.abs(tip.im))}i {abs(tip) > 1e-9 ? <> = {fx(abs(tip))}·e^(i{deg(arg(tip)).toFixed(0)}°)</> : null}
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn small" disabled={ops.length === 0 || holed} onClick={() => setOps(ops.slice(0, -1))}>
              ↶ Undo last
            </button>
            <button className="btn small" disabled={ops.length === 0 || holed} onClick={() => setOps([])}>
              Reset hole
            </button>
          </div>
          {flash && (
            <div className="pill bad shake" style={{ alignSelf: 'flex-start' }}>
              {flash}
            </div>
          )}
          {holed && (
            <div className="panel pop" style={{ padding: 12, borderColor: 'var(--green)' }}>
              <div style={{ color: 'var(--green)', fontWeight: 700, fontSize: '1.05rem' }}>
                ⛳ In the hole! {'★'.repeat(currentStars ?? 0)}
                {'☆'.repeat(3 - (currentStars ?? 0))}
              </div>
              <div className="dim" style={{ fontSize: '0.9rem', marginTop: 6 }}>
                <RichText text={level.lesson} />
              </div>
              <button className="btn primary small" style={{ marginTop: 10 }} onClick={nextLevel}>
                {li + 1 >= LEVELS.length ? 'Finish round' : 'Next hole →'}
              </button>
            </div>
          )}
          <div className="row" style={{ gap: 4 }}>
            {LEVELS.map((_, i) => (
              <span key={i} className="mono" style={{ fontSize: '0.8rem', color: i === li ? 'var(--text)' : 'var(--text-faint)' }}>
                {i + 1}:{stars[i] ? '★'.repeat(stars[i]) : '·'}
              </span>
            ))}
          </div>
        </div>
      </div>
      {finished && (
        <GameOverlay
          title={stars.every((x) => x === 3) ? 'Perfect round!' : 'Round complete!'}
          tone="win"
          onClose={() => {
            setFinished(false);
            setLi(0);
            setStars([]);
          }}
        >
          You collected <b>{totalStars}</b> of {LEVELS.length * 3} stars.
          <br />
          Adding complex numbers is tip-to-tail; multiplying rotates and scales the whole plane. Every quantum gate you'll meet does one of these two things to amplitudes.
          <br />
          <span className="faint">Press continue to play again and chase three stars on every hole.</span>
        </GameOverlay>
      )}
    </div>
  );
}
