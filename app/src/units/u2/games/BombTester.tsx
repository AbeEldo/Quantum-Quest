import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RichText, ProgressBar, Segmented, Slider, Stat, Tex } from '../../../components/ui';
import { useGame, GameOverlay, HowToPlay } from '../../../components/game';
import {
  BUDGET,
  PRIOR_LIVE,
  PTS,
  SHIFT_SIZE,
  evProbs,
  makeShift,
  maxScore,
  posteriorLive,
  sampleEV,
  sampleZeno,
  zenoSurvive,
} from './bombEngine';

const GAME_ID = 'bomb-tester';

type Mode = 'ev' | 'zeno';
type EVPlan = { mode: 'ev'; live: boolean; outcome: 'boom' | 'dark' | 'bright' };
type ZPlan = { mode: 'zeno'; live: boolean; N: number; failAt: number | null };
type Plan = EVPlan | ZPlan;

type Resolution = 'certified' | 'dudFound' | 'boom' | 'shipLiveLucky' | 'shipDud' | 'scrapDud' | 'scrapLive';
interface LogEntry {
  live: boolean;
  res: Resolution;
  pts: number;
}

const CSS = `
@keyframes qqbt-shake { 0%,100% { transform: translate(0,0) } 20% { transform: translate(-7px,3px) } 40% { transform: translate(6px,-4px) } 60% { transform: translate(-4px,-2px) } 80% { transform: translate(3px,2px) } }
.qqbt-shake { animation: qqbt-shake .45s ease-out; }
@keyframes qqbt-pop { from { transform: scale(.6); opacity: 0 } to { transform: scale(1); opacity: 1 } }
.qqbt-pop { animation: qqbt-pop .3s cubic-bezier(.2,.9,.3,1.3); }
`;

/* ------------------------------ geometry utils ----------------------------- */
type Pt = [number, number];
function polyLen(p: Pt[]) {
  let L = 0;
  for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  return L;
}
function along(p: Pt[], f: number): Pt {
  const L = polyLen(p) * Math.max(0, Math.min(1, f));
  let acc = 0;
  for (let i = 1; i < p.length; i++) {
    const s = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    if (acc + s >= L) {
      const t = s ? (L - acc) / s : 0;
      return [p[i - 1][0] + t * (p[i][0] - p[i - 1][0]), p[i - 1][1] + t * (p[i][1] - p[i - 1][1])];
    }
    acc += s;
  }
  return p[p.length - 1];
}
const pts = (p: Pt[]) => p.map((q) => q.join(',')).join(' ');
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);

function Photon({ at, amp = 1, color = '#fff3b0' }: { at: Pt; amp?: number; color?: string }) {
  if (amp < 0.02) return null;
  return (
    <g>
      <circle cx={at[0]} cy={at[1]} r={16 * amp} fill={color} opacity={0.18 * amp} />
      <circle cx={at[0]} cy={at[1]} r={9 * amp} fill={color} opacity={0.4 * amp} />
      <circle cx={at[0]} cy={at[1]} r={4.5 * Math.max(0.4, amp)} fill="#fff" opacity={Math.min(1, 0.3 + amp)} />
    </g>
  );
}

function Explosion({ at, k }: { at: Pt; k: number }) {
  // k in [0,1]
  if (k <= 0 || k >= 1) return null;
  const e = ease(k);
  return (
    <g pointerEvents="none">
      <circle cx={at[0]} cy={at[1]} r={10 + 70 * e} fill="#ff8c42" opacity={0.55 * (1 - k)} />
      <circle cx={at[0]} cy={at[1]} r={6 + 45 * e} fill="#fcd34d" opacity={0.7 * (1 - k)} />
      <circle cx={at[0]} cy={at[1]} r={14 + 95 * e} fill="none" stroke="#fc6255" strokeWidth={4 * (1 - k)} opacity={1 - k} />
      {Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * 2 * Math.PI + 0.3;
        return <line key={i} x1={at[0] + Math.cos(a) * 18 * e} y1={at[1] + Math.sin(a) * 18 * e} x2={at[0] + Math.cos(a) * (30 + 70 * e)} y2={at[1] + Math.sin(a) * (30 + 70 * e)} stroke="#fcd34d" strokeWidth={2.5} opacity={1 - k} />;
      })}
    </g>
  );
}

function BombSprite({ at, reveal, exploded }: { at: Pt; reveal: null | boolean; exploded: boolean }) {
  const [x, y] = at;
  if (exploded)
    return (
      <g>
        <ellipse cx={x} cy={y + 14} rx={26} ry={6} fill="#222" />
        <text x={x} y={y + 6} textAnchor="middle" fontSize={22}>
          💨
        </text>
      </g>
    );
  return (
    <g>
      <rect x={x - 26} y={y - 4} width={52} height={24} rx={3} fill="#3b2f22" stroke="#8b6c4c" />
      <circle cx={x} cy={y - 8} r={15} fill="#1a1d27" stroke={reveal === true ? '#fc6255' : reveal === false ? '#83c167' : '#4a5164'} strokeWidth={2} />
      <path d={`M ${x + 8} ${y - 20} q 7 -9 14 -6`} stroke="#c49a6c" strokeWidth={2.5} fill="none" />
      {reveal === true && <circle cx={x + 22} cy={y - 26} r={3.5} fill="#fcd34d" />}
      <text x={x} y={y - 3} textAnchor="middle" fontSize={13} fontWeight={800} fill={reveal === null ? '#9aa3b5' : reveal ? '#fc6255' : '#83c167'}>
        {reveal === null ? '?' : reveal ? 'LIVE' : 'DUD'}
      </text>
      {/* the bomb's photon detector */}
      <rect x={x - 6} y={y - 30} width={12} height={8} rx={2} fill="#2a3142" stroke="#58c4dd" strokeWidth={1} />
    </g>
  );
}

/* --------------------------------- EV scene -------------------------------- */
const EV = {
  SRC: [26, 230] as Pt,
  BS1: [120, 230] as Pt,
  M1: [120, 92] as Pt,
  BS2: [420, 92] as Pt,
  M2: [420, 230] as Pt,
  BOMB: [270, 230] as Pt,
  C: [540, 92] as Pt,
  D: [420, 26] as Pt,
};
const evIn: Pt[] = [EV.SRC, EV.BS1];
const evUp: Pt[] = [EV.BS1, EV.M1, EV.BS2];
const evLow: Pt[] = [EV.BS1, EV.BOMB, EV.M2, EV.BS2];
const evOutC: Pt[] = [EV.BS2, EV.C];
const evOutD: Pt[] = [EV.BS2, EV.D];
const FB = 150 / polyLen(evLow); // fraction of lower arm at which the bomb sits
const EV_T = { inn: 0.45, arms: 0.95, out: 0.6, boom: 0.8 };
function evDuration(p: EVPlan) {
  return p.outcome === 'boom' ? EV_T.inn + EV_T.arms * FB + EV_T.boom : EV_T.inn + EV_T.arms + EV_T.out + 0.25;
}

function Splitter({ at, o = 0, pol = false }: { at: Pt; o?: number; pol?: boolean }) {
  return (
    <g transform={`rotate(${o === 0 ? -45 : 45} ${at[0]} ${at[1]})`}>
      <rect x={at[0] - 20} y={at[1] - 4} width={40} height={8} rx={2} fill={pol ? 'rgba(224,122,182,.3)' : 'rgba(88,196,221,.3)'} stroke={pol ? '#e07ab6' : '#9fe3f2'} strokeWidth={1.5} />
    </g>
  );
}
function Mirror({ at, o = 0 }: { at: Pt; o?: number }) {
  const r = 17;
  const [x1, y1, x2, y2] = o === 0 ? [at[0] - r, at[1] + r, at[0] + r, at[1] - r] : [at[0] - r, at[1] - r, at[0] + r, at[1] + r];
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#eef3fa" strokeWidth={4.5} strokeLinecap="round" />;
}
function Lamp({ at, label, sub, lit, color }: { at: Pt; label: string; sub?: string; lit: number; color: string }) {
  return (
    <g>
      {lit > 0 && <circle cx={at[0]} cy={at[1]} r={22 + 18 * lit} fill={color} opacity={0.25 * lit} />}
      <circle cx={at[0]} cy={at[1]} r={17} fill={lit > 0 ? color : '#161a24'} fillOpacity={lit > 0 ? 0.35 + 0.65 * lit : 1} stroke={color} strokeWidth={2} />
      <text x={at[0]} y={at[1] + 5} textAnchor="middle" fontSize={14} fontWeight={800} fill="#e9ecf2">
        {label}
      </text>
      {sub && (
        <text x={at[0]} y={at[1] + 33} textAnchor="middle" fontSize={10.5} fill="#9aa3b5">
          {sub}
        </text>
      )}
    </g>
  );
}

function EVScene({ plan, t, reveal, blown }: { plan: EVPlan | null; t: number; reveal: null | boolean; blown: boolean }) {
  let photons: React.ReactNode[] = [];
  let boomK = 0;
  let litC = 0, litD = 0;
  let exploded = false;
  if (plan) {
    const t1 = EV_T.inn, t2 = t1 + EV_T.arms, t3 = t2 + EV_T.out;
    if (t < t1) photons.push(<Photon key="in" at={along(evIn, t / t1)} />);
    else if (t < t2 || plan.outcome === 'boom') {
      const f = Math.min((t - t1) / EV_T.arms, plan.outcome === 'boom' ? FB : 1);
      const past = f >= FB;
      if (!plan.live) {
        photons.push(<Photon key="u" at={along(evUp, f)} amp={Math.SQRT1_2} />, <Photon key="l" at={along(evLow, f)} amp={Math.SQRT1_2} />);
      } else if (plan.outcome === 'boom') {
        if (!past) photons.push(<Photon key="u" at={along(evUp, f)} amp={Math.SQRT1_2} />, <Photon key="l" at={along(evLow, f)} amp={Math.SQRT1_2} />);
        else {
          boomK = (t - (t1 + EV_T.arms * FB)) / EV_T.boom;
          exploded = boomK > 0.15;
        }
      } else {
        // the bomb "looked" and found nothing: amplitude collapses into the upper arm
        const grow = past ? Math.min(1, Math.SQRT1_2 + (f - FB) * 3) : Math.SQRT1_2;
        photons.push(<Photon key="u" at={along(evUp, f)} amp={grow} />);
        if (!past) photons.push(<Photon key="l" at={along(evLow, f)} amp={Math.SQRT1_2} />);
        else if (f - FB < 0.08) photons.push(<circle key="puff" cx={EV.BOMB[0]} cy={EV.BOMB[1]} r={10 + (f - FB) * 200} fill="none" stroke="#58c4dd" opacity={1 - (f - FB) / 0.08} />);
      }
    } else if (t < t3) {
      const f = (t - t2) / EV_T.out;
      if (!plan.live) photons.push(<Photon key="c" at={along(evOutC, f)} />);
      else {
        photons.push(<Photon key="c" at={along(evOutC, f)} amp={Math.SQRT1_2} />, <Photon key="d" at={along(evOutD, f)} amp={Math.SQRT1_2} />);
      }
    } else {
      const k = clamp01(1 - (t - t3) / 1.2);
      if (plan.outcome === 'dark') litD = 0.4 + 0.6 * k;
      else litC = 0.4 + 0.6 * k;
    }
  }
  return (
    <svg viewBox="0 0 600 280" style={{ width: '100%', display: 'block' }}>
      <rect x={0} y={0} width={600} height={280} rx={12} fill="#0e1118" />
      {/* beam paths */}
      {[evIn, evUp, evLow, evOutC, evOutD].map((p, i) => (
        <polyline key={i} points={pts(p)} fill="none" stroke="#58c4dd" strokeOpacity={0.18} strokeWidth={6} strokeLinejoin="round" />
      ))}
      <rect x={EV.SRC[0] - 18} y={EV.SRC[1] - 12} width={34} height={24} rx={5} fill="#2b2f3d" stroke="#fc6255" strokeWidth={2} />
      <text x={EV.SRC[0] - 1} y={EV.SRC[1] + 4} textAnchor="middle" fontSize={11} fill="#fca5a0" fontWeight={700}>
        γ
      </text>
      <Splitter at={EV.BS1} />
      <Splitter at={EV.BS2} />
      <Mirror at={EV.M1} />
      <Mirror at={EV.M2} />
      <BombSprite at={EV.BOMB} reveal={reveal} exploded={exploded || blown} />
      <Lamp at={EV.C} label="C" sub="bright port" lit={litC} color="#58c4dd" />
      <Lamp at={EV.D} label="D" sub="" lit={litD} color="#83c167" />
      <text x={EV.D[0] + 28} y={EV.D[1] + 5} fontSize={10.5} fill="#9aa3b5">
        dark port
      </text>
      {photons}
      <Explosion at={EV.BOMB} k={boomK} />
    </svg>
  );
}

/* -------------------------------- Zeno scene ------------------------------- */
const Z = {
  SRC: [22, 100] as Pt,
  START: [70, 100] as Pt,
  ROT: [160, 100] as Pt,
  PBS1: [250, 100] as Pt,
  PBS2: [400, 100] as Pt,
  BOMB: [325, 38] as Pt,
  EXIT: [480, 100] as Pt,
  OUT: [520, 100] as Pt,
  DIAL: [300, 178] as Pt,
};
const zTop: Pt[] = [Z.START, [480, 100]];
const zReturn: Pt[] = [[480, 100], [505, 125], [505, 215], [480, 240], [70, 240], [45, 215], [45, 125], Z.START];
const zV: Pt[] = [Z.PBS1, [250, 38], [400, 38], Z.PBS2];
const zExit: Pt[] = [[480, 100], Z.OUT];
const zIn: Pt[] = [Z.SRC, Z.START];
const LT = polyLen(zTop), LR = polyLen(zReturn);
const xFrac = (x: number) => (x - Z.START[0]) / LT;
const zFB = (62 + 75) / polyLen(zV); // bomb sits after 62 up + 75 across

function zenoTiming(N: number) {
  const Tc = Math.max(0.16, Math.min(0.85, 4.2 / N));
  const fTop = LT / (LT + LR);
  return { intro: 0.4, Tc, fTop, exit: 0.55 };
}
function zenoDuration(p: ZPlan) {
  const tm = zenoTiming(p.N);
  if (p.failAt !== null) {
    const toPbs = xFrac(Z.PBS1[0]) * tm.fTop * tm.Tc;
    const vTime = zFB * (xFrac(Z.PBS2[0]) - xFrac(Z.PBS1[0])) * tm.fTop * tm.Tc;
    return tm.intro + p.failAt * tm.Tc + toPbs + vTime + 0.8;
  }
  return tm.intro + (p.N - 1) * tm.Tc + tm.fTop * tm.Tc + tm.exit + 1.0;
}

function ZenoScene({ plan, t, N, reveal, blown }: { plan: ZPlan | null; t: number; N: number; reveal: null | boolean; blown: boolean }) {
  const theta = Math.PI / (2 * N);
  let alpha = 0; // polarization angle shown on the dial (0 = H, π/2 = V)
  let photons: React.ReactNode[] = [];
  let boomK = 0, exploded = false, litH = 0, litV = 0;
  let cycleLabel = '';
  let snap = 0;
  if (plan) {
    const tm = zenoTiming(plan.N);
    const th = Math.PI / (2 * plan.N);
    const lastCycle = plan.failAt ?? plan.N - 1;
    if (t < tm.intro) photons.push(<Photon key="in" at={along(zIn, t / tm.intro)} />);
    else {
      const tc = t - tm.intro;
      const k = Math.min(lastCycle, Math.floor(tc / tm.Tc));
      const u = (tc - k * tm.Tc) / tm.Tc; // progress within cycle
      cycleLabel = `cycle ${Math.min(k + 1, plan.N)} / ${plan.N}`;
      const fRot = xFrac(Z.ROT[0]), f1 = xFrac(Z.PBS1[0]), f2 = xFrac(Z.PBS2[0]);
      const isFinal = k === plan.N - 1 && plan.failAt === null;
      const exploding = plan.failAt === k;
      if (u < tm.fTop || exploding) {
        // on the top straight (including the H/V lanes)
        const f = u / tm.fTop;
        const before = plan.live ? 0 : k * th;
        alpha = f < fRot ? before : before + th;
        if (f < f1 || (!exploding && f > f2)) {
          if (plan.live && f > f2) alpha = 0;
          photons.push(<Photon key="p" at={along(zTop, f)} />);
          if (plan.live && f > f2 && f - f2 < 0.06) snap = 1 - (f - f2) / 0.06;
        } else {
          const lane = (f - f1) / (f2 - f1);
          if (exploding) {
            alpha = Math.PI / 2;
            if (lane < zFB) photons.push(<Photon key="v" at={along(zV, lane)} />);
            else {
              boomK = (t - (tm.intro + k * tm.Tc + (f1 + zFB * (f2 - f1)) * tm.fTop * tm.Tc)) / 0.8;
              exploded = boomK > 0.15;
            }
          } else if (plan.live) {
            alpha = 0;
            photons.push(<Photon key="h" at={along([Z.PBS1, Z.PBS2], lane)} />);
            if (lane < 0.25) photons.push(<circle key="look" cx={Z.BOMB[0]} cy={Z.BOMB[1] - 34} r={6 + lane * 60} fill="none" stroke="#58c4dd" opacity={1 - lane / 0.25} />);
          } else {
            const a = (k + 1) * th;
            photons.push(
              <Photon key="h" at={along([Z.PBS1, Z.PBS2], lane)} amp={Math.abs(Math.cos(a))} />,
              <Photon key="v" at={along(zV, lane)} amp={Math.abs(Math.sin(a))} color="#f6c2e4" />,
            );
          }
        }
      } else if (!isFinal) {
        const f = (u - tm.fTop) / (1 - tm.fTop);
        alpha = plan.live ? 0 : (k + 1) * th;
        photons.push(<Photon key="r" at={along(zReturn, f)} />);
      } else {
        alpha = plan.live ? 0 : Math.PI / 2;
        const te = tc - k * tm.Tc - tm.fTop * tm.Tc;
        if (te < tm.exit) photons.push(<Photon key="e" at={along(zExit, te / tm.exit)} />);
        else {
          const kk = clamp01(1 - (te - tm.exit) / 1.2);
          if (plan.live) litH = 0.4 + 0.6 * kk;
          else litV = 0.4 + 0.6 * kk;
        }
      }
    }
  }
  const [dx, dy] = Z.DIAL;
  const R = 44;
  const ax = Math.cos(alpha) * R, ay = -Math.sin(alpha) * R;
  return (
    <svg viewBox="0 0 600 280" style={{ width: '100%', display: 'block' }}>
      <rect x={0} y={0} width={600} height={280} rx={12} fill="#0e1118" />
      {[zIn, zTop, zReturn, zV, zExit].map((p, i) => (
        <polyline key={i} points={pts(p)} fill="none" stroke={i === 3 ? '#e07ab6' : '#58c4dd'} strokeOpacity={0.2} strokeWidth={6} strokeLinejoin="round" />
      ))}
      <rect x={Z.SRC[0] - 16} y={Z.SRC[1] - 12} width={30} height={24} rx={5} fill="#2b2f3d" stroke="#fc6255" strokeWidth={2} />
      <text x={Z.SRC[0] - 1} y={Z.SRC[1] + 4} textAnchor="middle" fontSize={11} fill="#fca5a0" fontWeight={700}>
        γ
      </text>
      {/* rotator */}
      <rect x={Z.ROT[0] - 16} y={Z.ROT[1] - 20} width={32} height={40} rx={6} fill="rgba(252,211,77,.12)" stroke="#fcd34d" strokeWidth={1.5} />
      <text x={Z.ROT[0]} y={Z.ROT[1] + 34} textAnchor="middle" fontSize={10.5} fill="#fcd34d">
        rotate {((theta * 180) / Math.PI).toFixed(1)}°
      </text>
      <path d={`M ${Z.ROT[0] - 8} ${Z.ROT[1] + 6} A 9 9 0 1 1 ${Z.ROT[0] + 8} ${Z.ROT[1] + 6}`} stroke="#fcd34d" fill="none" strokeWidth={1.8} />
      <Splitter at={Z.PBS1} o={1} pol />
      <Splitter at={Z.PBS2} o={0} pol />
      <text x={Z.PBS1[0] - 4} y={Z.PBS1[1] + 30} textAnchor="middle" fontSize={10} fill="#e07ab6">
        PBS
      </text>
      <text x={(Z.PBS1[0] + Z.PBS2[0]) / 2} y={Z.PBS1[1] + 16} textAnchor="middle" fontSize={10} fill="#58c4dd">
        H path
      </text>
      <text x={262} y={60} fontSize={10} fill="#e07ab6">
        V path
      </text>
      <BombSprite at={[Z.BOMB[0], Z.BOMB[1] + 6]} reveal={reveal} exploded={exploded || blown} />
      {/* output analyser */}
      <Lamp at={[560, 62]} label="H" sub="" lit={litH} color="#83c167" />
      <Lamp at={[560, 140]} label="V" sub="" lit={litV} color="#58c4dd" />
      <text x={560} y={30} textAnchor="middle" fontSize={10} fill="#83c167">
        → LIVE
      </text>
      <text x={560} y={176} textAnchor="middle" fontSize={10} fill="#58c4dd">
        → DUD
      </text>
      <line x1={Z.OUT[0]} y1={Z.OUT[1]} x2={540} y2={70} stroke="#83c167" strokeOpacity={0.25} strokeWidth={3} />
      <line x1={Z.OUT[0]} y1={Z.OUT[1]} x2={540} y2={132} stroke="#58c4dd" strokeOpacity={0.25} strokeWidth={3} />
      {/* polarization dial */}
      <circle cx={dx} cy={dy} r={R + 6} fill="#11141c" stroke="#2a3142" />
      <path d={`M ${dx + R} ${dy} A ${R} ${R} 0 0 0 ${dx} ${dy - R}`} stroke="#e07ab6" strokeOpacity={0.35} strokeWidth={6} fill="none" />
      <line x1={dx - R} y1={dy} x2={dx + R} y2={dy} stroke="#3a4256" />
      <line x1={dx} y1={dy - R} x2={dx} y2={dy + R} stroke="#3a4256" />
      {snap > 0 && <circle cx={dx} cy={dy} r={R + 6 + 14 * (1 - snap)} fill="none" stroke="#83c167" strokeWidth={3} opacity={snap} />}
      <line x1={dx - ax} y1={dy - ay} x2={dx + ax} y2={dy + ay} stroke="#fcd34d" strokeWidth={4} strokeLinecap="round" />
      <circle cx={dx + ax} cy={dy + ay} r={4} fill="#fcd34d" />
      <circle cx={dx - ax} cy={dy - ay} r={4} fill="#fcd34d" />
      <text x={dx + R + 12} y={dy + 4} fontSize={10} fill="#9aa3b5">
        H
      </text>
      <text x={dx - 4} y={dy - R - 10} fontSize={10} fill="#9aa3b5">
        V
      </text>
      <text x={dx} y={dy + R + 22} textAnchor="middle" fontSize={11} fill="#e9ecf2">
        polarization {((alpha * 180) / Math.PI).toFixed(0)}°
      </text>
      {cycleLabel && (
        <text x={110} y={175} textAnchor="middle" fontSize={13} fill="#fcd34d" fontWeight={700}>
          {cycleLabel}
        </text>
      )}
      {photons}
      <Explosion at={Z.BOMB} k={boomK} />
    </svg>
  );
}

/* ------------------------------ survival chart ----------------------------- */
function SurvivalChart({ N, onPick }: { N: number; onPick: (n: number) => void }) {
  const MAXN = 30;
  const W = 300, H = 120, pl = 26, pb = 18;
  const bw = (W - pl - 4) / MAXN;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block', cursor: 'pointer' }}>
      {[0, 0.5, 1].map((y) => (
        <g key={y}>
          <line x1={pl} x2={W - 2} y1={4 + (1 - y) * (H - pb - 4)} y2={4 + (1 - y) * (H - pb - 4)} stroke="#2a3142" />
          <text x={pl - 4} y={8 + (1 - y) * (H - pb - 4)} fontSize={8} textAnchor="end" fill="#6b7385">
            {y * 100}%
          </text>
        </g>
      ))}
      {Array.from({ length: MAXN }, (_, i) => {
        const n = i + 1;
        const p = zenoSurvive(n);
        const h = p * (H - pb - 4);
        const sel = n === N;
        return (
          <g key={n} onClick={() => onPick(n)}>
            <rect x={pl + i * bw + 0.5} y={4} width={bw - 1} height={H - pb - 4} fill="transparent" />
            <rect x={pl + i * bw + 0.5} y={4 + (H - pb - 4) - h} width={bw - 1} height={h} rx={1.5} fill={sel ? '#fcd34d' : '#83c167'} opacity={sel ? 1 : 0.55} style={{ transition: 'all .2s' }} />
            {(n === 1 || n % 5 === 0) && (
              <text x={pl + i * bw + bw / 2} y={H - 5} fontSize={8} textAnchor="middle" fill="#6b7385">
                {n}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ---------------------------------- game ---------------------------------- */

const RES_LABEL: Record<Resolution, string> = {
  certified: 'Certified LIVE, intact',
  dudFound: 'Identified as a dud',
  boom: 'BOOM',
  shipLiveLucky: 'Shipped untested (it was live)',
  shipDud: 'Shipped a dud!',
  scrapDud: 'Scrapped (it was a dud)',
  scrapLive: 'Scrapped a live bomb!',
};

function explainFor(plan: Plan | null, res: Resolution, brights: number): string {
  if (res === 'shipLiveLucky') return `You shipped it without proof and got lucky: it was live. Untested bombs only earn ${PTS.shipLiveLucky} points.`;
  if (res === 'shipDud') return 'That one was a **dud**. A dud never sends a photon to the dark port D, and in the Zeno loop it always comes out V. A test would have caught it.';
  if (res === 'scrapDud') return `Correct call: it was a dud. ${brights ? `After ${brights} bright click${brights > 1 ? 's' : ''} with no D click, the chance it was live had fallen to ${(posteriorLive(brights) * 100).toFixed(1)}%.` : ''}`;
  if (res === 'scrapLive') return `Ouch, that bomb was **live**. ${brights ? `After ${brights} bright click${brights > 1 ? 's' : ''} it still had a ${(posteriorLive(brights) * 100).toFixed(1)}% chance of being live.` : ''}`;
  if (!plan) return '';
  if (plan.mode === 'ev') {
    if (plan.outcome === 'boom')
      return 'The live bomb acts as a **which-path detector** on the lower arm. The photon was in a superposition of both arms, so the bomb found it there with probability $|\\tfrac{1}{\\sqrt2}|^2 = \\tfrac12$. Boom. This is the price of the 50/50 tester: half of all live bombs explode.';
    if (plan.outcome === 'dark')
      return 'A click at the **dark port D**! With a dud, D can never fire, because its two paths cancel: $-\\tfrac12 + \\tfrac12 = 0$. The live bomb blocked one path, so nothing cancelled and $P(D) = \\tfrac14$. The bomb is **certified live**, and no photon touched it.';
    return plan.live
      ? 'Bright port C. The bomb blocked the lower arm, and the photon went to C anyway ($P = \\tfrac14$). That is inconclusive, because a dud would also send it to C.'
      : 'Bright port C. With a dud, both arms interfere and **every** photon reaches C. That is inconclusive, because a live bomb also gives C a quarter of the time.';
  }
  const deg = 90 / plan.N;
  const pStay = Math.cos(Math.PI / (2 * plan.N)) ** 2;
  const pAll = zenoSurvive(plan.N);
  if (!plan.live)
    return `No live bomb means nothing measures the photon. ${plan.N} rotations of ${deg.toFixed(1)}° add up **coherently** to $${plan.N}\\times ${deg.toFixed(1)}° = 90°$, so the photon left vertically polarized (V), which says **dud**. This works every time.`;
  if (plan.failAt !== null)
    return `On cycle ${plan.failAt + 1} of ${plan.N} the bomb found the photon in the V path. Each pass survives with $\\cos^2(${deg.toFixed(1)}°) = ${(pStay * 100).toFixed(1)}\\%$, and all ${plan.N} passes with $\\cos^{${2 * plan.N}}(${deg.toFixed(1)}°) = ${(pAll * 100).toFixed(1)}\\%$. Bad luck this time, or try more cycles.`;
  return `**Quantum Zeno effect.** Each cycle rotated the polarization by only ${deg.toFixed(1)}°. The live bomb then effectively asked "H or V?", and the answer was H with probability $\\cos^2(${deg.toFixed(1)}°) = ${(pStay * 100).toFixed(1)}\\%$, which **resets** the photon to H. Surviving all ${plan.N}: $${(pStay * 100).toFixed(1)}\\%^{${plan.N}} = ${(pAll * 100).toFixed(1)}\\%$. The photon left H, so the bomb is **certified live**.`;
}

export default function BombTester() {
  const g = useGame(GAME_ID);
  const [shift, setShift] = useState<boolean[]>(() => makeShift(Math.random));
  const [i, setI] = useState(0);
  const [mode, setMode] = useState<Mode>('ev');
  const [N, setN] = useState(8);
  const [budget, setBudget] = useState(BUDGET);
  const [score, setScore] = useState(0);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [brights, setBrights] = useState(0);
  const [resolved, setResolved] = useState<null | { res: Resolution; plan: Plan | null }>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [t, setT] = useState(0);
  const [running, setRunning] = useState(false);
  const [shake, setShake] = useState(0);
  const [streak, setStreak] = useState(0);
  const [lastShot, setLastShot] = useState<string>('');
  const [over, setOver] = useState(false);
  const raf = useRef(0);

  const live = shift[i];
  const max = useMemo(() => maxScore(shift), [shift]);
  const cost = mode === 'ev' ? 1 : N;

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const finishBomb = (res: Resolution, p: Plan | null) => {
    const pts = PTS[res];
    setScore((s) => s + pts);
    setLog((l) => [...l, { live, res, pts }]);
    setResolved({ res, plan: p });
    if (res === 'boom') {
      setStreak(0);
    } else if (res === 'certified') {
      setStreak((s) => {
        const ns = s + 1;
        if (ns >= 5) g.unlock('u2-zeno-paradox');
        return ns;
      });
    }
  };

  const play = (p: Plan, dur: number, onEnd: () => void) => {
    setPlan(p);
    setRunning(true);
    const t0 = performance.now();
    let boomed = false;
    const loop = (now: number) => {
      const el = (now - t0) / 1000;
      setT(el);
      if (!boomed && ((p.mode === 'ev' && p.outcome === 'boom') || (p.mode === 'zeno' && p.failAt !== null)) && el > dur - 0.8) {
        boomed = true;
        setShake((s) => s + 1);
      }
      if (el < dur) raf.current = requestAnimationFrame(loop);
      else {
        setRunning(false);
        onEnd();
      }
    };
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(loop);
  };

  const fire = () => {
    if (running || resolved || budget < cost) return;
    setBudget((b) => b - cost);
    if (mode === 'ev') {
      const outcome = sampleEV(live, Math.random);
      const p: EVPlan = { mode: 'ev', live, outcome };
      play(p, evDuration(p), () => {
        if (outcome === 'boom') finishBomb('boom', p);
        else if (outcome === 'dark') finishBomb('certified', p);
        else {
          setBrights((b) => b + 1);
          setLastShot(explainFor(p, 'certified', 0));
        }
      });
    } else {
      const failAt = sampleZeno(live, N, Math.random);
      const p: ZPlan = { mode: 'zeno', live, N, failAt };
      play(p, zenoDuration(p), () => finishBomb(failAt !== null ? 'boom' : live ? 'certified' : 'dudFound', p));
    }
  };

  const declare = (asLive: boolean) => {
    if (running || resolved) return;
    setPlan(null);
    finishBomb(asLive ? (live ? 'shipLiveLucky' : 'shipDud') : live ? 'scrapLive' : 'scrapDud', null);
  };

  const next = () => {
    if (i + 1 >= shift.length) {
      const beaten = score >= 0.5 * max;
      g.finish(score, beaten, { lastScore: score, lastMax: max });
      setOver(true);
      return;
    }
    setI(i + 1);
    setResolved(null);
    setPlan(null);
    setBrights(0);
    setLastShot('');
    setT(0);
  };

  const newShift = () => {
    setShift(makeShift(Math.random));
    setI(0);
    setBudget(BUDGET);
    setScore(0);
    setLog([]);
    setResolved(null);
    setPlan(null);
    setBrights(0);
    setLastShot('');
    setOver(false);
    setT(0);
  };

  const reveal = resolved ? live : null;
  const blown = resolved?.res === 'boom';
  const evPlan = plan?.mode === 'ev' ? plan : null;
  const zPlan = plan?.mode === 'zeno' ? plan : null;
  const pLive = posteriorLive(brights);
  const pS = zenoSurvive(N);
  const certifiedCount = log.filter((l) => l.res === 'certified').length;
  const boomCount = log.filter((l) => l.res === 'boom').length;

  return (
    <div>
      <style>{CSS}</style>
      <HowToPlay defaultOpen={g.plays === 0}>
        <p style={{ marginTop: 0 }}>
          You run quality control at a bomb depot. Each bomb has an ultra-sensitive trigger: a detector that explodes if it absorbs even{' '}
          <b>one photon</b>. About {Math.round(PRIOR_LIVE * 100)}% of bombs are <b>live</b>; the rest are <b>duds</b> (no working detector). Your job is
          to find the live ones <i>without setting them off</i>.
        </p>
        <p>
          <b>Elitzur–Vaidman tester:</b> the bomb sits in one arm of a balanced Mach–Zehnder interferometer. A dud always sends the photon to
          the bright port C. A click at the <b>dark port D</b> proves the bomb is live. <b>Zeno tester:</b> the photon circles a loop{' '}
          <Tex>N</Tex> times. Each lap its polarization rotates by <Tex>{'90^\\circ/N'}</Tex>, and a polarizing beam splitter steers the V part past the
          bomb.
        </p>
        <p style={{ marginBottom: 0 }}>
          Scoring: certified live <b>+{PTS.certified}</b> · dud identified <b>+{PTS.dudFound}</b> · explosion <b>{PTS.boom}</b> · shipping untested: +
          {PTS.shipLiveLucky} if live, {PTS.shipDud} if a dud · scrapping a live bomb {PTS.scrapLive}. You get <b>{BUDGET} photon-cycles</b> for the
          whole shift of {SHIFT_SIZE} bombs (one EV shot = 1, a Zeno run = N). Score at least <b>50% of the shift's maximum</b> to win.
        </p>
      </HowToPlay>

      {/* HUD */}
      <div className="panel row" style={{ gap: 18, flexWrap: 'wrap', padding: '10px 16px', marginBottom: 12 }}>
        <Stat label="bomb" value={`${Math.min(i + 1, shift.length)} / ${shift.length}`} />
        <Stat label="score" value={score} color={score >= 0 ? 'var(--green)' : 'var(--red)'} />
        <Stat label="to win" value={Math.ceil(0.5 * max)} color="var(--text-dim)" />
        <Stat label="live streak" value={`${streak}🔥`} color="var(--yellow)" />
        <div style={{ flex: 1, minWidth: 160 }}>
          <div className="row" style={{ justifyContent: 'space-between', fontSize: '0.8rem' }}>
            <span className="faint">photon-cycles left</span>
            <b>{budget}</b>
          </div>
          <ProgressBar value={budget / BUDGET} color={budget > 30 ? 'var(--blue)' : 'var(--gold)'} />
        </div>
        <div className="row" style={{ gap: 3 }}>
          {shift.map((_, j) => {
            const e = log[j];
            const icon = !e ? (j === i ? '◉' : '·') : e.res === 'boom' ? '💥' : e.res === 'certified' || e.res === 'shipLiveLucky' ? '💣' : e.res === 'dudFound' || e.res === 'scrapDud' ? '🧯' : '❌';
            return (
              <span key={j} title={e ? RES_LABEL[e.res] : ''} style={{ width: 20, textAlign: 'center', color: j === i ? 'var(--yellow)' : 'var(--text-faint)' }}>
                {icon}
              </span>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.55fr) minmax(250px, 1fr)', gap: 14, alignItems: 'start' }}>
        <div key={shake} className={shake ? 'qqbt-shake' : ''}>
          <div className="panel" style={{ padding: 8 }}>
            {mode === 'ev' ? <EVScene plan={evPlan} t={t} reveal={reveal} blown={blown} /> : <ZenoScene plan={zPlan} t={t} N={zPlan?.N ?? N} reveal={reveal} blown={blown} />}
          </div>
          {/* lab notes */}
          {(resolved || lastShot) && (
            <div className="panel qqbt-pop" style={{ marginTop: 10, borderColor: resolved ? (resolved.res === 'boom' || resolved.res === 'shipDud' || resolved.res === 'scrapLive' ? 'var(--red)' : 'var(--green)') : 'var(--blue)' }}>
              {resolved ? (
                <>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <b style={{ fontSize: '1.05rem' }}>
                      {resolved.res === 'boom' ? '💥 ' : resolved.res === 'certified' ? '✅ ' : ''}
                      {RES_LABEL[resolved.res]}
                    </b>
                    <span className={`pill ${PTS[resolved.res] >= 0 ? 'good' : 'bad'}`}>
                      {PTS[resolved.res] >= 0 ? '+' : ''}
                      {PTS[resolved.res]}
                    </span>
                  </div>
                  <div className="dim" style={{ marginTop: 6, lineHeight: 1.55 }}>
                    <RichText text={explainFor(resolved.plan, resolved.res, brights)} />
                  </div>
                  <button className="btn primary" style={{ marginTop: 10 }} onClick={next}>
                    {i + 1 >= shift.length ? 'Finish shift' : 'Next bomb →'}
                  </button>
                </>
              ) : (
                <>
                  <b>💡 Inconclusive: bright port C ({brights}×)</b>
                  <div className="dim" style={{ marginTop: 6, lineHeight: 1.55 }}>
                    <RichText text={lastShot} />{' '}
                    <RichText
                      text={`Bayes: starting from $P(\\text{live}) = ${PRIOR_LIVE}$, each C-click multiplies the odds by $\\tfrac14$. Now $P(\\text{live}) = ${(pLive * 100).toFixed(1)}\\%$. Fire again, or decide.`}
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* controls */}
        <div className="col" style={{ gap: 10 }}>
          <div className="panel" style={{ padding: 12 }}>
            <div className="faint" style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              Choose your tester
            </div>
            <Segmented<Mode>
              options={[
                { value: 'ev', label: '50/50 interferometer' },
                { value: 'zeno', label: 'Zeno loop' },
              ]}
              value={mode}
              onChange={(m) => {
                if (running) return;
                setMode(m);
                if (!resolved) setPlan(null);
              }}
            />
            {mode === 'ev' ? (
              <div style={{ marginTop: 10, fontSize: '0.9rem' }} className="dim">
                For a <b>live</b> bomb, each photon: 💥 {evProbs(true).boom * 100}% · D (certify) {evProbs(true).dark * 100}% · C (inconclusive){' '}
                {evProbs(true).bright * 100}%. A <b>dud</b> always gives C. Cost: 1 per photon.
              </div>
            ) : (
              <div style={{ marginTop: 10 }}>
                <Slider label="cycles N" value={N} min={1} max={30} step={1} onChange={(v) => !running && setN(v)} format={(v) => String(v)} />
                <div className="row" style={{ justifyContent: 'space-between', fontSize: '0.85rem', marginTop: 4 }}>
                  <span className="dim">rotation / cycle</span>
                  <b>{(90 / N).toFixed(1)}°</b>
                </div>
                <div className="row" style={{ justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span className="dim">live bomb survives</span>
                  <b style={{ color: 'var(--green)' }}>{(pS * 100).toFixed(1)}%</b>
                </div>
                <div className="row" style={{ justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span className="dim">cost</span>
                  <b>{N} cycles</b>
                </div>
                <div style={{ marginTop: 6 }}>
                  <SurvivalChart N={N} onPick={(n) => !running && setN(n)} />
                  <div className="faint" style={{ fontSize: '0.75rem', textAlign: 'center' }}>
                    <Tex>{'P_{\\text{survive}} = \\cos^{2N}\\!\\big(\\tfrac{\\pi}{2N}\\big) \\approx 1 - \\tfrac{\\pi^2}{4N}'}</Tex>
                  </div>
                </div>
              </div>
            )}
            <button className="btn primary" style={{ width: '100%', marginTop: 12 }} disabled={running || !!resolved || budget < cost || over} onClick={fire}>
              {running ? 'Photon in flight…' : budget < cost ? 'Not enough photon-cycles' : mode === 'ev' ? '🔦 Fire one photon' : `🔁 Run ${N} cycles`}
            </button>
          </div>
          <div className="panel" style={{ padding: 12 }}>
            <div className="faint" style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              Or decide without proof
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn small" disabled={running || !!resolved || over} onClick={() => declare(true)} style={{ flex: 1 }}>
                📦 Ship as live
              </button>
              <button className="btn small" disabled={running || !!resolved || over} onClick={() => declare(false)} style={{ flex: 1 }}>
                🗑 Scrap as dud
              </button>
            </div>
            {mode === 'ev' && brights > 0 && !resolved && (
              <div className="faint" style={{ fontSize: '0.8rem', marginTop: 6 }}>
                P(live) right now ≈ {(pLive * 100).toFixed(1)}%
              </div>
            )}
          </div>
          <div className="faint" style={{ fontSize: '0.8rem', textAlign: 'center' }}>
            certified {certifiedCount} · explosions {boomCount}
          </div>
        </div>
      </div>

      {over && (
        <GameOverlay title={score >= 0.5 * max ? 'Shift complete: depot secured!' : 'Shift over'} tone={score >= 0.5 * max ? 'win' : 'lose'}>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text)' }}>
            {score} <span className="faint" style={{ fontSize: '1rem' }}>/ {max} possible</span>
          </div>
          <div style={{ margin: '8px 0' }}>
            {certifiedCount} live bombs certified untouched · {boomCount} explosion{boomCount === 1 ? '' : 's'}
          </div>
          <div style={{ textAlign: 'left', fontSize: '0.92rem', lineHeight: 1.5 }}>
            <RichText
              text={
                'The 50/50 tester proves a bomb is live without touching it only $\\tfrac13$ of the time (D before boom). The rest it explodes. Many weak rotations do much better: the bomb keeps "measuring" the photon back to H, which freezes its evolution. That is the **quantum Zeno effect**, and with enough cycles you can certify nearly every bomb (Kwiat et al., 1995).'
              }
            />
          </div>
          <button className="btn primary" style={{ marginTop: 14 }} onClick={newShift}>
            New shift
          </button>
        </GameOverlay>
      )}
    </div>
  );
}
