import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Slider, Stat, RichText } from '../../../components/ui';
import { useGame, GameOverlay, HowToPlay } from '../../../components/game';
import { Wave1D } from '../../../engine/wave1d';
import { transmission, barrierStack, rasterLayers, type Layer } from '../physics';
import { PHASE_LUT, phaseIndex } from '../widgets/colors';
import { useLiveCanvas } from '../widgets/useLiveCanvas';

const GAME_ID = 'tunnel-vision';

interface Param {
  key: 'V0' | 'a' | 'gap';
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
}
interface Goal {
  E: number;
  /** target transmission; mode 'abs' = |T−T*| ≤ tol, 'log' = |log10 T − log10 T*| ≤ tol, 'min' = T ≥ T*, 'max' = T ≤ T* */
  T: number;
  tol: number;
  mode: 'abs' | 'log' | 'min' | 'max';
}
interface Level {
  id: string;
  name: string;
  brief: string;
  kind: 'single' | 'double';
  params: Param[];
  fixed: { V0?: number; a?: number; gap?: number };
  goals: Goal[];
  maxShots: number;
  hint: string;
  physics: string;
}

const LEVELS: Level[] = [
  {
    id: 'half',
    name: 'Half & Half',
    brief: 'Electrons with $E = 1$ hit a barrier of height $V_0 = 2$. Choose the **width** so that exactly **half** of them tunnel ($T = 0.50 \\pm 0.03$).',
    kind: 'single',
    params: [{ key: 'a', label: 'width a', min: 0.1, max: 3, step: 0.01, value: 1.5 }],
    fixed: { V0: 2 },
    goals: [{ E: 1, T: 0.5, tol: 0.03, mode: 'abs' }],
    maxShots: 6,
    hint: 'Here $V_0^2/(4E(V_0-E)) = 1$, so $T = 1/(1 + \\sinh^2(\\kappa a))$ with $\\kappa = \\sqrt2$. $T = 1/2$ needs $\\sinh(\\kappa a) = 1$.',
    physics: '$\\sinh(\\sqrt2\\,a) = 1$ gives $a = \\operatorname{arcsinh}(1)/\\sqrt2 \\approx 0.62$. A barrier only about half a decay length thick already reflects half the electrons.',
  },
  {
    id: 'whisper',
    name: 'Whisper',
    brief: 'Design a barrier that lets through only **one electron in ten thousand** at $E = 1$: $T = 10^{-4}$ (within a factor of $10^{\\pm0.15}$).',
    kind: 'single',
    params: [
      { key: 'V0', label: 'height V₀', min: 1.2, max: 6, step: 0.05, value: 3 },
      { key: 'a', label: 'width a', min: 0.2, max: 4, step: 0.01, value: 1 },
    ],
    fixed: {},
    goals: [{ E: 1, T: 1e-4, tol: 0.15, mode: 'log' }],
    maxShots: 6,
    hint: 'Thick-barrier rule: $T \\approx 16\\frac{E}{V_0}(1-\\frac{E}{V_0})e^{-2\\kappa a}$. Each extra $1/\\kappa$ of width costs a factor $e^{2} \\approx 7.4$.',
    physics: 'Exponential sensitivity is what makes tunnelling so useful (STM, flash memory) and so dramatic (alpha-decay half-lives spanning more than 20 orders of magnitude).',
  },
  {
    id: 'glass',
    name: 'Glass Wall',
    brief: 'Now $E = 2$ is **above** the barrier top ($V_0 = 1$), but some electrons still reflect. Choose the width to make the barrier **perfectly transparent**: $T \\ge 0.995$.',
    kind: 'single',
    params: [{ key: 'a', label: 'width a', min: 0.2, max: 6, step: 0.01, value: 1 }],
    fixed: { V0: 1 },
    goals: [{ E: 2, T: 0.995, tol: 0, mode: 'min' }],
    maxShots: 6,
    hint: 'Inside the barrier the wavenumber is $k\' = \\sqrt{2(E - V_0)} = \\sqrt2$. Reflections from the two edges cancel when $k\'a = n\\pi$.',
    physics: 'At $a = n\\pi/k\' \\approx 2.22, 4.44$ the two edge reflections cancel exactly: the **Ramsauer–Townsend** transparency. Anti-reflection coatings on camera lenses use the same interference idea.',
  },
  {
    id: 'resonant',
    name: 'Resonant Tunnelling',
    brief: 'Each barrier ($V_0 = 3$, $a = 0.5$) alone transmits only 39% at $E = 1$. Put **two** of them in a row and tune the **gap** to make the pair transmit at least 98%.',
    kind: 'double',
    params: [{ key: 'gap', label: 'gap', min: 0.5, max: 6, step: 0.005, value: 2.5 }],
    fixed: { V0: 3, a: 0.5 },
    goals: [{ E: 1, T: 0.98, tol: 0, mode: 'min' }],
    maxShots: 8,
    hint: 'The gap is a little box. Resonances repeat every half-wavelength of the free wave: the gap period is $\\pi/k = \\pi/\\sqrt2 \\approx 2.22$. Look for the first one between 1 and 1.5.',
    physics: 'At gaps ≈ 1.29, 3.51, 5.73 the waves bouncing between the barriers add up in the forward direction and cancel backwards. **Resonant-tunnelling diodes** (Chang, Esaki & Tsu, 1974) exploit exactly this and are among the fastest electronic devices ever built.',
  },
  {
    id: 'filter',
    name: 'Energy Filter',
    brief: 'Build an **energy filter**: electrons at $E = 1$ must pass ($T > 0.9$) while electrons at $E = 1.6$ are blocked ($T < 0.1$). You control both barriers\' height and width, and the gap.',
    kind: 'double',
    params: [
      { key: 'V0', label: 'height V₀', min: 2, max: 5, step: 0.05, value: 3 },
      { key: 'a', label: 'width a', min: 0.3, max: 1.2, step: 0.01, value: 0.5 },
      { key: 'gap', label: 'gap', min: 0.5, max: 6, step: 0.005, value: 2 },
    ],
    fixed: {},
    goals: [
      { E: 1, T: 0.9, tol: 0, mode: 'min' },
      { E: 1.6, T: 0.1, tol: 0, mode: 'max' },
    ],
    maxShots: 10,
    hint: 'Thick, tall barriers make resonances *narrow*. Put a resonance exactly at $E = 1$ (tune the gap) and make the barriers strong enough that $E = 1.6$ falls between resonances.',
    physics: 'A sharp resonance is an energy filter: only electrons matching the quasi-bound level get through. This is the principle of the resonant-tunnelling transistor and of quantum-cascade lasers.',
  },
  {
    id: 'dose',
    name: 'Exact Dose',
    brief: 'Two barriers of width $a = 0.5$. Tune the height and the gap so that exactly **a quarter** of the $E = 1$ electrons get through: $T = 0.25 \\pm 0.02$.',
    kind: 'double',
    params: [
      { key: 'V0', label: 'height V₀', min: 1.5, max: 5, step: 0.05, value: 3 },
      { key: 'gap', label: 'gap', min: 0.5, max: 6, step: 0.005, value: 3 },
    ],
    fixed: { a: 0.5 },
    goals: [{ E: 1, T: 0.25, tol: 0.02, mode: 'abs' }],
    maxShots: 8,
    hint: 'Away from a resonance a double barrier transmits much less than either barrier alone. Sweep between "on resonance" (T ≈ 1) and "off resonance" (T small) to land on 0.25.',
    physics: 'Many settings work. Transmission oscillates with the gap between nearly 1 (on resonance) and a minimum set by the barrier strength. Engineering a device means picking the most *robust* point on that curve.',
  },
];

function layersFor(L: Level, p: Record<string, number>): Layer[] {
  const V0 = p.V0 ?? L.fixed.V0 ?? 2;
  const a = p.a ?? L.fixed.a ?? 1;
  const gap = p.gap ?? L.fixed.gap ?? 2;
  return L.kind === 'single' ? [{ width: a, V: V0 }] : barrierStack(V0, a, [gap]);
}
function goalMet(g: Goal, T: number) {
  if (g.mode === 'abs') return Math.abs(T - g.T) <= g.tol;
  if (g.mode === 'log') return T > 0 && Math.abs(Math.log10(T) - Math.log10(g.T)) <= g.tol;
  if (g.mode === 'min') return T >= g.T;
  return T <= g.T;
}
const fmtT = (T: number) => (T < 1e-3 ? T.toExponential(2) : T.toFixed(3));

export default function TunnelVision() {
  const g = useGame(GAME_ID);
  const [stars, setStars] = useState<Record<string, number>>((g.data.stars as Record<string, number>) ?? {});
  const [idx, setIdx] = useState<number | null>(null);
  if (idx === null)
    return (
      <div>
        <HowToPlay>
          You run an electron beam line. Each level gives you a barrier structure and a target <b>transmission probability</b>. Adjust the barrier
          with the sliders, then press <b>Fire beam</b> to measure <i>T</i>. Beam time is limited. Hit the target in ≤ 2 shots for ★★★, ≤ 4 for ★★. Every
          shot is logged, so use your data, and the formulas from the tunnelling lesson, to home in.
        </HowToPlay>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
          {LEVELS.map((L, i) => {
            const unlocked = i === 0 || (stars[LEVELS[i - 1].id] ?? 0) > 0;
            const s = stars[L.id] ?? 0;
            return (
              <button
                key={L.id}
                className="panel"
                disabled={!unlocked}
                onClick={() => setIdx(i)}
                style={{ textAlign: 'left', cursor: unlocked ? 'pointer' : 'not-allowed', opacity: unlocked ? 1 : 0.45, borderColor: s ? 'var(--green)' : 'var(--border)', color: 'var(--text)' }}
              >
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <b>
                    {i + 1}. {L.name}
                  </b>
                  <span style={{ color: 'var(--yellow)' }}>{unlocked ? '★'.repeat(s) + '☆'.repeat(3 - s) : '🔒'}</span>
                </div>
                <div className="faint" style={{ fontSize: '0.8rem', marginTop: 6 }}>
                  {L.kind === 'single' ? 'single barrier' : 'double barrier'} · {L.maxShots} shots
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  const L = LEVELS[idx];
  return (
    <LevelPlay
      key={idx}
      level={L}
      index={idx}
      onExit={() => setIdx(null)}
      onNext={idx < LEVELS.length - 1 ? () => setIdx(idx + 1) : undefined}
      onSolved={(s, shots) => {
        const next = { ...stars, [L.id]: Math.max(stars[L.id] ?? 0, s) };
        setStars(next);
        const total = Object.values(next).reduce((a, b) => a + b, 0);
        const solved = LEVELS.filter((l) => (next[l.id] ?? 0) > 0).length;
        g.finish(total, solved >= 4, { stars: next });
        if (L.id === 'resonant') g.unlock('resonant-tunneller');
        if (shots === 1) g.unlock('first-shot-tunnel');
        if (LEVELS.every((l) => (next[l.id] ?? 0) === 3)) g.unlock('tunnel-vision-master');
      }}
    />
  );
}

function LevelPlay({ level: L, index, onExit, onNext, onSolved }: { level: Level; index: number; onExit: () => void; onNext?: () => void; onSolved: (stars: number, shots: number) => void }) {
  const [p, setP] = useState<Record<string, number>>(() => Object.fromEntries(L.params.map((q) => [q.key, q.value])));
  const [log, setLog] = useState<{ p: Record<string, number>; T: number[]; ok: boolean }[]>([]);
  const [result, setResult] = useState<null | 'win' | 'lose'>(null);
  const [shotKey, setShotKey] = useState(0);
  const layers = useMemo(() => layersFor(L, p), [L, p]);
  const shots = log.length;
  const starsFor = (n: number) => (n <= 2 ? 3 : n <= 4 ? 2 : 1);

  const fire = () => {
    if (result) return;
    const Ts = L.goals.map((gl) => transmission(gl.E, layers));
    const ok = L.goals.every((gl, i) => goalMet(gl, Ts[i]));
    const entry = { p: { ...p }, T: Ts, ok };
    const n = shots + 1;
    setLog((l) => [...l, entry]);
    setShotKey((k) => k + 1);
    if (ok) {
      setTimeout(() => setResult('win'), 1600);
      onSolved(starsFor(n), n);
    } else if (n >= L.maxShots) setTimeout(() => setResult('lose'), 1600);
  };
  const retry = () => {
    setLog([]);
    setResult(null);
  };

  // ---------- beam animation (split-step packet, illustrative) ----------
  const sim = useRef<Wave1D | null>(null);
  const runningRef = useRef(false);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!shotKey) return;
    const s = new Wave1D({ N: 1024, xmin: -60, xmax: 60, dt: 0.02 });
    const span = layers.reduce((a, l) => a + l.width, 0);
    s.setPotential(rasterLayers(s.x, s.dx, layers, -span / 2));
    s.setGaussian(-28, 5, Math.sqrt(2 * L.goals[0].E));
    sim.current = s;
    runningRef.current = true;
    setRunning(true);
    const tStop = setTimeout(() => {
      runningRef.current = false;
      setRunning(false);
    }, 6000);
    return () => clearTimeout(tStop);
  }, [shotKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const ref = useLiveCanvas(
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const xmin = -60, xmax = 60;
      const X = (x: number) => ((x - xmin) / (xmax - xmin)) * w;
      const base = h - 18, top = 12;
      const span = layers.reduce((a, l) => a + l.width, 0);
      // barrier drawing
      const vmax = Math.max(...layers.map((l) => l.V), L.goals[0].E) * 1.25;
      let x0 = -span / 2;
      for (const l of layers) {
        if (l.V > 0) {
          const y = base - (l.V / vmax) * (base - top);
          ctx.fillStyle = 'rgba(154,163,181,0.35)';
          ctx.fillRect(X(x0), y, Math.max(2, X(x0 + l.width) - X(x0)), base - y);
          ctx.strokeStyle = '#cfd6e4';
          ctx.strokeRect(X(x0), y, Math.max(2, X(x0 + l.width) - X(x0)), base - y);
        }
        x0 += l.width;
      }
      L.goals.forEach((gl, i) => {
        const y = base - (gl.E / vmax) * (base - top);
        ctx.setLineDash([6, 5]);
        ctx.strokeStyle = i === 0 ? 'rgba(252,211,77,0.8)' : 'rgba(224,122,182,0.8)';
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = i === 0 ? '#fcd34d' : '#e07ab6';
        ctx.font = '11px Segoe UI';
        ctx.fillText(`E = ${gl.E}`, 6, y - 4);
      });
      const s = sim.current;
      if (s) {
        if (runningRef.current) s.step(14);
        const d = s.density();
        let m = 0;
        for (let i = 0; i < s.N; i++) m = Math.max(m, d[i]);
        const sc = Math.max(m, 0.05) * 1.1;
        for (let i = 0; i < s.N; i++) {
          if (d[i] < sc * 0.003) continue;
          const y = base - (d[i] / sc) * (base - top) * 0.8;
          ctx.fillStyle = PHASE_LUT[phaseIndex(Math.atan2(s.im[i], s.re[i]))];
          ctx.fillRect(X(s.x[i]), y, w / s.N + 0.7, base - y);
        }
      } else {
        ctx.fillStyle = '#6b7385';
        ctx.font = '12px Segoe UI';
        ctx.fillText('Adjust the barrier, then fire the beam →', w / 2 - 110, h / 2);
      }
      ctx.strokeStyle = '#2a3142';
      ctx.beginPath();
      ctx.moveTo(0, base);
      ctx.lineTo(w, base);
      ctx.stroke();
    },
    { height: 200, running },
    [layers, shotKey],
  );

  const last = log[log.length - 1];
  return (
    <div style={{ position: 'relative' }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn small ghost" onClick={onExit}>
            ← levels
          </button>
          <h3 style={{ margin: 0 }}>
            Level {index + 1}: {L.name}
          </h3>
        </div>
        <span className="faint">
          shots {shots} / {L.maxShots}
        </span>
      </div>
      <div className="panel" style={{ padding: 10, marginBottom: 10 }}>
        <RichText text={L.brief} />
      </div>
      <div className="canvas-wrap">
        <canvas ref={ref} />
      </div>
      <div className="faint" style={{ fontSize: '0.75rem', marginTop: 2 }}>
        The animation shows one wave packet from the beam (illustrative). The scored T is the exact transmission for electrons of exactly energy E.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16, marginTop: 10 }}>
        <div className="col" style={{ gap: 4 }}>
          {L.params.map((q) => (
            <Slider key={q.key} label={q.label} value={p[q.key]} min={q.min} max={q.max} step={q.step} onChange={(v) => setP((o) => ({ ...o, [q.key]: v }))} format={(v) => v.toFixed(q.step < 0.01 ? 3 : 2)} />
          ))}
          {Object.entries(L.fixed).map(([k, v]) => (
            <div key={k} className="faint" style={{ fontSize: '0.85rem' }}>
              {k === 'V0' ? 'height V₀' : k === 'a' ? 'width a' : 'gap'} = {v} (fixed)
            </div>
          ))}
          <div className="row" style={{ gap: 8, marginTop: 6 }}>
            <button className="btn primary" onClick={fire} disabled={!!result || shots >= L.maxShots}>
              ⚡ Fire beam
            </button>
            {last && (
              <span key={shots} className="pop" style={{ color: last.ok ? 'var(--green)' : 'var(--orange)', fontWeight: 600 }}>
                {last.ok ? '✓ on target!' : '✗ miss'}
              </span>
            )}
          </div>
          <details style={{ marginTop: 6 }}>
            <summary className="faint" style={{ cursor: 'pointer', fontSize: '0.85rem' }}>
              💡 hint
            </summary>
            <div style={{ fontSize: '0.88rem', marginTop: 4 }}>
              <RichText text={L.hint} />
            </div>
          </details>
        </div>
        <div className="panel" style={{ padding: 10 }}>
          <div className="faint" style={{ fontSize: '0.78rem', marginBottom: 6 }}>
            LAB NOTEBOOK · target:{' '}
            {L.goals
              .map((gl) => `T(E=${gl.E}) ${gl.mode === 'abs' ? `= ${gl.T} ± ${gl.tol}` : gl.mode === 'log' ? `≈ ${fmtT(gl.T)}` : gl.mode === 'min' ? `≥ ${gl.T}` : `≤ ${gl.T}`}`)
              .join(', ')}
          </div>
          {log.length === 0 && <span className="faint" style={{ fontSize: '0.85rem' }}>No shots yet.</span>}
          <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }} className="mono">
            <tbody>
              {log.map((e, i) => (
                <tr key={i} style={{ color: e.ok ? 'var(--green)' : 'var(--text-dim)' }}>
                  <td>#{i + 1}</td>
                  <td>
                    {Object.entries(e.p)
                      .map(([k, v]) => `${k}=${v.toFixed(3)}`)
                      .join(' ')}
                  </td>
                  <td style={{ textAlign: 'right' }}>{e.T.map((t) => `T=${fmtT(t)}`).join(' / ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {last && (
            <div className="row" style={{ gap: 12, marginTop: 8 }}>
              {last.T.map((t, i) => (
                <Stat key={i} label={`T at E = ${L.goals[i].E}`} value={fmtT(t)} color={goalMet(L.goals[i], t) ? 'var(--green)' : 'var(--orange)'} />
              ))}
            </div>
          )}
        </div>
      </div>
      {result === 'win' && (
        <GameOverlay title={`Target hit! ${'★'.repeat(starsFor(shots))}${'☆'.repeat(3 - starsFor(shots))}`} tone="win">
          <div style={{ textAlign: 'left', fontSize: '0.92rem' }}>
            <p>Solved in {shots} shot{shots > 1 ? 's' : ''}.</p>
            <RichText text={L.physics} />
          </div>
          <div className="row" style={{ gap: 8, justifyContent: 'center', marginTop: 14 }}>
            <button className="btn" onClick={retry}>
              Replay
            </button>
            <button className="btn primary" onClick={onNext ?? onExit}>
              {onNext ? 'Next level →' : 'All levels'}
            </button>
          </div>
        </GameOverlay>
      )}
      {result === 'lose' && (
        <GameOverlay title="Beam time over" tone="lose">
          <p style={{ color: 'var(--yellow)' }}>
            💡 <RichText text={L.hint} />
          </p>
          <button className="btn primary" onClick={retry}>
            Try again
          </button>
        </GameOverlay>
      )}
    </div>
  );
}

export { LEVELS as TUNNEL_LEVELS, layersFor, goalMet };
