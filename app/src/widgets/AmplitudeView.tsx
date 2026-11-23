import React from 'react';
import { C, abs, arg, fmt, phaseColor } from '../engine/complex';

/** A single complex amplitude drawn as an arrow in a circle ("clock"), Feynman/3B1B style. */
export function PhasorClock({ z, size = 34, maxR = 1, showCircle = true }: { z: C; size?: number; maxR?: number; showCircle?: boolean }) {
  const r = Math.min(1, abs(z) / maxR);
  const th = arg(z);
  const R = size / 2 - 2;
  const x = R * r * Math.cos(th), y = -R * r * Math.sin(th);
  const col = phaseColor(th);
  return (
    <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} style={{ flexShrink: 0 }}>
      {showCircle && <circle r={R} fill="rgba(255,255,255,0.03)" stroke="#3a4256" strokeWidth={1} />}
      <circle r={R * r} fill={col} fillOpacity={0.18} />
      {r > 0.02 && (
        <>
          <line x1={0} y1={0} x2={x} y2={y} stroke={col} strokeWidth={2.2} strokeLinecap="round" />
          <circle cx={x} cy={y} r={2.4} fill={col} />
        </>
      )}
    </svg>
  );
}

export interface AmplitudeViewProps {
  amps: C[];
  /** Number of qubits (for ket labels). Inferred from amps length if omitted. */
  n?: number;
  /** Custom basis labels (overrides binary kets). */
  labels?: string[];
  mode?: 'both' | 'bars' | 'clocks';
  /** Hide basis states with negligible amplitude. */
  hideZero?: boolean;
  /** Highlight specific basis indices. */
  highlight?: number[];
  compact?: boolean;
  /** Show the probability as a percent. */
  showNumbers?: boolean;
}

/**
 * Shows every amplitude of a state: ket label, phasor clock (magnitude + phase), probability bar.
 * Phase is encoded by colour using the app-wide phase wheel.
 */
export function AmplitudeView({ amps, n, labels, mode = 'both', hideZero = false, highlight = [], compact = false, showNumbers = true }: AmplitudeViewProps) {
  const nq = n ?? Math.round(Math.log2(amps.length));
  const rows = amps.map((z, i) => ({ z, i, p: z.re * z.re + z.im * z.im }));
  const shown = hideZero ? rows.filter((r) => r.p > 1e-6) : rows;
  const many = amps.length > 16;
  if (many && mode !== 'clocks') {
    // dense histogram view for many qubits
    return (
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 120, padding: '4px 0' }}>
        {rows.map((r) => (
          <div
            key={r.i}
            title={`|${labels?.[r.i] ?? r.i.toString(2).padStart(nq, '0')}⟩  p=${r.p.toFixed(3)}  amp=${fmt(r.z)}`}
            style={{
              flex: 1,
              height: `${Math.max(1, r.p * 100)}%`,
              background: r.p > 1e-6 ? phaseColor(arg(r.z)) : '#333',
              opacity: highlight.length && !highlight.includes(r.i) ? 0.5 : 1,
              borderRadius: '2px 2px 0 0',
              transition: 'height .3s',
            }}
          />
        ))}
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gap: compact ? 2 : 4 }}>
      {shown.map(({ z, i, p }) => {
        const label = labels?.[i] ?? i.toString(2).padStart(nq, '0');
        const hl = highlight.includes(i);
        return (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: compact ? '1px 6px' : '3px 8px',
              borderRadius: 8,
              background: hl ? 'rgba(252,211,77,.1)' : 'transparent',
              border: hl ? '1px solid rgba(252,211,77,.4)' : '1px solid transparent',
            }}
          >
            <span className="mono" style={{ minWidth: 14 + nq * 9, color: 'var(--text-dim)', fontSize: '0.9rem' }}>
              |{label}⟩
            </span>
            {mode !== 'bars' && <PhasorClock z={z} size={compact ? 24 : 32} />}
            {mode !== 'clocks' && (
              <div style={{ flex: 1, height: compact ? 10 : 14, background: 'var(--panel-2)', borderRadius: 4, overflow: 'hidden', minWidth: 60 }}>
                <div
                  style={{
                    width: `${p * 100}%`,
                    height: '100%',
                    background: phaseColor(arg(z), 58),
                    transition: 'width .35s cubic-bezier(.2,.8,.2,1), background .35s',
                  }}
                />
              </div>
            )}
            {showNumbers && (
              <span className="mono" style={{ fontSize: '0.78rem', color: 'var(--text-faint)', minWidth: compact ? 90 : 120, textAlign: 'right' }}>
                {fmt(z, 3)} <span style={{ color: 'var(--text-dim)' }}>({(p * 100).toFixed(1)}%)</span>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Small legend explaining the phase colour wheel. */
export function PhaseLegend({ size = 54 }: { size?: number }) {
  const segs = 36;
  const R = size / 2 - 6;
  return (
    <div className="row" style={{ gap: 8, fontSize: '0.78rem', color: 'var(--text-faint)' }}>
      <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}>
        {Array.from({ length: segs }, (_, k) => {
          const a0 = (k / segs) * 2 * Math.PI, a1 = ((k + 1) / segs) * 2 * Math.PI;
          return (
            <path
              key={k}
              d={`M0 0 L${R * Math.cos(a0)} ${-R * Math.sin(a0)} A${R} ${R} 0 0 0 ${R * Math.cos(a1)} ${-R * Math.sin(a1)} Z`}
              fill={phaseColor((a0 + a1) / 2)}
            />
          );
        })}
        <circle r={R * 0.45} fill="var(--bg)" />
      </svg>
      <span>
        colour = phase
        <br />
        <span style={{ color: phaseColor(0) }}>0</span> · <span style={{ color: phaseColor(Math.PI / 2) }}>π/2</span> ·{' '}
        <span style={{ color: phaseColor(Math.PI) }}>π</span> · <span style={{ color: phaseColor((3 * Math.PI) / 2) }}>3π/2</span>
      </span>
    </div>
  );
}
