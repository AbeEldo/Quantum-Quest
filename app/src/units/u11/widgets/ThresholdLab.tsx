import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Widget, Segmented, Slider, Stat } from '../../../components/ui';
import { mulberry32 } from '../../../engine/qsim';
import { makeSurfaceCode, trialLogicalError, type SurfaceCode } from '../engine/surface';

const PS = [0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.1, 0.11, 0.12, 0.14, 0.16];
const DS = [3, 5, 7];
const DCOL: Record<number, string> = { 3: '#58c4dd', 5: '#83c167', 7: '#e07ab6' };

/** Log-log chart helper. */
function LogChart({
  xRange, yRange, xLabel, yLabel, children, width = 560, height = 300, xTicks, yTicks,
}: {
  xRange: [number, number]; yRange: [number, number]; xLabel: string; yLabel: string; width?: number; height?: number;
  xTicks: number[]; yTicks: number[];
  children: (sx: (x: number) => number, sy: (y: number) => number) => React.ReactNode;
}) {
  const pad = { l: 56, r: 12, t: 10, b: 38 };
  const lx = (x: number) => Math.log10(x), ly = (y: number) => Math.log10(y);
  const sx = (x: number) => pad.l + ((lx(x) - lx(xRange[0])) / (lx(xRange[1]) - lx(xRange[0]))) * (width - pad.l - pad.r);
  const sy = (y: number) => height - pad.b - ((ly(Math.max(y, yRange[0])) - ly(yRange[0])) / (ly(yRange[1]) - ly(yRange[0]))) * (height - pad.t - pad.b);
  const fmt = (v: number) => (v >= 0.01 ? `${+(v * 100).toFixed(2)}%` : v.toExponential(0));
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', display: 'block' }}>
      {xTicks.map((x) => <line key={`gx${x}`} x1={sx(x)} x2={sx(x)} y1={pad.t} y2={height - pad.b} stroke="#232a38" />)}
      {yTicks.map((y) => <line key={`gy${y}`} x1={pad.l} x2={width - pad.r} y1={sy(y)} y2={sy(y)} stroke="#232a38" />)}
      <rect x={pad.l} y={pad.t} width={width - pad.l - pad.r} height={height - pad.t - pad.b} fill="none" stroke="#2a3142" />
      {xTicks.map((x) => <text key={`tx${x}`} x={sx(x)} y={height - pad.b + 14} fontSize={10.5} fill="#7d8699" textAnchor="middle">{fmt(x)}</text>)}
      {yTicks.map((y) => <text key={`ty${y}`} x={pad.l - 5} y={sy(y) + 4} fontSize={10.5} fill="#7d8699" textAnchor="end">{fmt(y)}</text>)}
      <text x={(pad.l + width - pad.r) / 2} y={height - 6} fontSize={12} fill="#9aa3b5" textAnchor="middle" fontStyle="italic">{xLabel}</text>
      <text x={12} y={(pad.t + height - pad.b) / 2} fontSize={12} fill="#9aa3b5" textAnchor="middle" fontStyle="italic" transform={`rotate(-90 12 ${(pad.t + height - pad.b) / 2})`}>{yLabel}</text>
      {children(sx, sy)}
    </svg>
  );
}

/** Live Monte-Carlo threshold experiment + Λ / Willow explorer. */
export function ThresholdLab() {
  const [tab, setTab] = useState<'sim' | 'lambda'>('sim');
  return (
    <Widget title="Threshold lab">
      <div className="row" style={{ marginBottom: 8 }}>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'sim', label: '🎲 Find the threshold (simulation)' }, { value: 'lambda', label: '📉 Λ, distance & Willow' }]} />
      </div>
      {tab === 'sim' ? <ThresholdSim /> : <LambdaExplorer />}
    </Widget>
  );
}

function ThresholdSim() {
  const codes = useMemo(() => Object.fromEntries(DS.map((d) => [d, makeSurfaceCode(d)])) as Record<number, SurfaceCode>, []);
  const counts = useRef(DS.map(() => PS.map(() => ({ n: 0, f: 0 }))));
  const [running, setRunning] = useState(false);
  const [, setFrame] = useState(0);
  const rng = useRef(mulberry32(2025));
  const cursor = useRef(0);

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const loop = () => {
      const t0 = performance.now();
      while (performance.now() - t0 < 12) {
        const k = cursor.current++ % (DS.length * PS.length);
        const di = Math.floor(k / PS.length), pi = k % PS.length;
        const cell = counts.current[di][pi];
        if (cell.n >= 4000) continue;
        for (let r = 0; r < 4; r++) {
          cell.n++;
          if (trialLogicalError(codes[DS[di]], 'X', PS[pi], rng.current)) cell.f++;
        }
      }
      setFrame((f) => f + 1);
      if (counts.current.every((row) => row.every((c) => c.n >= 4000))) setRunning(false);
      else raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, codes]);

  const total = counts.current.flat().reduce((a, c) => a + c.n, 0);
  return (
    <div>
      <div className="faint" style={{ fontSize: '0.86rem', marginBottom: 6 }}>
        For each code distance and physical error rate, sample random bit-flip errors (perfect syndrome measurements), decode with minimum-weight matching, and count
        logical failures. Each point is a real simulation running in your browser.
      </div>
      <div className="row" style={{ gap: 8, marginBottom: 6 }}>
        <button className="btn small primary" onClick={() => setRunning((r) => !r)}>{running ? '⏸ pause' : total ? '▶ continue' : '▶ run the experiment'}</button>
        <button className="btn small ghost" onClick={() => { counts.current = DS.map(() => PS.map(() => ({ n: 0, f: 0 }))); setFrame((f) => f + 1); }}>reset</button>
        <Stat label="trials so far" value={total.toLocaleString()} />
      </div>
      <LogChart xRange={[0.02, 0.16]} yRange={[1e-4, 0.6]} xLabel="physical error rate p (per qubit)" yLabel="logical error rate" xTicks={[0.02, 0.04, 0.06, 0.1, 0.16]} yTicks={[1e-4, 1e-3, 0.01, 0.1]}>
        {(sx, sy) => (
          <>
            <line x1={sx(0.02)} y1={sy(0.02)} x2={sx(0.16)} y2={sy(0.16)} stroke="#9aa3b5" strokeDasharray="5 4" />
            <text x={sx(0.13)} y={sy(0.13) - 8} fontSize={11} fill="#9aa3b5">no code (p_L = p)</text>
            {DS.map((d, di) => {
              const pts = PS.map((p, pi) => ({ p, c: counts.current[di][pi] })).filter((o) => o.c.n > 0 && o.c.f > 0);
              return (
                <g key={d}>
                  <polyline points={pts.map((o) => `${sx(o.p)},${sy(o.c.f / o.c.n)}`).join(' ')} fill="none" stroke={DCOL[d]} strokeWidth={2.2} />
                  {pts.map((o) => {
                    const m = o.c.f / o.c.n;
                    const se = Math.sqrt((m * (1 - m)) / o.c.n);
                    return (
                      <g key={o.p}>
                        <line x1={sx(o.p)} x2={sx(o.p)} y1={sy(Math.max(1e-4, m - se))} y2={sy(m + se)} stroke={DCOL[d]} opacity={0.6} />
                        <circle cx={sx(o.p)} cy={sy(m)} r={3.5} fill={DCOL[d]} />
                      </g>
                    );
                  })}
                  <text x={sx(0.021)} y={18 + di * 15} fontSize={12} fill={DCOL[d]} fontWeight={600}>d = {d}</text>
                </g>
              );
            })}
          </>
        )}
      </LogChart>
      <div className="faint" style={{ fontSize: '0.82rem' }}>
        Look for the crossing: to its left, larger codes are <b>better</b> (curves fan out downward); to its right, larger codes are <b>worse</b>. For this simplified noise
        model the crossing sits near 9–10%. With realistic noise (faulty syndrome measurements, noisy CNOTs), the same analysis gives a threshold of roughly 1%.
      </div>
    </div>
  );
}

function LambdaExplorer() {
  const [lambda, setLambda] = useState(2.14);
  const [target, setTarget] = useState(-6);
  const e7 = 0.00143; // Google Willow d=7 logical error per cycle (Nature 2025)
  const eps = (d: number) => e7 / Math.pow(lambda, (d - 7) / 2);
  const targetE = Math.pow(10, target);
  let dNeed = 3;
  while (eps(dNeed) > targetE && dNeed < 101) dNeed += 2;
  const ds = [3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31];
  return (
    <div>
      <div className="faint" style={{ fontSize: '0.86rem', marginBottom: 6 }}>
        Below threshold, each step <b>d → d + 2</b> divides the logical error per cycle by the suppression factor <b>Λ</b>. Google's Willow experiment (Nature, published online Dec 2024)
        measured <b>Λ = 2.14 ± 0.02</b> and <b>0.143% per cycle at d = 7</b>. The curve below extrapolates from that point. Real devices may hit new error floors, so treat it as a model, not a promise.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 18px' }}>
        <Slider label="suppression factor Λ" value={lambda} min={1} max={10} step={0.01} onChange={setLambda} format={(x) => x.toFixed(2)} />
        <Slider label="target logical error / cycle" value={target} min={-12} max={-3} step={1} onChange={setTarget} format={(x) => `10^${x}`} />
      </div>
      <LogChart xRange={[3, 31]} yRange={[1e-13, 0.05]} xLabel="code distance d (log axis)" yLabel="logical error per cycle" xTicks={[3, 5, 7, 11, 15, 21, 31]} yTicks={[1e-12, 1e-9, 1e-6, 1e-3, 0.01]}>
        {(sx, sy) => (
          <>
            <line x1={sx(3)} x2={sx(31)} y1={sy(targetE)} y2={sy(targetE)} stroke="#fcd34d" strokeDasharray="5 4" />
            <polyline points={ds.map((d) => `${sx(d)},${sy(eps(d))}`).join(' ')} fill="none" stroke="#e07ab6" strokeWidth={2.4} />
            {ds.map((d) => (
              <circle key={d} cx={sx(d)} cy={sy(eps(d))} r={d === dNeed ? 6 : 3.2} fill={d <= 7 ? '#83c167' : d === dNeed ? '#fcd34d' : '#e07ab6'} />
            ))}
            <text x={sx(7) + 8} y={sy(e7) - 6} fontSize={11} fill="#83c167">Willow d=7: 0.143%</text>
          </>
        )}
      </LogChart>
      <div className="row" style={{ gap: 20, flexWrap: 'wrap' }}>
        <Stat label="distance needed" value={dNeed > 99 ? '> 99' : dNeed} color="var(--yellow)" />
        <Stat label="physical qubits per logical qubit (≈ 2d² − 1)" value={dNeed > 99 ? '—' : (2 * dNeed * dNeed - 1).toLocaleString()} color="var(--pink)" />
        <Stat label="implied d=3 / d=5 error" value={`${(eps(3) * 100).toFixed(2)}% / ${(eps(5) * 100).toFixed(2)}%`} />
      </div>
      <div className="faint" style={{ fontSize: '0.82rem', marginTop: 4 }}>
        Raising Λ (better physical qubits, further below threshold) shrinks the overhead dramatically. At Λ ≈ 2, a 10⁻⁶ logical qubit needs hundreds to thousands of physical qubits. At
        Λ ≈ 10, a few hundred. That's why every hardware group is chasing lower physical error rates even after crossing the threshold.
      </div>
    </div>
  );
}
