import React, { useState } from 'react';
import { Widget, Slider, Segmented, Tex, Stat, useAnimationFrame } from '../../../components/ui';
import { h, me, mp, mn, amu, eC, c0, deBroglieFromK, deBroglieFromV, fmtLength, sciTex } from '../physics';

/* ------------------------------------------------------------------ */
/* Standing waves on a Bohr orbit                                      */
/* ------------------------------------------------------------------ */

/** A wave wrapped around a circle: only whole numbers of wavelengths join up smoothly. */
export function OrbitWave() {
  const [n, setN] = useState(3.4);
  const [t, setT] = useState(0);
  useAnimationFrame((dt) => setT((x) => x + dt), true);
  const W = 380,
    H = 380,
    R = 120,
    A = 22;
  const cx = W / 2,
    cy = H / 2;
  const integer = Math.abs(n - Math.round(n)) < 0.02;
  // draw the wave for the first lap, and (faintly) its continuation into the second lap
  const lap = (k: number) =>
    Array.from({ length: 361 }, (_, i) => {
      const th = (i / 360) * 2 * Math.PI;
      const s = th + 2 * Math.PI * k;
      const r = R + A * Math.cos(n * s) * Math.cos(2 * t);
      return `${(cx + r * Math.cos(th)).toFixed(1)},${(cy - r * Math.sin(th)).toFixed(1)}`;
    }).join(' ');
  const mismatch = Math.abs(Math.cos(n * 2 * Math.PI) - 1) + Math.abs(Math.sin(n * 2 * Math.PI));
  return (
    <Widget title="Wrapping a wave around an orbit">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16, alignItems: 'center' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 380, height: 'auto' }}>
          <rect width={W} height={H} rx={10} fill="#0d1018" />
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="#2a3346" strokeDasharray="4 4" />
          <circle cx={cx} cy={cy} r={6} fill="#fc6255" />
          {!integer && <polyline points={lap(1)} fill="none" stroke="#fc6255" strokeOpacity={0.45} strokeWidth={1.5} />}
          <polyline points={lap(0)} fill="none" stroke={integer ? '#83c167' : '#58c4dd'} strokeWidth={2.6} />
          {!integer && <circle cx={cx + R + A * Math.cos(2 * t)} cy={cy} r={8} fill="none" stroke="#fc6255" strokeWidth={2} />}
          <text x={12} y={22} fill={integer ? '#83c167' : '#fc6255'} fontSize={13}>
            {integer ? `✓ ${Math.round(n)} whole wavelengths: a standing wave` : 'the wave does not join itself: it interferes away'}
          </text>
        </svg>
        <div className="col" style={{ gap: 10 }}>
          <Slider label="wavelengths around the orbit" value={n} min={1} max={8} step={0.02} onChange={setN} format={(v) => v.toFixed(2)} />
          <div className="row" style={{ gap: 6 }}>
            {[1, 2, 3, 4, 5].map((k) => (
              <button key={k} className="btn small" onClick={() => setN(k)}>
                n = {k}
              </button>
            ))}
          </div>
          <div style={{ fontSize: '0.95rem' }}>
            <Tex>{'2\\pi r = n\\lambda \\;\\text{ and }\\; \\lambda = \\frac{h}{p} \\;\\Rightarrow\\; L = pr = n\\frac{h}{2\\pi} = n\\hbar'}</Tex>
          </div>
          <div className="dim" style={{ fontSize: '0.88rem' }}>
            {integer
              ? "The crests line up after one lap, so the wave reinforces itself on every trip around. That's Bohr's quantization rule, now with a reason."
              : `After one lap the wave arrives out of step with itself (mismatch ${mismatch.toFixed(2)}). On every further lap it lands at a different phase, and the laps cancel out.`}
          </div>
        </div>
      </div>
    </Widget>
  );
}

/* ------------------------------------------------------------------ */
/* de Broglie wavelength explorer                                       */
/* ------------------------------------------------------------------ */

interface Obj {
  name: string;
  m: number;
  vDefault: number;
  charged?: boolean;
  note: string;
}
const OBJECTS: Obj[] = [
  { name: 'Electron', m: me, vDefault: 4.36e6, charged: true, note: '54 eV electron (Davisson–Germer)' },
  { name: 'Neutron', m: mn, vDefault: 2200, note: '2200 m/s: a "thermal" neutron from a reactor' },
  { name: 'Proton', m: mp, vDefault: 1e5, charged: true, note: '' },
  { name: 'Buckyball C₆₀', m: 720 * amu, vDefault: 200, note: 'Diffracted in Vienna, 1999' },
  { name: 'Dust grain (1 µm)', m: 1e-15, vDefault: 1e-3, note: 'drifting at 1 mm/s' },
  { name: 'Baseball', m: 0.145, vDefault: 40, note: 'a 90 mph pitch' },
  { name: 'You', m: 70, vDefault: 1.4, note: 'walking' },
];

const LANDMARKS: { m: number; label: string }[] = [
  { m: 1.7e-15, label: 'proton' },
  { m: 1e-10, label: 'atom' },
  { m: 1e-8, label: 'virus' },
  { m: 5e-7, label: 'light' },
  { m: 7e-5, label: 'hair' },
  { m: 7.4e-2, label: 'baseball' },
];

export function DeBroglieExplorer() {
  const [oi, setOi] = useState(0);
  const obj = OBJECTS[oi];
  const [logV, setLogV] = useState(Math.log10(obj.vDefault));
  const [mode, setMode] = useState<'speed' | 'voltage'>('speed');
  const [voltage, setVoltage] = useState(54);
  const [logGap, setLogGap] = useState(-9); // gap width in metres

  const v = Math.pow(10, logV);
  const lam = mode === 'voltage' && obj.charged ? deBroglieFromK(obj.m, voltage * eC) : deBroglieFromV(obj.m, Math.min(v, 0.999 * c0));
  const p = h / lam;
  const gap = Math.pow(10, logGap);
  const theta = lam / gap; // radians, small-angle spread
  const visible = theta > 1e-4;

  // log ruler from 1e-36 to 1 m
  const RW = 720,
    RH = 70;
  const lmin = -36,
    lmax = 1;
  const rx = (m: number) => 10 + ((Math.log10(m) - lmin) / (lmax - lmin)) * (RW - 20);

  // diffraction sketch
  const DW = 360,
    DH = 200;
  const spread = Math.min(Math.PI / 2.2, Math.atan(theta));
  return (
    <Widget title="How long is a matter wave?">
      <div className="row" style={{ gap: 4, marginBottom: 8 }}>
        {OBJECTS.map((o, i) => (
          <button
            key={o.name}
            className={`btn small ${i === oi ? 'active' : ''}`}
            onClick={() => {
              setOi(i);
              setLogV(Math.log10(o.vDefault));
              if (!o.charged) setMode('speed');
            }}
          >
            {o.name}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16 }}>
        <div className="col" style={{ gap: 6 }}>
          {obj.charged && (
            <Segmented
              options={[
                { value: 'speed', label: 'set speed' },
                { value: 'voltage', label: 'accelerate through V' },
              ]}
              value={mode}
              onChange={(m) => setMode(m as 'speed' | 'voltage')}
            />
          )}
          {mode === 'speed' || !obj.charged ? (
            <Slider label="speed" value={logV} min={-4} max={Math.log10(0.99 * c0)} step={0.01} onChange={setLogV} format={(x) => { const s = Math.pow(10, x); return s >= 1e3 ? `${(s / 1e3).toPrecision(3)} km/s` : s >= 1 ? `${s.toPrecision(3)} m/s` : `${(s * 1e3).toPrecision(3)} mm/s`; }} />
          ) : (
            <Slider label="voltage" value={voltage} min={1} max={100000} step={1} onChange={setVoltage} format={(x) => (x >= 1000 ? `${(x / 1000).toFixed(1)} kV` : `${x.toFixed(0)} V`)} />
          )}
          <div className="faint" style={{ fontSize: '0.8rem' }}>
            mass = <Tex>{`${sciTex(obj.m, 3)}\\ \\text{kg}`}</Tex>
            {obj.note && ` · ${obj.note}`}
          </div>
          <div className="row" style={{ gap: 6 }}>
            <Stat label="momentum p" value={<Tex>{`${sciTex(p, 3)}`}</Tex>} color="#cfd6e4" />
            <Stat label="λ = h / p" value={fmtLength(lam)} color="#fcd34d" />
          </div>
        </div>
        <div>
          <svg viewBox={`0 0 ${DW} ${DH}`} style={{ width: '100%', height: 'auto' }}>
            <rect width={DW} height={DH} rx={8} fill="#0d1018" />
            {/* incoming plane waves */}
            {Array.from({ length: 7 }, (_, i) => (
              <line key={i} x1={20 + i * 14} x2={20 + i * 14} y1={60} y2={140} stroke="#58c4dd" strokeOpacity={0.6} />
            ))}
            {/* wall with gap */}
            <rect x={130} y={10} width={8} height={DH / 2 - 14} fill="#55607a" />
            <rect x={130} y={DH / 2 + 4} width={8} height={DH / 2 - 14} fill="#55607a" />
            {/* spreading cone */}
            <polygon points={`138,${DH / 2 - 4} ${DW - 10},${DH / 2 - 4 - (DW - 148) * Math.tan(spread)} ${DW - 10},${DH / 2 + 4 + (DW - 148) * Math.tan(spread)} 138,${DH / 2 + 4}`} fill="#58c4dd" fillOpacity={0.15} stroke="#58c4dd" strokeOpacity={0.5} />
            <text x={146} y={DH - 10} fill="#9aa3b5" fontSize={11}>
              spread ≈ λ/a = {theta < 1e-3 ? sciTex(theta, 2).replace('\\times 10^{', '×10^').replace('}', '') : theta.toFixed(3)} rad
            </text>
            <text x={10} y={20} fill="#9aa3b5" fontSize={11}>
              gap a = {fmtLength(gap)}
            </text>
            <text x={10} y={DH - 10} fill={visible ? '#83c167' : '#fc6255'} fontSize={11}>
              {visible ? 'diffraction visible' : 'no visible diffraction'}
            </text>
          </svg>
          <Slider label="gap width a" value={logGap} min={-11} max={0} step={0.05} onChange={setLogGap} format={(x) => fmtLength(Math.pow(10, x))} />
        </div>
      </div>
      <svg viewBox={`0 0 ${RW} ${RH}`} style={{ width: '100%', height: 'auto', marginTop: 8 }}>
        <rect width={RW} height={RH} rx={8} fill="#0d1018" />
        <line x1={10} x2={RW - 10} y1={34} y2={34} stroke="#3a4458" />
        {[-35, -30, -25, -20, -15, -10, -5, 0].map((e) => (
          <g key={e}>
            <line x1={rx(10 ** e)} x2={rx(10 ** e)} y1={30} y2={38} stroke="#55607a" />
            <text x={rx(10 ** e)} y={52} fill="#6b7385" fontSize={10} textAnchor="middle">
              10<tspan baselineShift="super" fontSize={7}>{e}</tspan> m
            </text>
          </g>
        ))}
        {LANDMARKS.map((l) => (
          <g key={l.label}>
            <line x1={rx(l.m)} x2={rx(l.m)} y1={22} y2={34} stroke="#9aa3b5" />
            <text x={rx(l.m)} y={18} fill="#9aa3b5" fontSize={9} textAnchor="middle">
              {l.label}
            </text>
          </g>
        ))}
        <circle cx={rx(Math.max(1e-36, lam))} cy={34} r={6} fill="#fcd34d" />
        <text x={rx(Math.max(1e-36, lam))} y={66} fill="#fcd34d" fontSize={10} textAnchor="middle">
          λ
        </text>
      </svg>
    </Widget>
  );
}

/* ------------------------------------------------------------------ */
/* Davisson–Germer                                                     */
/* ------------------------------------------------------------------ */

const D_NI = 0.215e-9; // spacing of surface atom rows on Ni(111), m
const NROWS = 7;

export function dgIntensity(phi: number, lam: number): number {
  const x = (Math.PI * D_NI * Math.sin(phi)) / lam;
  const s = Math.sin(x);
  const grating = Math.abs(s) < 1e-9 ? 1 : (Math.sin(NROWS * x) / (NROWS * s)) ** 2;
  // smooth background falling off with angle + diffraction peak (only first order matters in 0–90°)
  const bg = 0.55 * Math.cos(phi) ** 1.5 + 0.12;
  return bg + 0.75 * grating * (x > 0.3 ? 1 : 0);
}

export function DavissonGermer() {
  const [V, setV] = useState(40);
  const lam = deBroglieFromK(me, V * eC);
  const sinPeak = lam / D_NI;
  const peakDeg = sinPeak <= 1 ? (Math.asin(sinPeak) * 180) / Math.PI : null;

  // polar plot (half disc, angles 0..90 measured from the incident beam direction: beam comes straight down onto crystal)
  const PW = 360,
    PH = 230;
  const pcx = PW / 2,
    pcy = PH - 24;
  const Rmax = 170;
  const pts: string[] = [];
  let maxI = 0;
  const samples: [number, number][] = [];
  for (let d = 0; d <= 90; d += 0.5) {
    const phi = (d * Math.PI) / 180;
    const I = dgIntensity(phi, lam);
    samples.push([d, I]);
    maxI = Math.max(maxI, I);
  }
  for (const [d, I] of samples) {
    const phi = (d * Math.PI) / 180;
    const r = (I / 1.5) * Rmax;
    // draw on the right half: angle measured from vertical (incident beam reversed)
    pts.push(`${(pcx + r * Math.sin(phi)).toFixed(1)},${(pcy - r * Math.cos(phi)).toFixed(1)}`);
  }
  const lamMeas = peakDeg !== null ? D_NI * Math.sin((peakDeg * Math.PI) / 180) : null;

  return (
    <Widget title="Davisson–Germer: electrons off a nickel crystal">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 14, alignItems: 'center' }}>
        <svg viewBox={`0 0 ${PW} ${PH}`} style={{ width: '100%', height: 'auto' }}>
          <rect width={PW} height={PH} rx={8} fill="#0d1018" />
          {/* crystal */}
          <rect x={pcx - 70} y={pcy} width={140} height={12} fill="#8b97a8" />
          {Array.from({ length: 13 }, (_, i) => (
            <circle key={i} cx={pcx - 66 + i * 11} cy={pcy + 3} r={2.2} fill="#cfd6e4" />
          ))}
          {/* incident beam */}
          <line x1={pcx} y1={6} x2={pcx} y2={pcy} stroke="#58c4dd" strokeWidth={3} strokeOpacity={0.6} />
          <text x={pcx - 6} y={16} fill="#58c4dd" fontSize={10} textAnchor="end">
            electron beam ↓
          </text>
          {/* angle grid */}
          {[30, 60, 90].map((d) => (
            <g key={d}>
              <line x1={pcx} y1={pcy} x2={pcx + Rmax * Math.sin((d * Math.PI) / 180)} y2={pcy - Rmax * Math.cos((d * Math.PI) / 180)} stroke="#232b3b" />
              <text x={pcx + (Rmax + 8) * Math.sin((d * Math.PI) / 180)} y={pcy - (Rmax + 8) * Math.cos((d * Math.PI) / 180)} fill="#6b7385" fontSize={10} textAnchor="middle">
                {d}°
              </text>
            </g>
          ))}
          {[0.5, 1].map((f) => (
            <path key={f} d={`M ${pcx} ${pcy - Rmax * f} A ${Rmax * f} ${Rmax * f} 0 0 1 ${pcx + Rmax * f} ${pcy}`} fill="none" stroke="#232b3b" />
          ))}
          <polyline points={`${pcx},${pcy} ${pts.join(' ')} ${pcx},${pcy}`} fill="#fcd34d" fillOpacity={0.12} stroke="#fcd34d" strokeWidth={2} />
          {peakDeg !== null && (
            <line x1={pcx} y1={pcy} x2={pcx + (Rmax + 4) * Math.sin((peakDeg * Math.PI) / 180)} y2={pcy - (Rmax + 4) * Math.cos((peakDeg * Math.PI) / 180)} stroke="#e07ab6" strokeDasharray="4 3" />
          )}
          <text x={10} y={PH - 6} fill="#9aa3b5" fontSize={10}>
            polar plot: distance from centre = detected intensity
          </text>
        </svg>
        <div className="col" style={{ gap: 8 }}>
          <Slider label="accelerating voltage" value={V} min={20} max={100} step={0.5} onChange={setV} format={(x) => `${x.toFixed(1)} V`} />
          <div className="row" style={{ gap: 6 }}>
            <Stat label="λ = h/p" value={`${(lam * 1e9).toFixed(3)} nm`} color="#58c4dd" />
            <Stat label="peak angle" value={peakDeg !== null ? `${peakDeg.toFixed(1)}°` : 'none'} color="#e07ab6" />
          </div>
          <div className="dim" style={{ fontSize: '0.86rem' }}>
            Rows of nickel atoms on the surface are <Tex>{'D = 0.215\\ \\text{nm}'}</Tex> apart, acting like a diffraction grating. Waves scattered from neighbouring rows reinforce where <Tex>{'D\\sin\\varphi = \\lambda'}</Tex>.
          </div>
          <div className="faint" style={{ fontSize: '0.82rem' }}>
            {peakDeg === null
              ? `λ = ${(lam * 1e9).toFixed(3)} nm is longer than D, so no angle satisfies D sin φ = λ: no diffraction peak. Raise the voltage.`
              : `From the peak: λ = D sin φ = ${((lamMeas ?? 0) * 1e9).toFixed(3)} nm, matching de Broglie's h/p. (Davisson and Germer saw the peak at 50° for 54 V.)`}
          </div>
        </div>
      </div>
    </Widget>
  );
}
