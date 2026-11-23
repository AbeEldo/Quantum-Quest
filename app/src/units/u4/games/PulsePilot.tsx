import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BlochSphere, type Vec3 } from '../../../widgets/BlochSphere';
import { Slider, Segmented, Stat, RichText, Tex, fmtPi, ProgressBar } from '../../../components/ui';
import { useGame, GameOverlay, HowToPlay } from '../../../components/game';
import { phaseColor } from '../../../engine/complex';
import { applyPulse, blochFidelity, pulseAxis, rot, ease, type Pulse, type V3 } from '../widgets/spin';
import { LEVELS, type PulseLevel } from './levels';

const GAME_ID = 'pulse-pilot';
const PHASES = [
  { value: 0, label: '+x' },
  { value: Math.PI / 2, label: '+y' },
  { value: Math.PI, label: '−x' },
  { value: (3 * Math.PI) / 2, label: '−y' },
];

interface Anim {
  from: V3[];
  pulses: Pulse[]; // actual (per probe) pulses
  t0: number;
  dur: number;
}

/** Actual pulse felt by probe i (adds fixed detuning, hidden drift and per-probe offsets). */
function actualPulse(L: PulseLevel, p: Pulse, i: number, drift: number): Pulse {
  return { ...p, detuning: p.detuning + (L.fixedDetuning ?? 0) + drift + (L.probes[i].detune ?? 0) };
}

function starsFor(L: PulseLevel, fired: number) {
  if (fired <= L.par) return 3;
  if (fired <= L.par + (L.par >= 3 ? 2 : 1)) return 2;
  return 1;
}

function ring(center: V3, color: string, r = 0.09, n = 14): { v: Vec3; color: string }[] {
  // small circle of points around a direction on the sphere
  const c = center;
  const a: V3 = Math.abs(c[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u: V3 = [c[1] * a[2] - c[2] * a[1], c[2] * a[0] - c[0] * a[2], c[0] * a[1] - c[1] * a[0]];
  const ul = Math.hypot(...u);
  const uu: V3 = [u[0] / ul, u[1] / ul, u[2] / ul];
  const w: V3 = [c[1] * uu[2] - c[2] * uu[1], c[2] * uu[0] - c[0] * uu[2], c[0] * uu[1] - c[1] * uu[0]];
  return Array.from({ length: n }, (_, k) => {
    const t = (k / n) * 2 * Math.PI;
    const p: V3 = [0, 1, 2].map((j) => c[j] + r * (Math.cos(t) * uu[j] + Math.sin(t) * w[j])) as V3;
    const l = Math.hypot(...p);
    return { v: [p[0] / l, p[1] / l, p[2] / l] as Vec3, color };
  });
}

const fmtDeg = (rad: number) => `${((rad * 180) / Math.PI).toFixed(0)}°`;

export default function PulsePilot() {
  const g = useGame(GAME_ID);
  const saved = (g.data.stars as Record<string, number> | undefined) ?? {};
  const [stars, setStars] = useState<Record<string, number>>(saved);
  const [levelIdx, setLevelIdx] = useState<number | null>(null);

  if (levelIdx === null)
    return (
      <div>
        <HowToPlay>
          <p style={{ marginTop: 0 }}>
            You are the control engineer for a single qubit. Each <b>pulse</b> is a burst of resonant microwaves described by the rotating-frame Hamiltonian
          </p>
          <Tex display>{'H = \\tfrac{\\Delta}{2}\\sigma_z + \\tfrac{\\Omega}{2}\\left(\\cos\\varphi\\,\\sigma_x + \\sin\\varphi\\,\\sigma_y\\right)'}</Tex>
          <p>
            Pick the strength <Tex>{'\\Omega'}</Tex>, phase <Tex>{'\\varphi'}</Tex>, detuning <Tex>{'\\Delta'}</Tex> and duration <Tex>{'t'}</Tex>. The <b style={{ color: 'var(--orange)' }}>orange dotted arc</b> previews the pulse. Press <b>Fire</b> to apply it. Reach the green target(s) using as few pulses as possible: hit par for ★★★.
          </p>
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
                onClick={() => setLevelIdx(i)}
                style={{ textAlign: 'left', cursor: unlocked ? 'pointer' : 'not-allowed', opacity: unlocked ? 1 : 0.45, borderColor: s ? 'var(--green)' : 'var(--border)', color: 'var(--text)' }}
              >
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <b>
                    {i + 1}. {L.name}
                  </b>
                  <span style={{ color: 'var(--yellow)', letterSpacing: 2 }}>{unlocked ? '★'.repeat(s) + '☆'.repeat(3 - s) : '🔒'}</span>
                </div>
                <div className="faint" style={{ fontSize: '0.8rem', marginTop: 6 }}>
                  par {L.par} pulse{L.par > 1 ? 's' : ''} · {L.probes.length > 1 ? `${L.probes.length} spins` : L.waypoints ? `${L.waypoints.length} checkpoints` : '1 target'}
                </div>
              </button>
            );
          })}
        </div>
        <div className="faint" style={{ marginTop: 12, fontSize: '0.85rem' }}>
          Total stars: {Object.values(stars).reduce((a, b) => a + b, 0)} / {LEVELS.length * 3}
        </div>
      </div>
    );

  return (
    <LevelPlay
      key={levelIdx}
      level={LEVELS[levelIdx]}
      index={levelIdx}
      best={stars[LEVELS[levelIdx].id] ?? 0}
      onExit={() => setLevelIdx(null)}
      onNext={levelIdx < LEVELS.length - 1 ? () => setLevelIdx(levelIdx + 1) : undefined}
      onSolved={(s, fired) => {
        const L = LEVELS[levelIdx];
        const next = { ...stars, [L.id]: Math.max(stars[L.id] ?? 0, s) };
        setStars(next);
        const total = Object.values(next).reduce((a, b) => a + b, 0);
        const solvedCount = LEVELS.filter((l) => (next[l.id] ?? 0) > 0).length;
        g.finish(total, solvedCount >= 6, { stars: next });
        if (L.id === 'echo') g.unlock('hahn-echo');
        if (L.id === 'drift') g.unlock('ramsey-detective');
        if (L.id === 'hadamard' && fired === 1) g.unlock('one-pulse-hadamard');
        if (LEVELS.every((l) => (next[l.id] ?? 0) === 3)) g.unlock('pulse-perfect');
      }}
    />
  );
}

function LevelPlay({
  level: L,
  index,
  best,
  onExit,
  onNext,
  onSolved,
}: {
  level: PulseLevel;
  index: number;
  best: number;
  onExit: () => void;
  onNext?: () => void;
  onSolved: (stars: number, fired: number) => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const drift = useMemo(() => {
    if (!L.hiddenDrift) return 0;
    const mag = 0.25 + Math.random() * 0.3;
    return Math.random() < 0.5 ? -mag : mag;
  }, [L, attempt]);
  const [seq, setSeq] = useState<Pulse[]>([]);
  const [fired, setFired] = useState(0);
  const [om, setOm] = useState(L.maxOmega >= 1 ? 1 : L.maxOmega);
  const [ph, setPh] = useState(0);
  const [det, setDet] = useState(0);
  const [dur, setDur] = useState(Math.PI / 2);
  const [anim, setAnim] = useState<Anim | null>(null);
  const [frac, setFrac] = useState(1);
  const [result, setResult] = useState<null | { stars: number } | 'fail'>(null);
  const [showHint, setShowHint] = useState(false);
  const reported = useRef(false);

  // current (settled) states of all probes
  const states = useMemo(() => L.probes.map((p, i) => seq.reduce((v, s) => applyPulse(v, actualPulse(L, s, i, drift)), p.start)), [L, seq, drift]);
  // waypoint progress (replay)
  const wpReached = useMemo(() => {
    if (!L.waypoints) return 0;
    let k = 0;
    let v = L.probes[0].start;
    for (const s of seq) {
      v = applyPulse(v, actualPulse(L, s, 0, drift));
      if (k < L.waypoints.length && blochFidelity(v, L.waypoints[k]) >= L.threshold) k++;
    }
    return k;
  }, [L, seq, drift]);
  const totalTime = seq.reduce((a, s) => a + s.duration, 0);
  const energy = seq.reduce((a, s) => a + s.omega * s.omega * s.duration, 0);
  const avgFid = L.waypoints
    ? wpReached >= L.waypoints.length
      ? 1
      : blochFidelity(states[0], L.waypoints[wpReached])
    : states.reduce((a, v, i) => a + blochFidelity(v, L.probes[i].target), 0) / states.length;
  const timeOk = !L.minTime || totalTime >= L.minTime - 1e-9;
  const solved = L.waypoints ? wpReached >= L.waypoints.length : avgFid >= L.threshold && timeOk;

  // animation loop
  useEffect(() => {
    if (!anim) return;
    let raf = 0;
    const loop = () => {
      const f = Math.min(1, (performance.now() - anim.t0) / anim.dur);
      setFrac(f);
      if (f < 1) raf = requestAnimationFrame(loop);
      else setAnim(null);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [anim]);

  // evaluate after the animation settles
  useEffect(() => {
    if (anim || result) return;
    if (seq.length === 0) return;
    if (solved && !reported.current) {
      reported.current = true;
      const s = starsFor(L, fired);
      setResult({ stars: s });
      onSolved(s, fired);
    } else if (!solved && fired >= L.maxPulses) {
      setResult('fail');
    }
  }, [anim, seq, solved]); // eslint-disable-line react-hooks/exhaustive-deps

  const display: V3[] = anim
    ? anim.from.map((v0, i) => {
        const p = anim.pulses[i];
        const { axis, rate } = pulseAxis(p.omega, p.phase, p.detuning);
        return rot(v0, axis, rate * p.duration * ease(frac));
      })
    : states;

  const effDet = L.detuning ? det : 0;
  const pending: Pulse = { omega: om, phase: L.phases === 'x' ? 0 : ph, detuning: effDet, duration: dur };
  // preview uses the *nominal* model (no hidden drift)
  const nominal = (s: Pulse, i: number) => actualPulse(L, s, i, 0);
  const pend0 = nominal(pending, 0);
  const pAx = pulseAxis(pend0.omega, pend0.phase, pend0.detuning);
  const previewPts = useMemo(() => {
    if (anim) return [];
    const pts: { v: Vec3; color: string }[] = [];
    const n = 28;
    for (let k = 1; k <= n; k++) pts.push({ v: rot(states[0], pAx.axis, (pAx.rate * dur * k) / n) as Vec3, color: k === n ? '#ffffff' : '#ff8c42' });
    return pts;
  }, [anim, states, pAx.axis[0], pAx.axis[1], pAx.axis[2], pAx.rate, dur]); // eslint-disable-line react-hooks/exhaustive-deps

  const fire = () => {
    if (anim || fired >= L.maxPulses || result) return;
    const pulses = L.probes.map((_, i) => actualPulse(L, pending, i, drift));
    const maxAngle = Math.max(...pulses.map((p) => pulseAxis(p.omega, p.phase, p.detuning).rate * p.duration));
    const ms = Math.min(2600, Math.max(450, (maxAngle / 2.6) * 1000));
    setAnim({ from: states, pulses, t0: performance.now(), dur: ms });
    setFrac(0);
    setSeq((s) => [...s, pending]);
    setFired((f) => f + 1);
  };
  const undo = () => {
    if (anim || !seq.length) return;
    setSeq((s) => s.slice(0, -1));
  };
  const restart = () => {
    setSeq([]);
    setFired(0);
    setResult(null);
    setAnim(null);
    reported.current = false;
    setAttempt((a) => a + 1);
  };
  const setAngle = (angle: number) => {
    if (pAx.rate < 1e-9) return;
    setDur(Math.min(12, angle / pAx.rate));
  };

  // sphere decorations
  const probeColor = (i: number) => (L.probes.length > 2 ? phaseColor(((L.probes[i].detune ?? 0) / 0.6) * 1.2 + 3.6) : i === 0 ? '#fcd34d' : '#e07ab6');
  const extras = display.slice(1).map((v, k) => ({ v: v as Vec3, color: probeColor(k + 1) }));
  let target: Vec3 | null = null;
  const pts: { v: Vec3; color?: string }[] = [...previewPts];
  if (L.waypoints) {
    if (wpReached < L.waypoints.length) target = L.waypoints[wpReached] as Vec3;
    L.waypoints.forEach((w, k) => {
      if (k > wpReached) pts.push(...ring(w, '#4f7a3f'));
    });
  } else {
    target = L.probes[0].target as Vec3;
    L.probes.slice(1).forEach((p) => {
      const t = p.target;
      if (Math.hypot(t[0] - L.probes[0].target[0], t[1] - L.probes[0].target[1], t[2] - L.probes[0].target[2]) > 1e-6) pts.push(...ring(t, '#e07ab6'));
    });
  }

  const th0 = Math.acos(Math.max(-1, Math.min(1, display[0][2])));
  let ph0 = Math.atan2(display[0][1], display[0][0]);
  if (ph0 < 0) ph0 += 2 * Math.PI;

  return (
    <div style={{ position: 'relative' }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn small ghost" onClick={onExit}>
            ← levels
          </button>
          <h3 style={{ margin: 0 }}>
            Level {index + 1}: {L.name}
          </h3>
          {best > 0 && <span style={{ color: 'var(--yellow)' }}>{'★'.repeat(best)}</span>}
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn small" onClick={() => setShowHint((h) => !h)}>
            💡 hint
          </button>
          <button className="btn small ghost" onClick={restart}>
            ↺ restart
          </button>
        </div>
      </div>
      <div className="panel" style={{ padding: 10, marginBottom: 10 }}>
        <RichText text={L.brief} />
        {showHint && (
          <div className="pop" style={{ marginTop: 8, color: 'var(--yellow)', fontSize: '0.9rem' }}>
            💡 <RichText text={L.hint} />
          </div>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
        <div>
          <div style={{ borderRadius: 12, transition: 'box-shadow .4s', boxShadow: anim ? '0 0 22px rgba(255,140,66,0.35)' : 'none' }}>
            <BlochSphere vector={display[0] as Vec3} vectors={extras} trail={L.probes.length === 1} trailKey={`${attempt}-${seq.length === 0}`} target={target} points={pts} axis={anim ? null : (pAx.axis as Vec3)} height={380} />
          </div>
          <div className="row" style={{ gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Stat label={L.waypoints ? `fidelity to checkpoint ${Math.min(wpReached + 1, L.waypoints.length)}` : 'avg. fidelity'} value={`${(avgFid * 100).toFixed(1)}%`} color={avgFid >= L.threshold ? 'var(--green)' : 'var(--text)'} />
            <Stat label="pulses fired" value={`${fired} / ${L.maxPulses}`} color={fired > L.par ? 'var(--orange)' : undefined} />
            <Stat label={L.minTime ? `time (need ≥ ${L.minTime})` : 'elapsed time'} value={totalTime.toFixed(2)} color={L.minTime ? (timeOk ? 'var(--green)' : 'var(--orange)') : undefined} />
            <Stat label="energy ∑Ω²t" value={energy.toFixed(2)} />
          </div>
          <div className="faint mono center" style={{ fontSize: '0.78rem', marginTop: 4 }}>
            spin 1: θ = {fmtDeg(th0)}, φ = {fmtDeg(ph0)} · target fidelity ≥ {(L.threshold * 100).toFixed(0)}%
          </div>
        </div>
        <div className="col" style={{ gap: 8 }}>
          <div className="panel" style={{ padding: 12 }}>
            <div className="faint" style={{ fontSize: '0.78rem', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Pulse designer
            </div>
            <Slider label={<span>strength <Tex>{'\\Omega'}</Tex></span>} value={om} min={0} max={L.maxOmega} step={0.05} onChange={setOm} format={(v) => (v === 0 ? 'wait' : v.toFixed(2))} />
            {L.phases === 'x' ? (
              <div className="faint" style={{ fontSize: '0.85rem', margin: '4px 0' }}>
                phase <Tex>{'\\varphi'}</Tex>: locked to +x
              </div>
            ) : L.phases === 'xy' ? (
              <div className="row" style={{ gap: 8, margin: '4px 0' }}>
                <span className="dim" style={{ fontSize: '0.88rem', width: 90 }}>
                  phase <Tex>{'\\varphi'}</Tex>
                </span>
                <Segmented options={PHASES} value={ph} onChange={setPh} />
              </div>
            ) : (
              <Slider label={<span>phase <Tex>{'\\varphi'}</Tex></span>} value={ph} min={0} max={2 * Math.PI} step={Math.PI / 24} onChange={setPh} format={fmtPi} />
            )}
            {L.detuning ? (
              <Slider label={<span>detuning <Tex>{'\\Delta'}</Tex></span>} value={det} min={-2} max={2} step={0.05} onChange={setDet} format={(v) => v.toFixed(2)} />
            ) : (
              <div className="faint" style={{ fontSize: '0.85rem', margin: '4px 0' }}>
                detuning <Tex>{'\\Delta'}</Tex> = {(L.fixedDetuning ?? 0).toFixed(2)} {L.fixedDetuning ? '(fixed, sorry)' : '(on resonance)'}
              </div>
            )}
            <Slider label={<span>duration <Tex>{'t'}</Tex></span>} value={dur} min={0} max={12} step={0.01} onChange={setDur} format={(v) => v.toFixed(2)} />
            <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              <span className="faint" style={{ fontSize: '0.8rem' }}>rotation {fmtDeg(pAx.rate * dur)} · set to</span>
              {[
                ['π/2', Math.PI / 2],
                ['π', Math.PI],
                ['3π/2', (3 * Math.PI) / 2],
              ].map(([lab, a]) => (
                <button key={lab as string} className="btn small ghost" onClick={() => setAngle(a as number)} disabled={pAx.rate < 1e-9}>
                  {lab}
                </button>
              ))}
            </div>
            <div className="row" style={{ gap: 8, marginTop: 10 }}>
              <button className="btn primary" onClick={fire} disabled={!!anim || fired >= L.maxPulses || !!result || dur <= 0}>
                ⚡ Fire pulse
              </button>
              <button className="btn small" onClick={undo} disabled={!!anim || !seq.length || !!result}>
                ↶ undo
              </button>
            </div>
          </div>
          <div className="panel" style={{ padding: 10 }}>
            <div className="faint" style={{ fontSize: '0.78rem', marginBottom: 6 }}>SEQUENCE</div>
            {seq.length === 0 ? (
              <span className="faint" style={{ fontSize: '0.85rem' }}>No pulses yet.</span>
            ) : (
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {seq.map((s, i) => (
                  <span key={i} className="pill" style={{ fontSize: '0.75rem', borderColor: s.omega === 0 ? 'var(--teal)' : 'var(--orange)' }}>
                    {s.omega === 0 ? `wait ${s.duration.toFixed(2)}` : `Ω${s.omega.toFixed(2)} ${PHASES.find((p) => Math.abs(p.value - s.phase) < 1e-6)?.label ?? fmtPi(s.phase)}${s.detuning ? ` Δ${s.detuning.toFixed(2)}` : ''} t${s.duration.toFixed(2)}`}
                  </span>
                ))}
              </div>
            )}
            <ProgressBar value={fired / L.maxPulses} color={fired > L.par ? 'var(--orange)' : 'var(--blue)'} height={6} style={{ marginTop: 8 }} />
          </div>
          {L.hiddenDrift && (
            <div className="faint" style={{ fontSize: '0.8rem' }}>
              ⚠ Hidden drift active: the real evolution includes an unknown extra detuning (|drift| between 0.25 and 0.55).
            </div>
          )}
        </div>
      </div>
      {result && result !== 'fail' && (
        <GameOverlay title={`Level cleared! ${'★'.repeat(result.stars)}${'☆'.repeat(3 - result.stars)}`} tone="win">
          <div style={{ textAlign: 'left', fontSize: '0.92rem' }}>
            <p>
              {fired} pulse{fired > 1 ? 's' : ''} (par {L.par}){L.hiddenDrift ? ` · the drift was ${drift.toFixed(2)}` : ''}.
            </p>
            <RichText text={L.physics} />
          </div>
          <div className="row" style={{ gap: 8, justifyContent: 'center', marginTop: 14 }}>
            <button className="btn" onClick={restart}>
              Replay for ★★★
            </button>
            {onNext ? (
              <button className="btn primary" onClick={onNext}>
                Next level →
              </button>
            ) : (
              <button className="btn primary" onClick={onExit}>
                All levels
              </button>
            )}
          </div>
        </GameOverlay>
      )}
      {result === 'fail' && (
        <GameOverlay title="Out of pulses" tone="lose">
          <p>
            The amplifier needs to cool down. Fidelity this run: {(avgFid * 100).toFixed(1)}%{L.minTime && !timeOk ? ' (and not enough storage time)' : ''}.
          </p>
          <p style={{ color: 'var(--yellow)', fontSize: '0.9rem' }}>
            💡 <RichText text={L.hint} />
          </p>
          <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
            <button
              className="btn primary"
              onClick={() => {
                restart();
              }}
            >
              Try again
            </button>
          </div>
        </GameOverlay>
      )}
    </div>
  );
}
