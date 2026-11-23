import React, { useState } from 'react';
import { Widget, Segmented, Slider, Stat } from '../../../components/ui';
import { E91Eve, E91Pair, e91Round, e91Stats, E91_ALICE, E91_BOB } from '../lib/bb84';

const deg = (r: number) => Math.round((r * 1800) / Math.PI) / 10;

/**
 * Entanglement-based QKD (Ekert 1991, polarisation version). A source — possibly controlled by Eve —
 * sends pairs; Alice measures at 0°, 22.5°, 45° and Bob at 22.5°, 45°, 67.5°, at random.
 * Matching angles give key bits; the other combinations estimate the CHSH value S.
 */
export function E91Lab() {
  const [eve, setEve] = useState<E91Eve>('none');
  const [V, setV] = useState(1);
  const [pairs, setPairs] = useState<E91Pair[]>([]);
  const run = (n: number) => setPairs((p) => [...p, ...Array.from({ length: n }, () => e91Round(Math.random, eve, V))]);
  const st = e91Stats(pairs);
  // rough standard error of S: each of the 4 correlators has variance (1 − E²)/n
  const sErr = (() => {
    const idx: [number, number][] = [[0, 0], [0, 2], [2, 0], [2, 2]];
    let v = 0;
    for (const [i, j] of idx) {
      const n = pairs.filter((p) => p.ai === i && p.bi === j).length;
      const e = st.E[i][j] ?? 0;
      if (n) v += (1 - e * e) / n;
    }
    return Math.sqrt(v);
  })();
  const verdict =
    st.S === null
      ? null
      : st.S - 3 * sErr > 2
        ? { ok: true, text: 'S is well above 2: the pairs are genuinely entangled, and nobody (not even the source) can know the key. Keep it.' }
        : { ok: false, text: 'S is not clearly above 2: the correlations could have been produced by a local, pre-programmed source. Abort.' };

  return (
    <Widget title="E91 lab: let Bell’s inequality catch the spy">
      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        <span className="faint" style={{ fontSize: '0.85rem' }}>the source is…</span>
        <Segmented
          options={[
            { value: 'none' as E91Eve, label: 'honest |Φ⁺⟩' },
            { value: 'intercept' as E91Eve, label: 'Eve intercepts & resends' },
            { value: 'preprogrammed' as E91Eve, label: 'Eve’s pre-programmed (local) source' },
          ]}
          value={eve}
          onChange={(v) => { setEve(v); setPairs([]); }}
        />
      </div>
      {eve === 'none' && (
        <div style={{ maxWidth: 420, marginTop: 6 }}>
          <Slider label="pair visibility V" value={V} min={0.5} max={1} step={0.01} onChange={(v) => { setV(v); setPairs([]); }} format={(v) => `${Math.round(v * 100)}%`} />
        </div>
      )}
      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        <button className="btn primary small" onClick={() => run(300)}>send 300 pairs</button>
        <button className="btn small" onClick={() => run(5000)}>⚡ 5000 pairs</button>
        <button className="btn small ghost" onClick={() => setPairs([])}>reset</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginTop: 10, alignItems: 'start' }}>
        <div>
          <div className="faint" style={{ fontSize: '0.78rem', marginBottom: 4 }}>correlations E = P(same) − P(different), by setting pair</div>
          <table className="mono" style={{ borderCollapse: 'separate', borderSpacing: 3, fontSize: '0.82rem' }}>
            <tbody>
              <tr>
                <td className="faint">A \ B</td>
                {E91_BOB.map((b) => (
                  <td key={b} style={{ color: 'var(--yellow)', textAlign: 'center', padding: '2px 8px' }}>{deg(b)}°</td>
                ))}
              </tr>
              {E91_ALICE.map((a, i) => (
                <tr key={a}>
                  <td style={{ color: 'var(--blue)' }}>{deg(a)}°</td>
                  {E91_BOB.map((b, j) => {
                    const key = (i === 1 && j === 0) || (i === 2 && j === 1);
                    const chsh = (i === 0 || i === 2) && (j === 0 || j === 2);
                    const e = st.E[i][j];
                    return (
                      <td
                        key={b}
                        style={{
                          textAlign: 'center',
                          padding: '4px 8px',
                          borderRadius: 5,
                          background: key ? 'rgba(131,193,103,0.15)' : chsh ? 'rgba(224,122,182,0.15)' : 'var(--panel-2)',
                          border: `1px solid ${key ? '#83c16766' : chsh ? '#e07ab666' : 'transparent'}`,
                        }}
                      >
                        {e === null ? '—' : e.toFixed(2)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="faint" style={{ fontSize: '0.75rem', marginTop: 4 }}>
            <span style={{ color: 'var(--green)' }}>green</span> = matching angles → key bits · <span style={{ color: 'var(--pink)' }}>pink</span> = CHSH test
          </div>
        </div>
        <div className="col" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
            <Stat label="pairs" value={pairs.length} />
            <Stat label="key bits" value={st.keyLength} />
            <Stat label="key QBER" value={st.qber === null ? '—' : `${(st.qber * 100).toFixed(1)}%`} color={st.qber !== null && st.qber > 0.11 ? 'var(--red)' : 'var(--green)'} />
            <Stat label="CHSH S" value={st.S === null ? '—' : `${st.S.toFixed(2)} ± ${sErr.toFixed(2)}`} color={st.S !== null && st.S > 2 ? 'var(--pink)' : 'var(--yellow)'} />
          </div>
          {verdict && (
            <div className="panel pop" style={{ padding: 10, borderColor: verdict.ok ? 'var(--green)' : 'var(--red)' }}>
              <b style={{ color: verdict.ok ? 'var(--green)' : 'var(--red)' }}>{verdict.ok ? '✓ Secure' : '✗ Not certified'}</b> {verdict.text}
            </div>
          )}
          {eve === 'preprogrammed' && st.S !== null && (
            <div className="faint" style={{ fontSize: '0.8rem' }}>
              Notice: the key bits agree perfectly, so the QBER alone looks perfect. Only the Bell test exposes that Eve, who wrote the instructions, knows every bit.
            </div>
          )}
        </div>
      </div>
    </Widget>
  );
}
