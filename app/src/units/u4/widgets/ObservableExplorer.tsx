import React, { useState } from 'react';
import { BlochSphere, vecFromAngles, anglesFromVec, type Vec3 } from '../../../widgets/BlochSphere';
import { Slider, Widget, Tex, Segmented, fmtPi, ProgressBar } from '../../../components/ui';
import { c, expi, scale } from '../../../engine/complex';
import { dot, nDotSigma, texMat, texVec } from './spin';

const PRESETS: { label: string; theta: number; phi: number }[] = [
  { label: 'σx', theta: Math.PI / 2, phi: 0 },
  { label: 'σy', theta: Math.PI / 2, phi: Math.PI / 2 },
  { label: 'σz', theta: 0, phi: 0 },
  { label: '(σx+σz)/√2', theta: Math.PI / 4, phi: 0 },
];

/**
 * Observable explorer: choose a measurement axis n̂ on the Bloch sphere and see
 *  - the Hermitian matrix n̂·σ,
 *  - its eigenvalues (±1) and eigenvectors (antipodal points ±n̂),
 *  - the outcome probabilities for a state ψ.
 */
export function ObservableExplorer() {
  const [mode, setMode] = useState<'axis' | 'state'>('axis');
  const [nT, setNT] = useState(Math.PI / 3);
  const [nP, setNP] = useState(Math.PI / 6);
  const [sT, setST] = useState(Math.PI / 5);
  const [sP, setSP] = useState(Math.PI * 1.2);
  const n = vecFromAngles(nT, nP);
  const r = vecFromAngles(sT, sP);
  const M = nDotSigma(n);
  const plusVec = [c(Math.cos(nT / 2)), scale(expi(nP), Math.sin(nT / 2))];
  const minusVec = [c(Math.sin(nT / 2)), scale(expi(nP), -Math.cos(nT / 2))];
  const pPlus = (1 + dot(n, r)) / 2;
  const minus: Vec3 = [-n[0], -n[1], -n[2]];

  const onDrag = (v: Vec3) => {
    const a = anglesFromVec(v);
    if (mode === 'axis') {
      setNT(a.theta);
      setNP(a.phi);
    } else {
      setST(a.theta);
      setSP(a.phi);
    }
  };

  return (
    <Widget title="Observable explorer — pick an axis, find its eigenstates">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.05fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
        <div>
          <BlochSphere
            vector={mode === 'axis' ? n : r}
            color={mode === 'axis' ? '#83c167' : '#fcd34d'}
            axis={n}
            onDrag={onDrag}
            vectors={
              mode === 'axis'
                ? [
                    { v: minus, color: '#fc6255' },
                    { v: r, color: '#fcd34d' },
                  ]
                : [
                    { v: n, color: '#83c167' },
                    { v: minus, color: '#fc6255' },
                  ]
            }
            height={330}
          />
          <div className="row" style={{ justifyContent: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
            <span className="faint" style={{ fontSize: '0.85rem' }}>Drag the tip to move:</span>
            <Segmented
              options={[
                { value: 'axis', label: 'measurement axis n̂' },
                { value: 'state', label: 'state ψ' },
              ]}
              value={mode}
              onChange={setMode}
            />
          </div>
          <div className="row" style={{ justifyContent: 'center', gap: 14, marginTop: 6, fontSize: '0.82rem' }}>
            <span style={{ color: 'var(--green)' }}>● eigenvalue +1</span>
            <span style={{ color: 'var(--red)' }}>● eigenvalue −1</span>
            <span style={{ color: 'var(--yellow)' }}>● state ψ</span>
          </div>
        </div>
        <div className="col" style={{ gap: 10 }}>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                className={`btn small ${Math.abs(p.theta - nT) < 1e-3 && Math.abs(p.phi - nP) < 1e-3 ? 'active' : ''}`}
                onClick={() => {
                  setNT(p.theta);
                  setNP(p.phi);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Slider label={<Tex>{'\\theta_n'}</Tex>} value={nT} min={0} max={Math.PI} step={Math.PI / 48} onChange={setNT} format={fmtPi} />
          <Slider label={<Tex>{'\\phi_n'}</Tex>} value={nP} min={0} max={2 * Math.PI} step={Math.PI / 48} onChange={setNP} format={fmtPi} />
          <div className="panel" style={{ padding: 10 }}>
            <div className="faint" style={{ fontSize: '0.8rem', marginBottom: 4 }}>The observable (a Hermitian matrix):</div>
            <div style={{ overflowX: 'auto' }}>
              <Tex display>{`\\hat n\\cdot\\vec\\sigma = ${texMat(M)}`}</Tex>
            </div>
            <div className="faint mono" style={{ fontSize: '0.78rem' }}>
              n̂ = ({n.map((x) => x.toFixed(2)).join(', ')})
            </div>
          </div>
          <div className="panel" style={{ padding: 10 }}>
            <div className="faint" style={{ fontSize: '0.8rem', marginBottom: 4 }}>Its eigenvectors (possible post-measurement states):</div>
            <div style={{ color: 'var(--green)' }}>
              <Tex>{`\\lambda=+1:\\ |{+}n\\rangle = ${texVec(plusVec, 2)}`}</Tex>
            </div>
            <div style={{ color: 'var(--red)', marginTop: 6 }}>
              <Tex>{`\\lambda=-1:\\ |{-}n\\rangle = ${texVec(minusVec, 2)}`}</Tex>
            </div>
          </div>
          <div className="panel" style={{ padding: 10 }}>
            <div className="faint" style={{ fontSize: '0.8rem', marginBottom: 6 }}>Measuring ψ along n̂:</div>
            <div className="row" style={{ gap: 8 }}>
              <span style={{ width: 70, color: 'var(--green)' }}>P(+1)</span>
              <ProgressBar value={pPlus} color="var(--green)" style={{ flex: 1 }} />
              <span className="mono" style={{ width: 52, textAlign: 'right' }}>{(pPlus * 100).toFixed(1)}%</span>
            </div>
            <div className="row" style={{ gap: 8, marginTop: 4 }}>
              <span style={{ width: 70, color: 'var(--red)' }}>P(−1)</span>
              <ProgressBar value={1 - pPlus} color="var(--red)" style={{ flex: 1 }} />
              <span className="mono" style={{ width: 52, textAlign: 'right' }}>{((1 - pPlus) * 100).toFixed(1)}%</span>
            </div>
            <div className="faint" style={{ fontSize: '0.8rem', marginTop: 6 }}>
              <Tex>{`P(+1) = \\tfrac{1 + \\hat n\\cdot\\vec r_\\psi}{2},\\quad \\langle \\hat n\\cdot\\vec\\sigma\\rangle = ${dot(n, r).toFixed(3)}`}</Tex>
            </div>
          </div>
        </div>
      </div>
    </Widget>
  );
}
