import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Widget, Segmented } from '../../../components/ui';
import { C, c, abs2, scale, fmt, add, sub } from '../../../engine/complex';
import { MiniBloch } from '../../../widgets/MiniBloch';
import { PhaseLegend } from '../../../widgets/AmplitudeView';
import { ampsToBloch } from '../../../engine/qsim';
import { AmpGrid, useTween } from './parts';
import { reducedBloch2 } from '../lib/bell';

const S2 = Math.SQRT1_2;
const STATES: { key: string; label: string; amps: C[] }[] = [
  { key: 'phi', label: 'Φ⁺', amps: [c(S2), c(0), c(0), c(S2)] },
  { key: 'psim', label: 'Ψ⁻', amps: [c(0), c(S2), c(-S2), c(0)] },
  { key: 'part', label: '0.8|00⟩ + 0.6|11⟩', amps: [c(0.8), c(0), c(0), c(0.6)] },
  { key: 'mix', label: '(|00⟩ + |01⟩ + |10⟩ − |11⟩)/2', amps: [c(0.5), c(0.5), c(0.5), c(-0.5)] },
  { key: 'prod', label: '|+⟩|0⟩ (product)', amps: [c(S2), c(0), c(S2), c(0)] },
];

/** Re-express the state with q0 in the X basis (apply H to q0): rows become |+⟩, |−⟩. */
function hOnQ0(a: C[]): C[] {
  return [scale(add(a[0], a[2]), S2), scale(add(a[1], a[3]), S2), scale(sub(a[0], a[2]), S2), scale(sub(a[1], a[3]), S2)];
}

/**
 * Alice measures her qubit (q0) of a shared two-qubit state: one row of the amplitude grid is
 * eliminated, the surviving row is renormalised, and Bob's qubit is left in a definite state.
 */
export function PartialMeasure() {
  const [sk, setSk] = useState('phi');
  const [basis, setBasis] = useState<'Z' | 'X'>('Z');
  const [outcome, setOutcome] = useState<0 | 1 | null>(null);
  const [phase, setPhase] = useState<0 | 1 | 2>(0); // 0 idle, 1 row fading, 2 renormalised
  const [log, setLog] = useState<string[]>([]);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const base = STATES.find((s) => s.key === sk)!.amps;
  const shown = useMemo(() => (basis === 'Z' ? base : hOnQ0(base)), [base, basis]);
  const p0 = abs2(shown[0]) + abs2(shown[1]);
  const pOut = outcome === null ? 1 : outcome === 0 ? p0 : 1 - p0;
  const k = useTween(phase === 2 ? 1 / Math.sqrt(Math.max(pOut, 1e-9)) : 1, 600);
  const display = shown.map((z, i) => {
    if (outcome === null || phase === 0) return z;
    if (i >> 1 !== outcome) return phase === 2 ? c(0) : z;
    return scale(z, k);
  });

  const bobBefore = reducedBloch2(base)[1];
  const bobAfter = outcome === null ? null : (() => {
    const r = outcome;
    const a = shown[2 * r], b = shown[2 * r + 1];
    const n = Math.sqrt(abs2(a) + abs2(b));
    return ampsToBloch(scale(a, 1 / n), scale(b, 1 / n));
  })();
  const bobKet = outcome === null ? null : (() => {
    const a = shown[2 * outcome], b = shown[2 * outcome + 1];
    const n = Math.sqrt(abs2(a) + abs2(b));
    return `${fmt(scale(a, 1 / n), 3)}|0⟩ + ${fmt(scale(b, 1 / n), 3)}|1⟩`.replace('+ -', '− ');
  })();

  const reset = () => {
    setOutcome(null);
    setPhase(0);
  };
  const measure = () => {
    const r: 0 | 1 = Math.random() < p0 ? 0 : 1;
    setOutcome(r);
    setPhase(1);
    const lab = basis === 'Z' ? String(r) : r === 0 ? '+' : '−';
    setLog((l) => [`${lab}`, ...l].slice(0, 24));
    timer.current = window.setTimeout(() => setPhase(2), 650);
  };
  const rowLab = basis === 'Z' ? ['0', '1'] : ['+', '−'];

  return (
    <Widget title="Alice measures her half">
      <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <span className="faint" style={{ fontSize: '0.85rem' }}>shared state:</span>
        {STATES.map((s) => (
          <button key={s.key} className={`btn small ${sk === s.key ? 'active' : ''}`} onClick={() => { setSk(s.key); reset(); setLog([]); }}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="row" style={{ gap: 10, marginBottom: 10 }}>
        <span className="faint" style={{ fontSize: '0.85rem' }}>Alice measures in basis:</span>
        <Segmented options={[{ value: 'Z', label: 'Z  (0 / 1)' }, { value: 'X', label: 'X  (+ / −)' }]} value={basis} onChange={(b) => { setBasis(b); reset(); }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 18, alignItems: 'center' }}>
        <div style={{ justifySelf: 'center', textAlign: 'center' }}>
          <div className="faint" style={{ fontSize: '0.78rem', marginBottom: 6 }}>
            rows = Alice's outcome ({basis} basis), columns = Bob's qubit in Z
          </div>
          <AmpGrid
            amps={display}
            size={72}
            rowLabel="A"
            colLabel="B"
            rowNames={rowLab.map((l) => `A=${l}`)}
            highlightRow={outcome ?? undefined}
            dimRow={outcome === null || phase === 0 ? undefined : 1 - outcome}
          />
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 10 }}>
            <button className="btn primary" onClick={measure} disabled={outcome !== null}>
              📏 Alice measures
            </button>
            <button className="btn ghost" onClick={reset} disabled={outcome === null}>
              ↺ re-share the pair
            </button>
          </div>
          <div style={{ marginTop: 6 }}>
            <PhaseLegend size={34} />
          </div>
        </div>
        <div className="col" style={{ gap: 10 }}>
          <div className="mono" style={{ fontSize: '0.85rem' }}>
            P(Alice gets {rowLab[0]}) = {(p0 * 100).toFixed(1)}% · P({rowLab[1]}) = {((1 - p0) * 100).toFixed(1)}%
          </div>
          <div className="row" style={{ gap: 16 }}>
            <div style={{ textAlign: 'center' }}>
              <MiniBloch v={bobBefore} size={96} color={Math.hypot(...bobBefore) < 0.99 ? '#e07ab6' : '#fcd34d'} />
              <div className="faint" style={{ fontSize: '0.75rem' }}>Bob's qubit before</div>
            </div>
            <div style={{ fontSize: '1.4rem', color: 'var(--text-faint)' }}>→</div>
            <div style={{ textAlign: 'center', opacity: bobAfter ? 1 : 0.3, transition: 'opacity .4s' }}>
              <MiniBloch v={bobAfter ?? [0, 0, 0]} size={96} color="#fcd34d" />
              <div className="faint" style={{ fontSize: '0.75rem' }}>Bob's qubit after</div>
            </div>
          </div>
          {outcome !== null && phase === 2 && (
            <div className="panel pop" style={{ padding: 10 }}>
              Alice got <b style={{ color: 'var(--yellow)' }}>{rowLab[outcome]}</b> (probability {(pOut * 100).toFixed(0)}%). The other row is gone, and the surviving
              row is divided by <span className="mono">√{pOut.toFixed(3)}</span> so the probabilities add to 1 again.
              <div className="mono" style={{ marginTop: 4, color: 'var(--text)' }}>Bob now holds: {bobKet}</div>
            </div>
          )}
          {log.length > 0 && (
            <div className="faint mono" style={{ fontSize: '0.78rem' }}>
              Alice's outcomes so far: {log.join(' ')}
            </div>
          )}
        </div>
      </div>
    </Widget>
  );
}
