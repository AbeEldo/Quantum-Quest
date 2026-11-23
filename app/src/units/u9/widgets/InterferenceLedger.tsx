import React, { useMemo, useState } from 'react';
import { Widget, Segmented, Tex } from '../../../components/ui';
import { c, phaseColor } from '../../../engine/complex';
import { PhasorClock } from '../../../widgets/AmplitudeView';
import { BitToggles, ProbBars, useWidth, useTweenArray, pct } from './viz';
import { bitstr, dot2, djTable } from '../algos';

const n = 3;
const N = 1 << n;

/**
 * The Hadamard transform as interference, made explicit: for each output y, the amplitude is
 * (1/2^n) Σ_x (−1)^{f(x) ⊕ x·y}. Each term is drawn as a ±1 arrow; they add tip to tail.
 */
export function InterferenceLedger() {
  const [mode, setMode] = useState<'bv' | 'dj' | 'custom'>('bv');
  const [secret, setSecret] = useState(0b101);
  const [table, setTable] = useState<number[]>(() => djTable('balanced', n));
  const [y, setY] = useState(0b101);

  const f = useMemo(() => (mode === 'bv' ? Array.from({ length: N }, (_, x) => dot2(x, secret)) : table), [mode, secret, table]);
  const outAmps = useMemo(() => Array.from({ length: N }, (_, yy) => f.reduce((acc, fx, x) => acc + ((fx ^ dot2(x, yy)) ? -1 : 1), 0) / N), [f]);
  const probs = outAmps.map((a) => a * a);
  const tweened = useTweenArray(probs, 450);
  const terms = Array.from({ length: N }, (_, x) => ((f[x] ^ dot2(x, y)) ? -1 : 1));
  const sum = terms.reduce((a, b) => a + b, 0);
  const ones = f.reduce((a, b) => a + b, 0);
  const kind = ones === 0 || ones === N ? 'constant' : ones === N / 2 ? 'balanced' : 'neither (breaks the promise)';

  const [ref, W] = useWidth<HTMLDivElement>(560);
  const rowH = 24, top = 26;
  const H = top + N * rowH + 34;
  const colsW = 190;
  const plotL = colsW + 16, plotR = W - 16;
  const unit = (plotR - plotL) / (2 * N + 1);
  const sx = (v: number) => (plotL + plotR) / 2 + v * unit;

  return (
    <Widget title="Interference ledger: where does the amplitude go?">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <Segmented
          options={[
            { value: 'bv', label: 'Bernstein–Vazirani: f(x) = s·x' },
            { value: 'dj', label: 'Deutsch–Jozsa' },
            { value: 'custom', label: 'Build any f' },
          ]}
          value={mode}
          onChange={setMode}
        />
        {mode === 'bv' && (
          <span className="row" style={{ gap: 6 }}>
            <span className="dim">secret s =</span>
            <BitToggles n={n} value={secret} onChange={(v) => { setSecret(v); setY(v); }} />
          </span>
        )}
        {mode === 'dj' && (
          <span className="row" style={{ gap: 6 }}>
            <button className="btn small" onClick={() => { setTable(djTable('constant0', n)); setY(0); }}>constant 0</button>
            <button className="btn small" onClick={() => { setTable(djTable('constant1', n)); setY(0); }}>constant 1</button>
            <button className="btn small" onClick={() => { setTable(djTable('balanced', n)); setY(0); }}>random balanced ↻</button>
          </span>
        )}
        {mode === 'custom' && <span className="faint" style={{ fontSize: '0.85rem' }}>Click an input below to flip f(x).</span>}
      </div>

      <div className="faint" style={{ fontSize: '0.78rem' }}>
        ① After <Tex>{'H^{\\otimes 3}'}</Tex> and one phase-oracle query: every input carries amplitude <Tex>{'(-1)^{f(x)}/\\sqrt8'}</Tex>
      </div>
      <div className="row" style={{ gap: 6, margin: '6px 0 12px', flexWrap: 'wrap' }}>
        {f.map((fx, x) => (
          <div
            key={x}
            onClick={mode === 'custom' ? () => setTable((t) => t.map((v, i) => (i === x ? v ^ 1 : v))) : undefined}
            style={{
              textAlign: 'center',
              padding: '4px 6px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--panel-2)',
              cursor: mode === 'custom' ? 'pointer' : 'default',
              minWidth: 52,
            }}
          >
            <div className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>|{bitstr(x, n)}⟩</div>
            <PhasorClock z={c(fx ? -1 : 1)} size={32} />
            <div className="mono" style={{ fontSize: '0.72rem', color: fx ? 'var(--blue)' : 'var(--red)' }}>f={fx}</div>
          </div>
        ))}
        <span className="pill" style={{ alignSelf: 'center' }}>f is {kind}</span>
      </div>

      <div className="faint" style={{ fontSize: '0.78rem' }}>② After the final <Tex>{'H^{\\otimes 3}'}</Tex>: probability of each output y (click a bar to audit it)</div>
      <ProbBars
        bars={tweened.map((p, yy) => ({ value: p, label: bitstr(yy, n), highlight: yy === y, color: yy === y ? '#fcd34d' : undefined }))}
        yMax={1}
        height={150}
        onBarClick={setY}
        selected={y}
        labelEvery={1}
      />

      <div className="faint" style={{ fontSize: '0.78rem', marginTop: 10 }}>
        ③ The ledger for output <b className="mono" style={{ color: 'var(--yellow)' }}>|{bitstr(y, n)}⟩</b>: amplitude ={' '}
        <Tex>{`\\frac{1}{8}\\sum_x (-1)^{f(x)\\,\\oplus\\, x\\cdot y}`}</Tex>
      </div>
      <div ref={ref} style={{ width: '100%' }}>
        <svg width={W} height={H} style={{ display: 'block' }}>
          {['x', 'f(x)', 'x·y', 'sign'].map((h, k) => (
            <text key={h} x={14 + k * 46} y={16} fontSize={11} fill="#6b7385" fontFamily="var(--mono)">{h}</text>
          ))}
          <line x1={sx(0)} x2={sx(0)} y1={top - 6} y2={H - 26} stroke="#4a5368" />
          {[-N, -N / 2, N / 2, N].map((v) => (
            <g key={v}>
              <line x1={sx(v)} x2={sx(v)} y1={top - 6} y2={H - 26} stroke="#2a3142" strokeDasharray="2 4" />
              <text x={sx(v)} y={H - 12} fontSize={10} fill="#6b7385" textAnchor="middle">{v > 0 ? `+${v}` : v}</text>
            </g>
          ))}
          {terms.map((t, x) => {
            const before = terms.slice(0, x).reduce((a, b) => a + b, 0);
            const yy = top + x * rowH + rowH / 2;
            const col = phaseColor(t > 0 ? 0 : Math.PI);
            return (
              <g key={x}>
                <text x={14} y={yy + 4} fontSize={12} fill="#cfd6e4" fontFamily="var(--mono)">{bitstr(x, n)}</text>
                <text x={14 + 46} y={yy + 4} fontSize={12} fill="#9aa3b5" fontFamily="var(--mono)">{f[x]}</text>
                <text x={14 + 92} y={yy + 4} fontSize={12} fill="#9aa3b5" fontFamily="var(--mono)">{dot2(x, y)}</text>
                <text x={14 + 138} y={yy + 4} fontSize={13} fill={col} fontFamily="var(--mono)" fontWeight={700}>{t > 0 ? '+1' : '−1'}</text>
                <line x1={sx(before)} x2={sx(before + t) - (t > 0 ? 5 : -5)} y1={yy} y2={yy} stroke={col} strokeWidth={3} strokeLinecap="round" />
                <path d={t > 0 ? `M${sx(before + t)} ${yy} l-8 -5 l0 10 z` : `M${sx(before + t)} ${yy} l8 -5 l0 10 z`} fill={col} />
                {x > 0 && <line x1={sx(before)} x2={sx(before)} y1={yy - rowH + 4} y2={yy} stroke="#4a5368" strokeDasharray="2 2" />}
              </g>
            );
          })}
          <circle cx={sx(sum)} cy={H - 30} r={6} fill={sum === 0 ? '#6b7385' : '#fcd34d'} />
          <text x={sx(sum) + (sum >= 0 ? 10 : -10)} y={H - 26} fontSize={12} fill={sum === 0 ? '#9aa3b5' : '#fcd34d'} textAnchor={sum >= 0 ? 'start' : 'end'}>
            sum = {sum} → amplitude {sum}/8, P = {pct((sum / 8) ** 2)}
          </text>
        </svg>
      </div>
      <div className="dim" style={{ fontSize: '0.88rem' }}>
        {sum === 0
          ? 'The arrows cancel perfectly: destructive interference. This output can never be observed.'
          : Math.abs(sum) === N
            ? 'Every arrow points the same way: complete constructive interference. This output is certain.'
            : 'Partial cancellation: this output appears with some probability.'}
      </div>
    </Widget>
  );
}
