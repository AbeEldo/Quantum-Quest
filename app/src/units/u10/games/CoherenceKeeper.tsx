import React, { useEffect, useRef, useState } from 'react';
import { useGame, GameOverlay, HowToPlay } from '../../../components/game';
import { Segmented, Stat } from '../../../components/ui';
import { useAnimCanvas, SANS, SERIF } from '../widgets/anim';
import { LEVELS, PROGRAMS, newSim as mkSim, applyPulse, step, fidelity, type Sim, type Vec3 } from './keeperSim';

const N = 48;
const REAL_SECONDS = 7; // a run lasts this long on screen
const GAME_ID = 'coherence-keeper';

export default function CoherenceKeeper() {
  const g = useGame(GAME_ID);
  const saved = (g.data.stars as number[] | undefined) ?? [0, 0, 0, 0, 0];
  const [stars, setStars] = useState<number[]>(saved);
  const [lvl, setLvl] = useState(0);
  const [mode, setMode] = useState<'live' | 'program'>('live');
  const [prog, setProg] = useState('hahn');
  const [phase, setPhase] = useState<'ready' | 'running' | 'result'>('ready');
  const [result, setResult] = useState<{ F: number; stars: number; pulses: number } | null>(null);
  const [tick, setTick] = useState(0);
  const L = LEVELS[lvl];
  const seed = useRef(1);
  const sim = useRef<Sim | null>(null);
  const params = useRef({ L, phase });
  params.current = { L, phase };

  const newSim = (): Sim =>
    mkSim(L, N, seed.current++, mode === 'program' ? (PROGRAMS.find((p) => p.id === prog)?.times() ?? []).map((f) => f * L.T) : []);
  if (!sim.current) sim.current = newSim();

  const start = () => {
    sim.current = newSim();
    setResult(null);
    setPhase('running');
  };

  const pulse = () => {
    const s = sim.current;
    if (!s || params.current.phase !== 'running' || s.done) return;
    if (s.pulses.length && s.t - s.pulses[s.pulses.length - 1] < 0.15) return;
    applyPulse(s, params.current.L);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && params.current.phase === 'running' && mode === 'live') {
        e.preventDefault();
        pulse();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  const finishRun = (s: Sim) => {
    const F = fidelity(s);
    const st = L.stars.filter((x) => F >= x).length;
    const nextStars = stars.map((x, i) => (i === lvl ? Math.max(x, st) : x));
    setStars(nextStars);
    setResult({ F, stars: st, pulses: s.pulses.length });
    setPhase('result');
    const total = nextStars.reduce((a, b) => a + b, 0);
    const beaten = nextStars.every((x) => x >= 1);
    g.finish(total, beaten, { stars: nextStars });
    if (lvl === 0 && F >= 0.98) g.unlock('echo-chamber');
    if (nextStars.every((x) => x >= 3)) g.unlock('coherence-keeper-3star');
  };

  const ref = useAnimCanvas(380, (ctx, w, h, dt) => {
    const s = sim.current;
    if (!s) return;
    const lv = params.current.L;
    const running = params.current.phase === 'running' && !s.done;
    if (running) {
      step(s, lv, Math.min((dt * lv.T) / REAL_SECONDS, lv.T - s.t));
      s.trace.push([s.t, fidelity(s)]);
      if (s.t >= lv.T - 1e-9) {
        s.done = true;
        setTimeout(() => finishRun(s), 350);
      }
    }
    s.flash = Math.max(0, s.flash - dt * 3);

    // ---- draw: spins ----
    const cx = w * 0.27, cy = 150, R = Math.min(120, w * 0.22);
    const ky = 0.42, kz = 0.92;
    const proj = (v: Vec3): [number, number] => [cx + R * v[0], cy - R * (ky * v[1] + kz * v[2])];
    if (s.flash > 0) {
      ctx.fillStyle = `rgba(252,98,85,${0.18 * s.flash})`;
      ctx.beginPath();
      ctx.arc(cx, cy, R * (1.3 - 0.2 * s.flash), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(88,196,221,.45)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.ellipse(cx, cy, R, R * ky, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(88,196,221,.15)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, R, R * kz, 0, 0, Math.PI * 2);
    ctx.stroke();
    // target marker at +x
    const [tx, ty] = proj([1, 0, 0]);
    ctx.strokeStyle = '#83c167';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(tx, ty, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#83c167';
    ctx.font = `12px ${SERIF}`;
    ctx.textAlign = 'left';
    ctx.fillText('target |+⟩', tx + 12, ty + 4);
    for (let i = 0; i < N; i++) {
      const [x, y] = proj(s.v[i]);
      ctx.strokeStyle = `hsla(${200 + (i / N) * 80}, 70%, 65%, 0.45)`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    const m: Vec3 = [0, 1, 2].map((k) => s.v.reduce((a, v) => a + v[k], 0) / N) as Vec3;
    const [mx, my] = proj(m);
    ctx.strokeStyle = '#fcd34d';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#fcd34d';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(mx, my);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // ---- fidelity gauge & timeline ----
    const F = (1 + m[0]) / 2;
    const left = w * 0.54, right = w - 16, top = 30, bot = 250;
    const sx = (t: number) => left + (t / lv.T) * (right - left);
    const sy = (f: number) => bot - ((f - 0.5) / 0.5) * (bot - top);
    ctx.strokeStyle = '#2a3142';
    ctx.lineWidth = 1;
    ctx.strokeRect(left, top, right - left, bot - top);
    // star thresholds
    lv.stars.forEach((th, k) => {
      ctx.strokeStyle = ['#c49a6c', '#cfd6e4', '#fcd34d'][k];
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(left, sy(th));
      ctx.lineTo(right, sy(th));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = ['#c49a6c', '#cfd6e4', '#fcd34d'][k];
      ctx.font = `11px ${SANS}`;
      ctx.textAlign = 'right';
      ctx.fillText('★'.repeat(k + 1), right - 4, sy(th) - 3);
    });
    // pulses
    for (const p of s.pulses) {
      ctx.strokeStyle = '#fc6255';
      ctx.beginPath();
      ctx.moveTo(sx(p), top);
      ctx.lineTo(sx(p), bot);
      ctx.stroke();
    }
    for (const q of s.queue) {
      ctx.strokeStyle = 'rgba(252,98,85,.35)';
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(sx(q), top);
      ctx.lineTo(sx(q), bot);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = '#fcd34d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    s.trace.forEach(([t, f], k) => (k ? ctx.lineTo(sx(t), sy(Math.max(0.5, f))) : ctx.moveTo(sx(t), sy(Math.max(0.5, f)))));
    ctx.stroke();
    // now line
    ctx.strokeStyle = '#58c4dd';
    ctx.beginPath();
    ctx.moveTo(sx(s.t), top);
    ctx.lineTo(sx(s.t), bot);
    ctx.stroke();
    ctx.fillStyle = '#7d8699';
    ctx.font = `11px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.fillText(`time (µs) — run length ${lv.T} µs`, (left + right) / 2, bot + 16);
    ctx.textAlign = 'right';
    ctx.fillText('1.0', left - 4, top + 8);
    ctx.fillText('0.5', left - 4, bot);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e9ecf2';
    ctx.font = `700 18px ${SANS}`;
    ctx.fillText(`fidelity ${F.toFixed(3)}`, left, top - 10);
    ctx.font = `12px ${SANS}`;
    ctx.fillStyle = '#9aa3b5';
    ctx.fillText(`pulses: ${s.pulses.length}`, left + 170, top - 10);
    // bottom banner
    ctx.textAlign = 'center';
    ctx.font = `600 13px ${SANS}`;
    ctx.fillStyle = '#9aa3b5';
    const msg =
      params.current.phase === 'ready'
        ? 'Press START. In Live mode, tap SPACE (or the red button) to fire π pulses.'
        : params.current.phase === 'running'
          ? mode === 'live'
            ? 'SPACE = π pulse'
            : 'Running your program…'
          : '';
    ctx.fillText(msg, w / 2, h - 14);
    void tick;
  });

  // force a re-render now and then so the canvas closure sees fresh state
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, []);

  const totalStars = stars.reduce((a, b) => a + b, 0);

  return (
    <div>
      <HowToPlay defaultOpen={g.plays === 0}>
        <p style={{ marginTop: 0 }}>
          Your qubit starts in <b>|+⟩</b> and must still be there when the run ends. The environment keeps nudging its frequency, so its phase drifts. You
          don't know by how much. Each faint arrow is one possible history of the noise, and the <b style={{ color: 'var(--yellow)' }}>yellow arrow</b>{' '}
          is their average, which is what a measurement sees.
        </p>
        <p>
          Your only tool is the <b style={{ color: 'var(--red)' }}>π pulse</b>, a 180° flip about x that mirrors every phase. Fire pulses (SPACE in{' '}
          <b>Live</b> mode) or choose a classic <b>dynamical-decoupling program</b>. Score = final fidelity with |+⟩. Earn ★ to ★★★ per level. Beat all
          five levels to win.
        </p>
      </HowToPlay>

      <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {LEVELS.map((lv, i) => {
          const locked = i > 0 && stars[i - 1] === 0 && stars[i] === 0;
          return (
            <button
              key={i}
              className={`btn small ${lvl === i ? 'active' : ''}`}
              disabled={locked || phase === 'running'}
              onClick={() => {
                setLvl(i);
                setPhase('ready');
                sim.current = null;
                setResult(null);
              }}
              title={locked ? 'Earn a star on the previous level first' : lv.blurb}
            >
              {locked ? '🔒 ' : ''}
              {lv.name} {stars[i] ? <span style={{ color: 'var(--yellow)' }}>{'★'.repeat(stars[i])}</span> : null}
            </button>
          );
        })}
        <span style={{ marginLeft: 'auto' }}>
          <Stat label="total stars" value={`${totalStars}/15`} color="var(--yellow)" />
        </span>
      </div>

      <div className="panel" style={{ padding: 12, position: 'relative' }}>
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <b style={{ fontSize: '1.05rem' }}>{L.name}</b>
            <div className="dim" style={{ fontSize: '0.88rem' }}>{L.blurb}</div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Segmented value={mode} onChange={(m) => phase !== 'running' && setMode(m)} options={[{ value: 'live', label: '🎮 Live' }, { value: 'program', label: '📜 Program' }]} />
            {mode === 'program' && (
              <select value={prog} onChange={(e) => setProg(e.target.value)} disabled={phase === 'running'} style={{ background: 'var(--panel-2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 8px' }}>
                {PROGRAMS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            )}
            <button className="btn primary" onClick={start} disabled={phase === 'running'}>
              {phase === 'result' ? '↻ Retry' : '▶ Start'}
            </button>
            {mode === 'live' && (
              <button className="btn danger" onMouseDown={pulse} disabled={phase !== 'running'}>
                ⚡ π pulse
              </button>
            )}
          </div>
        </div>
        <div style={{ width: '100%', marginTop: 8 }}>
          <canvas ref={ref} style={{ display: 'block' }} />
        </div>
        {phase === 'result' && result && (
          <GameOverlay title={result.stars ? `${'★'.repeat(result.stars)}${'☆'.repeat(3 - result.stars)}  F = ${result.F.toFixed(3)}` : `F = ${result.F.toFixed(3)}: not enough`} tone={result.stars ? 'win' : 'lose'}>
            <p>
              {result.pulses} pulse{result.pulses === 1 ? '' : 's'} used. Thresholds: {L.stars.map((x) => x.toFixed(2)).join(' / ')}.
            </p>
            <p style={{ textAlign: 'left' }}>
              <b>Physics:</b> {L.lesson}
            </p>
            <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 10 }}>
              <button className="btn" onClick={start}>↻ Retry</button>
              {lvl < LEVELS.length - 1 && result.stars > 0 && (
                <button
                  className="btn primary"
                  onClick={() => {
                    setLvl(lvl + 1);
                    sim.current = null;
                    setResult(null);
                    setPhase('ready');
                  }}
                >
                  Next level →
                </button>
              )}
              <button className="btn ghost" onClick={() => setPhase('ready')}>Close</button>
            </div>
          </GameOverlay>
        )}
      </div>
      {stars.every((x) => x >= 1) && (
        <div className="panel pop" style={{ marginTop: 12, borderColor: 'var(--green)' }}>
          🏆 <b>All five levels cleared.</b> You've just done by hand what control software does on every idle qubit of a real processor. And you've felt the
          wall it can't get past: T₁ and fast noise. Next stop: World 11, where we stop fighting noise and start <i>correcting</i> it.
        </div>
      )}
    </div>
  );
}
