import React, { useRef, useState } from 'react';
import { Widget, Segmented } from '../../../components/ui';
import { mulberry32 } from '../../../engine/qsim';
import { useAnimCanvas, easeInOut, clamp, SANS, SERIF } from './anim';
import { DensityHeatmap } from './rho';

type Box = 'A' | 'B' | 'C';
type Basis = 'Z' | 'X' | 'Y';

const BOXES: Record<Box, { name: string; desc: string; color: string; members: [number, number, number][] }> = {
  A: { name: 'Box A', desc: 'always prepares |+⟩', color: '#58c4dd', members: [[1, 0, 0]] },
  B: { name: 'Box B', desc: 'coin flip: |0⟩ or |1⟩', color: '#fcd34d', members: [[0, 0, 1], [0, 0, -1]] },
  C: { name: 'Box C', desc: 'coin flip: |+⟩ or |−⟩', color: '#e07ab6', members: [[1, 0, 0], [-1, 0, 0]] },
};
const AXIS: Record<Basis, [number, number, number]> = { Z: [0, 0, 1], X: [1, 0, 0], Y: [0, 1, 0] };
const OUT: Record<Basis, [string, string]> = { Z: ['0', '1'], X: ['+', '−'], Y: ['+i', '−i'] };

interface Particle {
  t: number;
  delay: number;
  out: 0 | 1;
  color: string;
}

/** Ensembles vs superpositions: fire qubits from three preparation boxes and measure in Z, X or Y. */
export function EnsembleLab({ hideRho = false }: { hideRho?: boolean }) {
  const [box, setBox] = useState<Box>('A');
  const [basis, setBasis] = useState<Basis>('Z');
  const [counts, setCounts] = useState<Record<string, [number, number]>>({});
  const [showRho, setShowRho] = useState(false);
  const parts = useRef<Particle[]>([]);
  const rng = useRef(mulberry32(2024));
  const bins = useRef<[number, number]>([0, 0]);
  const key = `${box}${basis}`;
  const cur = counts[key] ?? [0, 0];
  bins.current = cur;

  const fire = (n: number) => {
    const b = BOXES[box];
    const ax = AXIS[basis];
    const add: [number, number] = [0, 0];
    for (let i = 0; i < n; i++) {
      const r = b.members[Math.floor(rng.current() * b.members.length)];
      const p0 = (1 + r[0] * ax[0] + r[1] * ax[1] + r[2] * ax[2]) / 2;
      const out: 0 | 1 = rng.current() < p0 ? 0 : 1;
      add[out]++;
      parts.current.push({ t: 0, delay: n === 1 ? 0 : (i / n) * 1.4, out, color: b.color });
    }
    // counts are committed immediately; the animation is cosmetic
    setCounts((c) => {
      const old = c[key] ?? [0, 0];
      return { ...c, [key]: [old[0] + add[0], old[1] + add[1]] };
    });
  };

  const ref = useAnimCanvas(190, (ctx, w, h, dt) => {
    const srcX = 70, devX = w * 0.5, binX = w - 120;
    const midY = h / 2;
    // source box
    const col = BOXES[box].color;
    ctx.fillStyle = '#161a24';
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    roundRect(ctx, srcX - 46, midY - 34, 92, 68, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.font = `600 15px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.fillText(BOXES[box].name, srcX, midY - 4);
    ctx.font = `11px ${SANS}`;
    ctx.fillStyle = '#9aa3b5';
    ctx.fillText('?', srcX, midY + 16);
    // beam line
    ctx.strokeStyle = '#2a3142';
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(srcX + 46, midY);
    ctx.lineTo(devX - 40, midY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(devX + 40, midY);
    ctx.lineTo(binX - 10, midY - 50);
    ctx.moveTo(devX + 40, midY);
    ctx.lineTo(binX - 10, midY + 50);
    ctx.stroke();
    ctx.setLineDash([]);
    // measuring device
    ctx.fillStyle = '#1d2230';
    ctx.strokeStyle = '#cfd6e4';
    ctx.lineWidth = 1.5;
    roundRect(ctx, devX - 40, midY - 30, 80, 60, 8);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(devX, midY + 12, 18, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    ctx.fillStyle = '#fcd34d';
    ctx.font = `700 14px ${SERIF}`;
    ctx.fillText(`measure ${basis}`, devX, midY - 10);
    // bins
    const [n0, n1] = bins.current;
    const tot = Math.max(1, n0 + n1);
    [0, 1].forEach((k) => {
      const y = k === 0 ? midY - 50 : midY + 50;
      const frac = (k === 0 ? n0 : n1) / tot;
      ctx.fillStyle = '#141821';
      ctx.strokeStyle = '#3a4458';
      roundRect(ctx, binX - 10, y - 16, 120, 32, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = k === 0 ? 'rgba(88,196,221,.55)' : 'rgba(252,98,85,.55)';
      roundRect(ctx, binX - 8, y - 14, 116 * frac, 28, 5);
      ctx.fill();
      ctx.fillStyle = '#e9ecf2';
      ctx.font = `600 13px ${SERIF}`;
      ctx.textAlign = 'left';
      ctx.fillText(`|${OUT[basis][k]}⟩  ${k === 0 ? n0 : n1}`, binX, y + 5);
      ctx.textAlign = 'center';
    });
    // particles
    const ps = parts.current;
    for (const p of ps) {
      if (p.delay > 0) {
        p.delay -= dt;
        continue;
      }
      p.t += dt * 1.1;
      const t = clamp(p.t);
      let x: number, y: number;
      if (t < 0.5) {
        const u = easeInOut(t / 0.5);
        x = srcX + 46 + (devX - srcX - 46) * u;
        y = midY;
      } else {
        const u = easeInOut((t - 0.5) / 0.5);
        x = devX + (binX - devX) * u;
        y = midY + (p.out === 0 ? -50 : 50) * u;
      }
      const color = t < 0.5 ? p.color : p.out === 0 ? '#58c4dd' : '#fc6255';
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    parts.current = ps.filter((p) => p.t < 1);
  });

  const rhoOf = (b: Box) => {
    const m = BOXES[b].members;
    const r = [0, 1, 2].map((i) => m.reduce((s, v) => s + v[i], 0) / m.length) as [number, number, number];
    return (i: number, j: number) => {
      if (i === j) return { re: i === 0 ? (1 + r[2]) / 2 : (1 - r[2]) / 2, im: 0 };
      return i === 0 ? { re: r[0] / 2, im: -r[1] / 2 } : { re: r[0] / 2, im: r[1] / 2 };
    };
  };

  return (
    <Widget title="The ensemble lab: three boxes, three measurements">
      <div className="row" style={{ gap: 14, flexWrap: 'wrap', marginBottom: 8 }}>
        <div>
          <div className="faint" style={{ fontSize: '0.78rem' }}>Source</div>
          <Segmented
            value={box}
            onChange={setBox}
            options={(['A', 'B', 'C'] as Box[]).map((b) => ({ value: b, label: <span style={{ color: b === box ? undefined : BOXES[b].color }}>{BOXES[b].name}</span> }))}
          />
        </div>
        <div>
          <div className="faint" style={{ fontSize: '0.78rem' }}>Measure along</div>
          <Segmented value={basis} onChange={setBasis} options={(['Z', 'X', 'Y'] as Basis[]).map((b) => ({ value: b, label: `${b}` }))} />
        </div>
        <div className="row" style={{ gap: 6, marginTop: 14 }}>
          <button className="btn small" onClick={() => fire(1)}>Fire 1</button>
          <button className="btn small primary" onClick={() => fire(100)}>Fire 100</button>
          <button className="btn small ghost" onClick={() => setCounts({})}>Reset all</button>
        </div>
      </div>
      <div className="faint" style={{ fontSize: '0.85rem', marginBottom: 4 }}>
        {BOXES[box].name} {BOXES[box].desc}. You only see the measurement results.
      </div>
      <div style={{ width: '100%' }}>
        <canvas ref={ref} style={{ display: 'block' }} />
      </div>
      <div style={{ overflowX: 'auto', marginTop: 8 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.85rem' }}>
          <thead>
            <tr>
              <th style={th}></th>
              {(['Z', 'X', 'Y'] as Basis[]).map((b) => (
                <th key={b} style={th}>
                  measure {b}: fraction |{OUT[b][0]}⟩
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(['A', 'B', 'C'] as Box[]).map((b) => (
              <tr key={b}>
                <td style={{ ...td, color: BOXES[b].color, fontWeight: 600 }}>{BOXES[b].name}</td>
                {(['Z', 'X', 'Y'] as Basis[]).map((m) => {
                  const c = counts[`${b}${m}`];
                  const n = c ? c[0] + c[1] : 0;
                  return (
                    <td key={m} style={{ ...td, background: b === box && m === basis ? 'rgba(88,196,221,.08)' : undefined }} className="mono">
                      {n ? `${((c![0] / n) * 100).toFixed(0)}%  (n=${n})` : '—'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!hideRho && (
        <div style={{ marginTop: 10 }}>
          <button className="btn small" onClick={() => setShowRho((s) => !s)}>
            {showRho ? 'Hide' : 'Show'} each box's density matrix
          </button>
          {showRho && (
            <div className="row" style={{ gap: 18, marginTop: 8, flexWrap: 'wrap' }}>
              {(['A', 'B', 'C'] as Box[]).map((b) => (
                <DensityHeatmap key={b} get={rhoOf(b)} dim={2} size={130} title={`${BOXES[b].name}: ρ`} labels={['0', '1']} />
              ))}
              <div className="faint" style={{ fontSize: '0.82rem', maxWidth: 260 }}>
                Square area ∝ |ρ<sub>ij</sub>|, colour = phase. Box A has <b>off-diagonal</b> entries (coherence). Boxes B and C have identical matrices — so no
                experiment whatsoever can tell them apart.
              </div>
            </div>
          )}
        </div>
      )}
    </Widget>
  );
}

const th: React.CSSProperties = { textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--border)', color: 'var(--text-dim)', fontWeight: 500 };
const td: React.CSSProperties = { padding: '4px 8px', borderBottom: '1px solid #20263a' };

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, Math.abs(w) / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}
