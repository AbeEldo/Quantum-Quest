import React, { useEffect, useRef, useState } from 'react';
import { useGame, GameOverlay, HowToPlay } from '../../../components/game';
import { RichText, Stat, Tex } from '../../../components/ui';
import { Arrow, useSvgDrag, fx, easeInOut } from '../widgets/common';
import { apply, mmul, I2, type M2 } from '../widgets/MatrixTransform';

const r = Math.SQRT1_2;
const GATES: Record<string, { M: M2; label: string; desc: string }> = {
  R90: { M: [[0, -1], [1, 0]], label: 'R₉₀', desc: 'rotate 90°' },
  R45: { M: [[r, -r], [r, r]], label: 'R₄₅', desc: 'rotate 45°' },
  X: { M: [[0, 1], [1, 0]], label: 'X', desc: 'reflect in y = x' },
  Z: { M: [[1, 0], [0, -1]], label: 'Z', desc: 'reflect in x-axis' },
  H: { M: [[r, r], [r, -r]], label: 'H', desc: 'reflect in the 22.5° line' },
  SH: { M: [[1, 1], [0, 1]], label: 'Shear', desc: 'shear right' },
};

interface Q {
  prompt: string;
  options: string[];
  answer: number;
  explain: string;
}
type Level =
  | { kind: 'drag'; name: string; T: M2; brief: string; q: Q }
  | { kind: 'compose'; name: string; T: M2; gates: string[]; par: number; brief: string; lesson: string };

const LEVELS: Level[] = [
  {
    kind: 'drag',
    name: 'Quarter turn',
    T: [[0, -1], [1, 0]],
    brief: 'Drag the tips of **î** (green) and **ĵ** (red) so your pink F lands exactly on the dashed target.',
    q: { prompt: 'Does this transformation preserve all lengths (is it orthogonal / unitary)?', options: ['Yes', 'No'], answer: 0, explain: 'A rotation keeps lengths and angles. Its columns are orthonormal: $(0,1)$ and $(-1,0)$.' },
  },
  {
    kind: 'drag',
    name: 'Mirror',
    T: [[-1, 0], [0, 1]],
    brief: 'Match the target.',
    q: { prompt: 'What is the determinant of this matrix?', options: ['−1', '0', '1', '2'], answer: 0, explain: 'A reflection flips orientation (the F is now backwards), so $\\det = -1$. Area is unchanged, so $|\\det| = 1$.' },
  },
  {
    kind: 'drag',
    name: 'Lean',
    T: [[1, 0.5], [0, 1]],
    brief: 'Match the target. Tips snap to the half-grid.',
    q: { prompt: 'Is this transformation unitary (orthogonal)?', options: ['Yes', 'No'], answer: 1, explain: 'A shear stretches some vectors: $(0,1) \\mapsto (0.5, 1)$ has length $\\approx 1.12$. Not unitary, even though $\\det = 1$ (area is preserved).' },
  },
  {
    kind: 'drag',
    name: 'Squash & stretch',
    T: [[2, 0], [0, 0.5]],
    brief: 'Match the target.',
    q: { prompt: 'What are the eigenvalues?', options: ['2 and 0.5', '1 and 1', '2.5 and 0', '−2 and 0.5'], answer: 0, explain: 'A diagonal matrix has its eigenvalues on the diagonal, with the axes as eigenvectors: x stretches by 2, y shrinks by 0.5.' },
  },
  {
    kind: 'drag',
    name: 'Flatten',
    T: [[1, 0], [0, 0]],
    brief: 'Match the target (it may look a little thin).',
    q: { prompt: 'Can this transformation be undone by another matrix?', options: ['Yes, by its transpose', 'Yes, by its inverse', 'No: information is destroyed'], answer: 2, explain: 'This is the projector $|0\\rangle\\langle 0|$. Every point with the same $x$ lands in the same place, so no matrix can undo it ($\\det = 0$). Projectors model the outcome of a measurement, which is also irreversible.' },
  },
  {
    kind: 'drag',
    name: 'Big Hadamard',
    T: [[1, 1], [1, -1]],
    brief: 'Match the target.',
    q: { prompt: 'Is this matrix symmetric (i.e. Hermitian, for real matrices)?', options: ['Yes', 'No'], answer: 0, explain: 'It equals its transpose. Divided by $\\sqrt2$ it becomes the Hadamard gate $H$, which is both Hermitian and unitary.' },
  },
  {
    kind: 'compose',
    name: 'Two mirrors make a turn',
    T: [[0, -1], [1, 0]],
    gates: ['X', 'Z'],
    par: 2,
    brief: 'Now you only have gate buttons. Build a **90° anticlockwise rotation** out of reflections. Gates apply in the order you press them.',
    lesson: 'Pressing Z then X gives the matrix $XZ$ (the first gate pressed is the rightmost factor), and $XZ = R_{90}$. Pressing X then Z gives $ZX = R_{-90}$: **order matters**. Matrices, and quantum gates, generally don’t commute.',
  },
  {
    kind: 'compose',
    name: 'Sandwich',
    T: [[0, 1], [1, 0]],
    gates: ['H', 'Z'],
    par: 3,
    brief: 'Build the swap **X** using only H and Z.',
    lesson: '$HZH = X$. Conjugating by $H$ swaps the roles of the two reflections. You’ll use this identity constantly in quantum circuits.',
  },
  {
    kind: 'compose',
    name: 'Make a Hadamard',
    T: [[r, r], [r, -r]],
    gates: ['R45', 'Z', 'X'],
    par: 2,
    brief: 'Build **H** from rotations and reflections.',
    lesson: '$H = R_{45}Z$: reflect in the x-axis, then rotate by 45°. A reflection followed by a rotation is another reflection, here across the line at 22.5°.',
  },
  {
    kind: 'compose',
    name: 'Full circle',
    T: [[-1, 0], [0, -1]],
    gates: ['R45', 'H', 'SH'],
    par: 4,
    brief: 'Build the **half-turn** $-I$ (a 180° rotation). Some of these buttons are traps.',
    lesson: 'A half-turn is four 45° rotations: $R_{45}^4 = -I$. The other gates can’t shorten it: $H$ is a reflection, and $H^2 = I$; the shear is not orthogonal, and once applied nothing in this bag undoes it. Rotations compose by adding angles, exactly like multiplying unit complex numbers $e^{i\\pi/4}$.',
  },
];

const SHAPE: [number, number][] = [
  [0.2, 0.2],
  [0.2, 1.8],
  [1.3, 1.8],
  [1.3, 1.5],
  [0.55, 1.5],
  [0.55, 1.1],
  [1.1, 1.1],
  [1.1, 0.8],
  [0.55, 0.8],
  [0.55, 0.2],
];

const W = 480,
  H = 480,
  R = 3;
const s = W / (2 * R);
const X = (x: number) => W / 2 + x * s;
const Y = (y: number) => H / 2 - y * s;
const same = (A: M2, B: M2) => [0, 1].every((i) => [0, 1].every((j) => Math.abs(A[i][j] - B[i][j]) < 1e-6));
const matTex = (m: M2) => `\\begin{pmatrix} ${fx(m[0][0])} & ${fx(m[0][1])} \\\\ ${fx(m[1][0])} & ${fx(m[1][1])} \\end{pmatrix}`;

function useMatrixTween(target: M2, ms = 550): M2 {
  const [m, setM] = useState<M2>(target);
  const cur = useRef<M2>(target);
  useEffect(() => {
    const from = cur.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = easeInOut(Math.min(1, (now - t0) / ms));
      const v: M2 = [
        [from[0][0] + (target[0][0] - from[0][0]) * t, from[0][1] + (target[0][1] - from[0][1]) * t],
        [from[1][0] + (target[1][0] - from[1][0]) * t, from[1][1] + (target[1][1] - from[1][1]) * t],
      ];
      cur.current = v;
      setM(v);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return m;
}

export default function TransformationMatch() {
  const g = useGame('transformation-match');
  const [li, setLi] = useState(0);
  const level = LEVELS[li];
  const [M, setM] = useState<M2>(I2);
  const [seq, setSeq] = useState<string[]>([]);
  const [matched, setMatched] = useState(false);
  const [answer, setAnswer] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState<string[]>([]);
  const [hint, setHint] = useState(false);
  const [done, setDone] = useState(false);
  const shown = useMatrixTween(M);

  const reset = () => {
    setM(I2);
    setSeq([]);
    setMatched(false);
    setAnswer(null);
    setHint(false);
  };

  useEffect(() => {
    if (!matched && same(M, level.T)) setMatched(true);
  }, [M, level, matched]);

  const { ref, handlers } = useSvgDrag<'i' | 'j'>(
    W,
    H,
    (px, py) => {
      if (level.kind !== 'drag' || matched) return null;
      const ip = apply(M, [1, 0]),
        jp = apply(M, [0, 1]);
      if (Math.hypot(X(ip[0]) - px, Y(ip[1]) - py) < 18) return 'i';
      if (Math.hypot(X(jp[0]) - px, Y(jp[1]) - py) < 18) return 'j';
      return null;
    },
    (id, px, py) => {
      const sn = (v: number) => Math.max(-R, Math.min(R, Math.round(v * 2) / 2));
      const x = sn((px - W / 2) / s),
        y = sn((H / 2 - py) / s);
      setM((m) => (id === 'i' ? [[x, m[0][1]], [y, m[1][1]]] : [[m[0][0], x], [m[1][0], y]]));
    },
  );

  const press = (gname: string) => {
    if (matched || level.kind !== 'compose') return;
    setSeq((q) => [...q, gname]);
    setM((m) => mmul(GATES[gname].M, m));
  };
  const undo = () => {
    if (level.kind !== 'compose' || matched) return;
    const q = seq.slice(0, -1);
    setSeq(q);
    setM(q.reduce<M2>((acc, gn) => mmul(GATES[gn].M, acc), I2));
  };

  const levelPoints = (): number => {
    if (level.kind === 'drag') return 100 + (answer === level.q.answer ? 50 : 0);
    const n = seq.length;
    return n <= level.par ? 150 : n <= level.par + 2 ? 100 : 60;
  };

  const next = () => {
    const pts = levelPoints();
    const ns = score + pts;
    setScore(ns);
    setResults((r0) => [...r0, `${level.name}: +${pts}`]);
    if (li + 1 >= LEVELS.length) {
      const max = LEVELS.reduce((a, l) => a + (l.kind === 'drag' ? 150 : 150), 0);
      g.finish(ns, true, { score: ns });
      if (ns >= max) g.unlock('transformation-master');
      setDone(true);
    } else {
      setLi(li + 1);
      reset();
    }
  };

  const shapePts = (m: M2) => SHAPE.map((p) => apply(m, p)).map(([x, y]) => `${X(x)},${Y(y)}`).join(' ');
  const ip = apply(shown, [1, 0]),
    jp = apply(shown, [0, 1]);
  const L = 10;
  const gridLines: React.ReactNode[] = [];
  for (let k = -6; k <= 6; k++) {
    const a = apply(shown, [k, -L]),
      b = apply(shown, [k, L]),
      c2 = apply(shown, [-L, k]),
      d = apply(shown, [L, k]);
    gridLines.push(<line key={`a${k}`} x1={X(a[0])} y1={Y(a[1])} x2={X(b[0])} y2={Y(b[1])} stroke="#2d6f86" strokeOpacity={k === 0 ? 0.9 : 0.45} />);
    gridLines.push(<line key={`b${k}`} x1={X(c2[0])} y1={Y(c2[1])} x2={X(d[0])} y2={Y(d[1])} stroke="#2d6f86" strokeOpacity={k === 0 ? 0.9 : 0.45} />);
  }

  return (
    <div style={{ position: 'relative' }}>
      <HowToPlay defaultOpen={li === 0}>
        A matrix is a machine that moves the whole plane. In each level, find the matrix that carries the pink <b>F</b> onto the dashed target. In <b>drag</b> levels you move the images of the basis vectors directly (the columns of the matrix); a quick question about the matrix follows for bonus
        points. In <b>gate</b> levels you can only press buttons that multiply by fixed matrices: match the target in as few presses as possible.
      </HowToPlay>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <b style={{ fontSize: '1.1rem' }}>
            Level {li + 1}/{LEVELS.length}: {level.name}
          </b>{' '}
          <span className="pill">{level.kind === 'drag' ? 'drag the basis' : 'gates only'}</span>
          <div className="dim" style={{ fontSize: '0.92rem', marginTop: 4 }}>
            <RichText text={level.brief} />
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Stat label="score" value={score} color="#fcd34d" />
          {level.kind === 'compose' && <Stat label="moves / par" value={`${seq.length}/${level.par}`} color={seq.length <= level.par ? '#83c167' : '#fc6255'} />}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,1fr)', gap: 14 }}>
        <svg ref={ref} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', touchAction: 'none', userSelect: 'none' }} {...handlers}>
          <rect width={W} height={H} rx={12} fill="#0b0e15" />
          {Array.from({ length: 2 * R + 1 }, (_, i) => i - R).map((k) => (
            <g key={k}>
              <line x1={X(k)} x2={X(k)} y1={0} y2={H} stroke="#161b26" />
              <line y1={Y(k)} y2={Y(k)} x1={0} x2={W} stroke="#161b26" />
            </g>
          ))}
          {gridLines}
          <polygon points={shapePts(level.T)} fill="#83c167" fillOpacity={matched ? 0.25 : 0.06} stroke="#83c167" strokeWidth={2} strokeDasharray={matched ? undefined : '6 5'} />
          <polygon points={shapePts(shown)} fill="#e07ab6" fillOpacity={0.4} stroke="#e07ab6" strokeWidth={1.8} />
          {hint && (
            <g>
              <circle cx={X(level.T[0][0])} cy={Y(level.T[1][0])} r={12} fill="none" stroke="#83c167" strokeDasharray="3 3" />
            </g>
          )}
          <Arrow x1={X(0)} y1={Y(0)} x2={X(ip[0])} y2={Y(ip[1])} color="#83c167" width={3.4} />
          <Arrow x1={X(0)} y1={Y(0)} x2={X(jp[0])} y2={Y(jp[1])} color="#fc6255" width={3.4} />
          {level.kind === 'drag' && !matched && (
            <>
              <circle cx={X(ip[0])} cy={Y(ip[1])} r={9} fill="#83c167" fillOpacity={0.3} stroke="#83c167" style={{ cursor: 'grab' }} />
              <circle cx={X(jp[0])} cy={Y(jp[1])} r={9} fill="#fc6255" fillOpacity={0.3} stroke="#fc6255" style={{ cursor: 'grab' }} />
            </>
          )}
          {matched && (
            <text x={W / 2} y={36} fill="#83c167" fontSize={22} fontWeight={700} textAnchor="middle">
              ✓ Match!
              <animate attributeName="opacity" values="0;1" dur="0.4s" />
            </text>
          )}
        </svg>
        <div className="col" style={{ gap: 10 }}>
          <div style={{ fontSize: '1.1rem' }}>
            <Tex>{`M = ${matTex(M)}`}</Tex>
          </div>
          {level.kind === 'compose' && (
            <>
              <div className="row" style={{ gap: 6 }}>
                {level.gates.map((gn) => (
                  <button key={gn} className="btn" disabled={matched} onClick={() => press(gn)} title={GATES[gn].desc}>
                    {GATES[gn].label}
                    <span className="faint" style={{ fontSize: '0.72rem', marginLeft: 6 }}>
                      {GATES[gn].desc}
                    </span>
                  </button>
                ))}
              </div>
              <div className="mono dim" style={{ fontSize: '0.85rem' }}>
                pressed: {seq.length ? seq.map((q) => GATES[q].label).join(' → ') : '(nothing yet)'}
                {seq.length > 0 && (
                  <>
                    <br />
                    matrix = {[...seq].reverse().map((q) => GATES[q].label).join('·')}
                  </>
                )}
              </div>
              <div className="row" style={{ gap: 6 }}>
                <button className="btn small" disabled={!seq.length || matched} onClick={undo}>
                  ↶ Undo
                </button>
                <button className="btn small" disabled={!seq.length || matched} onClick={reset}>
                  Reset
                </button>
              </div>
            </>
          )}
          {level.kind === 'drag' && !matched && (
            <button className="btn small ghost" onClick={() => setHint(true)} disabled={hint} style={{ alignSelf: 'flex-start' }}>
              Hint: where does î go?
            </button>
          )}
          {matched && level.kind === 'drag' && (
            <div className="panel pop" style={{ padding: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>
                Bonus: <RichText text={level.q.prompt} />
              </div>
              <div className="row" style={{ gap: 6 }}>
                {level.q.options.map((o, i) => (
                  <button
                    key={i}
                    className={`btn small ${answer === null ? '' : i === level.q.answer ? 'primary' : i === answer ? 'danger' : ''}`}
                    disabled={answer !== null}
                    onClick={() => setAnswer(i)}
                  >
                    {o}
                  </button>
                ))}
              </div>
              {answer !== null && (
                <div className="dim" style={{ fontSize: '0.88rem', marginTop: 8 }}>
                  {answer === level.q.answer ? '✓ +50. ' : '✗ '}
                  <RichText text={level.q.explain} />
                </div>
              )}
              {answer !== null && (
                <button className="btn primary small" style={{ marginTop: 10 }} onClick={next}>
                  {li + 1 >= LEVELS.length ? 'Finish' : 'Next level →'}
                </button>
              )}
            </div>
          )}
          {matched && level.kind === 'compose' && (
            <div className="panel pop" style={{ padding: 12, borderColor: 'var(--green)' }}>
              <div style={{ color: 'var(--green)', fontWeight: 700 }}>
                Matched in {seq.length} {seq.length === 1 ? 'move' : 'moves'} {seq.length <= level.par ? '(par!)' : ''}
              </div>
              <div className="dim" style={{ fontSize: '0.88rem', marginTop: 6 }}>
                <RichText text={level.lesson} />
              </div>
              <button className="btn primary small" style={{ marginTop: 10 }} onClick={next}>
                {li + 1 >= LEVELS.length ? 'Finish' : 'Next level →'}
              </button>
            </div>
          )}
          <div className="faint mono" style={{ fontSize: '0.78rem' }}>
            {results.join(' · ')}
          </div>
        </div>
      </div>
      {done && (
        <GameOverlay
          title="All transformations matched!"
          onClose={() => {
            setDone(false);
            setLi(0);
            setScore(0);
            setResults([]);
            reset();
          }}
        >
          Final score: <b>{score}</b> / {LEVELS.length * 150}.
          <br />
          Columns are where the basis vectors land; composing transformations multiplies matrices (right to left); and order matters. Swap X, Z and H for qubit gates and this is exactly how quantum circuits are built.
        </GameOverlay>
      )}
    </div>
  );
}
