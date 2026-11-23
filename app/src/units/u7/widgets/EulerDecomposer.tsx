import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BlochSphere } from '../../../widgets/BlochSphere';
import { Widget, Slider, Segmented, Tex, fmtPi } from '../../../components/ui';
import { GATES, Rn, U3, type Mat2 } from '../../../engine/qsim';
import { fmt } from '../../../engine/complex';
import { zyz, axisAngle, rot, type Vec3 } from '../lib/su2';

const PRESETS: { name: string; U: () => Mat2 }[] = [
  { name: 'H', U: () => GATES.H },
  { name: 'S', U: () => GATES.S },
  { name: '√X', U: () => GATES.SX },
  { name: 'Y', U: () => GATES.Y },
  { name: 'T·H', U: () => mul2(GATES.T, GATES.H) },
  { name: 'random', U: () => U3(Math.acos(1 - 2 * Math.random()), Math.random() * 2 * Math.PI, Math.random() * 2 * Math.PI) },
];

function mul2(A: Mat2, B: Mat2): Mat2 {
  const m = (x: { re: number; im: number }, y: { re: number; im: number }) => ({ re: x.re * y.re - x.im * y.im, im: x.re * y.im + x.im * y.re });
  const a = (x: { re: number; im: number }, y: { re: number; im: number }) => ({ re: x.re + y.re, im: x.im + y.im });
  return [a(m(A[0], B[0]), m(A[1], B[2])), a(m(A[0], B[1]), m(A[1], B[3])), a(m(A[2], B[0]), m(A[3], B[2])), a(m(A[2], B[1]), m(A[3], B[3]))];
}

const Z: Vec3 = [0, 0, 1], Yax: Vec3 = [0, 1, 0];
const texPi = (x: number) => fmtPi(x).replace(/π/g, '\\pi ').replace(/−/g, '-');
const ease = (u: number) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const PROBES: { v: Vec3; color: string; label: string }[] = [
  { v: [0, 0, 1], color: '#fcd34d', label: '|0⟩' },
  { v: [1, 0, 0], color: '#58c4dd', label: '|+⟩' },
];

/**
 * Any single-qubit gate = one rotation about some axis n̂ = three rotations Rz·Ry·Rz.
 * Pick a gate (axis + angle, or a preset) and watch both decompositions carry the same
 * probe states to the same place.
 */
export function EulerDecomposer() {
  const [nTheta, setNTheta] = useState(Math.PI / 4); // H's axis (x+z)/√2, half-turn
  const [nPhi, setNPhi] = useState(0);
  const [omega, setOmega] = useState(Math.PI);
  const [mode, setMode] = useState<'euler' | 'direct'>('euler');
  const [p, setP] = useState(0); // progress: euler 0..3, direct 0..1
  const [playing, setPlaying] = useState(false);
  /** exact matrix of a chosen preset (keeps its global phase); null when the sliders define U */
  const [preset, setPreset] = useState<Mat2 | null>(GATES.H);
  const raf = useRef(0);

  const n: Vec3 = [Math.sin(nTheta) * Math.cos(nPhi), Math.sin(nTheta) * Math.sin(nPhi), Math.cos(nTheta)];
  const U = useMemo(() => preset ?? Rn(omega, n[0], n[1], n[2]), [preset, omega, n[0], n[1], n[2]]); // eslint-disable-line react-hooks/exhaustive-deps
  const d = useMemo(() => zyz(U), [U]);
  const end = mode === 'euler' ? 3 : 1;

  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  useEffect(() => {
    cancelAnimationFrame(raf.current);
    setPlaying(false);
    setP(0);
  }, [U, mode]);

  const play = () => {
    cancelAnimationFrame(raf.current);
    const t0 = performance.now();
    const dur = end * 1100;
    setPlaying(true);
    const step = () => {
      const u = Math.min(1, (performance.now() - t0) / dur);
      setP(u * end);
      if (u < 1) raf.current = requestAnimationFrame(step);
      else setPlaying(false);
    };
    raf.current = requestAnimationFrame(step);
  };

  const setFromU = (M: Mat2) => {
    const { axis, angle } = axisAngle(M);
    const th = Math.acos(Math.max(-1, Math.min(1, axis[2])));
    let ph = Math.atan2(axis[1], axis[0]);
    if (ph < 0) ph += 2 * Math.PI;
    setNTheta(th);
    setNPhi(Math.sin(th) < 1e-6 ? 0 : ph);
    setOmega(angle);
    setPreset(M);
  };
  const slide = (f: (v: number) => void) => (v: number) => {
    setPreset(null);
    f(v);
  };

  const transform = (v: Vec3): Vec3 => {
    if (mode === 'direct') return rot(v, n, omega * ease(clamp01(p)));
    let w = rot(v, Z, d.delta * ease(clamp01(p)));
    w = rot(w, Yax, d.gamma * ease(clamp01(p - 1)));
    w = rot(w, Z, d.beta * ease(clamp01(p - 2)));
    return w;
  };
  const finals = PROBES.map((pr) => rot(pr.v, n, omega));
  const cur = PROBES.map((pr) => transform(pr.v));
  const seg = mode === 'euler' ? Math.min(2, Math.floor(p)) : -1;
  const activeAxis: Vec3 | null = playing ? (mode === 'direct' ? n : seg === 1 ? Yax : Z) : mode === 'direct' ? n : null;

  const steps = [
    { label: 'R_z(\\delta)', val: d.delta },
    { label: 'R_y(\\gamma)', val: d.gamma },
    { label: 'R_z(\\beta)', val: d.beta },
  ];
  const matTex = `\\begin{pmatrix} ${fmt(U[0], 2)} & ${fmt(U[1], 2)} \\\\ ${fmt(U[2], 2)} & ${fmt(U[3], 2)} \\end{pmatrix}`.replace(/−/g, '-');

  return (
    <Widget title="One turn = three turns: the Z-Y-Z Euler decomposition">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1.1fr) 1fr', gap: 16, alignItems: 'start' }}>
        <div>
          <BlochSphere
            vector={cur[0]}
            color={PROBES[0].color}
            trail
            trailKey={`${mode}-${p === 0}`}
            vectors={[{ v: cur[1], color: PROBES[1].color }]}
            points={[
              { v: finals[0], color: '#fcd34d' },
              { v: finals[1], color: '#58c4dd' },
            ]}
            axis={activeAxis}
            height={330}
          />
          <div className="faint center" style={{ fontSize: '0.78rem' }}>
            yellow arrow = image of |0⟩, blue arrow = image of |+⟩ · dots = where U must send them
          </div>
        </div>
        <div className="col" style={{ gap: 10 }}>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <span className="faint" style={{ fontSize: '0.85rem' }}>gate:</span>
            {PRESETS.map((pr) => (
              <button key={pr.name} className="btn small" onClick={() => setFromU(pr.U())}>
                {pr.name}
              </button>
            ))}
          </div>
          <Slider label={<span>axis tilt <Tex>{'\\theta_n'}</Tex></span>} value={nTheta} min={0} max={Math.PI} step={Math.PI / 48} onChange={slide(setNTheta)} format={fmtPi} />
          <Slider label={<span>axis turn <Tex>{'\\phi_n'}</Tex></span>} value={nPhi} min={0} max={2 * Math.PI} step={Math.PI / 48} onChange={slide(setNPhi)} format={fmtPi} />
          <Slider label={<span>angle <Tex>{'\\omega'}</Tex></span>} value={omega} min={0} max={Math.PI} step={Math.PI / 48} onChange={slide(setOmega)} format={fmtPi} />
          <div className="row" style={{ gap: 8 }}>
            <Segmented
              options={[
                { value: 'euler', label: 'three turns Rz·Ry·Rz' },
                { value: 'direct', label: 'one turn about n̂' },
              ]}
              value={mode}
              onChange={setMode}
            />
            <button className="btn small primary" onClick={play} disabled={playing}>
              ▶ Play
            </button>
          </div>
          <div className="row" style={{ gap: 6, alignItems: 'stretch' }}>
            {mode === 'euler' ? (
              steps.map((s, i) => (
                <div
                  key={i}
                  className="panel"
                  style={{
                    padding: '6px 10px',
                    textAlign: 'center',
                    flex: 1,
                    borderColor: seg === i && playing ? 'var(--yellow)' : p >= i + 1 ? 'var(--green)' : 'var(--border)',
                    transition: 'border-color .2s',
                  }}
                >
                  <Tex>{s.label}</Tex>
                  <div className="mono faint" style={{ fontSize: '0.8rem' }}>
                    {fmtPi(s.val)}
                  </div>
                </div>
              ))
            ) : (
              <div className="panel" style={{ padding: '6px 10px', flex: 1, textAlign: 'center', borderColor: playing ? 'var(--yellow)' : 'var(--border)' }}>
                <Tex>{'R_{\\hat n}(\\omega)'}</Tex>
                <div className="mono faint" style={{ fontSize: '0.8rem' }}>
                  n̂ = ({n.map((x) => x.toFixed(2)).join(', ')}), ω = {fmtPi(omega)}
                </div>
              </div>
            )}
          </div>
          <div className="faint" style={{ fontSize: '0.8rem' }}>(time flows left → right, like a circuit)</div>
          <div style={{ fontSize: '0.95rem' }}>
            <Tex>{`U = ${matTex}`}</Tex>
          </div>
          <div style={{ fontSize: '0.92rem' }}>
            <Tex>{`U = e^{i\\alpha}\\,R_z(\\beta)\\,R_y(\\gamma)\\,R_z(\\delta)`}</Tex>
            <div className="mono faint" style={{ fontSize: '0.8rem', marginTop: 2 }}>
              global phase α = {fmtPi(d.alpha)} {preset ? '' : '(sliders build U with det = 1, so α is 0 or π)'}
            </div>
          </div>
        </div>
      </div>
    </Widget>
  );
}
