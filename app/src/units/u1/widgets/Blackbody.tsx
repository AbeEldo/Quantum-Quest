import React, { useState } from 'react';
import { Widget, Slider, Toggle, Tex, Stat } from '../../../components/ui';
import { planck, rayleighJeans, wienPeak, blackbodyRGB, wavelengthCSS, sigmaSB, h, c0, kB, sciTex } from '../physics';

const PRESETS: { name: string; T: number }[] = [
  { name: 'You (310 K)', T: 310 },
  { name: 'Stove coil (1000 K)', T: 1000 },
  { name: 'Candle flame (1900 K)', T: 1900 },
  { name: 'Light bulb (2800 K)', T: 2800 },
  { name: 'Sun (5772 K)', T: 5772 },
  { name: 'Sirius (9940 K)', T: 9940 },
  { name: 'Rigel (~12 000 K)', T: 12100 },
];

function visibleFraction(T: number): number {
  let vis = 0,
    tot = 0;
  const lp = wienPeak(T);
  const lmax = Math.max(lp * 40, 2e-6);
  const n = 3000;
  for (let i = 1; i <= n; i++) {
    const l = (i / n) * lmax;
    const v = planck(l, T);
    tot += v;
    if (l >= 380e-9 && l <= 750e-9) vis += v;
  }
  return tot > 0 ? vis / tot : 0;
}

/** Planck vs Rayleigh–Jeans spectra with a temperature slider and the perceived colour of the glow. */
export function BlackbodyExplorer({ classical = true, initialT = 5772 }: { classical?: boolean; initialT?: number }) {
  const [logT, setLogT] = useState(Math.log10(initialT));
  const [showRJ, setShowRJ] = useState(false);
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const T = Math.pow(10, logT);
  const lp = wienPeak(T); // m
  const xmaxUm = Math.min(60, Math.max(1.6, 4.5 * lp * 1e6));
  const peak = planck(lp, T);

  const W = 640,
    H = 300,
    pl = 46,
    pr = 14,
    pt = 14,
    pb = 36;
  const sx = (um: number) => pl + (um / xmaxUm) * (W - pl - pr);
  const sy = (v: number) => H - pb - (v / 1.25) * (H - pt - pb);
  const N = 320;
  const pts: string[] = [];
  const rj: string[] = [];
  for (let i = 1; i <= N; i++) {
    const um = (i / N) * xmaxUm;
    const v = planck(um * 1e-6, T) / peak;
    pts.push(`${sx(um).toFixed(1)},${sy(v).toFixed(1)}`);
    const r = rayleighJeans(um * 1e-6, T) / peak;
    if (r < 3) rj.push(`${sx(um).toFixed(1)},${sy(Math.min(r, 1.4)).toFixed(1)}`);
  }
  const area = `${sx(0)},${sy(0)} ${pts.join(' ')} ${sx(xmaxUm)},${sy(0)}`;
  const ticks: number[] = [];
  const step = xmaxUm <= 2 ? 0.25 : xmaxUm <= 5 ? 0.5 : xmaxUm <= 12 ? 1 : xmaxUm <= 30 ? 5 : 10;
  for (let v = 0; v <= xmaxUm + 1e-9; v += step) ticks.push(+v.toFixed(2));

  const [r, g, b] = blackbodyRGB(T);
  const visF = visibleFraction(T);
  // apparent brightness of the glow for the swatch: luminous power ∝ σT⁴·(visible fraction), shown on a log scale
  const lum = sigmaSB * T ** 4 * visF;
  const glow = Math.max(0, Math.min(1, (Math.log10(lum + 1e-9) - 0) / 6.5));

  return (
    <Widget title="Blackbody spectrum">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,3fr) minmax(0,1.1fr)', gap: 14, alignItems: 'center' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
          <defs>
            <linearGradient id={`bbr${uid}`} x1="0" x2="1" y1="0" y2="0">
              {Array.from({ length: 13 }, (_, i) => {
                const nm = 380 + (i / 12) * 370;
                return <stop key={i} offset={`${(i / 12) * 100}%`} stopColor={wavelengthCSS(nm)} />;
              })}
            </linearGradient>
            <clipPath id={`bbc${uid}`}>
              <rect x={pl} y={pt} width={W - pl - pr} height={H - pt - pb} />
            </clipPath>
          </defs>
          <rect width={W} height={H} rx={8} fill="#0d1018" />
          {ticks.map((t) => (
            <g key={t}>
              <line x1={sx(t)} x2={sx(t)} y1={pt} y2={H - pb} stroke="#1a2030" />
              <text x={sx(t)} y={H - pb + 14} fill="#6b7385" fontSize={10} textAnchor="middle">
                {t}
              </text>
            </g>
          ))}
          <text x={(pl + W) / 2} y={H - 6} fill="#9aa3b5" fontSize={11} textAnchor="middle" fontStyle="italic">
            wavelength (µm)
          </text>
          <text x={14} y={(pt + H - pb) / 2} fill="#9aa3b5" fontSize={11} textAnchor="middle" fontStyle="italic" transform={`rotate(-90 14 ${(pt + H - pb) / 2})`}>
            spectral radiance (relative)
          </text>
          {/* visible band */}
          <rect x={sx(0.38)} y={pt} width={Math.max(1, sx(0.75) - sx(0.38))} height={H - pt - pb} fill={`url(#bbr${uid})`} opacity={0.18} clipPath={`url(#bbc${uid})`} />
          <rect x={sx(0.38)} y={H - pb - 6} width={Math.max(1, sx(0.75) - sx(0.38))} height={6} fill={`url(#bbr${uid})`} clipPath={`url(#bbc${uid})`} />
          <g clipPath={`url(#bbc${uid})`}>
            <polygon points={area} fill={`rgb(${r},${g},${b})`} fillOpacity={0.18} />
            <polyline points={pts.join(' ')} fill="none" stroke={`rgb(${r},${g},${b})`} strokeWidth={2.6} />
            {showRJ && <polyline points={rj.join(' ')} fill="none" stroke="#fc6255" strokeWidth={2.2} strokeDasharray="7 5" />}
            <line x1={sx(lp * 1e6)} x2={sx(lp * 1e6)} y1={sy(1)} y2={sy(0)} stroke="#fcd34d" strokeDasharray="3 4" />
          </g>
          <line x1={pl} x2={W - pr} y1={sy(0)} y2={sy(0)} stroke="#55607a" />
          <text x={Math.min(sx(lp * 1e6) + 6, W - 120)} y={sy(1) - 6} fill="#fcd34d" fontSize={11}>
            peak λ = {lp * 1e6 < 1 ? `${(lp * 1e9).toFixed(0)} nm` : `${(lp * 1e6).toFixed(2)} µm`}
          </text>
          {showRJ && (
            <text x={pl + 8} y={pt + 14} fill="#fc6255" fontSize={11}>
              classical prediction (Rayleigh–Jeans) → ∞ at short λ
            </text>
          )}
        </svg>
        <div className="col" style={{ gap: 8, alignItems: 'center' }}>
          <div
            style={{
              width: 110,
              height: 110,
              borderRadius: '50%',
              background: glow > 0.02 ? `radial-gradient(circle, rgba(${r},${g},${b},${0.3 + 0.7 * glow}) 0%, rgba(${r},${g},${b},${0.5 * glow}) 55%, rgba(0,0,0,0) 72%)` : '#141820',
              boxShadow: glow > 0.02 ? `0 0 ${20 + 40 * glow}px rgba(${r},${g},${b},${0.6 * glow})` : 'none',
              border: '1px solid #2a3142',
            }}
          />
          <div className="faint center" style={{ fontSize: '0.78rem' }}>
            {glow < 0.08 ? 'glows only in the infrared (invisible to the eye)' : 'colour of the glow'}
          </div>
          <Stat label="temperature" value={`${Math.round(T).toLocaleString()} K`} color="#fcd34d" />
        </div>
      </div>
      <Slider label="temperature" value={logT} min={Math.log10(250)} max={Math.log10(30000)} step={0.002} onChange={setLogT} format={(v) => `${Math.round(Math.pow(10, v)).toLocaleString()} K`} />
      <div className="row" style={{ gap: 6, marginTop: 4 }}>
        {PRESETS.map((p) => (
          <button key={p.name} className="btn small" onClick={() => setLogT(Math.log10(p.T))}>
            {p.name}
          </button>
        ))}
      </div>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
        <div className="mono dim" style={{ fontSize: '0.82rem' }}>
          Wien: λ<sub>peak</sub> = b/T = {lp * 1e6 < 1 ? `${(lp * 1e9).toFixed(0)} nm` : `${(lp * 1e6).toFixed(2)} µm`} · σT⁴ = <Tex>{`${sciTex(sigmaSB * T ** 4, 3)}\\ \\mathrm{W/m^2}`}</Tex> · visible: {(visF * 100).toFixed(visF < 0.01 ? 4 : 1)}%
        </div>
        {classical && <Toggle label="show classical prediction" value={showRJ} onChange={setShowRJ} />}
      </div>
    </Widget>
  );
}

/**
 * Planck's quantum ladder: an oscillator of frequency f can only hold energies 0, hf, 2hf, …
 * Boltzmann weights e^{-E/kT} decide how often each rung is occupied; the mean energy falls far below kT when hf ≫ kT.
 */
export function QuantumLadder() {
  const [logL, setLogL] = useState(Math.log10(1000e-9)); // wavelength in m
  const [T, setT] = useState(5000);
  const lam = Math.pow(10, logL);
  const f = c0 / lam;
  const x = (h * f) / (kB * T); // hf / kT
  const meanOverKT = x / Math.expm1(x);
  const P = (n: number) => (1 - Math.exp(-x)) * Math.exp(-n * x);
  const levels = 7;

  // ladder svg
  const LW = 300,
    LH = 280;
  const maxE = Math.max(levels * x, 3); // in units of kT
  const ey = (eKT: number) => LH - 24 - (eKT / maxE) * (LH - 44);
  // curve svg
  const CW = 340,
    CH = 280,
    cl = 40,
    cb = 34;
  const xmax = 8;
  const cx = (v: number) => cl + (v / xmax) * (CW - cl - 12);
  const cy = (v: number) => CH - cb - v * (CH - cb - 16);
  const curve = Array.from({ length: 161 }, (_, i) => {
    const xv = 0.02 + (i / 160) * xmax;
    return `${cx(xv).toFixed(1)},${cy(xv / Math.expm1(xv)).toFixed(1)}`;
  }).join(' ');
  const nm = lam * 1e9;
  const band = nm < 380 ? 'ultraviolet' : nm <= 750 ? 'visible' : nm < 1e6 ? 'infrared' : 'microwave';

  return (
    <Widget title="Planck's quantum ladder">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.15fr)', gap: 14 }}>
        <svg viewBox={`0 0 ${LW} ${LH}`} style={{ width: '100%', height: 'auto' }}>
          <rect width={LW} height={LH} rx={8} fill="#0d1018" />
          <text x={10} y={16} fill="#9aa3b5" fontSize={11}>
            allowed energies 0, hf, 2hf, … and how often each is occupied
          </text>
          {Array.from({ length: levels }, (_, n) => n).map((n) => {
            const y = ey(n * x);
            if (y < 22) return null;
            const p = P(n);
            return (
              <g key={n}>
                <line x1={40} x2={110} y1={y} y2={y} stroke="#cfd6e4" strokeWidth={2} />
                <text x={34} y={y + 4} fill="#6b7385" fontSize={10} textAnchor="end">
                  {n === 0 ? '0' : `${n}hf`}
                </text>
                <rect x={118} y={y - 6} width={Math.max(1, p * 160)} height={12} rx={3} fill="#58c4dd" fillOpacity={0.85} />
                <text x={122 + p * 160} y={y + 4} fill="#9aa3b5" fontSize={10}>
                  {(p * 100).toFixed(p < 0.01 ? 2 : 0)}%
                </text>
              </g>
            );
          })}
          <line x1={20} x2={LW - 10} y1={ey(1)} y2={ey(1)} stroke="#fcd34d" strokeDasharray="5 4" />
          <text x={LW - 12} y={ey(1) - 5} fill="#fcd34d" fontSize={10} textAnchor="end">
            kT (typical thermal energy)
          </text>
          <line x1={20} x2={LW - 10} y1={ey(meanOverKT)} y2={ey(meanOverKT)} stroke="#e07ab6" strokeWidth={1.5} />
          <text x={LW - 12} y={ey(meanOverKT) + 12} fill="#e07ab6" fontSize={10} textAnchor="end">
            average energy ⟨E⟩
          </text>
        </svg>
        <svg viewBox={`0 0 ${CW} ${CH}`} style={{ width: '100%', height: 'auto' }}>
          <rect width={CW} height={CH} rx={8} fill="#0d1018" />
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <g key={v}>
              <line x1={cl} x2={CW - 12} y1={cy(v)} y2={cy(v)} stroke="#1a2030" />
              <text x={cl - 5} y={cy(v) + 4} fill="#6b7385" fontSize={10} textAnchor="end">
                {v}
              </text>
            </g>
          ))}
          {[0, 2, 4, 6, 8].map((v) => (
            <text key={v} x={cx(v)} y={CH - cb + 14} fill="#6b7385" fontSize={10} textAnchor="middle">
              {v}
            </text>
          ))}
          <text x={(cl + CW) / 2} y={CH - 6} fill="#9aa3b5" fontSize={11} textAnchor="middle" fontStyle="italic">
            hf / kT (size of the energy lump vs thermal energy)
          </text>
          <line x1={cl} x2={CW - 12} y1={cy(1)} y2={cy(1)} stroke="#fc6255" strokeDasharray="6 4" />
          <text x={CW - 14} y={cy(1) - 5} fill="#fc6255" fontSize={10} textAnchor="end">
            classical: every mode gets kT
          </text>
          <polyline points={curve} fill="none" stroke="#e07ab6" strokeWidth={2.4} />
          {x <= xmax && <circle cx={cx(x)} cy={cy(meanOverKT)} r={6} fill="#fff" stroke="#e07ab6" strokeWidth={2} />}
          <text x={cl + 6} y={18} fill="#e07ab6" fontSize={11}>
            ⟨E⟩/kT = x/(eˣ − 1)
          </text>
        </svg>
      </div>
      <Slider label="mode wavelength" value={logL} min={Math.log10(100e-9)} max={Math.log10(100e-6)} step={0.002} onChange={setLogL} format={(v) => { const m = Math.pow(10, v); return m < 1e-6 ? `${(m * 1e9).toFixed(0)} nm` : `${(m * 1e6).toFixed(1)} µm`; }} />
      <Slider label="temperature" value={T} min={300} max={10000} step={50} onChange={setT} format={(v) => `${v} K`} />
      <div className="dim" style={{ fontSize: '0.88rem', marginTop: 6 }}>
        At {T} K, a {band} mode (λ = {nm < 1000 ? `${nm.toFixed(0)} nm` : `${(nm / 1000).toFixed(1)} µm`}) has quantum <Tex>{`hf = ${(h * f / 1.602176634e-19).toFixed(3)}\\ \\text{eV}`}</Tex> versus <Tex>{`kT = ${(kB * T / 1.602176634e-19).toFixed(3)}\\ \\text{eV}`}</Tex>, so hf/kT = {x.toFixed(2)} and the mode holds on average{' '}
        <b>{(meanOverKT * 100).toFixed(meanOverKT < 0.01 ? 3 : 1)}%</b> of the classical share.
        {x > 5 ? ' The lump is too big to afford: this mode is frozen out.' : x < 0.3 ? ' Lumps are tiny compared with kT, so the classical answer is nearly right.' : ''}
      </div>
    </Widget>
  );
}
