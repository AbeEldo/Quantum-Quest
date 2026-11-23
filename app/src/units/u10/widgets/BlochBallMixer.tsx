import React, { useState } from 'react';
import { Widget, Slider, Tex, fmtPi } from '../../../components/ui';
import { BlochSphere, vecFromAngles } from '../../../widgets/BlochSphere';
import { mat2Tex, rhoFromBloch, Meter, type Vec3 } from './rho';

interface Member {
  theta: number;
  phi: number;
  w: number;
}

const COLORS = ['#58c4dd', '#fcd34d', '#e07ab6'];

const PRESETS: { label: string; members: Member[] }[] = [
  { label: 'pure |+⟩', members: [{ theta: Math.PI / 2, phi: 0, w: 1 }, { theta: 0, phi: 0, w: 0 }, { theta: 0, phi: 0, w: 0 }] },
  { label: '½|0⟩ + ½|1⟩ mix', members: [{ theta: 0, phi: 0, w: 0.5 }, { theta: Math.PI, phi: 0, w: 0.5 }, { theta: 0, phi: 0, w: 0 }] },
  { label: '½|+⟩ + ½|−⟩ mix', members: [{ theta: Math.PI / 2, phi: 0, w: 0.5 }, { theta: Math.PI / 2, phi: Math.PI, w: 0.5 }, { theta: 0, phi: 0, w: 0 }] },
  { label: '¾|0⟩ + ¼|1⟩', members: [{ theta: 0, phi: 0, w: 0.75 }, { theta: Math.PI, phi: 0, w: 0.25 }, { theta: 0, phi: 0, w: 0 }] },
  {
    label: 'three "trine" states',
    members: [
      { theta: Math.PI / 2, phi: 0, w: 1 / 3 },
      { theta: Math.PI / 2, phi: (2 * Math.PI) / 3, w: 1 / 3 },
      { theta: Math.PI / 2, phi: (4 * Math.PI) / 3, w: 1 / 3 },
    ],
  },
];

/** Mix up to three pure states with weights; see the Bloch vector of ρ = Σ pᵢ|ψᵢ⟩⟨ψᵢ| inside the ball. */
export function BlochBallMixer() {
  const [ms, setMs] = useState<Member[]>(PRESETS[3].members);
  const total = ms.reduce((s, m) => s + m.w, 0) || 1;
  const vs = ms.map((m) => vecFromAngles(m.theta, m.phi));
  const r = [0, 1, 2].map((i) => ms.reduce((s, m, k) => s + (m.w / total) * vs[k][i], 0)) as Vec3;
  const len = Math.hypot(...r);
  const purity = (1 + len * len) / 2;
  const rho = rhoFromBloch(r);
  const set = (k: number, patch: Partial<Member>) => setMs((old) => old.map((m, i) => (i === k ? { ...m, ...patch } : m)));

  return (
    <Widget title="Bloch ball mixer: ρ = Σ pᵢ |ψᵢ⟩⟨ψᵢ|">
      <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        <span className="faint" style={{ fontSize: '0.82rem' }}>Presets:</span>
        {PRESETS.map((p) => (
          <button key={p.label} className="btn small" onClick={() => setMs(p.members)}>
            {p.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px,1.05fr) 1fr', gap: 16, alignItems: 'start' }}>
        <div>
          <BlochSphere
            ball
            height={320}
            vector={r}
            color="#83c167"
            vectors={ms.map((m, k) => ({ v: vs[k], color: COLORS[k] })).filter((_, k) => ms[k].w > 0)}
          />
          <div className="faint" style={{ fontSize: '0.8rem', textAlign: 'center' }}>
            thin arrows: the pure states in the mix · <span style={{ color: 'var(--green)' }}>green</span>: the mixture's Bloch vector
          </div>
        </div>
        <div className="col" style={{ gap: 8 }}>
          {ms.map((m, k) => (
            <div key={k} className="panel" style={{ padding: '6px 10px', borderColor: m.w > 0 ? COLORS[k] + '88' : 'var(--border)' }}>
              <div style={{ color: COLORS[k], fontSize: '0.8rem', fontWeight: 600 }}>
                state {k + 1} · weight {(m.w / total).toFixed(2)}
              </div>
              <Slider label="weight" value={m.w} min={0} max={1} step={0.01} onChange={(w) => set(k, { w })} />
              <Slider label={<Tex>{'\\theta'}</Tex>} value={m.theta} min={0} max={Math.PI} step={Math.PI / 48} onChange={(theta) => set(k, { theta })} format={fmtPi} />
              <Slider label={<Tex>{'\\phi'}</Tex>} value={m.phi} min={0} max={2 * Math.PI} step={Math.PI / 48} onChange={(phi) => set(k, { phi })} format={fmtPi} />
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 18, alignItems: 'center', marginTop: 10 }}>
        <div style={{ fontSize: '1.05rem' }}>
          <Tex>{`\\rho = ${mat2Tex(rho)}`}</Tex>
        </div>
        <div className="col" style={{ gap: 6 }}>
          <Meter label="|r| (length)" value={len} color="var(--green)" />
          <Meter label={<>purity Tr ρ²</>} value={(purity - 0.5) * 2} color="var(--yellow)" fmt={() => purity.toFixed(3)} />
          <div className="mono faint" style={{ fontSize: '0.8rem' }}>
            r = ({r.map((x) => x.toFixed(2)).join(', ')}) · eigenvalues of ρ: {((1 + len) / 2).toFixed(3)}, {((1 - len) / 2).toFixed(3)}
          </div>
        </div>
      </div>
    </Widget>
  );
}
