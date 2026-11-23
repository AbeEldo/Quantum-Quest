import React, { useState } from 'react';
import { Widget } from '../../../components/ui';

type Loophole = 'locality' | 'detection' | 'choice';
interface Event {
  year: number;
  title: string;
  who: string;
  kind: 'theory' | 'experiment' | 'prize';
  text: string;
  closes?: Loophole[];
  open?: Loophole[];
  stat?: string;
}

const EVENTS: Event[] = [
  { year: 1935, title: 'The EPR paper', who: 'Einstein, Podolsky, Rosen', kind: 'theory', text: 'Perfect correlations + locality ⇒ “elements of reality” ⇒ quantum mechanics is incomplete. Schrödinger coins “entanglement” the same year.' },
  { year: 1964, title: "Bell's theorem", who: 'John S. Bell', kind: 'theory', text: 'Any local hidden-variable theory obeys an inequality that quantum mechanics violates. Philosophy becomes an experiment.' },
  { year: 1969, title: 'The CHSH inequality', who: 'Clauser, Horne, Shimony, Holt', kind: 'theory', text: '|S| ≤ 2: a version of Bell’s inequality designed for real, imperfect apparatus. Proposes a test with photon pairs from atomic cascades.' },
  {
    year: 1972,
    title: 'First Bell test',
    who: 'Stuart Freedman & John Clauser (Berkeley)',
    kind: 'experiment',
    text: 'Photon pairs from a calcium-atom cascade, polarisers at fixed angles. Bell’s inequality violated by about six standard deviations, in agreement with quantum mechanics.',
    open: ['locality', 'detection', 'choice'],
    stat: '≈ 6σ violation',
  },
  {
    year: 1982,
    title: 'Aspect’s experiments',
    who: 'Alain Aspect, Philippe Grangier, Jean Dalibard, Gérard Roger (Orsay)',
    kind: 'experiment',
    text: 'A bright cascade source gives S = 2.697 ± 0.015. In a second experiment, optical switches change the analyser settings every ~10 ns while the photons are in flight (≈12 m apart). The switching was periodic rather than truly random.',
    closes: ['locality'],
    open: ['detection', 'choice'],
    stat: 'S = 2.697 ± 0.015',
  },
  {
    year: 1998,
    title: 'Strict Einstein locality',
    who: 'Weihs, Jennewein, Simon, Weinfurter, Zeilinger (Innsbruck)',
    kind: 'experiment',
    text: 'Observers 400 m apart, settings chosen by fast physical random-number generators and recorded locally: no light-speed signal could connect a setting choice to the distant result.',
    closes: ['locality'],
    open: ['detection'],
  },
  {
    year: 2001,
    title: 'Detection loophole closed',
    who: 'Rowe et al. (NIST, trapped ions)',
    kind: 'experiment',
    text: 'Two entangled beryllium ions read out with near-perfect efficiency, so no "fair sampling" assumption is needed, but the ions were only micrometres apart, so locality stayed open.',
    closes: ['detection'],
    open: ['locality'],
  },
  {
    year: 2015,
    title: 'Loophole-free: Delft',
    who: 'Hensen et al. (TU Delft), Nature 526, 682',
    kind: 'experiment',
    text: 'Electron spins in two diamonds 1.3 km apart, entangled by an event-ready photon scheme. Efficient spin readout and fast random settings close detection and locality loopholes together. 245 trials.',
    closes: ['locality', 'detection'],
    stat: 'S = 2.42 ± 0.20',
  },
  {
    year: 2015,
    title: 'Loophole-free: Vienna & NIST',
    who: 'Giustina et al. (Vienna); Shalm et al. (NIST Boulder)',
    kind: 'experiment',
    text: 'Entangled photons with superconducting detectors efficient enough to beat the detection threshold, plus spacelike-separated random settings. Vienna reported p ≈ 3.7 × 10⁻³¹.',
    closes: ['locality', 'detection'],
    stat: 'p ≈ 10⁻³¹ (Vienna)',
  },
  {
    year: 2018,
    title: 'Freedom of choice, pushed back',
    who: 'BIG Bell Test (≈100,000 volunteers); “cosmic” Bell tests (Vienna/MIT)',
    kind: 'experiment',
    text: 'Settings chosen by humans playing an online game, or by the colour of light from quasars emitted billions of years ago, so any hidden conspiracy would have to reach back that far.',
    closes: ['choice'],
  },
  { year: 2022, title: 'Nobel Prize in Physics', who: 'Alain Aspect, John F. Clauser, Anton Zeilinger', kind: 'prize', text: '“For experiments with entangled photons, establishing the violation of Bell inequalities and pioneering quantum information science.”' },
];

const LCOL: Record<Loophole, string> = { locality: '#58c4dd', detection: '#fcd34d', choice: '#9a72ac' };
const LNAME: Record<Loophole, string> = { locality: 'locality', detection: 'detection', choice: 'freedom of choice' };

/** Clickable timeline of the Bell-test story, with loophole badges. */
export function BellTimeline() {
  const [sel, setSel] = useState(3);
  const e = EVENTS[sel];
  const y0 = 1930, y1 = 2026;
  const W = 760, H = 96, pad = 30;
  const x = (y: number) => pad + ((y - y0) / (y1 - y0)) * (W - 2 * pad);
  // spread same-year events
  const pos = EVENTS.map((ev, i) => x(ev.year) + (EVENTS.filter((o, j) => j < i && o.year === ev.year).length ? 14 : 0));
  return (
    <Widget title="Fifty years of testing Bell: click an event">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
        <line x1={pad} x2={W - pad} y1={50} y2={50} stroke="#3a4256" strokeWidth={2} />
        {[1940, 1960, 1980, 2000, 2020].map((y) => (
          <g key={y}>
            <line x1={x(y)} x2={x(y)} y1={46} y2={54} stroke="#3a4256" />
            <text x={x(y)} y={72} fontSize={10} fill="#6b7385" textAnchor="middle">{y}</text>
          </g>
        ))}
        {EVENTS.map((ev, i) => {
          const col = ev.kind === 'theory' ? '#e07ab6' : ev.kind === 'prize' ? '#f0ac5f' : '#83c167';
          const on = i === sel;
          return (
            <g key={i} style={{ cursor: 'pointer' }} onClick={() => setSel(i)}>
              <circle cx={pos[i]} cy={50} r={on ? 10 : 7} fill={on ? col : '#141821'} stroke={col} strokeWidth={2.5} style={{ transition: 'r .2s' }} />
              <text x={pos[i]} y={i % 2 ? 90 : 30} fontSize={10.5} fill={on ? '#fff' : '#9aa3b5'} textAnchor="middle" fontWeight={on ? 700 : 400}>
                {ev.year}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="row" style={{ gap: 6, justifyContent: 'center', fontSize: '0.75rem' }}>
        <span style={{ color: '#e07ab6' }}>● theory</span>
        <span style={{ color: '#83c167' }}>● experiment</span>
        <span style={{ color: '#f0ac5f' }}>● prize</span>
        <button className="btn small ghost" disabled={sel === 0} onClick={() => setSel((s) => s - 1)}>◀</button>
        <button className="btn small ghost" disabled={sel === EVENTS.length - 1} onClick={() => setSel((s) => s + 1)}>▶</button>
      </div>
      <div key={sel} className="panel pop" style={{ marginTop: 10, padding: 14 }}>
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div>
            <span className="mono" style={{ color: 'var(--yellow)', marginRight: 8 }}>{e.year}</span>
            <b style={{ fontSize: '1.05rem' }}>{e.title}</b>
          </div>
          {e.stat && <span className="pill">{e.stat}</span>}
        </div>
        <div className="faint" style={{ fontSize: '0.85rem', margin: '2px 0 6px' }}>{e.who}</div>
        <div>{e.text}</div>
        {(e.closes || e.open) && (
          <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap', fontSize: '0.78rem' }}>
            {(e.closes ?? []).map((l) => (
              <span key={l} className="pill" style={{ borderColor: LCOL[l], color: LCOL[l] }}>✓ {LNAME[l]} loophole addressed</span>
            ))}
            {(e.open ?? []).map((l) => (
              <span key={l} className="pill" style={{ borderColor: '#555', color: 'var(--text-faint)' }}>○ {LNAME[l]} loophole open</span>
            ))}
          </div>
        )}
      </div>
    </Widget>
  );
}
