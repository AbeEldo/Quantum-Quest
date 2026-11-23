import React, { useMemo, useState } from 'react';
import { Widget, Segmented, Tex } from '../../../components/ui';
import { StateVector } from '../../../engine/qsim';
import { AmplitudeView, PhaseLegend } from '../../../widgets/AmplitudeView';
import { MiniBloch } from '../../../widgets/MiniBloch';
import { applyBitOracle } from '../algos';

const FUNCS = [
  { id: 0, name: 'f(x) = 0', short: 'const 0', table: [0, 0], kind: 'constant' },
  { id: 1, name: 'f(x) = 1', short: 'const 1', table: [1, 1], kind: 'constant' },
  { id: 2, name: 'f(x) = x', short: 'identity', table: [0, 1], kind: 'balanced' },
  { id: 3, name: 'f(x) = 1 − x', short: 'NOT', table: [1, 0], kind: 'balanced' },
] as const;

const STAGES = ['start |0⟩|1⟩', 'after H ⊗ H', 'after the oracle', 'after the final H'];

function deutschStates(table: readonly number[]): StateVector[] {
  const s0 = new StateVector(2).x(1);
  const s1 = s0.clone().h(0).h(1);
  const s2 = applyBitOracle(s1.clone(), (x) => table[x], 1, 1);
  const s3 = s2.clone().h(0);
  return [s0, s1, s2, s3];
}

/** The bit oracle drawn as a permutation of the four basis states |x y⟩ → |x, y⊕f(x)⟩. */
function PermutationDiagram({ table }: { table: readonly number[] }) {
  const W = 250, H = 150, y0 = 22, dy = 34;
  const lbl = (i: number) => `|${i >> 1}${i & 1}⟩`;
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      <text x={40} y={12} fontSize={11} fill="#6b7385" textAnchor="middle">in</text>
      <text x={W - 40} y={12} fontSize={11} fill="#6b7385" textAnchor="middle">out</text>
      {[0, 1, 2, 3].map((i) => {
        const x = i >> 1, y = i & 1;
        const j = (x << 1) | (y ^ table[x]);
        const moved = j !== i;
        return (
          <g key={i}>
            <text x={40} y={y0 + i * dy + 14} fontSize={15} fill="#e9ecf2" textAnchor="middle" fontFamily="var(--serif)">{lbl(i)}</text>
            <text x={W - 40} y={y0 + j * dy + 14} fontSize={15} fill="#e9ecf2" textAnchor="middle" fontFamily="var(--serif)">{lbl(j)}</text>
            <line x1={68} y1={y0 + i * dy + 9} x2={W - 70} y2={y0 + j * dy + 9} stroke={moved ? '#fcd34d' : '#4a5368'} strokeWidth={moved ? 2.2 : 1.5} markerEnd="url(#dl-arrow)" />
          </g>
        );
      })}
      <defs>
        <marker id="dl-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#fcd34d" />
        </marker>
      </defs>
    </svg>
  );
}

function CircuitSketch({ stage, onStage }: { stage: number; onStage: (s: number) => void }) {
  const W = 420, H = 120;
  const wy = [38, 88];
  const xs = [70, 150, 245, 340];
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: W, display: 'block' }}>
      {wy.map((y, q) => (
        <g key={q}>
          <text x={8} y={y + 5} fontSize={14} fill="#9aa3b5" fontFamily="var(--serif)">{q === 0 ? '|0⟩' : '|1⟩'}</text>
          <line x1={36} x2={W - 30} y1={y} y2={y} stroke="#4a5368" strokeWidth={1.5} />
        </g>
      ))}
      {/* H H */}
      {wy.map((y, q) => (
        <g key={q}>
          <rect x={95} y={y - 15} width={30} height={30} rx={6} fill="#141821" stroke="#f4d35e" strokeWidth={2} />
          <text x={110} y={y + 6} fontSize={16} fill="#f4d35e" textAnchor="middle" fontWeight={700}>H</text>
        </g>
      ))}
      {/* oracle */}
      <rect x={180} y={20} width={60} height={86} rx={8} fill="#1d2230" stroke="#e07ab6" strokeWidth={2} />
      <text x={210} y={60} fontSize={15} fill="#e07ab6" textAnchor="middle" fontWeight={700}>U</text>
      <text x={219} y={66} fontSize={10} fill="#e07ab6">f</text>
      <text x={210} y={84} fontSize={9} fill="#cfd6e4" textAnchor="middle">1 query</text>
      {/* final H + meter */}
      <rect x={275} y={wy[0] - 15} width={30} height={30} rx={6} fill="#141821" stroke="#f4d35e" strokeWidth={2} />
      <text x={290} y={wy[0] + 6} fontSize={16} fill="#f4d35e" textAnchor="middle" fontWeight={700}>H</text>
      <rect x={360} y={wy[0] - 15} width={30} height={30} rx={6} fill="#1d2230" stroke="#bbb" />
      <path d={`M${364} ${wy[0] + 7} A 11 11 0 0 1 ${386} ${wy[0] + 7}`} fill="none" stroke="#ddd" strokeWidth={1.5} />
      <line x1={375} y1={wy[0] + 7} x2={383} y2={wy[0] - 7} stroke="#fcd34d" strokeWidth={1.6} />
      {/* stage markers */}
      {xs.map((x, k) => (
        <g key={k} onClick={() => onStage(k)} style={{ cursor: 'pointer' }}>
          <line x1={x} x2={x} y1={14} y2={110} stroke={k === stage ? '#58c4dd' : '#2a3142'} strokeWidth={k === stage ? 2 : 1} strokeDasharray="4 3" />
          <circle cx={x} cy={12} r={9} fill={k === stage ? '#58c4dd' : '#1d2230'} stroke="#58c4dd" />
          <text x={x} y={16} fontSize={11} textAnchor="middle" fill={k === stage ? '#04141a' : '#58c4dd'} fontWeight={700}>{k}</text>
        </g>
      ))}
    </svg>
  );
}

/** Deutsch's algorithm, stage by stage, with the oracle drawn as a permutation and a mystery-function mode. */
export function DeutschLab() {
  const [mode, setMode] = useState<'explore' | 'mystery'>('explore');
  const [fid, setFid] = useState(2);
  const [stage, setStage] = useState(2);
  // mystery mode
  const [secret, setSecret] = useState(() => Math.floor(Math.random() * 4));
  const [classicalSeen, setClassicalSeen] = useState<(number | null)[]>([null, null]);
  const [quantumResult, setQuantumResult] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<null | { guess: string; right: boolean; queries: number }>(null);
  const [record, setRecord] = useState({ played: 0, right: 0, queries: 0 });

  const f = FUNCS[mode === 'explore' ? fid : secret];
  const states = useMemo(() => deutschStates(f.table), [f]);
  const s = states[stage];

  const queriesUsed = classicalSeen.filter((v) => v !== null).length + (quantumResult !== null ? 1 : 0);

  const newMystery = () => {
    setSecret(Math.floor(Math.random() * 4));
    setClassicalSeen([null, null]);
    setQuantumResult(null);
    setVerdict(null);
  };
  const guess = (g: 'constant' | 'balanced') => {
    const right = g === FUNCS[secret].kind;
    setVerdict({ guess: g, right, queries: queriesUsed });
    setRecord((r) => ({ played: r.played + 1, right: r.right + (right ? 1 : 0), queries: r.queries + queriesUsed }));
  };

  return (
    <Widget title="Deutsch's problem: one question, two possible worlds">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <Segmented
          options={[
            { value: 'explore', label: 'Explore the four functions' },
            { value: 'mystery', label: '🎲 Mystery function' },
          ]}
          value={mode}
          onChange={(m) => {
            setMode(m);
            newMystery();
          }}
        />
        <PhaseLegend size={38} />
      </div>

      {mode === 'explore' ? (
        <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {FUNCS.map((g) => (
            <button
              key={g.id}
              className={`btn small ${fid === g.id ? 'active' : ''}`}
              onClick={() => setFid(g.id)}
              style={{ minWidth: 150, textAlign: 'left' }}
            >
              <div style={{ fontWeight: 700 }}>{g.name}</div>
              <div className="mono faint" style={{ fontSize: '0.75rem' }}>
                f(0)={g.table[0]}, f(1)={g.table[1]} · <span style={{ color: g.kind === 'constant' ? 'var(--blue)' : 'var(--pink)' }}>{g.kind}</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="panel" style={{ padding: 12, marginBottom: 12 }}>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <span className="dim">Classical queries:</span>
            {[0, 1].map((x) => (
              <button key={x} className="btn small" disabled={!!verdict || classicalSeen[x] !== null} onClick={() => setClassicalSeen((c0) => c0.map((v, i) => (i === x ? FUNCS[secret].table[x] : v)))}>
                {classicalSeen[x] === null ? `ask f(${x})` : `f(${x}) = ${classicalSeen[x]}`}
              </button>
            ))}
            <span className="dim" style={{ marginLeft: 12 }}>Quantum:</span>
            <button className="btn small primary" disabled={!!verdict || quantumResult !== null} onClick={() => setQuantumResult(states[3].prob1(0) > 0.5 ? 1 : 0)}>
              {quantumResult === null ? '⚛ run Deutsch (1 query)' : `q0 measured: ${quantumResult}`}
            </button>
            <span className="pill" style={{ marginLeft: 'auto' }}>queries used: {queriesUsed}</span>
          </div>
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <span className="dim">Your verdict:</span>
            <button className="btn small" disabled={!!verdict || queriesUsed === 0} onClick={() => guess('constant')}>constant</button>
            <button className="btn small" disabled={!!verdict || queriesUsed === 0} onClick={() => guess('balanced')}>balanced</button>
            {verdict && (
              <span className={`pill ${verdict.right ? 'good' : 'bad'} pop`}>
                {verdict.right ? '✓' : '✗'} it was {FUNCS[secret].name} ({FUNCS[secret].kind}) · {verdict.queries} quer{verdict.queries === 1 ? 'y' : 'ies'}
              </span>
            )}
            {verdict && <button className="btn small ghost" onClick={newMystery}>next mystery ↻</button>}
          </div>
          {record.played > 0 && (
            <div className="faint" style={{ fontSize: '0.8rem', marginTop: 6 }}>
              Record: {record.right}/{record.played} correct, {(record.queries / record.played).toFixed(2)} queries per function on average.
              {record.right >= 3 && record.queries === record.played && ' Perfect: one query each, every time. 🎯'}
            </div>
          )}
        </div>
      )}

      <CircuitSketch stage={stage} onStage={setStage} />
      <div className="row" style={{ gap: 6, margin: '4px 0 10px' }}>
        {STAGES.map((lbl, k) => (
          <button key={k} className={`btn small ${stage === k ? 'active' : 'ghost'}`} onClick={() => setStage(k)}>
            {k}: {lbl}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 1.3fr) minmax(200px, 1fr)', gap: 16, alignItems: 'start' }}>
        <div>
          <div className="faint" style={{ fontSize: '0.78rem', marginBottom: 4 }}>
            Amplitudes of |q0 q1⟩ at stage {stage}
            {mode === 'mystery' && quantumResult === null && stage >= 2 ? ' (hidden until you run the quantum query)' : ''}
          </div>
          {mode === 'mystery' && quantumResult === null && stage >= 2 ? (
            <div className="panel faint" style={{ padding: 16, textAlign: 'center' }}>🔒 the oracle is a black box</div>
          ) : (
            <AmplitudeView amps={s.clone().canonicalPhase().amplitudes()} n={2} />
          )}
          {!(mode === 'mystery' && quantumResult === null && stage >= 2) && (
            <div className="row" style={{ gap: 14, marginTop: 8 }}>
              {[0, 1].map((q) => (
                <MiniBloch key={q} v={s.bloch(q)} size={78} label={`q${q}`} color={q === 0 ? '#fcd34d' : '#e07ab6'} />
              ))}
            </div>
          )}
        </div>
        <div>
          {mode === 'explore' ? (
            <>
              <div className="faint" style={{ fontSize: '0.78rem', marginBottom: 2 }}>The oracle as a permutation of basis states</div>
              <PermutationDiagram table={f.table} />
              <div className="dim" style={{ fontSize: '0.88rem' }}>
                {stage < 2 && 'Before the query, q0 = |+⟩ and q1 = |−⟩.'}
                {stage === 2 && (
                  <>
                    q1 is <b>still |−⟩</b>; the oracle's effect landed on q0 as a phase: q0 ={' '}
                    <Tex>{`\\tfrac{1}{\\sqrt2}\\big(${f.table[0] ? '-' : ''}|0\\rangle ${f.table[1] ? '-' : '+'} |1\\rangle\\big)`}</Tex>. That's <b>phase kickback</b>.
                  </>
                )}
                {stage === 3 && (
                  <>
                    q0 is now <b>|{f.kind === 'constant' ? 0 : 1}⟩</b> with certainty, so measuring it reveals "{f.kind}" after a single query. (A global sign doesn't matter.)
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="dim" style={{ fontSize: '0.9rem' }}>
              Classically you must ask <b>both</b> f(0) and f(1). One classical answer tells you nothing about whether the function is constant or balanced.
              The quantum query asks about both inputs <i>in superposition</i>, and the final H makes the two possibilities interfere so that only the
              answer to <i>your</i> question (is f(0) ⊕ f(1) = 0 or 1?) survives.
            </div>
          )}
        </div>
      </div>
    </Widget>
  );
}
