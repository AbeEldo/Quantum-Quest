import React from 'react';
import { phaseColor, type C } from '../../../engine/complex';
import { DensityMatrix } from '../../../engine/qsim';

export type Vec3 = [number, number, number];

/** 2×2 density matrix from a Bloch vector. */
export function rhoFromBloch([x, y, z]: Vec3): [[C, C], [C, C]] {
  return [
    [{ re: (1 + z) / 2, im: 0 }, { re: x / 2, im: -y / 2 }],
    [{ re: x / 2, im: y / 2 }, { re: (1 - z) / 2, im: 0 }],
  ];
}

/** Single-qubit DensityMatrix object with the given Bloch vector. */
export function dmFromBloch(v: Vec3): DensityMatrix {
  const d = new DensityMatrix(1);
  const r = rhoFromBloch(v);
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++) {
      d.re[i * 2 + j] = r[i][j].re;
      d.im[i * 2 + j] = r[i][j].im;
    }
  return d;
}

const num = (x: number, digits = 2) => {
  const v = Math.abs(x) < 0.5 * 10 ** -digits ? 0 : x;
  return v.toFixed(digits).replace(/^-/, '-');
};

export function cTex(z: C, digits = 2): string {
  const re = Math.abs(z.re) < 0.005 ? 0 : z.re;
  const im = Math.abs(z.im) < 0.005 ? 0 : z.im;
  if (im === 0) return num(re, digits);
  if (re === 0) return `${num(im, digits)}i`;
  return `${num(re, digits)}${im < 0 ? '-' : '+'}${num(Math.abs(im), digits)}i`;
}

/** TeX for a 2×2 matrix. */
export function mat2Tex(m: [[C, C], [C, C]] | C[][], digits = 2): string {
  return `\\begin{pmatrix} ${cTex(m[0][0], digits)} & ${cTex(m[0][1], digits)} \\\\ ${cTex(m[1][0], digits)} & ${cTex(m[1][1], digits)} \\end{pmatrix}`;
}

/**
 * Hinton-style picture of a density matrix: each entry is a square whose area ∝ |ρ_ij|
 * and whose colour is the phase of ρ_ij (standard phase wheel).
 */
export function DensityHeatmap({
  get,
  dim,
  size = 200,
  labels,
  title,
}: {
  get: (i: number, j: number) => C;
  dim: number;
  size?: number;
  labels?: string[];
  title?: string;
}) {
  const pad = 26;
  const cell = (size - pad) / dim;
  const lab = labels ?? Array.from({ length: dim }, (_, i) => i.toString(2).padStart(Math.log2(dim), '0'));
  const cells: React.ReactNode[] = [];
  for (let i = 0; i < dim; i++)
    for (let j = 0; j < dim; j++) {
      const z = get(i, j);
      const m = Math.hypot(z.re, z.im);
      const s = Math.sqrt(Math.min(1, m * 2)) * (cell - 3); // ×2 so that 1/2 fills the cell
      const ph = Math.atan2(z.im, z.re);
      cells.push(
        <g key={`${i}-${j}`}>
          <rect x={pad + j * cell + 1} y={pad + i * cell + 1} width={cell - 2} height={cell - 2} rx={3} fill="#141821" stroke={i === j ? '#3a4458' : '#262d3c'} />
          {m > 0.004 && (
            <rect
              x={pad + j * cell + cell / 2 - s / 2}
              y={pad + i * cell + cell / 2 - s / 2}
              width={s}
              height={s}
              rx={2}
              fill={phaseColor(ph)}
              opacity={0.92}
              style={{ transition: 'all .25s' }}
            />
          )}
        </g>,
      );
    }
  return (
    <div style={{ display: 'inline-block', textAlign: 'center' }}>
      {title && <div className="faint" style={{ fontSize: '0.78rem', marginBottom: 2 }}>{title}</div>}
      <svg width={size} height={size} style={{ display: 'block' }}>
        {lab.map((l, i) => (
          <g key={l + i}>
            <text x={pad + i * cell + cell / 2} y={pad - 8} fontSize={dim > 8 ? 8 : 10} textAnchor="middle" fill="#7d8699" fontFamily="var(--mono)">
              {dim <= 16 ? `⟨${l}|` : ''}
            </text>
            <text x={pad - 4} y={pad + i * cell + cell / 2 + 3} fontSize={dim > 8 ? 8 : 10} textAnchor="end" fill="#7d8699" fontFamily="var(--mono)">
              {dim <= 16 ? `|${l}⟩` : ''}
            </text>
          </g>
        ))}
        {cells}
      </svg>
    </div>
  );
}

/** Small horizontal meter 0..1 with label. */
export function Meter({ label, value, color = 'var(--blue)', fmt }: { label: React.ReactNode; value: number; color?: string; fmt?: (v: number) => string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 52px', gap: 8, alignItems: 'center', fontSize: '0.85rem' }}>
      <span className="dim">{label}</span>
      <div style={{ height: 10, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, height: '100%', background: color, transition: 'width .25s' }} />
      </div>
      <span className="mono" style={{ textAlign: 'right' }}>{fmt ? fmt(value) : value.toFixed(3)}</span>
    </div>
  );
}
