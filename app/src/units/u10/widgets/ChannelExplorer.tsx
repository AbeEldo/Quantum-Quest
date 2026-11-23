import React, { useMemo, useRef, useState } from 'react';
import { Widget, Slider, Segmented, Tex, fmtPi } from '../../../components/ui';
import { Noise, type Mat2 } from '../../../engine/qsim';
import { vecFromAngles } from '../../../widgets/BlochSphere';
import { useAnimCanvas, SANS, SERIF } from './anim';
import { dmFromBloch, cTex, type Vec3 } from './rho';

type Ch = 'bit' | 'phase' | 'depol' | 'amp' | 'deph';

const CHANNELS: Record<Ch, { label: string; param: string; kraus: (p: number) => Mat2[]; blurb: string }> = {
  bit: { label: 'Bit flip', param: 'p', kraus: Noise.bitFlip, blurb: 'With probability p apply X. The sphere is squashed toward the x axis.' },
  phase: { label: 'Phase flip', param: 'p', kraus: Noise.phaseFlip, blurb: 'With probability p apply Z. The sphere is squashed toward the z axis: coherences die, populations survive.' },
  depol: { label: 'Depolarizing', param: 'p', kraus: Noise.depolarizing, blurb: 'With probability p replace the qubit by I/2. The sphere shrinks uniformly toward the centre.' },
  amp: { label: 'Amplitude damping', param: 'γ', kraus: Noise.amplitudeDamping, blurb: '|1⟩ decays to |0⟩ with probability γ (a T₁ process). The ball shrinks AND slides toward the north pole.' },
  deph: { label: 'Phase damping', param: 'λ', kraus: Noise.phaseDamping, blurb: 'Pure dephasing (a T₂ process): x and y shrink by √(1−λ); z is untouched.' },
};

/** Affine Bloch-ball map r → A r + b of a channel applied `reps` times, computed with the density-matrix engine. */
function affineOf(kraus: Mat2[], reps: number): { A: number[][]; b: Vec3 } {
  const img = (v: Vec3): Vec3 => {
    const d = dmFromBloch(v);
    for (let k = 0; k < reps; k++) d.channel(kraus, 0);
    return d.bloch(0) as Vec3;
  };
  const b = img([0, 0, 0]);
  const cols = [img([1, 0, 0]), img([0, 1, 0]), img([0, 0, 1])];
  const A = [0, 1, 2].map((i) => [0, 1, 2].map((j) => cols[j][i] - b[i]));
  return { A, b };
}
const apply = ({ A, b }: { A: number[][]; b: Vec3 }, v: Vec3): Vec3 => [0, 1, 2].map((i) => A[i][0] * v[0] + A[i][1] * v[1] + A[i][2] * v[2] + b[i]) as Vec3;

function ring(f: (s: number) => Vec3, n = 72): Vec3[] {
  return Array.from({ length: n + 1 }, (_, k) => f((k / n) * 2 * Math.PI));
}
const WIRE: Vec3[][] = [
  ...[-60, -30, 0, 30, 60].map((lat) => {
    const t = (lat * Math.PI) / 180;
    return ring((s) => [Math.cos(t) * Math.cos(s), Math.cos(t) * Math.sin(s), Math.sin(t)]);
  }),
  ...[0, 30, 60, 90, 120, 150].map((lon) => {
    const p = (lon * Math.PI) / 180;
    return ring((s) => [Math.sin(s) * Math.cos(p), Math.sin(s) * Math.sin(p), Math.cos(s)]);
  }),
];

/** Watch a noise channel deform the whole Bloch sphere into an ellipsoid inside the ball. */
export function ChannelExplorer() {
  const [ch, setCh] = useState<Ch>('depol');
  const [p, setP] = useState(0.3);
  const [reps, setReps] = useState(1);
  const [theta, setTheta] = useState(Math.PI / 3);
  const [phi, setPhi] = useState(Math.PI / 4);
  const yaw = useRef(-0.9);
  const drag = useRef<{ x: number; yaw: number } | null>(null);
  const kraus = CHANNELS[ch].kraus(p);
  const map = useMemo(() => affineOf(kraus, reps), [ch, p, reps]);
  const test = vecFromAngles(theta, phi) as Vec3;
  const out = apply(map, test);
  const fid = (1 + test[0] * out[0] + test[1] * out[1] + test[2] * out[2]) / 2;
  // average fidelity over the sphere (Fibonacci points)
  const avgF = useMemo(() => {
    let s = 0;
    const M = 400;
    for (let k = 0; k < M; k++) {
      const z = 1 - (2 * (k + 0.5)) / M, r = Math.sqrt(1 - z * z), a = k * 2.399963;
      const v: Vec3 = [r * Math.cos(a), r * Math.sin(a), z];
      const w = apply(map, v);
      s += (1 + v[0] * w[0] + v[1] * w[1] + v[2] * w[2]) / 2;
    }
    return s / M;
  }, [map]);

  const ref = useAnimCanvas(330, (ctx, w, h, dt) => {
    if (!drag.current) yaw.current += dt * 0.25;
    const cx = w / 2, cy = h / 2 + 6, R = Math.min(130, w * 0.3);
    const pitch = 0.32;
    const cyw = Math.cos(yaw.current), syw = Math.sin(yaw.current);
    const proj = (v: Vec3): [number, number, number] => {
      const x1 = v[0] * cyw - v[1] * syw;
      const y1 = v[0] * syw + v[1] * cyw;
      const sx = y1;
      const sy = v[2] * Math.cos(pitch) - x1 * Math.sin(pitch);
      const depth = x1 * Math.cos(pitch) + v[2] * Math.sin(pitch);
      return [cx + sx * R, cy - sy * R, depth];
    };
    const drawCurve = (pts: Vec3[], color: string, width: number, alphaFront: number, alphaBack: number) => {
      for (let k = 1; k < pts.length; k++) {
        const a = proj(pts[k - 1]), b = proj(pts[k]);
        ctx.globalAlpha = (a[2] + b[2]) / 2 > 0 ? alphaFront : alphaBack;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };
    // outer ball silhouette
    ctx.strokeStyle = '#2f3a4f';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    for (const c of WIRE) drawCurve(c, '#58c4dd', 1, 0.22, 0.08);
    // axes
    for (const [v, lab] of [[[1.25, 0, 0], 'x'], [[0, 1.25, 0], 'y'], [[0, 0, 1.25], '|0⟩']] as [Vec3, string][]) {
      const a = proj([-v[0], -v[1], -v[2]]), b = proj(v);
      ctx.strokeStyle = '#4a5368';
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
      ctx.fillStyle = '#7d8699';
      ctx.font = `12px ${SERIF}`;
      ctx.fillText(lab, b[0] + 4, b[1]);
    }
    // transformed wireframe
    for (const c of WIRE) drawCurve(c.map((v) => apply(map, v)), '#fcd34d', 1.6, 0.95, 0.3);
    // test state & its image
    const o = proj([0, 0, 0]);
    const arrow = (v: Vec3, color: string, wdt: number) => {
      const t = proj(v);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = wdt;
      ctx.beginPath();
      ctx.moveTo(o[0], o[1]);
      ctx.lineTo(t[0], t[1]);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(t[0], t[1], 4.5, 0, Math.PI * 2);
      ctx.fill();
    };
    arrow(test, '#e9ecf2', 2);
    arrow(out, '#e07ab6', 3);
    ctx.font = `12px ${SANS}`;
    ctx.fillStyle = '#e9ecf2';
    ctx.fillText('white: input state', 10, 18);
    ctx.fillStyle = '#e07ab6';
    ctx.fillText('pink: after the channel', 10, 34);
    ctx.fillStyle = '#fcd34d';
    ctx.fillText('gold: image of the whole sphere', 10, 50);
  });

  const lbl = CHANNELS[ch].param;
  return (
    <Widget title="Channel explorer: what noise does to every state at once">
      <div className="row" style={{ marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <Segmented value={ch} onChange={setCh} options={(Object.keys(CHANNELS) as Ch[]).map((k) => ({ value: k, label: CHANNELS[k].label }))} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px,1.2fr) 1fr', gap: 14 }}>
        <div
          style={{ width: '100%', cursor: 'grab' }}
          onPointerDown={(e) => {
            drag.current = { x: e.clientX, yaw: yaw.current };
            (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (drag.current) yaw.current = drag.current.yaw + (e.clientX - drag.current.x) * 0.01;
          }}
          onPointerUp={() => (drag.current = null)}
        >
          <canvas ref={ref} style={{ display: 'block' }} />
        </div>
        <div className="col" style={{ gap: 6 }}>
          <div className="faint" style={{ fontSize: '0.86rem' }}>{CHANNELS[ch].blurb}</div>
          <Slider label={lbl} value={p} min={0} max={1} step={0.01} onChange={setP} />
          <Slider label="apply n times" value={reps} min={1} max={20} step={1} onChange={setReps} format={(x) => `${x}`} />
          <Slider label="input θ" value={theta} min={0} max={Math.PI} step={Math.PI / 48} onChange={setTheta} format={fmtPi} />
          <Slider label="input φ" value={phi} min={0} max={2 * Math.PI} step={Math.PI / 48} onChange={setPhi} format={fmtPi} />
          <div className="mono" style={{ fontSize: '0.82rem' }}>
            fidelity of this state ⟨ψ|ε(ρ)|ψ⟩ = <b style={{ color: 'var(--pink)' }}>{fid.toFixed(3)}</b>
            <br />
            average over all pure inputs = <b style={{ color: 'var(--yellow)' }}>{avgF.toFixed(3)}</b>
          </div>
          <div style={{ fontSize: '0.86rem' }}>
            <div className="faint" style={{ fontSize: '0.78rem' }}>Kraus operators (one application):</div>
            {kraus.map((K, i) => (
              <span key={i} style={{ marginRight: 10, display: 'inline-block' }}>
                <Tex>{`K_${i} = \\begin{pmatrix} ${cTex(K[0])} & ${cTex(K[1])} \\\\ ${cTex(K[2])} & ${cTex(K[3])} \\end{pmatrix}`}</Tex>
              </span>
            ))}
          </div>
        </div>
      </div>
    </Widget>
  );
}
