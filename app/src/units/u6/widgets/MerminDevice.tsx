import React, { useEffect, useRef, useState } from 'react';
import { Widget, Segmented } from '../../../components/ui';
import { useChallengeGate } from '../../../components/lesson/gates';
import { MERMIN_ANGLES, pAgree } from '../lib/bell';

type Mode = 'quantum' | 'local';
type Set3 = [0 | 1, 0 | 1, 0 | 1];
const SETS: Set3[] = Array.from({ length: 8 }, (_, m) => [((m >> 2) & 1) as 0 | 1, ((m >> 1) & 1) as 0 | 1, (m & 1) as 0 | 1]);
const COLORS = ['#fc6255', '#83c167']; // 0 = red, 1 = green
const NAME = ['R', 'G'];

interface Run {
  sa: number;
  sb: number;
  a: 0 | 1;
  b: 0 | 1;
}

/**
 * Mermin's "Is the moon there?" device: two detectors with 3 settings each, lights flash red/green.
 * Program the source with instruction sets and try to reproduce the quantum statistics:
 * same settings always agree, and overall agreement is 50%. (Impossible: local ⇒ ≥ 5/9.)
 */
export function MerminDevice({ challengeId }: { challengeId?: string }) {
  const [mode, setMode] = useState<Mode>('local');
  const [weights, setWeights] = useState<number[]>([0, 1, 1, 1, 1, 1, 1, 0]);
  const [stats, setStats] = useState({ same: 0, sameAgree: 0, all: 0, allAgree: 0 });
  const [last, setLast] = useState<Run | null>(null);
  const [triedLocal, setTriedLocal] = useState(0);
  const [triedQuantum, setTriedQuantum] = useState(false);
  const flashT = useRef<number | null>(null);
  const [flash, setFlash] = useState(false);
  useChallengeGate(challengeId ?? 'mermin-none', !challengeId || (triedLocal >= 1000 && triedQuantum));
  useEffect(() => () => { if (flashT.current) window.clearTimeout(flashT.current); }, []);

  const totalW = weights.reduce((a, b) => a + b, 0);
  const one = (): Run => {
    const sa = Math.floor(Math.random() * 3), sb = Math.floor(Math.random() * 3);
    if (mode === 'quantum') {
      const a = (Math.random() < 0.5 ? 0 : 1) as 0 | 1;
      const b = (Math.random() < pAgree(MERMIN_ANGLES[sa], MERMIN_ANGLES[sb]) ? a : 1 - a) as 0 | 1;
      return { sa, sb, a, b };
    }
    let r = Math.random() * (totalW || 1);
    let k = 0;
    for (; k < 7; k++) {
      r -= weights[k];
      if (r < 0) break;
    }
    if (!totalW) k = 0;
    const s = SETS[k];
    return { sa, sb, a: s[sa], b: s[sb] };
  };

  const run = (n: number) => {
    let same = 0, sameAgree = 0, allAgree = 0;
    let lastRun: Run | null = null;
    for (let i = 0; i < n; i++) {
      const r = one();
      lastRun = r;
      if (r.sa === r.sb) {
        same++;
        if (r.a === r.b) sameAgree++;
      }
      if (r.a === r.b) allAgree++;
    }
    setStats((s) => ({ same: s.same + same, sameAgree: s.sameAgree + sameAgree, all: s.all + n, allAgree: s.allAgree + allAgree }));
    setLast(lastRun);
    setFlash(true);
    if (flashT.current) window.clearTimeout(flashT.current);
    flashT.current = window.setTimeout(() => setFlash(false), 350);
    if (mode === 'local') setTriedLocal((t) => t + n);
    else setTriedQuantum(true);
  };
  const reset = () => setStats({ same: 0, sameAgree: 0, all: 0, allAgree: 0 });
  useEffect(reset, [mode, weights]);

  // exact prediction for the current local mix
  const exactLocal = totalW
    ? weights.reduce((acc, w, k) => {
        const s = SETS[k];
        let ag = 0;
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (s[i] === s[j]) ag++;
        return acc + (w / totalW) * (ag / 9);
      }, 0)
    : 1;
  const sameRate = stats.same ? stats.sameAgree / stats.same : null;
  const allRate = stats.all ? stats.allAgree / stats.all : null;

  const detector = (side: 'A' | 'B') => {
    const s = last ? (side === 'A' ? last.sa : last.sb) : -1;
    const v = last ? (side === 'A' ? last.a : last.b) : -1;
    return (
      <div className="panel" style={{ padding: 10, textAlign: 'center', minWidth: 130 }}>
        <div className="faint" style={{ fontSize: '0.75rem' }}>{side === 'A' ? 'Alice' : 'Bob'}'s detector</div>
        <div className="row" style={{ justifyContent: 'center', gap: 4, margin: '6px 0' }}>
          {[0, 1, 2].map((k) => (
            <span
              key={k}
              className="mono"
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                display: 'inline-grid',
                placeItems: 'center',
                fontSize: '0.8rem',
                border: '1px solid var(--border)',
                background: s === k ? 'var(--blue-d)' : 'var(--panel-2)',
                color: s === k ? '#04141a' : 'var(--text-dim)',
              }}
            >
              {k + 1}
            </span>
          ))}
        </div>
        <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
          {[0, 1].map((c0) => (
            <span
              key={c0}
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                border: `2px solid ${COLORS[c0]}`,
                background: v === c0 ? COLORS[c0] : 'transparent',
                boxShadow: v === c0 && flash ? `0 0 18px ${COLORS[c0]}` : 'none',
                transition: 'all .2s',
              }}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <Widget title="Mermin's device: can instruction sets fake it?">
      <div className="row" style={{ gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <span className="faint" style={{ fontSize: '0.85rem' }}>source:</span>
        <Segmented
          options={[
            { value: 'local' as Mode, label: '🎩 your instruction sets (local hidden variables)' },
            { value: 'quantum' as Mode, label: '⚛ entangled pairs' },
          ]}
          value={mode}
          onChange={setMode}
        />
      </div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        {detector('A')}
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '2rem' }}>{mode === 'quantum' ? '⚛' : '🎩'}</div>
          <div className="faint" style={{ fontSize: '0.8rem' }}>settings 1, 2, 3 chosen at random on each side after the pair leaves</div>
          <div className="row" style={{ justifyContent: 'center', gap: 6, marginTop: 8 }}>
            <button className="btn primary small" onClick={() => run(1)}>Run once</button>
            <button className="btn small" onClick={() => run(1000)}>⚡ 1000 runs</button>
            <button className="btn small ghost" onClick={reset}>reset</button>
          </div>
        </div>
        {detector('B')}
      </div>

      {mode === 'local' && (
        <div style={{ marginTop: 12 }}>
          <div className="faint" style={{ fontSize: '0.8rem', marginBottom: 6 }}>
            Program the source: how often should it print each instruction set (colour for setting 1, 2, 3)? Both particles get the same set, so equal settings always agree.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 6 }}>
            {SETS.map((s, k) => (
              <div key={k} className="panel" style={{ padding: 6, textAlign: 'center', opacity: weights[k] ? 1 : 0.55 }}>
                <div className="row" style={{ justifyContent: 'center', gap: 2 }}>
                  {s.map((v, i) => (
                    <span key={i} className="mono" style={{ width: 18, height: 18, borderRadius: 4, background: COLORS[v], color: '#111', fontSize: '0.7rem', fontWeight: 700, display: 'inline-grid', placeItems: 'center' }}>
                      {NAME[v]}
                    </span>
                  ))}
                </div>
                <div className="row" style={{ justifyContent: 'center', gap: 4, marginTop: 4 }}>
                  <button className="btn small" style={{ padding: '0 7px' }} onClick={() => setWeights((w) => w.map((x, i) => (i === k ? Math.max(0, x - 1) : x)))}>−</button>
                  <span className="mono" style={{ fontSize: '0.8rem', minWidth: 14 }}>{weights[k]}</span>
                  <button className="btn small" style={{ padding: '0 7px' }} onClick={() => setWeights((w) => w.map((x, i) => (i === k ? Math.min(9, x + 1) : x)))}>+</button>
                </div>
                <div className="faint mono" style={{ fontSize: '0.65rem' }}>
                  agrees {(() => { let ag = 0; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (s[i] === s[j]) ag++; return `${ag}/9`; })()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 12 }}>
        <div className="panel" style={{ padding: 10 }}>
          <div className="faint" style={{ fontSize: '0.78rem' }}>Fact 1: when the settings are equal…</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: sameRate === null ? 'var(--text-faint)' : sameRate > 0.999 ? 'var(--green)' : 'var(--red)' }}>
            {sameRate === null ? '—' : `${(sameRate * 100).toFixed(1)}% agree`}
          </div>
          <div className="faint" style={{ fontSize: '0.75rem' }}>quantum: always 100%</div>
        </div>
        <div className="panel" style={{ padding: 10 }}>
          <div className="faint" style={{ fontSize: '0.78rem' }}>Fact 2: over all runs (random settings)…</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: allRate === null ? 'var(--text-faint)' : Math.abs(allRate - 0.5) < 0.03 ? 'var(--green)' : 'var(--yellow)' }}>
            {allRate === null ? '—' : `${(allRate * 100).toFixed(1)}% agree`}
          </div>
          <div className="faint" style={{ fontSize: '0.75rem' }}>
            quantum: 50%{mode === 'local' && ` · your mix predicts exactly ${(exactLocal * 100).toFixed(1)}%`} · {stats.all} runs
          </div>
        </div>
      </div>
      {mode === 'local' && stats.all >= 1000 && (
        <div className="panel pop" style={{ marginTop: 10, padding: 10, borderColor: 'var(--yellow)' }}>
          {exactLocal >= 5 / 9 - 1e-9
            ? `Your source agrees at least 55.6% of the time. Every instruction set agrees on at least 5 of the 9 setting pairs, so no mixture can get below 5/9. Quantum pairs get 50%.`
            : 'Hmm, that should be impossible…'}
        </div>
      )}
      {challengeId && !(triedLocal >= 1000 && triedQuantum) && (
        <div className="faint" style={{ fontSize: '0.8rem', marginTop: 8 }}>
          To continue: run at least 1000 rounds with your own instruction sets, then try the entangled source.
        </div>
      )}
    </Widget>
  );
}
