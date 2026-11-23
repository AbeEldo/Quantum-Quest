import React, { useEffect, useRef, useState } from 'react';
import { Widget, Slider, Segmented, useAnimationFrame } from '../../../components/ui';
import { exactDistribution, detectorsOf, simulateAtom, type Magnet, type Port } from '../games/spinEngine';
import { useInView } from '../../u2/widgets/canvas';

const VB_W = 840;
const VB_H = 300;
const CY = 150;
const BOX_W = 104;
const BOX_H = 74;

type Axis = 'z' | 'x' | 'y' | 'θ';
interface Analyzer {
  axis: Axis;
  theta: number; // degrees (for θ)
  pass: Port;
}

const toMagnet = (a: Analyzer): Magnet => ({
  theta: a.axis === 'z' ? 0 : a.axis === 'x' ? 90 : a.axis === 'θ' ? a.theta : 0,
  y: a.axis === 'y',
  pass: a.pass,
});

interface Flying {
  id: number;
  pts: [number, number][];
  cum: number[];
  d: number;
  detector: number;
  colors: string[]; // colour per segment
}

let FID = 1;
const UP = '#fcd34d';
const DOWN = '#58c4dd';
const NEUTRAL = '#c9d1e0';

const PRESETS: Record<string, Analyzer[]> = {
  'z → z': [
    { axis: 'z', theta: 0, pass: '+' },
    { axis: 'z', theta: 0, pass: '+' },
  ],
  'z → x': [
    { axis: 'z', theta: 0, pass: '+' },
    { axis: 'x', theta: 90, pass: '+' },
  ],
  'z → x → z': [
    { axis: 'z', theta: 0, pass: '+' },
    { axis: 'x', theta: 90, pass: '+' },
    { axis: 'z', theta: 0, pass: '+' },
  ],
  'z → tilted': [
    { axis: 'z', theta: 0, pass: '+' },
    { axis: 'θ', theta: 60, pass: '+' },
  ],
};

/**
 * A chain of up to three Stern–Gerlach analyzers. Each non-final analyzer passes one output (the other is blocked);
 * the last analyzer feeds two counters. Atoms come from an unpolarized oven.
 */
export function SGChain({ preset = 'z → x → z', allowEdit = true, title = 'Sequential Stern–Gerlach analyzers' }: { preset?: string; allowEdit?: boolean; title?: string }) {
  const [an, setAn] = useState<Analyzer[]>(() => PRESETS[preset] ?? PRESETS['z → x → z']);
  const [rate, setRate] = useState(8);
  const [running, setRunning] = useState(true);
  const [counts, setCounts] = useState<number[]>([]);
  const [emitted, setEmitted] = useState(0);
  const fly = useRef<Flying[]>([]);
  const acc = useRef(0);
  const [, tick] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const inView = useInView(svgRef);

  const magnets = an.map(toMagnet);
  const dets = detectorsOf(magnets);
  const exact = exactDistribution({ kind: 'oven' }, magnets);

  useEffect(() => {
    fly.current = [];
    setCounts(new Array(dets.length).fill(0));
    setEmitted(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(an)]);

  // layout
  const n = an.length;
  const x0 = 70;
  const span = VB_W - 200 - x0;
  const bx = an.map((_, i) => x0 + 70 + (span * (i + 0.5)) / n); // box centre x
  const inPt = (i: number): [number, number] => [bx[i] - BOX_W / 2, CY];
  const outPt = (i: number, p: Port): [number, number] => [bx[i] + BOX_W / 2, CY + (p === '+' ? -20 : 20)];
  const blockPt = (i: number, p: Port): [number, number] => [bx[i] + BOX_W / 2 + 34, CY + (p === '+' ? -62 : 62)];
  const finalPt = (p: Port): [number, number] => [VB_W - 70, CY + (p === '+' ? -64 : 64)];

  const spawn = () => {
    const res = simulateAtom({ kind: 'oven' }, magnets, Math.random);
    const pts: [number, number][] = [[x0, CY]];
    const colors: string[] = [];
    let col = NEUTRAL;
    for (let i = 0; i < res.ports.length; i++) {
      const p = res.ports[i];
      pts.push(inPt(i));
      colors.push(col);
      pts.push(outPt(i, p));
      colors.push(col); // inside the magnet: unknown until it exits
      col = p === '+' ? UP : DOWN;
      const last = i === n - 1;
      if (last) {
        pts.push(finalPt(p));
        colors.push(col);
      } else if (p !== magnets[i].pass) {
        pts.push(blockPt(i, p));
        colors.push(col);
      }
    }
    const cum = [0];
    for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    fly.current.push({ id: FID++, pts, cum, d: 0, detector: res.detector, colors });
  };

  useAnimationFrame((dt) => {
    let e = 0;
    if (running) {
      acc.current += rate * dt;
      while (acc.current >= 1) {
        acc.current -= 1;
        spawn();
        e++;
      }
    }
    const arrived: number[] = [];
    for (const f of fly.current) {
      f.d += 300 * dt;
      if (f.d >= f.cum[f.cum.length - 1]) arrived.push(f.detector);
    }
    if (arrived.length) {
      fly.current = fly.current.filter((f) => f.d < f.cum[f.cum.length - 1]);
      setCounts((c) => {
        const nc = c.length === dets.length ? [...c] : new Array(dets.length).fill(0);
        for (const k of arrived) nc[k]++;
        return nc;
      });
    }
    if (e) setEmitted((x) => x + e);
    tick((k) => (k + 1) % 1000000);
  }, inView);

  const pos = (f: Flying): { x: number; y: number; col: string } => {
    let k = 1;
    while (k < f.cum.length - 1 && f.cum[k] < f.d) k++;
    const seg = f.cum[k] - f.cum[k - 1] || 1;
    const s = Math.min(1, Math.max(0, (f.d - f.cum[k - 1]) / seg));
    const [ax, ay] = f.pts[k - 1], [bx2, by] = f.pts[k];
    return { x: ax + (bx2 - ax) * s, y: ay + (by - ay) * s, col: f.colors[k - 1] ?? NEUTRAL };
  };

  const update = (i: number, patch: Partial<Analyzer>) => setAn((a) => a.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const total = counts.reduce((s, v) => s + v, 0);
  const detLabel = (d: { magnet: number; port: Port }) => {
    const a = an[d.magnet];
    const ax = a.axis === 'θ' ? `${a.theta}°` : a.axis;
    return `${ax}${d.port}`;
  };
  const angleOf = (a: Analyzer) => (a.axis === 'z' ? 0 : a.axis === 'x' ? 90 : a.axis === 'θ' ? a.theta : 0);

  return (
    <Widget title={title}>
      <svg ref={svgRef} viewBox={`0 0 ${VB_W} ${VB_H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <rect x={0} y={0} width={VB_W} height={VB_H} rx={10} fill="#0a0d14" />
        {/* oven */}
        <rect x={20} y={CY - 20} width={36} height={40} rx={5} fill="#3a2a22" stroke="#ff8c42" />
        <text x={14} y={CY + 38} fill="#9aa3b5" fontSize={11}>
          oven
        </text>
        {/* static beam lines */}
        {an.map((a, i) => {
          const from: [number, number] = i === 0 ? [x0, CY] : outPt(i - 1, an[i - 1].pass);
          const to = inPt(i);
          return <line key={`b${i}`} x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke="#2a3142" strokeWidth={3} />;
        })}
        {an.map((a, i) => {
          const last = i === n - 1;
          return (['+', '-'] as Port[]).map((p) => {
            const o = outPt(i, p);
            if (last) {
              const f = finalPt(p);
              return <line key={`o${i}${p}`} x1={o[0]} y1={o[1]} x2={f[0]} y2={f[1]} stroke="#2a3142" strokeWidth={3} />;
            }
            if (p !== a.pass) {
              const b = blockPt(i, p);
              return <line key={`o${i}${p}`} x1={o[0]} y1={o[1]} x2={b[0]} y2={b[1]} stroke="#2a3142" strokeWidth={3} />;
            }
            return null;
          });
        })}
        {/* analyzers */}
        {an.map((a, i) => {
          const ang = angleOf(a);
          const isY = a.axis === 'y';
          return (
            <g key={`a${i}`}>
              <rect x={bx[i] - BOX_W / 2} y={CY - BOX_H / 2} width={BOX_W} height={BOX_H} rx={10} fill="#161a24" stroke="#fcd34d" strokeWidth={1.5} />
              {/* axis arrow in the x–z plane: up = +z, right = +x (as seen looking along the beam) */}
              {isY ? (
                <g>
                  <circle cx={bx[i]} cy={CY - 4} r={9} fill="none" stroke="#e07ab6" strokeWidth={2} />
                  <circle cx={bx[i]} cy={CY - 4} r={2.5} fill="#e07ab6" />
                </g>
              ) : (
                <g transform={`rotate(${ang} ${bx[i]} ${CY - 4})`}>
                  <line x1={bx[i]} y1={CY + 14} x2={bx[i]} y2={CY - 22} stroke="#e07ab6" strokeWidth={2.5} />
                  <polygon points={`${bx[i]},${CY - 28} ${bx[i] - 5},${CY - 19} ${bx[i] + 5},${CY - 19}`} fill="#e07ab6" />
                </g>
              )}
              <text x={bx[i]} y={CY + 30} textAnchor="middle" fill="#e9ecf2" fontSize={13} fontWeight={700}>
                SG-{a.axis === 'θ' ? `${a.theta}°` : a.axis}
              </text>
              <text x={bx[i] + BOX_W / 2 + 4} y={CY - 24} fill={UP} fontSize={12}>
                +
              </text>
              <text x={bx[i] + BOX_W / 2 + 4} y={CY + 32} fill={DOWN} fontSize={12}>
                −
              </text>
            </g>
          );
        })}
        {/* blocks and counters */}
        {dets.map((d, k) => {
          const last = d.magnet === n - 1;
          const [x, y] = last ? finalPt(d.port) : blockPt(d.magnet, d.port);
          const cnt = counts[k] ?? 0;
          return (
            <g key={`d${k}`}>
              {last ? (
                <rect x={x - 4} y={y - 18} width={52} height={36} rx={7} fill="#1d2230" stroke={d.port === '+' ? UP : DOWN} strokeWidth={2} />
              ) : (
                <rect x={x - 6} y={y - 12} width={12} height={24} rx={2} fill="#3a2020" stroke="#fc6255" />
              )}
              <text x={last ? x + 22 : x} y={last ? y + 5 : y + (d.port === '+' ? -18 : 28)} textAnchor="middle" fill="#e9ecf2" fontSize={13} fontWeight={700}>
                {cnt}
              </text>
              <text x={last ? x + 22 : x + 12} y={last ? y + 32 : y + 4} textAnchor={last ? 'middle' : 'start'} fill="#9aa3b5" fontSize={10}>
                {last ? `${detLabel(d)} · exp ${(exact[k] * 100).toFixed(1)}%` : 'blocked'}
              </text>
            </g>
          );
        })}
        {/* atoms */}
        {fly.current.map((f) => {
          const p = pos(f);
          return <circle key={f.id} cx={p.x} cy={p.y} r={3} fill={p.col} />;
        })}
        <text x={14} y={22} fill="#9aa3b5" fontSize={12}>
          emitted {emitted} · arrow = analyzer direction (up = +z, right = +x, ⊙ = +y) · colour = last result
        </text>
      </svg>

      {allowEdit && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(230px, 1fr))`, gap: 12, marginTop: 10 }}>
          {an.map((a, i) => (
            <div key={i} className="panel" style={{ padding: 10 }}>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                <b>Analyzer {i + 1}</b>
                {n > 1 && (
                  <button className="btn small ghost" onClick={() => setAn((x) => x.filter((_, k) => k !== i))}>
                    ✕
                  </button>
                )}
              </div>
              <Segmented
                options={(['z', 'x', 'y', 'θ'] as Axis[]).map((v) => ({ value: v, label: v === 'θ' ? 'tilt θ' : v }))}
                value={a.axis}
                onChange={(v) => update(i, { axis: v })}
              />
              {a.axis === 'θ' && <Slider label="θ from z" value={a.theta} min={0} max={180} step={5} onChange={(v) => update(i, { theta: v })} format={(v) => `${v}°`} />}
              {i < n - 1 && (
                <div className="row" style={{ gap: 6, marginTop: 6 }}>
                  <span className="faint" style={{ fontSize: '0.85rem' }}>pass:</span>
                  <Segmented
                    options={[
                      { value: '+' as Port, label: '+ port' },
                      { value: '-' as Port, label: '− port' },
                    ]}
                    value={a.pass}
                    onChange={(v) => update(i, { pass: v })}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        {allowEdit && n < 3 && (
          <button className="btn small" onClick={() => setAn((x) => [...x, { axis: 'z', theta: 0, pass: '+' }])}>
            + analyzer
          </button>
        )}
        {allowEdit &&
          Object.keys(PRESETS).map((k) => (
            <button key={k} className="btn small ghost" onClick={() => setAn(PRESETS[k])}>
              {k}
            </button>
          ))}
        <div style={{ minWidth: 200 }}>
          <Slider label="atoms/s" value={rate} min={1} max={40} step={1} onChange={setRate} format={(v) => v.toFixed(0)} />
        </div>
        <button className="btn small" onClick={() => setRunning((r) => !r)}>
          {running ? '⏸ Pause' : '▶ Run'}
        </button>
      </div>
      <div className="row" style={{ gap: 16, flexWrap: 'wrap', marginTop: 8, fontSize: '0.88rem' }}>
        {dets.map((d, k) => (
          <span key={k} className="mono">
            {d.magnet === n - 1 ? detLabel(d) : `blocked after #${d.magnet + 1}`}: {counts[k] ?? 0}
            <span className="faint"> ({total ? ((100 * (counts[k] ?? 0)) / total).toFixed(1) : '—'}% vs {(exact[k] * 100).toFixed(1)}%)</span>
          </span>
        ))}
      </div>
    </Widget>
  );
}
