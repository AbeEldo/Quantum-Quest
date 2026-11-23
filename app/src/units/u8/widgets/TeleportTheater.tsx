import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Widget, Slider, Tex, fmtPi } from '../../../components/ui';
import { StateVector } from '../../../engine/qsim';
import { MiniBloch } from '../../../widgets/MiniBloch';
import { vecFromAngles } from '../../../widgets/BlochSphere';

type V3 = [number, number, number];

const STEPS = [
  { title: 'An unknown state', text: 'Alice holds a qubit in some state |ψ⟩ that she does not know. She can’t measure it to find out (one measurement gives one bit), and she can’t copy it.' },
  { title: 'Share a Bell pair', text: 'A source sends one half of |Φ⁺⟩ to Alice and the other to Bob. This can happen long before |ψ⟩ even exists.' },
  { title: 'Alice: CNOT', text: 'Alice applies CNOT from |ψ⟩ (control) to her half of the pair (target). Her two qubits now interact.' },
  { title: 'Alice: H', text: 'Alice applies H to the |ψ⟩ qubit. Rewritten, the 3-qubit state is an equal superposition of four branches. In each branch Bob’s qubit already holds |ψ⟩, up to a known Pauli fix.' },
  { title: 'Bell measurement', text: 'Alice measures both her qubits. She gets one of four results m₁m₂, each with probability ¼, and Bob’s qubit is projected into the matching branch. Alice’s qubits are left in |m₁m₂⟩: her original |ψ⟩ is gone.' },
  { title: 'Phone call', text: 'Alice sends the two classical bits m₁m₂ to Bob over an ordinary channel, at light speed at best. Until they arrive, Bob’s qubit looks completely random to him.' },
  { title: 'Bob corrects', text: 'Bob applies X if m₂ = 1, then Z if m₁ = 1. His qubit is now exactly |ψ⟩. The state has been teleported: not copied, but moved.' },
];

const branchVec = (v: V3, m1: number, m2: number): V3 => {
  // Bob's state in branch (m1, m2) is X^{m2} Z^{m1} |ψ⟩
  let [x, y, z] = v;
  if (m1) [x, y] = [-x, -y]; // Z
  if (m2) [y, z] = [-y, -z]; // X
  return [x, y, z];
};

/** Smoothly rotate a Bloch vector toward a target (normalised lerp). */
function useVecTween(target: V3, ms = 900): V3 {
  const [v, setV] = useState<V3>(target);
  const from = useRef<V3>(target);
  useEffect(() => {
    from.current = v;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / ms);
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const p: V3 = [0, 1, 2].map((i) => from.current[i] + (target[i] - from.current[i]) * e) as V3;
      const lenF = Math.hypot(...from.current), lenT = Math.hypot(...target);
      const len = Math.hypot(...p);
      const want = lenF + (lenT - lenF) * e;
      setV(len > 1e-6 ? (p.map((x) => (x / len) * want) as V3) : p);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target[0], target[1], target[2]]);
  return v;
}

/**
 * Step-by-step animated teleportation: Alice and Bob panels, a Bell-pair source, the Bell measurement,
 * two classical bits travelling down a phone line, and Bob's Pauli correction.
 */
export function TeleportTheater() {
  const [theta, setTheta] = useState(Math.PI / 3);
  const [phi, setPhi] = useState(Math.PI / 4);
  const [step, setStep] = useState(0);
  const [m, setM] = useState<[number, number]>([1, 0]);
  const [bitsArrived, setBitsArrived] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  useEffect(() => {
    setBitsArrived(false);
    if (step === 5) {
      timer.current = window.setTimeout(() => setBitsArrived(true), 1600);
      return () => { if (timer.current) window.clearTimeout(timer.current); };
    }
    if (step > 5) setBitsArrived(true);
  }, [step]);

  const psiV = vecFromAngles(theta, phi);

  // exact state vector for the current step (for honesty: the mini-Blochs read from the simulator)
  const sv = useMemo(() => {
    const s = StateVector.fromBloch([[theta, phi], [0, 0], [0, 0]]);
    if (step >= 1) s.h(1).cx(1, 2);
    if (step >= 2) s.cx(0, 1);
    if (step >= 3) s.h(0);
    if (step >= 4) {
      s.collapse(0, m[0] as 0 | 1);
      s.collapse(1, m[1] as 0 | 1);
    }
    if (step >= 6) {
      if (m[1]) s.x(2);
      if (m[0]) s.z(2);
    }
    return s;
  }, [theta, phi, step, m]);

  const bobTrue: V3 = step >= 4 ? (sv.bloch(2) as V3) : step >= 1 ? [0, 0, 0] : [0, 0, 1];
  const bobView: V3 = step >= 6 ? (sv.bloch(2) as V3) : step >= 1 ? [0, 0, 0] : [0, 0, 1];
  const bobAnim = useVecTween(bobTrue);
  const aliceV: V3 = step >= 4 ? [0, 0, m[0] ? -1 : 1] : step >= 2 ? (sv.bloch(0) as V3) : psiV;
  const aliceAnim = useVecTween(aliceV, 600);

  const remeasure = () => {
    setM([Math.random() < 0.5 ? 0 : 1, Math.random() < 0.5 ? 0 : 1]);
  };
  const go = (s: number) => {
    const ns = Math.max(0, Math.min(STEPS.length - 1, s));
    if (ns === 4 && step < 4) remeasure();
    setStep(ns);
  };

  const W = 760, H = 250;
  const AX = 150, BX = W - 150, QY = 120;
  const showPair = step >= 1;
  const fid = step >= 6 ? (() => { const b = sv.bloch(2); return (1 + b[0] * psiV[0] + b[1] * psiV[1] + b[2] * psiV[2]) / 2; })() : null;
  const corr = [m[1] ? 'X' : '', m[0] ? 'Z' : ''].filter(Boolean).join(' then ') || 'nothing (identity)';

  return (
    <Widget title="Quantum teleportation, step by step">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) 2fr', gap: 12, alignItems: 'center' }}>
        <div className="col" style={{ gap: 4 }}>
          <div className="faint" style={{ fontSize: '0.78rem' }}>the state to teleport (Alice doesn’t know it)</div>
          <Slider label={<Tex>{'\\theta'}</Tex>} value={theta} min={0} max={Math.PI} step={Math.PI / 24} onChange={(v) => { setTheta(v); setStep(0); }} format={fmtPi} />
          <Slider label={<Tex>{'\\phi'}</Tex>} value={phi} min={0} max={2 * Math.PI} step={Math.PI / 24} onChange={(v) => { setPhi(v); setStep(0); }} format={fmtPi} />
        </div>
        <div className="row" style={{ gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button className="btn small" onClick={() => go(step - 1)} disabled={step === 0}>◀ back</button>
          <span className="mono" style={{ fontSize: '0.85rem' }}>step {step}/{STEPS.length - 1}</span>
          <button className="btn small primary" onClick={() => go(step + 1)} disabled={step === STEPS.length - 1}>next ▶</button>
          {step >= 4 && (
            <button className="btn small" onClick={() => { remeasure(); setStep(4); }} title="Alice’s measurement is random. Try again.">
              🎲 re-run measurement
            </button>
          )}
          <button className="btn small ghost" onClick={() => setStep(0)}>↺</button>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block', marginTop: 6, borderRadius: 12, background: 'radial-gradient(ellipse at 50% 30%, rgba(224,122,182,0.06), transparent 70%)' }}>
        <rect x={20} y={30} width={250} height={150} rx={16} fill="rgba(88,196,221,0.05)" stroke="#58c4dd55" />
        <text x={34} y={52} fontSize={14} fill="#58c4dd" fontWeight={700}>Alice</text>
        <rect x={W - 270} y={30} width={250} height={150} rx={16} fill="rgba(252,211,77,0.05)" stroke="#fcd34d55" />
        <text x={W - 34} y={52} fontSize={14} fill="#fcd34d" fontWeight={700} textAnchor="end">Bob</text>
        {/* source */}
        <circle cx={W / 2} cy={50} r={step === 1 ? 20 : 14} fill="none" stroke="#e07ab6" strokeDasharray="3 3" style={{ transition: 'r .4s' }} />
        <text x={W / 2} y={22} fontSize={11} fill="#9aa3b5" textAnchor="middle">Bell-pair source</text>
        {/* entanglement link */}
        {showPair && step < 4 && (
          <path d={`M ${AX - 21} ${QY + 30} Q ${W / 2} ${QY - 70} ${BX - 9} ${QY}`} fill="none" stroke="#e07ab6" strokeWidth={2} strokeDasharray="4 5">
            <animate attributeName="stroke-dashoffset" from="0" to="-18" dur="0.8s" repeatCount="indefinite" />
          </path>
        )}
        {/* Alice's gates */}
        {step >= 2 && step <= 3 && (
          <g className="pop">
            <line x1={AX - 30} x2={AX - 30} y1={QY - 30} y2={QY + 30} stroke="#e8655a" strokeWidth={2} />
            <circle cx={AX - 30} cy={QY - 30} r={5} fill="#e8655a" />
            <text x={AX - 30} y={QY + 52} fontSize={11} fill="#e8655a" textAnchor="middle">CNOT</text>
          </g>
        )}
        {step === 3 && (
          <g className="pop" transform={`translate(${AX - 75}, ${QY - 30})`}>
            <rect x={-14} y={-13} width={28} height={26} rx={5} fill="#141821" stroke="#f4d35e" strokeWidth={2} />
            <text y={6} fontSize={15} textAnchor="middle" fill="#f4d35e" fontWeight={700} fontFamily="var(--serif)">H</text>
          </g>
        )}
        {/* qubits as labelled dots */}
        <g>
          <circle cx={AX - 30} cy={QY - 30} r={9} fill={step >= 4 ? '#6b7385' : '#58c4dd'} style={{ transition: 'fill .5s' }} />
          <text x={AX - 12} y={QY - 26} fontSize={11.5} fill="#cfd6e4">{step >= 4 ? `|${m[0]}⟩ (ψ destroyed)` : '|ψ⟩'}</text>
          {showPair && (
            <>
              <circle cx={AX - 30} cy={QY + 30} r={9} fill={step >= 4 ? '#6b7385' : '#e07ab6'} className="pop" />
              <text x={AX - 12} y={QY + 34} fontSize={11.5} fill="#cfd6e4">{step >= 4 ? `|${m[1]}⟩` : 'pair half A'}</text>
              <circle cx={BX} cy={QY} r={9} fill={step >= 6 ? '#58c4dd' : '#e07ab6'} className="pop" style={{ transition: 'fill .6s' }} />
              <text x={BX - 16} y={QY + 4} fontSize={11.5} fill="#cfd6e4" textAnchor="end">{step >= 6 ? '|ψ⟩ ✓' : 'pair half B'}</text>
            </>
          )}
        </g>
        {/* Measurement result */}
        {step >= 4 && (
          <g className="pop" transform={`translate(${AX + 30}, ${QY + 70})`}>
            <rect x={-40} y={-14} width={80} height={28} rx={6} fill="#f4f1e8" />
            <text y={6} fontSize={14} textAnchor="middle" fill="#111" fontWeight={700} fontFamily="var(--mono)">m = {m[0]}{m[1]}</text>
          </g>
        )}
        {/* phone line */}
        <line x1={AX + 70} x2={BX - 70} y1={215} y2={215} stroke="#3a4256" strokeWidth={3} />
        <text x={W / 2} y={240} fontSize={10.5} fill="#6b7385" textAnchor="middle">classical channel (light speed at most)</text>
        {step >= 5 && (
          <g style={{ transform: `translate(${bitsArrived ? BX - 90 : AX + 70}px, 215px)`, transition: 'transform 1.5s linear' }}>
            <rect x={-26} y={-12} width={52} height={24} rx={12} fill="#83c167" />
            <text y={5} fontSize={13} textAnchor="middle" fill="#111" fontWeight={700} fontFamily="var(--mono)">{m[0]}{m[1]}</text>
          </g>
        )}
        {step >= 6 && (
          <g className="pop" transform={`translate(${BX - 30}, ${QY - 50})`}>
            <rect x={-60} y={-14} width={120} height={26} rx={6} fill="#141821" stroke="#e8655a" strokeWidth={2} />
            <text y={5} fontSize={12} textAnchor="middle" fill="#e8655a" fontWeight={700}>apply {m[1] ? 'X' : ''}{m[1] && m[0] ? '·' : ''}{m[0] ? 'Z' : ''}{!m[0] && !m[1] ? 'I' : ''}</text>
          </g>
        )}
      </svg>

      <div className="panel" style={{ padding: 12, marginTop: 6 }}>
        <b style={{ color: 'var(--yellow)' }}>
          {step}. {STEPS[step].title}
        </b>
        <div style={{ marginTop: 4 }}>{STEPS[step].text}</div>
        {step === 3 && (
          <div style={{ marginTop: 8 }}>
            <Tex display>{'\\tfrac12\\big[\\,|00\\rangle\\,|\\psi\\rangle + |01\\rangle\\,X|\\psi\\rangle + |10\\rangle\\,Z|\\psi\\rangle + |11\\rangle\\,XZ|\\psi\\rangle\\,\\big]'}</Tex>
          </div>
        )}
        {step >= 4 && step < 6 && <div className="mono" style={{ marginTop: 6, fontSize: '0.88rem' }}>Bob will need to apply: {corr}</div>}
        {fid !== null && (
          <div className="mono" style={{ marginTop: 6, color: 'var(--green)' }}>
            fidelity of Bob’s qubit with |ψ⟩ = {fid.toFixed(6)}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 10 }}>
        <div className="panel" style={{ padding: 10, textAlign: 'center' }}>
          <div className="faint" style={{ fontSize: '0.78rem', marginBottom: 4 }}>Alice’s ψ-qubit</div>
          <MiniBloch v={aliceAnim} size={100} color={step >= 4 ? '#6b7385' : '#58c4dd'} />
        </div>
        <div className="panel" style={{ padding: 10, textAlign: 'center' }}>
          <div className="faint" style={{ fontSize: '0.78rem', marginBottom: 4 }}>Bob’s qubit (true state)</div>
          <MiniBloch v={bobAnim} size={100} color={step >= 6 ? '#58c4dd' : '#e07ab6'} />
          <div className="faint" style={{ fontSize: '0.72rem' }}>{step >= 4 && step < 6 ? `= ${m[1] ? 'X' : ''}${m[0] ? 'Z' : ''}${!m[0] && !m[1] ? '' : ' '}|ψ⟩` : step >= 6 ? '= |ψ⟩' : step >= 1 ? 'entangled: no state of its own' : '—'}</div>
        </div>
        <div className="panel" style={{ padding: 10, textAlign: 'center' }}>
          <div className="faint" style={{ fontSize: '0.78rem', marginBottom: 4 }}>Bob’s qubit (what Bob can know)</div>
          <MiniBloch v={bobView} size={100} color={step >= 6 ? '#58c4dd' : '#e07ab6'} />
          <div className="faint" style={{ fontSize: '0.72rem' }}>{step >= 6 ? 'bits received → |ψ⟩' : step >= 1 ? 'average over unknown results: random' : '—'}</div>
        </div>
      </div>
      {step === 3 && (
        <div style={{ marginTop: 10 }}>
          <div className="faint" style={{ fontSize: '0.78rem', marginBottom: 4 }}>Bob’s qubit in each of the four branches (before anyone measures)</div>
          <div className="row" style={{ gap: 8, justifyContent: 'space-around', flexWrap: 'wrap' }}>
            {[
              [0, 0],
              [0, 1],
              [1, 0],
              [1, 1],
            ].map(([a, b]) => (
              <div key={`${a}${b}`} style={{ textAlign: 'center' }}>
                <MiniBloch v={branchVec(psiV, a, b)} size={78} color="#e07ab6" />
                <div className="mono" style={{ fontSize: '0.75rem' }}>
                  m={a}{b}: {b ? 'X' : ''}{a ? 'Z' : ''}{!a && !b ? '' : ''}|ψ⟩
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Widget>
  );
}
