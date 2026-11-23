/**
 * wave1d — time-dependent 1D Schrödinger equation solver (split-step Fourier)
 * plus a tridiagonal eigen-solver for bound states.
 *
 * Units: ħ = m = 1 by default.  iħ ∂ψ/∂t = −(ħ²/2m) ∂²ψ/∂x² + V(x) ψ
 */

/** In-place iterative radix-2 FFT. inverse=true computes the unnormalised inverse. */
export function fft(re: Float64Array, im: Float64Array, inverse = false) {
  const n = re.length;
  if ((n & (n - 1)) !== 0) throw new Error('FFT size must be a power of 2');
  // bit reversal
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      const half = len >> 1;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

export interface Wave1DOptions {
  N?: number;
  xmin?: number;
  xmax?: number;
  dt?: number;
  mass?: number;
  /** Width (in x units) of absorbing layers at the edges; 0 = periodic boundaries. */
  absorb?: number;
}

export class Wave1D {
  readonly N: number;
  readonly xmin: number;
  readonly xmax: number;
  readonly dx: number;
  readonly x: Float64Array;
  readonly k: Float64Array;
  dt: number;
  mass: number;
  V: Float64Array;
  re: Float64Array;
  im: Float64Array;
  t = 0;
  private mask: Float64Array | null = null;
  private vPhaseRe!: Float64Array;
  private vPhaseIm!: Float64Array;
  private kPhaseRe!: Float64Array;
  private kPhaseIm!: Float64Array;
  private dirty = true;

  constructor(opts: Wave1DOptions = {}) {
    this.N = opts.N ?? 1024;
    this.xmin = opts.xmin ?? -50;
    this.xmax = opts.xmax ?? 50;
    this.dt = opts.dt ?? 0.01;
    this.mass = opts.mass ?? 1;
    const L = this.xmax - this.xmin;
    this.dx = L / this.N;
    this.x = new Float64Array(this.N);
    this.k = new Float64Array(this.N);
    for (let i = 0; i < this.N; i++) {
      this.x[i] = this.xmin + i * this.dx;
      const kk = i < this.N / 2 ? i : i - this.N;
      this.k[i] = (2 * Math.PI * kk) / L;
    }
    this.V = new Float64Array(this.N);
    this.re = new Float64Array(this.N);
    this.im = new Float64Array(this.N);
    if (opts.absorb && opts.absorb > 0) this.setAbsorbing(opts.absorb);
  }

  setAbsorbing(width: number) {
    this.mask = new Float64Array(this.N);
    for (let i = 0; i < this.N; i++) {
      const d = Math.min(this.x[i] - this.xmin, this.xmax - this.x[i]);
      if (d >= width) this.mask[i] = 1;
      else {
        const s = 1 - d / width;
        this.mask[i] = Math.exp(-8 * this.dt * s * s * 4);
      }
    }
  }

  setPotential(V: ((x: number) => number) | ArrayLike<number>) {
    if (typeof V === 'function') for (let i = 0; i < this.N; i++) this.V[i] = V(this.x[i]);
    else for (let i = 0; i < this.N; i++) this.V[i] = V[i];
    this.dirty = true;
  }

  setDt(dt: number) {
    this.dt = dt;
    this.dirty = true;
  }

  private prepare() {
    const N = this.N, dt = this.dt;
    this.vPhaseRe = new Float64Array(N);
    this.vPhaseIm = new Float64Array(N);
    this.kPhaseRe = new Float64Array(N);
    this.kPhaseIm = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const a = (-this.V[i] * dt) / 2;
      this.vPhaseRe[i] = Math.cos(a);
      this.vPhaseIm[i] = Math.sin(a);
      const b = (-(this.k[i] * this.k[i]) * dt) / (2 * this.mass);
      this.kPhaseRe[i] = Math.cos(b);
      this.kPhaseIm[i] = Math.sin(b);
    }
    this.dirty = false;
  }

  /** Gaussian wave packet centred at x0 with width sigma and mean momentum k0. Normalised. */
  setGaussian(x0: number, sigma: number, k0: number) {
    for (let i = 0; i < this.N; i++) {
      const d = this.x[i] - x0;
      const env = Math.exp(-(d * d) / (4 * sigma * sigma));
      this.re[i] = env * Math.cos(k0 * this.x[i]);
      this.im[i] = env * Math.sin(k0 * this.x[i]);
    }
    this.normalize();
    this.t = 0;
  }

  setState(re: ArrayLike<number>, im?: ArrayLike<number>) {
    for (let i = 0; i < this.N; i++) {
      this.re[i] = re[i];
      this.im[i] = im ? im[i] : 0;
    }
    this.normalize();
    this.t = 0;
  }

  normalize() {
    const n = Math.sqrt(this.norm2());
    if (n > 0)
      for (let i = 0; i < this.N; i++) {
        this.re[i] /= n;
        this.im[i] /= n;
      }
  }

  norm2(): number {
    let s = 0;
    for (let i = 0; i < this.N; i++) s += this.re[i] ** 2 + this.im[i] ** 2;
    return s * this.dx;
  }

  step(steps = 1) {
    if (this.dirty) this.prepare();
    const { N, re, im, vPhaseRe: vr, vPhaseIm: vi, kPhaseRe: kr, kPhaseIm: ki } = this;
    const mulArr = (pr: Float64Array, pi: Float64Array) => {
      for (let i = 0; i < N; i++) {
        const a = re[i], b = im[i];
        re[i] = a * pr[i] - b * pi[i];
        im[i] = a * pi[i] + b * pr[i];
      }
    };
    for (let s = 0; s < steps; s++) {
      mulArr(vr, vi);
      fft(re, im, false);
      mulArr(kr, ki);
      fft(re, im, true);
      const inv = 1 / N;
      for (let i = 0; i < N; i++) {
        re[i] *= inv;
        im[i] *= inv;
      }
      mulArr(vr, vi);
      if (this.mask) for (let i = 0; i < N; i++) {
        re[i] *= this.mask[i];
        im[i] *= this.mask[i];
      }
      this.t += this.dt;
    }
  }

  density(): Float64Array {
    const d = new Float64Array(this.N);
    for (let i = 0; i < this.N; i++) d[i] = this.re[i] ** 2 + this.im[i] ** 2;
    return d;
  }

  /** Probability of finding the particle in [a, b]. */
  probIn(a: number, b: number): number {
    let s = 0;
    for (let i = 0; i < this.N; i++) if (this.x[i] >= a && this.x[i] < b) s += this.re[i] ** 2 + this.im[i] ** 2;
    return s * this.dx;
  }

  expectX(): number {
    let s = 0;
    for (let i = 0; i < this.N; i++) s += this.x[i] * (this.re[i] ** 2 + this.im[i] ** 2);
    return (s * this.dx) / this.norm2();
  }

  /** Momentum-space probability density, ordered by increasing k. Returns {k, p}. */
  momentumDensity(): { k: Float64Array; p: Float64Array } {
    const re = this.re.slice(), im = this.im.slice();
    // remove x-origin phase: we only need |φ(k)|², so plain FFT is fine
    fft(re, im, false);
    const N = this.N;
    const k = new Float64Array(N), p = new Float64Array(N);
    for (let j = 0; j < N; j++) {
      const src = (j + N / 2) % N;
      k[j] = this.k[src];
      p[j] = re[src] ** 2 + im[src] ** 2;
    }
    // normalise so Σ p dk = 1
    const dk = (2 * Math.PI) / (this.xmax - this.xmin);
    let tot = 0;
    for (let j = 0; j < N; j++) tot += p[j] * dk;
    if (tot > 0) for (let j = 0; j < N; j++) p[j] /= tot;
    return { k, p };
  }

  /** Standard deviations of position and momentum. */
  uncertainties(): { dx: number; dp: number } {
    const n2 = this.norm2();
    let mx = 0, mx2 = 0;
    for (let i = 0; i < this.N; i++) {
      const w = (this.re[i] ** 2 + this.im[i] ** 2) * this.dx / n2;
      mx += this.x[i] * w;
      mx2 += this.x[i] ** 2 * w;
    }
    const { k, p } = this.momentumDensity();
    const dk = (2 * Math.PI) / (this.xmax - this.xmin);
    let mk = 0, mk2 = 0;
    for (let j = 0; j < this.N; j++) {
      mk += k[j] * p[j] * dk;
      mk2 += k[j] ** 2 * p[j] * dk;
    }
    return { dx: Math.sqrt(Math.max(0, mx2 - mx * mx)), dp: Math.sqrt(Math.max(0, mk2 - mk * mk)) };
  }

  /** Expected energy ⟨H⟩ (approx, via FFT kinetic term). */
  energy(): number {
    const re = this.re.slice(), im = this.im.slice();
    fft(re, im, false);
    let kin = 0, tot = 0;
    for (let j = 0; j < this.N; j++) {
      const p = re[j] ** 2 + im[j] ** 2;
      kin += (this.k[j] ** 2 / (2 * this.mass)) * p;
      tot += p;
    }
    let pot = 0;
    for (let i = 0; i < this.N; i++) pot += this.V[i] * (this.re[i] ** 2 + this.im[i] ** 2);
    return kin / tot + (pot * this.dx) / this.norm2();
  }
}

/* -------------------------------------------------------------------------- */
/*                    Bound states via tridiagonal eigensolver                 */
/* -------------------------------------------------------------------------- */

/**
 * Lowest `count` eigenpairs of H = −(1/2m) d²/dx² + V on a uniform grid with
 * hard walls at the ends (finite differences). Uses Sturm-sequence bisection
 * for eigenvalues and inverse iteration for eigenvectors. Eigenvectors are
 * normalised so Σ ψ² dx = 1, sign chosen so first lobe is positive.
 */
export function boundStates(V: ArrayLike<number>, dx: number, count: number, mass = 1): { E: number[]; psi: Float64Array[] } {
  const n = V.length;
  const off = -1 / (2 * mass * dx * dx);
  const diag = new Float64Array(n);
  for (let i = 0; i < n; i++) diag[i] = V[i] + 1 / (mass * dx * dx);
  const offSq = off * off;
  // Sturm count: number of eigenvalues < x
  const sturm = (x: number) => {
    let cnt = 0;
    let q = diag[0] - x;
    if (q < 0) cnt++;
    for (let i = 1; i < n; i++) {
      q = diag[i] - x - offSq / (q === 0 ? 1e-300 : q);
      if (q < 0) cnt++;
    }
    return cnt;
  };
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) {
    lo = Math.min(lo, diag[i] - 2 * Math.abs(off));
    hi = Math.max(hi, diag[i] + 2 * Math.abs(off));
  }
  const E: number[] = [];
  for (let k = 0; k < Math.min(count, n); k++) {
    let a = lo, b = hi;
    for (let it = 0; it < 100; it++) {
      const m = (a + b) / 2;
      if (sturm(m) > k) b = m;
      else a = m;
    }
    E.push((a + b) / 2);
  }
  const psi = E.map((e) => inverseIteration(diag, off, e, dx));
  return { E, psi };
}

function inverseIteration(diag: Float64Array, off: number, e: number, dx: number): Float64Array {
  const n = diag.length;
  let v = new Float64Array(n).map((_, i) => Math.sin((i + 1) * 0.37) + 1.1);
  const shift = e + 1e-10 * (1 + Math.abs(e));
  for (let it = 0; it < 6; it++) {
    // solve (T - shift I) w = v with Thomas algorithm
    const cp = new Float64Array(n), dp = new Float64Array(n);
    let b0 = diag[0] - shift;
    if (Math.abs(b0) < 1e-300) b0 = 1e-300;
    cp[0] = off / b0;
    dp[0] = v[0] / b0;
    for (let i = 1; i < n; i++) {
      let m = diag[i] - shift - off * cp[i - 1];
      if (Math.abs(m) < 1e-300) m = 1e-300;
      cp[i] = off / m;
      dp[i] = (v[i] - off * dp[i - 1]) / m;
    }
    const w = new Float64Array(n);
    w[n - 1] = dp[n - 1];
    for (let i = n - 2; i >= 0; i--) w[i] = dp[i] - cp[i] * w[i + 1];
    let nrm = 0;
    for (let i = 0; i < n; i++) nrm += w[i] * w[i];
    nrm = Math.sqrt(nrm * dx);
    for (let i = 0; i < n; i++) w[i] /= nrm;
    v = w;
  }
  // sign convention: first significant value positive
  const maxAbs = v.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
  const first = v.find((x) => Math.abs(x) > 0.05 * maxAbs) ?? 1;
  if (first < 0) for (let i = 0; i < n; i++) v[i] = -v[i];
  return v;
}

/** Analytic transmission probability through a rectangular barrier (height V0, width a), ħ = m = 1. */
export function rectBarrierTransmission(E: number, V0: number, a: number, mass = 1): number {
  if (E <= 0) return 0;
  if (Math.abs(E - V0) < 1e-12) return 1 / (1 + (mass * a * a * V0) / 2);
  if (E < V0) {
    const kappa = Math.sqrt(2 * mass * (V0 - E));
    const s = Math.sinh(kappa * a);
    return 1 / (1 + (V0 * V0 * s * s) / (4 * E * (V0 - E)));
  }
  const k2 = Math.sqrt(2 * mass * (E - V0));
  const s = Math.sin(k2 * a);
  return 1 / (1 + (V0 * V0 * s * s) / (4 * E * (E - V0)));
}

/** Particle-in-a-box (width L) energies E_n = n²π²/(2mL²) and wavefunctions. */
export const box = {
  energy: (n: number, L: number, mass = 1) => (n * n * Math.PI * Math.PI) / (2 * mass * L * L),
  psi: (n: number, L: number, x: number) => (x < 0 || x > L ? 0 : Math.sqrt(2 / L) * Math.sin((n * Math.PI * x) / L)),
};

/** Harmonic oscillator (ω, m=1): E_n = (n + 1/2) ω, ψ_n via Hermite recursion. */
export const oscillator = {
  energy: (n: number, omega: number) => (n + 0.5) * omega,
  psi(n: number, omega: number, x: number): number {
    const xi = Math.sqrt(omega) * x;
    // normalised Hermite functions via stable recursion
    let h0 = Math.pow(omega / Math.PI, 0.25) * Math.exp(-(xi * xi) / 2);
    if (n === 0) return h0;
    let h1 = Math.SQRT2 * xi * h0;
    for (let k = 2; k <= n; k++) {
      const h2 = Math.sqrt(2 / k) * xi * h1 - Math.sqrt((k - 1) / k) * h0;
      h0 = h1;
      h1 = h2;
    }
    return h1;
  },
};
