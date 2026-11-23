import React, { useEffect, useRef, useState } from 'react';
import { phaseColor } from '../../../engine/complex';
import { useProgress } from '../../../state/progress';

/* Small shared visual helpers for World 9 widgets and games. */

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Smoothly animate towards `target` (cubic ease). Honors the "reduced motion" setting. */
export function useTween(target: number, duration = 500): number {
  const reduced = useProgress((s) => s.settings.reducedMotion);
  const [v, setV] = useState(target);
  const cur = useRef(target);
  useEffect(() => {
    if (reduced || duration <= 0) {
      cur.current = target;
      setV(target);
      return;
    }
    const from = cur.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const x = from + (target - from) * easeInOut(t);
      cur.current = x;
      setV(x);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, reduced]);
  return v;
}

/** Tween a whole array of numbers (same length). */
export function useTweenArray(target: number[], duration = 500): number[] {
  const reduced = useProgress((s) => s.settings.reducedMotion);
  const [v, setV] = useState(target);
  const cur = useRef(target);
  const key = target.map((x) => x.toFixed(6)).join(',');
  useEffect(() => {
    if (reduced || duration <= 0 || cur.current.length !== target.length) {
      cur.current = target;
      setV(target);
      return;
    }
    const from = cur.current.slice();
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const e = easeInOut(t);
      const x = target.map((b, i) => from[i] + (b - from[i]) * e);
      cur.current = x;
      setV(x);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, duration, reduced]);
  return v;
}

/** Width of a container element (for responsive SVG). */
export function useWidth<T extends HTMLElement>(fallback = 640): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || fallback));
    ro.observe(el);
    setW(el.clientWidth || fallback);
    return () => ro.disconnect();
  }, [fallback]);
  return [ref, w];
}

export interface BarSpec {
  value: number;
  label?: string;
  color?: string;
  highlight?: boolean;
}

/**
 * Responsive SVG bar chart of probabilities (0..yMax). Optional vertical guide lines (in bar-index units),
 * click handler, and tick labels every `labelEvery` bars.
 */
export function ProbBars({
  bars,
  height = 170,
  yMax,
  guides = [],
  onBarClick,
  labelEvery,
  selected,
  marker,
  xTitle,
}: {
  bars: BarSpec[];
  height?: number;
  yMax?: number;
  guides?: { x: number; color?: string; label?: string }[];
  onBarClick?: (i: number) => void;
  labelEvery?: number;
  selected?: number | null;
  /** A continuous marker position (in bar-index units), e.g. the true phase. */
  marker?: { x: number; label?: string; color?: string };
  xTitle?: string;
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const n = bars.length;
  const pad = { l: 34, r: 8, t: 14, b: xTitle ? 34 : 22 };
  const top = yMax ?? Math.max(1e-9, ...bars.map((b) => b.value)) * 1.08;
  const bw = (W - pad.l - pad.r) / n;
  const sx = (i: number) => pad.l + i * bw;
  const sy = (v: number) => height - pad.b - (v / top) * (height - pad.t - pad.b);
  const every = labelEvery ?? Math.max(1, Math.ceil(n / 16));
  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg width={W} height={height} style={{ display: 'block' }}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(top * f)} y2={sy(top * f)} stroke="#2a3142" strokeDasharray={f === 0 ? undefined : '3 4'} />
            <text x={pad.l - 4} y={sy(top * f) + 4} fontSize={10} fill="#6b7385" textAnchor="end">
              {(top * f).toFixed(top * f < 0.1 && f > 0 ? 3 : 2)}
            </text>
          </g>
        ))}
        {guides.map((g, k) => (
          <g key={k}>
            <line x1={sx(g.x + 0.5)} x2={sx(g.x + 0.5)} y1={pad.t - 6} y2={height - pad.b} stroke={g.color ?? '#fcd34d'} strokeDasharray="4 4" opacity={0.7} />
            {g.label && (
              <text x={sx(g.x + 0.5)} y={pad.t - 2} fontSize={10} fill={g.color ?? '#fcd34d'} textAnchor="middle">
                {g.label}
              </text>
            )}
          </g>
        ))}
        {bars.map((b, i) => {
          const h = Math.max(0, sy(0) - sy(b.value));
          const sel = selected === i;
          return (
            <g key={i} onClick={onBarClick ? () => onBarClick(i) : undefined} style={{ cursor: onBarClick ? 'pointer' : 'default' }}>
              {onBarClick && <rect x={sx(i)} y={pad.t} width={bw} height={height - pad.t - pad.b} fill="transparent" />}
              <rect
                x={sx(i) + Math.min(1, bw * 0.12)}
                y={sy(0) - h}
                width={Math.max(0.6, bw - 2 * Math.min(1, bw * 0.12))}
                height={h}
                rx={bw > 8 ? 2 : 0}
                fill={b.color ?? (b.highlight ? '#fcd34d' : '#58c4dd')}
                stroke={sel ? '#fff' : undefined}
                strokeWidth={sel ? 1.5 : 0}
                style={{ transition: 'y .3s, height .3s' }}
              />
              {b.label && i % every === 0 && (
                <text x={sx(i) + bw / 2} y={height - pad.b + 13} fontSize={bw < 14 ? 9 : 10.5} fill={b.highlight ? '#fcd34d' : '#6b7385'} textAnchor="middle" fontFamily="var(--mono)">
                  {b.label}
                </text>
              )}
            </g>
          );
        })}
        {marker && (
          <g>
            <line x1={sx(marker.x + 0.5)} x2={sx(marker.x + 0.5)} y1={pad.t - 4} y2={height - pad.b} stroke={marker.color ?? '#e07ab6'} strokeWidth={2} />
            {marker.label && (
              <text x={sx(marker.x + 0.5) + 4} y={pad.t + 6} fontSize={11} fill={marker.color ?? '#e07ab6'}>
                {marker.label}
              </text>
            )}
          </g>
        )}
        {xTitle && (
          <text x={(pad.l + W - pad.r) / 2} y={height - 4} fontSize={11} fill="#9aa3b5" textAnchor="middle">
            {xTitle}
          </text>
        )}
      </svg>
    </div>
  );
}

/** A large clock dial for a phase given in turns (0..1); hand colour follows the phase wheel. */
export function ClockDial({ turns, size = 70, label, sub, ticks = 8, magnitude = 1 }: { turns: number; size?: number; label?: React.ReactNode; sub?: React.ReactNode; ticks?: number; magnitude?: number }) {
  const R = size / 2 - 5;
  const th = 2 * Math.PI * turns;
  const col = phaseColor(th);
  const x = R * 0.86 * magnitude * Math.cos(th), y = -R * 0.86 * magnitude * Math.sin(th);
  return (
    <div style={{ textAlign: 'center', minWidth: size }}>
      <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}>
        <circle r={R} fill="#11141c" stroke="#3a4256" strokeWidth={1.5} />
        {Array.from({ length: ticks }, (_, k) => {
          const a = (2 * Math.PI * k) / ticks;
          return <line key={k} x1={R * 0.82 * Math.cos(a)} y1={-R * 0.82 * Math.sin(a)} x2={R * Math.cos(a)} y2={-R * Math.sin(a)} stroke="#3a4256" strokeWidth={k === 0 ? 2 : 1} />;
        })}
        <circle r={R * magnitude * 0.86} fill={col} fillOpacity={0.12} />
        <line x1={0} y1={0} x2={x} y2={y} stroke={col} strokeWidth={3} strokeLinecap="round" />
        <circle r={3} fill={col} />
        <circle cx={x} cy={y} r={3.2} fill={col} />
      </svg>
      {label && <div className="mono" style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>{label}</div>}
      {sub && <div className="mono faint" style={{ fontSize: '0.7rem' }}>{sub}</div>}
    </div>
  );
}

/** Pill-style bit toggles for entering an n-bit string. */
export function BitToggles({ n, value, onChange, disabled, color = 'var(--yellow)' }: { n: number; value: number; onChange: (v: number) => void; disabled?: boolean; color?: string }) {
  return (
    <span className="row" style={{ gap: 4, display: 'inline-flex' }}>
      {Array.from({ length: n }, (_, k) => {
        const bit = 1 << (n - 1 - k);
        const on = !!(value & bit);
        return (
          <button
            key={k}
            disabled={disabled}
            onClick={() => onChange(value ^ bit)}
            className="mono"
            style={{
              width: 30,
              height: 34,
              borderRadius: 8,
              border: `2px solid ${on ? color : 'var(--border)'}`,
              background: on ? `color-mix(in srgb, ${color} 25%, transparent)` : 'var(--panel-2)',
              color: on ? color : 'var(--text-dim)',
              fontSize: '1rem',
              fontWeight: 700,
              cursor: disabled ? 'default' : 'pointer',
            }}
          >
            {on ? 1 : 0}
          </button>
        );
      })}
    </span>
  );
}

/** Format a probability as a percentage. */
export const pct = (p: number, d = 1) => `${(p * 100).toFixed(d)}%`;
