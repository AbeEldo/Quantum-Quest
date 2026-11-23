import React, { useRef, useState } from 'react';
import { Widget, Toggle, Tex, Stat, useAnimationFrame, Segmented } from '../../../components/ui';
import { hydrogenE, hydrogenLambda, SERIES, wavelengthCSS } from '../physics';

const NMAX = 7;

export interface SpectrumLine {
  nm: number;
  color?: string;
  label?: string;
  strength?: number;
}

/** A spectrum strip: visible band (linear) with optional UV/IR annotations; lines drawn as glowing bars. */
export function SpectrumStrip({ lines, range = [380, 750], height = 60, dark = false, showScale = true, onClick, highlight }: { lines: SpectrumLine[]; range?: [number, number]; height?: number; dark?: boolean; showScale?: boolean; onClick?: (nm: number) => void; highlight?: number | null }) {
  const W = 720;
  const H = height + (showScale ? 18 : 0);
  const x = (nm: number) => ((nm - range[0]) / (range[1] - range[0])) * W;
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const stops = Array.from({ length: 25 }, (_, i) => range[0] + (i / 24) * (range[1] - range[0]));
  const ticks: number[] = [];
  const step = range[1] - range[0] > 1000 ? 200 : range[1] - range[0] > 500 ? 100 : 50;
  for (let v = Math.ceil(range[0] / step) * step; v <= range[1]; v += step) ticks.push(v);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto', cursor: onClick ? 'crosshair' : undefined, display: 'block' }}
      onClick={(e) => {
        if (!onClick) return;
        const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        onClick(range[0] + ((e.clientX - r.left) / r.width) * (range[1] - range[0]));
      }}
    >
      <defs>
        <linearGradient id={`sp${uid}`} x1="0" x2="1">
          {stops.map((nm, i) => (
            <stop key={i} offset={`${(i / 24) * 100}%`} stopColor={wavelengthCSS(nm)} />
          ))}
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={W} height={height} fill={dark ? `url(#sp${uid})` : '#05060a'} rx={4} />
      {dark && <rect x={0} y={0} width={W} height={height} fill="#000" opacity={0.15} rx={4} />}
      {lines.map((l, i) =>
        l.nm >= range[0] && l.nm <= range[1] ? (
          <g key={i}>
            {dark ? (
              <rect x={x(l.nm) - 1.5} y={0} width={3} height={height} fill="#000" opacity={0.85 * (l.strength ?? 1)} />
            ) : (
              <>
                <rect x={x(l.nm) - 5} y={0} width={10} height={height} fill={l.color ?? wavelengthCSS(l.nm)} opacity={0.25 * (l.strength ?? 1)} />
                <rect x={x(l.nm) - 1.6} y={0} width={3.2} height={height} fill={l.color ?? wavelengthCSS(l.nm)} opacity={l.strength ?? 1} />
              </>
            )}
            {l.label && (
              <text x={x(l.nm)} y={12} fill="#fff" fontSize={10} textAnchor="middle" style={{ paintOrder: 'stroke', stroke: '#000', strokeWidth: 3 }}>
                {l.label}
              </text>
            )}
          </g>
        ) : null,
      )}
      {highlight != null && <rect x={x(highlight) - 4} y={-1} width={8} height={height + 2} fill="none" stroke="#fff" strokeWidth={1.5} rx={2} />}
      {showScale &&
        ticks.map((t) => (
          <text key={t} x={x(t)} y={height + 13} fill="#6b7385" fontSize={10} textAnchor="middle">
            {t}
          </text>
        ))}
    </svg>
  );
}

/** Hydrogen energy levels + Bohr orbits. Click two levels to make the electron jump; emitted photons land on the spectrum. */
export function HydrogenAtom() {
  const [n, setN] = useState(3);
  const [mode, setMode] = useState<'emit' | 'absorb'>('emit');
  const [found, setFound] = useState<{ up: number; lo: number }[]>([]);
  const [last, setLast] = useState<{ up: number; lo: number } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [anim, setAnim] = useState<{ from: number; to: number; t: number } | null>(null);
  const phase = useRef(0);
  const [, force] = useState(0);

  useAnimationFrame((dt) => {
    phase.current += dt * (6 / Math.pow(n, 1.5));
    if (anim) {
      const t = anim.t + dt * 1.4;
      if (t >= 1) {
        setAnim(null);
        setN(anim.to);
      } else setAnim({ ...anim, t });
    }
    force((k) => (k + 1) % 1000);
  }, true);

  const jump = (to: number) => {
    if (anim || to === n) return;
    if (mode === 'emit' && to > n) return;
    if (mode === 'absorb' && to < n) return;
    const up = Math.max(to, n),
      lo = Math.min(to, n);
    setAnim({ from: n, to, t: 0 });
    setLast({ up, lo });
    setFound((f) => (f.some((x) => x.up === up && x.lo === lo) ? f : [...f, { up, lo }]));
  };

  // level diagram
  const LW = 300,
    LH = 360;
  const Emin = -13.6,
    Emax = 0.6;
  const ey = (E: number) => 20 + ((Emax - E) / (Emax - Emin)) * (LH - 40);
  const lx0 = 60,
    lx1 = 220;

  // orbit picture
  const OW = 300,
    OH = 360;
  const rScale = (OW / 2 - 12) / (5 * 5);
  const ocx = OW / 2,
    ocy = OH / 2;
  const curN = anim ? anim.from + (anim.to - anim.from) * anim.t : n;
  const rr = curN * curN * rScale;
  const ex = ocx + rr * Math.cos(phase.current),
    eyy = ocy - rr * Math.sin(phase.current);

  const lam = last ? hydrogenLambda(last.up, last.lo) : null;
  const dE = last ? hydrogenE(last.up) - hydrogenE(last.lo) : null;
  const lineFor = (up: number, lo: number) => ({ nm: hydrogenLambda(up, lo) });
  const allLines: { nm: number; up: number; lo: number }[] = [];
  for (let lo = 1; lo <= 4; lo++) for (let up = lo + 1; up <= NMAX; up++) allLines.push({ nm: hydrogenLambda(up, lo), up, lo });

  const fullX = (nm: number) => (Math.log10(nm) - Math.log10(80)) / (Math.log10(5000) - Math.log10(80));

  return (
    <Widget title="Hydrogen: energy levels, orbits and light">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <Segmented
          options={[
            { value: 'emit', label: 'Emission (jump down)' },
            { value: 'absorb', label: 'Absorption (jump up)' },
          ]}
          value={mode}
          onChange={(m) => setMode(m as 'emit' | 'absorb')}
        />
        <Toggle label="show every line up to n = 7" value={showAll} onChange={setShowAll} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,0.9fr)', gap: 12, alignItems: 'start' }}>
        <svg viewBox={`0 0 ${LW} ${LH}`} style={{ width: '100%', height: 'auto' }}>
          <rect width={LW} height={LH} rx={8} fill="#0d1018" />
          <line x1={lx0} x2={lx1} y1={ey(0)} y2={ey(0)} stroke="#6b7385" strokeDasharray="4 4" />
          <text x={lx1 + 6} y={ey(0) + 4} fill="#6b7385" fontSize={10}>
            0 eV (free)
          </text>
          {Array.from({ length: NMAX }, (_, i) => i + 1).map((k) => {
            const E = hydrogenE(k);
            const active = k === n && !anim;
            const can = !anim && k !== n && (mode === 'emit' ? k < n : k > n);
            return (
              <g key={k} style={{ cursor: can ? 'pointer' : 'default' }} onClick={() => jump(k)}>
                <rect x={lx0 - 10} y={ey(E) - 7} width={lx1 - lx0 + 20} height={14} fill="transparent" />
                <line x1={lx0} x2={lx1} y1={ey(E)} y2={ey(E)} stroke={active ? '#fcd34d' : can ? '#cfd6e4' : '#55607a'} strokeWidth={active ? 3 : 2} />
                {k <= 4 && (
                  <>
                    <text x={lx0 - 8} y={ey(E) + 4} fill="#9aa3b5" fontSize={11} textAnchor="end">
                      n={k}
                    </text>
                    <text x={lx1 + 6} y={ey(E) + 4} fill="#6b7385" fontSize={10}>
                      {E.toFixed(2)} eV
                    </text>
                  </>
                )}
              </g>
            );
          })}
          <text x={lx0 - 8} y={ey(hydrogenE(6)) + 2} fill="#6b7385" fontSize={10} textAnchor="end">
            n=5,6,7
          </text>
          {/* electron on level */}
          {!anim && <circle cx={(lx0 + lx1) / 2} cy={ey(hydrogenE(n))} r={6} fill="#58c4dd" />}
          {anim && (
            <g>
              <line x1={(lx0 + lx1) / 2} x2={(lx0 + lx1) / 2} y1={ey(hydrogenE(anim.from))} y2={ey(hydrogenE(anim.to))} stroke={lam ? wavelengthCSS(lam) : '#fff'} strokeWidth={2} strokeDasharray="4 3" />
              <circle cx={(lx0 + lx1) / 2} cy={ey(hydrogenE(anim.from)) + (ey(hydrogenE(anim.to)) - ey(hydrogenE(anim.from))) * anim.t} r={6} fill="#58c4dd" />
              {/* photon */}
              {(() => {
                const px = (lx0 + lx1) / 2 + (mode === 'emit' ? 1 : -1) * (mode === 'emit' ? anim.t : 1 - anim.t) * 120;
                const py = (ey(hydrogenE(anim.from)) + ey(hydrogenE(anim.to))) / 2;
                const pts = Array.from({ length: 25 }, (_, i) => {
                  const s = i - 12;
                  return `${px + s},${py + 5 * Math.exp(-(s * s) / 50) * Math.sin(s * 1.2)}`;
                }).join(' ');
                return <polyline points={pts} fill="none" stroke={lam ? wavelengthCSS(lam) : '#fff'} strokeWidth={2} />;
              })()}
            </g>
          )}
          <text x={10} y={LH - 8} fill="#6b7385" fontSize={10}>
            {mode === 'emit' ? 'click a LOWER level to emit a photon' : 'click a HIGHER level to absorb a photon'}
          </text>
        </svg>
        <svg viewBox={`0 0 ${OW} ${OH}`} style={{ width: '100%', height: 'auto' }}>
          <rect width={OW} height={OH} rx={8} fill="#0d1018" />
          {Array.from({ length: 5 }, (_, i) => i + 1).map((k) => (
            <circle key={k} cx={ocx} cy={ocy} r={k * k * rScale} fill="none" stroke={k === n ? '#fcd34d' : '#2a3346'} strokeWidth={k === n ? 1.6 : 1} strokeDasharray={k === n ? undefined : '3 4'} />
          ))}
          <circle cx={ocx} cy={ocy} r={4} fill="#fc6255" />
          {rr < OW && <circle cx={ex} cy={eyy} r={5} fill="#58c4dd" style={{ filter: 'drop-shadow(0 0 4px #58c4dd)' }} />}
          <text x={10} y={18} fill="#9aa3b5" fontSize={11}>
            Bohr orbits: radius = n² × 0.053 nm
          </text>
          <text x={10} y={OH - 8} fill="#6b7385" fontSize={10}>
            (n ≥ 6 is off the picture: r₆ = 36 a₀)
          </text>
        </svg>
        <div className="col" style={{ gap: 8 }}>
          <Stat label="electron in level" value={`n = ${anim ? '…' : n}`} color="#58c4dd" />
          {last && lam && dE && (
            <>
              <Stat label="photon energy" value={`${dE.toFixed(2)} eV`} color={wavelengthCSS(Math.max(380, Math.min(750, lam)))} />
              <Stat label="wavelength" value={`${lam.toFixed(1)} nm`} color={wavelengthCSS(Math.max(380, Math.min(750, lam)))} />
              <div className="dim" style={{ fontSize: '0.85rem' }}>
                {last.up} → {last.lo}: <b>{SERIES[last.lo]}</b> series, {lam < 380 ? 'ultraviolet' : lam > 750 ? 'infrared' : 'visible'}
              </div>
            </>
          )}
          <div className="faint" style={{ fontSize: '0.78rem' }}>
            <Tex>{`E_n = -\\frac{13.6\\ \\text{eV}}{n^2},\\quad \\lambda = \\frac{hc}{E_{\\text{up}} - E_{\\text{low}}}`}</Tex>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <div className="faint" style={{ fontSize: '0.78rem', marginBottom: 2 }}>
          Visible spectrum (380–750 nm): lines you have produced{showAll ? ' + all Balmer lines' : ''}
        </div>
        <SpectrumStrip
          lines={[
            ...(showAll ? allLines.filter((l) => l.lo === 2).map((l) => ({ nm: l.nm, strength: 0.35 })) : []),
            ...found.map((f) => ({ ...lineFor(f.up, f.lo), label: `${f.up}→${f.lo}` })),
          ]}
          dark={mode === 'absorb'}
          highlight={lam && lam >= 380 && lam <= 750 ? lam : null}
        />
        <div className="faint" style={{ fontSize: '0.78rem', margin: '8px 0 2px' }}>
          Full range, logarithmic (80 nm – 5 µm)
        </div>
        <svg viewBox="0 0 720 46" style={{ width: '100%', height: 'auto', display: 'block' }}>
          <rect x={0} y={0} width={720} height={30} fill="#05060a" rx={4} />
          <rect x={fullX(380) * 720} y={0} width={(fullX(750) - fullX(380)) * 720} height={30} fill="#ffffff" opacity={0.06} />
          {(showAll ? allLines : found.map((f) => ({ nm: hydrogenLambda(f.up, f.lo), up: f.up, lo: f.lo }))).map((l, i) => (
            <rect key={i} x={fullX(l.nm) * 720 - 1.2} y={0} width={2.4} height={30} fill={l.nm < 380 ? '#aa78ff' : l.nm > 750 ? '#c0503c' : wavelengthCSS(l.nm)} opacity={found.some((f) => f.up === l.up && f.lo === l.lo) ? 1 : 0.35} />
          ))}
          {[100, 200, 500, 1000, 2000, 5000].map((t) => (
            <text key={t} x={fullX(t) * 720} y={42} fill="#6b7385" fontSize={10} textAnchor="middle">
              {t >= 1000 ? `${t / 1000} µm` : `${t} nm`}
            </text>
          ))}
          <text x={fullX(130) * 720} y={20} fill="#6b7385" fontSize={10} textAnchor="middle">
            UV (Lyman)
          </text>
          <text x={fullX(1700) * 720} y={20} fill="#6b7385" fontSize={10} textAnchor="middle">
            IR (Paschen, Brackett…)
          </text>
        </svg>
      </div>
    </Widget>
  );
}
