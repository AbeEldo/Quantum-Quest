import React, { useMemo, useRef, useState } from 'react';
import { Widget, Slider, Segmented, Stat } from '../../../components/ui';
import { Plot } from '../../../widgets/Plot';
import { mulberry32 } from '../../../engine/qsim';

function binom(n: number, k: number) {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}
/** Probability that majority vote over n copies fails at flip probability p. */
export function repFail(n: number, p: number) {
  let s = 0;
  for (let k = Math.floor(n / 2) + 1; k <= n; k++) s += binom(n, k) * p ** k * (1 - p) ** (n - k);
  return s;
}

interface Row {
  bit: 0 | 1;
  sent: number[];
  vote: 0 | 1;
}

const COLORS: Record<number, string> = { 1: '#9aa3b5', 3: '#58c4dd', 5: '#83c167', 7: '#e07ab6' };

/** Classical repetition code over a binary symmetric channel: encode, flip, majority vote. */
export function RepetitionCodeSim() {
  const [n, setN] = useState(3);
  const [p, setP] = useState(0.1);
  const [rows, setRows] = useState<Row[]>([]);
  const [tally, setTally] = useState({ sent: 0, rawErr: 0, logErr: 0 });
  const rng = useRef(mulberry32(42));

  const send = (count: number) => {
    const out: Row[] = [];
    let rawErr = 0, logErr = 0;
    for (let i = 0; i < count; i++) {
      const bit: 0 | 1 = rng.current() < 0.5 ? 0 : 1;
      const sent = Array.from({ length: n }, () => (rng.current() < p ? 1 - bit : bit));
      const ones = sent.reduce((a, b) => a + b, 0);
      const vote: 0 | 1 = ones > n / 2 ? 1 : 0;
      rawErr += sent[0] !== bit ? 1 : 0;
      logErr += vote !== bit ? 1 : 0;
      out.push({ bit, sent, vote });
    }
    setRows((r) => [...out.slice(-8).reverse(), ...r].slice(0, 8));
    setTally((t) => ({ sent: t.sent + count, rawErr: t.rawErr + rawErr, logErr: t.logErr + logErr }));
  };

  const reset = (nn = n) => {
    setN(nn);
    setRows([]);
    setTally({ sent: 0, rawErr: 0, logErr: 0 });
  };

  const series = useMemo(
    () =>
      [1, 3, 5, 7].map((k) => ({
        f: (x: number) => repFail(k, x),
        color: COLORS[k],
        label: k === 1 ? 'no code (n = 1)' : `n = ${k}${k === 3 ? ': 3p² − 2p³' : ''}`,
        width: k === n ? 3.2 : 1.6,
        dashed: k === 1,
      })),
    [n],
  );

  return (
    <Widget title="The repetition code: copy, corrupt, vote">
      <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <Segmented value={n} onChange={(v) => reset(v)} options={[1, 3, 5, 7].map((k) => ({ value: k, label: `${k} cop${k === 1 ? 'y' : 'ies'}` }))} />
        <div style={{ minWidth: 260, flex: 1 }}>
          <Slider label="flip probability p" value={p} min={0} max={0.6} step={0.005} onChange={(v) => { setP(v); reset(); }} format={(x) => `${(x * 100).toFixed(1)}%`} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px,1fr) 1.2fr', gap: 16 }}>
        <div>
          <div className="row" style={{ gap: 6, marginBottom: 8 }}>
            <button className="btn small" onClick={() => send(1)}>send 1 bit</button>
            <button className="btn small primary" onClick={() => send(1000)}>send 1,000</button>
            <button className="btn small ghost" onClick={() => reset()}>reset</button>
          </div>
          <div className="mono" style={{ fontSize: '0.88rem', minHeight: 200 }}>
            {rows.map((r, i) => (
              <div key={i} className={i === 0 ? 'pop' : ''} style={{ display: 'flex', gap: 10, alignItems: 'center', opacity: 1 - i * 0.09 }}>
                <span className="faint">bit {r.bit} →</span>
                <span>
                  {r.sent.map((b, k) => (
                    <span key={k} style={{ display: 'inline-block', width: 18, textAlign: 'center', borderRadius: 4, margin: 1, background: b !== r.bit ? 'rgba(252,98,85,.3)' : 'rgba(88,196,221,.12)', color: b !== r.bit ? '#fc6255' : '#cfd6e4' }}>
                      {b}
                    </span>
                  ))}
                </span>
                <span className="faint">vote →</span>
                <b style={{ color: r.vote === r.bit ? 'var(--green)' : 'var(--red)' }}>{r.vote} {r.vote === r.bit ? '✓' : '✗'}</b>
              </div>
            ))}
            {!rows.length && <span className="faint">Send some bits through the noisy channel…</span>}
          </div>
          <div className="row" style={{ gap: 18, marginTop: 6 }}>
            <Stat label="bits sent" value={tally.sent} />
            <Stat label="raw error rate" value={tally.sent ? `${((tally.rawErr / tally.sent) * 100).toFixed(1)}%` : '—'} color="var(--red)" />
            <Stat label="after voting" value={tally.sent ? `${((tally.logErr / tally.sent) * 100).toFixed(2)}%` : '—'} color="var(--green)" />
          </div>
        </div>
        <div>
          <Plot
            height={260}
            xRange={[0, 0.6]}
            yRange={[0, 0.6]}
            xLabel="physical flip probability p"
            yLabel="logical error rate"
            series={series}
            vlines={[{ x: p, color: '#fcd34d' }, { x: 0.5, color: '#fc6255', label: 'threshold 50%' }]}
          />
          <div className="faint" style={{ fontSize: '0.82rem' }}>
            Theory at p = {(p * 100).toFixed(1)}%: n = {n} fails with probability <b style={{ color: COLORS[n] }}>{(repFail(n, p) * 100).toFixed(3)}%</b>
            {n > 1 && repFail(n, p) < p ? ' — better than no code.' : n > 1 ? ' — WORSE than no code!' : '.'}
          </div>
        </div>
      </div>
    </Widget>
  );
}
