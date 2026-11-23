import React, { useEffect, useRef, useState } from 'react';
import { BlochSphere, Vec3, GATE_ROTATIONS, rotateVec, vecFromAngles, anglesFromVec } from './BlochSphere';
import { AmplitudeView, PhaseLegend } from './AmplitudeView';
import { C, c, mul, add, abs2, conj, expi, scale } from '../engine/complex';
import { GATES, Mat2, Rx, Ry, Rz, ampsToBloch, blochToAmps } from '../engine/qsim';
import { Widget, Slider, fmtPi } from '../components/ui';
import { useChallengeGate } from '../components/lesson/gates';
import { useProgress } from '../state/progress';

type GateKey = 'X' | 'Y' | 'Z' | 'H' | 'S' | 'Sdg' | 'T' | 'Tdg' | 'SX';

const GATE_MAT: Record<GateKey, Mat2> = {
  X: GATES.X, Y: GATES.Y, Z: GATES.Z, H: GATES.H, S: GATES.S, Sdg: GATES.Sdg, T: GATES.T, Tdg: GATES.Tdg, SX: GATES.SX,
};
const GATE_LABEL: Record<string, string> = { Sdg: 'S†', Tdg: 'T†', SX: '√X' };

const apply2 = (m: Mat2, [a, b]: [C, C]): [C, C] => [add(mul(m[0], a), mul(m[1], b)), add(mul(m[2], a), mul(m[3], b))];

export interface BlochPlaygroundProps {
  title?: string;
  /** Gate buttons to show. */
  gates?: GateKey[];
  /** Show Rx/Ry/Rz angle sliders. */
  rotations?: boolean;
  /** Allow dragging the state on the sphere. */
  draggable?: boolean;
  /** Initial state as Bloch angles [theta, phi]. Default |0⟩. */
  initial?: [number, number];
  /** Target state (Bloch angles). Turns the widget into a challenge. */
  target?: [number, number];
  /** Unique id for the challenge (required with target). */
  challengeId?: string;
  /** Show amplitude readout. */
  showAmplitudes?: boolean;
  /** Show θ, φ readout. */
  showAngles?: boolean;
  height?: number;
  /** Max gates allowed for the challenge (optional par). */
  par?: number;
}

/**
 * Interactive single-qubit Bloch sphere with gate buttons. Gates animate as rotations.
 */
export function BlochPlayground({
  title = 'Bloch sphere playground',
  gates = ['X', 'Y', 'Z', 'H', 'S', 'T'],
  rotations = false,
  draggable = false,
  initial = [0, 0],
  target,
  challengeId,
  showAmplitudes = true,
  showAngles = true,
  height = 320,
  par,
}: BlochPlaygroundProps) {
  const [amps, setAmps] = useState<[C, C]>(() => blochToAmps(initial[0], initial[1]));
  const [display, setDisplay] = useState<Vec3>(() => vecFromAngles(initial[0], initial[1]));
  const [axis, setAxis] = useState<Vec3 | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [rot, setRot] = useState({ axis: 'x' as 'x' | 'y' | 'z', angle: Math.PI / 2 });
  const anim = useRef<{ from: Vec3; axis: Vec3; angle: number; t0: number; end: [C, C] } | null>(null);
  const raf = useRef(0);
  const recordQuiz = useProgress((s) => s.recordQuiz);
  const solvedBefore = useProgress((s) => (challengeId ? !!s.quizzes[`bloch:${challengeId}`]?.correct : false));

  const targetVec = target ? vecFromAngles(target[0], target[1]) : null;
  const fid = targetVec ? (1 + display[0] * targetVec[0] + display[1] * targetVec[1] + display[2] * targetVec[2]) / 2 : 0;
  const solved = !!targetVec && fid > 0.999 && !anim.current;
  const [wasSolved, setWasSolved] = useState(false);
  useChallengeGate(challengeId ?? 'bloch-none', !target || solved || wasSolved || solvedBefore);

  useEffect(() => {
    if (solved && !wasSolved) {
      setWasSolved(true);
      if (challengeId) recordQuiz(`bloch:${challengeId}`, true, par && history.length <= par ? 30 : 20);
    }
  }, [solved]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const animateTo = (end: [C, C], rAxis: Vec3, angle: number) => {
    cancelAnimationFrame(raf.current);
    const from = ampsToBloch(amps[0], amps[1]);
    anim.current = { from, axis: rAxis, angle, t0: performance.now(), end };
    setAxis(rAxis);
    const dur = 450 + 250 * Math.min(1, Math.abs(angle) / Math.PI);
    const step = () => {
      const a = anim.current!;
      const u = Math.min(1, (performance.now() - a.t0) / dur);
      const e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
      setDisplay(rotateVec(a.from, a.axis, a.angle * e));
      if (u < 1) raf.current = requestAnimationFrame(step);
      else {
        anim.current = null;
        setDisplay(ampsToBloch(a.end[0], a.end[1]));
        setTimeout(() => setAxis(null), 300);
      }
    };
    raf.current = requestAnimationFrame(step);
    setAmps(end);
  };

  const applyGate = (g: GateKey) => {
    if (anim.current) return;
    const r = GATE_ROTATIONS[g];
    animateTo(apply2(GATE_MAT[g], amps), r.axis, r.angle);
    setHistory((h) => [...h, GATE_LABEL[g] ?? g]);
  };

  const applyRot = () => {
    if (anim.current) return;
    const m = rot.axis === 'x' ? Rx(rot.angle) : rot.axis === 'y' ? Ry(rot.angle) : Rz(rot.angle);
    const ax: Vec3 = rot.axis === 'x' ? [1, 0, 0] : rot.axis === 'y' ? [0, 1, 0] : [0, 0, 1];
    animateTo(apply2(m, amps), ax, rot.angle);
    setHistory((h) => [...h, `R${rot.axis}(${fmtPi(rot.angle)})`]);
  };

  const reset = () => {
    cancelAnimationFrame(raf.current);
    anim.current = null;
    const a = blochToAmps(initial[0], initial[1]);
    setAmps(a);
    setDisplay(ampsToBloch(a[0], a[1]));
    setHistory([]);
    setAxis(null);
  };

  const onDrag = draggable
    ? (v: Vec3) => {
        if (anim.current) return;
        const { theta, phi } = anglesFromVec(v);
        const a = blochToAmps(theta, phi);
        setAmps(a);
        setDisplay(v);
      }
    : undefined;

  // canonical display amplitudes (global phase removed so α is real ≥ 0)
  const dispAmps = canonical(amps);
  const { theta, phi } = anglesFromVec(display);

  return (
    <Widget title={title}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1.2fr) 1fr', gap: 16, alignItems: 'start' }}>
        <div>
          <BlochSphere vector={display} axis={axis} onDrag={onDrag} trail trailKey={history.length === 0} height={height} target={targetVec} />
          <div className="faint center" style={{ fontSize: '0.78rem' }}>
            drag to rotate view{draggable ? ' · drag the yellow tip to move the state' : ''}
          </div>
        </div>
        <div className="col" style={{ gap: 12 }}>
          {target && (
            <div className="panel" style={{ padding: 10, borderColor: solved || wasSolved ? 'var(--green)' : 'var(--border)' }}>
              <div style={{ fontWeight: 600, color: solved || wasSolved ? 'var(--green)' : 'var(--yellow)' }}>
                {solved || wasSolved ? '✓ Target reached!' : '🎯 Reach the green target'}
              </div>
              <div className="faint" style={{ fontSize: '0.85rem' }}>
                Overlap with target: <span className="mono">{(fid * 100).toFixed(1)}%</span>
                {par ? ` · par ${par} gates · used ${history.length}` : ''}
              </div>
            </div>
          )}
          <div className="row" style={{ gap: 6 }}>
            {gates.map((g) => (
              <button key={g} className="btn" style={{ minWidth: 46, justifyContent: 'center', fontFamily: 'var(--serif)', fontSize: '1.05rem' }} onClick={() => applyGate(g)}>
                {GATE_LABEL[g] ?? g}
              </button>
            ))}
            <button className="btn ghost small" onClick={reset}>
              ↺ Reset
            </button>
          </div>
          {rotations && (
            <div className="panel" style={{ padding: 10 }}>
              <div className="row" style={{ gap: 6, marginBottom: 4 }}>
                {(['x', 'y', 'z'] as const).map((a) => (
                  <button key={a} className={`btn small ${rot.axis === a ? 'active' : ''}`} onClick={() => setRot((r) => ({ ...r, axis: a }))}>
                    R{a}
                  </button>
                ))}
              </div>
              <Slider label="angle θ" value={rot.angle} min={-Math.PI} max={Math.PI} step={Math.PI / 24} onChange={(v) => setRot((r) => ({ ...r, angle: v }))} format={fmtPi} />
              <button className="btn small primary" onClick={applyRot}>
                Apply R{rot.axis}({fmtPi(rot.angle)})
              </button>
            </div>
          )}
          {showAngles && (
            <div className="mono faint" style={{ fontSize: '0.85rem' }}>
              θ = {fmtPi(theta)} &nbsp; φ = {theta < 1e-3 || Math.PI - theta < 1e-3 ? '—' : fmtPi(phi)}
              <br />
              (x, y, z) = ({display.map((x) => x.toFixed(2)).join(', ')})
            </div>
          )}
          {showAmplitudes && (
            <div>
              <AmplitudeView amps={dispAmps} n={1} />
              <div style={{ marginTop: 6 }}>
                <PhaseLegend size={42} />
              </div>
            </div>
          )}
          {history.length > 0 && (
            <div className="faint" style={{ fontSize: '0.85rem' }}>
              Applied: <span className="mono" style={{ color: 'var(--text-dim)' }}>{history.join(' → ')}</span>
            </div>
          )}
        </div>
      </div>
    </Widget>
  );
}

function canonical([a, b]: [C, C]): [C, C] {
  const ref = abs2(a) > 1e-9 ? a : b;
  const m = Math.sqrt(abs2(ref));
  const ph = scale(conj(ref), 1 / m);
  return [mul(a, ph), mul(b, ph)];
}

export { expi, c };
