import React, { useMemo, useRef, useState } from 'react';
import { Widget, Segmented, Toggle, Tex, useAnimationFrame } from '../../../components/ui';
import { c, add, mul, conj, abs, arg, expi, type C } from '../../../engine/complex';
import { useChallengeGate } from '../../../components/lesson/gates';
import { useProgress } from '../../../state/progress';
import { Arrow, useSvgDrag, arcPath, fx, deg } from './common';

type Mode = 'mul' | 'add' | 'conj';

const W = 480,
  H = 480;

export interface ComplexPlaygroundProps {
  initialZ?: [number, number];
  initialW?: [number, number];
  mode?: Mode;
  /** Hide the mode switcher (e.g. lock to multiplication). */
  lockMode?: boolean;
  /** Plot range: the plane shows [-range, range]². */
  range?: number;
  /** Challenge: z is fixed, drag w so that z·w lands on target. */
  challenge?: { z: [number, number]; target: [number, number]; id: string };
  title?: string;
}

function polarTex(z: C, name: string) {
  const r = abs(z);
  if (r < 1e-9) return `${name} = 0`;
  const d = deg(arg(z));
  return `${name} = ${fx(z.re)} ${z.im < 0 ? '-' : '+'} ${fx(Math.abs(z.im))}i = ${fx(r)}\\,e^{i\\,${d.toFixed(0)}^\\circ}`;
}

/** Draggable complex plane: z, w, and z·w / z+w / z̄, with an optional e^{iθt} spinner. */
export function ComplexPlayground({ initialZ = [1.5, 0.8], initialW = [0.6, 1.0], mode: mode0 = 'mul', lockMode, range = 2.6, challenge, title }: ComplexPlaygroundProps) {
  const [z, setZ] = useState<C>(challenge ? c(...challenge.z) : c(...initialZ));
  const [w, setW] = useState<C>(c(...(challenge ? [1, 0] as [number, number] : initialW)));
  const [mode, setMode] = useState<Mode>(challenge ? 'mul' : mode0);
  const [spin, setSpin] = useState(false);
  const [trail, setTrail] = useState<C[]>([]);
  const theta = useRef(arg(c(...initialW)));
  const s = W / (2 * range);
  const X = (x: number) => W / 2 + x * s;
  const Y = (y: number) => H / 2 - y * s;
  const toC = (px: number, py: number) => c((px - W / 2) / s, (H / 2 - py) / s);

  const snap = (p: C): C => {
    const g = 0.5;
    const sx = Math.round(p.re / g) * g,
      sy = Math.round(p.im / g) * g;
    if (Math.abs(sx - p.re) < 0.07 && Math.abs(sy - p.im) < 0.07) return c(sx, sy);
    // snap onto the unit circle at 15° steps
    const r = abs(p);
    if (Math.abs(r - 1) < 0.05) {
      const a = Math.round(arg(p) / (Math.PI / 12)) * (Math.PI / 12);
      if (Math.abs(a - arg(p)) < 0.05) return expi(a);
    }
    return p;
  };

  const result = mode === 'mul' ? mul(z, w) : mode === 'add' ? add(z, w) : conj(z);

  const recordQuiz = useProgress((st) => st.recordQuiz);
  const solvedBefore = useProgress((st) => (challenge ? !!st.quizzes[`cplx:${challenge.id}`]?.correct : false));
  const target = challenge ? c(...challenge.target) : null;
  const hit = !!target && abs(add(mul(z, w), c(-target.re, -target.im))) < 0.12;
  const [solved, setSolved] = useState(false);
  useChallengeGate(challenge?.id ?? 'cplx-none', !challenge || solved || solvedBefore);

  const { ref, handlers } = useSvgDrag<'z' | 'w'>(
    W,
    H,
    (px, py) => {
      const d = (p: C) => Math.hypot(X(p.re) - px, Y(p.im) - py);
      if (!spin && d(w) < 22) return 'w';
      if (!challenge && d(z) < 22) return 'z';
      return null;
    },
    (id, px, py) => {
      const p = snap(toC(px, py));
      const lim = (v: number) => Math.max(-range, Math.min(range, v));
      const q = c(lim(p.re), lim(p.im));
      if (id === 'z') setZ(q);
      else setW(q);
    },
    () => {
      if (challenge && target && !solved) {
        // check on release
      }
    },
  );

  // check challenge whenever w changes
  React.useEffect(() => {
    if (challenge && hit && !solved) {
      setSolved(true);
      recordQuiz(`cplx:${challenge.id}`, true, 20);
    }
  }, [hit, challenge, solved, recordQuiz]);

  useAnimationFrame((dt) => {
    theta.current += dt * 0.9;
    const nw = expi(theta.current);
    setW(nw);
    if (mode === 'mul') setTrail((tr) => [...tr.slice(-140), mul(z, nw)]);
    else if (mode === 'add') setTrail((tr) => [...tr.slice(-140), add(z, nw)]);
  }, spin);

  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let v = -Math.floor(range * 2) / 2; v <= range + 1e-9; v += 0.5) out.push(+v.toFixed(2));
    return out;
  }, [range]);

  const resColor = mode === 'mul' ? '#e07ab6' : mode === 'add' ? '#83c167' : '#5cd0b3';
  const resName = mode === 'mul' ? 'z\\,w' : mode === 'add' ? 'z+w' : '\\bar z';
  const thz = arg(z),
    thw = arg(w),
    thr = arg(result);

  return (
    <Widget title={title ?? (challenge ? 'Challenge — make z·w hit the target' : 'Complex plane playground')}>
      {!lockMode && !challenge && (
        <div className="row" style={{ marginBottom: 10, justifyContent: 'space-between' }}>
          <Segmented<Mode>
            options={[
              { value: 'mul', label: 'z · w' },
              { value: 'add', label: 'z + w' },
              { value: 'conj', label: 'conjugate z̄' },
            ]}
            value={mode}
            onChange={(m) => {
              setMode(m);
              setTrail([]);
            }}
          />
          {mode !== 'conj' && (
            <Toggle
              label={<span>spin w = e^(iθt)</span>}
              value={spin}
              onChange={(v) => {
                setSpin(v);
                setTrail([]);
                theta.current = arg(w);
              }}
            />
          )}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 1fr)', gap: 16, alignItems: 'center' }}>
        <svg ref={ref} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', touchAction: 'none', cursor: 'crosshair', userSelect: 'none' }} {...handlers}>
          <rect x={0} y={0} width={W} height={H} fill="#0d1018" rx={10} />
          {ticks.map((t) => (
            <g key={t}>
              <line x1={X(t)} x2={X(t)} y1={0} y2={H} stroke={Number.isInteger(t) ? '#232b3b' : '#181e2a'} />
              <line y1={Y(t)} y2={Y(t)} x1={0} x2={W} stroke={Number.isInteger(t) ? '#232b3b' : '#181e2a'} />
              {Number.isInteger(t) && t !== 0 && (
                <>
                  <text x={X(t)} y={Y(0) + 15} fill="#6b7385" fontSize={11} textAnchor="middle">
                    {t}
                  </text>
                  <text x={X(0) - 6} y={Y(t) + 4} fill="#6b7385" fontSize={11} textAnchor="end">
                    {t === 1 ? 'i' : t === -1 ? '−i' : `${t}i`}
                  </text>
                </>
              )}
            </g>
          ))}
          <line x1={0} x2={W} y1={Y(0)} y2={Y(0)} stroke="#55607a" strokeWidth={1.3} />
          <line y1={0} y2={H} x1={X(0)} x2={X(0)} stroke="#55607a" strokeWidth={1.3} />
          <text x={W - 8} y={Y(0) - 8} fill="#9aa3b5" fontSize={12} textAnchor="end" fontStyle="italic">
            Re
          </text>
          <text x={X(0) + 8} y={14} fill="#9aa3b5" fontSize={12} fontStyle="italic">
            Im
          </text>
          <circle cx={X(0)} cy={Y(0)} r={s} fill="none" stroke="#3f4a63" strokeDasharray="4 4" />

          {/* trail */}
          {trail.length > 1 && (
            <polyline points={trail.map((p) => `${X(p.re)},${Y(p.im)}`).join(' ')} fill="none" stroke={resColor} strokeOpacity={0.45} strokeWidth={2} />
          )}

          {/* target */}
          {target && (
            <g>
              <circle cx={X(target.re)} cy={Y(target.im)} r={0.12 * s} fill={hit ? '#83c16744' : 'none'} stroke="#83c167" strokeWidth={2} strokeDasharray={hit ? undefined : '4 3'} />
              <circle cx={X(target.re)} cy={Y(target.im)} r={3} fill="#83c167" />
              <text x={X(target.re) + 12} y={Y(target.im) - 10} fill="#83c167" fontSize={12}>
                target
              </text>
            </g>
          )}

          {/* angle arcs */}
          {mode === 'mul' && abs(z) > 0.05 && abs(w) > 0.05 && (
            <g>
              <path d={arcPath(X(0), Y(0), 0.3 * s, 0, thz)} stroke="#58c4dd" fill="none" strokeWidth={2} />
              <path d={arcPath(X(0), Y(0), 0.42 * s, 0, thw)} stroke="#fcd34d" fill="none" strokeWidth={2} />
              <path d={arcPath(X(0), Y(0), 0.54 * s, 0, thz + thw > Math.PI ? thz + thw - 2 * Math.PI : thz + thw < -Math.PI ? thz + thw + 2 * Math.PI : thz + thw)} stroke={resColor} fill="none" strokeWidth={2} />
            </g>
          )}

          {mode === 'add' && (
            <g>
              <Arrow x1={X(z.re)} y1={Y(z.im)} x2={X(result.re)} y2={Y(result.im)} color="#fcd34d" width={1.6} dashed opacity={0.6} />
              <Arrow x1={X(w.re)} y1={Y(w.im)} x2={X(result.re)} y2={Y(result.im)} color="#58c4dd" width={1.6} dashed opacity={0.6} />
            </g>
          )}
          {mode === 'conj' && (
            <g>
              <line x1={X(z.re)} x2={X(z.re)} y1={Y(z.im)} y2={Y(-z.im)} stroke="#5cd0b3" strokeDasharray="3 4" />
              <circle cx={X(abs(z) ** 2)} cy={Y(0)} r={5} fill="#fcd34d" opacity={abs(z) ** 2 <= range ? 1 : 0} />
              {abs(z) ** 2 <= range && (
                <text x={X(abs(z) ** 2)} y={Y(0) - 10} fill="#fcd34d" fontSize={12} textAnchor="middle">
                  z·z̄
                </text>
              )}
            </g>
          )}

          {/* spin projections */}
          {spin && (
            <g>
              <line x1={X(w.re)} y1={Y(w.im)} x2={X(w.re)} y2={Y(0)} stroke="#fcd34d" strokeDasharray="2 3" opacity={0.7} />
              <line x1={X(w.re)} y1={Y(w.im)} x2={X(0)} y2={Y(w.im)} stroke="#fcd34d" strokeDasharray="2 3" opacity={0.7} />
              <circle cx={X(w.re)} cy={Y(0)} r={4} fill="#58c4dd" />
              <circle cx={X(0)} cy={Y(w.im)} r={4} fill="#fc6255" />
              <text x={X(w.re)} y={Y(0) + 28} fill="#58c4dd" fontSize={11} textAnchor="middle">
                cos θ
              </text>
              <text x={X(0) + 8} y={Y(w.im) - 6} fill="#fc6255" fontSize={11}>
                sin θ
              </text>
            </g>
          )}

          {/* vectors */}
          <Arrow x1={X(0)} y1={Y(0)} x2={X(result.re)} y2={Y(result.im)} color={resColor} width={3.2} glow />
          {mode !== 'conj' && <Arrow x1={X(0)} y1={Y(0)} x2={X(w.re)} y2={Y(w.im)} color="#fcd34d" width={2.6} />}
          <Arrow x1={X(0)} y1={Y(0)} x2={X(z.re)} y2={Y(z.im)} color="#58c4dd" width={2.6} />
          {!challenge && <circle cx={X(z.re)} cy={Y(z.im)} r={9} fill="#58c4dd" fillOpacity={0.25} stroke="#58c4dd" style={{ cursor: 'grab' }} />}
          {mode !== 'conj' && !spin && <circle cx={X(w.re)} cy={Y(w.im)} r={9} fill="#fcd34d" fillOpacity={0.25} stroke="#fcd34d" style={{ cursor: 'grab' }} />}
          <text x={X(z.re) + 10} y={Y(z.im) - 10} fill="#58c4dd" fontSize={15} fontStyle="italic" fontWeight={600}>
            z
          </text>
          {mode !== 'conj' && (
            <text x={X(w.re) + 10} y={Y(w.im) - 10} fill="#fcd34d" fontSize={15} fontStyle="italic" fontWeight={600}>
              w
            </text>
          )}
          <text x={X(result.re) + 10} y={Y(result.im) + 18} fill={resColor} fontSize={15} fontStyle="italic" fontWeight={600}>
            {mode === 'mul' ? 'zw' : mode === 'add' ? 'z+w' : 'z̄'}
          </text>
        </svg>

        <div className="col" style={{ gap: 10, fontSize: '0.95rem' }}>
          <div style={{ color: '#58c4dd' }}>
            <Tex>{polarTex(z, 'z')}</Tex>
          </div>
          {mode !== 'conj' && (
            <div style={{ color: '#fcd34d' }}>
              <Tex>{polarTex(w, 'w')}</Tex>
            </div>
          )}
          <div style={{ color: resColor }}>
            <Tex>{polarTex(result, resName)}</Tex>
          </div>
          <div className="panel" style={{ padding: 10, fontSize: '0.88rem' }}>
            {mode === 'mul' && (
              <>
                <div>
                  <b>Lengths multiply:</b> <Tex>{`|z|\\,|w| = ${fx(abs(z))}\\times${fx(abs(w))} = ${fx(abs(z) * abs(w))}`}</Tex>
                </div>
                <div style={{ marginTop: 4 }}>
                  <b>Angles add:</b> <Tex>{`${deg(thz).toFixed(0)}^\\circ + ${deg(thw).toFixed(0)}^\\circ \\equiv ${deg(thr).toFixed(0)}^\\circ`}</Tex>
                </div>
              </>
            )}
            {mode === 'add' && (
              <div>
                <b>Tip-to-tail:</b> components add, <Tex>{`(${fx(z.re)}+${fx(w.re)}) + (${fx(z.im)}+${fx(w.im)})i`}</Tex>. Lengths do <i>not</i> simply add:{' '}
                <Tex>{`|z+w| = ${fx(abs(result))} \\le ${fx(abs(z) + abs(w))}`}</Tex>
              </div>
            )}
            {mode === 'conj' && (
              <div>
                <b>Mirror in the real axis:</b> same length, opposite angle. And <Tex>{`z\\bar z = |z|^2 = ${fx(abs(z) ** 2)}`}</Tex>, always real and ≥ 0.
              </div>
            )}
          </div>
          {challenge && (
            <div className={`pill ${hit || solved ? 'good' : 'warn'}`} style={{ alignSelf: 'flex-start' }}>
              {hit || solved ? '✓ On target! z·w = ' + `${fx(mul(z, w).re)} ${mul(z, w).im < 0 ? '−' : '+'} ${fx(Math.abs(mul(z, w).im))}i` : 'Drag w (yellow). Think: what length and angle must w have?'}
            </div>
          )}
          {!challenge && (
            <div className="faint" style={{ fontSize: '0.8rem' }}>
              Drag the tips of <span style={{ color: '#58c4dd' }}>z</span>
              {mode !== 'conj' && (
                <>
                  {' '}
                  and <span style={{ color: '#fcd34d' }}>w</span>
                </>
              )}
              . Points snap to the half-grid and to 15° steps on the unit circle.
            </div>
          )}
        </div>
      </div>
    </Widget>
  );
}
