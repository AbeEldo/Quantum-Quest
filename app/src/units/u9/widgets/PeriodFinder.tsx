import React, { useMemo, useState } from 'react';
import { Widget, Segmented, Toggle } from '../../../components/ui';
import { ProbBars, pct } from './viz';
import { ModExpPlot, ContinuedFractionPanel, GcdStep } from './shorParts';
import { goodBases, multiplicativeOrder, periodFindingSimulate, shorCountingBits, shorWorkBits, sampleFrom, modpow } from '../algos';

const NS = [15, 21, 33, 35];

/**
 * Order finding, end to end, on the state-vector engine: f(x) = a^x mod N, the counting-register distribution after
 * the inverse QFT (peaks near multiples of Q/r), then continued fractions and the gcd step.
 */
export function PeriodFinder({ initialN = 15, initialA = 7 }: { initialN?: number; initialA?: number }) {
  const [N, setN] = useState(initialN);
  const bases = goodBases(N);
  const [a, setA] = useState(bases.includes(initialA) ? initialA : bases[0]);
  const [showGuides, setShowGuides] = useState(false);
  const [y, setY] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const r = multiplicativeOrder(a, N);
  const t = shorCountingBits(N);
  const Q = 1 << t;
  const dist = useMemo(() => periodFindingSimulate(a, N, t), [a, N, t]);
  const okPick = picked !== null && modpow(a, picked, N) === 1;

  const choose = (NN: number, aa: number) => {
    setN(NN);
    setA(aa);
    setY(null);
    setPicked(null);
  };

  return (
    <Widget title="Period finding: the quantum heart of Shor's algorithm">
      <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <span className="dim">N</span>
        <Segmented options={NS.map((x) => ({ value: x, label: String(x) }))} value={N} onChange={(x) => choose(x, goodBases(x).includes(7) ? 7 : 2)} />
        <span className="dim" style={{ marginLeft: 6 }}>a</span>
        <select value={a} onChange={(e) => choose(N, parseInt(e.target.value, 10))} style={{ background: 'var(--panel-2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 8px' }}>
          {bases.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <span className="faint mono" style={{ fontSize: '0.8rem', marginLeft: 'auto' }}>
          {t} counting qubits (Q = 2^{t} ≥ N²) + {shorWorkBits(N)} work qubits = {t + shorWorkBits(N)} qubits simulated
        </span>
      </div>

      <div className="faint" style={{ fontSize: '0.8rem' }}>① The function the quantum computer evaluates in superposition</div>
      <ModExpPlot a={a} N={N} r={r} X={Math.min(48, Math.max(24, 3 * r + 4))} showPeriod={showGuides} />

      <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
        <span className="faint" style={{ fontSize: '0.8rem' }}>② Counting register after the inverse QFT (click a bar to "measure" it)</span>
        <Toggle label="reveal r" value={showGuides} onChange={setShowGuides} />
      </div>
      <ProbBars
        bars={dist.map((p, yy) => ({ value: p, highlight: yy === y }))}
        height={160}
        onBarClick={(yy) => { setY(yy); setPicked(null); }}
        selected={y}
        guides={showGuides ? Array.from({ length: r }, (_, j) => ({ x: (j * Q) / r - 0.5, label: j === 0 ? '0' : j === 1 ? 'Q/r' : `${j}Q/r` })) : []}
        xTitle={`y = 0 … ${Q - 1}`}
      />
      <div className="row" style={{ gap: 8, margin: '6px 0 10px', flexWrap: 'wrap' }}>
        <button className="btn small primary" onClick={() => { setY(sampleFrom(dist)); setPicked(null); }}>
          ⚛ measure (sample y)
        </button>
        {y !== null && (
          <span className="mono" style={{ fontSize: '0.9rem' }}>
            measured y = {y} (probability {pct(dist[y], 2)})
          </span>
        )}
        {showGuides && <span className="faint" style={{ fontSize: '0.82rem' }}>r = {r}, so peaks sit near multiples of Q/r = {(Q / r).toFixed(2)}</span>}
      </div>

      {y !== null && (
        <>
          <div className="faint" style={{ fontSize: '0.8rem', marginBottom: 4 }}>③ Classical post-processing: continued fractions (click a convergent to test its denominator)</div>
          {y === 0 ? (
            <div className="panel dim" style={{ padding: 12 }}>y = 0 carries no information (it is the k = 0 peak). Measure again.</div>
          ) : (
            <ContinuedFractionPanel y={y} Q={Q} a={a} N={N} onPick={setPicked} picked={picked} />
          )}
          {picked !== null && !okPick && (
            <div className="faint" style={{ fontSize: '0.85rem', marginTop: 6 }}>
              {a}^{picked} mod {N} ≠ 1, so {picked} is not the period. (If y/Q ≈ k/r with gcd(k, r) &gt; 1, you only get a divisor of r: try multiples, or measure again.)
            </div>
          )}
          {okPick && (
            <div style={{ marginTop: 8 }}>
              <div className="faint" style={{ fontSize: '0.8rem', marginBottom: 4 }}>
                ④ {picked === r ? `r = ${r}` : `${a}^${picked} ≡ 1, so the order divides ${picked}; checking its divisors gives r = ${r}`}: split N with gcds
              </div>
              <GcdStep a={a} N={N} r={r} />
            </div>
          )}
        </>
      )}
    </Widget>
  );
}
