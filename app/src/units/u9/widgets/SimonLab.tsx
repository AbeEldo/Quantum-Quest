import React, { useMemo, useState } from 'react';
import { Widget, Segmented } from '../../../components/ui';
import { StateVector, mulberry32 } from '../../../engine/qsim';
import { c } from '../../../engine/complex';
import { BitToggles, ProbBars } from './viz';
import { bitstr, dot2, simonTable, gf2RREF, gf2Solutions, sampleFrom } from '../algos';

const n = 3;
const N = 1 << n;
const PAIR_COLORS = ['#58c4dd', '#fcd34d', '#83c167', '#e07ab6', '#ff8c42', '#9a72ac', '#5cd0b3', '#fc6255'];

type Run = { v: number; x0: number; y: number; probs: number[] };

/** Simon's algorithm on 3 bits: run the circuit, collect equations y·s = 0, solve over GF(2). */
export function SimonLab() {
  const [mode, setMode] = useState<'choose' | 'mystery'>('choose');
  const [s, setS] = useState(0b110);
  const [seed, setSeed] = useState(1);
  const mysterySecret = useMemo(() => 1 + Math.floor(mulberry32(seed * 7919 + 13)() * (N - 1)), [seed]);
  const secret = mode === 'choose' ? s : mysterySecret;
  const table = useMemo(() => simonTable(n, secret, mulberry32(seed * 31 + secret)), [secret, seed]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [stage, setStage] = useState(3);
  const [guess, setGuess] = useState(0);
  const [checked, setChecked] = useState<null | boolean>(null);

  const last = runs[runs.length - 1];
  const rows = runs.map((r) => r.y);
  const rref = gf2RREF(rows, n);
  const sols = gf2Solutions(rows, n).filter((x) => x !== 0);
  const solved = rref.length === n - 1;

  // pair colours: x and x⊕s share a colour
  const pairIndex = useMemo(() => {
    const idx: number[] = new Array(N).fill(-1);
    let k = 0;
    for (let x = 0; x < N; x++) if (idx[x] < 0) { idx[x] = k; idx[x ^ secret] = k; k++; }
    return idx;
  }, [secret]);

  const runOnce = () => {
    const rng = Math.random;
    const x0 = Math.floor(rng() * N);
    const v = table[x0];
    // collapsed input register: (|x0⟩ + |x0⊕s⟩)/√2, then H on every qubit (shared engine)
    const amps = Array.from({ length: N }, (_, x) => c(table[x] === v ? 1 : 0));
    const st = StateVector.fromAmplitudes(amps);
    for (let q = 0; q < n; q++) st.h(q);
    const probs = st.probabilities();
    const y = sampleFrom(probs, rng);
    setRuns((r) => [...r, { v, x0, y, probs }]);
    setStage(0);
    setChecked(null);
  };

  const reset = (nextSeed = seed + 1) => {
    setRuns([]);
    setSeed(nextSeed);
    setStage(3);
    setChecked(null);
    setGuess(0);
  };

  const hideTable = mode === 'mystery';

  return (
    <Widget title="Simon's algorithm: hunting a hidden XOR mask">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
        <Segmented
          options={[
            { value: 'choose', label: 'You pick s' },
            { value: 'mystery', label: '🎲 Mystery s' },
          ]}
          value={mode}
          onChange={(m) => {
            setMode(m);
            reset();
          }}
        />
        {mode === 'choose' && (
          <span className="row" style={{ gap: 6 }}>
            <span className="dim">hidden mask s =</span>
            <BitToggles n={n} value={s} onChange={(v) => { if (v !== 0) { setS(v); reset(); } }} />
          </span>
        )}
        <span className="row" style={{ gap: 6 }}>
          <button className="btn small primary" onClick={runOnce} disabled={mode === 'choose' && s === 0}>
            ⚛ Run circuit once
          </button>
          <button className="btn small ghost" onClick={() => reset()}>
            reset ↻
          </button>
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 0.9fr) minmax(280px, 1.4fr)', gap: 16 }}>
        {/* truth table */}
        <div>
          <div className="faint" style={{ fontSize: '0.78rem', marginBottom: 4 }}>
            The oracle's truth table {hideTable ? '(hidden: you only get to query it)' : '(same colour = same output: x and x⊕s collide)'}
          </div>
          <table className="mono" style={{ borderCollapse: 'collapse', fontSize: '0.88rem', width: '100%' }}>
            <thead>
              <tr className="faint">
                <td style={{ padding: '2px 8px' }}>x</td>
                <td style={{ padding: '2px 8px' }}>f(x)</td>
              </tr>
            </thead>
            <tbody>
              {table.map((fx, x) => {
                const lit = last && stage >= 1 && (stage < 2 || fx === last.v);
                const col = PAIR_COLORS[pairIndex[x]];
                return (
                  <tr key={x} style={{ background: lit ? `${col}22` : 'transparent', transition: 'background .3s' }}>
                    <td style={{ padding: '2px 8px', color: lit ? col : 'var(--text-dim)' }}>{bitstr(x, n)}</td>
                    <td style={{ padding: '2px 8px', color: hideTable ? 'var(--text-faint)' : col }}>{hideTable ? '???' : bitstr(fx, n)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* stage view */}
        <div>
          {!last ? (
            <div className="panel dim" style={{ padding: 16 }}>
              Press <b>Run circuit once</b>. Each run makes <b>one</b> quantum query and yields one random string y. Watch which y's can appear.
            </div>
          ) : (
            <>
              <div className="row" style={{ gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
                {['① superpose all x', '② query', '③ measure f-register', '④ H on x-register'].map((lbl, k) => (
                  <button key={k} className={`btn small ${stage === k ? 'active' : 'ghost'}`} onClick={() => setStage(k)}>
                    {lbl}
                  </button>
                ))}
              </div>
              <div className="dim" style={{ fontSize: '0.88rem', minHeight: 44 }}>
                {stage === 0 && <>Input register in an equal superposition of all 8 strings; output register |000⟩.</>}
                {stage === 1 && <>One query writes f(x) into the output register: Σ|x⟩|f(x)⟩. Input and output are now entangled.</>}
                {stage === 2 && (
                  <>
                    We measure the output and see <b className="mono">{hideTable ? '(some value)' : bitstr(last.v, n)}</b>. Only the two inputs that collide survive:
                    {hideTable ? ' a pair x₀, x₀⊕s that we do not get to see.' : <> <b className="mono">|{bitstr(last.x0, n)}⟩ + |{bitstr(last.x0 ^ secret, n)}⟩</b> (they differ by exactly s).</>}
                  </>
                )}
                {stage === 3 && (
                  <>
                    Hadamards make the pair interfere. Outputs with <b>y·s = 1</b> cancel; the four with <b>y·s = 0</b> survive at 25% each. We observed{' '}
                    <b className="mono" style={{ color: 'var(--yellow)' }}>y = {bitstr(last.y, n)}</b>.
                  </>
                )}
              </div>
              {stage === 3 && (
                <ProbBars bars={last.probs.map((p, y) => ({ value: p, label: bitstr(y, n), highlight: y === last.y }))} yMax={0.5} height={130} labelEvery={1} />
              )}
            </>
          )}
        </div>
      </div>

      {/* notebook */}
      <div className="panel" style={{ padding: 12, marginTop: 12 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <b>Lab notebook: equations over GF(2)</b>
          <span className="pill">queries: {runs.length} · rank {rref.length}/{n - 1}</span>
        </div>
        <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          {runs.length === 0 && <span className="faint">No measurements yet.</span>}
          {runs.map((r, k) => (
            <span key={k} className="mono pill" style={{ opacity: r.y === 0 ? 0.5 : 1 }} title={r.y === 0 ? 'y = 000 tells you nothing' : undefined}>
              {eqText(r.y)} = 0
            </span>
          ))}
        </div>
        {runs.length > 0 && (
          <div className="dim" style={{ fontSize: '0.86rem', marginTop: 8 }}>
            Non-zero masks consistent with every equation so far:{' '}
            <b className="mono">{sols.map((x) => bitstr(x, n)).join(', ') || '—'}</b>
            {solved && (
              <span style={{ color: 'var(--green)' }}>
                {' '}
                → rank {n - 1} reached: s is pinned down{mode === 'choose' ? ` (s = ${bitstr(sols[0], n)} ✓)` : ''}.
              </span>
            )}
          </div>
        )}
        {mode === 'mystery' && (
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <span className="dim">Your answer s =</span>
            <BitToggles n={n} value={guess} onChange={(v) => { setGuess(v); setChecked(null); }} />
            <button className="btn small primary" disabled={guess === 0} onClick={() => setChecked(guess === secret)}>
              check
            </button>
            {checked !== null && (
              <span className={`pill ${checked ? 'good' : 'bad'} pop`}>
                {checked ? `✓ correct, using ${runs.length} quantum quer${runs.length === 1 ? 'y' : 'ies'}` : '✗ not consistent with the hidden function'}
              </span>
            )}
            {checked && <button className="btn small ghost" onClick={() => reset(seed + 7)}>new mystery ↻</button>}
          </div>
        )}
        {mode === 'mystery' && runs.length > 0 && guess !== 0 && (
          <div className="faint" style={{ fontSize: '0.8rem', marginTop: 4 }}>
            Your candidate satisfies {rows.filter((y) => dot2(y, guess) === 0).length}/{rows.length} equations.
          </div>
        )}
      </div>
    </Widget>
  );
}

function eqText(y: number) {
  const terms: string[] = [];
  for (let k = 0; k < n; k++) if (y & (1 << (n - 1 - k))) terms.push(`s${k + 1}`);
  return terms.length ? terms.join(' ⊕ ') : '0';
}
