import React, { useEffect, useRef, useState } from 'react';
import { Widget, Slider, Toggle, useAnimationFrame } from '../../../components/ui';
import { zenoSurvival } from './optics';
import { easeInOut, useInView } from './canvas';

type Phase = 'idle' | 'rotate' | 'measure' | 'boom' | 'doneLive' | 'doneDud';

interface Run {
  k: number; // completed cycles
  phase: Phase;
  t: number;
  angle: number; // polarization angle from H (radians)
  from: number;
  history: ('ok' | 'boom' | 'free')[];
}

const DEG = Math.PI / 180;

/**
 * Quantum-Zeno bomb tester (Kwiat et al.): a photon circulates N times; each pass rotates its polarization by 90°/N.
 * A live bomb in the V channel "measures" the photon every pass, resetting it to H with probability cos²(90°/N).
 */
export function ZenoBombLab() {
  const [N, setN] = useState(6);
  const [live, setLive] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [stats, setStats] = useState({ runs: 0, certified: 0, boom: 0, dud: 0 });
  const run = useRef<Run>({ k: 0, phase: 'idle', t: 0, angle: 0, from: 0, history: [] });
  const [, tick] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const inView = useInView(svgRef);
  const delta = (Math.PI / 2) / N;
  const pSurvive = zenoSurvival(N);

  useEffect(() => {
    run.current = { k: 0, phase: 'idle', t: 0, angle: 0, from: 0, history: [] };
    setStats({ runs: 0, certified: 0, boom: 0, dud: 0 });
  }, [N, live]);

  const start = () => {
    run.current = { k: 0, phase: 'rotate', t: 0, angle: 0, from: 0, history: [] };
  };

  const stepDur = Math.min(0.55, 5 / N) / speed;

  useAnimationFrame((dt) => {
    const r = run.current;
    if (r.phase === 'rotate') {
      r.t += dt;
      const f = Math.min(1, r.t / stepDur);
      r.angle = r.from + delta * easeInOut(f);
      if (f >= 1) {
        r.phase = 'measure';
        r.t = 0;
        r.angle = r.from + delta;
        if (live) {
          // the bomb asks: "is the photon in the V channel?"
          const pV = Math.sin(r.angle) ** 2;
          if (Math.random() < pV) {
            r.phase = 'boom';
            r.history.push('boom');
            setStats((s) => ({ ...s, runs: s.runs + 1, boom: s.boom + 1 }));
          } else {
            r.history.push('ok');
          }
        } else r.history.push('free');
      }
    } else if (r.phase === 'measure') {
      r.t += dt;
      if (r.t >= stepDur * 0.6) {
        r.k++;
        if (live) r.angle = 0; // collapsed back to H
        r.from = r.angle;
        r.t = 0;
        if (r.k >= N) {
          if (live) {
            r.phase = 'doneLive';
            setStats((s) => ({ ...s, runs: s.runs + 1, certified: s.certified + 1 }));
          } else {
            r.phase = 'doneDud';
            setStats((s) => ({ ...s, runs: s.runs + 1, dud: s.dud + 1 }));
          }
        } else r.phase = 'rotate';
      }
    } else if (r.phase === 'boom') {
      r.t += dt;
    }
    tick((k) => (k + 1) % 1000000);
  }, inView);

  const runMany = (m: number) => {
    let cert = 0, boom = 0, dud = 0;
    for (let i = 0; i < m; i++) {
      if (!live) {
        dud++;
        continue;
      }
      let alive = true;
      for (let k = 0; k < N; k++) {
        if (Math.random() < Math.sin(delta) ** 2) {
          alive = false;
          break;
        }
      }
      if (alive) cert++;
      else boom++;
    }
    setStats((s) => ({ runs: s.runs + m, certified: s.certified + cert, boom: s.boom + boom, dud: s.dud + dud }));
  };

  const r = run.current;
  // dial
  const DX = 120, DY = 140, DR = 80;
  const ax = Math.cos(r.angle), ay = Math.sin(r.angle);
  const measuring = r.phase === 'measure' && live;
  const pV = Math.sin(r.angle) ** 2;

  // plot of survival vs N
  const PX = 300, PY = 40, PW = 300, PH = 180, NMAX = 30;
  const sx = (n: number) => PX + ((n - 1) / (NMAX - 1)) * PW;
  const sy = (p: number) => PY + PH - p * PH;

  let status = 'Press “Send photon”.';
  if (r.phase === 'rotate' || r.phase === 'measure') status = `Cycle ${Math.min(N, r.k + 1)} of ${N}: rotator turns the polarization by ${(90 / N).toFixed(1)}°`;
  if (measuring) status = `The bomb's detector checks the V channel: P(V) = sin²(${(90 / N).toFixed(1)}°) = ${(pV * 100).toFixed(1)}% … not found → photon is back to H`;
  if (r.phase === 'boom') status = `💥 The photon was found in the V channel on cycle ${r.k + 1}. The bomb exploded.`;
  if (r.phase === 'doneLive') status = `✅ The photon left horizontally polarized after ${N} cycles. The bomb must be live, and it did not explode!`;
  if (r.phase === 'doneDud') status = `The polarization rotated all the way to V: nothing interrupted it, so the bomb is a dud.`;

  return (
    <Widget title="Quantum Zeno bomb tester">
      <svg ref={svgRef} viewBox="0 0 640 270" style={{ width: '100%', height: 'auto', display: 'block' }}>
        <rect x={0} y={0} width={640} height={270} rx={10} fill="#0a0d14" />
        {/* dial */}
        <circle cx={DX} cy={DY} r={DR} fill="#11141c" stroke="#2a3142" />
        <line x1={DX - DR - 8} y1={DY} x2={DX + DR + 8} y2={DY} stroke="#58c4dd" strokeOpacity={0.5} />
        <line x1={DX} y1={DY - DR - 8} x2={DX} y2={DY + DR + 8} stroke="#fc6255" strokeOpacity={0.5} />
        <text x={DX + DR + 10} y={DY + 4} fill="#58c4dd" fontSize={12}>H</text>
        <text x={DX - 5} y={DY - DR - 12} fill="#fc6255" fontSize={12}>V</text>
        {/* V-channel danger wedge */}
        {live && <path d={`M ${DX} ${DY} L ${DX - 14} ${DY - DR} A ${DR} ${DR} 0 0 1 ${DX + 14} ${DY - DR} Z`} fill="#fc6255" opacity={0.12} />}
        {/* steps */}
        {Array.from({ length: N + 1 }, (_, k) => {
          const a = k * delta;
          return <line key={k} x1={DX + (DR - 6) * Math.cos(a)} y1={DY - (DR - 6) * Math.sin(a)} x2={DX + DR * Math.cos(a)} y2={DY - DR * Math.sin(a)} stroke="#6b7385" />;
        })}
        {r.phase !== 'boom' && r.phase !== 'idle' && (
          <g>
            <line x1={DX - DR * 0.85 * ax} y1={DY + DR * 0.85 * ay} x2={DX + DR * 0.85 * ax} y2={DY - DR * 0.85 * ay} stroke={measuring ? '#fff' : '#fcd34d'} strokeWidth={4} strokeLinecap="round" />
            <circle cx={DX} cy={DY} r={5} fill="#fcd34d" />
          </g>
        )}
        {measuring && (
          <g opacity={1 - r.t / (stepDur * 0.6)}>
            <line x1={DX} y1={DY} x2={DX + DR * 0.85} y2={DY} stroke="#58c4dd" strokeWidth={6} strokeLinecap="round" />
          </g>
        )}
        {r.phase === 'boom' && (
          <g opacity={Math.max(0, 1 - r.t / 1.2)}>
            {Array.from({ length: 14 }, (_, k) => {
              const a = (k / 14) * 2 * Math.PI;
              const r0 = 10 + 60 * r.t, r1 = 30 + 90 * r.t;
              return <line key={k} x1={DX + Math.cos(a) * r0} y1={DY + Math.sin(a) * r0} x2={DX + Math.cos(a) * r1} y2={DY + Math.sin(a) * r1} stroke={k % 2 ? '#fcd34d' : '#ff8c42'} strokeWidth={5} />;
            })}
            <text x={DX} y={DY + 8} textAnchor="middle" fontSize={34}>💥</text>
          </g>
        )}
        {r.phase === 'idle' && (
          <text x={DX} y={DY + 4} textAnchor="middle" fill="#6b7385" fontSize={12}>
            photon starts H
          </text>
        )}
        <text x={DX} y={DY + DR + 26} textAnchor="middle" fill="#9aa3b5" fontSize={12}>
          photon polarization
        </text>
        {/* cycle track */}
        {Array.from({ length: N }, (_, k) => {
          const w = Math.min(14, 200 / N);
          const h = r.history[k];
          const col = h === 'ok' ? '#83c167' : h === 'boom' ? '#fc6255' : h === 'free' ? '#fcd34d' : '#1d2230';
          return <rect key={k} x={20 + k * (w + 1)} y={14} width={w} height={10} rx={2} fill={col} stroke="#2a3142" />;
        })}
        {/* plot */}
        <rect x={PX} y={PY} width={PW} height={PH} fill="#11141c" stroke="#2a3142" />
        {[0.25, 0.5, 0.75, 1].map((p) => (
          <g key={p}>
            <line x1={PX} x2={PX + PW} y1={sy(p)} y2={sy(p)} stroke="#2a3142" />
            <text x={PX - 6} y={sy(p) + 4} textAnchor="end" fill="#6b7385" fontSize={10}>
              {p}
            </text>
          </g>
        ))}
        <polyline
          points={Array.from({ length: 120 }, (_, i) => {
            const n = 1.2 + (i / 119) * (NMAX - 1.2);
            return `${sx(n)},${sy(Math.max(0, 1 - (Math.PI * Math.PI) / (4 * n)))}`;
          }).join(' ')}
          fill="none"
          stroke="#9a72ac"
          strokeDasharray="4 3"
        />
        {Array.from({ length: NMAX }, (_, i) => {
          const n = i + 1;
          return <circle key={n} cx={sx(n)} cy={sy(zenoSurvival(n))} r={n === N ? 6 : 3} fill={n === N ? '#fcd34d' : '#58c4dd'} />;
        })}
        <text x={PX + PW / 2} y={PY + PH + 30} textAnchor="middle" fill="#9aa3b5" fontSize={12}>
          number of cycles N
        </text>
        <text x={PX} y={PY - 10} fill="#9aa3b5" fontSize={12}>
          P(live bomb certified safely) = cos²ᴺ(90°/N)
        </text>
        <text x={PX + PW - 4} y={PY + PH - 8} textAnchor="end" fill="#9a72ac" fontSize={10}>
          dashed: ≈ 1 − π²/(4N)
        </text>
        <text x={sx(N)} y={sy(pSurvive) - 12} textAnchor="middle" fill="#fcd34d" fontSize={12} fontWeight={700}>
          {(pSurvive * 100).toFixed(1)}%
        </text>
      </svg>
      <div className="dim" style={{ minHeight: '2.6em', fontSize: '0.92rem', margin: '6px 2px' }}>
        {status}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '6px 18px' }}>
        <Slider label="cycles N" value={N} min={1} max={30} step={1} onChange={setN} format={(v) => `${v} (${(90 / v).toFixed(1)}°/cycle)`} />
        <Slider label="speed" value={speed} min={0.5} max={4} step={0.1} onChange={setSpeed} format={(v) => `${v.toFixed(1)}×`} />
      </div>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
        <Toggle label="bomb is live" value={live} onChange={setLive} />
        <button className="btn small primary" onClick={start}>
          Send photon
        </button>
        <button className="btn small" onClick={() => runMany(1000)}>
          Test 1000 bombs instantly
        </button>
        <span className="mono" style={{ fontSize: '0.85rem' }}>
          runs {stats.runs} · ✅ certified {stats.certified} · 💥 {stats.boom} · dud {stats.dud}
          {stats.runs > 0 && live ? ` · success ${((100 * stats.certified) / stats.runs).toFixed(1)}%` : ''}
        </span>
      </div>
    </Widget>
  );
}

