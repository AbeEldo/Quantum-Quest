/** Physical constants (SI, exact 2019 SI values where defined) and helpers for World 1. */

export const h = 6.62607015e-34; // J s (exact)
export const hbar = h / (2 * Math.PI);
export const c0 = 299792458; // m/s (exact)
export const kB = 1.380649e-23; // J/K (exact)
export const eC = 1.602176634e-19; // C (exact)
export const me = 9.1093837e-31; // kg
export const mp = 1.67262192e-27; // kg
export const mn = 1.67492750e-27; // kg
export const amu = 1.66053907e-27; // kg
export const sigmaSB = 5.670374419e-8; // W m^-2 K^-4
export const wienB = 2.897771955e-3; // m K
export const hcEVnm = (h * c0) / eC * 1e9; // ≈ 1239.84 eV·nm
export const RH = 1.09677583e7; // Rydberg constant for hydrogen (reduced mass), m^-1
export const RYD_EV = 13.6057; // Rydberg energy, eV (infinite nuclear mass)

/** Planck spectral radiance B_λ(λ, T) in W·sr⁻¹·m⁻³ (λ in metres). */
export function planck(lambda: number, T: number): number {
  const x = (h * c0) / (lambda * kB * T);
  if (x > 700) return 0;
  return (2 * h * c0 * c0) / Math.pow(lambda, 5) / Math.expm1(x);
}

/** Rayleigh–Jeans spectral radiance (classical), same units. */
export function rayleighJeans(lambda: number, T: number): number {
  return (2 * c0 * kB * T) / Math.pow(lambda, 4);
}

/** Wien's displacement law: peak wavelength in metres. */
export const wienPeak = (T: number) => wienB / T;

/** Photon energy in eV for a wavelength in nm. */
export const photonEV = (nm: number) => hcEVnm / nm;
/** Wavelength in nm for a photon energy in eV. */
export const nmFromEV = (eV: number) => hcEVnm / eV;
/** Frequency (Hz) for a wavelength in nm. */
export const freqFromNm = (nm: number) => c0 / (nm * 1e-9);

/** Hydrogen energy level (eV), Bohr model. */
export const hydrogenE = (n: number) => -RYD_EV / (n * n);
/** Hydrogen transition wavelength in nm (vacuum), using the Rydberg formula with R_H. */
export function hydrogenLambda(nUpper: number, nLower: number): number {
  return 1e9 / (RH * (1 / (nLower * nLower) - 1 / (nUpper * nUpper)));
}
export const SERIES: Record<number, string> = { 1: 'Lyman', 2: 'Balmer', 3: 'Paschen', 4: 'Brackett', 5: 'Pfund', 6: 'Humphreys' };

/** de Broglie wavelength (m) for mass m (kg) and kinetic energy K (J), relativistically correct. */
export function deBroglieFromK(m: number, K: number): number {
  const mc2 = m * c0 * c0;
  const pc = Math.sqrt(K * K + 2 * K * mc2);
  return (h * c0) / pc;
}
/** de Broglie wavelength (m) for mass m (kg) and speed v (m/s), relativistic. */
export function deBroglieFromV(m: number, v: number): number {
  const g = 1 / Math.sqrt(1 - Math.min(0.999999999, (v / c0) ** 2));
  return h / (g * m * v);
}

/** Representative photoelectric work functions (eV). Real surfaces vary by a few tenths of an eV. */
export const METALS: { name: string; symbol: string; phi: number; color: string }[] = [
  { name: 'Caesium', symbol: 'Cs', phi: 2.1, color: '#e8d38a' },
  { name: 'Potassium', symbol: 'K', phi: 2.3, color: '#cfd3d6' },
  { name: 'Sodium', symbol: 'Na', phi: 2.36, color: '#d9dcd0' },
  { name: 'Calcium', symbol: 'Ca', phi: 2.9, color: '#d8d8cf' },
  { name: 'Zinc', symbol: 'Zn', phi: 4.3, color: '#b9c3cc' },
  { name: 'Copper', symbol: 'Cu', phi: 4.7, color: '#d58b5a' },
  { name: 'Platinum', symbol: 'Pt', phi: 5.6, color: '#e5e4e2' },
];

/** Approximate RGB (0–255) of a spectral colour; returns dim grey-violet/red outside the visible range. */
export function wavelengthRGB(nm: number): [number, number, number] {
  let r = 0,
    g = 0,
    b = 0;
  if (nm >= 380 && nm < 440) {
    r = -(nm - 440) / 60;
    b = 1;
  } else if (nm >= 440 && nm < 490) {
    g = (nm - 440) / 50;
    b = 1;
  } else if (nm >= 490 && nm < 510) {
    g = 1;
    b = -(nm - 510) / 20;
  } else if (nm >= 510 && nm < 580) {
    r = (nm - 510) / 70;
    g = 1;
  } else if (nm >= 580 && nm < 645) {
    r = 1;
    g = -(nm - 645) / 65;
  } else if (nm >= 645 && nm <= 780) {
    r = 1;
  }
  let f = 0;
  if (nm >= 380 && nm < 420) f = 0.3 + (0.7 * (nm - 380)) / 40;
  else if (nm >= 420 && nm <= 700) f = 1;
  else if (nm > 700 && nm <= 780) f = 0.3 + (0.7 * (780 - nm)) / 80;
  const gam = 0.8;
  const t = (x: number) => Math.round(255 * Math.pow(x * f, gam));
  return [t(r), t(g), t(b)];
}
export const wavelengthCSS = (nm: number, alpha = 1) => {
  if (nm < 380) return `rgba(170, 120, 255, ${alpha})`; // ultraviolet: drawn as a ghostly violet
  if (nm > 780) return `rgba(150, 60, 50, ${alpha})`; // infrared: dull red
  const [r, g, b] = wavelengthRGB(nm);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/* CIE 1931 colour matching functions, multi-lobe Gaussian fit (Wyman, Sloan & Shirley 2013). */
const g1 = (x: number, mu: number, s1: number, s2: number) => {
  const t = (x - mu) / (x < mu ? s1 : s2);
  return Math.exp(-0.5 * t * t);
};
export function cieXYZ(nm: number): [number, number, number] {
  const X = 1.056 * g1(nm, 599.8, 37.9, 31.0) + 0.362 * g1(nm, 442.0, 16.0, 26.7) - 0.065 * g1(nm, 501.1, 20.4, 26.2);
  const Y = 0.821 * g1(nm, 568.8, 46.9, 40.5) + 0.286 * g1(nm, 530.9, 16.3, 31.1);
  const Z = 1.217 * g1(nm, 437.0, 11.8, 36.0) + 0.681 * g1(nm, 459.0, 26.0, 13.8);
  return [X, Y, Z];
}

/** Perceived colour of a blackbody at temperature T, normalized so the brightest channel is 1 (sRGB, 0–255). */
export function blackbodyRGB(T: number): [number, number, number] {
  let X = 0,
    Y = 0,
    Z = 0;
  for (let nm = 380; nm <= 780; nm += 5) {
    const B = planck(nm * 1e-9, T);
    const [x, y, z] = cieXYZ(nm);
    X += B * x;
    Y += B * y;
    Z += B * z;
  }
  let r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
  let g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
  let b = 0.0557 * X - 0.204 * Y + 1.057 * Z;
  r = Math.max(0, r);
  g = Math.max(0, g);
  b = Math.max(0, b);
  const m = Math.max(r, g, b, 1e-30);
  const gamma = (u: number) => (u <= 0.0031308 ? 12.92 * u : 1.055 * Math.pow(u, 1 / 2.4) - 0.055);
  return [Math.round(255 * gamma(r / m)), Math.round(255 * gamma(g / m)), Math.round(255 * gamma(b / m))];
}

/** Format a number in scientific notation for TeX: 6.63 \times 10^{-34}. */
export function sciTex(x: number, digits = 3): string {
  if (x === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(x)));
  const m = x / Math.pow(10, e);
  if (e >= -2 && e <= 3) return x.toPrecision(digits);
  return `${m.toFixed(digits - 1)}\\times 10^{${e}}`;
}

/** Format a length in metres with a sensible unit. */
export function fmtLength(m: number): string {
  const a = Math.abs(m);
  if (a >= 1) return `${m.toPrecision(3)} m`;
  if (a >= 1e-3) return `${(m * 1e3).toPrecision(3)} mm`;
  if (a >= 1e-6) return `${(m * 1e6).toPrecision(3)} µm`;
  if (a >= 1e-9) return `${(m * 1e9).toPrecision(3)} nm`;
  if (a >= 1e-12) return `${(m * 1e12).toPrecision(3)} pm`;
  if (a >= 1e-15) return `${(m * 1e15).toPrecision(3)} fm`;
  return `${m.toExponential(2)} m`;
}
