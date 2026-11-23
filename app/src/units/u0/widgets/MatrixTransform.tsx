import React, { useEffect, useState } from 'react';
import { Widget, Slider, Segmented, Tex, Toggle, fmtPi } from '../../../components/ui';
import { useChallengeGate } from '../../../components/lesson/gates';
import { useProgress } from '../../../state/progress';
import { Arrow, useSvgDrag, useTween, fx } from './common';

export type M2 = [[number, number], [number, number]];

const W = 460,
  H = 460;

export const I2: M2 = [
  [1, 0],
  [0, 1],
];

export function apply(M: M2, v: [number, number]): [number, number] {
  return [M[0][0] * v[0] + M[0][1] * v[1], M[1][0] * v[0] + M[1][1] * v[1]];
}
export function mmul(A: M2, B: M2): M2 {
  return [
    [A[0][0] * B[0][0] + A[0][1] * B[1][0], A[0][0] * B[0][1] + A[0][1] * B[1][1]],
    [A[1][0] * B[0][0] + A[1][1] * B[1][0], A[1][0] * B[0][1] + A[1][1] * B[1][1]],
  ];
}
const lerpM = (A: M2, B: M2, t: number): M2 => [
  [A[0][0] + (B[0][0] - A[0][0]) * t, A[0][1] + (B[0][1] - A[0][1]) * t],
  [A[1][0] + (B[1][0] - A[1][0]) * t, A[1][1] + (B[1][1] - A[1][1]) * t],
];

/** Real eigen-decomposition of a 2×2 real matrix (null if eigenvalues are complex). */
export function eig2(M: M2): { values: [number, number]; vectors: [[number, number], [number, number]] } | { complex: [number, number] } {
  const [[a, b], [c, d]] = M;
  const tr = a + d,
    det = a * d - b * c;
  const disc = (tr * tr) / 4 - det;
  if (disc < -1e-9) return { complex: [tr / 2, Math.sqrt(-disc)] };
  const r = Math.sqrt(Math.max(0, disc));
  const l1 = tr / 2 + r,
    l2 = tr / 2 - r;
  const vec = (l: number, other?: [number, number]): [number, number] => {
    let v: [number, number];
    if (Math.abs(b) > 1e-9) v = [b, l - a];
    else if (Math.abs(c) > 1e-9) v = [l - d, c];
    else v = Math.abs(a - l) < 1e-9 ? (other && Math.abs(other[0]) > 0.5 ? [0, 1] : [1, 0]) : [0, 1];
    const n = Math.hypot(v[0], v[1]);
    return [v[0] / n, v[1] / n];
  };
  const v1 = vec(l1);
  let v2 = vec(l2, v1);
  if (Math.abs(l1 - l2) < 1e-9) {
    // degenerate: pick an orthogonal vector if the matrix is a multiple of I
    if (Math.abs(b) < 1e-9 && Math.abs(c) < 1e-9) v2 = [-v1[1], v1[0]];
  }
  return { values: [l1, l2], vectors: [v1, v2] };
}

export function classify(M: M2) {
  const [[a, b], [c, d]] = M;
  const e = 1e-6;
  const sym = Math.abs(b - c) < e;
  const MtM = mmul([[a, c], [b, d]], M);
  const orth = Math.abs(MtM[0][0] - 1) < e && Math.abs(MtM[1][1] - 1) < e && Math.abs(MtM[0][1]) < e;
  const M2_ = mmul(M, M);
  const proj = sym && [0, 1].every((i) => [0, 1].every((j) => Math.abs(M2_[i][j] - M[i][j]) < e));
  return { sym, orth, proj, det: a * d - b * c, tr: a + d };
}

const PRESETS: { name: string; M: M2; note: string }[] = [
  { name: 'Rotate 45°', M: [[Math.SQRT1_2, -Math.SQRT1_2], [Math.SQRT1_2, Math.SQRT1_2]], note: 'Orthogonal: lengths and angles preserved. No real eigenvectors: every direction turns.' },
  { name: 'Shear', M: [[1, 1], [0, 1]], note: 'Only one eigen-direction (the x-axis). Not symmetric, not orthogonal.' },
  { name: 'Swap (X)', M: [[0, 1], [1, 0]], note: 'Reflection across y = x. Symmetric AND orthogonal: eigenvalues ±1 on perpendicular lines.' },
  { name: 'Z', M: [[1, 0], [0, -1]], note: 'Reflection across the x-axis. Symmetric and orthogonal.' },
  { name: 'Hadamard', M: [[Math.SQRT1_2, Math.SQRT1_2], [Math.SQRT1_2, -Math.SQRT1_2]], note: 'A reflection: symmetric and orthogonal, eigenvalues ±1. You will meet it as the H gate.' },
  { name: 'Symmetric', M: [[2, 1], [1, 2]], note: 'Symmetric: real eigenvalues (3 and 1) on perpendicular lines.' },
  { name: 'Not symmetric', M: [[1, 1.5], [0, 2]], note: 'Real eigenvalues, but the eigen-directions are NOT perpendicular.' },
  { name: 'Project on x', M: [[1, 0], [0, 0]], note: 'Projector P = |0⟩⟨0|: squashes the plane onto the x-axis. P² = P, eigenvalues 1 and 0.' },
  { name: 'Project on 45°', M: [[0.5, 0.5], [0.5, 0.5]], note: 'Projector |+⟩⟨+| onto the diagonal line.' },
];

export interface MatrixTransformProps {
  /** Start with this matrix. */
  initial?: M2;
  /** Show the spectral-decomposition builder tab. */
  spectral?: boolean;
  /** Eigenvector hunt challenge: matrix fixed; drag v until Mv is parallel to v. */
  hunt?: { M: M2; id: string };
  title?: string;
}

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

/** 2×2 matrices as transformations of the plane, 3B1B-style: grid, basis vectors, eigen-lines, a probe vector. */
export function MatrixTransform({ initial, spectral = false, hunt, title }: MatrixTransformProps) {
  const [mode, setMode] = useState<'entries' | 'spectral'>(spectral ? 'spectral' : 'entries');
  const [M, setM] = useState<M2>(hunt ? hunt.M : initial ?? [[2, 1], [1, 2]]);
  const [lam1, setLam1] = useState(2);
  const [lam2, setLam2] = useState(0.5);
  const [alpha, setAlpha] = useState(Math.PI / 6);
  const [applied, setApplied] = useState(hunt ? 1 : 0);
  const [note, setNote] = useState<string>('');
  const [showEig, setShowEig] = useState(!hunt);
  const [probe, setProbe] = useState<[number, number]>(hunt ? [1.5, 0.3] : [1.2, -0.6]);
  const t = useTween(applied, 900);
  useEffect(() => {
    if (hunt) return;
    const id = setTimeout(() => setApplied(1), 500);
    return () => clearTimeout(id);
  }, [hunt]);

  const target: M2 =
    mode === 'spectral'
      ? (() => {
          const u = [Math.cos(alpha), Math.sin(alpha)],
            v = [-Math.sin(alpha), Math.cos(alpha)];
          return [
            [lam1 * u[0] * u[0] + lam2 * v[0] * v[0], lam1 * u[0] * u[1] + lam2 * v[0] * v[1]],
            [lam1 * u[1] * u[0] + lam2 * v[1] * v[0], lam1 * u[1] * u[1] + lam2 * v[1] * v[1]],
          ] as M2;
        })()
      : M;
  const A = lerpM(I2, target, t);
  const R = 4;
  const s = W / (2 * R);
  const X = (x: number) => W / 2 + x * s;
  const Y = (y: number) => H / 2 - y * s;
  const P = (v: [number, number]) => {
    const w = apply(A, v);
    return [X(w[0]), Y(w[1])] as [number, number];
  };

  const e = eig2(target);
  const cls = classify(target);
  const Av = apply(target, probe);
  const probeAngle = (() => {
    const n1 = Math.hypot(...probe),
      n2 = Math.hypot(...Av);
    if (n1 < 1e-6 || n2 < 1e-6) return 0;
    const cr = (probe[0] * Av[1] - probe[1] * Av[0]) / (n1 * n2);
    return Math.asin(Math.max(-1, Math.min(1, Math.abs(cr))));
  })();
  const parallel = Math.hypot(...probe) > 0.4 && (probeAngle < (2.5 * Math.PI) / 180 || Math.hypot(...Av) < 0.05);

  // challenge plumbing
  const recordQuiz = useProgress((st) => st.recordQuiz);
  const solvedBefore = useProgress((st) => (hunt ? !!st.quizzes[`eig:${hunt.id}`]?.correct : false));
  const [solved, setSolved] = useState(false);
  useChallengeGate(hunt?.id ?? 'eig-none', !hunt || solved || solvedBefore);
  useEffect(() => {
    if (hunt && parallel && !solved) {
      setSolved(true);
      setShowEig(true);
      recordQuiz(`eig:${hunt.id}`, true, 20);
    }
  }, [hunt, parallel, solved, recordQuiz]);

  const { ref, handlers } = useSvgDrag<'probe'>(
    W,
    H,
    (px, py) => {
      const [qx, qy] = [X(probe[0]), Y(probe[1])];
      return Math.hypot(qx - px, qy - py) < 18 ? 'probe' : null;
    },
    (_, px, py) => {
      const x = Math.max(-R, Math.min(R, (px - W / 2) / s)),
        y = Math.max(-R, Math.min(R, (H / 2 - py) / s));
      setProbe([x, y]);
    },
  );

  const lines: React.ReactNode[] = [];
  const L = 14;
  for (let k = -8; k <= 8; k++) {
    const [x1, y1] = P([k, -L]);
    const [x2, y2] = P([k, L]);
    const [x3, y3] = P([-L, k]);
    const [x4, y4] = P([L, k]);
    const strong = k === 0;
    lines.push(<line key={`v${k}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={strong ? '#9fd9e8' : '#2d6f86'} strokeWidth={strong ? 1.6 : 1} strokeOpacity={strong ? 0.9 : 0.75} />);
    lines.push(<line key={`h${k}`} x1={x3} y1={y3} x2={x4} y2={y4} stroke={strong ? '#9fd9e8' : '#2d6f86'} strokeWidth={strong ? 1.6 : 1} strokeOpacity={strong ? 0.9 : 0.75} />);
  }
  const circle = Array.from({ length: 73 }, (_, i) => {
    const a = (i / 72) * 2 * Math.PI;
    return P([Math.cos(a), Math.sin(a)]).join(',');
  }).join(' ');
  const shape = SHAPE.map((p) => P(p).join(',')).join(' ');
  const [ix, iy] = P([1, 0]);
  const [jx, jy] = P([0, 1]);
  const [vx, vy] = [X(probe[0]), Y(probe[1])];
  const Avt = apply(A, probe);

  const matTex = (m: M2) => `\\begin{pmatrix} ${fx(m[0][0])} & ${fx(m[0][1])} \\\\ ${fx(m[1][0])} & ${fx(m[1][1])} \\end{pmatrix}`;

  return (
    <Widget title={title ?? (hunt ? 'Eigenvector hunt' : 'Matrices as transformations')}>
      {spectral && !hunt && (
        <div style={{ marginBottom: 10 }}>
          <Segmented
            options={[
              { value: 'entries', label: 'Edit entries' },
              { value: 'spectral', label: 'Build from eigenvalues' },
            ]}
            value={mode}
            onChange={(m) => setMode(m as 'entries' | 'spectral')}
          />
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
        <svg ref={ref} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', touchAction: 'none', userSelect: 'none' }} {...handlers}>
          <rect width={W} height={H} rx={10} fill="#0b0e15" />
          {/* static background grid */}
          {Array.from({ length: 2 * R + 1 }, (_, i) => i - R).map((k) => (
            <g key={k}>
              <line x1={X(k)} x2={X(k)} y1={0} y2={H} stroke="#1a1f2b" />
              <line y1={Y(k)} y2={Y(k)} x1={0} x2={W} stroke="#1a1f2b" />
            </g>
          ))}
          {lines}
          {/* eigen-lines */}
          {showEig && 'values' in e &&
            e.vectors.map((v, i) => (
              <g key={i}>
                <line x1={X(-v[0] * 10)} y1={Y(-v[1] * 10)} x2={X(v[0] * 10)} y2={Y(v[1] * 10)} stroke="#fcd34d" strokeDasharray="7 6" strokeWidth={1.6} strokeOpacity={0.85} />
                <text x={X(v[0] * (i ? -3.3 : 3.3)) + 6} y={Y(v[1] * (i ? -3.3 : 3.3)) - 6} fill="#fcd34d" fontSize={13}>
                  λ = {fx(e.values[i])}
                </text>
              </g>
            ))}
          <polygon points={circle} fill="#fcd34d" fillOpacity={0.05} stroke="#fcd34d" strokeOpacity={0.5} strokeWidth={1.4} />
          <polygon points={shape} fill="#e07ab6" fillOpacity={0.35} stroke="#e07ab6" strokeWidth={1.6} />
          <Arrow x1={X(0)} y1={Y(0)} x2={ix} y2={iy} color="#83c167" width={3.2} />
          <Arrow x1={X(0)} y1={Y(0)} x2={jx} y2={jy} color="#fc6255" width={3.2} />
          <text x={ix + 6} y={iy + 16} fill="#83c167" fontSize={14} fontWeight={600}>
            î
          </text>
          <text x={jx + 6} y={jy - 6} fill="#fc6255" fontSize={14} fontWeight={600}>
            ĵ
          </text>
          {/* probe */}
          <Arrow x1={X(0)} y1={Y(0)} x2={X(Avt[0])} y2={Y(Avt[1])} color={parallel ? '#fcd34d' : '#ffffff'} width={2.6} opacity={0.85} dashed />
          <Arrow x1={X(0)} y1={Y(0)} x2={vx} y2={vy} color="#ffffff" width={2.4} />
          <circle cx={vx} cy={vy} r={8} fill="#fff" fillOpacity={0.2} stroke="#fff" style={{ cursor: 'grab' }} />
          <text x={vx + 8} y={vy - 8} fill="#fff" fontSize={13} fontStyle="italic">
            v
          </text>
          <text x={X(Avt[0]) + 8} y={Y(Avt[1]) + 16} fill={parallel ? '#fcd34d' : '#cfd6e4'} fontSize={13} fontStyle="italic">
            Mv
          </text>
        </svg>

        <div className="col" style={{ gap: 8 }}>
          <div style={{ fontSize: '1.05rem' }}>
            <Tex>{`M = ${matTex(target)}`}</Tex>
          </div>
          {mode === 'entries' && !hunt && (
            <>
              <div className="row" style={{ gap: 6 }}>
                {PRESETS.map((p) => (
                  <button
                    key={p.name}
                    className="btn small"
                    onClick={() => {
                      setM(p.M.map((r) => [...r]) as M2);
                      setNote(p.note);
                      setApplied(0);
                      setTimeout(() => setApplied(1), 60);
                    }}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
              {(['00', '01', '10', '11'] as const).map((ij) => {
                const i = +ij[0],
                  j = +ij[1];
                return (
                  <Slider
                    key={ij}
                    label={<span className="mono">M{i + 1}{j + 1}</span>}
                    value={M[i][j]}
                    min={-3}
                    max={3}
                    step={0.05}
                    onChange={(v) => {
                      setM((m) => {
                        const n = m.map((r) => [...r]) as M2;
                        n[i][j] = v;
                        return n;
                      });
                      setNote('');
                      setApplied(1);
                    }}
                  />
                );
              })}
            </>
          )}
          {mode === 'spectral' && (
            <>
              <Slider label="λ₁" value={lam1} min={-2.5} max={2.5} step={0.05} onChange={(v) => { setLam1(v); setApplied(1); }} />
              <Slider label="λ₂" value={lam2} min={-2.5} max={2.5} step={0.05} onChange={(v) => { setLam2(v); setApplied(1); }} />
              <Slider label="axis angle" value={alpha} min={0} max={Math.PI} step={Math.PI / 48} onChange={(v) => { setAlpha(v); setApplied(1); }} format={fmtPi} />
              <div style={{ fontSize: '0.9rem' }}>
                <Tex>{`M = ${fx(lam1)}\\,|u\\rangle\\langle u| + ${fx(lam2)}\\,|w\\rangle\\langle w|`}</Tex>
              </div>
              <div className="faint" style={{ fontSize: '0.8rem' }}>
                <Tex>{`|u\\rangle = (${fx(Math.cos(alpha))}, ${fx(Math.sin(alpha))}),\\ |w\\rangle = (${fx(-Math.sin(alpha))}, ${fx(Math.cos(alpha))})`}</Tex>. Any real symmetric matrix can be built this way.
              </div>
            </>
          )}
          {!hunt && (
            <div className="row" style={{ gap: 6 }}>
              <button className="btn small primary" onClick={() => { setApplied(0); setTimeout(() => setApplied(1), 50); }}>
                ▶ Animate
              </button>
              <button className="btn small" onClick={() => setApplied(applied > 0.5 ? 0 : 1)}>
                {applied > 0.5 ? 'Undo (show I)' : 'Apply M'}
              </button>
              <Toggle label="eigen-lines" value={showEig} onChange={setShowEig} />
            </div>
          )}
          <div className="row" style={{ gap: 6, fontSize: '0.8rem' }}>
            <span className={`pill ${cls.sym ? 'good' : ''}`}>{cls.sym ? '✓' : '✗'} symmetric (Hermitian)</span>
            <span className={`pill ${cls.orth ? 'good' : ''}`}>{cls.orth ? '✓' : '✗'} orthogonal (unitary)</span>
            <span className={`pill ${cls.proj ? 'good' : ''}`}>{cls.proj ? '✓' : '✗'} projector</span>
          </div>
          <div className="mono faint" style={{ fontSize: '0.82rem' }}>
            det = {fx(cls.det)} · trace = {fx(cls.tr)} ·{' '}
            {'values' in e ? `eigenvalues ${fx(e.values[0])}, ${fx(e.values[1])}` : `eigenvalues ${fx(e.complex[0])} ± ${fx(e.complex[1])}i (complex: no real eigen-lines)`}
          </div>
          {note && <div className="dim" style={{ fontSize: '0.85rem' }}>{note}</div>}
          {hunt ? (
            <div className={`pill ${parallel || solved ? 'good' : 'warn'}`} style={{ alignSelf: 'flex-start' }}>
              {parallel ? '✓ Mv is parallel to v: you found an eigenvector!' : solved ? '✓ Found one. Can you find the other line too?' : `Drag v until Mv lies on the same line. Angle now ${((probeAngle * 180) / Math.PI).toFixed(1)}°`}
            </div>
          ) : (
            <div className="faint" style={{ fontSize: '0.8rem' }}>
              Drag the white vector <i>v</i>; the dashed arrow is <i>Mv</i>. It turns gold when <i>v</i> is an eigenvector. Pink shape and yellow unit circle show what <i>M</i> does to areas and lengths.
            </div>
          )}
        </div>
      </div>
    </Widget>
  );
}
