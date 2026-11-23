import React, { useEffect, useRef, useState } from 'react';
import { useGame, GameOverlay, HowToPlay } from '../../../components/game';
import { ProgressBar, Stat } from '../../../components/ui';
import { phaseColor } from '../../../engine/complex';
import { useTween, pct, useWidth } from '../widgets/viz';
import { groverTheta, groverSuccess, groverBestK } from '../algos';

interface RoundDef {
  N: number;
  M: number;
  blind: boolean;
}
const ROUNDS: RoundDef[] = [
  { N: 16, M: 1, blind: false },
  { N: 64, M: 1, blind: false },
  { N: 64, M: 4, blind: false },
  { N: 512, M: 1, blind: false },
  { N: 1024, M: 1, blind: true },
  { N: 256, M: 4, blind: true },
  { N: 4096, M: 1, blind: true },
  { N: 1 << 20, M: 3, blind: true },
];
const fmtN = (N: number) => (N >= 1 << 20 ? '2²⁰ = 1,048,576' : N.toLocaleString());
const PASS_AVG = 0.85;

type Phase = 'ready' | 'running' | 'done';
interface Result {
  k: number;
  p: number;
  hit: boolean;
  pts: number;
}

export default function GroverTiming() {
  const g = useGame('grover-timing');
  const [ri, setRi] = useState(0);
  const [phase, setPhase] = useState<Phase>('ready');
  const [k, setK] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [planned, setPlanned] = useState('');
  const [over, setOver] = useState(false);
  const [flash, setFlash] = useState<null | 'good' | 'bad'>(null);
  const R = ROUNDS[ri];
  const theta = groverTheta(R.N, R.M);
  const kStar = groverBestK(R.N, R.M);
  const kMax = 2 * kStar + 3;
  const tickMs = Math.max(200, Math.min(900, Math.round(4800 / (kStar + 1))));
  const target = useRef<number | null>(null);

  // ticking
  useEffect(() => {
    if (phase !== 'running') return;
    const stopAt = target.current ?? kMax;
    const step = R.blind ? Math.max(1, Math.ceil(stopAt / 100)) : 1;
    const id = setInterval(() => {
      setK((kk) => {
        const next = Math.min(kk + step, stopAt);
        if (next >= stopAt) {
          clearInterval(id);
          setTimeout(() => finishRound(next), 30);
        }
        return next;
      });
    }, R.blind ? 30 : tickMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, ri]);

  const doneRef = useRef(false);
  const finishRound = (kk: number) => {
    if (doneRef.current) return;
    doneRef.current = true;
    const p = groverSuccess(R.N, R.M, kk);
    const hit = Math.random() < p;
    const pts = Math.round(100 * p) + (kk === kStar ? 20 : 0);
    setPhase('done');
    setK(kk);
    setFlash(p > 0.9 ? 'good' : 'bad');
    setTimeout(() => setFlash(null), 500);
    setResults((rs) => {
      const next = [...rs, { k: kk, p, hit, pts }];
      if (R.blind && R.N >= 4096 && kk === kStar) g.unlock('perfect-timing');
      return next;
    });
  };

  const start = () => {
    setK(0);
    doneRef.current = false;
    if (R.blind) {
      const v = parseInt(planned, 10);
      if (!Number.isFinite(v) || v < 0) return;
      target.current = v;
      if (v === 0) {
        setPhase('running');
        setTimeout(() => finishRound(0), 50);
        return;
      }
    } else target.current = null;
    setPhase('running');
  };

  const stop = () => {
    if (phase !== 'running' || R.blind) return;
    target.current = k;
    finishRound(k);
  };

  const nextRound = () => {
    if (ri === ROUNDS.length - 1) {
      const total = results.reduce((a, r) => a + r.pts, 0);
      const avg = results.reduce((a, r) => a + r.p, 0) / results.length;
      g.finish(total, avg >= PASS_AVG, { lastAvg: avg });
      setOver(true);
      return;
    }
    setRi(ri + 1);
    setPhase('ready');
    setK(0);
    setPlanned('');
  };

  const restart = () => {
    setRi(0);
    setResults([]);
    setPhase('ready');
    setK(0);
    setPlanned('');
    setOver(false);
  };

  // keyboard: space = stop
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && phase === 'running' && !R.blind) {
        e.preventDefault();
        stop();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const total = results.reduce((a, r) => a + r.pts, 0);
  const avgP = results.length ? results.reduce((a, r) => a + r.p, 0) / results.length : 0;
  const last = phase === 'done' ? results[results.length - 1] : null;
  const showPicture = !R.blind || phase === 'done';

  return (
    <div>
      <HowToPlay defaultOpen={g.plays === 0}>
        <p style={{ margin: '0 0 6px' }}>
          A Grover search is running. Each tick is one iteration (oracle + diffuser), which rotates the state by 2θ toward the marked items. You score the
          <b> probability of success</b> at the moment you stop, plus a 20-point bonus for the exact optimal iteration.
        </p>
        <p style={{ margin: '0 0 6px' }}>
          <b>Rounds 1–4 (visible):</b> watch the arrow and press <b>STOP</b> (or the space bar) at the right moment. Overshoot and the probability falls again.
        </p>
        <p style={{ margin: 0 }}>
          <b>Rounds 5–8 (blind):</b> a real quantum computer won't let you watch amplitudes. Measuring destroys them. You must <b>program the iteration count in
          advance</b>. Use sin θ = √(M/N) and k ≈ π/(4θ) − ½. Average success ≥ {pct(PASS_AVG, 0)} over all 8 rounds beats the game.
        </p>
      </HowToPlay>

      <div className="row" style={{ gap: 18, marginBottom: 10, flexWrap: 'wrap' }}>
        <Stat label="round" value={`${ri + 1}/${ROUNDS.length}`} />
        <Stat label="score" value={total} color="var(--yellow)" />
        <Stat label="avg success" value={results.length ? pct(avgP, 0) : '–'} color={avgP >= PASS_AVG ? 'var(--green)' : undefined} />
        <div style={{ flex: 1, minWidth: 160 }}>
          <div className="row" style={{ gap: 3 }}>
            {ROUNDS.map((_, i) => {
              const r = results[i];
              return (
                <div
                  key={i}
                  title={r ? `${pct(r.p)}` : ''}
                  style={{ flex: 1, height: 10, borderRadius: 3, background: r ? phaseColor(0, 30 + 40 * r.p, 20 + 70 * r.p) : i === ri ? 'var(--blue-d)' : 'var(--panel-2)' }}
                />
              );
            })}
          </div>
        </div>
      </div>

      <div className={`panel ${flash === 'bad' ? 'shake' : ''}`} style={{ padding: 14, borderColor: flash === 'good' ? 'var(--green)' : flash === 'bad' ? 'var(--red)' : undefined }}>
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <b style={{ fontSize: '1.1rem' }}>
            {R.blind ? '🙈 Blind round' : '👀 Visible round'}: N = {fmtN(R.N)}, M = {R.M} marked
          </b>
          <span className="mono" style={{ fontSize: '1.5rem', color: 'var(--yellow)' }}>
            k = {k}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(240px, 1.3fr)', gap: 16, marginTop: 10, alignItems: 'center' }}>
          {showPicture ? (
            <MiniPlane angle={(2 * k + 1) * theta} theta={theta} />
          ) : (
            <div className="panel center" style={{ height: 230, display: 'grid', placeItems: 'center', background: 'var(--bg-2)' }}>
              <div>
                <div style={{ fontSize: '3rem' }} className={phase === 'running' ? 'pop' : ''} key={k}>
                  ⚛
                </div>
                <div className="faint">{phase === 'running' ? `running iteration ${k}…` : 'amplitudes hidden'}</div>
              </div>
            </div>
          )}
          <div>
            {showPicture ? <MiniBars N={R.N} M={R.M} angle={(2 * k + 1) * theta} /> : <div className="faint">No peeking: the bars would require measuring, which destroys the state.</div>}
            <div style={{ marginTop: 10 }}>
              {phase === 'ready' && !R.blind && (
                <button className="btn primary" style={{ fontSize: '1.05rem' }} onClick={start}>
                  ▶ Start the search
                </button>
              )}
              {phase === 'ready' && R.blind && (
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <span>Iterations to run:</span>
                  <input type="number" min={0} value={planned} onChange={(e) => setPlanned(e.target.value)} style={{ width: 100 }} onKeyDown={(e) => e.key === 'Enter' && start()} />
                  <button className="btn primary" disabled={planned === ''} onClick={start}>
                    ▶ Run
                  </button>
                  <span className="faint" style={{ fontSize: '0.8rem' }}>θ is not shown; compute it from N and M.</span>
                </div>
              )}
              {phase === 'running' && !R.blind && (
                <button className="btn danger" style={{ fontSize: '1.2rem', padding: '10px 26px' }} onClick={stop}>
                  ■ STOP &amp; MEASURE
                </button>
              )}
              {phase === 'done' && last && (
                <div className="pop">
                  <div style={{ fontSize: '1.1rem' }}>
                    Stopped at k = <b>{last.k}</b>: P(success) = <b style={{ color: last.p > 0.9 ? 'var(--green)' : last.p > 0.5 ? 'var(--yellow)' : 'var(--red)' }}>{pct(last.p)}</b>{' '}
                    → +{last.pts} pts {last.k === kStar && <span className="pill good">perfect k! +20</span>}
                  </div>
                  <div className="dim" style={{ marginTop: 4 }}>
                    The measurement {last.hit ? 'found a marked item ✓' : 'returned an unmarked item ✗'}. Optimal: k* = {kStar} ({pct(groverSuccess(R.N, R.M, kStar))}).
                  </div>
                  <div className="faint" style={{ fontSize: '0.85rem', marginTop: 4 }}>
                    sin θ = √({R.M}/{R.N >= 1 << 20 ? '2²⁰' : R.N}) → θ = {((theta * 180) / Math.PI).toFixed(3)}°, and π/(4θ) − ½ = {(Math.PI / (4 * theta) - 0.5).toFixed(2)}.
                    {last.k > kStar ? ' You overshot: the state rotated past the marked axis.' : last.k < kStar ? ' You stopped early: the rotation had further to go.' : ''}
                  </div>
                  <button className="btn primary" style={{ marginTop: 8 }} onClick={nextRound}>
                    {ri === ROUNDS.length - 1 ? 'Finish' : 'Next round →'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {over && (
        <GameOverlay title={avgP >= PASS_AVG ? '🏁 Search complete!' : 'Not quite tuned'} tone={avgP >= PASS_AVG ? 'win' : 'lose'} onClose={restart}>
          Average success {pct(avgP)}, total score {total}.{' '}
          {avgP >= PASS_AVG
            ? 'You timed the rotation like a pro, including the blind rounds that real hardware forces on you.'
            : `Reach an average of ${pct(PASS_AVG, 0)}. In blind rounds, compute k* ≈ π/(4θ) − ½ and round to the nearest integer.`}
          <div style={{ marginTop: 8 }}>
            <ProgressBar value={avgP} color={avgP >= PASS_AVG ? 'var(--green)' : 'var(--yellow)'} />
          </div>
        </GameOverlay>
      )}
    </div>
  );
}

/** Compact 2D Grover plane: |s'⟩ horizontal, |w⟩ vertical, state at the given angle (eased). */
function MiniPlane({ angle, theta }: { angle: number; theta: number }) {
  const a = useTween(angle, 260);
  const S = 230, cx = 40, cy = S - 40, R = S - 70;
  const x = cx + R * Math.cos(a), y = cy - R * Math.sin(a);
  const p = Math.sin(a) ** 2;
  return (
    <svg width={S} height={S} style={{ display: 'block', margin: '0 auto' }}>
      <path d={`M ${cx + R} ${cy} A ${R} ${R} 0 0 0 ${cx - R} ${cy}`} fill="none" stroke="#2a3142" strokeWidth={1.5} />
      <line x1={cx - 10} x2={cx + R + 14} y1={cy} y2={cy} stroke="#4a5368" />
      <line x1={cx} x2={cx} y1={cy + 10} y2={cy - R - 14} stroke="#4a5368" />
      <text x={cx + R - 4} y={cy + 18} fontSize={13} fill="#9aa3b5" fontFamily="var(--serif)">|s′⟩</text>
      <text x={cx + 6} y={cy - R - 2} fontSize={13} fill="#83c167" fontFamily="var(--serif)">|w⟩</text>
      <line x1={cx} y1={cy} x2={cx + (R + 10) * Math.cos(theta)} y2={cy - (R + 10) * Math.sin(theta)} stroke="#58c4dd66" strokeDasharray="5 4" />
      <line x1={cx} y1={cy} x2={cx} y2={y} stroke="#83c167" strokeWidth={6} opacity={0.5} strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={x} y2={y} stroke="#fcd34d" strokeWidth={3.5} strokeLinecap="round" />
      <circle cx={x} cy={y} r={5} fill="#fcd34d" />
      <text x={S - 6} y={16} fontSize={12} fill="#83c167" textAnchor="end">P = {pct(p, 0)}</text>
    </svg>
  );
}

/** Amplitude bars: individual items for N ≤ 64, otherwise a marked vs. unmarked summary. */
function MiniBars({ N, M, angle }: { N: number; M: number; angle: number }) {
  const a = useTween(angle, 260);
  const [ref, W] = useWidth<HTMLDivElement>(320);
  const H = 150, base = H / 2;
  const am = Math.sin(a) / Math.sqrt(M), au = Math.cos(a) / Math.sqrt(N - M);
  const sy = (v: number) => base - v * (H / 2 - 10);
  if (N > 64) {
    const bars = [
      { v: am, label: `marked (${M})`, m: true },
      { v: au, label: `each unmarked (×${(N - M).toLocaleString()})`, m: false },
    ];
    return (
      <div ref={ref}>
        <svg width={W} height={H + 16}>
          <line x1={0} x2={W} y1={base} y2={base} stroke="#4a5368" />
          {bars.map((b, i) => (
            <g key={i}>
              <rect x={W * (0.12 + 0.46 * i)} width={W * 0.28} y={Math.min(sy(0), sy(b.v))} height={Math.max(1, Math.abs(sy(b.v) - sy(0)))} fill={phaseColor(b.v >= 0 ? 0 : Math.PI)} stroke={b.m ? '#fcd34d' : undefined} strokeWidth={b.m ? 2 : 0} rx={3} />
              <text x={W * (0.26 + 0.46 * i)} y={H + 12} fontSize={11} textAnchor="middle" fill={b.m ? '#fcd34d' : '#9aa3b5'}>
                {b.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
    );
  }
  const marked = new Set(Array.from({ length: M }, (_, i) => Math.floor(((i + 0.6) / M) * N * 0.9)));
  const bw = W / N;
  return (
    <div ref={ref}>
      <svg width={W} height={H}>
        <line x1={0} x2={W} y1={base} y2={base} stroke="#4a5368" />
        {Array.from({ length: N }, (_, i) => {
          const v = marked.has(i) ? am : au;
          return (
            <rect
              key={i}
              x={i * bw + Math.min(1.5, bw * 0.15)}
              width={Math.max(1, bw - 2 * Math.min(1.5, bw * 0.15))}
              y={Math.min(sy(0), sy(v))}
              height={Math.max(0.5, Math.abs(sy(v) - sy(0)))}
              fill={phaseColor(v >= 0 ? 0 : Math.PI)}
              stroke={marked.has(i) ? '#fcd34d' : undefined}
              strokeWidth={marked.has(i) ? 1.5 : 0}
            />
          );
        })}
      </svg>
    </div>
  );
}
