import React, { useEffect, useRef, useState } from 'react';
import { Widget, Slider, Toggle, useAnimationFrame } from '../../../components/ui';
import { useChallengeGate } from '../../../components/lesson/gates';
import { useProgress } from '../../../state/progress';
import { chainTransmission, malus } from './optics';
import { useInView } from './canvas';

const VB_W = 800;
const VB_H = 250;
const CY = 112;
const SRC_X = 46;
const DET_X = 748;
const R = 40;
const DEG = Math.PI / 180;

interface Photon {
  id: number;
  x: number;
  pol: number | null; // radians, null = unpolarized
  next: number; // index of next polarizer
  dead?: number; // time since absorbed
  detected?: number; // time since detected
}

interface Pol {
  id: number;
  deg: number;
  locked?: boolean;
}

let PID = 1;

/**
 * A beam of photons passing through a chain of polarizers whose angles you can drag.
 * Each photon passes a polarizer with probability cos²(Δ) and leaves polarized along the polarizer's axis.
 */
export function PolarizerChain({
  initial = [0, 90],
  source: initialSource = 'unpolarized',
  maxPolarizers = 4,
  title = 'Polarizer bench',
  challengeId,
  goal = 0.4,
  presets = true,
}: {
  initial?: number[];
  source?: 'unpolarized' | 'H';
  maxPolarizers?: number;
  title?: string;
  /** Challenge: first (0°) and last (90°) are locked; get relative transmission ≥ goal. */
  challengeId?: string;
  goal?: number;
  presets?: boolean;
}) {
  const [pols, setPols] = useState<Pol[]>(() =>
    initial.map((deg, i) => ({ id: PID++, deg, locked: !!challengeId && (i === 0 || i === initial.length - 1) })),
  );
  const [source, setSource] = useState<'unpolarized' | 'H'>(initialSource);
  const [rate, setRate] = useState(6);
  const [running, setRunning] = useState(true);
  const [stats, setStats] = useState({ emitted: 0, detected: 0 });
  const photons = useRef<Photon[]>([]);
  const acc = useRef(0);
  const absorbed = useRef<{ x: number; t: number }[]>([]);
  const [, force] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const inView = useInView(svgRef);
  const dragging = useRef<number | null>(null);

  const n = pols.length;
  const xs = pols.map((_, i) => 150 + ((DET_X - 110 - 150) * (i + 0.5)) / Math.max(1, n));
  const axes = pols.map((p) => p.deg * DEG);
  const T = chainTransmission(source === 'H' ? 0 : null, axes);
  // relative transmission (after the first polarizer) used for the challenge
  const Trel = n >= 2 ? chainTransmission(axes[0], axes.slice(1)) : 1;
  const solved = !!challengeId && Trel >= goal - 1e-9 && n >= 2;
  useChallengeGate(challengeId ?? 'none', challengeId ? solved : true);
  const recordQuiz = useProgress((s) => s.recordQuiz);
  useEffect(() => {
    if (solved && challengeId) recordQuiz(challengeId, true, 30);
  }, [solved, challengeId, recordQuiz]);

  const resetStats = () => {
    photons.current = [];
    absorbed.current = [];
    setStats({ emitted: 0, detected: 0 });
  };
  useEffect(resetStats, [pols.length, source]); // eslint-disable-line react-hooks/exhaustive-deps

  const speed = 260; // viewBox units per second
  useAnimationFrame((dt) => {
    let emitted = 0, detected = 0;
    if (running) {
      acc.current += rate * dt;
      while (acc.current >= 1) {
        acc.current -= 1;
        photons.current.push({ id: PID++, x: SRC_X + 14, pol: source === 'H' ? 0 : null, next: 0 });
        emitted++;
      }
    }
    for (const p of photons.current) {
      if (p.dead !== undefined) {
        p.dead += dt;
        continue;
      }
      if (p.detected !== undefined) {
        p.detected += dt;
        continue;
      }
      const nx = p.x + speed * dt;
      while (p.next < n && nx >= xs[p.next]) {
        const ax = axes[p.next];
        const pass = p.pol === null ? 0.5 : malus(p.pol, ax);
        if (Math.random() < pass) {
          p.pol = ax;
          p.next++;
        } else {
          p.dead = 0;
          p.x = xs[p.next];
          absorbed.current.push({ x: xs[p.next], t: 0 });
          break;
        }
      }
      if (p.dead === undefined) {
        p.x = nx;
        if (p.x >= DET_X - 18) {
          p.detected = 0;
          detected++;
        }
      }
    }
    photons.current = photons.current.filter((p) => (p.dead ?? 0) < 0.35 && (p.detected ?? 0) < 0.25);
    absorbed.current.forEach((a) => (a.t += dt));
    absorbed.current = absorbed.current.filter((a) => a.t < 0.4);
    if (emitted || detected) setStats((s) => ({ emitted: s.emitted + emitted, detected: s.detected + detected }));
    force((k) => (k + 1) % 1000000);
  }, inView);

  const toSvg = (e: React.PointerEvent) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = pt.matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  const onDown = (i: number) => (e: React.PointerEvent) => {
    if (pols[i].locked) return;
    dragging.current = i;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    onMove(e);
  };
  const onMove = (e: React.PointerEvent) => {
    const i = dragging.current;
    if (i === null) return;
    const p = toSvg(e);
    let ang = Math.atan2(-(p.y - CY), p.x - xs[i]) / DEG;
    ang = ((ang % 180) + 180) % 180;
    const snapped = Math.round(ang);
    setPols((ps) => ps.map((q, k) => (k === i ? { ...q, deg: snapped } : q)));
  };
  const onUp = () => {
    dragging.current = null;
  };

  const setDeg = (i: number, deg: number) => setPols((ps) => ps.map((q, k) => (k === i ? { ...q, deg } : q)));
  const addPol = () => {
    if (n >= maxPolarizers) return;
    setPols((ps) => {
      if (challengeId) {
        // insert before the locked last polarizer
        const mid = Math.round((ps[ps.length - 2].deg + ps[ps.length - 1].deg) / 2);
        return [...ps.slice(0, -1), { id: PID++, deg: mid }, ps[ps.length - 1]];
      }
      return [...ps, { id: PID++, deg: 45 }];
    });
  };
  const removePol = (i: number) => setPols((ps) => ps.filter((_, k) => k !== i));
  const preset = (degs: number[], src: 'unpolarized' | 'H') => {
    setPols(degs.map((deg) => ({ id: PID++, deg })));
    setSource(src);
  };

  // expected intensity along the bench (beam band thickness)
  const segT: number[] = [1];
  {
    let t = 1;
    for (let i = 0; i < n; i++) {
      t *= i === 0 ? (source === 'H' ? malus(0, axes[0]) : 0.5) : malus(axes[i - 1], axes[i]);
      segT.push(t);
    }
  }
  const segX = [SRC_X + 14, ...xs, DET_X - 18];

  const measured = stats.emitted > 0 ? stats.detected / stats.emitted : 0;

  return (
    <Widget title={title}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        style={{ width: '100%', height: 'auto', display: 'block', touchAction: 'none', userSelect: 'none' }}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      >
        <defs>
          <radialGradient id="pc-lamp" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff7c2" />
            <stop offset="100%" stopColor="#f0ac5f" stopOpacity={0} />
          </radialGradient>
        </defs>
        <rect x={0} y={0} width={VB_W} height={VB_H} fill="#0a0d14" rx={10} />
        {/* beam bands */}
        {segX.slice(0, -1).map((x0, i) => (
          <rect
            key={i}
            x={x0}
            y={CY - 14 * Math.sqrt(segT[i])}
            width={segX[i + 1] - x0}
            height={28 * Math.sqrt(segT[i])}
            fill="#fcd34d"
            opacity={0.08 + 0.12 * segT[i]}
          />
        ))}
        {/* source */}
        <circle cx={SRC_X} cy={CY} r={26} fill="url(#pc-lamp)" />
        <rect x={SRC_X - 16} y={CY - 16} width={22} height={32} rx={4} fill="#1d2230" stroke="#3a4256" />
        <text x={SRC_X - 30} y={CY + 46} fill="#9aa3b5" fontSize={12}>
          {source === 'H' ? 'laser (H-polarized)' : 'lamp (unpolarized)'}
        </text>
        {/* polarizers */}
        {pols.map((p, i) => {
          const x = xs[i];
          const lines = [];
          for (let k = -4; k <= 4; k++) {
            const off = (k * R) / 5;
            const half = Math.sqrt(Math.max(0, R * R - off * off)) - 2;
            lines.push(<line key={k} x1={-half} y1={off} x2={half} y2={off} stroke="#58c4dd" strokeOpacity={0.45} strokeWidth={1.2} />);
          }
          return (
            <g key={p.id} style={{ cursor: p.locked ? 'not-allowed' : 'grab' }} onPointerDown={onDown(i)}>
              <circle cx={x} cy={CY} r={R + 4} fill="#11141c" stroke={p.locked ? '#6b7385' : '#29abca'} strokeWidth={2} />
              <g transform={`translate(${x} ${CY}) rotate(${-p.deg})`}>
                {lines}
                <line x1={-R - 10} y1={0} x2={R + 10} y2={0} stroke="#fcd34d" strokeWidth={2.5} />
                <polygon points={`${R + 14},0 ${R + 6},-5 ${R + 6},5`} fill="#fcd34d" />
                <polygon points={`${-R - 14},0 ${-R - 6},-5 ${-R - 6},5`} fill="#fcd34d" />
              </g>
              <text x={x} y={CY + R + 28} textAnchor="middle" fill="#e9ecf2" fontSize={14} fontWeight={600}>
                {p.deg}°{p.locked ? ' 🔒' : ''}
              </text>
            </g>
          );
        })}
        {/* photons */}
        {photons.current.map((p) => {
          const fade = p.dead !== undefined ? 1 - p.dead / 0.35 : p.detected !== undefined ? 1 - p.detected / 0.25 : 1;
          const col = p.dead !== undefined ? '#fc6255' : '#fff3b0';
          return (
            <g key={p.id} transform={`translate(${p.x} ${CY})`} opacity={fade}>
              {p.pol === null ? (
                <>
                  <circle r={7} fill="none" stroke={col} strokeOpacity={0.5} strokeDasharray="2 2" />
                  <circle r={3} fill={col} />
                </>
              ) : (
                <>
                  <line x1={-9 * Math.cos(p.pol)} y1={9 * Math.sin(p.pol)} x2={9 * Math.cos(p.pol)} y2={-9 * Math.sin(p.pol)} stroke={col} strokeWidth={2} />
                  <circle r={3} fill={col} />
                </>
              )}
            </g>
          );
        })}
        {absorbed.current.map((a, k) => (
          <circle key={k} cx={a.x} cy={CY} r={6 + 30 * a.t} fill="none" stroke="#fc6255" strokeOpacity={1 - a.t / 0.4} />
        ))}
        {/* detector */}
        <rect x={DET_X - 18} y={CY - 30} width={26} height={60} rx={5} fill="#1d2230" stroke="#83c167" strokeWidth={2} />
        <text x={DET_X - 5} y={CY + 50} textAnchor="middle" fill="#83c167" fontSize={12}>
          detector
        </text>
        <text x={DET_X - 5} y={CY - 38} textAnchor="middle" fill="#e9ecf2" fontSize={13} fontWeight={700}>
          {stats.detected}
        </text>
        <text x={14} y={22} fill="#9aa3b5" fontSize={12}>
          drag a polarizer to rotate it · yellow arrow = transmission axis · photon tick = its polarization
        </text>
      </svg>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '4px 18px', marginTop: 8 }}>
        {pols.map((p, i) => (
          <div key={p.id} className="row" style={{ gap: 6 }}>
            <div style={{ flex: 1 }}>
              <Slider label={`P${i + 1}`} value={p.deg} min={0} max={180} step={1} onChange={(v) => !p.locked && setDeg(i, v)} disabled={p.locked} format={(v) => `${v.toFixed(0)}°`} />
            </div>
            {!p.locked && n > 1 && (
              <button className="btn small ghost" title="remove" onClick={() => removePol(i)}>
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
        <button className="btn small" disabled={n >= maxPolarizers} onClick={addPol}>
          + polarizer
        </button>
        {!challengeId && <Toggle label="polarized laser source" value={source === 'H'} onChange={(v) => setSource(v ? 'H' : 'unpolarized')} />}
        <div style={{ minWidth: 220 }}>
          <Slider label="photons/s" value={rate} min={1} max={40} step={1} onChange={setRate} format={(v) => v.toFixed(0)} />
        </div>
        <button className="btn small" onClick={() => setRunning((r) => !r)}>
          {running ? '⏸ Pause' : '▶ Run'}
        </button>
        <button className="btn small ghost" onClick={resetStats}>
          Reset counts
        </button>
      </div>
      {presets && !challengeId && (
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          <span className="faint" style={{ fontSize: '0.85rem' }}>Presets:</span>
          <button className="btn small ghost" onClick={() => preset([30], 'H')}>Malus (laser + 30°)</button>
          <button className="btn small ghost" onClick={() => preset([0, 90], 'unpolarized')}>Crossed pair</button>
          <button className="btn small ghost" onClick={() => preset([0, 45, 90], 'unpolarized')}>Three-polarizer paradox</button>
          <button className="btn small ghost" onClick={() => preset([0, 30, 60, 90], 'unpolarized')}>Staircase</button>
        </div>
      )}
      <div className="row" style={{ gap: 22, marginTop: 10, flexWrap: 'wrap' }}>
        <span>
          emitted <b className="mono">{stats.emitted}</b>
        </span>
        <span>
          detected <b className="mono">{stats.detected}</b>
        </span>
        <span>
          measured fraction <b className="mono" style={{ color: 'var(--yellow)' }}>{(measured * 100).toFixed(1)}%</b>
        </span>
        <span>
          predicted <b className="mono" style={{ color: 'var(--green)' }}>{(T * 100).toFixed(1)}%</b>
        </span>
      </div>
      {challengeId && (
        <div className="panel" style={{ marginTop: 10, borderColor: solved ? 'var(--green)' : 'var(--border)' }}>
          {solved ? '✅ ' : '🎯 '}Of the photons that make it through the first (0°) polarizer, get at least <b>{(goal * 100).toFixed(0)}%</b> to reach the
          detector through the final 90° polarizer. You may add polarizers in between. Right now:{' '}
          <b className="mono" style={{ color: solved ? 'var(--green)' : 'var(--yellow)' }}>{(Trel * 100).toFixed(1)}%</b>
        </div>
      )}
    </Widget>
  );
}
