import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Widget } from '../../../components/ui';
import { StateVector } from '../../../engine/qsim';
import { AmplitudeView, PhaseLegend } from '../../../widgets/AmplitudeView';
import { MiniBloch } from '../../../widgets/MiniBloch';

const MSGS = ['00', '01', '10', '11'] as const;
type Msg = (typeof MSGS)[number];
const ENC: Record<Msg, { gates: string[]; bell: string }> = {
  '00': { gates: ['I'], bell: '|Φ⁺⟩ = (|00⟩ + |11⟩)/√2' },
  '01': { gates: ['X'], bell: '|Ψ⁺⟩ = (|01⟩ + |10⟩)/√2' },
  '10': { gates: ['Z'], bell: '|Φ⁻⟩ = (|00⟩ − |11⟩)/√2' },
  '11': { gates: ['X', 'Z'], bell: '|Ψ⁻⟩ = (|01⟩ − |10⟩)/√2' },
};

const STEPS = [
  'Choose a 2-bit message for Alice to send.',
  'A source makes a Bell pair |Φ⁺⟩ and sends one qubit to Alice, one to Bob. (This can happen days in advance.)',
  'Alice encodes her two bits by applying a gate to HER qubit only: I, X, Z or X-then-Z. This turns the shared state into one of the four Bell states.',
  'Alice sends her ONE qubit to Bob.',
  'Bob now holds both qubits. He undoes the Bell-pair circuit: CNOT, then H. This rotates the four Bell states onto |00⟩, |01⟩, |10⟩, |11⟩.',
  'Bob measures both qubits and reads Alice’s two bits, with certainty.',
];

function stateAt(msg: Msg, step: number): StateVector {
  const s = new StateVector(2);
  if (step >= 1) s.h(0).cx(0, 1);
  if (step >= 2) for (const g of ENC[msg].gates) if (g === 'X') s.x(0); else if (g === 'Z') s.z(0);
  if (step >= 4) s.cx(0, 1).h(0);
  return s;
}

/** Animated superdense-coding protocol: Alice, Bob, a Bell-pair source, and one travelling qubit. */
export function SuperdenseWidget() {
  const [msg, setMsg] = useState<Msg>('10');
  const [step, setStep] = useState(0);
  const [auto, setAuto] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (!auto) return;
    if (step >= STEPS.length - 1) {
      setAuto(false);
      return;
    }
    timer.current = window.setTimeout(() => setStep((s) => s + 1), 1500);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [auto, step]);

  const st = useMemo(() => stateAt(msg, step), [msg, step]);
  const amps = st.clone().canonicalPhase().amplitudes();
  const W = 760, H = 230;
  const AX = 120, BX = W - 120, SY = 46, QY = 150;
  // qubit positions
  const aPos = step === 0 ? { x: W / 2 - 14, y: SY } : step <= 2 ? { x: AX + 40, y: QY } : { x: BX - 70, y: QY };
  const bPos = step === 0 ? { x: W / 2 + 14, y: SY } : { x: BX - 26, y: QY };
  const entangled = step >= 1 && step <= 3;
  const gateLabel = step >= 2 ? ENC[msg].gates.join('·') : '';
  const out = step >= 5 ? msg : null;

  const orb = (p: { x: number; y: number }, col: string, label: string) => (
    <g style={{ transform: `translate(${p.x}px, ${p.y}px)`, transition: 'transform 1s cubic-bezier(.45,.05,.25,1)' }}>
      <circle r={17} fill={col} fillOpacity={0.2} />
      <circle r={10} fill={col} />
      <text y={32} fontSize={11} fill="#cfd6e4" textAnchor="middle">{label}</text>
    </g>
  );

  return (
    <Widget title="Superdense coding: two bits, one qubit">
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <span className="faint" style={{ fontSize: '0.85rem' }}>message:</span>
        {MSGS.map((m) => (
          <button key={m} className={`btn small mono ${msg === m ? 'active' : ''}`} onClick={() => { setMsg(m); setStep(0); setAuto(false); }}>
            {m}
          </button>
        ))}
        <span style={{ marginLeft: 'auto' }} />
        <button className="btn small" onClick={() => { setAuto(false); setStep((s) => Math.max(0, s - 1)); }} disabled={step === 0}>◀</button>
        <span className="mono" style={{ fontSize: '0.85rem' }}>step {step}/{STEPS.length - 1}</span>
        <button className="btn small" onClick={() => { setAuto(false); setStep((s) => Math.min(STEPS.length - 1, s + 1)); }} disabled={step === STEPS.length - 1}>▶</button>
        <button className="btn small primary" onClick={() => { if (step >= STEPS.length - 1) setStep(0); setAuto(true); }}>▶ play</button>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block', borderRadius: 12, background: 'linear-gradient(180deg, rgba(88,196,221,0.04), transparent)' }}>
        {/* stations */}
        <rect x={AX - 90} y={QY - 50} width={200} height={100} rx={14} fill="rgba(88,196,221,0.06)" stroke="#58c4dd55" />
        <text x={AX - 78} y={QY - 30} fontSize={13} fill="#58c4dd" fontWeight={700}>Alice</text>
        <rect x={BX - 110} y={QY - 50} width={200} height={100} rx={14} fill="rgba(252,211,77,0.06)" stroke="#fcd34d55" />
        <text x={BX + 78} y={QY - 30} fontSize={13} fill="#fcd34d" fontWeight={700} textAnchor="end">Bob</text>
        <text x={W / 2} y={SY - 26} fontSize={11} fill="#9aa3b5" textAnchor="middle">Bell-pair source</text>
        <circle cx={W / 2} cy={SY} r={24} fill="none" stroke="#e07ab6" strokeDasharray="3 3" />
        {/* channel */}
        <line x1={AX + 110} x2={BX - 110} y1={QY} y2={QY} stroke="#3a4256" strokeWidth={2} strokeDasharray="6 6" />
        <text x={W / 2} y={QY + 22} fontSize={10.5} fill="#6b7385" textAnchor="middle">quantum channel (carries one qubit)</text>
        {/* message card at Alice */}
        <g transform={`translate(${AX - 70}, ${QY - 8})`}>
          <rect width={52} height={30} rx={6} fill="#f4f1e8" />
          <text x={26} y={21} fontSize={16} fontWeight={700} textAnchor="middle" fill="#111" fontFamily="var(--mono)">{msg}</text>
        </g>
        {/* entanglement link */}
        {entangled && (
          <path
            d={`M ${aPos.x} ${aPos.y} Q ${(aPos.x + bPos.x) / 2} ${aPos.y - 70} ${bPos.x} ${bPos.y}`}
            fill="none"
            stroke="#e07ab6"
            strokeWidth={2}
            strokeDasharray="4 5"
            style={{ transition: 'all 1s' }}
          >
            <animate attributeName="stroke-dashoffset" from="0" to="-18" dur="0.8s" repeatCount="indefinite" />
          </path>
        )}
        {/* Alice's gate */}
        {step >= 2 && step <= 2 && (
          <g className="pop" transform={`translate(${AX + 40}, ${QY - 40})`}>
            <rect x={-22} y={-14} width={44} height={26} rx={6} fill="#141821" stroke={msg === '00' ? '#666' : '#e8655a'} strokeWidth={2} />
            <text y={5} fontSize={14} fontWeight={700} textAnchor="middle" fill={msg === '00' ? '#999' : '#e8655a'} fontFamily="var(--serif)">{gateLabel}</text>
          </g>
        )}
        {/* Bob's decoder */}
        {step >= 4 && (
          <g className="pop" transform={`translate(${BX - 48}, ${QY - 40})`}>
            <rect x={-46} y={-14} width={92} height={26} rx={6} fill="#141821" stroke="#f4d35e" strokeWidth={2} />
            <text y={5} fontSize={12.5} fontWeight={700} textAnchor="middle" fill="#f4d35e" fontFamily="var(--serif)">CNOT, then H</text>
          </g>
        )}
        {orb(aPos, '#e07ab6', step >= 3 ? 'from Alice' : 'qubit A')}
        {orb(bPos, '#e07ab6', 'qubit B')}
        {out && (
          <g className="pop" transform={`translate(${BX + 28}, ${QY - 8})`}>
            <rect width={52} height={30} rx={6} fill="#83c167" />
            <text x={26} y={21} fontSize={16} fontWeight={700} textAnchor="middle" fill="#111" fontFamily="var(--mono)">{out}</text>
          </g>
        )}
      </svg>
      <div className="panel" style={{ padding: 10, marginTop: 8, minHeight: 46 }}>
        <b className="mono" style={{ color: 'var(--yellow)' }}>{step}.</b> {STEPS[step]}
        {step >= 2 && step <= 3 && <div className="mono" style={{ fontSize: '0.85rem', marginTop: 4, color: 'var(--pink)' }}>shared state: {ENC[msg].bell}</div>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1.4fr) 1fr', gap: 14, marginTop: 10, alignItems: 'center' }}>
        <div>
          <div className="faint" style={{ fontSize: '0.78rem' }}>two-qubit state |A B⟩ (A = Alice’s qubit, written first)</div>
          <AmplitudeView amps={amps} n={2} compact />
          <PhaseLegend size={34} />
        </div>
        <div className="row" style={{ gap: 12, justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <MiniBloch v={st.bloch(0)} size={86} color={st.entropy1(0) > 0.01 ? '#e07ab6' : '#fcd34d'} />
            <div className="faint" style={{ fontSize: '0.72rem' }}>qubit A alone</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <MiniBloch v={st.bloch(1)} size={86} color={st.entropy1(1) > 0.01 ? '#e07ab6' : '#fcd34d'} />
            <div className="faint" style={{ fontSize: '0.72rem' }}>qubit B alone</div>
          </div>
        </div>
      </div>
      {step >= 1 && step <= 3 && (
        <div className="faint" style={{ fontSize: '0.78rem', marginTop: 4 }}>
          While it travels, qubit A on its own is maximally mixed (a dot at the centre) whatever Alice encoded. An eavesdropper who grabs it learns nothing.
        </div>
      )}
    </Widget>
  );
}
