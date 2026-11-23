import React from 'react';
import { type SurfaceCode, type Plaquette } from '../engine/surface';

export const XCOL = '#58c4dd'; // X-type checks (detect Z errors)
export const ZCOL = '#f0ac5f'; // Z-type checks (detect X errors)

export interface LatticeProps {
  code: SurfaceCode;
  /** X errors per data qubit */
  xErr?: ArrayLike<number>;
  /** Z errors per data qubit */
  zErr?: ArrayLike<number>;
  /** lit plaquette ids */
  lit?: Set<number>;
  /** pending corrections (X / Z) to draw as rings */
  xCorr?: ArrayLike<number>;
  zCorr?: ArrayLike<number>;
  /** hide actual errors (game mode) */
  hideErrors?: boolean;
  /** matching lines: pairs of plaquette ids (−1 = boundary) */
  pairs?: { a: number; b: number; color: string }[];
  showLogical?: boolean;
  onQubit?: (q: number) => void;
  size?: number;
  /** extra highlight of qubits (e.g. a residual logical chain) */
  glow?: number[];
}

/** SVG drawing of a rotated surface code: data qubits on vertices, X/Z checks as coloured plaquettes. */
export function SurfaceLattice({ code, xErr, zErr, lit, xCorr, zCorr, hideErrors, pairs, showLogical, onQubit, size = 360, glow }: LatticeProps) {
  const d = code.d;
  const cell = size / (d - 1 + 1.3);
  const pad = 0.65 * cell;
  const P = (x: number, y: number): [number, number] => [pad + x * cell, pad + y * cell];
  const centre = (p: Plaquette): [number, number] => {
    if (p.qubits.length === 4) return P(p.cx, p.cy);
    // boundary: push centre outward
    const [x0, y0] = P(p.cx, p.cy);
    return [x0, y0];
  };
  const boundaryPoint = (pid: number, errType: 'X' | 'Z'): [number, number] => {
    // nearest point on the relevant boundary (X errors end on top/bottom, Z errors on left/right)
    const p = code.plaquettes[pid];
    const [cx, cy] = centre(p);
    if (errType === 'X') return cy < size / 2 ? [cx, pad * 0.25] : [cx, size - pad * 0.25];
    return cx < size / 2 ? [pad * 0.25, cy] : [size - pad * 0.25, cy];
  };

  const shape = (p: Plaquette) => {
    const isLit = lit?.has(p.id);
    const col = p.type === 'X' ? XCOL : ZCOL;
    const fill = isLit ? col : col;
    const op = isLit ? 0.75 : 0.13;
    if (p.qubits.length === 4) {
      const [x, y] = P(p.a, p.b);
      return (
        <rect key={p.id} x={x + 1} y={y + 1} width={cell - 2} height={cell - 2} rx={4} fill={fill} opacity={op} style={{ transition: 'opacity .2s' }}>
          {isLit && <animate attributeName="opacity" values="0.55;0.9;0.55" dur="1.2s" repeatCount="indefinite" />}
        </rect>
      );
    }
    // weight-2 boundary check: half-disc outside the lattice
    const [q1, q2] = p.qubits;
    const [x1, y1] = P(q1 % d, Math.floor(q1 / d));
    const [x2, y2] = P(q2 % d, Math.floor(q2 / d));
    const r = cell / 2 - 1;
    let sweep = 1;
    if (p.b === -1) sweep = 1; // top: arc above
    if (p.b === d - 1) sweep = 0;
    if (p.a === -1) sweep = 0;
    if (p.a === d - 1) sweep = 1;
    // order endpoints consistently
    const path = `M${x1} ${y1} A ${r} ${r} 0 0 ${sweep} ${x2} ${y2} Z`;
    return (
      <path key={p.id} d={path} fill={fill} opacity={op} style={{ transition: 'opacity .2s' }}>
        {isLit && <animate attributeName="opacity" values="0.55;0.9;0.55" dur="1.2s" repeatCount="indefinite" />}
      </path>
    );
  };

  const logicalPath = (qs: number[], color: string) => {
    const pts = qs.map((q) => P(q % d, Math.floor(q / d)));
    return <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={color} strokeWidth={6} opacity={0.25} strokeLinecap="round" />;
  };

  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', maxWidth: size, display: 'block', margin: '0 auto', userSelect: 'none' }}>
      {code.plaquettes.map(shape)}
      {/* grid lines */}
      {Array.from({ length: d }, (_, i) => (
        <g key={i}>
          <line x1={P(0, i)[0]} y1={P(0, i)[1]} x2={P(d - 1, i)[0]} y2={P(d - 1, i)[1]} stroke="#4a5368" strokeWidth={1} />
          <line x1={P(i, 0)[0]} y1={P(i, 0)[1]} x2={P(i, d - 1)[0]} y2={P(i, d - 1)[1]} stroke="#4a5368" strokeWidth={1} />
        </g>
      ))}
      {showLogical && logicalPath(code.logicalX, '#fc6255')}
      {showLogical && logicalPath(code.logicalZ, '#58c4dd')}
      {/* matching lines */}
      {pairs?.map((pr, i) => {
        const a = centre(code.plaquettes[pr.a]);
        const b = pr.b >= 0 ? centre(code.plaquettes[pr.b]) : boundaryPoint(pr.a, code.plaquettes[pr.a].type === 'Z' ? 'X' : 'Z');
        return <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={pr.color} strokeWidth={3} strokeDasharray="6 4" strokeLinecap="round" />;
      })}
      {/* lit markers */}
      {lit &&
        [...lit].map((id) => {
          const p = code.plaquettes[id];
          let [x, y] = centre(p);
          if (p.qubits.length === 2) {
            if (p.b === -1) y += cell * 0.18;
            if (p.b === d - 1) y -= cell * 0.18;
            if (p.a === -1) x += cell * 0.18;
            if (p.a === d - 1) x -= cell * 0.18;
          }
          return (
            <g key={`l${id}`}>
              <circle cx={x} cy={y} r={7} fill="#fff" opacity={0.95} />
              <circle cx={x} cy={y} r={7} fill="none" stroke={p.type === 'X' ? XCOL : ZCOL} strokeWidth={3}>
                <animate attributeName="r" values="7;12;7" dur="1.2s" repeatCount="indefinite" />
              </circle>
            </g>
          );
        })}
      {/* data qubits */}
      {Array.from({ length: code.n }, (_, q) => {
        const [x, y] = P(q % d, Math.floor(q / d));
        const ex = !hideErrors && xErr?.[q], ez = !hideErrors && zErr?.[q];
        const cx = xCorr?.[q], cz = zCorr?.[q];
        const label = ex && ez ? 'Y' : ex ? 'X' : ez ? 'Z' : '';
        const col = ex && ez ? '#b48ce0' : ex ? '#fc6255' : ez ? '#58c4dd' : '#cfd6e4';
        const g = glow?.includes(q);
        return (
          <g key={q} onClick={() => onQubit?.(q)} style={{ cursor: onQubit ? 'pointer' : 'default' }}>
            {g && <circle cx={x} cy={y} r={16} fill="#fc6255" opacity={0.35} />}
            <circle cx={x} cy={y} r={11} fill={label ? col : '#1d2230'} stroke={label ? '#fff' : '#9aa3b5'} strokeWidth={label ? 2 : 1.5} />
            {label && (
              <text x={x} y={y + 4.5} textAnchor="middle" fontSize={12} fontWeight={800} fill="#111" fontFamily="var(--serif)" style={{ pointerEvents: 'none' }}>
                {label}
              </text>
            )}
            {(cx || cz) && (
              <circle cx={x} cy={y} r={15} fill="none" stroke={cx && cz ? '#b48ce0' : cx ? '#83c167' : '#83c167'} strokeWidth={2.5} strokeDasharray={cz && !cx ? '3 3' : undefined} />
            )}
            {(cx || cz) && (
              <text x={x + 13} y={y - 11} fontSize={9.5} fontWeight={700} fill="#83c167" style={{ pointerEvents: 'none' }}>
                {cx && cz ? 'Y' : cx ? 'X' : 'Z'}
              </text>
            )}
            <circle cx={x} cy={y} r={15} fill="transparent" />
          </g>
        );
      })}
    </svg>
  );
}
