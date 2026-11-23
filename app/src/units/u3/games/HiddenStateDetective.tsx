import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Slider, Stat, ProgressBar, Tex, RichText, fmtPi } from '../../../components/ui';
import { useGame, GameOverlay, HowToPlay } from '../../../components/game';
import { BlochSphere, vecFromAngles, anglesFromVec, type Vec3 } from '../../../widgets/BlochSphere';
import { mulberry32 } from '../../../engine/qsim';
import { measureAlong, fidelity, estimate, norm3, type V3 } from './spinEngine';

/* ============================== Case design ============================== */

type Basis = 'X' | 'Y' | 'Z' | 'C';

interface CaseSpec {
  kind: 'cardinal' | 'real' | 'any';
  budget: number;
  custom: boolean;
  title: string;
  hint: string;
}

const CASES: CaseSpec[] = [
  { kind: 'cardinal', budget: 30, custom: false, title: 'A compass point', hint: 'The suspect is one of the six cardinal states $|0\\rangle, |1\\rangle, |\\pm\\rangle, |\\pm i\\rangle$.' },
  { kind: 'cardinal', budget: 16, custom: false, title: 'Lean budget', hint: 'Another cardinal state, but only 16 shots. Unused shots score bonus points if you nail it.' },
  { kind: 'real', budget: 30, custom: false, title: 'Real amplitudes', hint: 'Intel says the amplitudes are **real**: the state lies on the $x$–$z$ great circle ($\\phi = 0$ or $\\pi$).' },
  { kind: 'any', budget: 40, custom: false, title: 'Anywhere on the sphere', hint: 'No intel. The state could be any point on the Bloch sphere.' },
  { kind: 'any', budget: 30, custom: true, title: 'Custom analyzer', hint: 'New tool: measure along **any axis** you like. Try rough $x,y,z$ estimates first, then refine along your guess.' },
  { kind: 'any', budget: 24, custom: true, title: 'Final case', hint: 'Tightest budget yet. Spend wisely.' },
];

const CARDINALS: Vec3[] = [
  [0, 0, 1],
  [0, 0, -1],
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
];

function makeTruth(spec: CaseSpec, rng: () => number): Vec3 {
  if (spec.kind === 'cardinal') return CARDINALS[Math.floor(rng() * 6)];
  if (spec.kind === 'real') {
    // avoid the poles so it's not just a cardinal state
    const th = 0.25 + rng() * (Math.PI - 0.5);
    return vecFromAngles(th, rng() < 0.5 ? 0 : Math.PI);
  }
  // uniform on the sphere
  const z = 2 * rng() - 1;
  const ph = 2 * Math.PI * rng();
  const s = Math.sqrt(1 - z * z);
  return [s * Math.cos(ph), s * Math.sin(ph), z];
}

const AXIS: Record<'X' | 'Y' | 'Z', Vec3> = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };
const KETS: Record<'X' | 'Y' | 'Z', [string, string]> = { X: ['|+⟩', '|−⟩'], Y: ['|+i⟩', '|−i⟩'], Z: ['|0⟩', '|1⟩'] };
const BASIS_COL: Record<Basis, string> = { X: '#fc6255', Y: '#83c167', Z: '#58c4dd', C: '#fcd34d' };

interface Tally {
  p: number;
  m: number;
}
interface Shot {
  b: Basis;
  r: 1 | -1;
}
interface CaseResult {
  truth: Vec3;
  guess: Vec3;
  F: number;
  used: number;
  budget: number;
  points: number;
  tallies: Record<'X' | 'Y' | 'Z', Tally>;
}

const emptyTallies = (): Record<'X' | 'Y' | 'Z', Tally> => ({ X: { p: 0, m: 0 }, Y: { p: 0, m: 0 }, Z: { p: 0, m: 0 } });
const texPi = (x: number) => fmtPi(x).replace('π', '\\pi').replace('−', '-');
const f2 = (x: number) => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(2);

/* ============================== Small views ============================== */

function EstimateBar({ label, color, tally, kets }: { label: React.ReactNode; color: string; tally: Tally; kets: [string, string] }) {
  const e = estimate(tally.p, tally.m);
  const W = 100;
  const pos = (v: number) => ((v + 1) / 2) * W;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '56px 1fr 92px', gap: 8, alignItems: 'center', fontSize: '0.85rem' }}>
      <span style={{ color, fontWeight: 700 }}>{label}</span>
      <svg viewBox={`-4 0 ${W + 8} 26`} width="100%" height={26}>
        <line x1={0} y1={13} x2={W} y2={13} stroke="#2a3142" strokeWidth={6} strokeLinecap="round" />
        <line x1={W / 2} y1={6} x2={W / 2} y2={20} stroke="#3a4256" strokeWidth={0.8} />
        {e.n > 0 && (
          <>
            <rect x={pos(Math.max(-1, e.mean - e.err))} y={9} width={Math.max(0.8, pos(Math.min(1, e.mean + e.err)) - pos(Math.max(-1, e.mean - e.err)))} height={8} rx={3} fill={color} opacity={0.25} />
            <circle cx={pos(e.mean)} cy={13} r={4} fill={color} style={{ transition: 'cx .25s' }} />
          </>
        )}
        <text x={0} y={25} fontSize={6} fill="#6b7385">−1 {kets[1]}</text>
        <text x={W} y={25} fontSize={6} fill="#6b7385" textAnchor="end">{kets[0]} +1</text>
      </svg>
      <span className="mono" style={{ fontSize: '0.78rem' }}>
        {e.n ? (
          <>
            {f2(e.mean)} <span className="faint">±{e.err.toFixed(2)}</span>
          </>
        ) : (
          <span className="faint">no data</span>
        )}
      </span>
    </div>
  );
}

/* ============================== Component ============================== */

type Stage = 'intro' | 'measure' | 'revealed' | 'over';

export default function HiddenStateDetective() {
  const g = useGame('hidden-state-detective');
  const [stage, setStage] = useState<Stage>('intro');
  const [caseIdx, setCaseIdx] = useState(0);
  const [truths, setTruths] = useState<Vec3[]>([]);
  const rngRef = useRef<() => number>(Math.random);
  const [tallies, setTallies] = useState(emptyTallies);
  const [custom, setCustom] = useState<{ axis: Vec3; t: Tally }>({ axis: [0, 0, 1], t: { p: 0, m: 0 } });
  const [cTheta, setCTheta] = useState(Math.PI / 2);
  const [cPhi, setCPhi] = useState(Math.PI / 4);
  const [log, setLog] = useState<Shot[]>([]);
  const [used, setUsed] = useState(0);
  const [guess, setGuess] = useState<Vec3>([0, 0, 1]);
  const [results, setResults] = useState<CaseResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [flashKey, setFlashKey] = useState(0);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current !== null) window.clearInterval(timer.current);
  }, []);

  const spec = CASES[caseIdx];
  const truth = truths[caseIdx] ?? [0, 0, 1];
  const left = spec.budget - used;
  const ga = anglesFromVec(guess);

  const startRun = () => {
    const rng = mulberry32((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
    rngRef.current = rng;
    setTruths(CASES.map((s) => makeTruth(s, rng)));
    setResults([]);
    setCaseIdx(0);
    resetCase();
    setStage('measure');
  };

  const resetCase = () => {
    setTallies(emptyTallies());
    setCustom({ axis: vecFromAngles(cTheta, cPhi), t: { p: 0, m: 0 } });
    setLog([]);
    setUsed(0);
    setGuess([0, 0, 1]);
  };

  const customAxis = vecFromAngles(cTheta, cPhi);

  const measure = (b: Basis, k: number) => {
    if (busy || stage !== 'measure') return;
    const n = Math.min(k, left);
    if (n <= 0) return;
    const axis: V3 = b === 'C' ? customAxis : AXIS[b];
    if (b === 'C') {
      // new axis → new tally
      const same = custom.axis.every((x, i) => Math.abs(x - axis[i]) < 1e-9);
      if (!same) setCustom({ axis, t: { p: 0, m: 0 } });
    }
    const outcomes: (1 | -1)[] = Array.from({ length: n }, () => measureAlong(truth, axis, rngRef.current));
    setBusy(true);
    let i = 0;
    const step = () => {
      const r = outcomes[i];
      if (b === 'C') setCustom((c) => ({ axis, t: { p: c.t.p + (r > 0 ? 1 : 0), m: c.t.m + (r < 0 ? 1 : 0) } }));
      else setTallies((t) => ({ ...t, [b]: { p: t[b].p + (r > 0 ? 1 : 0), m: t[b].m + (r < 0 ? 1 : 0) } }));
      setLog((l) => [...l, { b, r }]);
      setUsed((u) => u + 1);
      setFlashKey((f) => f + 1);
      i++;
      if (i >= n) {
        if (timer.current !== null) window.clearInterval(timer.current);
        timer.current = null;
        setBusy(false);
      }
    };
    step();
    if (n > 1) timer.current = window.setInterval(step, Math.max(45, 320 / n));
  };

  const est: V3 = [estimate(tallies.X.p, tallies.X.m).mean, estimate(tallies.Y.p, tallies.Y.m).mean, estimate(tallies.Z.p, tallies.Z.m).mean];
  const estLen = Math.hypot(...est);
  const anyData = tallies.X.p + tallies.X.m + tallies.Y.p + tallies.Y.m + tallies.Z.p + tallies.Z.m > 0;

  const submit = () => {
    if (busy) return;
    const F = fidelity(guess, truth);
    const unused = spec.budget - used;
    const points = Math.round(100 * F) + (F >= 0.95 ? 2 * unused : 0);
    const res: CaseResult = { truth, guess, F, used, budget: spec.budget, points, tallies };
    setResults((r) => [...r, res]);
    if (F >= 0.99) g.unlock('u3-sharp-eye');
    setStage('revealed');
  };

  const next = () => {
    if (caseIdx + 1 >= CASES.length) {
      const all = results;
      const total = all.reduce((a, r) => a + r.points, 0);
      const avgF = all.reduce((a, r) => a + r.F, 0) / all.length;
      const beaten = avgF >= 0.9;
      g.finish(total, beaten, { lastAvgF: avgF });
      if (beaten) g.unlock('u3-detective');
      setStage('over');
      return;
    }
    setCaseIdx((c) => c + 1);
    resetCase();
    setStage('measure');
  };

  const last = results[results.length - 1];
  const totalPts = results.reduce((a, r) => a + r.points, 0);
  const avgF = results.length ? results.reduce((a, r) => a + r.F, 0) / results.length : 0;
  const lastShot = log[log.length - 1];

  const explanation = useMemo(() => {
    if (!last) return [] as string[];
    const lines: string[] = [];
    const ta = anglesFromVec(last.truth);
    (['X', 'Y', 'Z'] as const).forEach((b, k) => {
      const t = last.tallies[b];
      const n = t.p + t.m;
      const comp = last.truth[k];
      if (n === 0) lines.push(`You never measured along **${b.toLowerCase()}**, so the ${b.toLowerCase()}-component (truly $${comp.toFixed(2)}$) was pure inference.`);
      else
        lines.push(
          `**${b}**: ${t.p} of ${n} came out ${KETS[b][0]}, so $\\langle\\sigma_${b.toLowerCase()}\\rangle \\approx ${((t.p - t.m) / n).toFixed(2)}$ (true value $${comp.toFixed(2)}$; expected scatter $\\approx \\pm${(2 * Math.sqrt(((1 + comp) / 2) * ((1 - comp) / 2) / n)).toFixed(2)}$).`,
        );
    });
    lines.push(
      `The hidden state was $\\theta = ${texPi(ta.theta)},\\ \\phi = ${texPi(ta.phi)}$: Bloch vector $(${last.truth.map((x) => x.toFixed(2)).join(', ')})$. Fidelity $= \\tfrac{1+\\vec r_{\\rm guess}\\cdot\\vec r_{\\rm true}}{2} = ${last.F.toFixed(3)}$.`,
    );
    return lines;
  }, [last]);

  /* -------------------------------- render -------------------------------- */

  if (stage === 'intro') {
    return (
      <div>
        <HowToPlay>
          <p style={{ marginTop: 0 }}>
            A source keeps preparing <b>the same mystery qubit</b>, one copy per shot. Each measurement destroys its copy and gives you just one bit: <b>+</b> or <b>−</b> along the axis you chose.
            Use your shot budget to estimate the three Bloch components <RichText text="$\langle\sigma_x\rangle, \langle\sigma_y\rangle, \langle\sigma_z\rangle$" />, then drag your guess on the
            Bloch sphere and submit.
          </p>
          <p>
            Score per case = <b>100 × fidelity</b>, where fidelity <RichText text="$F = |\langle \text{guess}|\text{true}\rangle|^2 = \tfrac{1+\vec r_g\cdot\vec r_t}{2}$" />. If <i>F</i> ≥ 0.95, every
            unused shot earns +2 bonus. Solve all six cases with an average fidelity of at least 90% to close the file.
          </p>
          <p style={{ marginBottom: 0 }}>
            This is <b>quantum state tomography</b>, the real procedure labs use to check what their hardware made. Why do you need many copies? Because one copy can’t be identified: a single
            measurement yields one bit and wrecks the state, and the <b>no-cloning theorem</b> forbids copying an unknown state to measure it several ways.
          </p>
        </HowToPlay>
        <div className="panel center" style={{ padding: 30 }}>
          <div style={{ fontSize: '3rem' }}>🕵️</div>
          <h2 style={{ margin: '6px 0' }}>Six cases. One sphere. Limited evidence.</h2>
          <div className="dim" style={{ maxWidth: 560, margin: '0 auto 16px' }}>
            Random guessing gives an average fidelity of only 50%. Good detectives beat 90%.
            {g.best > 0 && <> Your best total so far: <b>{Math.round(g.best)}</b> points.</>}
          </div>
          <button className="btn primary" onClick={startRun}>
            🔎 Open the first case
          </button>
        </div>
      </div>
    );
  }

  const revealed = stage === 'revealed' || stage === 'over';
  const estPoint: Vec3 | null = anyData && estLen > 0.05 ? (norm3(est) as Vec3) : null;
  const fCol = (F: number) => (F >= 0.95 ? 'var(--green)' : F >= 0.85 ? 'var(--yellow)' : 'var(--red)');

  return (
    <div>
      <HowToPlay defaultOpen={false}>
        Choose an axis and spend shots. Each shot measures a <b>fresh copy</b> of the hidden state. The bars show your running estimates of the Bloch components with ±1σ error bars, which shrink like{' '}
        <RichText text="$1/\sqrt{n}$" />. Drag the gold arrow (or use the sliders) to your best guess, then <b>Submit</b>. The faint dot on the sphere is the direction of your raw estimate.
      </HowToPlay>

      {/* case header */}
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
        <div className="row" style={{ gap: 6 }}>
          {CASES.map((c, i) => {
            const r = results[i];
            return (
              <span
                key={i}
                title={c.title}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  border: `2px solid ${i === caseIdx ? 'var(--yellow)' : 'var(--border)'}`,
                  background: r ? fCol(r.F) : 'var(--panel-2)',
                  color: r ? '#0b0d12' : 'var(--text-dim)',
                }}
              >
                {i + 1}
              </span>
            );
          })}
        </div>
        <div className="row" style={{ gap: 16 }}>
          <Stat label="points" value={totalPts} color="var(--yellow)" />
          <Stat label="avg fidelity" value={results.length ? `${(avgF * 100).toFixed(1)}%` : '—'} color={results.length ? fCol(avgF) : undefined} />
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 12, padding: '10px 16px' }}>
        <b>
          Case {caseIdx + 1}: {spec.title}
        </b>
        <span className="dim">
          {' '}
          — <RichText text={spec.hint} />
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
        {/* ----------------------------- sphere ----------------------------- */}
        <div className="panel" style={{ padding: 10, position: 'relative' }}>
          <BlochSphere
            vector={guess}
            onDrag={revealed ? undefined : (v) => setGuess(v)}
            vectors={revealed && last ? [{ v: last.truth, color: '#e07ab6', label: 'truth' }] : []}
            points={!revealed && estPoint ? [{ v: estPoint, color: '#9aa3b5' }] : []}
            height={330}
          />
          {!revealed && (
            <div className="col" style={{ gap: 6, marginTop: 6 }}>
              <Slider label={<Tex>{'\\theta'}</Tex>} value={ga.theta} min={0} max={Math.PI} step={Math.PI / 90} onChange={(t) => setGuess(vecFromAngles(t, ga.phi))} format={fmtPi} />
              <Slider label={<Tex>{'\\phi'}</Tex>} value={ga.phi} min={0} max={2 * Math.PI} step={Math.PI / 90} onChange={(p) => setGuess(vecFromAngles(ga.theta, p))} format={fmtPi} />
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                <button className="btn small ghost" disabled={!estPoint} onClick={() => estPoint && setGuess(estPoint)} title="Point the guess along your raw (x,y,z) estimate">
                  🎯 Snap to estimate
                </button>
                {spec.custom && (
                  <button
                    className="btn small ghost"
                    onClick={() => {
                      setCTheta(ga.theta);
                      setCPhi(ga.phi);
                    }}
                    title="Aim the custom analyzer along your current guess"
                  >
                    🧭 Aim analyzer at guess
                  </button>
                )}
              </div>
              <div className="mono faint" style={{ fontSize: '0.78rem' }}>
                guess = ({guess.map((x) => x.toFixed(2)).join(', ')})
              </div>
            </div>
          )}
          {revealed && last && (
            <div className="pop" style={{ marginTop: 8, textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: fCol(last.F) }}>F = {(last.F * 100).toFixed(1)}%</div>
              <div className="dim" style={{ fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--yellow)' }}>■ your guess</span> &nbsp; <span style={{ color: 'var(--pink)' }}>■ the truth</span>
              </div>
            </div>
          )}
        </div>

        {/* ----------------------------- lab bench ----------------------------- */}
        <div className="panel" style={{ padding: 14 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <b>🔬 Measurement bench</b>
            <span className="mono" style={{ color: left > 0 ? 'var(--text)' : 'var(--red)' }}>
              {left} / {spec.budget} shots left
            </span>
          </div>
          <ProgressBar value={left / spec.budget} color={left / spec.budget > 0.3 ? 'var(--teal)' : 'var(--red)'} style={{ margin: '8px 0 12px' }} />

          <div className="col" style={{ gap: 8 }}>
            {(['Z', 'X', 'Y'] as const).map((b) => (
              <div key={b} style={{ display: 'grid', gap: 4 }}>
                <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ width: 120, fontSize: '0.88rem' }}>
                    along <b style={{ color: BASIS_COL[b] }}>{b.toLowerCase()}</b> <span className="faint">({KETS[b][0]}/{KETS[b][1]})</span>
                  </span>
                  {[1, 5, 10].map((k) => (
                    <button key={k} className="btn small" disabled={busy || revealed || left <= 0} onClick={() => measure(b, k)} style={{ borderColor: BASIS_COL[b] }}>
                      ×{k}
                    </button>
                  ))}
                </div>
                <EstimateBar label={<Tex>{`\\langle\\sigma_${b.toLowerCase()}\\rangle`}</Tex>} color={BASIS_COL[b]} tally={tallies[b]} kets={KETS[b]} />
              </div>
            ))}

            {spec.custom && (
              <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 8, display: 'grid', gap: 4 }}>
                <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ width: 120, fontSize: '0.88rem' }}>
                    along <b style={{ color: BASIS_COL.C }}>custom n̂</b>
                  </span>
                  {[1, 5, 10].map((k) => (
                    <button key={k} className="btn small" disabled={busy || revealed || left <= 0} onClick={() => measure('C', k)} style={{ borderColor: BASIS_COL.C }}>
                      ×{k}
                    </button>
                  ))}
                </div>
                <Slider label={<Tex>{'\\theta_n'}</Tex>} value={cTheta} min={0} max={Math.PI} step={Math.PI / 90} onChange={setCTheta} format={fmtPi} disabled={revealed} />
                <Slider label={<Tex>{'\\phi_n'}</Tex>} value={cPhi} min={0} max={2 * Math.PI} step={Math.PI / 90} onChange={setCPhi} format={fmtPi} disabled={revealed} />
                {custom.axis.every((x, i) => Math.abs(x - customAxis[i]) < 1e-9) ? (
                  <EstimateBar label={<Tex>{'\\hat n\\cdot\\vec r'}</Tex>} color={BASIS_COL.C} tally={custom.t} kets={['+n', '−n']} />
                ) : (
                  <div className="faint" style={{ fontSize: '0.8rem' }}>
                    Axis changed. The next custom shots start a fresh tally{custom.t.p + custom.t.m > 0 ? ` (previous axis: ${custom.t.p}+ / ${custom.t.m}−)` : ''}.
                  </div>
                )}
                <div className="faint" style={{ fontSize: '0.78rem' }}>
                  If your guess is right, every shot along it comes out <b>+</b>. A single − proves you’re off.
                </div>
              </div>
            )}
          </div>

          {/* shot log */}
          <div style={{ marginTop: 12, minHeight: 56 }}>
            <div className="row" style={{ gap: 10, alignItems: 'center' }}>
              {lastShot ? (
                <span
                  key={flashKey}
                  className="pop"
                  style={{
                    display: 'inline-grid',
                    placeItems: 'center',
                    minWidth: 54,
                    height: 40,
                    borderRadius: 10,
                    fontWeight: 800,
                    fontSize: '1.05rem',
                    background: lastShot.r > 0 ? 'rgba(131,193,103,.18)' : 'rgba(252,98,85,.18)',
                    border: `1px solid ${lastShot.r > 0 ? 'var(--green)' : 'var(--red)'}`,
                  }}
                >
                  {lastShot.b === 'C' ? (lastShot.r > 0 ? '+n' : '−n') : KETS[lastShot.b][lastShot.r > 0 ? 0 : 1]}
                </span>
              ) : (
                <span className="faint" style={{ fontSize: '0.85rem' }}>No shots yet. Each click consumes fresh copies of the mystery state.</span>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, flex: 1 }}>
                {log.slice(-60).map((s, i) => (
                  <span
                    key={i}
                    title={`${s.b} ${s.r > 0 ? '+' : '−'}`}
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: s.r > 0 ? BASIS_COL[s.b] : 'transparent',
                      border: `1.5px solid ${BASIS_COL[s.b]}`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          {!revealed ? (
            <button className="btn gold" style={{ marginTop: 14, width: '100%' }} disabled={busy} onClick={submit}>
              📨 Submit guess {left > 0 ? `(saving ${left} shot${left === 1 ? '' : 's'})` : ''}
            </button>
          ) : (
            last && (
              <div className="pop" style={{ marginTop: 12 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <b>Case report</b>
                  <span className="mono" style={{ color: 'var(--yellow)' }}>
                    +{last.points} pts{last.F >= 0.95 && last.budget - last.used > 0 ? ` (incl. ${2 * (last.budget - last.used)} thrift bonus)` : ''}
                  </span>
                </div>
                <div className="dim" style={{ fontSize: '0.9rem', display: 'grid', gap: 4, marginTop: 6 }}>
                  {explanation.map((t, i) => (
                    <div key={i}>
                      • <RichText text={t} />
                    </div>
                  ))}
                  {last.F < 0.85 && <div>Tip: measure all three axes. Each one pins down one coordinate of the Bloch vector, and a pure state lies on the surface, so <RichText text="$x^2+y^2+z^2=1$" /> fixes whatever is left.</div>}
                </div>
                {stage === 'revealed' && (
                  <button className="btn primary" style={{ marginTop: 10, width: '100%' }} onClick={next}>
                    {caseIdx + 1 >= CASES.length ? 'Close the file →' : 'Next case →'}
                  </button>
                )}
              </div>
            )
          )}
        </div>
      </div>

      {stage === 'over' && (
        <GameOverlay title={avgF >= 0.9 ? '🕵️ Case closed!' : '📁 Case file incomplete'} tone={avgF >= 0.9 ? 'win' : 'lose'}>
          <div style={{ fontSize: '1.1rem', margin: '6px 0' }}>
            Average fidelity <b style={{ color: fCol(avgF) }}>{(avgF * 100).toFixed(1)}%</b> · <b style={{ color: 'var(--yellow)' }}>{totalPts}</b> points
          </div>
          <div style={{ margin: '8px 0' }}>
            {avgF >= 0.9
              ? 'You reconstructed unknown quantum states from nothing but single-bit measurements on identical copies. That’s state tomography.'
              : 'You need an average fidelity of 90%. Spread your shots across x, y and z, and remember that a pure state sits on the sphere’s surface.'}
          </div>
          <div className="faint" style={{ fontSize: '0.85rem' }}>
            Statistical error shrinks only like 1/√n: four times the shots for half the error. Real tomography of many qubits needs exponentially many settings, which is why labs use smarter tricks.
          </div>
          <div className="row center" style={{ gap: 8, marginTop: 14, justifyContent: 'center' }}>
            <button className="btn primary" onClick={startRun}>
              🔁 New set of cases
            </button>
          </div>
        </GameOverlay>
      )}
    </div>
  );
}
