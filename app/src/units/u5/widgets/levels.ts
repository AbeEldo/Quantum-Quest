import { boundStates } from '../../../engine/wave1d';

export type PotKey = 'harmonic' | 'quartic' | 'transmon' | 'box' | 'finite' | 'linear' | 'double';

export interface PotDef {
  key: PotKey;
  label: string;
  /** Domain [xmin, xmax]. */
  range: (p: number) => [number, number];
  V: (x: number, p: number) => number;
  mass: number;
  /** Parameter slider (if any). */
  param?: { label: string; min: number; max: number; step: number; value: number; fmt?: (v: number) => string };
  /** Energy unit label. */
  unit: string;
  xLabel: string;
}

export const POTS: Record<PotKey, PotDef> = {
  harmonic: {
    key: 'harmonic',
    label: 'harmonic',
    range: () => [-7, 7],
    V: (x) => 0.5 * x * x,
    mass: 1,
    unit: 'ħω',
    xLabel: 'x',
  },
  quartic: {
    key: 'quartic',
    label: 'stiffened (x² + x⁴)',
    range: () => [-6, 6],
    V: (x, l) => 0.5 * x * x + l * x ** 4,
    mass: 1,
    param: { label: 'quartic strength λ', min: 0, max: 0.4, step: 0.01, value: 0.1, fmt: (v) => v.toFixed(2) },
    unit: 'ħω',
    xLabel: 'x',
  },
  transmon: {
    key: 'transmon',
    label: 'transmon (cosine)',
    range: () => [-Math.PI, Math.PI],
    V: (phi, ej) => ej * (1 - Math.cos(phi)),
    mass: 1 / 8, // E_C = 1: kinetic term 4E_C n² = −4 d²/dφ²  ⇔  m = 1/(8E_C)
    param: { label: 'E_J / E_C', min: 5, max: 100, step: 1, value: 50, fmt: (v) => v.toFixed(0) },
    unit: 'E_C',
    xLabel: 'phase φ',
  },
  box: {
    key: 'box',
    label: 'box',
    range: () => [-5, 5],
    V: (x) => (Math.abs(x) < 4 ? 0 : 60),
    mass: 1,
    unit: '',
    xLabel: 'x',
  },
  finite: {
    key: 'finite',
    label: 'finite well',
    range: () => [-7, 7],
    V: (x) => (Math.abs(x) < 3 ? 0 : 3),
    mass: 1,
    unit: '',
    xLabel: 'x',
  },
  linear: {
    key: 'linear',
    label: 'V-shaped |x|',
    range: () => [-9, 9],
    V: (x) => Math.abs(x),
    mass: 1,
    unit: '',
    xLabel: 'x',
  },
  double: {
    key: 'double',
    label: 'double well',
    range: () => [-5, 5],
    V: (x) => 0.35 * (x * x - 4) ** 2,
    mass: 1,
    unit: '',
    xLabel: 'x',
  },
};

export interface Spectrum {
  x: Float64Array;
  V: Float64Array;
  E: number[];
  psi: Float64Array[];
  dx: number;
}

export function solve(key: PotKey, param: number, count = 6, N = 500): Spectrum {
  const d = POTS[key];
  const [a, b] = d.range(param);
  const dx = (b - a) / (N + 1);
  const x = new Float64Array(N), V = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    x[i] = a + (i + 1) * dx;
    V[i] = d.V(x[i], param);
  }
  const { E, psi } = boundStates(V, dx, count, d.mass);
  return { x, V, E, psi, dx };
}
