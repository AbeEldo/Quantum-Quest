import React, { useEffect, useState } from 'react';
import { Widget, Slider, Tex, fmtPi } from '../../../components/ui';
import { c, mul, add, sub, scale, expi, abs2, type C } from '../../../engine/complex';
import { PhasorClock, PhaseLegend } from '../../../widgets/AmplitudeView';
import { BlochSphere, vecFromAngles } from '../../../widgets/BlochSphere';
import { useChallengeGate } from '../../../components/lesson/gates';
import { useProgress } from '../../../state/progress';

const I = c(0, 1);
const R2 = Math.SQRT1_2;

/** Probabilities of the + outcome along x, y, z for amplitudes (a, b). */
function stats(a: C, b: C) {
  const pz = abs2(a);
  const px = abs2(scale(add(a, b), R2));
  const py = abs2(scale(sub(a, mul(I, b)), R2)); // ⟨+i|ψ⟩ = (a − i b)/√2
  return { z: pz, x: px, y: py };
}

function Bar({ label, p, col }: { label: string; p: number; col: string }) {
  return (
    <div className="row" style={{ gap: 8, fontSize: '0.85rem' }}>
      <span style={{ width: 70 }} className="mono">
        {label}
      </span>
      <div style={{ flex: 1, height: 12, background: 'var(--panel-2)', borderRadius: 6, overflow: 'hidden', display: 'flex' }}>
        <div style={{ width: `${p * 100}%`, background: col, transition: 'width .15s' }} />
        <div style={{ width: `${(1 - p) * 100}%`, background: col, opacity: 0.25, transition: 'width .15s' }} />
      </div>
      <span className="mono" style={{ width: 92, textAlign: 'right' }}>
        {(p * 100).toFixed(1)} / {((1 - p) * 100).toFixed(1)}
      </span>
    </div>
  );
}

/**
 * Global vs relative phase: sliders for θ, relative phase φ and global phase γ.
 * Shows amplitude clocks, the Bloch vector, and the measurement statistics in the x, y, z bases.
 */
export function PhaseRevealer({ initialTheta = Math.PI / 2, initialPhi = 0 }: { initialTheta?: number; initialPhi?: number }) {
  const [theta, setTheta] = useState(initialTheta);
  const [phi, setPhi] = useState(initialPhi);
  const [gamma, setGamma] = useState(0);
  const a = scale(expi(gamma), Math.cos(theta / 2));
  const b = scale(expi(gamma + phi), Math.sin(theta / 2));
  const s = stats(a, b);
  const v = vecFromAngles(theta, phi);
  return (
    <Widget title="Global phase vs relative phase">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(240px, 1.1fr)', gap: 16, alignItems: 'center' }}>
        <BlochSphere vector={v} height={280} />
        <div className="col" style={{ gap: 10 }}>
          <div className="row" style={{ gap: 18, justifyContent: 'center' }}>
            <div className="col" style={{ alignItems: 'center', gap: 2 }}>
              <PhasorClock z={a} size={78} />
              <span className="mono">|0⟩</span>
            </div>
            <div className="col" style={{ alignItems: 'center', gap: 2 }}>
              <PhasorClock z={b} size={78} />
              <span className="mono">|1⟩</span>
            </div>
            <PhaseLegend size={44} />
          </div>
          <div style={{ fontSize: '0.95rem', textAlign: 'center' }}>
            <Tex>{`|\\psi\\rangle = e^{i\\,${(gamma / Math.PI).toFixed(2)}\\pi}\\Big(${Math.cos(theta / 2).toFixed(2)}\\,|0\\rangle + e^{i\\,${(phi / Math.PI).toFixed(2)}\\pi}\\,${Math.sin(theta / 2).toFixed(2)}\\,|1\\rangle\\Big)`}</Tex>
          </div>
          <Slider label={<Tex>{'\\gamma\\ (\\text{global})'}</Tex>} value={gamma} min={0} max={2 * Math.PI} step={Math.PI / 48} onChange={setGamma} format={fmtPi} />
          <Slider label={<Tex>{'\\varphi\\ (\\text{relative})'}</Tex>} value={phi} min={0} max={2 * Math.PI} step={Math.PI / 48} onChange={setPhi} format={fmtPi} />
          <Slider label={<Tex>{'\\theta'}</Tex>} value={theta} min={0} max={Math.PI} step={Math.PI / 48} onChange={setTheta} format={fmtPi} />
        </div>
      </div>
      <div className="col" style={{ gap: 6, marginTop: 12 }}>
        <div className="faint" style={{ fontSize: '0.82rem' }}>Measurement statistics, P(+) / P(−) in %:</div>
        <Bar label="Z: 0 / 1" p={s.z} col="#58c4dd" />
        <Bar label="X: + / −" p={s.x} col="#83c167" />
        <Bar label="Y: +i / −i" p={s.y} col="#e07ab6" />
      </div>
    </Widget>
  );
}

/* ------------------------------------------------------------------------ */

interface Pair {
  l: string;
  r: string;
  la: [C, C];
  ra: [C, C];
  same: boolean;
  why: string;
}

const s3 = Math.sqrt(3) / 2;
const PAIRS: Pair[] = [
  {
    l: '\\tfrac{1}{\\sqrt2}(|0\\rangle + |1\\rangle)',
    r: '\\tfrac{1}{\\sqrt2}(-|0\\rangle - |1\\rangle)',
    la: [c(R2), c(R2)],
    ra: [c(-R2), c(-R2)],
    same: true,
    why: 'The right state is −1 times the left one: a global phase e^{iπ}. Both clocks turned by the same 180°.',
  },
  {
    l: '\\tfrac{1}{\\sqrt2}(|0\\rangle + |1\\rangle)',
    r: '\\tfrac{1}{\\sqrt2}(|0\\rangle - |1\\rangle)',
    la: [c(R2), c(R2)],
    ra: [c(R2), c(-R2)],
    same: false,
    why: 'Only the |1⟩ clock flipped: a relative phase of π. These are |+⟩ and |−⟩, perfectly distinguishable in the X basis.',
  },
  {
    l: '\\tfrac{1}{\\sqrt2}(|0\\rangle + i|1\\rangle)',
    r: '\\tfrac{1}{\\sqrt2}(i|0\\rangle - |1\\rangle)',
    la: [c(R2), c(0, R2)],
    ra: [c(0, R2), c(-R2)],
    same: true,
    why: 'Multiply the left state by i: i·|0⟩ + i·i|1⟩ = i|0⟩ − |1⟩. A global phase of i (both clocks turned 90°).',
  },
  {
    l: '\\tfrac{\\sqrt3}{2}|0\\rangle + \\tfrac12|1\\rangle',
    r: '\\tfrac{\\sqrt3}{2}|0\\rangle - \\tfrac12|1\\rangle',
    la: [c(s3), c(0.5)],
    ra: [c(s3), c(-0.5)],
    same: false,
    why: 'Same Z statistics (75% / 25%), but the relative phase differs by π. In the X basis they give P(+) = 93.3% vs 6.7%.',
  },
  {
    l: 'e^{i\\pi/3}\\,\\tfrac{1}{\\sqrt2}(|0\\rangle + i|1\\rangle)',
    r: '\\tfrac{1}{\\sqrt2}(|0\\rangle + i|1\\rangle)',
    la: [scale(expi(Math.PI / 3), R2), mul(expi(Math.PI / 3), c(0, R2))],
    ra: [c(R2), c(0, R2)],
    same: true,
    why: 'An overall factor e^{iπ/3} is a global phase. The two clocks keep their 90° relative angle.',
  },
  {
    l: '\\tfrac{1}{\\sqrt2}(|0\\rangle + i|1\\rangle)',
    r: '\\tfrac{1}{\\sqrt2}(|0\\rangle - i|1\\rangle)',
    la: [c(R2), c(0, R2)],
    ra: [c(R2), c(0, -R2)],
    same: false,
    why: 'Relative phases +90° vs −90°: these are |+i⟩ and |−i⟩, opposite ends of the y axis. Identical in both the Z and X bases; only a Y measurement tells them apart.',
  },
  {
    l: '|1\\rangle',
    r: '-|1\\rangle',
    la: [c(0), c(1)],
    ra: [c(0), c(-1)],
    same: true,
    why: 'With only one nonzero amplitude there is no relative phase at all; −1 is global.',
  },
];

/** Gated mini-challenge: decide whether pairs of kets describe the same physical state. */
export function SameStateChallenge({ challengeId = 'u3l5-same-state' }: { challengeId?: string }) {
  const [idx, setIdx] = useState(0);
  const [wrong, setWrong] = useState(false);
  const [solvedItem, setSolvedItem] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const done = idx >= PAIRS.length;
  const [everDone, setEverDone] = useState(false);
  useChallengeGate(challengeId, done || everDone);
  const recordQuiz = useProgress((s) => s.recordQuiz);
  useEffect(() => {
    if (done && !everDone) {
      setEverDone(true);
      recordQuiz(challengeId, true, 30);
    }
  }, [done, everDone, challengeId, recordQuiz]);

  const p = PAIRS[Math.min(idx, PAIRS.length - 1)];
  const answer = (same: boolean) => {
    if (solvedItem) return;
    if (same === p.same) {
      setSolvedItem(true);
      setWrong(false);
    } else {
      setWrong(true);
      setMistakes((m) => m + 1);
    }
  };
  const next = () => {
    setIdx((i) => i + 1);
    setSolvedItem(false);
    setWrong(false);
  };

  return (
    <Widget title={`Phase detective: same state or not? (${Math.min(idx + 1, PAIRS.length)}/${PAIRS.length})`}>
      {done ? (
        <div className="center" style={{ padding: 16 }}>
          <div style={{ fontSize: '1.6rem' }}>🕵️ ✅</div>
          <div>
            All {PAIRS.length} cases solved{mistakes ? ` (with ${mistakes} slip${mistakes > 1 ? 's' : ''})` : ' without a single mistake'}. Rule of thumb: <b>compare the clocks' relative angle and
            relative lengths</b>; ignore a common rotation.
          </div>
          <button className="btn small ghost" style={{ marginTop: 10 }} onClick={() => { setIdx(0); setMistakes(0); }}>
            Play again
          </button>
        </div>
      ) : (
        <div className="col" style={{ gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {(
              [
                [p.l, p.la],
                [p.r, p.ra],
              ] as [string, [C, C]][]
            ).map(([tex, amps], k) => (
              <div key={k} className="panel col" style={{ alignItems: 'center', gap: 8, padding: 12 }}>
                <Tex>{tex}</Tex>
                <div className="row" style={{ gap: 10 }}>
                  <div className="col" style={{ alignItems: 'center' }}>
                    <PhasorClock z={amps[0]} size={52} />
                    <span className="faint mono" style={{ fontSize: '0.75rem' }}>|0⟩</span>
                  </div>
                  <div className="col" style={{ alignItems: 'center' }}>
                    <PhasorClock z={amps[1]} size={52} />
                    <span className="faint mono" style={{ fontSize: '0.75rem' }}>|1⟩</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="row" style={{ gap: 10, justifyContent: 'center' }}>
            <button className={`btn ${solvedItem && p.same ? 'active' : ''}`} onClick={() => answer(true)} disabled={solvedItem}>
              Same physical state
            </button>
            <button className={`btn ${solvedItem && !p.same ? 'active' : ''}`} onClick={() => answer(false)} disabled={solvedItem}>
              Different states
            </button>
          </div>
          {wrong && <div style={{ color: 'var(--red)' }}>Not quite. Look again at the two clocks of each state: did they rotate together, or relative to each other?</div>}
          {solvedItem && (
            <div className="pop" style={{ color: 'var(--green)' }}>
              ✓ {p.why}{' '}
              <button className="btn small primary" style={{ marginLeft: 8 }} onClick={next}>
                {idx === PAIRS.length - 1 ? 'Finish' : 'Next'}
              </button>
            </div>
          )}
        </div>
      )}
    </Widget>
  );
}
