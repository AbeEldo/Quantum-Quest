import React, { useEffect, useRef, useState } from 'react';
import { Widget, Segmented, useAnimationFrame } from '../../../components/ui';
import { Plot } from '../../../widgets/Plot';
import { AngleDial, deg } from './parts';
import { pAgree, socksAgree, socksOutcome } from '../lib/bell';

type Mode = 'quantum' | 'socks';
interface Pair {
  t: number;
  a: 0 | 1;
  b: 0 | 1;
  lam: number;
}

const OUT_COL = ['#58c4dd', '#fcd34d'];

/**
 * Entangled photon pairs fly to two analysers. Choose each analyser angle, fire pairs,
 * and compare the agreement rate with quantum theory (cos²Δ) and a "socks" hidden-variable model.
 */
export function CorrelationLab({ allowSocks = true }: { allowSocks?: boolean }) {
  const [thA, setThA] = useState(0);
  const [thB, setThB] = useState(0);
  const [mode, setMode] = useState<Mode>('quantum');
  const [counts, setCounts] = useState([0, 0, 0, 0]);
  const [flash, setFlash] = useState<{ a: number; b: number; t: number } | null>(null);
  const pairs = useRef<Pair[]>([]);
  const queue = useRef(0);
  const sinceSpawn = useRef(0);
  const [running, setRunning] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(700);
  const H = 150;
  const params = useRef({ thA, thB, mode });
  params.current = { thA, thB, mode };

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setCounts([0, 0, 0, 0]);
  }, [thA, thB, mode]);

  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(null), 260);
    return () => window.clearTimeout(id);
  }, [flash]);

  const sample = (): Pair => {
    const { thA: a0, thB: b0, mode: m } = params.current;
    const lam = Math.random() * Math.PI;
    if (m === 'socks') return { t: 0, a: socksOutcome(a0, lam), b: socksOutcome(b0, lam), lam };
    const a = (Math.random() < 0.5 ? 0 : 1) as 0 | 1;
    const b = (Math.random() < pAgree(a0, b0) ? a : 1 - a) as 0 | 1;
    return { t: 0, a, b, lam };
  };

  const record = (p: Pair) => setCounts((c0) => c0.map((v, i) => (i === p.a * 2 + p.b ? v + 1 : v)));

  const fire = (n: number) => {
    queue.current += n;
    setRunning(true);
  };
  const instant = (n: number) => {
    const add = [0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      const p = sample();
      add[p.a * 2 + p.b]++;
    }
    setCounts((c0) => c0.map((v, i) => v + add[i]));
  };

  useAnimationFrame((dt) => {
    sinceSpawn.current += dt;
    if (queue.current > 0 && sinceSpawn.current > 0.09) {
      pairs.current.push(sample());
      queue.current--;
      sinceSpawn.current = 0;
    }
    const speed = 1.1;
    const keep: Pair[] = [];
    for (const p of pairs.current) {
      p.t += dt * speed;
      if (p.t >= 1) {
        record(p);
        setFlash({ a: p.a, b: p.b, t: performance.now() });
      } else keep.push(p);
    }
    pairs.current = keep;
    draw();
    if (!keep.length && queue.current === 0) setRunning(false);
  }, running);

  const draw = () => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(W * dpr)) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      cv.style.height = `${H}px`;
    }
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;
    const xA = 70, xB = W - 70;
    // beam line
    const g = ctx.createLinearGradient(xA, 0, xB, 0);
    g.addColorStop(0, 'rgba(88,196,221,0.25)');
    g.addColorStop(0.5, 'rgba(224,122,182,0.35)');
    g.addColorStop(1, 'rgba(252,211,77,0.25)');
    ctx.strokeStyle = g;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xA, cy);
    ctx.lineTo(xB, cy);
    ctx.stroke();
    // source
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 300);
    ctx.fillStyle = `rgba(224,122,182,${0.25 + 0.25 * pulse})`;
    ctx.beginPath();
    ctx.arc(cx, cy, 20 + 3 * pulse, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = '#e07ab6';
    ctx.beginPath();
    ctx.arc(cx, cy, 11, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = '#9aa3b5';
    ctx.font = '11px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(params.current.mode === 'quantum' ? 'source of |Φ⁺⟩ pairs' : 'source of "socks"', cx, cy + 38);
    // analysers
    const drawAnalyser = (x: number, th: number, col: string, name: string) => {
      ctx.strokeStyle = '#3a4256';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, cy, 26, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.strokeStyle = col;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - 24 * Math.cos(th), cy + 24 * Math.sin(th));
      ctx.lineTo(x + 24 * Math.cos(th), cy - 24 * Math.sin(th));
      ctx.stroke();
      ctx.fillStyle = '#9aa3b5';
      ctx.fillText(name, x, cy + 44);
    };
    drawAnalyser(xA, params.current.thA, '#58c4dd', `Alice ${deg(params.current.thA)}°`);
    drawAnalyser(xB, params.current.thB, '#fcd34d', `Bob ${deg(params.current.thB)}°`);
    // photons
    for (const p of pairs.current) {
      const e = p.t;
      const dx = (cx - xA - 26) * e;
      for (const [x, side] of [[cx - dx, 0], [cx + dx, 1]] as [number, number][]) {
        ctx.fillStyle = 'rgba(224,122,182,0.25)';
        ctx.beginPath();
        ctx.arc(x, cy, 9, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = '#f3b7d8';
        ctx.beginPath();
        ctx.arc(x, cy, 4.5, 0, 2 * Math.PI);
        ctx.fill();
        if (params.current.mode === 'socks') {
          // socks carry a visible hidden polarisation
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x - 9 * Math.cos(p.lam), cy + 9 * Math.sin(p.lam));
          ctx.lineTo(x + 9 * Math.cos(p.lam), cy - 9 * Math.sin(p.lam));
          ctx.stroke();
        }
        void side;
      }
    }
  };

  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, thA, thB, mode]);

  const N = counts.reduce((a, b) => a + b, 0);
  const agree = N ? (counts[0] + counts[3]) / N : null;
  const theory = mode === 'quantum' ? pAgree(thA, thB) : socksAgree(thA, thB);
  let dDeg = Math.abs(deg(thA - thB)) % 180;
  if (dDeg > 90) dDeg = 180 - dDeg;
  const err = N && agree !== null ? Math.sqrt((agree * (1 - agree)) / N) : 0;
  const lampOn = !!flash;

  const lamp = (side: 'A' | 'B', v: 0 | 1) => {
    const on = lampOn && (side === 'A' ? flash!.a : flash!.b) === v;
    return (
      <span
        key={v}
        style={{
          display: 'inline-grid',
          placeItems: 'center',
          width: 26,
          height: 26,
          borderRadius: 13,
          fontSize: '0.75rem',
          fontWeight: 700,
          border: `2px solid ${OUT_COL[v]}`,
          background: on ? OUT_COL[v] : 'transparent',
          color: on ? '#111' : OUT_COL[v],
          boxShadow: on ? `0 0 14px ${OUT_COL[v]}` : 'none',
          transition: 'all .12s',
        }}
      >
        {v}
      </span>
    );
  };

  return (
    <Widget title="Correlation lab: measure both halves of a pair">
      {allowSocks && (
        <div className="row" style={{ marginBottom: 8, gap: 10, flexWrap: 'wrap' }}>
          <span className="faint" style={{ fontSize: '0.85rem' }}>source:</span>
          <Segmented
            options={[
              { value: 'quantum' as Mode, label: 'entangled |Φ⁺⟩' },
              { value: 'socks' as Mode, label: 'classical "socks" (shared hidden polarisation)' },
            ]}
            value={mode}
            onChange={setMode}
          />
        </div>
      )}
      <div ref={wrapRef} style={{ width: '100%' }}>
        <canvas ref={canvasRef} style={{ width: '100%', display: 'block' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'center', marginTop: 4 }}>
        <div style={{ textAlign: 'center' }}>
          <AngleDial value={thA} onChange={setThA} color="#58c4dd" label="Alice" size={110} ghost={thB} />
          <div className="row" style={{ justifyContent: 'center', gap: 4 }}>{[0, 1].map((v) => lamp('A', v as 0 | 1))}</div>
        </div>
        <div className="col" style={{ gap: 8, alignItems: 'center' }}>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button className="btn primary small" onClick={() => fire(1)}>Fire 1 pair</button>
            <button className="btn small" onClick={() => fire(20)}>Fire 20</button>
            <button className="btn small" onClick={() => instant(2000)}>⚡ 2000 instantly</button>
            <button className="btn small ghost" onClick={() => setCounts([0, 0, 0, 0])}>reset</button>
          </div>
          <table className="mono" style={{ fontSize: '0.85rem', borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td />
                <td style={{ padding: '2px 10px', color: OUT_COL[0] }}>Bob 0</td>
                <td style={{ padding: '2px 10px', color: OUT_COL[1] }}>Bob 1</td>
              </tr>
              {[0, 1].map((a) => (
                <tr key={a}>
                  <td style={{ padding: '2px 10px', color: OUT_COL[a] }}>Alice {a}</td>
                  {[0, 1].map((b) => (
                    <td key={b} style={{ padding: '2px 10px', textAlign: 'center', background: a === b ? 'rgba(131,193,103,0.1)' : 'rgba(252,98,85,0.08)', borderRadius: 4 }}>
                      {counts[a * 2 + b]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: '0.9rem', textAlign: 'center' }}>
            angle difference Δ = <b className="mono">{dDeg}°</b> · agree:{' '}
            <b className="mono" style={{ color: 'var(--green)' }}>{agree === null ? '—' : `${(agree * 100).toFixed(1)}% ± ${(err * 100).toFixed(1)}`}</b>
            <span className="faint"> (theory {(theory * 100).toFixed(1)}%, {N} pairs)</span>
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <AngleDial value={thB} onChange={setThB} color="#fcd34d" label="Bob" size={110} ghost={thA} />
          <div className="row" style={{ justifyContent: 'center', gap: 4 }}>{[0, 1].map((v) => lamp('B', v as 0 | 1))}</div>
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <Plot
          height={200}
          width={760}
          xRange={[0, 90]}
          yRange={[0, 1]}
          xTicks={[0, 22.5, 45, 67.5, 90]}
          yTicks={[0, 0.25, 0.5, 0.75, 1]}
          xLabel="angle difference Δ (degrees)"
          yLabel="P(agree)"
          series={[
            { f: (x) => Math.cos((x * Math.PI) / 180) ** 2, color: '#e07ab6', label: 'quantum cos²Δ', width: 2.5 },
            ...(allowSocks ? [{ f: (x: number) => 1 - x / 90, color: '#9aa3b5', dashed: true, label: 'socks 1 − Δ/90°' }] : []),
          ]}
          overlay={(sx, sy) =>
            agree !== null ? (
              <g>
                <line x1={sx(dDeg)} x2={sx(dDeg)} y1={sy(Math.min(1, agree + 2 * err))} y2={sy(Math.max(0, agree - 2 * err))} stroke="#83c167" strokeWidth={2} />
                <circle cx={sx(dDeg)} cy={sy(agree)} r={5} fill="#83c167" stroke="#fff" />
              </g>
            ) : (
              <circle cx={sx(dDeg)} cy={sy(theory)} r={4} fill="none" stroke="#83c167" strokeDasharray="2 2" />
            )
          }
        />
      </div>
    </Widget>
  );
}
