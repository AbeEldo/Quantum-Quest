import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Widget, Segmented, Slider, Tex, useCanvas, fmtPi } from '../../../components/ui';
import { mulberry32 } from '../../../engine/qsim';
import { BlochSphere, vecFromAngles, anglesFromVec } from '../../../widgets/BlochSphere';
import { AmplitudeView } from '../../../widgets/AmplitudeView';
import { useChallengeGate } from '../../../components/lesson/gates';
import { useProgress } from '../../../state/progress';
import { useWidth } from './viz';
import {
  ansatz1, ansatz2, expectation, noisyExpectation, parameterShiftGrad, hamiltonianMatrix, symEigenvalues, type PauliHamiltonian,
} from '../algos';

const H1: PauliHamiltonian = [
  { coef: 0.6, ops: 'Z' },
  { coef: 0.8, ops: 'X' },
];
const H2: PauliHamiltonian = [
  { coef: 1, ops: 'ZZ' },
  { coef: 0.6, ops: 'XI' },
  { coef: 0.6, ops: 'IX' },
];

const SHOT_OPTIONS = [Infinity, 10000, 1000, 100];
const shotLabel = (s: number) => (Number.isFinite(s) ? `${s} shots` : 'exact');

/** Map an energy in [lo, hi] to a colour (deep blue = low, yellow = high). */
function energyColor(e: number, lo: number, hi: number): string {
  const t = Math.max(0, Math.min(1, (e - lo) / (hi - lo)));
  const r = Math.round(20 + 232 * t ** 1.4), g = Math.round(40 + 170 * t), b = Math.round(110 + 80 * (1 - t) - 60 * t);
  return `rgb(${r},${g},${Math.max(30, b)})`;
}

export interface VQEPlaygroundProps {
  /** Gate: get within `tol` of the ground energy on the 1-qubit problem by hand (sliders/drag only). */
  challengeId?: string;
}

/**
 * The VQE loop: a parameterised state, a measured energy ⟨H⟩, and a classical optimizer.
 * Tab 1: one qubit, H = 0.6 Z + 0.8 X, with an energy landscape over (θ, φ).
 * Tab 2: two qubits, transverse-field Ising H = Z⊗Z + 0.6 (X⊗I + I⊗X), four-parameter ansatz.
 */
export function VQEPlayground({ challengeId }: VQEPlaygroundProps) {
  const [tab, setTab] = useState<1 | 2>(1);
  return (
    <Widget title="VQE: tune a quantum state until its energy is as low as it goes">
      <div className="row" style={{ marginBottom: 10 }}>
        <Segmented
          options={[
            { value: 1, label: '1 qubit: H = 0.6 Z + 0.8 X' },
            { value: 2, label: '2 qubits: Ising H = ZZ + 0.6(XI + IX)' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>
      {tab === 1 ? <OneQubit challengeId={challengeId} /> : <TwoQubits />}
    </Widget>
  );
}

function useOptimizer(energy: (p: number[], noisy: boolean) => number, params: number[], setParams: (p: number[]) => void) {
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<number[]>([]);
  const [lr, setLr] = useState(0.3);
  const pRef = useRef(params);
  pRef.current = params;
  useEffect(() => {
    if (!running) return;
    let steps = 0;
    const id = setInterval(() => {
      const p = pRef.current;
      const g = parameterShiftGrad((q) => energy(q, true), p);
      const next = p.map((x, k) => x - lr * g[k]);
      setParams(next);
      setHistory((h) => [...h.slice(-199), energy(next, false)]);
      steps++;
      if (steps >= 80 || Math.hypot(...g) < 2e-3) setRunning(false);
    }, 90);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, lr]);
  return { running, setRunning, history, setHistory, lr, setLr };
}

function EnergyTrace({ history, E0, lo, hi }: { history: number[]; E0: number; lo: number; hi: number }) {
  const [ref, W] = useWidth<HTMLDivElement>(400);
  const H = 110, pad = { l: 40, r: 8, t: 8, b: 18 };
  const n = Math.max(10, history.length);
  const sx = (i: number) => pad.l + (i / (n - 1)) * (W - pad.l - pad.r);
  const sy = (e: number) => H - pad.b - ((e - lo) / (hi - lo)) * (H - pad.t - pad.b);
  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg width={W} height={H} style={{ display: 'block' }}>
        <line x1={pad.l} x2={W - pad.r} y1={sy(E0)} y2={sy(E0)} stroke="#83c167" strokeDasharray="4 4" />
        <text x={W - pad.r} y={sy(E0) + 13} fontSize={10} fill="#83c167" textAnchor="end">true ground energy {E0.toFixed(3)}</text>
        <text x={pad.l - 4} y={sy(hi) + 8} fontSize={10} fill="#6b7385" textAnchor="end">{hi.toFixed(1)}</text>
        <text x={pad.l - 4} y={sy(lo)} fontSize={10} fill="#6b7385" textAnchor="end">{lo.toFixed(1)}</text>
        <line x1={pad.l} x2={pad.l} y1={pad.t} y2={H - pad.b} stroke="#4a5368" />
        {history.length > 1 && (
          <path d={history.map((e, i) => `${i ? 'L' : 'M'}${sx(i)} ${sy(e)}`).join(' ')} fill="none" stroke="#fcd34d" strokeWidth={2} />
        )}
        <text x={pad.l + 4} y={H - 4} fontSize={10} fill="#6b7385">optimizer iterations →</text>
      </svg>
    </div>
  );
}

function OneQubit({ challengeId }: { challengeId?: string }) {
  const [params, setParams] = useState<number[]>([0.4, 2.6]);
  const [shots, setShots] = useState<number>(Infinity);
  const [path, setPath] = useState<number[][]>([]);
  const [handOnly, setHandOnly] = useState(true);
  const rng = useMemo(() => mulberry32(5), []);
  const E0 = -1;
  const energy = (p: number[], noisy: boolean) => (noisy ? noisyExpectation(ansatz1(p), H1, shots, rng) : expectation(ansatz1(p), H1));
  const opt = useOptimizer(energy, params, (p) => {
    setParams(p);
    setPath((pp) => [...pp.slice(-120), p]);
    setHandOnly(false);
  });
  const E = expectation(ansatz1(params), H1);
  const measured = useMemo(() => noisyExpectation(ansatz1(params), H1, shots, mulberry32(Math.round(params[0] * 1e4 + params[1] * 1e2))), [params, shots]);

  const recordQuiz = useProgress((s) => s.recordQuiz);
  const solvedBefore = useProgress((s) => (challengeId ? !!s.quizzes[`challenge:${challengeId}`]?.correct : false));
  const solvedNow = !!challengeId && handOnly && E < E0 + 0.02;
  useChallengeGate(challengeId ?? 'u9-vqe-none', !challengeId || solvedNow || solvedBefore);
  useEffect(() => {
    if (challengeId && solvedNow && !solvedBefore) recordQuiz(`challenge:${challengeId}`, true, 25);
  }, [solvedNow]); // eslint-disable-line react-hooks/exhaustive-deps

  // landscape: θ on x (0..π), φ on y (0..2π)
  const ground = vecFromAngles(Math.PI - Math.atan2(0.8, 0.6), Math.PI);
  const { ref } = useCanvas(
    (ctx, w, h) => {
      const nx = 90, ny = 60;
      for (let i = 0; i < nx; i++)
        for (let j = 0; j < ny; j++) {
          const th = ((i + 0.5) / nx) * Math.PI, ph = ((j + 0.5) / ny) * 2 * Math.PI;
          const e = 0.6 * Math.cos(th) + 0.8 * Math.sin(th) * Math.cos(ph);
          ctx.fillStyle = energyColor(e, -1, 1);
          ctx.fillRect((i / nx) * w, h - ((j + 1) / ny) * h, w / nx + 1, h / ny + 1);
        }
      // trajectory
      const P = (p: number[]) => [(p[0] / Math.PI) * w, h - ((((p[1] % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI)) * h];
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      path.forEach((p, k) => {
        const [x, y] = P(p);
        if (k) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.stroke();
      // ground state marker
      const [gx, gy] = P([Math.PI - Math.atan2(0.8, 0.6), Math.PI]);
      ctx.strokeStyle = '#83c167';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(gx, gy, 8, 0, 2 * Math.PI);
      ctx.stroke();
      const th = Math.max(0, Math.min(Math.PI, params[0]));
      const [x, y] = P([th, params[1]]);
      ctx.fillStyle = '#fcd34d';
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '11px sans-serif';
      ctx.fillText('θ →', w - 28, h - 6);
      ctx.fillText('φ ↑', 4, 12);
    },
    [params, path],
    { height: 200 },
  );

  // keep θ in [0, π] for display/drag
  const thetaDisp = ((params[0] % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const angles = thetaDisp <= Math.PI ? { theta: thetaDisp, phi: params[1] } : { theta: 2 * Math.PI - thetaDisp, phi: params[1] + Math.PI };
  const v = vecFromAngles(angles.theta, angles.phi);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1fr) minmax(260px, 1.2fr)', gap: 16 }}>
      <div>
        <BlochSphere
          vector={v}
          target={ground}
          height={260}
          onDrag={(nv) => {
            const a = anglesFromVec(nv);
            setParams([a.theta, a.phi]);
            setHandOnly(true);
            setPath([]);
          }}
        />
        <div className="faint" style={{ fontSize: '0.78rem', textAlign: 'center' }}>Drag the arrow. The glowing marker is the true ground state.</div>
      </div>
      <div className="col" style={{ gap: 8 }}>
        <Slider label={<Tex>{'\\theta'}</Tex>} value={angles.theta} min={0} max={Math.PI} step={0.01} onChange={(t) => { setParams([t, angles.phi]); setHandOnly(true); setPath([]); }} format={fmtPi} />
        <Slider label={<Tex>{'\\varphi'}</Tex>} value={((angles.phi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)} min={0} max={2 * Math.PI} step={0.01} onChange={(p) => { setParams([angles.theta, p]); setHandOnly(true); setPath([]); }} format={fmtPi} />
        <div className="row" style={{ gap: 14, alignItems: 'baseline' }}>
          <span>
            ⟨H⟩ = <b className="mono" style={{ color: 'var(--yellow)', fontSize: '1.2rem' }}>{E.toFixed(3)}</b>
          </span>
          <span className="faint mono" style={{ fontSize: '0.82rem' }}>measured ({shotLabel(shots)}): {measured.toFixed(3)}</span>
          <span className="faint mono" style={{ fontSize: '0.82rem' }}>ground: {E0.toFixed(3)}</span>
        </div>
        <div className="canvas-wrap" style={{ borderRadius: 8, overflow: 'hidden' }}>
          <canvas ref={ref} />
        </div>
        <div className="faint" style={{ fontSize: '0.75rem' }}>Energy landscape E(θ, φ): dark = low. White line = optimizer path.</div>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <button className={`btn small ${opt.running ? 'active' : 'primary'}`} onClick={() => { if (!opt.running) opt.setHistory([E]); opt.setRunning(!opt.running); }}>
            {opt.running ? '⏸ stop' : '▶ run gradient descent'}
          </button>
          <span className="faint" style={{ fontSize: '0.8rem' }}>noise:</span>
          <Segmented options={SHOT_OPTIONS.map((s) => ({ value: s, label: shotLabel(s) }))} value={shots} onChange={setShots} />
        </div>
        <Slider label="learning rate" value={opt.lr} min={0.05} max={1.5} step={0.05} onChange={opt.setLr} format={(x) => x.toFixed(2)} />
        {opt.history.length > 0 && <EnergyTrace history={opt.history} E0={E0} lo={-1.1} hi={1.1} />}
        {challengeId && (
          <div className="panel" style={{ padding: 8, borderColor: solvedNow || solvedBefore ? 'var(--green)' : 'var(--border)', fontSize: '0.88rem' }}>
            {solvedNow || solvedBefore ? (
              <span style={{ color: 'var(--green)', fontWeight: 600 }}>✓ Within 0.02 of the ground energy by hand. You are the classical optimizer.</span>
            ) : (
              <span style={{ color: 'var(--yellow)' }}>🎯 Challenge: by hand (sliders or drag, no optimizer), get ⟨H⟩ below {(E0 + 0.02).toFixed(2)}.</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TwoQubits() {
  const [params, setParams] = useState<number[]>([0.3, -0.5, 1.2, 0.4]);
  const [shots, setShots] = useState<number>(Infinity);
  const rng = useMemo(() => mulberry32(9), []);
  const E0 = useMemo(() => symEigenvalues(hamiltonianMatrix(H2, 2))[0], []);
  const energy = (p: number[], noisy: boolean) => (noisy ? noisyExpectation(ansatz2(p), H2, shots, rng) : expectation(ansatz2(p), H2));
  const opt = useOptimizer(energy, params, setParams);
  const st = ansatz2(params);
  const E = expectation(st, H2);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1fr) minmax(260px, 1.1fr)', gap: 16 }}>
      <div>
        <svg width="100%" viewBox="0 0 300 100" style={{ maxWidth: 320, display: 'block' }}>
          {[30, 75].map((y, q) => (
            <g key={q}>
              <text x={4} y={y + 5} fontSize={12} fill="#9aa3b5" fontFamily="var(--serif)">|0⟩</text>
              <line x1={28} x2={292} y1={y} y2={y} stroke="#4a5368" strokeWidth={1.5} />
              {[0, 1].map((col) => (
                <g key={col}>
                  <rect x={50 + col * 140} y={y - 14} width={52} height={28} rx={6} fill="#141821" stroke="#a5d6a7" strokeWidth={1.8} />
                  <text x={76 + col * 140} y={y + 4} fontSize={11.5} fill="#a5d6a7" textAnchor="middle">Ry(θ{q + 2 * col})</text>
                </g>
              ))}
            </g>
          ))}
          <line x1={145} x2={145} y1={30} y2={75} stroke="#e8655a" strokeWidth={2} />
          <circle cx={145} cy={30} r={5} fill="#e8655a" />
          <circle cx={145} cy={75} r={10} fill="none" stroke="#e8655a" strokeWidth={2} />
          <line x1={135} x2={155} y1={75} y2={75} stroke="#e8655a" strokeWidth={2} />
          <line x1={145} x2={145} y1={65} y2={85} stroke="#e8655a" strokeWidth={2} />
        </svg>
        {params.map((p, k) => (
          <Slider key={k} label={<Tex>{`\\theta_${k}`}</Tex>} value={((p % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI} min={-Math.PI} max={Math.PI} step={0.01} onChange={(v) => setParams(params.map((x, i) => (i === k ? v : x)))} format={fmtPi} />
        ))}
        <AmplitudeView amps={st.amplitudes()} n={2} compact />
      </div>
      <div className="col" style={{ gap: 8 }}>
        <div className="row" style={{ gap: 14, alignItems: 'baseline' }}>
          <span>
            ⟨H⟩ = <b className="mono" style={{ color: 'var(--yellow)', fontSize: '1.2rem' }}>{E.toFixed(4)}</b>
          </span>
          <span className="faint mono" style={{ fontSize: '0.82rem' }}>exact ground energy: {E0.toFixed(4)}</span>
        </div>
        <div className="faint" style={{ fontSize: '0.82rem' }}>
          Measuring ⟨H⟩ on hardware: run the circuit many times in the Z basis (for ZZ) and again with H gates first (for XI and IX), then average. The variational principle guarantees ⟨H⟩ ≥ {E0.toFixed(3)} for <i>every</i> setting of the knobs.
        </div>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <button className={`btn small ${opt.running ? 'active' : 'primary'}`} onClick={() => { if (!opt.running) opt.setHistory([E]); opt.setRunning(!opt.running); }}>
            {opt.running ? '⏸ stop' : '▶ run gradient descent'}
          </button>
          <button className="btn small ghost" onClick={() => { opt.setRunning(false); setParams([0, 0, 0, 0].map(() => (Math.random() - 0.5) * 2 * Math.PI)); opt.setHistory([]); }}>
            random start ↻
          </button>
          <span className="faint" style={{ fontSize: '0.8rem' }}>noise:</span>
          <Segmented options={SHOT_OPTIONS.map((s) => ({ value: s, label: shotLabel(s) }))} value={shots} onChange={setShots} />
        </div>
        <Slider label="learning rate" value={opt.lr} min={0.05} max={1} step={0.05} onChange={opt.setLr} format={(x) => x.toFixed(2)} />
        <EnergyTrace history={opt.history} E0={E0} lo={E0 - 0.2} hi={2.2} />
        <div className="dim" style={{ fontSize: '0.85rem' }}>
          Gap to the true ground energy: <b className="mono">{(E - E0).toExponential(2)}</b>. Gradients come from the <b>parameter-shift rule</b>: two extra
          energy measurements per parameter, at θ ± π/2.
        </div>
      </div>
    </div>
  );
}
