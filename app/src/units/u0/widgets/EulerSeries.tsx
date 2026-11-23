import React, { useState } from 'react';
import { Widget, Slider, Toggle, Tex, fmtPi, useAnimationFrame } from '../../../components/ui';
import { phaseColor } from '../../../engine/complex';
import { Arrow, fx } from './common';

const W = 420,
  H = 420;

/**
 * e^{iθ} as the sum 1 + iθ + (iθ)²/2! + …, drawn as a chain of arrows that each turn 90°.
 * Next to it, the real and imaginary parts trace out cos θ and sin θ.
 */
export function EulerSeries() {
  const [theta, setTheta] = useState(Math.PI / 2);
  const [terms, setTerms] = useState(6);
  const [play, setPlay] = useState(false);
  useAnimationFrame((dt) => setTheta((t) => (t + dt * 0.7) % (2 * Math.PI)), play);

  // partial sums
  const pts: [number, number][] = [[0, 0]];
  let term = { re: 1, im: 0 };
  let sum = { re: 0, im: 0 };
  for (let k = 0; k < terms; k++) {
    if (k > 0) {
      // multiply by iθ/k
      term = { re: (-term.im * theta) / k, im: (term.re * theta) / k };
    }
    sum = { re: sum.re + term.re, im: sum.im + term.im };
    pts.push([sum.re, sum.im]);
  }
  // view radius adapts to how far the partial sums wander (clamped)
  const ext = pts.reduce((m, [x, y]) => Math.max(m, Math.abs(x), Math.abs(y)), 1);
  const R = Math.min(6, Math.max(1.35, ext * 1.12));
  const s = W / (2 * R);
  const X = (x: number) => W / 2 + x * s;
  const Y = (y: number) => H / 2 - y * s;
  const err = Math.hypot(sum.re - Math.cos(theta), sum.im - Math.sin(theta));

  // wave panel
  const PW = 360,
    PH = 200;
  const px = (t: number) => 30 + (t / (2 * Math.PI)) * (PW - 40);
  const py = (v: number) => PH / 2 - v * 70;
  const wave = (f: (t: number) => number) =>
    Array.from({ length: 121 }, (_, i) => {
      const t = (i / 120) * 2 * Math.PI;
      return `${px(t)},${py(f(t))}`;
    }).join(' ');

  return (
    <Widget title="Building e^(iθ) one term at a time">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16, alignItems: 'center' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
          <rect width={W} height={H} rx={10} fill="#0d1018" />
          <line x1={0} x2={W} y1={Y(0)} y2={Y(0)} stroke="#3a4458" />
          <line y1={0} y2={H} x1={X(0)} x2={X(0)} stroke="#3a4458" />
          <circle cx={X(0)} cy={Y(0)} r={s} fill="none" stroke="#4b5672" strokeDasharray="4 4" />
          <text x={X(1) + 4} y={Y(0) + 14} fill="#6b7385" fontSize={11}>
            1
          </text>
          <text x={X(0) + 4} y={Y(1) - 4} fill="#6b7385" fontSize={11}>
            i
          </text>
          {/* the exact point */}
          <line x1={X(0)} y1={Y(0)} x2={X(Math.cos(theta))} y2={Y(Math.sin(theta))} stroke="#ffffff" strokeOpacity={0.25} strokeWidth={1.5} />
          <circle cx={X(Math.cos(theta))} cy={Y(Math.sin(theta))} r={7} fill="none" stroke="#fff" strokeWidth={1.5} />
          {/* chain of terms */}
          {pts.slice(1).map((p, k) => (
            <Arrow key={k} x1={X(pts[k][0])} y1={Y(pts[k][1])} x2={X(p[0])} y2={Y(p[1])} color={phaseColor((k * Math.PI) / 2)} width={2.6} head={9} />
          ))}
          <circle cx={X(sum.re)} cy={Y(sum.im)} r={4} fill="#fcd34d" />
        </svg>
        <div className="col" style={{ gap: 8 }}>
          <svg viewBox={`0 0 ${PW} ${PH}`} style={{ width: '100%', height: 'auto' }}>
            <rect width={PW} height={PH} rx={8} fill="#0d1018" />
            <line x1={30} x2={PW - 10} y1={py(0)} y2={py(0)} stroke="#3a4458" />
            <polyline points={wave(Math.cos)} fill="none" stroke="#58c4dd" strokeWidth={2} />
            <polyline points={wave(Math.sin)} fill="none" stroke="#fc6255" strokeWidth={2} />
            <line x1={px(theta)} x2={px(theta)} y1={10} y2={PH - 10} stroke="#fcd34d" strokeDasharray="3 3" />
            <circle cx={px(theta)} cy={py(Math.cos(theta))} r={4} fill="#58c4dd" />
            <circle cx={px(theta)} cy={py(Math.sin(theta))} r={4} fill="#fc6255" />
            <text x={36} y={18} fill="#58c4dd" fontSize={12}>
              Re e^(iθ) = cos θ
            </text>
            <text x={36} y={34} fill="#fc6255" fontSize={12}>
              Im e^(iθ) = sin θ
            </text>
            <text x={px(Math.PI)} y={PH - 6} fill="#6b7385" fontSize={11} textAnchor="middle">
              π
            </text>
            <text x={px(2 * Math.PI)} y={PH - 6} fill="#6b7385" fontSize={11} textAnchor="middle">
              2π
            </text>
          </svg>
          <Slider label={<Tex>{'\\theta'}</Tex>} value={theta} min={0} max={2 * Math.PI} step={Math.PI / 48} onChange={setTheta} format={fmtPi} />
          <Slider label="terms" value={terms} min={1} max={16} step={1} onChange={setTerms} format={(v) => String(v)} />
          <Toggle label="animate θ" value={play} onChange={setPlay} />
          <div style={{ fontSize: '0.9rem' }}>
            <Tex>{`\\sum_{k=0}^{${terms - 1}} \\frac{(i\\theta)^k}{k!} = ${fx(sum.re, 3)} ${sum.im < 0 ? '-' : '+'} ${fx(Math.abs(sum.im), 3)}i`}</Tex>
          </div>
          <div className="faint" style={{ fontSize: '0.82rem' }}>
            exact: <Tex>{`e^{i\\theta} = ${fx(Math.cos(theta), 3)} ${Math.sin(theta) < 0 ? '-' : '+'} ${fx(Math.abs(Math.sin(theta)), 3)}i`}</Tex> · gap = {err.toExponential(1)}
          </div>
        </div>
      </div>
    </Widget>
  );
}
