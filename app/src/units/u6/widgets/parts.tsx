/**
 * Small reusable visual pieces for Worlds 6 and 8 (angle dials, win-rate meters, running charts,
 * amplitude grids). Kept inside the unit folder.
 */
import React, { useEffect, useRef, useState } from 'react';
import { C, abs, arg, phaseColor, fmt } from '../../../engine/complex';
import { useCanvas } from '../../../components/ui';

export const deg = (r: number) => Math.round((r * 360) / Math.PI) / 2;

/** Wrap an analyser angle into (−90°, 90°]. θ and θ+π describe the same measurement. */
export function wrapHalf(t: number): number {
  let x = ((t % Math.PI) + Math.PI) % Math.PI; // [0, π)
  if (x > Math.PI / 2 + 1e-9) x -= Math.PI;
  return x;
}

/**
 * A polariser-style dial for choosing a real-plane measurement angle θ.
 * Solid arm = outcome 0 direction (|θ⟩), dashed arm = outcome 1 (|θ⊥⟩). Drag anywhere to rotate.
 */
export function AngleDial({
  value,
  onChange,
  color = '#58c4dd',
  label,
  size = 120,
  snap = Math.PI / 16,
  disabled = false,
  ghost,
}: {
  value: number;
  onChange?: (v: number) => void;
  color?: string;
  label?: React.ReactNode;
  size?: number;
  snap?: number;
  disabled?: boolean;
  /** Optional faint reference angle (e.g. the other player's setting). */
  ghost?: number;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const R = size / 2 - 10;
  const setFromEvent = (e: React.PointerEvent | PointerEvent) => {
    if (!ref.current || !onChange || disabled) return;
    const r = ref.current.getBoundingClientRect();
    const x = e.clientX - (r.left + r.width / 2);
    const y = -(e.clientY - (r.top + r.height / 2));
    let t = Math.atan2(y, x);
    t = wrapHalf(t);
    if (snap > 0) t = Math.round(t / snap) * snap;
    onChange(wrapHalf(t));
  };
  const arm = (t: number, len: number) => [len * Math.cos(t), -len * Math.sin(t)] as const;
  const [x0, y0] = arm(value, R);
  const [x1, y1] = arm(value + Math.PI / 2, R);
  const ticks = Array.from({ length: 16 }, (_, k) => (k * Math.PI) / 8);
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <svg
        ref={ref}
        width={size}
        height={size}
        viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}
        style={{ cursor: disabled || !onChange ? 'default' : 'grab', touchAction: 'none', userSelect: 'none' }}
        onPointerDown={(e) => {
          if (disabled || !onChange) return;
          dragging.current = true;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          setFromEvent(e);
        }}
        onPointerMove={(e) => dragging.current && setFromEvent(e)}
        onPointerUp={() => (dragging.current = false)}
      >
        <circle r={R + 4} fill="rgba(255,255,255,0.025)" stroke="#2f3749" />
        {ticks.map((t, k) => {
          const [a, b] = arm(t, R + 4);
          const [c0, d0] = arm(t, R - (k % 2 ? 1 : 4));
          return <line key={k} x1={a} y1={b} x2={c0} y2={d0} stroke="#3a4256" strokeWidth={1} />;
        })}
        {ghost !== undefined && (
          <line x1={-arm(ghost, R)[0]} y1={-arm(ghost, R)[1]} x2={arm(ghost, R)[0]} y2={arm(ghost, R)[1]} stroke="#9aa3b5" strokeOpacity={0.35} strokeWidth={2} strokeDasharray="3 4" />
        )}
        {/* outcome-1 axis */}
        <line x1={-x1} y1={-y1} x2={x1} y2={y1} stroke={color} strokeOpacity={0.45} strokeWidth={1.6} strokeDasharray="5 4" />
        {/* outcome-0 axis */}
        <line x1={-x0} y1={-y0} x2={x0} y2={y0} stroke={color} strokeWidth={3.2} strokeLinecap="round" style={{ transition: dragging.current ? 'none' : 'all .25s' }} />
        <circle cx={x0} cy={y0} r={5.5} fill={color} />
        <text x={x0 * 1.02} y={y0 * 1.02 - 8} fontSize={10} fill={color} textAnchor="middle" fontFamily="var(--mono)">
          0
        </text>
        <text x={x1 * 0.86} y={y1 * 0.86 + 3} fontSize={10} fill={color} fillOpacity={0.7} textAnchor="middle" fontFamily="var(--mono)">
          1
        </text>
        <circle r={3} fill="#9aa3b5" />
      </svg>
      <div className="mono" style={{ fontSize: '0.8rem', color }}>
        {label ? <span style={{ marginRight: 6 }}>{label}</span> : null}
        {deg(value)}°
      </div>
    </div>
  );
}

/** Horizontal win-rate meter with reference lines for the classical (75%) and quantum (85.4%) limits. */
export function WinMeter({
  rate,
  label = 'win rate',
  lines = [
    { v: 0.75, label: 'classical max 75%', color: '#fcd34d' },
    { v: Math.cos(Math.PI / 8) ** 2, label: 'quantum max 85.4%', color: '#e07ab6' },
  ],
  height = 22,
  color,
}: {
  rate: number | null;
  label?: string;
  lines?: { v: number; label: string; color: string }[];
  height?: number;
  color?: string;
}) {
  const r = rate ?? 0;
  const col = color ?? (r > 0.75 + 1e-9 ? '#e07ab6' : r > 0.6 ? '#58c4dd' : '#9aa3b5');
  return (
    <div style={{ position: 'relative', paddingTop: 16, paddingBottom: 4 }}>
      <div style={{ position: 'relative', height, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: height / 2, overflow: 'hidden' }}>
        <div
          style={{
            width: `${Math.max(0, Math.min(1, r)) * 100}%`,
            height: '100%',
            background: `linear-gradient(90deg, ${col}55, ${col})`,
            transition: 'width .35s cubic-bezier(.2,.8,.2,1), background .35s',
          }}
        />
        <span className="mono" style={{ position: 'absolute', left: 10, top: 0, lineHeight: `${height}px`, fontSize: '0.8rem', color: '#fff', textShadow: '0 1px 2px #000' }}>
          {label}: {rate === null ? '—' : `${(r * 100).toFixed(1)}%`}
        </span>
      </div>
      {lines.map((l, i) => (
        <div key={l.label} style={{ position: 'absolute', left: `${l.v * 100}%`, top: 0, bottom: 0, width: 0, borderLeft: `2px dashed ${l.color}` }}>
          <span
            style={{
              position: 'absolute',
              top: -2,
              ...((i === 0 && lines.length > 1) || l.v > 0.92 ? { right: 4, textAlign: 'right' as const } : { left: 4 }),
              fontSize: '0.68rem',
              whiteSpace: 'nowrap',
              color: l.color,
            }}
          >
            {l.label}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Canvas chart of a running average (e.g. win rate) vs number of rounds, with horizontal reference lines. */
export function RunningChart({
  series,
  refLines = [
    { y: 0.75, color: '#fcd34d', label: '75%' },
    { y: Math.cos(Math.PI / 8) ** 2, color: '#e07ab6', label: '85.4%' },
  ],
  yRange = [0.4, 1],
  height = 160,
  minX = 50,
}: {
  series: { points: number[]; color: string; label?: string }[];
  refLines?: { y: number; color: string; label: string }[];
  yRange?: [number, number];
  height?: number;
  minX?: number;
}) {
  const { ref } = useCanvas(
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const pad = { l: 38, r: 46, t: 8, b: 20 };
      const maxN = Math.max(minX, ...series.map((s) => s.points.length));
      const sx = (i: number) => pad.l + (i / maxN) * (w - pad.l - pad.r);
      const sy = (y: number) => h - pad.b - ((y - yRange[0]) / (yRange[1] - yRange[0])) * (h - pad.t - pad.b);
      ctx.strokeStyle = '#2a3142';
      ctx.lineWidth = 1;
      ctx.font = '10px Consolas, monospace';
      ctx.fillStyle = '#6b7385';
      for (let y = Math.ceil(yRange[0] * 10) / 10; y <= yRange[1] + 1e-9; y += 0.1) {
        ctx.beginPath();
        ctx.moveTo(pad.l, sy(y));
        ctx.lineTo(w - pad.r, sy(y));
        ctx.stroke();
        ctx.fillText(`${Math.round(y * 100)}%`, 4, sy(y) + 3);
      }
      ctx.fillText(`${maxN} rounds`, w - pad.r - 50, h - 5);
      for (const l of refLines) {
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = l.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(pad.l, sy(l.y));
        ctx.lineTo(w - pad.r, sy(l.y));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = l.color;
        ctx.fillText(l.label, w - pad.r + 4, sy(l.y) + 3);
      }
      for (const s of series) {
        if (s.points.length < 1) continue;
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        s.points.forEach((p, i) => {
          const y = Math.max(yRange[0], Math.min(yRange[1], p));
          if (i === 0) ctx.moveTo(sx(i + 1), sy(y));
          else ctx.lineTo(sx(i + 1), sy(y));
        });
        ctx.stroke();
        const last = s.points[s.points.length - 1];
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(sx(s.points.length), sy(Math.max(yRange[0], Math.min(yRange[1], last))), 3.5, 0, 2 * Math.PI);
        ctx.fill();
      }
    },
    [series, refLines, yRange, minX],
    { height },
  );
  return (
    <div className="canvas-wrap">
      <canvas ref={ref} />
    </div>
  );
}

/**
 * The 2×2 "amplitude grid" of a two-qubit state: rows = q0 (Alice), columns = q1 (Bob).
 * Each cell shows the amplitude as a phase-coloured arrow; area ∝ probability.
 */
export function AmpGrid({
  amps,
  size = 64,
  rowLabel = 'q0',
  colLabel = 'q1',
  highlightRow,
  dimRow,
  showNumbers = true,
  rowNames = ['0', '1'],
  colNames = ['0', '1'],
}: {
  amps: C[];
  size?: number;
  rowLabel?: string;
  colLabel?: string;
  highlightRow?: number;
  dimRow?: number;
  showNumbers?: boolean;
  rowNames?: string[];
  colNames?: string[];
}) {
  const cell = (i: number) => {
    const z = amps[i];
    const r = Math.min(1, abs(z));
    const th = arg(z);
    const col = phaseColor(th);
    const R = size / 2 - 6;
    const row = i >> 1;
    return (
      <div
        key={i}
        style={{
          width: size,
          height: size + (showNumbers ? 14 : 0),
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          opacity: dimRow === row ? 0.18 : 1,
          transition: 'opacity .5s',
          background: highlightRow === row ? 'rgba(252,211,77,0.08)' : 'transparent',
          borderRadius: 8,
        }}
      >
        <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}>
          <rect x={-size / 2 + 2} y={-size / 2 + 2} width={size - 4} height={size - 4} rx={8} fill="rgba(255,255,255,0.03)" stroke="#2f3749" />
          <circle r={R} fill="none" stroke="#2f3749" />
          <circle r={R * r} fill={col} fillOpacity={0.22} style={{ transition: 'r .5s' }} />
          {r > 0.02 && (
            <>
              <line x1={0} y1={0} x2={R * r * Math.cos(th)} y2={-R * r * Math.sin(th)} stroke={col} strokeWidth={2.4} strokeLinecap="round" />
              <circle cx={R * r * Math.cos(th)} cy={-R * r * Math.sin(th)} r={2.6} fill={col} />
            </>
          )}
        </svg>
        {showNumbers && (
          <span className="mono" style={{ fontSize: '0.68rem', color: 'var(--text-faint)', marginTop: -2 }}>
            {fmt(z, 2)}
          </span>
        )}
      </div>
    );
  };
  return (
    <div style={{ display: 'inline-grid', gridTemplateColumns: `auto ${size}px ${size}px`, gap: 4, alignItems: 'center' }}>
      <span className="mono faint" style={{ fontSize: '0.7rem', textAlign: 'right' }}>
        {rowLabel}\{colLabel}
      </span>
      <span className="mono faint" style={{ textAlign: 'center', fontSize: '0.8rem' }}>{colNames[0]}</span>
      <span className="mono faint" style={{ textAlign: 'center', fontSize: '0.8rem' }}>{colNames[1]}</span>
      <span className="mono" style={{ fontSize: '0.8rem', textAlign: 'right', paddingRight: 4, color: highlightRow === 0 ? 'var(--yellow)' : 'var(--text-faint)' }}>{rowNames[0]}</span>
      {cell(0)}
      {cell(1)}
      <span className="mono" style={{ fontSize: '0.8rem', textAlign: 'right', paddingRight: 4, color: highlightRow === 1 ? 'var(--yellow)' : 'var(--text-faint)' }}>{rowNames[1]}</span>
      {cell(2)}
      {cell(3)}
    </div>
  );
}

/** Smoothly animate a number toward a target (ease-out), returns current value. */
export function useTween(target: number, ms = 400): number {
  const [v, setV] = useState(target);
  const from = useRef(target);
  const start = useRef(0);
  useEffect(() => {
    from.current = v;
    start.current = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start.current) / ms);
      const e = 1 - (1 - t) ** 3;
      setV(from.current + (target - from.current) * e);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, ms]);
  return v;
}

/** Ket string for a 2-qubit state, e.g. "0.71|00⟩ + 0.71|11⟩". */
export function ket2(amps: C[], n = 2, digits = 2): string {
  const terms: string[] = [];
  amps.forEach((z, i) => {
    if (abs(z) < 1e-3) return;
    const lab = i.toString(2).padStart(n, '0');
    terms.push(`${fmt(z, digits)}|${lab}⟩`);
  });
  return terms.join(' + ').replace(/\+ -/g, '− ').replace(/\+ −/g, '− ') || '0';
}
