import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Widget, Slider, Segmented, Toggle } from '../../../components/ui';
import { GATES } from '../../../engine/qsim';
import { enumerateWords, wordOf, bestApprox, worstInfidelity, fibonacciSphere, type WordCloud, type WordGate } from '../lib/words';
import { axisAngle, mm2, rot, type Vec3 } from '../lib/su2';

type SetKey = 'clifford' | 'ht';
const SETS: Record<SetKey, WordGate[]> = { clifford: ['H', 'S'], ht: ['H', 'T'] };
const MAXLEN = 36;

/** colour for word length L (blue → teal → yellow) */
function lenColor(L: number, max: number): [number, number, number] {
  const u = Math.min(1, L / Math.max(1, max));
  const stops: [number, number, number][] = [
    [88, 196, 221],
    [92, 208, 179],
    [252, 211, 77],
    [252, 98, 85],
  ];
  const x = u * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  return [0, 1, 2].map((k) => Math.round(stops[i][k] + (stops[i + 1][k] - stops[i][k]) * f)) as [number, number, number];
}

const randomDir = (): Vec3 => {
  const z = 1 - 2 * Math.random(), a = Math.random() * 2 * Math.PI, r = Math.sqrt(1 - z * z);
  return [r * Math.cos(a), r * Math.sin(a), z];
};

/** The orbit of |0⟩ under repeated T·(HTH) — an irrational rotation that never repeats. */
function orbitPoints(k: number): Vec3[] {
  const R = mm2(GATES.T, mm2(GATES.H, mm2(GATES.T, GATES.H))); // time order: H, T, H, T
  const { axis, angle } = axisAngle(R);
  const pts: Vec3[] = [];
  let v: Vec3 = [0, 0, 1];
  for (let i = 0; i <= k; i++) {
    pts.push(v);
    v = rot(v, axis, angle);
  }
  return pts;
}

/**
 * How words in H and T fill the Bloch sphere. Clifford words {H, S} reach only 6 points;
 * add T and the reachable set becomes dense, with approximation error shrinking exponentially
 * in word length.
 */
export function HTCoverage() {
  const [set, setSet] = useState<SetKey>('ht');
  const [mode, setMode] = useState<'words' | 'orbit'>('words');
  const [L, setL] = useState(12);
  const [orbitK, setOrbitK] = useState(40);
  const [auto, setAuto] = useState(true);
  const [target, setTarget] = useState<Vec3>([0.62, -0.42, 0.66]);

  const cloud: WordCloud = useMemo(() => enumerateWords(SETS[set], MAXLEN, 90000), [set]);
  const eps = useMemo(() => worstInfidelity(cloud, fibonacciSphere(300)), [cloud]);
  const maxL = cloud.cumulative.length - 1;
  const Lc = Math.min(L, maxL);
  const shown = cloud.cumulative[Lc];
  const best = useMemo(() => {
    const tn = Math.hypot(...target);
    return bestApprox(cloud, [target[0] / tn, target[1] / tn, target[2] / tn], Lc);
  }, [cloud, target, Lc]);
  const word = useMemo(() => wordOf(cloud, best.index), [cloud, best.index]);
  const orbit = useMemo(() => orbitPoints(orbitK), [orbitK]);

  /* ------------------------- canvas rendering (imperative) ------------------------- */
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const view = useRef({ yaw: -0.9, el: 0.32, w: 400, h: 360, dragging: false, lx: 0, ly: 0, moved: false, dirty: true });
  const data = useRef({ mode, cloud, shown, Lc, target, bestIdx: best.index, orbit, auto });
  data.current = { mode, cloud, shown, Lc, target, bestIdx: best.index, orbit, auto };
  useEffect(() => {
    view.current.dirty = true;
  }, [mode, cloud, shown, target, best.index, orbit]);

  useEffect(() => {
    const cv = canvasRef.current!;
    const ro = new ResizeObserver(() => {
      const w = cv.parentElement!.clientWidth;
      view.current.w = w;
      view.current.h = Math.min(400, Math.max(300, w * 0.62));
      const dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(view.current.h * dpr);
      cv.style.height = `${view.current.h}px`;
      view.current.dirty = true;
    });
    ro.observe(cv.parentElement!);
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const V = view.current;
      if (data.current.auto && !V.dragging) {
        V.yaw += dt * 0.25;
        V.dirty = true;
      }
      if (V.dirty) {
        draw(cv, V, data.current);
        V.dirty = false;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const onDown = (e: React.PointerEvent) => {
    const V = view.current;
    V.dragging = true;
    V.moved = false;
    V.lx = e.clientX;
    V.ly = e.clientY;
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const V = view.current;
    if (!V.dragging) return;
    const dx = e.clientX - V.lx, dy = e.clientY - V.ly;
    if (Math.abs(dx) + Math.abs(dy) > 2) V.moved = true;
    V.yaw += dx * 0.01;
    V.el = Math.max(-1.4, Math.min(1.4, V.el + dy * 0.01));
    V.lx = e.clientX;
    V.ly = e.clientY;
    V.dirty = true;
  };
  const onUp = (e: React.PointerEvent) => {
    const V = view.current;
    V.dragging = false;
    if (!V.moved && data.current.mode === 'words') {
      // click: pick a target on the front hemisphere
      const rect = (e.target as Element).getBoundingClientRect();
      const R = Math.min(V.w, V.h) * 0.42;
      const r = (e.clientX - rect.left - V.w / 2) / R;
      const u = -(e.clientY - rect.top - V.h / 2) / R;
      if (r * r + u * u < 1) {
        const d = Math.sqrt(1 - r * r - u * u);
        const y1 = r, x1 = d * Math.cos(V.el) - u * Math.sin(V.el), z1 = d * Math.sin(V.el) + u * Math.cos(V.el);
        const x = x1 * Math.cos(V.yaw) + y1 * Math.sin(V.yaw), y = -x1 * Math.sin(V.yaw) + y1 * Math.cos(V.yaw);
        setTarget([x, y, z1]);
      }
    }
  };

  /* ------------------------------ ε(L) mini chart ------------------------------ */
  const chartW = 300, chartH = 150, padL = 40, padB = 22;
  const yOf = (e: number) => {
    const lg = Math.log10(Math.max(1e-6, e));
    return 6 + ((0 - lg) / 6) * (chartH - padB - 6);
  };
  const xOf = (l: number) => padL + (l / MAXLEN) * (chartW - padL - 8);
  const epsPath = eps.map((e, l) => `${l ? 'L' : 'M'}${xOf(l).toFixed(1)} ${yOf(e).toFixed(1)}`).join(' ');

  return (
    <Widget title="How H and T fill the Bloch sphere">
      <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <Segmented
          options={[
            { value: 'words', label: 'all short words' },
            { value: 'orbit', label: 'one word, repeated' },
          ]}
          value={mode}
          onChange={setMode}
        />
        {mode === 'words' && (
          <Segmented
            options={[
              { value: 'clifford', label: 'Clifford {H, S}' },
              { value: 'ht', label: 'Clifford + T {H, T}' },
            ]}
            value={set}
            onChange={setSet}
          />
        )}
        <Toggle label="auto-rotate" value={auto} onChange={setAuto} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1.25fr) minmax(250px, 1fr)', gap: 16, alignItems: 'start' }}>
        <div>
          <canvas
            ref={canvasRef}
            style={{ width: '100%', display: 'block', cursor: 'grab', touchAction: 'none' }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
          />
          <div className="faint center" style={{ fontSize: '0.78rem' }}>
            drag to rotate{mode === 'words' ? ' · click the sphere to place the green target' : ''}
          </div>
        </div>
        <div className="col" style={{ gap: 10 }}>
          {mode === 'words' ? (
            <>
              <Slider label="max word length" value={L} min={0} max={MAXLEN} step={1} onChange={setL} format={(v) => String(v)} />
              <div className="row" style={{ gap: 16 }}>
                <div>
                  <div className="mono" style={{ fontSize: '1.3rem', color: 'var(--yellow)' }}>{shown.toLocaleString()}</div>
                  <div className="faint" style={{ fontSize: '0.75rem' }}>distinct states reached</div>
                </div>
                <div>
                  <div className="mono" style={{ fontSize: '1.3rem', color: 'var(--teal)' }}>{(1 - best.fidelity).toExponential(1)}</div>
                  <div className="faint" style={{ fontSize: '0.75rem' }}>best error 1 − F for target</div>
                </div>
              </div>
              <div className="panel" style={{ padding: 8 }}>
                <div className="faint" style={{ fontSize: '0.75rem' }}>
                  shortest word reaching the best point ({word.length} gates, time order →)
                </div>
                <div className="mono" style={{ fontSize: '0.82rem', wordBreak: 'break-all', color: 'var(--text)' }}>
                  {word.length ? word.join(' ') : '(empty — the target is closest to |0⟩)'}
                </div>
              </div>
              <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => setTarget(randomDir())}>
                🎯 random target
              </button>
              <div>
                <div className="faint" style={{ fontSize: '0.75rem' }}>worst-case error ε over the whole sphere vs word length</div>
                <svg width={chartW} height={chartH} style={{ display: 'block', maxWidth: '100%' }} viewBox={`0 0 ${chartW} ${chartH}`}>
                  {[0, -1, -2, -3, -4, -5, -6].map((k) => (
                    <g key={k}>
                      <line x1={padL} x2={chartW - 8} y1={yOf(10 ** k)} y2={yOf(10 ** k)} stroke="#2a3040" />
                      <text x={padL - 4} y={yOf(10 ** k) + 3} fontSize={9} fill="#7d8597" textAnchor="end">
                        {k === 0 ? '1' : `1e${k}`}
                      </text>
                    </g>
                  ))}
                  {[0, 12, 24, 36].map((l) => (
                    <text key={l} x={xOf(l)} y={chartH - 6} fontSize={9} fill="#7d8597" textAnchor="middle">
                      {l}
                    </text>
                  ))}
                  <path d={epsPath} fill="none" stroke={set === 'ht' ? '#5cd0b3' : '#fc6255'} strokeWidth={2} />
                  <line x1={xOf(Lc)} x2={xOf(Lc)} y1={6} y2={chartH - padB} stroke="#fcd34d" strokeDasharray="3 3" />
                  <circle cx={xOf(Lc)} cy={yOf(eps[Lc])} r={3.5} fill="#fcd34d" />
                </svg>
                <div className="faint" style={{ fontSize: '0.75rem' }}>
                  {set === 'ht'
                    ? 'Log scale: a roughly straight downward line means the error shrinks exponentially with length.'
                    : 'Clifford words never get closer: the error is stuck, because only 6 states are reachable.'}
                </div>
              </div>
            </>
          ) : (
            <>
              <Slider label="repetitions k" value={orbitK} min={1} max={600} step={1} onChange={setOrbitK} format={(v) => String(v)} />
              <div className="faint" style={{ fontSize: '0.88rem' }}>
                Apply the 4-gate word <span className="mono">H T H T</span> over and over to |0⟩. Together the gates make one rotation, by an angle θ with
                cos(θ/2) = cos²(π/8) — about 62.8°, which is an <b>irrational</b> fraction of a full turn. So the state never returns to where it started. It walks around a
                circle and, given enough steps, comes arbitrarily close to <i>every</i> point on it.
              </div>
              <div className="mono faint" style={{ fontSize: '0.8rem' }}>θ ≈ {((2 * Math.acos(Math.cos(Math.PI / 8) ** 2) * 180) / Math.PI).toFixed(3)}°</div>
            </>
          )}
        </div>
      </div>
    </Widget>
  );
}

/* ----------------------------------- drawing ----------------------------------- */

function draw(
  cv: HTMLCanvasElement,
  V: { yaw: number; el: number; w: number; h: number },
  D: { mode: 'words' | 'orbit'; cloud: WordCloud; shown: number; Lc: number; target: Vec3; bestIdx: number; orbit: Vec3[] },
) {
  const ctx = cv.getContext('2d')!;
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const { w, h } = V;
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.42;
  const cyw = Math.cos(V.yaw), syw = Math.sin(V.yaw), ce = Math.cos(V.el), se = Math.sin(V.el);
  const P = (x: number, y: number, z: number): [number, number, number] => {
    const x1 = x * cyw - y * syw, y1 = x * syw + y * cyw;
    const depth = x1 * ce + z * se;
    const up = z * ce - x1 * se;
    return [cx + y1 * R, cy - up * R, depth];
  };

  // sphere body
  const g = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
  g.addColorStop(0, 'rgba(88,196,221,0.10)');
  g.addColorStop(1, 'rgba(88,196,221,0.02)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, 2 * Math.PI);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,140,170,0.45)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // great circles: equator and two meridians
  const circle = (f: (t: number) => [number, number, number], color: string) => {
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      let pen = false;
      for (let i = 0; i <= 96; i++) {
        const [x, y, z] = f((i / 96) * 2 * Math.PI);
        const [sx, sy, d] = P(x, y, z);
        const front = d >= 0;
        if ((pass === 0 && front) || (pass === 1 && !front)) {
          if (!pen) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
          pen = true;
        } else pen = false;
      }
      ctx.setLineDash(pass === 0 ? [] : [3, 4]);
      ctx.strokeStyle = color;
      ctx.globalAlpha = pass === 0 ? 0.55 : 0.22;
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  };
  circle((t) => [Math.cos(t), Math.sin(t), 0], '#58c4dd');
  circle((t) => [Math.cos(t), 0, Math.sin(t)], '#6b7385');
  circle((t) => [0, Math.cos(t), Math.sin(t)], '#6b7385');

  // axis labels
  const label = (v: Vec3, s: string) => {
    const [sx, sy, d] = P(v[0] * 1.13, v[1] * 1.13, v[2] * 1.13);
    ctx.globalAlpha = d >= -0.2 ? 0.9 : 0.35;
    ctx.fillStyle = '#c9d1e0';
    ctx.font = '12px serif';
    ctx.textAlign = 'center';
    ctx.fillText(s, sx, sy + 4);
    ctx.globalAlpha = 1;
  };
  label([0, 0, 1], '|0⟩');
  label([0, 0, -1], '|1⟩');
  label([1, 0, 0], '|+⟩');
  label([-1, 0, 0], '|−⟩');
  label([0, 1, 0], '|+i⟩');
  label([0, -1, 0], '|−i⟩');

  if (D.mode === 'words') {
    const { cloud, shown, Lc } = D;
    const big = shown < 400;
    // back points first, then front
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < shown; i++) {
        const [sx, sy, d] = P(cloud.xyz[3 * i], cloud.xyz[3 * i + 1], cloud.xyz[3 * i + 2]);
        const front = d >= 0;
        if ((pass === 0) === front) continue;
        const [r, gg, b] = lenColor(cloud.len[i], Math.max(6, Lc));
        ctx.fillStyle = `rgba(${r},${gg},${b},${front ? 0.95 : 0.22})`;
        const s = big ? (front ? 5 : 3.5) : shown < 5000 ? 2.6 : 1.8;
        if (big) {
          ctx.beginPath();
          ctx.arc(sx, sy, s / 1.6, 0, 2 * Math.PI);
          ctx.fill();
        } else ctx.fillRect(sx - s / 2, sy - s / 2, s, s);
      }
    }
    // target + best approximation
    const tn = Math.hypot(...D.target);
    const t: Vec3 = [D.target[0] / tn, D.target[1] / tn, D.target[2] / tn];
    const [tx, ty, td] = P(...t);
    const bi = D.bestIdx;
    const [bx, by, bd] = P(cloud.xyz[3 * bi], cloud.xyz[3 * bi + 1], cloud.xyz[3 * bi + 2]);
    ctx.globalAlpha = Math.min(td, bd) >= 0 ? 1 : 0.4;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.globalAlpha = td >= 0 ? 1 : 0.45;
    ctx.strokeStyle = '#83c167';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(tx, ty, 8, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.globalAlpha = bd >= 0 ? 1 : 0.45;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(bx, by, 3.5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.globalAlpha = 1;
  } else {
    const pts = D.orbit;
    for (let pass = 0; pass < 2; pass++) {
      pts.forEach((v, i) => {
        const [sx, sy, d] = P(...v);
        const front = d >= 0;
        if ((pass === 0) === front) return;
        const [r, gg, b] = lenColor(i, Math.max(20, pts.length - 1));
        ctx.fillStyle = `rgba(${r},${gg},${b},${front ? 0.95 : 0.3})`;
        ctx.beginPath();
        ctx.arc(sx, sy, i === pts.length - 1 ? 5 : pts.length > 200 ? 2 : 3, 0, 2 * Math.PI);
        ctx.fill();
      });
    }
    // connect the last few steps to show the stride
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    pts.slice(-6).forEach((v, i) => {
      const [sx, sy] = P(...v);
      if (i) ctx.lineTo(sx, sy);
      else ctx.moveTo(sx, sy);
    });
    ctx.stroke();
  }
}
