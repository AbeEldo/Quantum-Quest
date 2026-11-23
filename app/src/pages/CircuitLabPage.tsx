import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { CircuitLab } from '../widgets/CircuitLab';
import { Circuit, GateName } from '../engine/circuit';
import { circuitToText, parseCircuit } from '../engine/parse';

const ALL: GateName[] = ['H', 'X', 'Y', 'Z', 'S', 'Sdg', 'T', 'Tdg', 'SX', 'Rx', 'Ry', 'Rz', 'P', 'CNOT', 'CZ', 'CP', 'SWAP', 'CCX', 'M'];

const PRESETS: { name: string; n: number; text: string }[] = [
  { name: 'Bell pair', n: 2, text: 'H 0; CNOT 0 1' },
  { name: 'GHZ (3 qubits)', n: 3, text: 'H 0; CNOT 0 1; CNOT 1 2' },
  { name: 'Phase kickback', n: 2, text: 'X 1; H 0 1; CNOT 0 1; H 0' },
  { name: 'Teleportation (deferred measurement)', n: 3, text: 'Ry(pi/3) 0; H 1; CNOT 1 2; CNOT 0 1; H 0; CNOT 1 2; CZ 0 2' },
  { name: 'Grover, 2 qubits, marks |11⟩', n: 2, text: 'H 0 1; CZ 0 1; H 0 1; X 0 1; CZ 0 1; X 0 1; H 0 1' },
  { name: '3-qubit QFT of |001⟩', n: 3, text: 'X 2; H 0; CP(pi/2) 1 0; CP(pi/4) 2 0; H 1; CP(pi/2) 2 1; H 2; SWAP 0 2' },
];

export function CircuitLabPage() {
  const [circ, setCirc] = useState<Circuit | null>(null);
  const [key, setKey] = useState(0);
  const [init, setInit] = useState<{ n: number; text: string }>({ n: 3, text: '' });
  const [textIn, setTextIn] = useState('');
  const [err, setErr] = useState('');

  const load = (n: number, text: string) => {
    try {
      const c = parseCircuit(text, n);
      setInit({ n: Math.max(n, c.n), text });
      setKey((k) => k + 1);
      setErr('');
    } catch (e) {
      setErr(String((e as Error).message));
    }
  };

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '20px 20px 80px' }}>
      <Link to="/labs">← Labs</Link>
      <h1 style={{ margin: '10px 0 4px' }}>⚡ Circuit Lab — sandbox</h1>
      <p className="dim" style={{ marginTop: 0 }}>
        Free play with up to 6 qubits and every gate. Pick a gate, then click a wire to place it. For two-qubit gates, click the control first and then the target. Right-click a gate to delete it. Use the step slider to watch the state change one column at a time.
      </p>
      <div className="row" style={{ marginBottom: 6 }}>
        <span className="faint">Presets:</span>
        {PRESETS.map((p) => (
          <button key={p.name} className="btn small" onClick={() => load(p.n, p.text)}>
            {p.name}
          </button>
        ))}
      </div>
      <CircuitLab key={key} title="Sandbox" n={init.n} circuit={init.text || undefined} gates={ALL} maxQubits={6} showHistogram columns={12} onChange={setCirc} />
      <div className="panel" style={{ marginTop: 10 }}>
        <div className="faint" style={{ fontSize: '0.85rem', marginBottom: 6 }}>
          Circuit as text (columns separated by <code>;</code>, e.g. <code>H 0; CNOT 0 1; Rx(pi/4) 2</code>):
        </div>
        <div className="mono" style={{ fontSize: '0.85rem', marginBottom: 8, color: 'var(--yellow)' }}>{circ ? circuitToText(circ) || '(empty)' : init.text || '(empty)'}</div>
        <div className="row">
          <input type="text" value={textIn} onChange={(e) => setTextIn(e.target.value)} placeholder="Paste circuit text…" style={{ flex: 1, minWidth: 260 }} />
          <button className="btn small primary" onClick={() => load(circ?.n ?? init.n, textIn)}>
            Load
          </button>
        </div>
        {err && <div style={{ color: 'var(--red)', marginTop: 6 }}>{err}</div>}
      </div>
    </div>
  );
}
