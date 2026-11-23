import React, { useState } from 'react';
import { Widget, RichText } from '../../../components/ui';

const WORLDS: { n: number; title: string; color: string; idea: string; formula: string; remember: string }[] = [
  { n: 0, title: 'Math Toolkit', color: '#9aa3b5', idea: 'Complex numbers are rotations; states are vectors; operators are matrices; n qubits live in a $2^n$-dimensional tensor product.', formula: '$e^{i\\theta} = \\cos\\theta + i\\sin\\theta$', remember: 'Phase is an angle, and angles can cancel.' },
  { n: 1, title: 'When Classical Physics Broke', color: '#c49a6c', idea: 'Blackbody radiation, the photoelectric effect and atomic spectra forced energy to come in quanta.', formula: '$E = h\\nu$', remember: 'Light and energy are lumpy.' },
  { n: 2, title: 'Wave–Particle Duality', color: '#58c4dd', idea: 'Single particles interfere with themselves, and which-path information destroys the interference.', formula: '$P = |\\psi_1 + \\psi_2|^2 \\ne |\\psi_1|^2 + |\\psi_2|^2$', remember: 'Add amplitudes, then square.' },
  { n: 3, title: 'Spin and the Qubit', color: '#fcd34d', idea: 'A two-level system is a point on the Bloch sphere; measurement gives Born-rule probabilities.', formula: '$|\\psi\\rangle = \\cos\\tfrac\\theta2|0\\rangle + e^{i\\phi}\\sin\\tfrac\\theta2|1\\rangle$', remember: 'Antipodal points are orthogonal.' },
  { n: 4, title: 'The Postulates', color: '#83c167', idea: 'Observables are Hermitian, evolution is unitary, measurement projects. Commutators give uncertainty.', formula: '$i\\hbar\\,\\partial_t|\\psi\\rangle = H|\\psi\\rangle$', remember: 'Between measurements, everything is linear and reversible.' },
  { n: 5, title: 'Wavefunctions in Space', color: '#5cd0b3', idea: 'Particles in boxes and wells have quantised energies; wave packets spread and tunnel; x and p are Fourier partners.', formula: '$\\Delta x\\,\\Delta p \\ge \\hbar/2$', remember: 'Confinement makes energy levels; the anharmonic oscillator makes a transmon.' },
  { n: 6, title: 'Entanglement', color: '#e07ab6', idea: 'Some joint states are not products; their correlations beat every local hidden-variable theory (CHSH 85% vs 75%).', formula: '$|\\Phi^+\\rangle = \\tfrac{1}{\\sqrt2}(|00\\rangle + |11\\rangle)$', remember: 'Correlation without communication; no cloning.' },
  { n: 7, title: 'Quantum Circuits', color: '#ff8c42', idea: 'Gates are rotations; CNOT entangles; H, T and CNOT are universal; phase kickback powers algorithms.', formula: '$HZH = X$', remember: 'Any computation is a circuit of small gates.' },
  { n: 8, title: 'Protocols', color: '#9a72ac', idea: 'Teleportation, superdense coding and QKD turn entanglement and measurement disturbance into tools.', formula: '1 ebit + 2 cbits ⇒ 1 qubit', remember: 'Eavesdropping leaves fingerprints.' },
  { n: 9, title: 'Algorithms', color: '#f0ac5f', idea: 'Interference amplifies right answers: Deutsch–Jozsa, Simon, Grover (√N), QFT, phase estimation, Shor.', formula: '$\\approx \\tfrac{\\pi}{4}\\sqrt N$ Grover iterations', remember: 'Quantum computers don\'t try every answer; they make wrong answers cancel.' },
  { n: 10, title: 'Noise and Decoherence', color: '#b08968', idea: 'Density matrices, T₁/T₂, channels and the environment explain why qubits forget and why measurement looks like collapse.', formula: '$\\mathcal E(\\rho) = \\sum_k K_k\\rho K_k^\\dagger$', remember: 'Every uncontrolled interaction is a measurement.' },
  { n: 11, title: 'Error Correction & Hardware', color: '#5cd0b3', idea: 'Measure parities, not data; errors digitise; surface codes suppress errors exponentially below threshold.', formula: '$\\varepsilon_L \\approx A(p/p_{th})^{(d+1)/2}$', remember: 'Below threshold, bigger is better.' },
  { n: 12, title: 'Capstone', color: '#ffd700', idea: 'Put it together: teleport, protect, search. Then go build something.', formula: '$|\\psi\\rangle \\to$ you', remember: 'The rest is engineering, and engineering is the hard part.' },
];

/** Constellation of all worlds: click a star to recall its key idea. */
export function CourseRecap() {
  const [sel, setSel] = useState(10);
  const [seen, setSeen] = useState<Set<number>>(new Set([10]));
  const W = 680, H = 210;
  const pos = (i: number): [number, number] => [40 + i * ((W - 80) / 12), H / 2 + Math.sin(i * 1.15) * 60];
  const w = WORLDS[sel];
  return (
    <Widget title="The arc of the course (click each star)">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
        <polyline points={WORLDS.map((_, i) => pos(i).join(',')).join(' ')} fill="none" stroke="#2f3a4f" strokeWidth={2} />
        {WORLDS.map((x, i) => {
          const [cx, cy] = pos(i);
          const on = seen.has(i);
          return (
            <g key={i} onClick={() => { setSel(i); setSeen(new Set([...seen, i])); }} style={{ cursor: 'pointer' }}>
              <circle cx={cx} cy={cy} r={sel === i ? 17 : 12} fill={on ? x.color : '#1d2230'} stroke={x.color} strokeWidth={2} opacity={on ? 1 : 0.7} style={{ transition: 'all .25s', filter: sel === i ? `drop-shadow(0 0 8px ${x.color})` : undefined }} />
              <text x={cx} y={cy + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={on ? '#111' : x.color}>{x.n}</text>
              <text x={cx} y={cy + (i % 2 ? -24 : 32)} textAnchor="middle" fontSize={9.5} fill="#9aa3b5">{x.title.split(' ')[0]}</text>
            </g>
          );
        })}
      </svg>
      <div className="panel pop" key={sel} style={{ padding: 12, borderColor: w.color }}>
        <b style={{ color: w.color }}>World {w.n} · {w.title}</b>
        <div style={{ marginTop: 6 }}><RichText text={w.idea} /></div>
        <div style={{ marginTop: 6, fontSize: '1.1rem', textAlign: 'center' }}><RichText text={w.formula} /></div>
        <div className="faint" style={{ marginTop: 6 }}>💡 <RichText text={w.remember} /></div>
      </div>
      <div className="faint" style={{ fontSize: '0.8rem', marginTop: 4 }}>Stars lit: {seen.size}/13 {seen.size === 13 ? '— the whole constellation!' : ''}</div>
    </Widget>
  );
}
