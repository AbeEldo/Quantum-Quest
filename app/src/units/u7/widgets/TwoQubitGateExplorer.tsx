import React, { useMemo, useState } from 'react';
import { Widget, Segmented } from '../../../components/ui';
import { AmplitudeView } from '../../../widgets/AmplitudeView';
import { MiniBloch } from '../../../widgets/MiniBloch';
import { c, type C, type Mat } from '../../../engine/complex';
import { StateVector } from '../../../engine/qsim';
import { circuitUnitary } from '../../../engine/circuit';
import { parseCircuit } from '../../../engine/parse';
import { MatrixGrid } from './MatrixGrid';

type GateKey = 'CNOT01' | 'CNOT10' | 'CZ' | 'SWAP' | 'CS' | 'CH' | 'HI' | 'IH';

const GATES: Record<GateKey, { label: string; circuit: string; note: string }> = {
  CNOT01: { label: 'CNOT 0→1', circuit: 'CNOT 0 1', note: 'Flips q1 when q0 = 1. A permutation matrix: it just shuffles basis states.' },
  CNOT10: { label: 'CNOT 1→0', circuit: 'CNOT 1 0', note: 'Same gate, control and target swapped — a different permutation.' },
  CZ: { label: 'CZ', circuit: 'CZ 0 1', note: 'Diagonal: −1 on |11⟩ only. Swapping the roles of the qubits changes nothing — CZ is symmetric.' },
  SWAP: { label: 'SWAP', circuit: 'SWAP 0 1', note: 'Exchanges |01⟩ ↔ |10⟩; |00⟩ and |11⟩ are left alone.' },
  CS: { label: 'C-S', circuit: 'CP(pi/2) 0 1', note: 'Controlled-S: a phase i on |11⟩. Also symmetric (every controlled-phase is).' },
  CH: { label: 'C-H', circuit: 'Ry(pi/4) 1; CNOT 0 1; Ry(-pi/4) 1', note: 'Controlled-Hadamard: block-diagonal, [I 0; 0 H] — the controlled-U pattern.' },
  HI: { label: 'H ⊗ I', circuit: 'H 0', note: 'H on q0 only. The matrix is H ⊗ I: H\'s entries, each multiplied by a 2×2 identity block.' },
  IH: { label: 'I ⊗ H', circuit: 'H 1', note: 'H on q1 only: I ⊗ H, a block-diagonal copy of H. Compare with H ⊗ I!' },
};

type In1 = '0' | '1' | '+' | '-';
const SINGLE: Record<In1, [number, number]> = { '0': [1, 0], '1': [0, 1], '+': [Math.SQRT1_2, Math.SQRT1_2], '-': [Math.SQRT1_2, -Math.SQRT1_2] };

/** reorder a 4×4 matrix / vector from |q0 q1⟩ ordering to Qiskit's |q1 q0⟩ ordering */
const REV = [0, 2, 1, 3];

function GateGlyph({ g }: { g: GateKey }) {
  const y0 = 22, y1 = 62, x = 90;
  const wire = (y: number, lab: string) => (
    <g>
      <text x={6} y={y + 4} fontSize={12} fill="#9aa3b5" fontFamily="var(--mono)">{lab}</text>
      <line x1={30} x2={160} y1={y} y2={y} stroke="#4a5368" strokeWidth={1.5} />
    </g>
  );
  const dot = (y: number, col: string) => <circle cx={x} cy={y} r={5.5} fill={col} />;
  const plus = (y: number, col: string) => (
    <g stroke={col} strokeWidth={2}>
      <circle cx={x} cy={y} r={11} fill="#141821" />
      <line x1={x - 11} x2={x + 11} y1={y} y2={y} />
      <line x1={x} x2={x} y1={y - 11} y2={y + 11} />
    </g>
  );
  const box = (y: number, label: string, col: string) => (
    <g>
      <rect x={x - 15} y={y - 15} width={30} height={30} rx={6} fill="#141821" stroke={col} strokeWidth={2} />
      <text x={x} y={y + 5} textAnchor="middle" fontSize={label.length > 1 ? 11 : 15} fontWeight={700} fill={col} fontFamily="var(--serif)">{label}</text>
    </g>
  );
  const vline = (col: string) => <line x1={x} x2={x} y1={y0} y2={y1} stroke={col} strokeWidth={2} />;
  const cross = (y: number) => (
    <g stroke="#bbb" strokeWidth={2.5}>
      <line x1={x - 7} x2={x + 7} y1={y - 7} y2={y + 7} />
      <line x1={x - 7} x2={x + 7} y1={y + 7} y2={y - 7} />
    </g>
  );
  let body: React.ReactNode = null;
  if (g === 'CNOT01') body = <>{vline('#e8655a')}{dot(y0, '#e8655a')}{plus(y1, '#e8655a')}</>;
  if (g === 'CNOT10') body = <>{vline('#e8655a')}{plus(y0, '#e8655a')}{dot(y1, '#e8655a')}</>;
  if (g === 'CZ') body = <>{vline('#58c4dd')}{dot(y0, '#58c4dd')}{dot(y1, '#58c4dd')}</>;
  if (g === 'SWAP') body = <>{vline('#bbb')}{cross(y0)}{cross(y1)}</>;
  if (g === 'CS') body = <>{vline('#9a72ac')}{dot(y0, '#9a72ac')}{box(y1, 'S', '#9a72ac')}</>;
  if (g === 'CH') body = <>{vline('#f4d35e')}{dot(y0, '#f4d35e')}{box(y1, 'H', '#f4d35e')}</>;
  if (g === 'HI') body = box(y0, 'H', '#f4d35e');
  if (g === 'IH') body = box(y1, 'H', '#f4d35e');
  return (
    <svg width={170} height={84} style={{ display: 'block' }}>
      {wire(y0, 'q0')}
      {wire(y1, 'q1')}
      {body}
    </svg>
  );
}

/**
 * Explore the 4×4 matrices of two-qubit gates, their action on product inputs, and the
 * bit-ordering convention (this course / Nielsen & Chuang vs Qiskit).
 */
export function TwoQubitGateExplorer() {
  const [g, setG] = useState<GateKey>('CNOT01');
  const [order, setOrder] = useState<'nc' | 'qiskit'>('nc');
  const [a, setA] = useState<In1>('1');
  const [b, setB] = useState<In1>('0');

  const U: Mat = useMemo(() => circuitUnitary(parseCircuit(GATES[g].circuit, 2)), [g]);
  const input: C[] = useMemo(() => {
    const x = SINGLE[a], y = SINGLE[b];
    return [x[0] * y[0], x[0] * y[1], x[1] * y[0], x[1] * y[1]].map((v) => c(v));
  }, [a, b]);
  const out: C[] = useMemo(
    () =>
      U.map((row) =>
        row.reduce((acc, z, j) => c(acc.re + z.re * input[j].re - z.im * input[j].im, acc.im + z.re * input[j].im + z.im * input[j].re), c(0)),
      ),
    [U, input],
  );
  const sv = StateVector.fromAmplitudes(out);
  const ent = sv.entropy1(0);

  const isBasis = (a === '0' || a === '1') && (b === '0' || b === '1');
  const basisIdx = isBasis ? (a === '1' ? 2 : 0) + (b === '1' ? 1 : 0) : null;

  const shownU: Mat = order === 'nc' ? U : REV.map((i) => REV.map((j) => U[i][j]));
  const labels = order === 'nc' ? ['|00⟩', '|01⟩', '|10⟩', '|11⟩'] : ['|00⟩', '|01⟩', '|10⟩', '|11⟩'];
  const hl = basisIdx === null ? null : order === 'nc' ? basisIdx : REV[basisIdx];
  const orderNote =
    order === 'nc'
      ? 'Labels read |q0 q1⟩: the top wire is the LEFT bit (this course, Nielsen & Chuang, Quirk).'
      : 'Labels read |q1 q0⟩: q0 is the RIGHT-most bit (Qiskit\'s little-endian convention). Same gate, different-looking matrix!';

  const inBtn = (val: In1, cur: In1, set: (v: In1) => void) => (
    <button key={val} className={`btn small ${cur === val ? 'active' : ''}`} style={{ minWidth: 38, justifyContent: 'center' }} onClick={() => set(val)}>
      |{val === '-' ? '−' : val}⟩
    </button>
  );

  return (
    <Widget title="Two-qubit gates: matrices, inputs and bit order">
      <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {(Object.keys(GATES) as GateKey[]).map((k) => (
          <button key={k} className={`btn small ${g === k ? 'active' : ''}`} onClick={() => setG(k)}>
            {GATES[k].label}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1fr) minmax(240px, 1fr)', gap: 18, alignItems: 'start' }}>
        <div className="col" style={{ gap: 10 }}>
          <GateGlyph g={g} />
          <div className="faint" style={{ fontSize: '0.85rem', minHeight: 40 }}>{GATES[g].note}</div>
          <div className="panel" style={{ padding: 10 }}>
            <div className="row" style={{ gap: 6, marginBottom: 6 }}>
              <span className="mono faint" style={{ width: 76, whiteSpace: 'nowrap', fontSize: '0.85rem' }}>q0 input</span>
              {(['0', '1', '+', '-'] as In1[]).map((v) => inBtn(v, a, setA))}
            </div>
            <div className="row" style={{ gap: 6 }}>
              <span className="mono faint" style={{ width: 76, whiteSpace: 'nowrap', fontSize: '0.85rem' }}>q1 input</span>
              {(['0', '1', '+', '-'] as In1[]).map((v) => inBtn(v, b, setB))}
            </div>
          </div>
          <div>
            <div className="faint" style={{ fontSize: '0.78rem', marginBottom: 4 }}>
              Output state (always written |q0 q1⟩ here)
            </div>
            <AmplitudeView amps={out} n={2} compact />
            <div className="row" style={{ gap: 10, marginTop: 8, alignItems: 'center' }}>
              <MiniBloch v={sv.bloch(0)} size={62} label="q0" color={ent > 0.01 ? '#e07ab6' : '#fcd34d'} />
              <MiniBloch v={sv.bloch(1)} size={62} label="q1" color={ent > 0.01 ? '#e07ab6' : '#fcd34d'} />
              <span className={`pill ${ent > 0.01 ? 'warn' : 'good'}`}>{ent > 0.01 ? `entangled (${(ent * 100).toFixed(0)}%)` : 'product state'}</span>
            </div>
          </div>
        </div>
        <div className="col" style={{ gap: 8, alignItems: 'center' }}>
          <Segmented
            options={[
              { value: 'nc', label: 'this course: |q0 q1⟩' },
              { value: 'qiskit', label: 'Qiskit: |q1 q0⟩' },
            ]}
            value={order}
            onChange={setOrder}
          />
          <MatrixGrid
            U={shownU}
            labels={labels}
            cell={50}
            highlightCol={hl}
            onColClick={(j) => {
              const idx = order === 'nc' ? j : REV[j];
              setA(idx & 2 ? '1' : '0');
              setB(idx & 1 ? '1' : '0');
            }}
            title="columns = inputs, rows = outputs (click a column)"
          />
          <div className="faint" style={{ fontSize: '0.82rem', maxWidth: 330 }}>{orderNote}</div>
        </div>
      </div>
    </Widget>
  );
}
