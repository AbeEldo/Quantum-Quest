import React from 'react';
import { phaseColor } from '../../../engine/complex';
import { useWidth } from './viz';
import { continuedFraction, convergents, modpow, splitFromOrder, gcd } from '../algos';

/** Dots of f(x) = a^x mod N, coloured by value so the repetition jumps out. */
export function ModExpPlot({ a, N, X = 40, r, showPeriod = true }: { a: number; N: number; X?: number; r: number; showPeriod?: boolean }) {
  const [ref, W] = useWidth<HTMLDivElement>(700);
  const H = 150, pad = { l: 34, r: 10, t: 12, b: 24 };
  const sx = (x: number) => pad.l + (x / X) * (W - pad.l - pad.r);
  const sy = (v: number) => H - pad.b - (v / N) * (H - pad.t - pad.b);
  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg width={W} height={H} style={{ display: 'block' }}>
        <line x1={pad.l} x2={W - pad.r} y1={sy(0)} y2={sy(0)} stroke="#4a5368" />
        <text x={pad.l - 4} y={sy(N - 1) + 4} fontSize={10} fill="#6b7385" textAnchor="end">{N - 1}</text>
        <text x={pad.l - 4} y={sy(0) + 4} fontSize={10} fill="#6b7385" textAnchor="end">0</text>
        {showPeriod &&
          Array.from({ length: Math.floor(X / r) + 1 }, (_, j) => (
            <g key={j}>
              <rect x={sx(j * r) - 3} y={pad.t} width={sx(r) - sx(0)} height={H - pad.t - pad.b} fill={j % 2 ? 'rgba(88,196,221,0.05)' : 'transparent'} />
              <line x1={sx(j * r)} x2={sx(j * r)} y1={pad.t} y2={sy(0)} stroke="#fcd34d" strokeDasharray="3 4" opacity={0.5} />
            </g>
          ))}
        {Array.from({ length: X + 1 }, (_, x) => {
          const v = modpow(a, x, N);
          return (
            <g key={x}>
              <line x1={sx(x)} x2={sx(x)} y1={sy(0)} y2={sy(v)} stroke={phaseColor((2 * Math.PI * v) / N)} strokeWidth={1.4} opacity={0.5} />
              <circle cx={sx(x)} cy={sy(v)} r={3.6} fill={phaseColor((2 * Math.PI * v) / N)} />
              {(X <= 24 || x % 4 === 0) && (
                <text x={sx(x)} y={H - 8} fontSize={10} fill="#6b7385" textAnchor="middle">{x}</text>
              )}
            </g>
          );
        })}
        <text x={W - pad.r} y={pad.t + 8} fontSize={11} fill="#9aa3b5" textAnchor="end">
          f(x) = {a}^x mod {N}
          {showPeriod ? ` · period r = ${r}` : ''}
        </text>
      </svg>
    </div>
  );
}

/**
 * Continued-fraction expansion of y/Q with its convergents. Each convergent's denominator q (if q < N) is a candidate
 * period; the panel shows a^q mod N so the learner can see which one works.
 */
export function ContinuedFractionPanel({ y, Q, a, N, onPick, picked }: { y: number; Q: number; a: number; N: number; onPick?: (q: number) => void; picked?: number | null }) {
  const terms = continuedFraction(y, Q);
  const conv = convergents(terms);
  const g = gcd(y, Q);
  return (
    <div className="panel" style={{ padding: 12 }}>
      <div className="mono" style={{ fontSize: '0.95rem' }}>
        y / Q = {y}/{Q}
        {g > 1 ? ` = ${y / g}/${Q / g}` : ''} ≈ {(y / Q).toFixed(5)}
      </div>
      <div className="mono" style={{ fontSize: '0.95rem', marginTop: 4 }}>
        = [{terms[0]}; {terms.slice(1).join(', ')}]
        <span className="faint" style={{ fontFamily: 'var(--font)', fontSize: '0.8rem' }}>
          {' '}
          (i.e. {terms[0]} + 1/({terms[1] ?? '…'} + 1/({terms[2] ?? '…'} + …)))
        </span>
      </div>
      <div className="faint" style={{ fontSize: '0.8rem', margin: '8px 0 4px' }}>
        Convergents p/q (best rational approximations). Only denominators q &lt; N = {N} can be the period.
      </div>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {conv.map(([p, q], i) => {
          const ok = q < N;
          const v = ok ? modpow(a, q, N) : null;
          const works = v === 1;
          return (
            <button
              key={i}
              className="btn small"
              disabled={!ok || !onPick}
              onClick={() => onPick?.(q)}
              style={{
                opacity: ok ? 1 : 0.4,
                borderColor: picked === q ? (works ? 'var(--green)' : 'var(--red)') : undefined,
                textAlign: 'left',
              }}
              title={ok ? `${a}^${q} mod ${N} = ${v}` : 'denominator too large'}
            >
              <span className="mono">
                {p}/{q}
              </span>
              {ok && picked === q && (
                <span className="mono" style={{ marginLeft: 6, color: works ? 'var(--green)' : 'var(--red)', fontSize: '0.8rem' }}>
                  {a}^{q} ≡ {v} {works ? '✓' : '✗'}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Final classical step: from r, try gcd(a^{r/2} ± 1, N). */
export function GcdStep({ a, N, r }: { a: number; N: number; r: number }) {
  const out = splitFromOrder(a, N, r);
  if (!out.ok)
    return (
      <div className="panel" style={{ padding: 12, borderColor: 'var(--red)' }}>
        {out.reason === 'odd-period' ? (
          <>r = {r} is <b>odd</b>, so a^(r/2) isn't an integer power. Unlucky choice of a: pick another and rerun.</>
        ) : (
          <>
            a^(r/2) = {a}^{r / 2} ≡ −1 (mod {N}), so gcd(a^(r/2)+1, N) = N and gcd(a^(r/2)−1, N) = 1: no information. Unlucky choice of a: pick another.
          </>
        )}
      </div>
    );
  return (
    <div className="panel" style={{ padding: 12, borderColor: 'var(--green)' }}>
      <div className="mono">
        x = a^(r/2) mod N = {a}^{r / 2} mod {N} = {out.x}
      </div>
      <div className="mono">
        gcd(x − 1, N) = gcd({out.x - 1}, {N}) = {gcd(out.x - 1, N)} · gcd(x + 1, N) = gcd({out.x + 1}, {N}) = {gcd(out.x + 1, N)}
      </div>
      <div style={{ marginTop: 6, fontSize: '1.1rem' }}>
        <b style={{ color: 'var(--green)' }}>
          {N} = {out.factors[0]} × {out.factors[1]}
        </b>
      </div>
    </div>
  );
}
