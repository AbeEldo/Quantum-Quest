import React, { useEffect, useRef, useState } from 'react';
import { Widget, Segmented } from '../../../components/ui';
import { phaseColor } from '../../../engine/complex';
import { useChallengeGate } from '../../../components/lesson/gates';
import { useProgress } from '../../../state/progress';
import { easeInOut, useWidth, pct } from './viz';
import { groverTheta, groverBestK, groverSuccess } from '../algos';

type V2 = [number, number];
type OpKind = 'oracle' | 'diffuser';

const N_OPTIONS = [4, 8, 16, 32, 64, 1024, 1 << 20];
const fmtN = (N: number) => (N >= 1 << 20 ? '2²⁰' : String(N));

const reflectOracle = (v: V2): V2 => [v[0], -v[1]];
const reflectAbout = (v: V2, th: number): V2 => {
  const s: V2 = [Math.cos(th), Math.sin(th)];
  const d = v[0] * s[0] + v[1] * s[1];
  return [2 * d * s[0] - v[0], 2 * d * s[1] - v[1]];
};

function markedPositions(N: number, M: number): number[] {
  if (N > 64) return [];
  const fr = M === 1 ? [0.62] : M === 2 ? [0.28, 0.72] : [0.2, 0.5, 0.83];
  return fr.map((f) => Math.min(N - 1, Math.floor(f * N)));
}

export interface GroverGeometryProps {
  /** Starting number of items. */
  initialN?: number;
  /** Optional gated challenge: reach success probability ≥ minP with N items. */
  goal?: { N: number; minP: number; challengeId: string };
}

/**
 * Grover's algorithm as geometry: the state lives in the plane spanned by |s'⟩ (uniform over unmarked items)
 * and |w⟩ (uniform over marked items). The oracle reflects across |s'⟩, the diffuser reflects about |s⟩,
 * and the pair rotates the state by 2θ. The amplitude bars are computed from the very same vector,
 * so both views animate in lock-step (a reflection is drawn as a straight-line "flip" through the mirror).
 */
export function GroverGeometry({ initialN = 16, goal }: GroverGeometryProps) {
  const [N, setN] = useState(initialN);
  const [M, setM] = useState(1);
  const theta = groverTheta(N, M);
  const start: V2 = [Math.cos(theta), Math.sin(theta)];
  const [vec, setVec] = useState<V2>(start);
  const [trail, setTrail] = useState<V2[]>([start]);
  const [queries, setQueries] = useState(0);
  const [iters, setIters] = useState(0);
  const [pending, setPending] = useState<OpKind[]>([]);
  const [anim, setAnim] = useState<null | { kind: OpKind; from: V2; to: V2; t: number; dur: number }>(null);
  const [lastOp, setLastOp] = useState<OpKind | null>(null);
  const reduced = useProgress((s) => s.settings.reducedMotion);
  const lastOpRef = useRef<OpKind | null>(null);
  useEffect(() => {
    lastOpRef.current = lastOp;
  }, [lastOp]);

  const recordQuiz = useProgress((s) => s.recordQuiz);
  const solvedBefore = useProgress((s) => (goal ? !!s.quizzes[`challenge:${goal.challengeId}`]?.correct : false));
  const pNow = vec[1] ** 2;
  const goalMet = !!goal && N === goal.N && pNow >= goal.minP && !anim;
  useChallengeGate(goal?.challengeId ?? 'u9-grover-none', !goal || goalMet || solvedBefore);
  useEffect(() => {
    if (goal && goalMet && !solvedBefore) recordQuiz(`challenge:${goal.challengeId}`, true, 25);
  }, [goalMet]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = (NN = N, MM = M) => {
    const th = groverTheta(NN, MM);
    const s0: V2 = [Math.cos(th), Math.sin(th)];
    setVec(s0);
    setTrail([s0]);
    setQueries(0);
    setIters(0);
    setPending([]);
    setAnim(null);
    setLastOp(null);
  };

  // start the next queued operation
  useEffect(() => {
    if (anim || pending.length === 0) return;
    const kind = pending[0];
    const to = kind === 'oracle' ? reflectOracle(vec) : reflectAbout(vec, theta);
    const dur = reduced ? 0 : pending.length > 12 ? 70 : pending.length > 4 ? 280 : 650;
    setAnim({ kind, from: vec, to, t: 0, dur });
  }, [anim, pending, vec, theta, reduced]);

  // run the animation
  useEffect(() => {
    if (!anim) return;
    let raf = 0;
    const t0 = performance.now();
    const finish = () => {
      setVec(anim.to);
      setTrail((tr) => [...tr.slice(-80), anim.to]);
      if (anim.kind === 'oracle') setQueries((q) => q + 1);
      else if (lastOpRef.current === 'oracle') setIters((k) => k + 1);
      lastOpRef.current = anim.kind;
      setLastOp(anim.kind);
      setPending((p) => p.slice(1));
      setAnim(null);
    };
    if (anim.dur <= 0) {
      finish();
      return;
    }
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / anim.dur);
      if (t >= 1) finish();
      else {
        setAnim((a) => (a ? { ...a, t } : a));
        raf = requestAnimationFrame(step);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anim?.kind, anim?.from, anim?.to]);

  const busy = !!anim || pending.length > 0;
  const enqueue = (ops: OpKind[]) => setPending((p) => [...p, ...ops]);
  const kStar = groverBestK(N, M);

  // the displayed vector (straight-line interpolation in the full space ⇒ bars and plane stay synchronized)
  const e = anim ? easeInOut(anim.t) : 1;
  const disp: V2 = anim ? [anim.from[0] + (anim.to[0] - anim.from[0]) * e, anim.from[1] + (anim.to[1] - anim.from[1]) * e] : vec;
  const ampMarked = disp[1] / Math.sqrt(M);
  const ampOther = M < N ? disp[0] / Math.sqrt(N - M) : 0;
  const mean = (M * ampMarked + (N - M) * ampOther) / N;
  const pSucc = disp[1] ** 2;
  const angleDeg = (Math.atan2(disp[1], disp[0]) * 180) / Math.PI;

  /* ------------------------------ plane ------------------------------ */
  const [wrapRef, wrapW] = useWidth<HTMLDivElement>(820);
  const narrow = wrapW < 640;
  const planeW = narrow ? wrapW : Math.min(380, wrapW * 0.46);
  const S = planeW;
  const R = S * 0.4;
  const cx = S / 2, cy = S / 2;
  const P = (v: V2) => [cx + v[0] * R, cy - v[1] * R] as const;
  const sDir: V2 = [Math.cos(theta), Math.sin(theta)];
  const mirrorActive = anim?.kind;
  const [tipX, tipY] = P(disp);
  const angNow = Math.atan2(disp[1], disp[0]);
  const arcR = R * 0.32;
  const arcPath = (a0: number, a1: number, r: number) => {
    const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
    const sweep = a1 > a0 ? 0 : 1;
    return `M ${cx + r * Math.cos(a0)} ${cy - r * Math.sin(a0)} A ${r} ${r} 0 ${large} ${sweep} ${cx + r * Math.cos(a1)} ${cy - r * Math.sin(a1)}`;
  };

  /* ------------------------------ bars ------------------------------- */
  const barsW = narrow ? wrapW : wrapW - planeW - 20;
  const barsH = S * 0.78;
  const marked = markedPositions(N, M);
  const many = N > 64;
  const items = many ? [] : Array.from({ length: N }, (_, i) => (marked.includes(i) ? ampMarked : ampOther));
  const base = barsH / 2;
  const scaleY = (a: number) => base - a * (barsH / 2 - 14);

  /* --------------------------- P vs k stems -------------------------- */
  const K = Math.min(2 * kStar + 2, 400);

  return (
    <Widget title="Grover's search: two reflections make a rotation">
      <div className="row" style={{ gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <span className="dim">items N</span>
        <Segmented options={N_OPTIONS.map((x) => ({ value: x, label: fmtN(x) }))} value={N} onChange={(x) => { const MM = x <= 4 ? 1 : M; setN(x); setM(MM); reset(x, MM); }} />
        <span className="dim" style={{ marginLeft: 8 }}>marked M</span>
        <Segmented options={[1, 2, 3].map((x) => ({ value: x, label: String(x) }))} value={M} onChange={(x) => { if (N <= 4 && x > 1) return; setM(x); reset(N, x); }} />
      </div>

      <div ref={wrapRef} style={{ display: 'flex', flexDirection: narrow ? 'column' : 'row', gap: 20, alignItems: 'flex-start' }}>
        {/* ---------------- 2D plane ---------------- */}
        <svg width={S} height={S} style={{ flexShrink: 0, display: 'block' }}>
          <defs>
            <marker id="gg-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#fcd34d" />
            </marker>
          </defs>
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="#2a3142" strokeWidth={1.5} />
          {/* axes */}
          <line x1={cx - R - 14} x2={cx + R + 18} y1={cy} y2={cy} stroke={mirrorActive === 'oracle' ? '#e07ab6' : '#4a5368'} strokeWidth={mirrorActive === 'oracle' ? 3 : 1.5} />
          <line x1={cx} x2={cx} y1={cy + R + 14} y2={cy - R - 18} stroke="#4a5368" strokeWidth={1.5} />
          <text x={cx + R + 4} y={cy + 18} fontSize={14} fill="#9aa3b5" fontFamily="var(--serif)">|s′⟩</text>
          <text x={cx + 8} y={cy - R - 6} fontSize={14} fill="#83c167" fontFamily="var(--serif)">|w⟩</text>
          <text x={cx + R + 4} y={cy + 32} fontSize={10} fill="#6b7385">unmarked</text>
          <text x={cx + 8} y={cy - R + 8} fontSize={10} fill="#6b7385">marked</text>
          {/* |s⟩ mirror line */}
          <line
            x1={cx - sDir[0] * (R + 10)}
            y1={cy + sDir[1] * (R + 10)}
            x2={cx + sDir[0] * (R + 16)}
            y2={cy - sDir[1] * (R + 16)}
            stroke={mirrorActive === 'diffuser' ? '#58c4dd' : '#58c4dd88'}
            strokeWidth={mirrorActive === 'diffuser' ? 3 : 1.3}
            strokeDasharray={mirrorActive === 'diffuser' ? undefined : '6 5'}
          />
          <text x={cx - sDir[0] * (R + 12) - 22} y={cy + sDir[1] * (R + 12) + 14} fontSize={14} fill="#58c4dd" fontFamily="var(--serif)">|s⟩ mirror</text>
          {/* θ arc */}
          {theta > 0.02 && <path d={arcPath(0, theta, R * 0.55)} fill="none" stroke="#58c4dd" strokeWidth={1.2} />}
          {theta > 0.06 && (
            <text x={cx + R * 0.6 * Math.cos(theta / 2) + 3} y={cy - R * 0.6 * Math.sin(theta / 2) + 4} fontSize={12} fill="#58c4dd" fontFamily="var(--serif)">θ</text>
          )}
          {/* trail */}
          {trail.map((v, i) => {
            const [x, y] = P(v);
            return <circle key={i} cx={x} cy={y} r={3} fill="#fcd34d" opacity={0.15 + 0.6 * (i / trail.length)} />;
          })}
          {/* current angle arc */}
          {Math.abs(angNow) > 0.03 && <path d={arcPath(0, angNow, arcR)} fill="none" stroke="#fcd34d" strokeWidth={1.4} opacity={0.8} />}
          {/* projection on |w⟩ */}
          <line x1={tipX} x2={cx} y1={tipY} y2={tipY} stroke="#83c167" strokeDasharray="3 3" opacity={0.8} />
          <line x1={cx} x2={cx} y1={cy} y2={tipY} stroke="#83c167" strokeWidth={5} opacity={0.55} strokeLinecap="round" />
          {/* state arrow */}
          <line x1={cx} y1={cy} x2={tipX} y2={tipY} stroke="#fcd34d" strokeWidth={3.2} markerEnd="url(#gg-arrow)" strokeLinecap="round" />
          <text x={tipX + 8} y={tipY - 6} fontSize={14} fill="#fcd34d" fontFamily="var(--serif)">|ψ⟩</text>
          <text x={10} y={18} fontSize={11.5} fill="#9aa3b5">
            angle from |s′⟩: {angleDeg.toFixed(1)}°{!anim && lastOp !== 'oracle' ? ` = (2·${iters}+1)θ` : ''}
          </text>
          <text x={10} y={S - 10} fontSize={11.5} fill="#83c167">
            P(marked) = (length of green bar)² = {pct(pSucc)}
          </text>
        </svg>

        {/* ---------------- amplitude bars ---------------- */}
        <div style={{ flex: 1, minWidth: 0, width: narrow ? '100%' : undefined }}>
          <div className="faint" style={{ fontSize: '0.78rem', marginBottom: 2 }}>
            {many ? `Amplitudes (too many items to draw: one bar stands for each kind of item)` : `Amplitude of every item (★ = marked) · dashed line = mean`}
          </div>
          <svg width={barsW} height={barsH} style={{ display: 'block' }}>
            <line x1={0} x2={barsW} y1={base} y2={base} stroke="#4a5368" />
            {!many &&
              items.map((a, i) => {
                const bw = barsW / N;
                const y0 = scaleY(0), y1 = scaleY(a);
                const isM = marked.includes(i);
                return (
                  <g key={i}>
                    <rect
                      x={i * bw + Math.min(2, bw * 0.15)}
                      width={Math.max(1, bw - 2 * Math.min(2, bw * 0.15))}
                      y={Math.min(y0, y1)}
                      height={Math.max(0.5, Math.abs(y1 - y0))}
                      fill={phaseColor(a >= 0 ? 0 : Math.PI, 60)}
                      stroke={isM ? '#fcd34d' : undefined}
                      strokeWidth={isM ? 2 : 0}
                      rx={bw > 10 ? 2 : 0}
                    />
                    {isM && (
                      <text x={i * bw + bw / 2} y={a >= 0 ? y1 - 4 : y1 + 13} fontSize={12} textAnchor="middle" fill="#fcd34d">★</text>
                    )}
                  </g>
                );
              })}
            {many && (
              <g>
                {[
                  { a: ampMarked, label: `${M} marked`, x: barsW * 0.18, isM: true },
                  { a: ampOther, label: `each of ${(N - M).toLocaleString()} others`, x: barsW * 0.6, isM: false },
                ].map((b) => {
                  const y0 = scaleY(0), y1 = scaleY(b.a);
                  return (
                    <g key={b.label}>
                      <rect x={b.x} width={barsW * 0.2} y={Math.min(y0, y1)} height={Math.max(1, Math.abs(y1 - y0))} fill={phaseColor(b.a >= 0 ? 0 : Math.PI)} stroke={b.isM ? '#fcd34d' : undefined} strokeWidth={b.isM ? 2 : 0} rx={3} />
                      <text x={b.x + barsW * 0.1} y={barsH - 4} fontSize={11} textAnchor="middle" fill={b.isM ? '#fcd34d' : '#9aa3b5'}>{b.label}</text>
                      <text x={b.x + barsW * 0.1} y={b.a >= 0 ? y1 - 5 : y1 + 14} fontSize={11} textAnchor="middle" fill="#cfd6e4" fontFamily="var(--mono)">{b.a.toFixed(b.isM ? 3 : 5)}</text>
                    </g>
                  );
                })}
              </g>
            )}
            <line x1={0} x2={barsW} y1={scaleY(mean)} y2={scaleY(mean)} stroke="#fcd34d" strokeDasharray="6 4" opacity={0.85} />
            <text x={barsW - 4} y={scaleY(mean) - 4} fontSize={10.5} fill="#fcd34d" textAnchor="end">mean {mean.toFixed(3)}</text>
          </svg>
          <div className="dim" style={{ fontSize: '0.85rem', minHeight: 40 }}>
            {anim?.kind === 'oracle' && <>Oracle: the marked amplitude flips sign. In the plane: reflection across |s′⟩.</>}
            {anim?.kind === 'diffuser' && <>Diffuser: every bar flips about the mean (a → 2·mean − a). In the plane: reflection about |s⟩.</>}
            {!anim && lastOp === 'oracle' && <>The marked bar is negative and pulled the mean down slightly. Now apply the diffuser.</>}
            {!anim && lastOp !== 'oracle' && (
              <>
                After {iters} iteration{iters === 1 ? '' : 's'} ({queries} quer{queries === 1 ? 'y' : 'ies'}): P(marked) = <b style={{ color: 'var(--green)' }}>{pct(pSucc)}</b>.{' '}
                Best is k* = {kStar} → {pct(groverSuccess(N, M, kStar))}.
              </>
            )}
          </div>
        </div>
      </div>

      {/* controls */}
      <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button className="btn small" disabled={busy} onClick={() => enqueue(['oracle'])} style={{ borderColor: '#e07ab6' }}>
          ① Oracle
        </button>
        <button className="btn small" disabled={busy} onClick={() => enqueue(['diffuser'])} style={{ borderColor: '#58c4dd' }}>
          ② Diffuser
        </button>
        <button className="btn small primary" disabled={busy} onClick={() => enqueue(lastOp === 'oracle' ? ['diffuser'] : ['oracle', 'diffuser'])}>
          Grover iteration (① + ②)
        </button>
        <button
          className="btn small gold"
          disabled={busy || iters >= kStar}
          onClick={() => {
            const todo = kStar - iters;
            const ops: OpKind[] = lastOp === 'oracle' ? ['diffuser'] : [];
            for (let k = 0; k < todo - (lastOp === 'oracle' ? 1 : 0); k++) ops.push('oracle', 'diffuser');
            enqueue(ops);
          }}
        >
          ⏩ run to k* = {kStar}
        </button>
        <button className="btn small ghost" onClick={() => reset()}>
          reset
        </button>
        <span className="mono faint" style={{ marginLeft: 'auto', fontSize: '0.82rem' }}>
          θ = arcsin√(M/N) = {((theta * 180) / Math.PI).toFixed(N > 1000 ? 3 : 2)}° · each iteration turns 2θ
        </span>
      </div>

      {/* P(success) vs iterations */}
      <StemPlot N={N} M={M} K={K} k={lastOp === 'oracle' ? null : iters} kStar={kStar} />

      {goal && (
        <div className="panel" style={{ marginTop: 10, padding: 10, borderColor: goalMet || solvedBefore ? 'var(--green)' : 'var(--border)' }}>
          {goalMet || solvedBefore ? (
            <span style={{ color: 'var(--green)', fontWeight: 600 }}>✓ Challenge complete.</span>
          ) : (
            <span style={{ color: 'var(--yellow)', fontWeight: 600 }}>
              🎯 Challenge: with N = {fmtN(goal.N)} and one marked item, get P(marked) ≥ {pct(goal.minP, 0)}.
            </span>
          )}{' '}
          <span className="faint" style={{ fontSize: '0.85rem' }}>(Use single iterations; count them as you go.)</span>
        </div>
      )}
    </Widget>
  );
}

function StemPlot({ N, M, K, k, kStar }: { N: number; M: number; K: number; k: number | null; kStar: number }) {
  const [ref, W] = useWidth<HTMLDivElement>(700);
  const H = 120, pad = { l: 34, r: 10, t: 10, b: 24 };
  const sx = (x: number) => pad.l + (x / K) * (W - pad.l - pad.r);
  const sy = (p: number) => H - pad.b - p * (H - pad.t - pad.b);
  const dense = K > 60;
  const pts = dense
    ? Array.from({ length: 400 }, (_, i) => {
        const x = (i / 399) * K;
        return `${i ? 'L' : 'M'}${sx(x)} ${sy(Math.sin((2 * x + 1) * groverTheta(N, M)) ** 2)}`;
      }).join(' ')
    : '';
  return (
    <div ref={ref} style={{ width: '100%', marginTop: 8 }}>
      <svg width={W} height={H} style={{ display: 'block' }}>
        <line x1={pad.l} x2={W - pad.r} y1={sy(0)} y2={sy(0)} stroke="#4a5368" />
        <line x1={pad.l} x2={W - pad.r} y1={sy(1)} y2={sy(1)} stroke="#2a3142" strokeDasharray="3 4" />
        <text x={pad.l - 4} y={sy(1) + 4} fontSize={10} fill="#6b7385" textAnchor="end">1</text>
        <text x={pad.l - 4} y={sy(0) + 4} fontSize={10} fill="#6b7385" textAnchor="end">0</text>
        <text x={4} y={sy(0.5)} fontSize={10} fill="#6b7385">P</text>
        {dense ? (
          <path d={pts} fill="none" stroke="#83c167" strokeWidth={2} />
        ) : (
          Array.from({ length: K + 1 }, (_, i) => {
            const p = groverSuccess(N, M, i);
            const cur = i === k;
            return (
              <g key={i}>
                <line x1={sx(i)} x2={sx(i)} y1={sy(0)} y2={sy(p)} stroke={cur ? '#fcd34d' : '#83c16799'} strokeWidth={cur ? 3 : 2} />
                <circle cx={sx(i)} cy={sy(p)} r={cur ? 5 : 3} fill={cur ? '#fcd34d' : '#83c167'} />
                {(K <= 24 || i % Math.ceil(K / 24) === 0) && (
                  <text x={sx(i)} y={H - 8} fontSize={10} fill={i === kStar ? '#fcd34d' : '#6b7385'} textAnchor="middle">{i}</text>
                )}
              </g>
            );
          })
        )}
        {dense && k !== null && k <= K && <circle cx={sx(k)} cy={sy(groverSuccess(N, M, k))} r={5} fill="#fcd34d" />}
        {dense && (
          <>
            <line x1={sx(kStar)} x2={sx(kStar)} y1={sy(0)} y2={sy(1)} stroke="#fcd34d" strokeDasharray="3 3" />
            <text x={sx(kStar)} y={H - 8} fontSize={10} fill="#fcd34d" textAnchor="middle">k* = {kStar}</text>
          </>
        )}
        <text x={pad.l + 8} y={pad.t + 4} fontSize={10.5} fill="#9aa3b5">
          P(success) after k iterations = sin²((2k+1)θ)
        </text>
      </svg>
    </div>
  );
}

