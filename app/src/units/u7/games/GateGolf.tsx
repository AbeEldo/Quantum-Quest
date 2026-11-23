import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BlochSphere, GATE_ROTATIONS, rotateVec, type Vec3 } from '../../../widgets/BlochSphere';
import { useGame, GameOverlay, HowToPlay } from '../../../components/game';
import { ProgressBar, Stat } from '../../../components/ui';
import { GATES, mulberry32, type Mat2 } from '../../../engine/qsim';
import { c, type C } from '../../../engine/complex';
import { enumerateWords, bestApprox, wordOf, type WordCloud, type WordGate } from '../lib/words';
import { apply2, blochOf } from '../lib/su2';

type Club = 'H' | 'T' | 'Tdg';
const CLUBS: { g: Club; label: string; key: string; tip: string }[] = [
  { g: 'H', label: 'H', key: 'h', tip: 'half-turn about the x+z diagonal: swaps the z- and x-axes' },
  { g: 'T', label: 'T', key: 't', tip: 'eighth-turn (45°) about z' },
  { g: 'Tdg', label: 'T†', key: 'r', tip: 'eighth-turn backwards (−45°) about z' },
];
const MAT: Record<Club, Mat2> = { H: GATES.H, T: GATES.T, Tdg: GATES.Tdg };
const WORD_SET: WordGate[] = ['H', 'T', 'Tdg'];
const LABEL: Record<string, string> = { H: 'H', T: 'T', Tdg: 'T†' };

interface Hole {
  target: Vec3;
  thr: number;
  optimal: number;
  optimalWord: string[];
  par: number;
  strokes: number | null;
  conceded?: boolean;
}

const TIERS = [
  { name: 'Front nine — fairway', thr: 0.97 },
  { name: 'Middle — the rough', thr: 0.99 },
  { name: 'Championship greens', thr: 0.995 },
];
const tierOf = (i: number) => TIERS[Math.min(2, Math.floor(i / 3))];

const TIPS = [
  'H·T·H is an eighth-turn about the x-axis: conjugating by H relabels z as x. You have a z-dial (T, T†) and, sandwiched in Hadamards, an x-dial.',
  'With rotations about two different axes you can reach anything — the Euler idea from Lesson 7.1, made discrete.',
  'T·(HTH) is a rotation by an irrational fraction of a turn, so repeating it never cycles. That is why H and T are dense on the sphere.',
  'The par is the shortest word a computer found by breadth-first search over every H/T/T† sequence, plus some slack for humans.',
  'Solovay–Kitaev: accuracy ε needs only O(log^c(1/ε)) gates. Each tighter green costs only a few extra strokes, not double.',
  'Real compilers (e.g. Ross–Selinger) find near-optimal Clifford+T words with about 3·log₂(1/ε) T gates for z-rotations.',
  'Every stroke here would be a fault-tolerant gate on a real machine; T gates are the expensive ones, so compilers minimise the T-count.',
];

function randomDir(rng: () => number): Vec3 {
  const z = 1 - 2 * rng(), a = rng() * 2 * Math.PI, r = Math.sqrt(1 - z * z);
  return [r * Math.cos(a), r * Math.sin(a), z];
}

function makeCourse(cloud: WordCloud, seed: number): Hole[] {
  const rng = mulberry32(seed);
  const holes: Hole[] = [];
  let guard = 0;
  while (holes.length < 9 && guard++ < 500) {
    const thr = tierOf(holes.length).thr;
    const t = randomDir(rng);
    let L = 0;
    while (L < cloud.cumulative.length - 1 && bestApprox(cloud, t, L).fidelity < thr) L++;
    if (L < 3 || L > 12) continue;
    const b = bestApprox(cloud, t, L);
    const optimalWord = wordOf(cloud, b.index).map((g) => LABEL[g]);
    holes.push({ target: t, thr, optimal: L, optimalWord, par: L + Math.ceil(L / 3), strokes: null });
  }
  return holes;
}

const fid = (v: Vec3, t: Vec3) => (1 + v[0] * t[0] + v[1] * t[1] + v[2] * t[2]) / 2;

/** Gate Golf: steer |0⟩ into a target "hole" on the Bloch sphere with H, T, T† strokes. */
export default function GateGolf() {
  const g = useGame('gate-golf');
  const cloud = useMemo(() => enumerateWords(WORD_SET, 16, 60000), []);
  const [seed, setSeed] = useState(() => (Date.now() & 0xffff) + 1);
  const [holes, setHoles] = useState<Hole[]>(() => makeCourse(cloud, seed));
  const [hi, setHi] = useState(0);
  const [amps, setAmps] = useState<[C, C]>([c(1), c(0)]);
  const [history, setHistory] = useState<[C, C][]>([]);
  const [strokes, setStrokes] = useState(0);
  const [display, setDisplay] = useState<Vec3>([0, 0, 1]);
  const [axis, setAxis] = useState<Vec3 | null>(null);
  const [sunk, setSunk] = useState<null | { strokes: number; f: number; conceded?: boolean }>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const anim = useRef<number>(0);
  const animating = useRef(false);

  const hole = holes[hi];
  const v = blochOf(amps);
  const f = hole ? fid(v, hole.target) : 0;

  useEffect(() => () => cancelAnimationFrame(anim.current), []);

  const animate = (from: Vec3, ax: Vec3, angle: number, after: () => void) => {
    cancelAnimationFrame(anim.current);
    animating.current = true;
    setAxis(ax);
    const t0 = performance.now();
    const dur = 380 + 220 * Math.min(1, Math.abs(angle) / Math.PI);
    const step = () => {
      const u = Math.min(1, (performance.now() - t0) / dur);
      const e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
      setDisplay(rotateVec(from, ax, angle * e));
      if (u < 1) anim.current = requestAnimationFrame(step);
      else {
        animating.current = false;
        setAxis(null);
        after();
      }
    };
    anim.current = requestAnimationFrame(step);
  };

  const finishHole = (n: number, fv: number, conceded = false) => {
    setSunk({ strokes: n, f: fv, conceded });
    setHoles((hs) => hs.map((h, i) => (i === hi ? { ...h, strokes: n, conceded } : h)));
    if (!conceded && n <= hole.par) g.unlock('u7-golf-par');
    if (!conceded && hi >= 6 && fv >= 0.999) g.unlock('u7-golf-precision');
  };

  const swing = (club: Club) => {
    if (animating.current || sunk || done || !hole) return;
    const next = apply2(MAT[club], amps);
    const r = GATE_ROTATIONS[club];
    const from = blochOf(amps);
    const n = strokes + 1;
    setHistory((h) => [...h, amps]);
    setAmps(next);
    setStrokes(n);
    setHint(null);
    animate(from, r.axis, r.angle, () => {
      const nv = blochOf(next);
      setDisplay(nv);
      const fv = fid(nv, hole.target);
      if (fv >= hole.thr) finishHole(n, fv);
    });
  };

  const undo = () => {
    if (animating.current || sunk || !history.length) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setAmps(prev);
    setDisplay(blochOf(prev));
    setStrokes((s) => s + 1); // the undo itself costs a stroke
    setHint(null);
  };

  const caddie = () => {
    if (animating.current || sunk || !hole) return;
    const local = enumerateWords(WORD_SET, 14, 20000, [
      [amps[0].re, amps[0].im],
      [amps[1].re, amps[1].im],
    ]);
    let idx = -1;
    for (let i = 0; i < local.count; i++) {
      if (fid([local.xyz[3 * i], local.xyz[3 * i + 1], local.xyz[3 * i + 2]], hole.target) >= hole.thr) {
        idx = i;
        break;
      }
    }
    setStrokes((s) => s + 1);
    if (idx <= 0) setHint(idx === 0 ? 'You are already in the hole!' : 'The caddie shrugs: more than 14 strokes from here. Try undoing a few.');
    else {
      const w = wordOf(local, idx);
      setHint(`Caddie: play ${LABEL[w[0]]} next — the hole is ${w.length} stroke${w.length === 1 ? '' : 's'} away (+1 penalty).`);
    }
  };

  const concede = () => {
    if (animating.current || sunk || !hole) return;
    finishHole(hole.par + 3, f, true);
  };

  const nextHole = () => {
    setSunk(null);
    setHint(null);
    if (hi === 8) {
      const total = holes.reduce((s, h) => s + (h.strokes ?? 0), 0);
      const par = holes.reduce((s, h) => s + h.par, 0);
      const over = total - par;
      const beaten = over <= 9;
      g.finish(Math.max(0, 1000 - 50 * Math.max(0, over)), beaten, { lastOver: over });
      if (over <= 0) g.unlock('u7-golf-champion');
      setDone(true);
      return;
    }
    setHi(hi + 1);
    setAmps([c(1), c(0)]);
    setDisplay([0, 0, 1]);
    setHistory([]);
    setStrokes(0);
  };

  const newRound = () => {
    const s = (Date.now() & 0xffff) + 1;
    setSeed(s);
    setHoles(makeCourse(cloud, s));
    setHi(0);
    setAmps([c(1), c(0)]);
    setDisplay([0, 0, 1]);
    setHistory([]);
    setStrokes(0);
    setSunk(null);
    setDone(false);
    setHint(null);
  };

  // keyboard: h / t / r, u = undo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      const club = CLUBS.find((cl) => cl.key === k);
      if (club) swing(club.g);
      else if (k === 'u') undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!hole) return <div className="panel">Could not build a course — please reload.</div>;

  const totalStrokes = holes.reduce((s, h) => s + (h.strokes ?? 0), 0);
  const parSoFar = holes.reduce((s, h) => s + (h.strokes !== null ? h.par : 0), 0);
  const toPar = totalStrokes - parSoFar;
  const tier = tierOf(hi);

  return (
    <div style={{ position: 'relative' }}>
      <HowToPlay defaultOpen={g.plays === 0}>
        Each hole is a green target on the Bloch sphere. Your ball is the qubit, starting at |0⟩ (the north pole). Your only clubs are <b>H</b>, <b>T</b> and{' '}
        <b>T†</b>. Every press is a stroke. Sink the ball by reaching the required <b>fidelity</b> |⟨target|ψ⟩|² — 97% on the front holes, 99% in the middle, 99.5% on
        the championship greens. Finish 9 holes within 9 over par to win. Keys: <span className="mono">H</span>, <span className="mono">T</span>,{' '}
        <span className="mono">R</span> (T†), <span className="mono">U</span> (undo, costs a stroke). Stuck? Ask the caddie (+1 stroke).
      </HowToPlay>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1.2fr) minmax(260px, 1fr)', gap: 18, alignItems: 'start' }}>
        <div>
          <BlochSphere vector={display} axis={axis} target={hole.target} trail trailKey={`${hi}-${seed}-${history.length === 0 && strokes === 0}`} height={380} />
          <div className="faint center" style={{ fontSize: '0.78rem' }}>drag to look around · the orange line is the rotation axis of your last stroke</div>
        </div>
        <div className="col" style={{ gap: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.15rem' }}>
                Hole {hi + 1} <span className="faint" style={{ fontWeight: 400 }}>/ 9</span>
              </div>
              <div className="faint" style={{ fontSize: '0.85rem' }}>
                {tier.name} · sink at {(hole.thr * 100).toFixed(1)}%
              </div>
            </div>
            <div className="row" style={{ gap: 14 }}>
              <Stat label="par" value={hole.par} />
              <Stat label="strokes" value={strokes} color={strokes > hole.par ? 'var(--red)' : 'var(--yellow)'} />
              <Stat label="round" value={toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : String(toPar)} color={toPar > 0 ? 'var(--red)' : 'var(--green)'} />
            </div>
          </div>

          <div>
            <div className="row" style={{ justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span className="faint">fidelity with the hole</span>
              <span className="mono" style={{ color: f >= hole.thr ? 'var(--green)' : 'var(--text)' }}>{(f * 100).toFixed(2)}%</span>
            </div>
            <div style={{ position: 'relative' }}>
              <ProgressBar value={f} color={f >= hole.thr ? 'var(--green)' : f > hole.thr - 0.05 ? 'var(--gold)' : 'var(--blue)'} height={12} />
              <div style={{ position: 'absolute', left: `${hole.thr * 100}%`, top: -3, width: 2, height: 18, background: 'var(--green)' }} />
            </div>
          </div>

          <div className="row" style={{ gap: 10 }}>
            {CLUBS.map((cl) => (
              <button
                key={cl.g}
                className="btn"
                title={cl.tip}
                disabled={!!sunk || done}
                onClick={() => swing(cl.g)}
                style={{ minWidth: 70, height: 56, justifyContent: 'center', fontFamily: 'var(--serif)', fontSize: '1.5rem', fontWeight: 700, borderColor: cl.g === 'H' ? '#f4d35e' : '#c97bd1', color: cl.g === 'H' ? '#f4d35e' : '#c97bd1' }}
              >
                {cl.label}
              </button>
            ))}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn small" onClick={undo} disabled={!history.length || !!sunk}>
              ↶ undo (+1)
            </button>
            <button className="btn small" onClick={caddie} disabled={!!sunk}>
              💬 ask the caddie (+1)
            </button>
            <button className="btn small ghost" onClick={concede} disabled={!!sunk}>
              concede (par + 3)
            </button>
          </div>
          {hint && <div className="panel" style={{ padding: 8, fontSize: '0.88rem', borderColor: 'var(--teal)' }}>{hint}</div>}

          <div className="mono faint" style={{ fontSize: '0.78rem' }}>
            ball ({v.map((x) => x.toFixed(2)).join(', ')}) · hole ({hole.target.map((x) => x.toFixed(2)).join(', ')})
          </div>

          <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse', textAlign: 'center' }}>
            <tbody>
              <tr className="faint">
                <td style={{ textAlign: 'left' }}>hole</td>
                {holes.map((_, i) => (
                  <td key={i} style={{ color: i === hi ? 'var(--yellow)' : undefined }}>{i + 1}</td>
                ))}
              </tr>
              <tr className="faint">
                <td style={{ textAlign: 'left' }}>par</td>
                {holes.map((h, i) => (
                  <td key={i}>{h.par}</td>
                ))}
              </tr>
              <tr>
                <td style={{ textAlign: 'left' }} className="faint">you</td>
                {holes.map((h, i) => (
                  <td key={i} className="mono" style={{ color: h.strokes === null ? 'var(--text-faint)' : h.conceded ? 'var(--red)' : h.strokes <= h.par ? 'var(--green)' : 'var(--text)' }}>
                    {h.strokes ?? '·'}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {sunk && (
        <GameOverlay
          title={sunk.conceded ? 'Hole conceded' : sunk.strokes <= hole.par ? `⛳ In the hole — ${sunk.strokes} strokes!` : `In the hole in ${sunk.strokes}`}
          tone={sunk.conceded ? 'lose' : sunk.strokes <= hole.par ? 'win' : 'info'}
          onClose={nextHole}
        >
          <div style={{ textAlign: 'left' }}>
            <p style={{ marginTop: 0 }}>
              {sunk.conceded ? (
                <>Scored as par + 3 = {hole.par + 3}.</>
              ) : (
                <>
                  Final fidelity <span className="mono">{(sunk.f * 100).toFixed(2)}%</span> (needed {(hole.thr * 100).toFixed(1)}%). Par {hole.par}.
                </>
              )}
            </p>
            <p>
              The computer&apos;s shortest word: <span className="mono" style={{ color: 'var(--yellow)' }}>{hole.optimalWord.join(' ')}</span> ({hole.optimal} strokes).
            </p>
            <p className="faint" style={{ fontSize: '0.88rem', marginBottom: 0 }}>💡 {TIPS[hi % TIPS.length]}</p>
          </div>
        </GameOverlay>
      )}

      {done && (
        <GameOverlay
          title={totalStrokes - holes.reduce((s, h) => s + h.par, 0) <= 9 ? '🏆 Round complete — you win!' : 'Round complete'}
          tone={totalStrokes - holes.reduce((s, h) => s + h.par, 0) <= 9 ? 'win' : 'lose'}
        >
          <p>
            {totalStrokes} strokes against a par of {holes.reduce((s, h) => s + h.par, 0)} (
            {(() => {
              const o = totalStrokes - holes.reduce((s, h) => s + h.par, 0);
              return o === 0 ? 'even par' : o > 0 ? `+${o}` : `${o}`;
            })()}
            ).
          </p>
          <p className="faint" style={{ fontSize: '0.9rem' }}>
            You just did by hand what a quantum compiler does billions of times: approximate arbitrary rotations with a finite, fault-tolerant gate set. Notice how
            tighter greens cost only a few extra strokes — that gentle growth is the Solovay–Kitaev theorem in action.
          </p>
          <button className="btn primary" onClick={newRound}>
            New course
          </button>
        </GameOverlay>
      )}
    </div>
  );
}
