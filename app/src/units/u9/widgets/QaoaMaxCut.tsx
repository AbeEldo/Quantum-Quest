import React, { useMemo, useState } from 'react';
import { Widget, Segmented, useCanvas, fmtPi } from '../../../components/ui';
import { ProbBars, pct } from './viz';
import { qaoaState, cutValue, maxCut, sampleFrom, bitstr, type Graph } from '../algos';

const GRAPHS: { id: string; name: string; g: Graph; pos: [number, number][] }[] = [
  { id: 'tri', name: 'triangle', g: { n: 3, edges: [[0, 1], [1, 2], [2, 0]] }, pos: [[0.5, 0.12], [0.86, 0.82], [0.14, 0.82]] },
  { id: 'sq', name: 'square', g: { n: 4, edges: [[0, 1], [1, 2], [2, 3], [3, 0]] }, pos: [[0.18, 0.18], [0.82, 0.18], [0.82, 0.82], [0.18, 0.82]] },
  {
    id: 'house', name: 'house', g: { n: 5, edges: [[0, 1], [0, 4], [1, 2], [2, 3], [3, 4], [1, 4]] },
    pos: [[0.5, 0.08], [0.85, 0.42], [0.82, 0.9], [0.18, 0.9], [0.15, 0.42]],
  },
];

const G_MAX = Math.PI, B_MAX = Math.PI / 2;

/** QAOA at depth p = 1 on tiny Max-Cut instances: the (γ, β) landscape, the output distribution, and sampled cuts. */
export function QaoaMaxCut() {
  const [gid, setGid] = useState('sq');
  const G = GRAPHS.find((x) => x.id === gid)!;
  const [gamma, setGamma] = useState(0.6);
  const [beta, setBeta] = useState(0.4);
  const [sample, setSample] = useState<number | null>(null);
  const best = maxCut(G.g);

  const grid = useMemo(() => {
    const nx = 60, ny = 30;
    const vals: number[][] = [];
    let hi = 0, arg: [number, number] = [0, 0];
    for (let i = 0; i < nx; i++) {
      const row: number[] = [];
      for (let j = 0; j < ny; j++) {
        const gm = ((i + 0.5) / nx) * G_MAX, bt = ((j + 0.5) / ny) * B_MAX;
        const p = qaoaState(G.g, [gm], [bt]).probabilities();
        const e = p.reduce((a, pz, z) => a + pz * cutValue(G.g, z), 0);
        row.push(e);
        if (e > hi) { hi = e; arg = [gm, bt]; }
      }
      vals.push(row);
    }
    return { vals, nx, ny, hi, arg };
  }, [G]);

  const probs = useMemo(() => qaoaState(G.g, [gamma], [beta]).probabilities(), [G, gamma, beta]);
  const expCut = probs.reduce((a, p, z) => a + p * cutValue(G.g, z), 0);
  const pOpt = probs.reduce((a, p, z) => a + (cutValue(G.g, z) === best ? p : 0), 0);
  const shown = sample ?? probs.indexOf(Math.max(...probs));

  const { ref } = useCanvas(
    (ctx, w, h) => {
      const { vals, nx, ny } = grid;
      const lo = G.g.edges.length / 2 - 0.5, hi = best;
      for (let i = 0; i < nx; i++)
        for (let j = 0; j < ny; j++) {
          const t = Math.max(0, Math.min(1, (vals[i][j] - lo) / (hi - lo)));
          ctx.fillStyle = `rgb(${Math.round(20 + 230 * t)}, ${Math.round(30 + 180 * t)}, ${Math.round(120 - 80 * t)})`;
          ctx.fillRect((i / nx) * w, h - ((j + 1) / ny) * h, w / nx + 1, h / ny + 1);
        }
      const x = (gamma / G_MAX) * w, y = h - (beta / B_MAX) * h;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = '11px sans-serif';
      ctx.fillText('γ →', w - 26, h - 6);
      ctx.fillText('β ↑', 4, 12);
    },
    [grid, gamma, beta],
    { height: 170 },
  );

  const onCanvas = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setGamma(((e.clientX - r.left) / r.width) * G_MAX);
    setBeta((1 - (e.clientY - r.top) / r.height) * B_MAX);
    setSample(null);
  };

  const bit = (z: number, v: number) => (z >> (G.g.n - 1 - v)) & 1;
  const S = 190;
  return (
    <Widget title="QAOA (p = 1) on a tiny Max-Cut">
      <div className="row" style={{ gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <Segmented options={GRAPHS.map((x) => ({ value: x.id, label: x.name }))} value={gid} onChange={(x) => { setGid(x); setSample(null); }} />
        <span className="faint" style={{ fontSize: '0.85rem' }}>
          Goal: colour vertices in two colours so as many edges as possible join different colours (max = {best}).
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `${S}px minmax(260px, 1fr)`, gap: 16, alignItems: 'start' }}>
        <div>
          <svg width={S} height={S} style={{ display: 'block' }}>
            {G.g.edges.map(([u, v], k) => {
              const cut = bit(shown, u) !== bit(shown, v);
              return (
                <line key={k} x1={G.pos[u][0] * S} y1={G.pos[u][1] * S} x2={G.pos[v][0] * S} y2={G.pos[v][1] * S} stroke={cut ? '#fcd34d' : '#4a5368'} strokeWidth={cut ? 3.5 : 2} strokeDasharray={cut ? undefined : '5 4'} />
              );
            })}
            {G.pos.map(([x, y], v) => (
              <g key={v}>
                <circle cx={x * S} cy={y * S} r={14} fill={bit(shown, v) ? '#e07ab6' : '#58c4dd'} stroke="#0b0d12" strokeWidth={2} />
                <text x={x * S} y={y * S + 4} fontSize={12} textAnchor="middle" fill="#0b0d12" fontWeight={700}>{v}</text>
              </g>
            ))}
          </svg>
          <div className="mono" style={{ fontSize: '0.85rem', textAlign: 'center' }}>
            {sample === null ? 'most likely' : 'sampled'}: {bitstr(shown, G.g.n)} → cuts {cutValue(G.g, shown)}/{G.g.edges.length}
          </div>
          <button className="btn small primary" style={{ width: '100%', marginTop: 6 }} onClick={() => setSample(sampleFrom(probs))}>
            ⚛ measure once
          </button>
        </div>
        <div>
          <div className="faint" style={{ fontSize: '0.78rem' }}>Expected cut ⟨C⟩ over (γ, β): bright = better. Click to choose angles.</div>
          <div className="canvas-wrap" style={{ borderRadius: 8, overflow: 'hidden', cursor: 'crosshair' }}>
            <canvas ref={ref} onClick={onCanvas} />
          </div>
          <div className="row" style={{ gap: 12, marginTop: 6, fontSize: '0.88rem', flexWrap: 'wrap' }}>
            <span className="mono">γ = {fmtPi(gamma)}, β = {fmtPi(beta)}</span>
            <span>
              ⟨C⟩ = <b style={{ color: 'var(--yellow)' }}>{expCut.toFixed(3)}</b> (ratio {(expCut / best).toFixed(3)})
            </span>
            <span>P(optimal cut) = {pct(pOpt)}</span>
            <button className="btn small ghost" onClick={() => { setGamma(grid.arg[0]); setBeta(grid.arg[1]); setSample(null); }}>
              jump to best angles
            </button>
          </div>
        </div>
      </div>
      <div className="faint" style={{ fontSize: '0.78rem', marginTop: 10 }}>Output distribution over all colourings (bars of optimal cuts in yellow)</div>
      <ProbBars bars={probs.map((p, z) => ({ value: p, label: bitstr(z, G.g.n), highlight: cutValue(G.g, z) === best }))} height={140} labelEvery={G.g.n > 4 ? 2 : 1} />
    </Widget>
  );
}
