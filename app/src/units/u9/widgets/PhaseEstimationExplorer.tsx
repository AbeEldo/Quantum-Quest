import React, { useMemo, useState } from 'react';
import { Widget, Slider, Tex } from '../../../components/ui';
import { ClockDial, ProbBars, pct } from './viz';
import { qpeSimulate, qpeKickbackTurns, sampleFrom, bitstr } from '../algos';

const PRESETS: { label: string; v: number }[] = [
  { label: '1/4', v: 0.25 },
  { label: '5/8', v: 0.625 },
  { label: '1/3', v: 1 / 3 },
  { label: '0.1', v: 0.1 },
  { label: '(√5−1)/2', v: (Math.sqrt(5) - 1) / 2 },
];

function binaryDigits(phi: number, k: number): string {
  let s = '';
  let f = phi;
  for (let i = 0; i < k; i++) {
    f *= 2;
    const b = Math.floor(f);
    s += b;
    f -= b;
  }
  return s;
}

/**
 * Phase estimation: pick an eigenphase φ and a number of counting qubits t. The counting qubits receive kicked-back
 * phases φ·2^j (each doubling shifts the binary point), and the inverse QFT turns them into a peak at m ≈ φ·2^t.
 * The distribution is computed by running the gate-level circuit on the state-vector engine.
 */
export function PhaseEstimationExplorer() {
  const [phi, setPhi] = useState(0.3);
  const [t, setT] = useState(4);
  const [shots, setShots] = useState<number[]>([]);
  const T = 1 << t;
  const dist = useMemo(() => qpeSimulate(phi, t), [phi, t]);
  const kick = qpeKickbackTurns(phi, t);
  const best = dist.indexOf(Math.max(...dist));
  const nearest2 = [Math.floor(phi * T) % T, Math.ceil(phi * T) % T];
  const pNear = nearest2[0] === nearest2[1] ? dist[nearest2[0]] : dist[nearest2[0]] + dist[nearest2[1]];
  const bits = binaryDigits(phi, 12);
  const exact = Math.abs(phi * T - Math.round(phi * T)) < 1e-9;

  return (
    <Widget title="Phase estimation: reading a phase digit by digit">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px,1fr) minmax(240px,1fr)', gap: 16 }}>
        <div>
          <Slider label={<Tex>{'\\varphi'}</Tex>} value={phi} min={0} max={0.999} step={0.001} onChange={(v) => { setPhi(v); setShots([]); }} format={(v) => v.toFixed(3)} />
          <div className="row" style={{ gap: 4, margin: '2px 0 8px' }}>
            {PRESETS.map((p) => (
              <button key={p.label} className={`btn small ${Math.abs(phi - p.v) < 5e-4 ? 'active' : 'ghost'}`} onClick={() => { setPhi(p.v); setShots([]); }}>
                {p.label}
              </button>
            ))}
          </div>
          <Slider label={<span>t qubits</span>} value={t} min={1} max={8} step={1} onChange={(v) => { setT(v); setShots([]); }} format={(v) => `${v} → ${2 ** v} outcomes`} />
        </div>
        <div className="mono" style={{ fontSize: '0.92rem' }}>
          <div className="faint" style={{ fontSize: '0.78rem', fontFamily: 'var(--font)' }}>φ in binary</div>
          <div style={{ fontSize: '1.15rem', letterSpacing: '0.04em' }}>
            0.<span style={{ color: 'var(--yellow)' }}>{bits.slice(0, t)}</span>
            <span className="faint">{bits.slice(t)}…</span>
          </div>
          <div className="faint" style={{ fontSize: '0.8rem', fontFamily: 'var(--font)', marginTop: 4 }}>
            {exact ? `φ has an exact ${t}-bit expansion, so the readout is certain.` : `φ needs more than ${t} bits, so the readout is a best guess among the nearest ${t}-bit fractions.`}
          </div>
          <div style={{ marginTop: 8 }}>
            most likely m = {best} = {bitstr(best, t)}₂ → φ ≈ {best}/{T} = {(best / T).toFixed(4)}
          </div>
          <div>P(most likely) = {pct(dist[best])} · P(one of the 2 nearest) = {pct(pNear)}</div>
        </div>
      </div>

      <div className="faint" style={{ fontSize: '0.8rem', margin: '12px 0 4px' }}>
        Kicked-back phases on the counting qubits (q<sub>j</sub> controls <Tex>{'U^{2^{t-1-j}}'}</Tex>). Doubling the phase shifts φ's binary point one place.
      </div>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        {kick.map((turns, q) => (
          <ClockDial key={q} turns={turns} size={t > 6 ? 58 : 70} label={`q${q}: U^${2 ** (t - 1 - q)}`} sub={`0.${binaryDigits(turns, Math.min(4, q + 1))}…`} />
        ))}
      </div>

      <div className="faint" style={{ fontSize: '0.8rem', margin: '12px 0 4px' }}>
        After the inverse QFT: probability of reading m (the pink line is the true φ·2<sup>t</sup> = {(phi * T).toFixed(2)})
      </div>
      <ProbBars
        bars={dist.map((p, m) => ({ value: p, label: t <= 4 ? `${m}/${T}` : String(m), highlight: m === best }))}
        yMax={1}
        height={170}
        marker={{ x: phi * T, label: 'φ·2ᵗ' }}
      />
      <div className="row" style={{ gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
        <button className="btn small primary" onClick={() => setShots(Array.from({ length: 10 }, () => sampleFrom(dist)))}>
          ⚛ run 10 shots
        </button>
        {shots.length > 0 && (
          <span className="mono" style={{ fontSize: '0.85rem' }}>
            {shots.map((m, i) => (
              <span key={i} style={{ color: m === best ? 'var(--yellow)' : 'var(--text-dim)', marginRight: 8 }}>
                {(m / T).toFixed(t > 5 ? 4 : 3)}
              </span>
            ))}
          </span>
        )}
      </div>
    </Widget>
  );
}
