import React, { useEffect, useMemo, useState } from 'react';
import { Circuit, GateName, GATE_INFO, Op, opWires, opSpan, runCircuit, circuitUnitary, unitaryOverlap, countGates, stateToKetString } from '../engine/circuit';
import { parseCircuit, circuitToText } from '../engine/parse';
import { StateVector, mulberry32 } from '../engine/qsim';
import { C, Mat, c } from '../engine/complex';
import { AmplitudeView, PhaseLegend } from './AmplitudeView';
import { MiniBloch } from './MiniBloch';
import { Widget, fmtPi } from '../components/ui';
import { useChallengeGate } from '../components/lesson/gates';
import { useProgress } from '../state/progress';

export type CircuitGoal =
  | { kind: 'state'; amps: C[]; label?: string }
  | { kind: 'unitary'; U: Mat; label?: string };

export interface CircuitLabProps {
  title?: string;
  /** Number of qubits. */
  n?: number;
  /** Initial circuit (compact text, e.g. "H 0; CNOT 0 1", or a Circuit object). */
  circuit?: string | Circuit;
  /** Palette of gates the learner may place. */
  gates?: GateName[];
  editable?: boolean;
  /** Allow adding qubits up to this many (shows +/- buttons). */
  maxQubits?: number;
  /** Minimum number of visible columns. */
  columns?: number;
  showAmplitudes?: boolean;
  showBloch?: boolean;
  showHistogram?: boolean;
  showKet?: boolean;
  /** Step-through slider. */
  stepper?: boolean;
  /** Custom input state amplitudes ([re, im] pairs, length 2^n). */
  initialState?: [number, number][];
  /** Turn into a challenge: reach this state / implement this unitary. */
  goal?: CircuitGoal;
  /** Unique id (required with goal for progress tracking). */
  challengeId?: string;
  /** Called when the goal is satisfied. */
  onSolved?: (gateCount: number, circuit: Circuit) => void;
  onChange?: (c: Circuit) => void;
  /** Labels for the wires (default q0, q1...). */
  qubitLabels?: string[];
  /** Max gates allowed (placement blocked beyond this). */
  maxGates?: number;
  /** Hide the goal amplitudes (only describe in prose). */
  hideGoal?: boolean;
}

const DEFAULT_GATES: GateName[] = ['H', 'X', 'Y', 'Z', 'S', 'T', 'Rx', 'Ry', 'Rz', 'CNOT', 'CZ', 'SWAP', 'CCX', 'M'];
const MULTI: GateName[] = ['CNOT', 'CZ', 'CP', 'SWAP', 'CCX'];
const ANGLES = [Math.PI / 8, Math.PI / 4, Math.PI / 3, Math.PI / 2, (2 * Math.PI) / 3, Math.PI, -Math.PI / 2, -Math.PI / 4];

const COL_W = 54, ROW_H = 52, LEFT = 74, TOP = 26, BOX = 38;

export function CircuitLab(props: CircuitLabProps) {
  const {
    title = 'Circuit Lab',
    gates = DEFAULT_GATES,
    editable = true,
    maxQubits,
    columns: minCols = 8,
    showAmplitudes = true,
    showBloch = true,
    showHistogram = false,
    showKet = true,
    stepper = true,
    initialState,
    goal,
    challengeId,
    onSolved,
    onChange,
    qubitLabels,
    maxGates,
    hideGoal = false,
  } = props;

  const initialCircuit = useMemo<Circuit>(() => {
    const base = typeof props.circuit === 'string' ? parseCircuit(props.circuit, props.n) : props.circuit ?? { n: props.n ?? 2, columns: [] };
    const n = Math.max(props.n ?? base.n, base.n, 1);
    const cols = base.columns.map((c0) => [...c0]);
    while (cols.length < minCols) cols.push([]);
    return { n, columns: cols };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [circ, setCirc] = useState<Circuit>(initialCircuit);
  const [tool, setTool] = useState<GateName | 'erase' | null>(editable ? gates[0] ?? null : null);
  const [angle, setAngle] = useState(Math.PI / 2);
  const [pending, setPending] = useState<{ col: number; qubits: number[] } | null>(null);
  const [step, setStep] = useState<number | null>(null); // null = end
  const [seed, setSeed] = useState(1);
  const [shots, setShots] = useState<Map<number, number> | null>(null);
  const [solved, setSolved] = useState(false);
  const recordQuiz = useProgress((s) => s.recordQuiz);
  const solvedBefore = useProgress((s) => (challengeId ? !!s.quizzes[`circuit:${challengeId}`]?.correct : false));
  useChallengeGate(challengeId ?? 'circuit-none', !goal || solved || solvedBefore);

  const lastUsedCol = circ.columns.reduce((m, col, i) => (col.length ? i : m), -1);
  const endStep = lastUsedCol + 1;
  const curStep = step === null ? endStep : Math.min(step, endStep);
  const hasMeasure = circ.columns.some((col) => col.some((o) => o.gate === 'M'));

  const initState = useMemo(() => {
    if (!initialState) return undefined;
    return StateVector.fromAmplitudes(initialState.map(([r, i]) => c(r, i)));
  }, [initialState]);

  const result = useMemo(() => {
    const init = initState && initState.n === circ.n ? initState : undefined;
    return runCircuit(circ, { upTo: curStep, measure: 'collapse', rng: mulberry32(seed * 7919), initial: init });
  }, [circ, curStep, seed, initState]);

  const state = result.state;
  const gateCount = countGates(circ, ['I', 'M']);

  // goal check (on full circuit, measurements ignored)
  const goalMet = useMemo(() => {
    if (!goal) return false;
    if (goal.kind === 'state') {
      if (goal.amps.length !== 1 << circ.n) return false;
      const init = initState && initState.n === circ.n ? initState : undefined;
      const { state: s } = runCircuit(circ, { measure: 'skip', initial: init });
      return s.fidelity(StateVector.fromAmplitudes(goal.amps)) > 0.999;
    }
    if (goal.U.length !== 1 << circ.n) return false;
    return unitaryOverlap(circuitUnitary(circ), goal.U) > 0.999;
  }, [circ, goal, initState]);

  useEffect(() => {
    if (goalMet && !solved) {
      setSolved(true);
      if (challengeId) recordQuiz(`circuit:${challengeId}`, true, 25);
      onSolved?.(gateCount, circ);
    }
    if (!goalMet && solved && !challengeId) setSolved(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalMet]);

  const update = (next: Circuit) => {
    // auto-extend columns
    const last = next.columns.reduce((m, col, i) => (col.length ? i : m), -1);
    const cols = [...next.columns];
    while (cols.length < Math.max(minCols, last + 2)) cols.push([]);
    const nn = { ...next, columns: cols };
    setCirc(nn);
    setShots(null);
    onChange?.(nn);
    if (goal && solved && challengeId) {
      /* keep solved status once achieved */
    }
  };

  const removeAt = (col: number, q: number) => {
    const cols = circ.columns.map((c0) => [...c0]);
    cols[col] = cols[col].filter((o) => {
      const [a, b] = opSpan(o);
      return !(q >= a && q <= b);
    });
    update({ ...circ, columns: cols });
  };

  const place = (col: number, op: Op) => {
    if (maxGates !== undefined && op.gate !== 'M' && gateCount >= maxGates) return;
    const cols = circ.columns.map((c0) => [...c0]);
    const [lo, hi] = opSpan(op);
    cols[col] = cols[col].filter((o) => {
      const [a, b] = opSpan(o);
      return b < lo || a > hi;
    });
    cols[col].push(op);
    update({ ...circ, columns: cols });
  };

  const clickCell = (col: number, q: number, e?: React.MouseEvent) => {
    if (!editable) {
      setStep(col + 1);
      return;
    }
    if (e && e.button === 2) {
      removeAt(col, q);
      return;
    }
    if (tool === null) return;
    if (tool === 'erase') {
      removeAt(col, q);
      return;
    }
    const info = GATE_INFO[tool];
    if (MULTI.includes(tool)) {
      const need = tool === 'CCX' ? 3 : 2;
      if (circ.n < need) return;
      if (!pending || pending.col !== col) {
        setPending({ col, qubits: [q] });
        return;
      }
      if (pending.qubits.includes(q)) {
        setPending(null);
        return;
      }
      const qs = [...pending.qubits, q];
      if (qs.length < need) {
        setPending({ col, qubits: qs });
        return;
      }
      setPending(null);
      if (tool === 'SWAP') place(col, { gate: 'SWAP', targets: [qs[0], qs[1]] });
      else if (tool === 'CCX') place(col, { gate: 'CCX', controls: [qs[0], qs[1]], targets: [qs[2]] });
      else place(col, { gate: tool, controls: [qs[0]], targets: [qs[1]], param: tool === 'CP' ? angle : undefined });
      return;
    }
    place(col, { gate: tool, targets: [q], param: info.hasParam ? angle : undefined });
  };

  const setQubits = (n: number) => {
    const cols = circ.columns.map((col) => col.filter((o) => opWires(o).every((w) => w < n)));
    setPending(null);
    update({ n, columns: cols });
  };

  const runShots = () => {
    const counts = new Map<number, number>();
    const N = 1000;
    const init = initState && initState.n === circ.n ? initState : undefined;
    if (!hasMeasure) {
      const { state: s } = runCircuit(circ, { measure: 'skip', initial: init });
      setShots(s.sample(N));
      return;
    }
    const rng = mulberry32(Date.now() & 0xffff);
    for (let i = 0; i < N; i++) {
      const { state: s } = runCircuit(circ, { measure: 'collapse', rng, initial: init });
      const k = s.measureAll(rng);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    setShots(counts);
  };

  const width = LEFT + circ.columns.length * COL_W + 20;
  const height = TOP + circ.n * ROW_H + 6;
  const wireY = (q: number) => TOP + q * ROW_H + ROW_H / 2;
  const colX = (col: number) => LEFT + col * COL_W + COL_W / 2;

  const toolInfo = tool && tool !== 'erase' ? GATE_INFO[tool] : null;
  const pendingHint =
    pending && tool
      ? tool === 'SWAP'
        ? 'Click the second qubit to swap with.'
        : tool === 'CCX' && pending.qubits.length === 1
          ? 'Click the second control qubit.'
          : 'Now click the target qubit (same column).'
      : toolInfo && MULTI.includes(toolInfo.name)
        ? tool === 'SWAP'
          ? 'Click the first qubit, then the second.'
          : 'Click the control qubit first, then the target.'
        : null;

  const blochs = showBloch ? Array.from({ length: circ.n }, (_, q) => ({ v: state.bloch(q), ent: state.entropy1(q) })) : [];
  const anyEntangled = blochs.some((b) => b.ent > 0.01);

  return (
    <Widget title={title}>
      {editable && (
        <div style={{ marginBottom: 10 }}>
          <div className="row" style={{ gap: 6 }}>
            {gates.map((g) => (
              <GateTile key={g} g={g} active={tool === g} onClick={() => { setTool(g); setPending(null); }} />
            ))}
            <button className={`btn small ${tool === 'erase' ? 'active' : ''}`} onClick={() => { setTool('erase'); setPending(null); }} title="Eraser (or right-click a gate)">
              ⌫
            </button>
            <button className="btn small ghost" onClick={() => update({ ...circ, columns: circ.columns.map(() => []) })}>
              Clear
            </button>
            {maxQubits && maxQubits > 1 && (
              <span className="row" style={{ gap: 4, marginLeft: 'auto' }}>
                <span className="faint" style={{ fontSize: '0.85rem' }}>qubits</span>
                <button className="btn small" disabled={circ.n <= 1} onClick={() => setQubits(circ.n - 1)}>−</button>
                <span className="mono">{circ.n}</span>
                <button className="btn small" disabled={circ.n >= maxQubits} onClick={() => setQubits(circ.n + 1)}>+</button>
              </span>
            )}
          </div>
          <div className="row" style={{ marginTop: 6, minHeight: 28, fontSize: '0.85rem' }}>
            {toolInfo?.hasParam && (
              <span className="row" style={{ gap: 4 }}>
                <span className="faint">angle:</span>
                {ANGLES.map((a) => (
                  <button key={a} className={`btn small ${Math.abs(angle - a) < 1e-9 ? 'active' : ''}`} style={{ padding: '2px 8px' }} onClick={() => setAngle(a)}>
                    {fmtPi(a)}
                  </button>
                ))}
              </span>
            )}
            <span className="faint">{pendingHint ?? (toolInfo ? toolInfo.description : tool === 'erase' ? 'Click a gate to remove it.' : '')}</span>
            {maxGates !== undefined && (
              <span className="pill" style={{ marginLeft: 'auto' }}>
                gates {gateCount}/{maxGates}
              </span>
            )}
          </div>
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <svg width={width} height={height} style={{ display: 'block', userSelect: 'none' }} onContextMenu={(e) => e.preventDefault()}>
          {/* step highlight */}
          {stepper && (
            <rect x={LEFT} y={TOP - 4} width={curStep * COL_W} height={circ.n * ROW_H + 8} fill="rgba(88,196,221,0.05)" rx={8} />
          )}
          {/* column headers */}
          {circ.columns.map((_, col) => (
            <text
              key={col}
              x={colX(col)}
              y={14}
              fontSize={10}
              textAnchor="middle"
              fill={col < curStep ? '#58c4dd' : '#555'}
              style={{ cursor: 'pointer' }}
              onClick={() => setStep(col + 1)}
            >
              {col + 1}
            </text>
          ))}
          {/* wires */}
          {Array.from({ length: circ.n }, (_, q) => (
            <g key={q}>
              <text x={8} y={wireY(q) + 5} fontSize={13} fill="#9aa3b5" fontFamily="var(--mono)">
                {qubitLabels?.[q] ?? `q${q}`}
              </text>
              <text x={LEFT - 30} y={wireY(q) + 5} fontSize={13} fill="#6b7385" fontFamily="var(--serif)">
                {initialState ? 'ψ' : '|0⟩'}
              </text>
              <line x1={LEFT - 6} x2={width - 10} y1={wireY(q)} y2={wireY(q)} stroke="#4a5368" strokeWidth={1.5} />
            </g>
          ))}
          {/* clickable cells */}
          {circ.columns.map((_, col) =>
            Array.from({ length: circ.n }, (_, q) => {
              const isPending = pending && pending.col === col && pending.qubits.includes(q);
              return (
                <rect
                  key={`${col}-${q}`}
                  x={colX(col) - COL_W / 2 + 2}
                  y={wireY(q) - ROW_H / 2 + 2}
                  width={COL_W - 4}
                  height={ROW_H - 4}
                  rx={8}
                  fill={isPending ? 'rgba(252,211,77,0.25)' : 'transparent'}
                  stroke={isPending ? '#fcd34d' : 'transparent'}
                  className={editable ? 'cl-cell' : ''}
                  style={{ cursor: editable ? 'pointer' : 'default' }}
                  onMouseDown={(e) => clickCell(col, q, e)}
                />
              );
            }),
          )}
          {/* ops */}
          {circ.columns.map((colOps, col) =>
            colOps.map((op, k) => <OpGlyph key={`${col}-${k}`} op={op} x={colX(col)} wireY={wireY} dim={stepper && col >= curStep} onRemove={editable ? (q) => removeAt(col, q) : undefined} />),
          )}
        </svg>
      </div>
      <style>{`.cl-cell:hover { fill: rgba(88,196,221,0.08); stroke: rgba(88,196,221,.3); }`}</style>

      {stepper && endStep > 0 && (
        <div className="row" style={{ marginTop: 6, fontSize: '0.85rem' }}>
          <span className="faint">Show state after step</span>
          <input type="range" min={0} max={endStep} step={1} value={curStep} onChange={(e) => setStep(parseInt(e.target.value, 10))} style={{ maxWidth: 260 }} />
          <span className="mono" style={{ color: 'var(--yellow)' }}>
            {curStep}/{endStep}
          </span>
          {curStep !== endStep && (
            <button className="btn small ghost" onClick={() => setStep(null)}>
              ⏭ end
            </button>
          )}
          {hasMeasure && (
            <button className="btn small" onClick={() => setSeed((s) => s + 1)} title="Measurements are random — roll again">
              🎲 re-roll measurements
            </button>
          )}
          {result.measurements.length > 0 && (
            <span className="faint">
              outcomes: {result.measurements.map(([q, r]) => `q${q}=${r}`).join(', ')}
            </span>
          )}
        </div>
      )}

      {goal && (
        <div
          className="panel"
          style={{ marginTop: 10, padding: 10, borderColor: solved || solvedBefore ? 'var(--green)' : 'var(--border)', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}
        >
          <div>
            <div style={{ fontWeight: 600, color: goalMet ? 'var(--green)' : 'var(--yellow)' }}>
              {goalMet ? '✓ Goal achieved!' : `🎯 Goal: ${goal.label ?? (goal.kind === 'state' ? 'prepare the target state' : 'implement the target operation')}`}
            </div>
            {goalMet && <div className="faint" style={{ fontSize: '0.85rem' }}>Solved with {gateCount} gate{gateCount === 1 ? '' : 's'}.</div>}
          </div>
          {goal.kind === 'state' && !hideGoal && (
            <div style={{ minWidth: 240, flex: 1 }}>
              <div className="faint" style={{ fontSize: '0.78rem' }}>Target amplitudes</div>
              <AmplitudeView amps={goal.amps} n={circ.n} compact hideZero showNumbers />
            </div>
          )}
        </div>
      )}

      {(showAmplitudes || showBloch || showKet || showHistogram) && (
        <div style={{ display: 'grid', gridTemplateColumns: showAmplitudes && showBloch ? 'minmax(260px,1.3fr) 1fr' : '1fr', gap: 16, marginTop: 12 }}>
          {showAmplitudes && (
            <div>
              <div className="faint" style={{ fontSize: '0.78rem', marginBottom: 4 }}>
                State {curStep === endStep ? 'at the end' : `after step ${curStep}`}
              </div>
              {showKet && (
                <div className="mono" style={{ fontSize: '0.88rem', color: 'var(--text)', marginBottom: 6, wordBreak: 'break-word' }}>
                  |ψ⟩ = {stateToKetString(state.clone().canonicalPhase(), 3)}
                </div>
              )}
              <AmplitudeView amps={state.clone().canonicalPhase().amplitudes()} n={circ.n} compact={circ.n > 2} hideZero={circ.n > 3} />
              <div style={{ marginTop: 6 }}>
                <PhaseLegend size={40} />
              </div>
            </div>
          )}
          {showBloch && (
            <div>
              <div className="faint" style={{ fontSize: '0.78rem', marginBottom: 4 }}>
                Each qubit on its own (reduced state)
              </div>
              <div className="row" style={{ gap: 6 }}>
                {blochs.map((b, q) => (
                  <div key={q} style={{ textAlign: 'center' }}>
                    <MiniBloch v={b.v} size={72} label={qubitLabels?.[q] ?? `q${q}`} color={b.ent > 0.01 ? '#e07ab6' : '#fcd34d'} />
                    {b.ent > 0.01 && (
                      <div style={{ fontSize: '0.68rem', color: 'var(--pink)' }}>entangled {(b.ent * 100).toFixed(0)}%</div>
                    )}
                  </div>
                ))}
              </div>
              {anyEntangled && (
                <div className="faint" style={{ fontSize: '0.78rem', marginTop: 4 }}>
                  A pink arrow shorter than the sphere means that qubit has no pure state of its own — it's entangled with the others.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showHistogram && (
        <div style={{ marginTop: 12 }}>
          <div className="row">
            <button className="btn small primary" onClick={runShots}>
              ▶ Run 1000 shots
            </button>
            <span className="faint" style={{ fontSize: '0.85rem' }}>Measure every qubit at the end, many times.</span>
          </div>
          {shots && <Histogram counts={shots} n={circ.n} total={1000} />}
        </div>
      )}
    </Widget>
  );
}

function GateTile({ g, active, onClick }: { g: GateName; active: boolean; onClick: () => void }) {
  const info = GATE_INFO[g];
  const label = g === 'CNOT' ? 'CNOT' : g === 'CCX' ? 'CCX' : g === 'SWAP' ? 'SWAP' : g === 'CP' ? 'CP' : info.label;
  return (
    <button
      onClick={onClick}
      title={info.description}
      style={{
        minWidth: 42,
        height: 36,
        padding: '0 8px',
        borderRadius: 8,
        border: `2px solid ${active ? '#fff' : info.color}`,
        background: active ? info.color : `${info.color}22`,
        color: active ? '#111' : info.color,
        fontFamily: 'var(--serif)',
        fontWeight: 700,
        fontSize: label.length > 2 ? '0.78rem' : '1rem',
        cursor: 'pointer',
        boxShadow: active ? `0 0 12px ${info.color}` : 'none',
      }}
    >
      {label}
    </button>
  );
}

function OpGlyph({ op, x, wireY, dim, onRemove }: { op: Op; x: number; wireY: (q: number) => number; dim?: boolean; onRemove?: (q: number) => void }) {
  const info = GATE_INFO[op.gate];
  const [lo, hi] = opSpan(op);
  const opacity = dim ? 0.38 : 1;
  const ctx = (e: React.MouseEvent, q: number) => {
    if (e.button === 2 && onRemove) {
      e.stopPropagation();
      onRemove(q);
    }
  };
  const box = (q: number, label: string, color: string, sub?: string) => (
    <g key={`b${q}`} onMouseDown={(e) => ctx(e, q)} style={{ pointerEvents: onRemove ? 'auto' : 'none' }}>
      <rect x={x - BOX / 2} y={wireY(q) - BOX / 2} width={BOX} height={BOX} rx={7} fill="#141821" stroke={color} strokeWidth={2} />
      <rect x={x - BOX / 2} y={wireY(q) - BOX / 2} width={BOX} height={BOX} rx={7} fill={color} fillOpacity={0.16} />
      <text x={x} y={wireY(q) + (sub ? 1 : 6)} textAnchor="middle" fontSize={label.length > 2 ? 12 : 16} fontWeight={700} fill={color} fontFamily="var(--serif)">
        {label}
      </text>
      {sub && (
        <text x={x} y={wireY(q) + 13} textAnchor="middle" fontSize={8.5} fill="#cfd6e4" fontFamily="var(--mono)">
          {sub}
        </text>
      )}
    </g>
  );
  const vline = hi > lo ? <line x1={x} x2={x} y1={wireY(lo)} y2={wireY(hi)} stroke={info.color} strokeWidth={2} /> : null;
  const dot = (q: number) => <circle key={`d${q}`} cx={x} cy={wireY(q)} r={6} fill={info.color} onMouseDown={(e) => ctx(e, q)} />;

  let body: React.ReactNode;
  switch (op.gate) {
    case 'CNOT':
    case 'CCX':
      body = (
        <>
          {vline}
          {(op.controls ?? []).map(dot)}
          {op.targets.map((t) => (
            <g key={t} onMouseDown={(e) => ctx(e, t)}>
              <circle cx={x} cy={wireY(t)} r={13} fill="#141821" stroke={info.color} strokeWidth={2} />
              <line x1={x - 13} x2={x + 13} y1={wireY(t)} y2={wireY(t)} stroke={info.color} strokeWidth={2} />
              <line x1={x} x2={x} y1={wireY(t) - 13} y2={wireY(t) + 13} stroke={info.color} strokeWidth={2} />
            </g>
          ))}
        </>
      );
      break;
    case 'CZ':
      body = (
        <>
          {vline}
          {[...(op.controls ?? []), ...op.targets].map(dot)}
        </>
      );
      break;
    case 'SWAP':
      body = (
        <>
          {vline}
          {op.targets.map((t) => (
            <g key={t} stroke={info.color} strokeWidth={2.5} onMouseDown={(e) => ctx(e, t)}>
              <line x1={x - 8} x2={x + 8} y1={wireY(t) - 8} y2={wireY(t) + 8} />
              <line x1={x - 8} x2={x + 8} y1={wireY(t) + 8} y2={wireY(t) - 8} />
            </g>
          ))}
        </>
      );
      break;
    case 'M':
      body = op.targets.map((t) => (
        <g key={t} onMouseDown={(e) => ctx(e, t)}>
          <rect x={x - BOX / 2} y={wireY(t) - BOX / 2} width={BOX} height={BOX} rx={7} fill="#1d2230" stroke="#bbb" strokeWidth={1.5} />
          <path d={`M${x - 11} ${wireY(t) + 7} A 12 12 0 0 1 ${x + 11} ${wireY(t) + 7}`} fill="none" stroke="#ddd" strokeWidth={1.6} />
          <line x1={x} y1={wireY(t) + 7} x2={x + 8} y2={wireY(t) - 8} stroke="#fcd34d" strokeWidth={1.8} />
        </g>
      ));
      break;
    default: {
      const sub = op.param !== undefined ? fmtPi(op.param) : undefined;
      body = (
        <>
          {vline}
          {(op.controls ?? []).map(dot)}
          {op.targets.map((t) => box(t, info.label, info.color, sub))}
        </>
      );
    }
  }
  return <g opacity={opacity}>{body}</g>;
}

export function Histogram({ counts, n, total }: { counts: Map<number, number>; n: number; total: number }) {
  const entries = Array.from({ length: 1 << n }, (_, i) => [i, counts.get(i) ?? 0] as [number, number]).filter(([, v]) => (1 << n) <= 16 || v > 0);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 150, marginTop: 10, padding: '0 4px', overflowX: 'auto' }}>
      {entries.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 34, flex: 1 }}>
          <span className="mono" style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
            {((v / total) * 100).toFixed(1)}%
          </span>
          <div style={{ width: '70%', height: `${(v / max) * 100}px`, background: 'linear-gradient(180deg,#58c4dd,#29abca)', borderRadius: '4px 4px 0 0', transition: 'height .4s' }} />
          <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-faint)' }}>
            {k.toString(2).padStart(n, '0')}
          </span>
        </div>
      ))}
    </div>
  );
}

export { circuitToText };
