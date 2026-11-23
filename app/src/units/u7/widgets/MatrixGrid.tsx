import React from 'react';
import { abs, arg, fmt, phaseColor, type Mat } from '../../../engine/complex';

export interface MatrixGridProps {
  U: Mat;
  /** basis labels for rows / columns (default binary kets) */
  labels?: string[];
  /** pixel size of one cell */
  cell?: number;
  /** highlight one input column (and its non-zero outputs) */
  highlightCol?: number | null;
  onColClick?: (j: number) => void;
  /** show numeric entries on hover (title) — always on; and inline numbers if true */
  numbers?: boolean;
  title?: React.ReactNode;
}

/**
 * A unitary drawn as a grid of phasors: each entry is a disc whose radius is |U_ij| and whose
 * colour/arrow is its phase (the app-wide phase wheel). Columns = inputs, rows = outputs.
 */
export function MatrixGrid({ U, labels, cell = 44, highlightCol = null, onColClick, numbers = false, title }: MatrixGridProps) {
  const d = U.length;
  const nq = Math.round(Math.log2(d));
  const lab = labels ?? Array.from({ length: d }, (_, i) => `|${i.toString(2).padStart(nq, '0')}⟩`);
  const L = 46, T = 30;
  const W = L + d * cell + 14, H = T + d * cell + 12;
  return (
    <div style={{ display: 'inline-block' }}>
      {title && <div className="faint" style={{ fontSize: '0.8rem', marginBottom: 2, textAlign: 'center' }}>{title}</div>}
      <svg width={W} height={H} style={{ display: 'block', maxWidth: '100%' }} viewBox={`0 0 ${W} ${H}`}>
        {/* bracket */}
        <path d={`M${L - 4} ${T - 2} h-6 v${d * cell + 4} h6`} fill="none" stroke="#7d8597" strokeWidth={1.5} />
        <path d={`M${L + d * cell + 4} ${T - 2} h6 v${d * cell + 4} h-6`} fill="none" stroke="#7d8597" strokeWidth={1.5} />
        {lab.map((s, j) => (
          <text
            key={`c${j}`}
            x={L + j * cell + cell / 2}
            y={T - 10}
            textAnchor="middle"
            fontSize={d > 4 ? 9 : 11}
            fill={highlightCol === j ? '#fcd34d' : '#8a93a6'}
            fontFamily="var(--mono)"
            style={{ cursor: onColClick ? 'pointer' : 'default' }}
            onClick={() => onColClick?.(j)}
          >
            {s}
          </text>
        ))}
        {lab.map((s, i) => (
          <text key={`r${i}`} x={L - 14} y={T + i * cell + cell / 2 + 4} textAnchor="end" fontSize={d > 4 ? 9 : 11} fill="#8a93a6" fontFamily="var(--mono)">
            {s}
          </text>
        ))}
        {highlightCol !== null && highlightCol < d && (
          <rect x={L + highlightCol * cell + 1} y={T} width={cell - 2} height={d * cell} rx={6} fill="rgba(252,211,77,0.08)" stroke="rgba(252,211,77,0.5)" />
        )}
        {U.map((row, i) =>
          row.map((z, j) => {
            const m = abs(z);
            const cx = L + j * cell + cell / 2, cy = T + i * cell + cell / 2;
            const R = (cell / 2 - 5) * Math.min(1, m);
            const th = arg(z);
            const col = phaseColor(th);
            return (
              <g key={`${i}-${j}`} style={{ cursor: onColClick ? 'pointer' : 'default' }} onClick={() => onColClick?.(j)}>
                <title>{`⟨${lab[i].replace(/[|⟩]/g, '')}|U|${lab[j].replace(/[|⟩]/g, '')}⟩ = ${fmt(z, 3)}`}</title>
                <rect x={cx - cell / 2 + 1} y={cy - cell / 2 + 1} width={cell - 2} height={cell - 2} fill="transparent" />
                {m < 1e-6 ? (
                  <circle cx={cx} cy={cy} r={1.6} fill="#3a4256" />
                ) : (
                  <>
                    <circle cx={cx} cy={cy} r={cell / 2 - 5} fill="none" stroke="#2c3344" />
                    <circle cx={cx} cy={cy} r={R} fill={col} fillOpacity={0.25} stroke={col} strokeWidth={1.2} />
                    <line x1={cx} y1={cy} x2={cx + R * Math.cos(th)} y2={cy - R * Math.sin(th)} stroke={col} strokeWidth={2} strokeLinecap="round" />
                    {numbers && (
                      <text x={cx} y={cy + cell / 2 - 1} textAnchor="middle" fontSize={8} fill="#aab2c3" fontFamily="var(--mono)">
                        {fmt(z, 2)}
                      </text>
                    )}
                  </>
                )}
              </g>
            );
          }),
        )}
      </svg>
    </div>
  );
}
