import React, { useMemo, useRef, useState } from 'react';
import { Widget, Slider, Segmented, Tex, fmtPi, useCanvas } from '../../../components/ui';
import { C, c, abs2, conj, mul, add, sub, scale, phaseRGB } from '../../../engine/complex';
import { blochToAmps } from '../../../engine/qsim';
import { MiniBloch } from '../../../widgets/MiniBloch';
import { BlochSphere, vecFromAngles, anglesFromVec } from '../../../widgets/BlochSphere';
import { PhaseLegend } from '../../../widgets/AmplitudeView';
import { AmpGrid } from './parts';
import { kronVec, reducedBloch2 } from '../lib/bell';

type Copier = 'Z' | 'X';
const S2 = Math.SQRT1_2;

/** Output of a "copier" acting on |ψ⟩|0⟩. Z-copier = CNOT; X-copier = (H⊗H)·CNOT·(H⊗I). */
export function copierOutput(psi: [C, C], kind: Copier): C[] {
  const [al, be] = psi;
  if (kind === 'Z') return [al, c(0), c(0), be];
  const a = scale(add(al, be), S2); // ⟨+|ψ⟩
  const b = scale(sub(al, be), S2); // ⟨−|ψ⟩
  const p = scale(add(a, b), 0.5), m = scale(sub(a, b), 0.5);
  return [p, m, m, p];
}

function inner(u: C[], v: C[]): C {
  return u.reduce((acc, x, i) => add(acc, mul(conj(x), v[i])), c(0));
}

export function cloneFidelities(theta: number, phi: number, kind: Copier) {
  const psi = blochToAmps(theta, phi);
  const out = copierOutput(psi, kind);
  const target = kronVec(psi, psi);
  const joint = abs2(inner(target, out));
  const rv = vecFromAngles(theta, phi);
  const [rA, rB] = reducedBloch2(out);
  const single = (1 + rv[0] * rB[0] + rv[1] * rB[1] + rv[2] * rB[2]) / 2;
  return { psi, out, target, joint, single, rA, rB };
}

/** Heat-map of the joint copy fidelity over the whole Bloch sphere (φ across, θ down). Click to pick a state. */
function FidelityMap({ kind, theta, phi, onPick }: { kind: Copier; theta: number; phi: number; onPick: (t: number, p: number) => void }) {
  const H = 150;
  const { ref } = useCanvas(
    (ctx, w, h) => {
      const nx = 120, ny = 60;
      const img = ctx.createImageData(nx, ny);
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++) {
          const t = ((j + 0.5) / ny) * Math.PI;
          const p = ((i + 0.5) / nx) * 2 * Math.PI;
          const { joint } = cloneFidelities(t, p, kind);
          // dark → pink → yellow ramp
          const v = joint;
          const r = 20 + 235 * Math.min(1, v * 1.4);
          const g = 18 + 200 * Math.max(0, v - 0.45) * 1.8;
          const b = 40 + 120 * Math.sin(Math.PI * Math.min(1, v));
          const k = (j * nx + i) * 4;
          img.data[k] = r;
          img.data[k + 1] = Math.min(255, g);
          img.data[k + 2] = b;
          img.data[k + 3] = 255;
        }
      const off = document.createElement('canvas');
      off.width = nx;
      off.height = ny;
      off.getContext('2d')!.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(off, 0, 0, w, h);
      // marker
      const x = (phi / (2 * Math.PI)) * w, y = (theta / Math.PI) * h;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '10px Consolas, monospace';
      ctx.fillText('|0⟩ (north pole)', 4, 11);
      ctx.fillText('|1⟩ (south pole)', 4, h - 4);
      ctx.fillText('equator', w - 52, h / 2 + 3);
      // phase strip legend on top edge
      for (let i = 0; i < w; i += 2) {
        const [r, g, b] = phaseRGB((i / w) * 2 * Math.PI);
        ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
        ctx.fillRect(i, h - 3, 2, 3);
      }
    },
    [kind, theta, phi],
    { height: H },
  );
  return (
    <div className="canvas-wrap" style={{ cursor: 'crosshair' }}>
      <canvas
        ref={ref}
        onPointerDown={(e) => {
          const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
          const p = ((e.clientX - r.left) / r.width) * 2 * Math.PI;
          const t = ((e.clientY - r.top) / r.height) * Math.PI;
          onPick(Math.max(0, Math.min(Math.PI, t)), Math.max(0, Math.min(2 * Math.PI, p)));
        }}
      />
      <div className="faint" style={{ fontSize: '0.72rem', marginTop: 2 }}>
        copy fidelity over every input state: bright = perfect copy, dark = poor. (horizontal: phase φ, vertical: θ)
      </div>
    </div>
  );
}

/** Try to "photocopy" an arbitrary qubit with CNOT. Works for |0⟩,|1⟩ — fails (by entangling) for everything else. */
export function ClonerLab() {
  const [theta, setTheta] = useState(Math.PI / 2);
  const [phi, setPhi] = useState(0);
  const [kind, setKind] = useState<Copier>('Z');
  const f = useMemo(() => cloneFidelities(theta, phi, kind), [theta, phi, kind]);
  const v = vecFromAngles(theta, phi);
  const lenB = Math.hypot(...f.rB);

  return (
    <Widget title="The quantum photocopier that isn't">
      <div className="row" style={{ gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <span className="faint" style={{ fontSize: '0.85rem' }}>copier:</span>
        <Segmented
          options={[
            { value: 'Z' as Copier, label: 'CNOT (copies 0/1)' },
            { value: 'X' as Copier, label: 'H-sandwiched CNOT (copies +/−)' },
          ]}
          value={kind}
          onChange={setKind}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16, alignItems: 'center' }}>
        <div>
          <div className="faint" style={{ fontSize: '0.78rem' }}>input |ψ⟩: drag the arrow or use the sliders</div>
          <BlochSphere
            vector={v}
            height={230}
            onDrag={(nv) => {
              const a = anglesFromVec(nv);
              setTheta(a.theta);
              setPhi(a.phi);
            }}
          />
          <Slider label={<Tex>{'\\theta'}</Tex>} value={theta} min={0} max={Math.PI} step={Math.PI / 24} onChange={setTheta} format={fmtPi} />
          <Slider label={<Tex>{'\\phi'}</Tex>} value={phi} min={0} max={2 * Math.PI} step={Math.PI / 24} onChange={setPhi} format={fmtPi} />
        </div>
        <div className="col" style={{ gap: 10 }}>
          <svg viewBox="0 0 300 92" style={{ width: '100%', maxWidth: 320 }}>
            <text x={4} y={30} fill="#58c4dd" fontSize={14} fontFamily="var(--serif)">|ψ⟩</text>
            <text x={4} y={72} fill="#9aa3b5" fontSize={14} fontFamily="var(--serif)">|0⟩</text>
            <line x1={34} x2={270} y1={26} y2={26} stroke="#4a5368" strokeWidth={1.5} />
            <line x1={34} x2={270} y1={68} y2={68} stroke="#4a5368" strokeWidth={1.5} />
            {kind === 'X' && (
              <g>
                <rect x={60} y={12} width={28} height={28} rx={5} fill="#141821" stroke="#f4d35e" strokeWidth={2} />
                <text x={74} y={31} fill="#f4d35e" fontSize={15} textAnchor="middle" fontFamily="var(--serif)" fontWeight={700}>H</text>
              </g>
            )}
            <line x1={130} x2={130} y1={26} y2={68} stroke="#e8655a" strokeWidth={2} />
            <circle cx={130} cy={26} r={5.5} fill="#e8655a" />
            <circle cx={130} cy={68} r={11} fill="#141821" stroke="#e8655a" strokeWidth={2} />
            <line x1={119} x2={141} y1={68} y2={68} stroke="#e8655a" strokeWidth={2} />
            <line x1={130} x2={130} y1={57} y2={79} stroke="#e8655a" strokeWidth={2} />
            {kind === 'X' &&
              [26, 68].map((y) => (
                <g key={y}>
                  <rect x={172} y={y - 14} width={28} height={28} rx={5} fill="#141821" stroke="#f4d35e" strokeWidth={2} />
                  <text x={186} y={y + 5} fill="#f4d35e" fontSize={15} textAnchor="middle" fontFamily="var(--serif)" fontWeight={700}>H</text>
                </g>
              ))}
            <text x={278} y={52} fill="#e07ab6" fontSize={13} fontFamily="var(--serif)">?</text>
          </svg>
          <div className="row" style={{ gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ textAlign: 'center' }}>
              <div className="faint" style={{ fontSize: '0.75rem', marginBottom: 2 }}>what the copier makes</div>
              <AmpGrid amps={f.out} size={52} showNumbers={false} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div className="faint" style={{ fontSize: '0.75rem', marginBottom: 2 }}>a true copy |ψ⟩|ψ⟩</div>
              <AmpGrid amps={f.target} size={52} showNumbers={false} />
            </div>
          </div>
          <div className="row" style={{ gap: 14, alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <MiniBloch v={v} size={74} color="#58c4dd" />
              <div className="faint" style={{ fontSize: '0.7rem' }}>original |ψ⟩</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <MiniBloch v={f.rB} size={74} color={lenB < 0.98 ? '#e07ab6' : '#fcd34d'} />
              <div className="faint" style={{ fontSize: '0.7rem' }}>the "copy" (alone)</div>
            </div>
            <div className="mono" style={{ fontSize: '0.85rem' }}>
              <div>
                copy fidelity <span className="faint">|⟨ψψ|out⟩|²</span> ={' '}
                <b style={{ color: f.joint > 0.99 ? 'var(--green)' : f.joint > 0.6 ? 'var(--yellow)' : 'var(--red)' }}>{f.joint.toFixed(3)}</b>
              </div>
              <div>
                single-copy fidelity = <b>{f.single.toFixed(3)}</b>
              </div>
            </div>
          </div>
          <PhaseLegend size={32} />
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <FidelityMap kind={kind} theta={theta} phi={phi} onPick={(t, p) => { setTheta(t); setPhi(p); }} />
      </div>
    </Widget>
  );
}
