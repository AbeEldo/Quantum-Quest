import React, { useEffect, useState } from 'react';
import { useGame, GameOverlay, HowToPlay } from '../../../components/game';
import { Stat } from '../../../components/ui';
import { ProbBars } from '../widgets/viz';
import { ContinuedFractionPanel, ModExpPlot } from '../widgets/shorParts';
import {
  gcd, modpow, multiplicativeOrder, periodFindingSimulate, shorCountingBits, shorWorkBits, sampleFrom, splitFromOrder,
} from '../algos';

const TARGETS = [15, 21, 33, 35, 39];

type Stage = 'pickN' | 'pickA' | 'quantum' | 'classical' | 'split' | 'done';

export default function ShorWalkthrough() {
  const g = useGame('shor-walkthrough');
  const [factored, setFactored] = useState<number[]>(() => (g.data.factored as number[] | undefined) ?? []);
  const [N, setN] = useState<number | null>(null);
  const [aStr, setAStr] = useState('');
  const [a, setA] = useState<number | null>(null);
  const [stage, setStage] = useState<Stage>('pickN');
  const [dist, setDist] = useState<number[] | null>(null);
  const [computing, setComputing] = useState(false);
  const [shots, setShots] = useState<number[]>([]);
  const [selY, setSelY] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [r, setR] = useState<number | null>(null);
  const [revealed, setRevealed] = useState<{ minus: boolean; plus: boolean }>({ minus: false, plus: false });
  const [lucky, setLucky] = useState<number | null>(null);
  const [runs, setRuns] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [overlay, setOverlay] = useState<null | { title: string; body: string; tone: 'win' | 'lose' | 'info' }>(null);

  const t = N ? shorCountingBits(N) : 0;
  const Q = 1 << t;

  const resetA = () => {
    setA(null);
    setAStr('');
    setDist(null);
    setShots([]);
    setSelY(null);
    setPicked(null);
    setR(null);
    setRevealed({ minus: false, plus: false });
    setLucky(null);
    setStage('pickA');
  };

  const chooseN = (n: number) => {
    setN(n);
    setRuns(0);
    setAttempts(0);
    resetA();
  };

  const recordFactor = (n: number, viaShor: boolean) => {
    const next = factored.includes(n) ? factored : [...factored, n];
    setFactored(next);
    if (viaShor && n === 21) g.unlock('shor-thing');
    const beaten = next.includes(15) && next.includes(21);
    g.finish(next.length, beaten, { factored: next });
  };

  const checkA = () => {
    if (!N) return;
    const v = parseInt(aStr, 10);
    if (!Number.isFinite(v) || v < 2 || v > N - 2) return;
    setA(v);
    setAttempts((x) => x + 1);
    const d = gcd(v, N);
    if (d > 1) {
      setLucky(d);
      g.unlock('lucky-gcd');
      setStage('done');
      recordFactor(N, false);
      setOverlay({ title: '🍀 Lucky guess!', body: `gcd(${v}, ${N}) = ${d}, so ${N} = ${d} × ${N / d} with no quantum computer at all. For large N this almost never happens, because nearly every a is coprime to N. Try another N, or replay this one with a coprime a to see the quantum route.`, tone: 'info' });
      return;
    }
    setStage('quantum');
  };

  // run the state-vector simulation (deferred one tick so the "simulating" message paints)
  useEffect(() => {
    if (stage !== 'quantum' || !N || !a || dist) return;
    setComputing(true);
    const id = setTimeout(() => {
      setDist(periodFindingSimulate(a, N, t));
      setComputing(false);
    }, 60);
    return () => clearTimeout(id);
  }, [stage, N, a, dist, t]);

  const shoot = (k: number) => {
    if (!dist) return;
    const ys = Array.from({ length: k }, () => sampleFrom(dist));
    setShots((s) => [...s, ...ys]);
    setRuns((x) => x + k);
    if (selY === null) setSelY(ys.find((y) => y !== 0) ?? null);
  };

  const pickConvergent = (q: number) => {
    if (!N || !a) return;
    setPicked(q);
    if (modpow(a, q, N) === 1) {
      setR(multiplicativeOrder(a, N));
      setStage('split');
    }
  };

  const outcome = N && a && r ? splitFromOrder(a, N, r) : null;

  useEffect(() => {
    if (stage === 'split' && outcome && !outcome.ok) {
      setOverlay({
        title: 'Unlucky base',
        body:
          outcome.reason === 'odd-period'
            ? `The period r = ${r} is odd, so a^(r/2) isn't an integer power. Shor's recipe says: pick a different a. At least half of all bases work.`
            : `a^(r/2) ≡ −1 (mod ${N}), so the gcds give only 1 and ${N}. Pick a different a.`,
        tone: 'lose',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  const revealGcd = (which: 'minus' | 'plus') => {
    const next = { ...revealed, [which]: true };
    setRevealed(next);
    if (outcome && outcome.ok && stage === 'split') {
      const val = which === 'minus' ? gcd(outcome.x - 1, N!) : gcd(outcome.x + 1, N!);
      if (val > 1 && val < N!) {
        setStage('done');
        recordFactor(N!, true);
        setOverlay({
          title: N === 21 ? '🏅 Shor Thing!' : `🎉 ${N} factored!`,
          body: `${N} = ${outcome.factors[0]} × ${outcome.factors[1]}, using ${runs} quantum run${runs === 1 ? '' : 's'} and ${attempts} choice${attempts === 1 ? '' : 's'} of a. The quantum computer found the period r = ${r}; everything else was classical number theory.`,
          tone: 'win',
        });
      }
    }
  };

  const stepIdx = { pickN: 0, pickA: 1, quantum: 2, classical: 3, split: 4, done: 5 }[stage];

  return (
    <div>
      <HowToPlay defaultOpen={g.plays === 0}>
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          <li>Pick a number N to factor, and a base a. Check gcd(a, N) first. A shared factor means you got lucky.</li>
          <li>
            Run <b>quantum period finding</b>. It is simulated gate by gate on the state-vector engine, with t counting qubits (2^t ≥ N²) and ⌈log₂N⌉ work qubits.
            Each shot gives one y, clustered near multiples of 2^t / r.
          </li>
          <li>Expand y / 2^t as a <b>continued fraction</b> and test the convergents' denominators q: is a^q ≡ 1 (mod N)?</li>
          <li>With the period r, compute gcd(a^(r/2) ± 1, N). Factor both 15 and 21 to beat the game.</li>
        </ol>
      </HowToPlay>

      <div className="row" style={{ gap: 18, marginBottom: 12, flexWrap: 'wrap' }}>
        <Stat label="factored" value={`${factored.length}/${TARGETS.length}`} color="var(--green)" />
        <Stat label="quantum runs (this N)" value={runs} />
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {TARGETS.map((n) => (
            <button key={n} className={`btn ${N === n ? 'active' : ''}`} onClick={() => chooseN(n)} title={`${shorCountingBits(n) + shorWorkBits(n)} qubits`}>
              {factored.includes(n) ? '✓ ' : ''}
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* progress steps */}
      <div className="row" style={{ gap: 4, marginBottom: 12 }}>
        {['choose N', 'choose a', 'quantum', 'continued fractions', 'gcd', 'factored'].map((s, i) => (
          <div key={s} style={{ flex: 1, textAlign: 'center', fontSize: '0.75rem', padding: '4px 0', borderRadius: 6, background: i < stepIdx ? 'rgba(131,193,103,.25)' : i === stepIdx ? 'var(--blue-d)' : 'var(--panel-2)', color: i === stepIdx ? '#04141a' : 'var(--text-dim)' }}>
            {s}
          </div>
        ))}
      </div>

      {stage === 'pickN' && <div className="panel dim">Choose a number to factor above. Start with 15, then try 21 for the "Shor Thing" achievement.</div>}

      {N && stage !== 'pickN' && (
        <div className="panel" style={{ padding: 14 }}>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <b style={{ fontSize: '1.15rem' }}>N = {N}</b>
            <span className="faint">
              simulator: {t} counting + {shorWorkBits(N)} work = {t + shorWorkBits(N)} qubits ({(2 ** (t + shorWorkBits(N))).toLocaleString()} amplitudes)
            </span>
          </div>

          {/* choose a */}
          <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <span>base a =</span>
            <input type="number" min={2} max={N - 2} value={aStr} disabled={stage !== 'pickA'} onChange={(e) => setAStr(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && checkA()} style={{ width: 90 }} />
            <button className="btn small primary" disabled={stage !== 'pickA' || aStr === ''} onClick={checkA}>
              check gcd(a, N)
            </button>
            {stage === 'pickA' && <span className="faint" style={{ fontSize: '0.85rem' }}>any integer 2 … {N - 2}</span>}
            {a && lucky === null && <span className="pill good">gcd({a}, {N}) = 1, so we need the quantum step</span>}
            {stage !== 'pickA' && stage !== 'done' && (
              <button className="btn small ghost" onClick={resetA}>
                choose another a
              </button>
            )}
          </div>

          {a && lucky === null && stage !== 'pickA' && (
            <>
              <div className="faint" style={{ fontSize: '0.8rem', marginTop: 12 }}>
                The hidden periodic function (the quantum computer evaluates it on all 2^{t} = {Q} inputs in superposition)
              </div>
              <ModExpPlot a={a} N={N} r={multiplicativeOrder(a, N)} X={36} showPeriod={stage === 'split' || stage === 'done'} />

              <div style={{ marginTop: 10 }}>
                {computing && <div className="pill warn">⚛ simulating {t + shorWorkBits(N)} qubits: modular exponentiation + inverse QFT…</div>}
                {dist && (
                  <>
                    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <b>Measure the counting register:</b>
                      <button className="btn small primary" onClick={() => shoot(1)}>
                        ⚛ 1 shot
                      </button>
                      <button className="btn small" onClick={() => shoot(5)}>
                        ⚛ 5 shots
                      </button>
                      {shots.length > 0 && stage === 'quantum' && (
                        <button className="btn small gold" disabled={selY === null} onClick={() => setStage('classical')}>
                          → post-process y = {selY ?? '?'}
                        </button>
                      )}
                    </div>
                    {shots.length > 0 && (
                      <>
                        <div className="row" style={{ gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                          {shots.map((y, i) => (
                            <button
                              key={i}
                              className="btn small mono"
                              style={{ padding: '2px 8px', borderColor: y === selY ? 'var(--yellow)' : undefined, color: y === 0 ? 'var(--text-faint)' : undefined }}
                              onClick={() => { setSelY(y); setPicked(null); if (stage === 'classical') setStage('classical'); }}
                              title={y === 0 ? 'y = 0 carries no information' : `y/Q = ${(y / Q).toFixed(4)}`}
                            >
                              {y}
                            </button>
                          ))}
                        </div>
                        <ShotStrip shots={shots} Q={Q} />
                      </>
                    )}
                  </>
                )}
              </div>

              {(stage === 'classical' || stage === 'split' || stage === 'done') && selY !== null && (
                <div style={{ marginTop: 12 }}>
                  {selY === 0 ? (
                    <div className="panel dim" style={{ padding: 10 }}>y = 0 gives no information (it's the k = 0 peak). Pick another shot.</div>
                  ) : (
                    <ContinuedFractionPanel y={selY} Q={Q} a={a} N={N} onPick={stage === 'classical' ? pickConvergent : undefined} picked={picked} />
                  )}
                  {stage === 'classical' && picked !== null && modpow(a, picked, N) !== 1 && (
                    <div className="faint" style={{ fontSize: '0.85rem', marginTop: 6 }}>
                      {a}^{picked} ≡ {modpow(a, picked, N)} (mod {N}), not 1. Try another convergent, a multiple of this denominator, or a different shot.
                    </div>
                  )}
                </div>
              )}

              {(stage === 'split' || stage === 'done') && r && outcome && (
                <div className="panel" style={{ marginTop: 12, padding: 12, borderColor: outcome.ok ? 'var(--green)' : 'var(--red)' }}>
                  <div>
                    Period found: <b>r = {r}</b>
                    {picked !== null && picked !== r ? ` (${a}^${picked} ≡ 1, so r divides ${picked}; the smallest such exponent is ${r})` : ''}.
                  </div>
                  {outcome.ok ? (
                    <>
                      <div className="mono" style={{ marginTop: 6 }}>
                        x = a^(r/2) mod N = {a}^{r / 2} mod {N} = {outcome.x}
                      </div>
                      <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        <button className="btn small" onClick={() => revealGcd('minus')}>
                          gcd(x − 1, N) = gcd({outcome.x - 1}, {N}) = {revealed.minus ? <b>{gcd(outcome.x - 1, N)}</b> : '?'}
                        </button>
                        <button className="btn small" onClick={() => revealGcd('plus')}>
                          gcd(x + 1, N) = gcd({outcome.x + 1}, {N}) = {revealed.plus ? <b>{gcd(outcome.x + 1, N)}</b> : '?'}
                        </button>
                      </div>
                      {stage === 'done' && (
                        <div className="pop" style={{ fontSize: '1.3rem', marginTop: 8, color: 'var(--green)', fontWeight: 700 }}>
                          {N} = {outcome.factors[0]} × {outcome.factors[1]}
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ marginTop: 6 }}>
                      {outcome.reason === 'odd-period' ? 'r is odd: this base fails.' : `a^(r/2) ≡ −1 (mod ${N}): this base fails.`}{' '}
                      <button className="btn small primary" onClick={resetA}>
                        choose another a
                      </button>
                    </div>
                  )}
                </div>
              )}

              {stage === 'quantum' && dist && shots.length >= 8 && (
                <details style={{ marginTop: 10 }}>
                  <summary className="faint" style={{ cursor: 'pointer' }}>
                    Peek at the full output distribution (a real device never shows you this)
                  </summary>
                  <ProbBars bars={dist.map((p) => ({ value: p }))} height={130} xTitle={`y = 0 … ${Q - 1}`} />
                </details>
              )}
            </>
          )}
          {lucky !== null && (
            <div className="panel" style={{ marginTop: 10, padding: 10, borderColor: 'var(--green)' }}>
              🍀 gcd({a}, {N}) = {lucky}, so {N} = {lucky} × {N / lucky}.{' '}
              <button className="btn small" onClick={resetA}>
                try the quantum route with another a
              </button>
            </div>
          )}
        </div>
      )}

      {overlay && (
        <GameOverlay title={overlay.title} tone={overlay.tone} onClose={() => setOverlay(null)}>
          {overlay.body}
          {overlay.tone === 'win' && factored.includes(15) && factored.includes(21) && (
            <div style={{ marginTop: 8, color: 'var(--green)' }}>Both 15 and 21 factored: game beaten! For scale, RSA-2048 would need thousands of logical qubits.</div>
          )}
        </GameOverlay>
      )}
    </div>
  );
}

/** Measured y values as ticks on a 0…Q axis, so the peak structure emerges shot by shot. */
function ShotStrip({ shots, Q }: { shots: number[]; Q: number }) {
  const counts = new Map<number, number>();
  shots.forEach((y) => counts.set(y, (counts.get(y) ?? 0) + 1));
  return (
    <svg width="100%" height={46} viewBox={`0 0 1000 46`} preserveAspectRatio="none" style={{ display: 'block', marginTop: 6 }}>
      <line x1={0} x2={1000} y1={36} y2={36} stroke="#4a5368" />
      {[...counts.entries()].map(([y, c0]) => (
        <rect key={y} x={(y / Q) * 1000 - 3} width={6} y={36 - Math.min(32, 8 * c0)} height={Math.min(32, 8 * c0)} fill="#fcd34d" />
      ))}
      <text x={2} y={46} fontSize={10} fill="#6b7385">0</text>
      <text x={998} y={46} fontSize={10} fill="#6b7385" textAnchor="end">{Q - 1}</text>
    </svg>
  );
}

