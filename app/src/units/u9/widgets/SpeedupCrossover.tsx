import React, { useState } from 'react';
import { Widget, Slider } from '../../../components/ui';
import { useWidth } from './viz';

const fmtTime = (s: number) => {
  if (!Number.isFinite(s)) return '∞';
  if (s < 1) return `${(s * 1000).toPrecision(2)} ms`;
  if (s < 120) return `${s.toPrecision(2)} s`;
  if (s < 7200) return `${(s / 60).toPrecision(2)} min`;
  if (s < 2 * 86400) return `${(s / 3600).toPrecision(2)} h`;
  if (s < 2 * 3.156e7) return `${(s / 86400).toPrecision(2)} days`;
  return `${(s / 3.156e7).toPrecision(2)} years`;
};
const pow10 = (x: number) => 10 ** x;
const fmtRate = (x: number) => `10^${x.toFixed(1)} /s`;

const LINES: { s: number; label: string }[] = [
  { s: 1, label: '1 second' },
  { s: 3600, label: '1 hour' },
  { s: 86400 * 30, label: '1 month' },
  { s: 3.156e7 * 10, label: '10 years' },
  { s: 4.35e17, label: 'age of universe' },
];

/**
 * When does a quadratic speedup actually win? Brute-force search over 2^n candidates:
 * classical time 2^n / f_c, Grover time (π/4)·2^{n/2} / f_q. Slow, error-corrected quantum operations
 * push the crossover to problems that already take a long time.
 */
export function SpeedupCrossover() {
  const [lc, setLc] = useState(9); // classical candidate checks per second
  const [lq, setLq] = useState(3); // Grover iterations per second on an error-corrected machine
  const fc = pow10(lc), fq = pow10(lq);
  const nStar = 2 * Math.log2(((Math.PI / 4) * fc) / fq);
  const tStar = 2 ** nStar / fc;

  const [ref, W] = useWidth<HTMLDivElement>(700);
  const H = 280, pad = { l: 56, r: 110, t: 14, b: 34 };
  const nMax = 120;
  const yMin = -4, yMax = 22;
  const sx = (n: number) => pad.l + (n / nMax) * (W - pad.l - pad.r);
  const sy = (lg: number) => H - pad.b - ((lg - yMin) / (yMax - yMin)) * (H - pad.t - pad.b);
  const cl = (n: number) => n * Math.log10(2) - lc;
  const qu = (n: number) => Math.log10(Math.PI / 4) + (n / 2) * Math.log10(2) - lq;
  const path = (f: (n: number) => number) =>
    Array.from({ length: 241 }, (_, i) => {
      const n = (i / 240) * nMax;
      const v = Math.max(yMin - 1, Math.min(yMax + 1, f(n)));
      return `${i ? 'L' : 'M'}${sx(n)} ${sy(v)}`;
    }).join(' ');

  return (
    <Widget title="Quadratic speedup reality check: brute-force search">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 8 }}>
        <Slider label="classical checks/s" value={lc} min={6} max={15} step={0.1} onChange={setLc} format={fmtRate} />
        <Slider label="quantum Grover steps/s" value={lq} min={0} max={7} step={0.1} onChange={setLq} format={fmtRate} />
      </div>
      <div ref={ref} style={{ width: '100%' }}>
        <svg width={W} height={H} style={{ display: 'block' }}>
          {LINES.map((l) => {
            const y = sy(Math.log10(l.s));
            if (y < pad.t || y > H - pad.b) return null;
            return (
              <g key={l.label}>
                <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} stroke="#2a3142" strokeDasharray="3 4" />
                <text x={W - pad.r + 4} y={y + 4} fontSize={10.5} fill="#6b7385">{l.label}</text>
              </g>
            );
          })}
          {[0, 20, 40, 60, 80, 100, 120].map((n) => (
            <text key={n} x={sx(n)} y={H - 16} fontSize={10.5} fill="#6b7385" textAnchor="middle">{n}</text>
          ))}
          <text x={(pad.l + W - pad.r) / 2} y={H - 2} fontSize={11} fill="#9aa3b5" textAnchor="middle">problem size n (search space 2ⁿ)</text>
          {[-3, 0, 5, 10, 15, 20].map((v) => (
            <text key={v} x={pad.l - 6} y={sy(v) + 4} fontSize={10} fill="#6b7385" textAnchor="end">10^{v} s</text>
          ))}
          <line x1={pad.l} x2={pad.l} y1={pad.t} y2={H - pad.b} stroke="#4a5368" />
          <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="#4a5368" />
          <path d={path(cl)} fill="none" stroke="#fc6255" strokeWidth={2.5} />
          <path d={path(qu)} fill="none" stroke="#58c4dd" strokeWidth={2.5} />
          <text x={sx(Math.min(nMax - 10, (yMax - 2 + lc) / Math.log10(2)))} y={sy(yMax - 2) - 4} fontSize={12} fill="#fc6255" textAnchor="end">classical 2ⁿ</text>
          <text x={sx(nMax) - 4} y={sy(qu(nMax)) - 8} fontSize={12} fill="#58c4dd" textAnchor="end">Grover ≈ (π/4)·2^(n/2)</text>
          {nStar > 0 && nStar < nMax && Math.log10(tStar) < yMax && (
            <g>
              <circle cx={sx(nStar)} cy={sy(Math.log10(tStar))} r={6} fill="#fcd34d" />
              <line x1={sx(nStar)} x2={sx(nStar)} y1={sy(Math.log10(tStar))} y2={H - pad.b} stroke="#fcd34d" strokeDasharray="3 3" />
            </g>
          )}
        </svg>
      </div>
      <div className="dim" style={{ fontSize: '0.9rem' }}>
        Crossover at n ≈ <b style={{ color: 'var(--yellow)' }}>{nStar.toFixed(1)}</b>, where both machines need about <b style={{ color: 'var(--yellow)' }}>{fmtTime(tStar)}</b>.
        Below that the classical computer is faster. A quadratic speedup only pays off on problems that already run for that long, and a
        bigger classical cluster pushes the crossover further out.
      </div>
    </Widget>
  );
}
