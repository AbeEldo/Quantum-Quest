import React, { useEffect, useRef, useState } from 'react';
import { Widget, Slider, Toggle, fmtPi, useAnimationFrame } from '../../../components/ui';
import { c, abs, abs2, arg, scale, mul, phaseColor, type C } from '../../../engine/complex';
import { PhasorClock } from '../../../widgets/AmplitudeView';
import { machZehnder, BS_T, BS_R } from './optics';
import { useInView } from './canvas';

/* geometry (viewBox units) */
const VB_W = 640;
const VB_H = 330;
const YL = 285; // lower arm
const YU = 100; // upper arm
const XS = 30; // source
const X1 = 140; // BS1 / M2 x
const X2 = 450; // M1 / BS2 x
const XPS = 300; // phase shifter
const YB = 192; // bomb / block position on the right vertical leg of the lower arm
const D1 = { x: 575, y: YU };
const D0 = { x: X2, y: 26 };

const L_IN = X1 - XS;
const L_ARM = X2 - X1 + (YL - YU); // both arms equal
const L_BOMB = X2 - X1 + (YL - YB);

type Outcome = 'D0' | 'D1' | 'block';

interface Shot {
  s: number; // distance travelled
  outcome: Outcome;
  collapsed: boolean; // block decision has happened (only when blocked)
  done: number; // time since arrival (−1 = not arrived)
}

function pointOnLower(d: number): [number, number] {
  if (d <= X2 - X1) return [X1 + d, YL];
  return [X2, YL - (d - (X2 - X1))];
}
function pointOnUpper(d: number): [number, number] {
  if (d <= YL - YU) return [X1, YL - d];
  return [X1 + (d - (YL - YU)), YU];
}

function Blob({ x, y, z, scaleR = 1 }: { x: number; y: number; z: C; scaleR?: number }) {
  const m = abs(z);
  if (m < 1e-3) return null;
  const r = (5 + 12 * m) * scaleR;
  const col = phaseColor(arg(z));
  return (
    <g>
      <circle cx={x} cy={y} r={r * 1.9} fill={col} opacity={0.18} />
      <circle cx={x} cy={y} r={r} fill={col} opacity={0.9} />
      <circle cx={x - r * 0.3} cy={y - r * 0.3} r={r * 0.3} fill="#fff" opacity={0.5} />
    </g>
  );
}

function Splitter({ x, y, label, ghost }: { x: number; y: number; label?: string; ghost?: boolean }) {
  return (
    <g opacity={ghost ? 0.25 : 1}>
      <rect x={x - 17} y={y - 4} width={34} height={8} transform={`rotate(-45 ${x} ${y})`} fill="#58c4dd" fillOpacity={0.35} stroke="#58c4dd" strokeDasharray={ghost ? '3 3' : undefined} />
      {label && (
        <text x={x - 30} y={y + 30} fill="#9aa3b5" fontSize={12}>
          {label}
        </text>
      )}
    </g>
  );
}
function Mirror({ x, y }: { x: number; y: number }) {
  return <rect x={x - 18} y={y - 3} width={36} height={6} transform={`rotate(-45 ${x} ${y})`} fill="#c9d1e0" />;
}

function Bomb({ x, y, live, boom }: { x: number; y: number; live: boolean; boom: number }) {
  return (
    <g>
      <circle cx={x + 22} cy={y} r={15} fill={live ? '#222' : '#2b2f3a'} stroke={live ? '#fc6255' : '#6b7385'} strokeWidth={2} />
      <path d={`M ${x + 30} ${y - 12} q 6 -10 14 -6`} stroke="#c49a6c" strokeWidth={2} fill="none" />
      <circle cx={x + 44} cy={y - 18} r={2.5} fill={live ? '#fcd34d' : '#555'} />
      {/* detector "finger" that reaches into the beam */}
      {live && <rect x={x - 6} y={y - 3} width={14} height={6} fill="#fc6255" />}
      <text x={x + 22} y={y + 32} textAnchor="middle" fill={live ? '#fc6255' : '#9aa3b5'} fontSize={11}>
        {live ? 'live bomb' : 'dud'}
      </text>
      {boom > 0 && (
        <g opacity={Math.max(0, 1 - boom / 0.7)}>
          {Array.from({ length: 12 }, (_, k) => {
            const a = (k / 12) * 2 * Math.PI;
            const r0 = 10 + 80 * boom, r1 = 24 + 120 * boom;
            return <line key={k} x1={x + Math.cos(a) * r0} y1={y + Math.sin(a) * r0} x2={x + Math.cos(a) * r1} y2={y + Math.sin(a) * r1} stroke={k % 2 ? '#fcd34d' : '#ff8c42'} strokeWidth={4} />;
          })}
          <circle cx={x} cy={y} r={20 + 60 * boom} fill="#ff8c42" opacity={0.35} />
        </g>
      )}
    </g>
  );
}

export interface MachZehnderProps {
  title?: string;
  initialPhi?: number;
  /** allow removing the second beam splitter */
  allowRemoveBS2?: boolean;
  /** show a block/absorber toggle in the lower arm */
  allowBlock?: boolean;
  /** bomb-tester mode: the lower arm contains a bomb (live or dud) */
  bomb?: boolean;
  showPhase?: boolean;
  showClocks?: boolean;
}

/**
 * Mach–Zehnder interferometer with a single photon. Beam splitters: t = 1/√2, r = i/√2.
 * Blobs = amplitudes (size ∝ |amp|, colour = phase).
 */
export function MachZehnder({
  title = 'Mach–Zehnder interferometer',
  initialPhi = 0,
  allowRemoveBS2 = true,
  allowBlock = false,
  bomb = false,
  showPhase = true,
  showClocks = true,
}: MachZehnderProps) {
  const [phi, setPhi] = useState(initialPhi);
  const [bs2, setBs2] = useState(true);
  const [block, setBlock] = useState(false);
  const [live, setLive] = useState(true);
  const [auto, setAuto] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [counts, setCounts] = useState({ D0: 0, D1: 0, block: 0 });
  const shot = useRef<Shot | null>(null);
  const boomT = useRef(0);
  const flash = useRef<{ D0: number; D1: number }>({ D0: 0, D1: 0 });
  const [, tick] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const inView = useInView(svgRef);

  const blocked = bomb ? live : block;
  const ph = showPhase ? phi : 0;
  const mz = machZehnder({ phi: ph, bs2, block: blocked });

  useEffect(() => {
    setCounts({ D0: 0, D1: 0, block: 0 });
    shot.current = null;
  }, [phi, bs2, block, live]);

  const fire = () => {
    if (shot.current && shot.current.done < 0) return;
    const u = Math.random();
    let outcome: Outcome;
    if (blocked) outcome = u < 0.5 ? 'block' : u < 0.5 + mz.pD0 ? 'D0' : 'D1';
    else outcome = u < mz.pD0 ? 'D0' : 'D1';
    shot.current = { s: 0, outcome, collapsed: false, done: -1 };
  };

  const total = L_IN + L_ARM + 110;
  useAnimationFrame((dt) => {
    const sh = shot.current;
    if (boomT.current > 0) boomT.current += dt;
    if (boomT.current > 0.8) boomT.current = 0;
    flash.current.D0 = Math.max(0, flash.current.D0 - dt);
    flash.current.D1 = Math.max(0, flash.current.D1 - dt);
    if (sh) {
      if (sh.done < 0) {
        sh.s += dt * 420 * speed;
        if (blocked && !sh.collapsed && sh.s >= L_IN + L_BOMB) {
          sh.collapsed = true;
          if (sh.outcome === 'block') {
            sh.done = 0;
            boomT.current = 0.001;
            setCounts((k) => ({ ...k, block: k.block + 1 }));
          }
        }
        if (sh.done < 0 && sh.s >= total) {
          sh.done = 0;
          flash.current[sh.outcome as 'D0' | 'D1'] = 0.5;
          setCounts((k) => ({ ...k, [sh.outcome]: k[sh.outcome] + 1 }));
        }
      } else {
        sh.done += dt * speed;
        if (sh.done > 0.35 && auto) fire();
      }
    } else if (auto) fire();
    tick((k) => (k + 1) % 1000000);
  }, inView);

  /* ---------- static beams (steady-state amplitudes) ---------- */
  const beam = (pts: [number, number][], z: C, key: string) => {
    const m = abs(z);
    if (m < 1e-6) return null;
    return (
      <polyline key={key} points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={phaseColor(arg(z))} strokeWidth={2 + 7 * m * m} strokeOpacity={0.35} strokeLinejoin="round" />
    );
  };
  const lowerBefore = BS_T;
  const lowerAfter = mz.lower;
  const lowerToBomb = blocked ? scale(lowerBefore, 1) : lowerAfter;
  void lowerToBomb;

  /* ---------- blobs for the current shot ---------- */
  const blobs: React.ReactNode[] = [];
  const sh = shot.current;
  if (sh && sh.done < 0) {
    const s = sh.s;
    if (s < L_IN) {
      blobs.push(<Blob key="in" x={XS + s} y={YL} z={c(1)} />);
    } else if (s < L_IN + L_ARM) {
      const d = s - L_IN;
      const afterPS = d > XPS - X1;
      let lowAmp = afterPS ? mul(BS_T, c(Math.cos(ph), Math.sin(ph))) : BS_T;
      let upAmp = BS_R;
      if (blocked && sh.collapsed) {
        // the photon was not found at the bomb: its amplitude is entirely in the upper arm
        lowAmp = c(0);
        upAmp = c(0, 1);
      }
      const [lx, ly] = pointOnLower(d);
      const [ux, uy] = pointOnUpper(d);
      blobs.push(<Blob key="lo" x={lx} y={ly} z={lowAmp} />);
      blobs.push(<Blob key="up" x={ux} y={uy} z={upAmp} />);
    } else {
      const f = (s - L_IN - L_ARM) / 110;
      let a1 = mz.d1, a0 = mz.d0;
      if (blocked && sh.collapsed) {
        // renormalised: only the upper path survived
        a1 = bs2 ? mul(c(0, 1), BS_T) : c(0, 1);
        a0 = bs2 ? mul(c(0, 1), BS_R) : c(0);
      }
      blobs.push(<Blob key="d1" x={X2 + (D1.x - X2) * f} y={YU} z={a1} />);
      blobs.push(<Blob key="d0" x={X2} y={YU + (D0.y - YU) * f} z={a0} />);
    }
  }

  const tot = counts.D0 + counts.D1 + counts.block;
  const pct = (k: number) => (tot ? ((100 * k) / tot).toFixed(0) + '%' : '—');

  const Det = ({ x, y, label, p, n, fl, rot }: { x: number; y: number; label: string; p: number; n: number; fl: number; rot?: boolean }) => (
    <g>
      <rect x={x - 16} y={y - 16} width={32} height={32} rx={8} fill={fl > 0 ? '#fcd34d' : '#1d2230'} fillOpacity={fl > 0 ? 0.3 + fl : 1} stroke="#83c167" strokeWidth={2} />
      <text x={x} y={y + 5} textAnchor="middle" fill="#e9ecf2" fontSize={13} fontWeight={700}>
        {n}
      </text>
      <text x={rot ? x + 26 : x} y={rot ? y + 4 : y + 34} textAnchor={rot ? 'start' : 'middle'} fill="#83c167" fontSize={12}>
        {label} · {(p * 100).toFixed(0)}%
      </text>
    </g>
  );

  return (
    <Widget title={title}>
      <svg ref={svgRef} viewBox={`0 0 ${VB_W} ${VB_H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <rect x={0} y={0} width={VB_W} height={VB_H} rx={10} fill="#0a0d14" />
        {/* steady-state beams */}
        {beam([[XS, YL], [X1, YL]], c(1), 'in')}
        {beam([[X1, YL], [XPS, YL]], lowerBefore, 'l1')}
        {beam(blocked ? [[XPS, YL], [X2, YL], [X2, YB]] : [[XPS, YL], [X2, YL], [X2, YU]], lowerAfter.re === 0 && lowerAfter.im === 0 ? mul(BS_T, c(Math.cos(ph), Math.sin(ph))) : lowerAfter, 'l2')}
        {beam([[X1, YL], [X1, YU], [X2, YU]], BS_R, 'u')}
        {beam([[X2, YU], [D1.x, YU]], mz.d1, 'o1')}
        {beam([[X2, YU], [X2, D0.y]], mz.d0, 'o0')}
        {/* components */}
        <rect x={XS - 20} y={YL - 14} width={24} height={28} rx={4} fill="#1d2230" stroke="#3a4256" />
        <text x={XS - 22} y={YL + 32} fill="#9aa3b5" fontSize={12}>
          single-photon source
        </text>
        <Splitter x={X1} y={YL} label="BS1" />
        <Mirror x={X2} y={YL} />
        <Mirror x={X1} y={YU} />
        <Splitter x={X2} y={YU} label={bs2 ? 'BS2' : 'BS2 removed'} ghost={!bs2} />
        {showPhase && (
          <g>
            <rect x={XPS - 9} y={YL - 22} width={18} height={44} rx={3} fill={phaseColor(ph)} fillOpacity={0.25 + 0.25 * (ph / (2 * Math.PI))} stroke={phaseColor(ph)} />
            <text x={XPS} y={YL + 40} textAnchor="middle" fill="#e9ecf2" fontSize={12}>
              φ = {fmtPi(ph)}
            </text>
          </g>
        )}
        {bomb && <Bomb x={X2} y={YB} live={live} boom={boomT.current} />}
        {!bomb && block && (
          <g>
            <rect x={X2 - 14} y={YB - 8} width={28} height={16} rx={3} fill="#3a2020" stroke="#fc6255" />
            <text x={X2 + 20} y={YB + 4} fill="#fc6255" fontSize={11}>
              absorber
            </text>
          </g>
        )}
        <text x={(X1 + X2) / 2} y={YU - 12} textAnchor="middle" fill="#6b7385" fontSize={11}>
          upper arm (reflected at BS1)
        </text>
        <text x={(X1 + XPS) / 2 - 10} y={YL - 12} textAnchor="middle" fill="#6b7385" fontSize={11}>
          lower arm (transmitted)
        </text>
        <Det x={D1.x} y={D1.y} label="D₁" p={mz.pD1} n={counts.D1} fl={flash.current.D1} />
        <Det x={D0.x} y={D0.y} label="D₀" p={mz.pD0} n={counts.D0} fl={flash.current.D0} rot />
        {blobs}
      </svg>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginTop: 10 }}>
        <div className="col" style={{ gap: 8 }}>
          {showPhase && <Slider label="phase shift φ" value={phi} min={0} max={2 * Math.PI} step={Math.PI / 48} onChange={setPhi} format={fmtPi} />}
          <Slider label="speed" value={speed} min={0.3} max={4} step={0.1} onChange={setSpeed} format={(v) => `${v.toFixed(1)}×`} />
          <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
            {allowRemoveBS2 && <Toggle label="second beam splitter" value={bs2} onChange={setBs2} />}
            {allowBlock && !bomb && <Toggle label="absorber in lower arm" value={block} onChange={setBlock} />}
            {bomb && <Toggle label="bomb is live" value={live} onChange={setLive} />}
          </div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button className="btn small primary" onClick={fire}>
              Fire one photon
            </button>
            <button className={`btn small ${auto ? 'active' : ''}`} onClick={() => setAuto((a) => !a)}>
              {auto ? '⏸ Stop' : '▶ Auto-fire'}
            </button>
            <button className="btn small ghost" onClick={() => setCounts({ D0: 0, D1: 0, block: 0 })}>
              Reset
            </button>
          </div>
          <div className="mono" style={{ fontSize: '0.85rem' }}>
            D₁: {counts.D1} ({pct(counts.D1)}) · D₀: {counts.D0} ({pct(counts.D0)})
            {blocked ? ` · ${bomb ? '💥' : 'absorbed'}: ${counts.block} (${pct(counts.block)})` : ''}
          </div>
        </div>
        {showClocks && (
          <div className="col" style={{ gap: 6 }}>
            <div className="faint" style={{ fontSize: '0.82rem' }}>Amplitude arriving at each detector = sum over the two paths</div>
            {(
              [
                ['D₁', mz.d1Paths, mz.d1, mz.pD1],
                ['D₀', mz.d0Paths, mz.d0, mz.pD0],
              ] as [string, [C, C], C, number][]
            ).map(([name, paths, sum, p]) => (
              <div key={name} className="row" style={{ gap: 8 }}>
                <b style={{ width: 26 }}>{name}</b>
                <div className="col" style={{ alignItems: 'center', gap: 0 }}>
                  <PhasorClock z={paths[0]} size={38} />
                  <span className="faint" style={{ fontSize: '0.68rem' }}>upper</span>
                </div>
                <span className="dim">+</span>
                <div className="col" style={{ alignItems: 'center', gap: 0 }}>
                  <PhasorClock z={paths[1]} size={38} />
                  <span className="faint" style={{ fontSize: '0.68rem' }}>lower</span>
                </div>
                <span className="dim">=</span>
                <PhasorClock z={sum} size={38} />
                <span className="mono" style={{ fontSize: '0.85rem' }}>
                  P = {(abs2(sum) * 100).toFixed(1)}%
                </span>
              </div>
            ))}
            {blocked && (
              <div className="faint" style={{ fontSize: '0.8rem' }}>
                With the lower arm blocked there is no lower-path amplitude: the photon is absorbed with probability 50%; otherwise only the upper path contributes.
              </div>
            )}
          </div>
        )}
      </div>
    </Widget>
  );
}
