import React, { useState } from 'react';
import { Widget, Slider } from '../../../components/ui';
import { Plot } from '../../../widgets/Plot';

const C_M_PER_US = 299.792458; // metres per microsecond

const PRESETS = [
  { label: 'Freedman–Clauser 1972 (settings fixed for minutes)', d: 3, tau: 1e8 },
  { label: 'Aspect 1982 (≈12 m, ~10 ns switching)', d: 12, tau: 0.02 },
  { label: 'Weihs 1998 (400 m)', d: 400, tau: 0.1 },
  { label: 'Delft 2015 (1.3 km)', d: 1280, tau: 3.6 },
];

/**
 * Spacetime diagram for the locality loophole. Alice and Bob sit a distance d apart. Each needs time τ
 * from choosing a setting to recording an outcome. Locality is enforced if neither side’s setting choice
 * can influence the other’s outcome at light speed: τ < d / c.
 */
export function LightConeDiagram() {
  const [logD, setLogD] = useState(Math.log10(400));
  const [logTau, setLogTau] = useState(Math.log10(0.1));
  const d = 10 ** logD;
  const tau = 10 ** logTau;
  const light = d / C_M_PER_US; // μs
  const ok = tau < light;
  const W = 520, H = 300, pad = 34;
  // vertical scale: show up to max(2*light, 1.3*tau) capped for display
  const tMax = Math.max(light * 1.6, Math.min(tau, light * 4) * 1.15);
  const X = (s: number) => pad + ((s + 0.5) / 1) * (W - 2 * pad); // s in [-0.5, 0.5] × d
  const Y = (t: number) => H - pad - (t / tMax) * (H - 2 * pad);
  const t0 = 0.15 * tMax; // setting choice time (same on both sides)
  const tauShown = Math.min(tau, tMax * 2);
  const fmtT = (t: number) => (t >= 1e6 ? `${(t / 6e7).toFixed(0)} min` : t >= 1 ? `${t.toFixed(2)} μs` : `${(t * 1000).toFixed(0)} ns`);
  // light cone from Alice's choice: reaches Bob (distance d) after `light`
  const tEnd = Math.min(tMax, t0 + 1.08 * light);
  const xEnd = -0.5 + (tEnd - t0) / light;
  return (
    <Widget title="The locality loophole: can a setting reach the other lab in time?">
      <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {PRESETS.map((p) => (
          <button key={p.label} className="btn small" onClick={() => { setLogD(Math.log10(p.d)); setLogTau(Math.log10(p.tau)); }}>
            {p.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(240px, 1fr)', gap: 14, alignItems: 'center' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
          <defs>
            <linearGradient id="coneg" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor="#58c4dd" stopOpacity="0.35" />
              <stop offset="1" stopColor="#58c4dd" stopOpacity="0.05" />
            </linearGradient>
          </defs>
          <line x1={pad} x2={W - pad} y1={Y(0)} y2={Y(0)} stroke="#3a4256" />
          <text x={X(0.25)} y={Y(0) + 16} fontSize={13} fill="#6b7385" textAnchor="middle">space →</text>
          <text x={pad - 6} y={pad - 10} fontSize={13} fill="#6b7385">time ↑</text>
          {/* world lines */}
          {[-0.5, 0.5].map((s) => (
            <line key={s} x1={X(s)} x2={X(s)} y1={Y(0)} y2={pad} stroke="#4a5368" strokeDasharray="4 4" />
          ))}
          <text x={X(-0.5)} y={H - 10} fontSize={14} fill="#58c4dd" textAnchor="middle">Alice</text>
          <text x={X(0.5)} y={H - 10} fontSize={14} fill="#fcd34d" textAnchor="middle">Bob</text>
          <text x={(X(-0.5) + X(0.5)) / 2} y={H - 10} fontSize={13} fill="#9aa3b5" textAnchor="middle">d = {d >= 1000 ? `${(d / 1000).toFixed(2)} km` : `${d.toFixed(0)} m`}</text>
          {/* Alice's future light cone from her setting choice */}
          <polygon
            points={`${X(-0.5)},${Y(t0)} ${X(xEnd)},${Y(tEnd)} ${X(xEnd)},${Y(tMax)} ${X(-0.5)},${Y(tMax)}`}
            fill="url(#coneg)"
          />
          <line x1={X(-0.5)} y1={Y(t0)} x2={X(xEnd)} y2={Y(tEnd)} stroke="#58c4dd" strokeWidth={1.5} />
          <text x={X(-0.5) + 8} y={Y(t0 + light * 0.45) } fontSize={13} fill="#58c4dd">light from Alice’s choice</text>
          {/* setting choices and outcomes */}
          {[-0.5, 0.5].map((s) => (
            <g key={s}>
              <line x1={X(s)} x2={X(s)} y1={Y(t0)} y2={Y(Math.min(t0 + tauShown, tMax * 0.98))} stroke={s < 0 ? '#58c4dd' : '#fcd34d'} strokeWidth={5} strokeLinecap="round" opacity={0.75} />
              <circle cx={X(s)} cy={Y(t0)} r={6} fill="#9a72ac" />
              {t0 + tau < tMax * 0.98 && <rect x={X(s) - 6} y={Y(t0 + tau) - 6} width={12} height={12} fill={s < 0 ? '#58c4dd' : '#fcd34d'} />}
            </g>
          ))}
          <text x={X(0.5) - 10} y={Y(t0) + 4} fontSize={13} fill="#c49ad6" textAnchor="end">setting chosen</text>
          {t0 + tau < tMax * 0.98 ? (
            <text x={X(0.5) - 10} y={Y(t0 + tau) + 4} fontSize={13} fill="#fcd34d" textAnchor="end">outcome recorded</text>
          ) : (
            <text x={X(0.5) - 10} y={pad + 12} fontSize={13} fill="#fcd34d" textAnchor="end">outcome recorded (off the chart ↑)</text>
          )}
          {/* the moment light from Alice's choice arrives at Bob */}
          {t0 + light < tMax && (
            <g>
              <circle cx={X(0.5)} cy={Y(t0 + light)} r={5} fill="none" stroke="#58c4dd" strokeWidth={2} />
              <text x={X(0.5) - 10} y={Y(t0 + light) - 8} fontSize={13} fill="#58c4dd" textAnchor="end">signal could arrive</text>
            </g>
          )}
        </svg>
        <div className="col" style={{ gap: 10 }}>
          <Slider label="separation d" value={logD} min={0} max={Math.log10(2000)} step={0.01} onChange={setLogD} format={() => (d >= 1000 ? `${(d / 1000).toFixed(2)} km` : `${d.toFixed(0)} m`)} />
          <Slider label="choice → outcome time τ" value={logTau} min={-2.3} max={1.5} step={0.01} onChange={setLogTau} format={() => fmtT(tau)} />
          <div className="mono" style={{ fontSize: '0.88rem' }}>
            light travel time d/c = <b style={{ color: 'var(--blue)' }}>{fmtT(light)}</b>
            <br />
            measurement time τ = <b style={{ color: 'var(--yellow)' }}>{fmtT(tau)}</b>
          </div>
          <div className="panel" style={{ padding: 10, borderColor: ok ? 'var(--green)' : 'var(--red)' }}>
            {ok ? (
              <>
                <b style={{ color: 'var(--green)' }}>✓ Locality enforced.</b> Each outcome is recorded before any light-speed message about the other side’s setting could arrive.
              </>
            ) : (
              <>
                <b style={{ color: 'var(--red)' }}>✗ Loophole open.</b> A signal (unknown to physics, but travelling at most at light speed) could tell one side the other’s setting in time to fake the correlations.
              </>
            )}
          </div>
        </div>
      </div>
    </Widget>
  );
}

/**
 * The detection loophole: if only a fraction η of pairs are detected and the rest are discarded,
 * a local model can fake values up to S = 4/η − 2. Quantum’s 2√2 is unambiguous only if η > 2(√2 − 1) ≈ 82.8%.
 */
export function DetectionLoophole() {
  const [eta, setEta] = useState(0.75);
  const fake = Math.min(4, 4 / eta - 2);
  const thr = 2 * (Math.SQRT2 - 1);
  const safe = eta > thr;
  return (
    <Widget title="The detection loophole: what can a cheating local model fake?">
      <Plot
        height={230}
        width={760}
        xRange={[0.5, 1]}
        yRange={[1.5, 4.2]}
        xLabel="detection efficiency η"
        yLabel="CHSH value S"
        series={[
          { f: (x) => Math.min(4.2, 4 / x - 2), color: '#9aa3b5', label: 'max S a local model can fake', fill: false },
          { f: () => 2 * Math.SQRT2, color: '#e07ab6', dashed: true, label: 'quantum 2√2' },
          { f: () => 2, color: '#fcd34d', dashed: true, label: 'local bound 2' },
        ]}
        vlines={[{ x: thr, color: '#83c167', label: '82.8%' }, { x: eta, color: '#58c4dd' }]}
        overlay={(sx, sy) => <circle cx={sx(eta)} cy={sy(Math.min(4.2, fake))} r={6} fill="#58c4dd" stroke="#fff" />}
      />
      <Slider label="efficiency η" value={eta} min={0.5} max={1} step={0.005} onChange={setEta} format={(v) => `${(v * 100).toFixed(1)}%`} />
      <div className="panel" style={{ marginTop: 6, padding: 10, borderColor: safe ? 'var(--green)' : 'var(--red)' }}>
        At η = {(eta * 100).toFixed(1)}%, a local model that “chooses” which particles go undetected can fake S up to{' '}
        <b className="mono">{fake >= 4 ? '4' : fake.toFixed(2)}</b>.{' '}
        {safe ? (
          <span style={{ color: 'var(--green)' }}>That’s below 2√2, so observing S ≈ 2.83 rules it out.</span>
        ) : (
          <span style={{ color: 'var(--red)' }}>That’s at least 2√2, so even a perfect quantum result could be faked by discarding events.</span>
        )}
      </div>
    </Widget>
  );
}
