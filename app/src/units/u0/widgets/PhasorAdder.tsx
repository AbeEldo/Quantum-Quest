import React, { useState } from 'react';
import { Widget, Slider, Toggle, Tex, fmtPi, useAnimationFrame, Stat } from '../../../components/ui';
import { phaseColor } from '../../../engine/complex';
import { Arrow, useSvgDrag, fx } from './common';

interface Ph {
  r: number;
  phi: number;
}

const W = 400,
  H = 400;

const PRESETS: { name: string; arrows: Ph[] }[] = [
  { name: 'All in phase', arrows: [{ r: 0.8, phi: 0.3 }, { r: 0.8, phi: 0.3 }, { r: 0.8, phi: 0.3 }] },
  { name: 'Three at 120°', arrows: [{ r: 0.8, phi: 0 }, { r: 0.8, phi: (2 * Math.PI) / 3 }, { r: 0.8, phi: (4 * Math.PI) / 3 }] },
  { name: 'Two cancel', arrows: [{ r: 1, phi: 0 }, { r: 1, phi: Math.PI }] },
  { name: 'Slowly turning', arrows: Array.from({ length: 6 }, (_, k) => ({ r: 0.45, phi: (k * Math.PI) / 8 })) },
];

/** Several phasors added tip-to-tail; |sum|² vs the "no interference" sum of |a_k|²; plus the wave picture. */
export function PhasorAdder({ initial, maxArrows = 6, waves = true }: { initial?: Ph[]; maxArrows?: number; waves?: boolean }) {
  const [arrows, setArrows] = useState<Ph[]>(initial ?? [{ r: 0.9, phi: 0.2 }, { r: 0.7, phi: 1.4 }, { r: 0.6, phi: 2.6 }]);
  const [spin, setSpin] = useState(false);
  const [t, setT] = useState(0);
  const omega = 1.6;
  useAnimationFrame((dt) => setT((x) => x + dt), spin);
  const rot = spin ? omega * t : 0;

  const total = arrows.reduce((s, a) => s + a.r, 0);
  const R = Math.max(1.6, total * 1.08);
  const s = W / (2 * R);
  const X = (x: number) => W / 2 + x * s;
  const Y = (y: number) => H / 2 - y * s;

  // chain points
  const pts: [number, number][] = [[0, 0]];
  for (const a of arrows) {
    const [x, y] = pts[pts.length - 1];
    pts.push([x + a.r * Math.cos(a.phi + rot), y + a.r * Math.sin(a.phi + rot)]);
  }
  const [Sx, Sy] = pts[pts.length - 1];
  const S2 = Sx * Sx + Sy * Sy;
  const sumSq = arrows.reduce((s, a) => s + a.r * a.r, 0);

  const { ref, handlers } = useSvgDrag<number>(
    W,
    H,
    (px, py) => {
      if (spin) return null;
      for (let k = arrows.length; k >= 1; k--) {
        if (Math.hypot(X(pts[k][0]) - px, Y(pts[k][1]) - py) < 16) return k - 1;
      }
      return null;
    },
    (k, px, py) => {
      const [tx, ty] = pts[k];
      const dx = (px - W / 2) / s - tx,
        dy = (H / 2 - py) / s - ty;
      const r = Math.max(0.1, Math.min(1.5, Math.hypot(dx, dy)));
      const phi = (Math.atan2(dy, dx) + 2 * Math.PI) % (2 * Math.PI);
      setArrows((as) => as.map((a, i) => (i === k ? { r, phi } : a)));
    },
  );

  // wave panel
  const PW = 400,
    PH = 150;
  const span = (2 * 2 * Math.PI) / omega; // two periods
  const wx = (tt: number) => 10 + (tt / span) * (PW - 20);
  const amp = Math.max(total, 0.5);
  const wy = (v: number) => PH / 2 - (v / amp) * (PH / 2 - 10);
  const wave = (f: (tt: number) => number) =>
    Array.from({ length: 161 }, (_, i) => {
      const tt = (i / 160) * span;
      return `${wx(tt).toFixed(1)},${wy(f(tt)).toFixed(1)}`;
    }).join(' ');
  const tNow = spin ? t % span : 0;

  return (
    <Widget title="Phasor adder">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16 }}>
        <div>
          <svg ref={ref} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', touchAction: 'none', userSelect: 'none' }} {...handlers}>
            <rect width={W} height={H} rx={10} fill="#0d1018" />
            <line x1={0} x2={W} y1={Y(0)} y2={Y(0)} stroke="#2a3346" />
            <line y1={0} y2={H} x1={X(0)} x2={X(0)} stroke="#2a3346" />
            <circle cx={X(0)} cy={Y(0)} r={total * s} fill="none" stroke="#3a4458" strokeDasharray="3 5" />
            <text x={X(0) + total * s * 0.71 + 4} y={Y(0) - total * s * 0.71 - 4} fill="#6b7385" fontSize={11}>
              max |sum|
            </text>
            <Arrow x1={X(0)} y1={Y(0)} x2={X(Sx)} y2={Y(Sy)} color="#ffffff" width={4} head={14} opacity={0.9} glow />
            {arrows.map((a, k) => (
              <g key={k}>
                <Arrow x1={X(pts[k][0])} y1={Y(pts[k][1])} x2={X(pts[k + 1][0])} y2={Y(pts[k + 1][1])} color={phaseColor(a.phi + rot)} width={3} />
                {!spin && <circle cx={X(pts[k + 1][0])} cy={Y(pts[k + 1][1])} r={7} fill={phaseColor(a.phi)} fillOpacity={0.25} stroke={phaseColor(a.phi)} style={{ cursor: 'grab' }} />}
              </g>
            ))}
          </svg>
          <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
            <Stat label="|sum|²" value={fx(S2)} color="#ffffff" />
            <Stat label="Σ |aₖ|²" value={fx(sumSq)} color="#9aa3b5" />
            <Stat label="interference" value={(S2 - sumSq >= 0 ? '+' : '') + fx(S2 - sumSq)} color={S2 - sumSq >= 0 ? '#83c167' : '#fc6255'} />
          </div>
        </div>
        <div className="col" style={{ gap: 6 }}>
          <div className="row" style={{ gap: 6 }}>
            {PRESETS.map((p) => (
              <button key={p.name} className="btn small" onClick={() => setArrows(p.arrows.map((a) => ({ ...a })))}>
                {p.name}
              </button>
            ))}
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto', paddingRight: 4 }}>
            {arrows.map((a, k) => (
              <div key={k} style={{ borderLeft: `3px solid ${phaseColor(a.phi)}`, paddingLeft: 8, marginBottom: 4 }}>
                <Slider label={<span>φ{k + 1}</span>} value={a.phi} min={0} max={2 * Math.PI} step={Math.PI / 36} onChange={(v) => setArrows((as) => as.map((b, i) => (i === k ? { ...b, phi: v } : b)))} format={fmtPi} />
                <Slider label={<span>|a{k + 1}|</span>} value={a.r} min={0.1} max={1.5} step={0.05} onChange={(v) => setArrows((as) => as.map((b, i) => (i === k ? { ...b, r: v } : b)))} />
              </div>
            ))}
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn small" disabled={arrows.length >= maxArrows} onClick={() => setArrows((as) => [...as, { r: 0.6, phi: Math.random() * 2 * Math.PI }])}>
              + arrow
            </button>
            <button className="btn small" disabled={arrows.length <= 1} onClick={() => setArrows((as) => as.slice(0, -1))}>
              − arrow
            </button>
            <Toggle label="rotate all together (e^{iωt})" value={spin} onChange={setSpin} />
          </div>
        </div>
      </div>
      {waves && (
        <div style={{ marginTop: 12 }}>
          <div className="faint" style={{ fontSize: '0.8rem', marginBottom: 4 }}>
            The wave picture: each arrow spinning at the same rate ω has a real part <Tex>{'|a_k|\\cos(\\omega t + \\varphi_k)'}</Tex>, a wave. Thin lines are the individual waves; the white line is their sum, whose amplitude is exactly |sum|.
          </div>
          <svg viewBox={`0 0 ${PW} ${PH}`} style={{ width: '100%', height: 'auto' }}>
            <rect width={PW} height={PH} rx={8} fill="#0d1018" />
            <line x1={10} x2={PW - 10} y1={wy(0)} y2={wy(0)} stroke="#2a3346" />
            {arrows.map((a, k) => (
              <polyline key={k} points={wave((tt) => a.r * Math.cos(omega * tt + a.phi))} fill="none" stroke={phaseColor(a.phi)} strokeWidth={1.4} strokeOpacity={0.75} />
            ))}
            <polyline points={wave((tt) => arrows.reduce((s, a) => s + a.r * Math.cos(omega * tt + a.phi), 0))} fill="none" stroke="#fff" strokeWidth={2.6} />
            <line x1={10} x2={PW - 10} y1={wy(Math.sqrt(S2))} y2={wy(Math.sqrt(S2))} stroke="#fff" strokeOpacity={0.25} strokeDasharray="4 4" />
            <line x1={10} x2={PW - 10} y1={wy(-Math.sqrt(S2))} y2={wy(-Math.sqrt(S2))} stroke="#fff" strokeOpacity={0.25} strokeDasharray="4 4" />
            {spin && <line x1={wx(tNow)} x2={wx(tNow)} y1={6} y2={PH - 6} stroke="#fcd34d" strokeDasharray="3 3" />}
          </svg>
        </div>
      )}
    </Widget>
  );
}

/** Two arrows a, b and the interference term 2|a||b|cos Δφ, plotted against the relative phase. */
export function InterferenceDial() {
  const [ra, setRa] = useState(1);
  const [rb, setRb] = useState(0.7);
  const [dphi, setDphi] = useState(Math.PI / 3);
  const S2 = ra * ra + rb * rb + 2 * ra * rb * Math.cos(dphi);
  const inter = 2 * ra * rb * Math.cos(dphi);
  const W2 = 300,
    H2 = 300;
  const R = 2.6;
  const s = W2 / (2 * R);
  const X = (x: number) => W2 / 2 - 0.4 * s + x * s;
  const Y = (y: number) => H2 / 2 - y * s;
  const bx = ra + rb * Math.cos(dphi),
    by = rb * Math.sin(dphi);

  // plot of |a+b|² vs Δφ
  const PW = 420,
    PH = 240,
    pl = 40,
    pr = 12,
    pt = 12,
    pb = 30;
  const maxY = 7;
  const px = (p: number) => pl + (p / (2 * Math.PI)) * (PW - pl - pr);
  const py = (v: number) => PH - pb - (v / maxY) * (PH - pt - pb);
  const curve = Array.from({ length: 181 }, (_, i) => {
    const p = (i / 180) * 2 * Math.PI;
    return `${px(p).toFixed(1)},${py(ra * ra + rb * rb + 2 * ra * rb * Math.cos(p)).toFixed(1)}`;
  }).join(' ');

  // decomposition bar
  const barScale = 34;
  return (
    <Widget title="Interference of two arrows">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,0.8fr) minmax(0,1.2fr)', gap: 14, alignItems: 'center' }}>
        <svg viewBox={`0 0 ${W2} ${H2}`} style={{ width: '100%', height: 'auto' }}>
          <rect width={W2} height={H2} rx={10} fill="#0d1018" />
          <line x1={0} x2={W2} y1={Y(0)} y2={Y(0)} stroke="#2a3346" />
          <line y1={0} y2={H2} x1={X(0)} x2={X(0)} stroke="#2a3346" />
          <circle cx={X(ra)} cy={Y(0)} r={rb * s} fill="none" stroke="#3a4458" strokeDasharray="3 4" />
          <Arrow x1={X(0)} y1={Y(0)} x2={X(bx)} y2={Y(by)} color="#fff" width={3.6} glow />
          <Arrow x1={X(0)} y1={Y(0)} x2={X(ra)} y2={Y(0)} color={phaseColor(0)} width={3} />
          <Arrow x1={X(ra)} y1={Y(0)} x2={X(bx)} y2={Y(by)} color={phaseColor(dphi)} width={3} />
          <text x={X(ra / 2)} y={Y(0) + 18} fill={phaseColor(0)} fontSize={14} fontStyle="italic" textAnchor="middle">
            a
          </text>
          <text x={X(ra + (rb * Math.cos(dphi)) / 2) + 10} y={Y((rb * Math.sin(dphi)) / 2) - 6} fill={phaseColor(dphi)} fontSize={14} fontStyle="italic">
            b
          </text>
          <text x={X(bx / 2) - 14} y={Y(by / 2) - 8} fill="#fff" fontSize={13} fontStyle="italic">
            a+b
          </text>
        </svg>
        <div>
          <svg viewBox={`0 0 ${PW} ${PH}`} style={{ width: '100%', height: 'auto' }}>
            <rect width={PW} height={PH} rx={8} fill="#0d1018" />
            {[0, 1, 2, 3, 4, 5, 6, 7].map((v) => (
              <g key={v}>
                <line x1={pl} x2={PW - pr} y1={py(v)} y2={py(v)} stroke="#1c2230" />
                <text x={pl - 6} y={py(v) + 4} fill="#6b7385" fontSize={10} textAnchor="end">
                  {v}
                </text>
              </g>
            ))}
            {[0, 0.5, 1, 1.5, 2].map((m) => (
              <text key={m} x={px(m * Math.PI)} y={PH - 12} fill="#6b7385" fontSize={10} textAnchor="middle">
                {m === 0 ? '0' : m === 1 ? 'π' : m === 2 ? '2π' : m === 0.5 ? 'π/2' : '3π/2'}
              </text>
            ))}
            <text x={(pl + PW - pr) / 2} y={PH - 1} fill="#9aa3b5" fontSize={11} textAnchor="middle" fontStyle="italic">
              relative phase Δφ
            </text>
            <line x1={pl} x2={PW - pr} y1={py(ra * ra + rb * rb)} y2={py(ra * ra + rb * rb)} stroke="#9aa3b5" strokeDasharray="5 4" />
            <text x={PW - pr - 4} y={py(ra * ra + rb * rb) - 5} fill="#9aa3b5" fontSize={10} textAnchor="end">
              |a|² + |b|² (no interference)
            </text>
            <polyline points={curve} fill="none" stroke="#fcd34d" strokeWidth={2.4} />
            <line x1={px(dphi)} x2={px(dphi)} y1={py(ra * ra + rb * rb)} y2={py(S2)} stroke={inter >= 0 ? '#83c167' : '#fc6255'} strokeWidth={3} />
            <circle cx={px(dphi)} cy={py(S2)} r={5} fill="#fff" />
          </svg>
          <div className="row" style={{ gap: 4, alignItems: 'flex-end', justifyContent: 'center', height: 30, marginTop: 4, fontSize: '0.8rem' }}>
            <div title="|a|²" style={{ width: ra * ra * barScale, height: 16, background: phaseColor(0), borderRadius: 3 }} />
            <span>+</span>
            <div title="|b|²" style={{ width: rb * rb * barScale, height: 16, background: phaseColor(dphi), borderRadius: 3 }} />
            <span>{inter >= 0 ? '+' : '−'}</span>
            <div title="interference" style={{ width: Math.abs(inter) * barScale, height: 16, background: inter >= 0 ? '#83c167' : '#fc6255', borderRadius: 3 }} />
            <span>=</span>
            <div title="|a+b|²" style={{ width: S2 * barScale, height: 16, background: '#fff', borderRadius: 3 }} />
          </div>
        </div>
      </div>
      <Slider label="|a|" value={ra} min={0} max={1.5} step={0.05} onChange={setRa} />
      <Slider label="|b|" value={rb} min={0} max={1.5} step={0.05} onChange={setRb} />
      <Slider label="Δφ" value={dphi} min={0} max={2 * Math.PI} step={Math.PI / 48} onChange={setDphi} format={fmtPi} />
      <div style={{ textAlign: 'center', marginTop: 6 }}>
        <Tex>{`|a+b|^2 = \\underbrace{${fx(ra * ra)}}_{|a|^2} + \\underbrace{${fx(rb * rb)}}_{|b|^2} + \\underbrace{${fx(inter)}}_{2\\,\\mathrm{Re}(a\\bar b)} = ${fx(S2)}`}</Tex>
      </div>
    </Widget>
  );
}
