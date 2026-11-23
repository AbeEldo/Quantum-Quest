import React, { useState } from 'react';
import { Widget, Segmented } from '../../../components/ui';

type Key = 'sc' | 'ion' | 'atom' | 'photon' | 'spin' | 'topo';
type Metric = 'err' | 'time' | 'coh' | 'ratio';

interface Platform {
  name: string;
  color: string;
  icon: string;
  qubit: string;
  control: string;
  readout: string;
  pros: string[];
  cons: string[];
  who: string;
  /** two-qubit gate error range (fraction) */
  err?: [number, number];
  /** two-qubit gate time range (s) */
  time?: [number, number];
  /** coherence (T2-ish) range (s) */
  coh?: [number, number];
  scale: string;
  connectivity: string;
  temp: string;
  note?: string;
}

const P: Record<Key, Platform> = {
  sc: {
    name: 'Superconducting circuits', color: '#58c4dd', icon: '〰',
    qubit: 'A "transmon": an aluminium/niobium/tantalum circuit with a Josephson junction, an anharmonic LC oscillator whose lowest two levels are |0⟩ and |1⟩ (World 5).',
    control: 'Shaped microwave pulses (~5 GHz) down coaxial lines; two-qubit gates via tunable couplers or cross-resonance.',
    readout: 'Dispersive readout through a coupled microwave resonator (~0.1–1 µs).',
    pros: ['Fastest gates (tens of ns)', 'Made with chip fabrication techniques', 'Most QEC experiments so far (Google Willow)'],
    cons: ['Needs ~10 mK dilution refrigerators and lots of wiring', 'Fixed nearest-neighbour connectivity', 'Shorter coherence; fabrication variation; correlated errors (e.g. cosmic rays)'],
    who: 'Google, IBM, Rigetti, AWS, IQM, Alibaba/USTC (Zuchongzhi) and others',
    err: [0.001, 0.01], time: [2e-8, 3e-7], coh: [5e-5, 1.7e-3],
    scale: '100–156 high-quality qubits per chip (Willow 105, Heron 156, Nighthawk 120); IBM Condor had 1,121',
    connectivity: 'Fixed 2D grid (square or heavy-hex)',
    temp: '≈ 10 mK',
  },
  ion: {
    name: 'Trapped ions', color: '#fcd34d', icon: '⦿',
    qubit: 'Two hyperfine (or optical) levels of a single atomic ion (e.g. ¹⁷¹Yb⁺, ¹³⁷Ba⁺, ⁴⁰Ca⁺) held in vacuum by electric fields.',
    control: 'Laser beams or microwaves; two-qubit gates use the ions\' shared vibrational motion (Mølmer–Sørensen gates). Ions can be shuttled around trap zones.',
    readout: 'State-dependent fluorescence: one state glows under a laser, the other stays dark.',
    pros: ['Identical qubits made by nature', 'Highest gate fidelities (99.9%+; 99.99% reported)', 'Very long coherence', 'All-to-all connectivity'],
    cons: ['Slow gates (µs–ms with transport)', 'Scaling beyond ~100 ions per trap needs shuttling, photonic links or 2D traps', 'Complex laser systems'],
    who: 'Quantinuum, IonQ (incl. Oxford Ionics), AQT, Universal Quantum and academic labs',
    err: [0.0001, 0.005], time: [1e-5, 1e-3], coh: [1, 3600],
    scale: '~50–100 qubits (Quantinuum Helios: 98)',
    connectivity: 'All-to-all',
    temp: 'Ions laser-cooled to ~mK motion; traps at room temperature or cryogenic',
  },
  atom: {
    name: 'Neutral atoms', color: '#83c167', icon: '⁘',
    qubit: 'Hyperfine (or nuclear-spin) levels of neutral atoms (Rb, Cs, Sr, Yb) each held by a focused laser beam, an "optical tweezer".',
    control: 'Lasers; two-qubit gates by briefly exciting atoms to giant Rydberg states that interact strongly. Tweezers physically move atoms to reconnect them.',
    readout: 'Fluorescence imaging with a camera.',
    pros: ['Thousands of identical qubits in one vacuum cell', 'Reconfigurable connectivity (move the atoms!)', 'Parallel operations, fast progress in logical-qubit demos'],
    cons: ['Atom loss and slow cycle times (moves and imaging take ~ms)', 'Two-qubit fidelity just reaching 99.5%+', 'Continuous reloading needed for long runs'],
    who: 'QuEra/Harvard/MIT, Atom Computing (with Microsoft), Pasqal, Infleqtion, Caltech',
    err: [0.003, 0.01], time: [2e-7, 1e-6], coh: [1, 13],
    scale: 'Arrays of 1,000–6,100 atoms trapped; ~100–450 used in logical-qubit experiments',
    connectivity: 'Reconfigurable (atoms shuttled)',
    temp: 'Atoms at µK in a room-temperature apparatus',
  },
  photon: {
    name: 'Photonics', color: '#e07ab6', icon: '✦',
    qubit: 'Single photons: polarization, path or time-bin encodings, or squeezed "continuous-variable" light.',
    control: 'Beam splitters and phase shifters on chips (waveguides); entangling operations are probabilistic and done by measurement ("fusion"), so the architecture is measurement-based.',
    readout: 'Single-photon detectors (superconducting nanowires).',
    pros: ['Photons barely decohere and fly naturally between modules', 'Room-temperature optics, chip-foundry manufacturing', 'Very fast clock rates'],
    cons: ['Photon loss is the dominant error', 'Two-qubit gates are probabilistic: huge resource overheads', 'Detectors and some sources need cryogenics'],
    who: 'PsiQuantum, Xanadu, Quandela, ORCA, USTC (Jiuzhang)',
    scale: 'Boson-sampling experiments with dozens of photons; universal fault-tolerant machines still under construction',
    connectivity: 'Flexible (optical fibre / switches)',
    temp: 'Mostly room temperature; detectors at ~1–4 K',
    note: 'Gate error and coherence aren\'t directly comparable here: loss per component is the key figure.',
  },
  spin: {
    name: 'Spin qubits (silicon)', color: '#9a72ac', icon: '◉',
    qubit: 'The spin of a single electron (or hole) trapped in a semiconductor quantum dot, or of a donor atom (e.g. phosphorus) in silicon.',
    control: 'Microwave or electric-dipole spin resonance; two-qubit gates by tuning the exchange interaction between neighbouring dots with gate voltages.',
    readout: 'Spin-to-charge conversion sensed by a nearby charge sensor (~µs).',
    pros: ['Tiny (≈100 nm) and compatible with CMOS fabs: the "billions of qubits" dream', 'Can operate at ~1 K ("hot qubits")', 'Long coherence in isotopically pure ²⁸Si'],
    cons: ['Small devices so far (~10–20 qubits)', 'Variability between dots; crowded wiring', 'Two-qubit fidelities just above 99%'],
    who: 'Intel, Diraq, Quantum Motion, Silicon Quantum Computing, QuTech, RIKEN',
    err: [0.005, 0.02], time: [1e-8, 1e-6], coh: [1e-4, 5e-3],
    scale: '~10–20 qubits per device (Intel Tunnel Falls: 12)',
    connectivity: 'Nearest neighbour (1D/2D arrays)',
    temp: '0.1–1 K',
  },
  topo: {
    name: 'Topological (Majorana)', color: '#fc6255', icon: '∞',
    qubit: 'Information stored non-locally in pairs of Majorana zero modes at the ends of superconductor–semiconductor nanowires, read via the wire\'s fermion parity.',
    control: 'Braiding or measurement-based operations on the Majoranas (in theory).',
    readout: 'Parity measurement through quantum dots and microwave reflectometry.',
    pros: ['If it works: errors suppressed by physics itself, potentially far smaller overheads', 'Digital, measurement-based control'],
    cons: ['No independently verified topological qubit yet', 'Microsoft\'s Majorana 1 (2025) and Majorana 2 (2026) claims are disputed; a 2018 Majorana paper was retracted in 2021'],
    who: 'Microsoft (Station Q / Azure Quantum), academic groups',
    scale: 'Single devices; operations on a protected qubit not yet demonstrated in a peer-reviewed result',
    connectivity: '—',
    temp: '≈ 10–50 mK',
    note: 'No reliable gate or coherence figures exist yet.',
  },
};

const METRICS: Record<Metric, { label: string; unit: string; range: [number, number]; better: 'low' | 'high'; get: (p: Platform) => [number, number] | undefined; fmt: (v: number) => string }> = {
  err: { label: 'Two-qubit gate error', unit: '', range: [5e-5, 0.05], better: 'low', get: (p) => p.err, fmt: (v) => `${+(v * 100).toPrecision(2)}%` },
  time: { label: 'Two-qubit gate time', unit: 's', range: [5e-9, 3e-3], better: 'low', get: (p) => p.time, fmt: (v) => (v < 1e-6 ? `${+(v * 1e9).toPrecision(2)} ns` : v < 1e-3 ? `${+(v * 1e6).toPrecision(2)} µs` : `${+(v * 1e3).toPrecision(2)} ms`) },
  coh: { label: 'Coherence time (T₂, with echo)', unit: 's', range: [3e-5, 1e4], better: 'high', get: (p) => p.coh, fmt: (v) => (v < 1e-3 ? `${+(v * 1e6).toPrecision(2)} µs` : v < 1 ? `${+(v * 1e3).toPrecision(2)} ms` : v < 120 ? `${+v.toPrecision(2)} s` : `${+(v / 60).toPrecision(2)} min`) },
  ratio: {
    label: 'Coherence ÷ gate time (ops before decoherence)', unit: '', range: [10, 1e9], better: 'high',
    get: (p) => (p.coh && p.time ? [p.coh[0] / p.time[1], p.coh[1] / p.time[0]] : undefined),
    fmt: (v) => v.toExponential(0).replace('e+', '×10^'),
  },
};

/** Interactive comparison of qubit platforms (approximate, dated late 2026). */
export function PlatformComparison() {
  const [sel, setSel] = useState<Key>('sc');
  const [metric, setMetric] = useState<Metric>('err');
  const M = METRICS[metric];
  const W = 620, rowH = 34, left = 190, right = 20;
  const keys = Object.keys(P) as Key[];
  const lx = (v: number) => left + ((Math.log10(v) - Math.log10(M.range[0])) / (Math.log10(M.range[1]) - Math.log10(M.range[0]))) * (W - left - right);
  const ticks: number[] = [];
  for (let e = Math.ceil(Math.log10(M.range[0])); e <= Math.floor(Math.log10(M.range[1])); e++) ticks.push(10 ** e);
  const p = P[sel];
  return (
    <Widget title="Qubit platforms compared (approximate, late 2026)">
      <div className="row" style={{ marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
        <Segmented value={metric} onChange={setMetric} options={(Object.keys(METRICS) as Metric[]).map((m) => ({ value: m, label: METRICS[m].label.split(' (')[0] }))} />
      </div>
      <svg viewBox={`0 0 ${W} ${keys.length * rowH + 40}`} style={{ width: '100%', display: 'block' }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={lx(t)} x2={lx(t)} y1={6} y2={keys.length * rowH + 8} stroke="#232a38" />
            <text x={lx(t)} y={keys.length * rowH + 24} fontSize={10.5} fill="#7d8699" textAnchor="middle">{M.fmt(t)}</text>
          </g>
        ))}
        <text x={W - right} y={keys.length * rowH + 38} fontSize={11} fill="#9aa3b5" textAnchor="end" fontStyle="italic">
          {M.label} (log scale) — {M.better === 'low' ? 'shorter bar end to the left is better' : 'further right is better'}
        </text>
        {keys.map((k, i) => {
          const r = M.get(P[k]);
          const y = 10 + i * rowH;
          return (
            <g key={k} onClick={() => setSel(k)} style={{ cursor: 'pointer' }}>
              <rect x={0} y={y - 4} width={W} height={rowH - 4} fill={sel === k ? 'rgba(88,196,221,.07)' : 'transparent'} rx={6} />
              <text x={8} y={y + 16} fontSize={13} fill={P[k].color} fontWeight={sel === k ? 700 : 500}>
                {P[k].icon} {P[k].name}
              </text>
              {r ? (
                <>
                  <rect x={lx(r[0])} y={y + 4} width={Math.max(4, lx(r[1]) - lx(r[0]))} height={16} rx={8} fill={P[k].color} opacity={0.75} style={{ transition: 'all .4s cubic-bezier(.2,.8,.2,1)' }} />
                  <text x={lx(r[1]) + 6} y={y + 16} fontSize={10.5} fill="#cfd6e4">
                    {M.fmt(r[0])} – {M.fmt(r[1])}
                  </text>
                </>
              ) : (
                <text x={left + 4} y={y + 16} fontSize={11} fill="#6b7385" fontStyle="italic">
                  not comparable / no reliable data
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="panel pop" key={sel} style={{ marginTop: 8, padding: 12, borderColor: p.color }}>
        <div style={{ color: p.color, fontWeight: 700, fontSize: '1.05rem' }}>
          {p.icon} {p.name}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(100px, 0.3fr) 1fr', gap: '4px 12px', fontSize: '0.88rem', marginTop: 6 }}>
          <span className="dim">The qubit</span><span>{p.qubit}</span>
          <span className="dim">Control</span><span>{p.control}</span>
          <span className="dim">Readout</span><span>{p.readout}</span>
          <span className="dim">Scale</span><span>{p.scale}</span>
          <span className="dim">Connectivity</span><span>{p.connectivity}</span>
          <span className="dim">Temperature</span><span>{p.temp}</span>
          <span className="dim">Who</span><span>{p.who}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8, fontSize: '0.86rem' }}>
          <div>
            <b style={{ color: 'var(--green)' }}>Strengths</b>
            <ul style={{ margin: '4px 0', paddingLeft: 18 }}>{p.pros.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
          <div>
            <b style={{ color: 'var(--red)' }}>Weaknesses</b>
            <ul style={{ margin: '4px 0', paddingLeft: 18 }}>{p.cons.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        </div>
        {p.note && <div className="faint" style={{ fontSize: '0.8rem' }}>{p.note}</div>}
      </div>
      <div className="faint" style={{ fontSize: '0.78rem', marginTop: 6 }}>
        Ranges span "typical in a full system" to "best reported," from published papers, spec sheets and company announcements up to late 2026. Records often come from
        small test devices. Numbers in this field change every few months, so treat every figure as approximate.
      </div>
    </Widget>
  );
}
