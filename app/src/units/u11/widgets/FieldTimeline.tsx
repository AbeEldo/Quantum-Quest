import React, { useState } from 'react';
import { Widget, Segmented } from '../../../components/ui';

type Cat = 'qec' | 'adv' | 'hw' | 'crypto';
type Ev = 'peer' | 'preprint' | 'company';

interface Item {
  date: string;
  year: number;
  cat: Cat;
  ev: Ev;
  title: string;
  detail: string;
  status?: string;
  src: string;
}

const CATS: Record<Cat, { label: string; color: string }> = {
  qec: { label: 'Error correction', color: '#83c167' },
  adv: { label: 'Advantage claims', color: '#e07ab6' },
  hw: { label: 'Hardware', color: '#58c4dd' },
  crypto: { label: 'Cryptography', color: '#fcd34d' },
};
const EV: Record<Ev, { label: string; color: string }> = {
  peer: { label: 'peer-reviewed', color: '#83c167' },
  preprint: { label: 'preprint', color: '#fcd34d' },
  company: { label: 'company announcement', color: '#fc6255' },
};

const ITEMS: Item[] = [
  { date: 'Oct 2019', year: 2019.8, cat: 'adv', ev: 'peer', title: 'Google Sycamore: "quantum supremacy"', detail: '53-qubit random-circuit sampling in ~200 s, claimed to take 10,000 years classically.', status: 'Contested: IBM argued ~2.5 days; later tensor-network simulations reproduced the task in hours or less.', src: 'Arute et al., Nature 574, 505 (2019)' },
  { date: 'Dec 2020', year: 2020.9, cat: 'adv', ev: 'peer', title: 'USTC Jiuzhang: photonic boson sampling', detail: 'Gaussian boson sampling with up to 76 detected photons.', status: 'Classical spoofing algorithms have since narrowed the gap for some variants.', src: 'Zhong et al., Science 370, 1460 (2020)' },
  { date: 'Feb 2023', year: 2023.1, cat: 'qec', ev: 'peer', title: 'Google: d = 5 beats d = 3 (barely)', detail: 'First time a larger surface code had a lower logical error: 2.914% vs 3.028% per cycle (Λ ≈ 1.04).', src: 'Google Quantum AI, Nature 614, 676 (2023)' },
  { date: 'Dec 2023', year: 2023.95, cat: 'qec', ev: 'peer', title: 'Harvard/QuEra: 48 logical qubits', detail: 'Reconfigurable neutral-atom arrays run algorithms on up to 48 logical qubits (error-detecting codes, 280 atoms).', src: 'Bluvstein et al., Nature 626, 58 (2024)' },
  { date: 'Aug 2024', year: 2024.6, cat: 'crypto', ev: 'peer', title: 'NIST publishes FIPS 203, 204, 205', detail: 'First post-quantum standards: ML-KEM (Kyber, key exchange), ML-DSA (Dilithium) and SLH-DSA (SPHINCS+) signatures. HQC was chosen as a backup KEM in March 2025; FN-DSA (Falcon, FIPS 206) was still pending in late 2026.', src: 'NIST, 13 Aug 2024' },
  { date: 'Nov 2024', year: 2024.88, cat: 'qec', ev: 'company', title: 'Microsoft + Atom Computing: 24 entangled logical qubits', detail: '24 logical qubits entangled and 28 used for computation on a neutral-atom machine. A ~50-logical-qubit system ("Magne") for Denmark is expected around early 2027.', status: 'Company-reported; definitions of "logical qubit" vary between groups.', src: 'Microsoft Azure Quantum blog, Nov 2024' },
  { date: 'Dec 2024', year: 2024.94, cat: 'qec', ev: 'peer', title: 'Google Willow: below threshold', detail: 'Surface codes d = 3, 5, 7 with Λ = 2.14 ± 0.02; 0.143% error per cycle at d = 7; logical lifetime 2.4× the best physical qubit; real-time decoding.', src: 'Google Quantum AI, Nature 638, 920 (2025)' },
  { date: 'Feb 2025', year: 2025.12, cat: 'hw', ev: 'company', title: 'Microsoft "Majorana 1" topological chip', detail: 'Announced as the first topological-core processor. The accompanying Nature paper reported parity measurements only.', status: "Nature's editors noted the paper is not evidence for Majorana modes. A critical Nature Comment (Legg, June 2026) disputes the data analysis. Microsoft's \"Majorana 2\" (June 2026) is a preprint. Unresolved.", src: 'Microsoft; Nature 638, 651 (2025); Nature Comment (2026)' },
  { date: 'Mar 2025', year: 2025.2, cat: 'adv', ev: 'peer', title: 'D-Wave: beyond-classical quantum simulation', detail: 'Annealer simulation of magnetic-material dynamics claimed intractable classically.', status: 'Rebutted in part by tensor-network and other classical simulations posted within weeks.', src: 'King et al., Science (2025)' },
  { date: 'May 2025', year: 2025.4, cat: 'crypto', ev: 'preprint', title: 'RSA-2048 with < 1 million noisy qubits', detail: 'Gidney: under a week with fewer than a million physical qubits (same hardware assumptions as the 2019 estimate of 20 million qubits / 8 hours).', src: 'Gidney, arXiv:2505.15917' },
  { date: 'Oct 2025', year: 2025.8, cat: 'adv', ev: 'peer', title: 'Google "Quantum Echoes": verifiable advantage', detail: 'Out-of-time-order correlator measurement on Willow, claimed ~13,000× faster than the best known classical method on Frontier.', status: 'Skeptics note classical algorithms may improve and that applications are still exploratory.', src: 'Google Quantum AI, Nature (Oct 2025)' },
  { date: 'Oct 2025', year: 2025.82, cat: 'hw', ev: 'preprint', title: 'IonQ: 99.99% two-qubit fidelity', detail: 'Four-nines entangling gates on R&D trapped-ion prototypes.', status: 'Company result with preprint; benchmarked on small test devices.', src: 'arXiv:2510.17286' },
  { date: 'Nov 2025', year: 2025.85, cat: 'hw', ev: 'peer', title: 'Quantinuum Helios: 98 ions', detail: '98 barium-ion qubits, 99.92% average two-qubit fidelity; demonstrations with 48 error-corrected logical qubits (and 94 error-detected ones).', src: 'arXiv:2511.05465; Nature (2026)' },
  { date: 'Nov 2025', year: 2025.87, cat: 'qec', ev: 'peer', title: 'Harvard/MIT/QuEra: fault-tolerant architecture', detail: 'Up to 448 neutral atoms implement the key elements of a universal fault-tolerant architecture, with logical error rates improving as codes grow.', src: 'Bluvstein et al., Nature 649 (2026)' },
  { date: 'Feb 2026', year: 2026.1, cat: 'crypto', ev: 'preprint', title: 'qLDPC RSA estimate < 100,000 qubits', detail: 'A qLDPC-code architecture claims RSA-2048 with under 100,000 physical qubits, assuming long-range connectivity not yet demonstrated at scale.', src: 'Iceberg Quantum preprint (2026)' },
  { date: 'Mar 2026', year: 2026.2, cat: 'crypto', ev: 'preprint', title: 'Elliptic-curve keys may fall first', detail: 'Google researchers estimate 256-bit elliptic-curve discrete logs with under half a million physical qubits, possibly cheaper than RSA-2048.', src: 'Babbush, Gidney et al. preprint (2026)' },
  { date: 'Jul 2026', year: 2026.55, cat: 'adv', ev: 'preprint', title: 'IBM + UChicago: certified advantage claim', detail: '97-qubit circuit with 468 T gates and a certified fidelity bound, presented as beyond leading classical methods; listed on IBM\'s public Quantum Advantage Tracker.', status: 'Within weeks a GPU group computed the published amplitudes in ~37 minutes on 256 H100s. Narrowed, not refuted. Debate ongoing.', src: 'IBM/UChicago (2026); follow-up preprints' },
  { date: 'Jul 2026', year: 2026.52, cat: 'qec', ev: 'peer', title: 'Google: reinforcement-learning-tuned QEC', detail: 'Continuous RL calibration during error correction on Willow, reported d = 7 surface-code error ≈ 0.077% per cycle and a d = 5 color code.', src: 'Google Quantum AI, Nature (2026), as reported' },
  { date: 'Sep 2026', year: 2026.7, cat: 'qec', ev: 'company', title: 'Infleqtion: 30 entangled logical qubits', detail: '30 logical qubits from 80 physical neutral-atom qubits on a commercial system.', status: 'Company announcement.', src: 'Infleqtion press release (Sep 2026)' },
  { date: 'Oct 2026', year: 2026.78, cat: 'qec', ev: 'peer', title: 'Google: magic-state cultivation', detail: 'Logical T-states at about 99.99% fidelity, ~40× fewer errors than without cultivation: a key ingredient for universal fault tolerance.', src: 'Google Quantum AI, Science (Oct 2026), as reported' },
  { date: 'Nov 2026', year: 2026.86, cat: 'hw', ev: 'company', title: 'IBM roadmap update (QDC 2026)', detail: 'Nighthawk r2 (120 qubits, 7,500+ gate circuits); qLDPC "Loon" components; Starling (200 logical qubits, 10⁸ gates) still targeted for 2029.', status: 'Roadmap targets, not results.', src: 'IBM Quantum blog, 11 Nov 2026' },
];

/** Filterable timeline of milestones with evidence labels. */
export function FieldTimeline() {
  const [cat, setCat] = useState<Cat | 'all'>('all');
  const [sel, setSel] = useState(ITEMS.length - 4);
  const items = ITEMS.map((it, i) => ({ ...it, i })).filter((it) => cat === 'all' || it.cat === cat);
  const W = 640, H = 150, left = 30, right = 20;
  const x = (y: number) => left + ((y - 2019.5) / (2027 - 2019.5)) * (W - left - right);
  const s = ITEMS[sel];
  const lanes: Record<Cat, number> = { qec: 0, adv: 1, hw: 2, crypto: 3 };
  return (
    <Widget title="Milestones 2019 – late 2026 (click a dot)">
      <div className="row" style={{ marginBottom: 6 }}>
        <Segmented value={cat} onChange={setCat} options={[{ value: 'all', label: 'All' }, ...(Object.keys(CATS) as Cat[]).map((c) => ({ value: c, label: CATS[c].label }))]} />
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
        {[2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027].map((yr) => (
          <g key={yr}>
            <line x1={x(yr)} x2={x(yr)} y1={10} y2={H - 22} stroke="#232a38" />
            <text x={x(yr)} y={H - 6} fontSize={11} fill="#7d8699" textAnchor="middle">{yr}</text>
          </g>
        ))}
        {items.map((it) => {
          const y = 22 + lanes[it.cat] * 28;
          return (
            <g key={it.i} onClick={() => setSel(it.i)} style={{ cursor: 'pointer' }}>
              <circle cx={x(it.year)} cy={y} r={sel === it.i ? 9 : 6.5} fill={CATS[it.cat].color} stroke={EV[it.ev].color} strokeWidth={sel === it.i ? 3 : 1.5} opacity={0.9} />
            </g>
          );
        })}
        {(Object.keys(lanes) as Cat[]).map((c) => (
          <text key={c} x={4} y={26 + lanes[c] * 28} fontSize={9} fill={CATS[c].color}>
            {c === 'qec' ? 'QEC' : c === 'adv' ? 'ADV' : c === 'hw' ? 'HW' : 'PQC'}
          </text>
        ))}
      </svg>
      <div className="panel pop" key={sel} style={{ padding: 12, borderColor: CATS[s.cat].color }}>
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <b style={{ color: CATS[s.cat].color }}>{s.date} · {s.title}</b>
          <span className="pill" style={{ borderColor: EV[s.ev].color, color: EV[s.ev].color }}>{EV[s.ev].label}</span>
        </div>
        <div style={{ marginTop: 6 }}>{s.detail}</div>
        {s.status && <div style={{ marginTop: 6, color: 'var(--gold)', fontSize: '0.9rem' }}>⚖ {s.status}</div>}
        <div className="faint mono" style={{ fontSize: '0.78rem', marginTop: 6 }}>{s.src}</div>
      </div>
      <div className="faint" style={{ fontSize: '0.78rem', marginTop: 6 }}>
        Dot outline: <span style={{ color: EV.peer.color }}>green = peer-reviewed</span>, <span style={{ color: EV.preprint.color }}>yellow = preprint</span>,{' '}
        <span style={{ color: EV.company.color }}>red = company announcement</span>. Entries marked "as reported" were checked against secondary coverage, not the primary paper.
      </div>
    </Widget>
  );
}

/** Estimated physical qubits to factor RSA-2048 vs. year (log scale). */
export function RsaEstimates() {
  const pts = [
    { yr: 2019, q: 2e7, label: '20 M qubits, 8 h', who: 'Gidney & Ekerå', ev: 'peer' as Ev },
    { yr: 2025, q: 9e5, label: '< 1 M qubits, < 1 week', who: 'Gidney', ev: 'preprint' as Ev },
    { yr: 2026, q: 1e5, label: '< 100 k (qLDPC, new assumptions)', who: 'Iceberg Quantum', ev: 'preprint' as Ev },
  ];
  const machines = [
    { yr: 2019, q: 53 }, { yr: 2023, q: 1121 }, { yr: 2025, q: 6100 },
  ];
  const W = 620, H = 230, l = 60, r = 20, t = 10, b = 30;
  const x = (y: number) => l + ((y - 2018.5) / (2027 - 2018.5)) * (W - l - r);
  const y = (q: number) => H - b - ((Math.log10(q) - 1) / (8 - 1)) * (H - t - b);
  return (
    <Widget title="How many qubits to break RSA-2048? (estimates vs. machines)">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
        {[10, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8].map((q) => (
          <g key={q}>
            <line x1={l} x2={W - r} y1={y(q)} y2={y(q)} stroke="#232a38" />
            <text x={l - 6} y={y(q) + 4} fontSize={10.5} fill="#7d8699" textAnchor="end">{q >= 1e6 ? `${q / 1e6}M` : q >= 1e3 ? `${q / 1e3}k` : q}</text>
          </g>
        ))}
        {[2019, 2021, 2023, 2025, 2027].map((yr) => <text key={yr} x={x(yr)} y={H - 10} fontSize={11} fill="#7d8699" textAnchor="middle">{yr}</text>)}
        <polyline points={pts.map((p) => `${x(p.yr)},${y(p.q)}`).join(' ')} fill="none" stroke="#fcd34d" strokeWidth={2.4} />
        {pts.map((p) => (
          <g key={p.yr}>
            <circle cx={x(p.yr)} cy={y(p.q)} r={6} fill="#fcd34d" stroke={EV[p.ev].color} strokeWidth={2} />
            <text x={x(p.yr) + (p.yr === 2026 ? -8 : 10)} y={y(p.q) - 10} fontSize={11} fill="#fcd34d" textAnchor={p.yr === 2026 ? 'end' : 'start'}>{p.label} ({p.who})</text>
          </g>
        ))}
        <polyline points={machines.map((m) => `${x(m.yr)},${y(m.q)}`).join(' ')} fill="none" stroke="#58c4dd" strokeWidth={2} strokeDasharray="5 4" />
        {machines.map((m) => <circle key={m.yr} cx={x(m.yr)} cy={y(m.q)} r={4} fill="#58c4dd" />)}
        <text x={x(2025) + 8} y={y(6100) + 16} fontSize={11} fill="#58c4dd">largest qubit arrays (physical, noisy)</text>
      </svg>
      <div className="faint" style={{ fontSize: '0.8rem' }}>
        Estimates assume physical error rates of ~10⁻³ and specific architectures. The 2026 point assumes connectivity not yet shown at scale. The gap is closing from <b>both</b> sides: better algorithms
        and codes from above, bigger machines from below. No published estimate gives a date.
      </div>
    </Widget>
  );
}
