import React, { useState } from 'react';
import { Widget, RichText } from '../../../components/ui';
import { useWidth } from './viz';

type Problem = {
  id: string;
  name: string;
  x: number;
  y: number;
  where: string;
  known: string;
  believed: string;
  quantum: string;
  color: string;
};

// coordinates in a 760 × 430 design space
const PROBLEMS: Problem[] = [
  {
    id: 'primality', name: 'Primality', x: 352, y: 268, color: '#83c167',
    where: 'P',
    known: 'In **P** since the AKS algorithm (2002). Fast randomized tests (Miller–Rabin) were used long before.',
    believed: 'Nothing open here.',
    quantum: 'No speedup needed: it is already easy classically. Note: deciding *whether* N is prime is easy; finding its factors is the hard part.',
  },
  {
    id: 'factoring', name: 'Factoring', x: 420, y: 205, color: '#fcd34d',
    where: 'NP ∩ coNP, and in BQP',
    known: '**In BQP** (Shor 1994). Its decision version is in NP ∩ coNP. Best known classical algorithm: the general number field sieve, sub-exponential time $\\exp(O(n^{1/3}(\\log n)^{2/3}))$ for an $n$-bit number.',
    believed: 'Not in P, but also **not NP-complete** (an NP-complete problem in coNP would make NP = coNP). Nobody has proved factoring is hard classically.',
    quantum: 'Super-polynomial speedup over the best *known* classical algorithm. That is the reason RSA is being retired.',
  },
  {
    id: 'dlog', name: 'Discrete log', x: 436, y: 240, color: '#fcd34d',
    where: 'NP ∩ coNP, and in BQP',
    known: '**In BQP** (also from Shor 1994). Breaks Diffie–Hellman and elliptic-curve cryptography.',
    believed: 'Not in P, not NP-complete.',
    quantum: 'Super-polynomial speedup over known classical algorithms. Elliptic-curve keys may fall *before* RSA keys of similar classical strength, because they need fewer logical qubits.',
  },
  {
    id: 'gi', name: 'Graph isomorphism', x: 215, y: 180, color: '#9aa3b5',
    where: 'NP (and coAM)',
    known: 'Quasi-polynomial time classically (Babai 2015).',
    believed: 'Not NP-complete. Possibly in P.',
    quantum: 'No known quantum speedup beyond generic ones. The "hidden subgroup" approach that powers Shor does not obviously work for the symmetric group.',
  },
  {
    id: 'sat', name: 'SAT, 3-coloring, TSP (decision)', x: 104, y: 232, color: '#fc6255',
    where: 'NP-complete',
    known: 'NP-complete (Cook–Levin 1971; Karp 1972). Relative to a random oracle, NP ⊄ BQP (BBBV 1997).',
    believed: '**Not in BQP.** If they were, every NP problem would be. Most complexity theorists would bet heavily against it.',
    quantum: 'Generic quadratic speedups from Grover-style search (about $2^{n/2}$ instead of $2^n$ for brute force). Better classical heuristics often erase even that.',
  },
  {
    id: 'search', name: 'Unstructured search (black box)', x: 472, y: 404, color: '#58c4dd',
    where: 'oracle problem',
    known: 'Classical: $\\Theta(N)$ queries. Quantum: $\\Theta(\\sqrt N)$ queries (Grover 1996; optimal by BBBV 1997).',
    believed: '(Proven, in the query model.)',
    quantum: '**Provably only quadratic.** No quantum algorithm can search a black box faster.',
  },
  {
    id: 'simon', name: "Simon's problem", x: 472, y: 385, color: '#e07ab6',
    where: 'oracle problem',
    known: 'Quantum: $O(n)$ queries. Classical randomized: $\\Omega(2^{n/2})$ queries. A proven exponential separation, **relative to an oracle**.',
    believed: 'Oracle separations are evidence, not proofs, that BQP ≠ BPP for real (non-oracle) problems.',
    quantum: 'Exponential (in the query model).',
  },
  {
    id: 'sim', name: 'Simulating quantum dynamics', x: 520, y: 165, color: '#5cd0b3',
    where: 'BQP-complete',
    known: 'Approximating the evolution of a local Hamiltonian is **BQP-complete**: any quantum computation can be phrased this way.',
    believed: 'Not in BPP (otherwise quantum computers would be classically simulable). Not believed to be in NP.',
    quantum: "Feynman's original motivation (1982). Chemistry and materials simulation are the most widely expected sources of useful quantum advantage.",
  },
  {
    id: 'rcs', name: 'Random circuit sampling', x: 600, y: 255, color: '#ff8c42',
    where: 'sampling task (not a yes/no problem)',
    known: 'Exact sampling would collapse the polynomial hierarchy if classically easy (under complexity assumptions). Noisy experiments are a moving target: some were later simulated classically.',
    believed: 'Hard classically at large enough size and fidelity.',
    quantum: 'Used in the "quantum supremacy" experiments (Google 2019 onward, USTC). No known practical use.',
  },
  {
    id: 'recs', name: 'Recommendation systems', x: 318, y: 312, color: '#9a72ac',
    where: 'BPP (with sample access)',
    known: 'Kerenidis–Prakash (2016) gave a fast quantum algorithm. Ewin Tang (2018) found a classical one with similar poly-log scaling, given the same kind of sample-and-query access to the data. This is **dequantization**.',
    believed: 'Many quantum machine-learning speedups that assume QRAM-style input access dequantize the same way.',
    quantum: 'At most polynomial, once the input model is fair.',
  },
  {
    id: 'hhl', name: 'Linear systems (HHL)', x: 545, y: 205, color: '#5cd0b3',
    where: 'BQP-complete (suitably phrased)',
    known: 'Harrow–Hassidim–Lloyd (2009): prepare a state proportional to $A^{-1}b$ in time poly(log N, κ) for sparse, well-conditioned A.',
    believed: 'The fine print matters: loading b, reading out the answer (you get a quantum state, not the vector), sparsity and condition number can each erase the speedup.',
    quantum: 'Exponential for the precisely stated problem; unclear for end-to-end applications.',
  },
];

/**
 * The conjectured map of complexity classes with real problems placed on it. Every placement comes with
 * "what is proven" and "what is believed".
 */
export function ComplexityMap() {
  const [sel, setSel] = useState<string>('factoring');
  const [ref, W] = useWidth<HTMLDivElement>(760);
  const s = Math.min(1, W / 760);
  const H = 430 * s;
  const p = PROBLEMS.find((q) => q.id === sel)!;
  return (
    <Widget title="The complexity map (the conjectured picture: almost none of these separations is proven)">
      <div ref={ref} style={{ width: '100%' }}>
        <svg width={W} height={H} viewBox="0 0 760 430" style={{ display: 'block' }}>
          {/* PSPACE */}
          <rect x={20} y={20} width={720} height={395} rx={30} fill="rgba(154,114,172,0.06)" stroke="#9a72ac" strokeWidth={1.5} />
          <text x={40} y={46} fontSize={15} fill="#9a72ac" fontWeight={700}>PSPACE</text>
          <text x={40} y={64} fontSize={11} fill="#6b7385">BQP ⊆ PP ⊆ PSPACE (proven)</text>
          {/* NP */}
          <ellipse cx={265} cy={230} rx={215} ry={150} fill="rgba(252,98,85,0.06)" stroke="#fc6255" strokeWidth={1.5} />
          <text x={235} y={102} fontSize={15} fill="#fc6255" fontWeight={700}>NP</text>
          {/* NP-complete band */}
          <path d="M 110 120 Q 40 230 110 340 Q 160 230 110 120 Z" fill="rgba(252,98,85,0.18)" stroke="#fc6255" strokeDasharray="4 3" />
          <text x={60} y={385} fontSize={12} fill="#fc6255">NP-complete</text>
          {/* BQP */}
          <ellipse cx={480} cy={235} rx={190} ry={130} fill="rgba(88,196,221,0.07)" stroke="#58c4dd" strokeWidth={2} />
          <text x={600} y={128} fontSize={15} fill="#58c4dd" fontWeight={700}>BQP</text>
          <text x={570} y={146} fontSize={10.5} fill="#6b7385">efficient quantum</text>
          {/* BPP & P */}
          <ellipse cx={360} cy={280} rx={62} ry={46} fill="rgba(131,193,103,0.1)" stroke="#83c167" strokeWidth={1.5} />
          <text x={392} y={242} fontSize={12} fill="#83c167" fontWeight={700}>BPP</text>
          <ellipse cx={358} cy={283} rx={34} ry={26} fill="rgba(131,193,103,0.16)" stroke="#83c167" />
          <text x={336} y={296} fontSize={13} fill="#83c167" fontWeight={700}>P</text>
          {/* oracle-world box */}
          <rect x={455} y={372} width={278} height={42} rx={10} fill="rgba(224,122,182,0.06)" stroke="#e07ab6" strokeDasharray="5 4" />
          <text x={728} y={367} fontSize={10.5} fill="#e07ab6" textAnchor="end">black-box (query) world</text>
          {PROBLEMS.map((q) => (
            <g key={q.id} onClick={() => setSel(q.id)} style={{ cursor: 'pointer' }}>
              <circle cx={q.x} cy={q.y} r={sel === q.id ? 9 : 6.5} fill={q.color} stroke={sel === q.id ? '#fff' : '#0b0d12'} strokeWidth={2} />
              <text x={q.x + 11} y={q.y + 4} fontSize={11.5} fill={sel === q.id ? '#fff' : '#cfd6e4'}>
                {q.name}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div className="panel" style={{ padding: 12, marginTop: 8, borderColor: p.color }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <b style={{ color: p.color }}>{p.name}</b>
          <span className="pill">{p.where}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 8, fontSize: '0.9rem' }}>
          <div>
            <div className="faint" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Proven</div>
            <RichText text={p.known} />
          </div>
          <div>
            <div className="faint" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Believed</div>
            <RichText text={p.believed} />
          </div>
          <div>
            <div className="faint" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Quantum speedup</div>
            <RichText text={p.quantum} />
          </div>
        </div>
      </div>
      <div className="faint" style={{ fontSize: '0.8rem', marginTop: 6 }}>
        Oracle problems (search, Simon) are drawn where their unconditional query results live, which is a different world from the white-box classes. Click any dot.
      </div>
    </Widget>
  );
}
