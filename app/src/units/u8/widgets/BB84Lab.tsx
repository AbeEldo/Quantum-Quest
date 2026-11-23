import React, { useState } from 'react';
import { Widget, Slider, Toggle, Stat } from '../../../components/ui';
import { useChallengeGate } from '../../../components/lesson/gates';
import { PhotonEvent, sendPhoton, polAngle, BASIS_SYMBOL, expectedQber } from '../lib/bb84';
import { PhotonLine, PolGlyph } from './PhotonLine';

/**
 * BB84 lab: Alice sends random bits in random bases, Bob measures in random bases, they sift and
 * estimate the error rate. Toggle Eve (intercept–resend on a fraction of photons) and watch the QBER.
 */
export function BB84Lab({ challengeId }: { challengeId?: string }) {
  const [eveOn, setEveOn] = useState(false);
  const [frac, setFrac] = useState(1);
  const [events, setEvents] = useState<PhotonEvent[]>([]);
  const [queue, setQueue] = useState<PhotonEvent[]>([]);
  const [arrived, setArrived] = useState(0);
  const [bulk, setBulk] = useState({ s: 0, e: 0, n: 0 });
  const [usedEve, setUsedEve] = useState(false);
  useChallengeGate(challengeId ?? 'bb84-none', !challengeId || (usedEve && bulk.n + events.length >= 400));

  const opts = { eveFraction: eveOn ? frac : 0 };
  const send = (n: number) => {
    const fresh = Array.from({ length: n }, () => sendPhoton(Math.random, opts));
    setQueue((q) => [...q, ...fresh]);
    setEvents((e) => [...e, ...fresh].slice(-400));
  };
  const instant = (n: number) => {
    let s = 0, e = 0;
    for (let i = 0; i < n; i++) {
      const ev = sendPhoton(Math.random, opts);
      if (ev.sifted) {
        s++;
        if (ev.error) e++;
      }
    }
    setBulk((b) => ({ s: b.s + s, e: b.e + e, n: b.n + n }));
    if (eveOn) setUsedEve(true);
  };
  const reset = () => {
    setEvents([]);
    setQueue([]);
    setArrived(0);
    setBulk({ s: 0, e: 0, n: 0 });
  };

  const shown = events.slice(-Math.min(events.length, 16));
  const done = events.slice(0, arrived);
  const siftedEv = done.filter((e) => e.sifted);
  const S = siftedEv.length + bulk.s;
  const E = siftedEv.filter((e) => e.error).length + bulk.e;
  const N = done.length + bulk.n;
  const qber = S ? E / S : null;
  const theory = expectedQber(eveOn ? frac : 0);
  const visibleStart = events.length - shown.length;

  return (
    <Widget title="BB84 lab: send photons, sift, check for errors">
      <div className="row" style={{ gap: 14, flexWrap: 'wrap', marginBottom: 6 }}>
        <Toggle label={<span>🕵️ Eve intercepts &amp; resends</span>} value={eveOn} onChange={(v) => { setEveOn(v); reset(); if (v) setUsedEve(true); }} />
        {eveOn && (
          <div style={{ minWidth: 260, flex: 1 }}>
            <Slider label="fraction intercepted" value={frac} min={0} max={1} step={0.05} onChange={(v) => { setFrac(v); reset(); }} format={(v) => `${Math.round(v * 100)}%`} />
          </div>
        )}
      </div>
      <PhotonLine queue={queue} eveOn={eveOn} onArrive={() => setArrived((a) => a + 1)} />
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
        <button className="btn primary small" onClick={() => send(1)}>send 1 photon</button>
        <button className="btn small" onClick={() => send(16)}>send 16</button>
        <button className="btn small" onClick={() => instant(2000)}>⚡ 2000 instantly</button>
        <button className="btn small ghost" onClick={reset}>reset</button>
        <span className="faint" style={{ fontSize: '0.8rem' }}>
          polarisation key: <PolGlyph deg={0} /> 0 &nbsp; <PolGlyph deg={90} /> 1 in <b>+</b> &nbsp;·&nbsp; <PolGlyph deg={45} /> 0 &nbsp; <PolGlyph deg={135} /> 1 in <b>×</b>
        </span>
      </div>

      <div style={{ overflowX: 'auto', marginTop: 8 }}>
        <table className="mono" style={{ borderCollapse: 'separate', borderSpacing: 3, fontSize: '0.8rem' }}>
          <tbody>
            {[
              { label: 'Alice bit', cell: (e: PhotonEvent) => e.aBit },
              { label: 'Alice basis', cell: (e: PhotonEvent) => BASIS_SYMBOL[e.aBasis] },
              { label: 'photon', cell: (e: PhotonEvent) => <PolGlyph deg={polAngle(e.aBasis, e.aBit)} /> },
              ...(eveOn ? [{ label: 'Eve', cell: (e: PhotonEvent) => (e.eve ? <PolGlyph deg={polAngle(e.eve.basis, e.eve.bit)} /> : '·') }] : []),
              { label: 'Bob basis', cell: (e: PhotonEvent, ok: boolean) => (ok ? BASIS_SYMBOL[e.bBasis] : '?') },
              { label: 'Bob result', cell: (e: PhotonEvent, ok: boolean) => (ok ? e.bBit : '?') },
              { label: 'same basis?', cell: (e: PhotonEvent, ok: boolean) => (ok ? (e.sifted ? '✓' : '✗') : '') },
              { label: 'key bit', cell: (e: PhotonEvent, ok: boolean) => (ok && e.sifted ? <b style={{ color: e.error ? 'var(--red)' : 'var(--green)' }}>{e.bBit}{e.error ? '!' : ''}</b> : '') },
            ].map((row) => (
              <tr key={row.label}>
                <td className="faint" style={{ paddingRight: 8, whiteSpace: 'nowrap' }}>{row.label}</td>
                {shown.map((e, i) => {
                  const ok = visibleStart + i < arrived;
                  return (
                    <td key={visibleStart + i} style={{ width: 26, height: 22, textAlign: 'center', background: ok && !e.sifted ? 'rgba(255,255,255,0.02)' : 'var(--panel-2)', borderRadius: 4, opacity: ok && !e.sifted ? 0.45 : 1 }}>
                      {row.cell(e, ok)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <div className="faint" style={{ fontSize: '0.85rem' }}>Send some photons to fill the table.</div>}
      </div>

      <div className="row" style={{ gap: 18, marginTop: 10, flexWrap: 'wrap' }}>
        <Stat label="photons" value={N} />
        <Stat label="sifted key" value={`${S}${N ? ` (${Math.round((S / N) * 100)}%)` : ''}`} />
        <Stat label="errors in sifted key" value={E} color={E ? 'var(--red)' : undefined} />
        <Stat label="QBER" value={qber === null ? '—' : `${(qber * 100).toFixed(1)}%`} color={qber !== null && qber > 0.11 ? 'var(--red)' : 'var(--green)'} />
        <Stat label="theory" value={`${(theory * 100).toFixed(1)}%`} />
      </div>
      {challengeId && !(usedEve && N >= 400) && (
        <div className="faint" style={{ fontSize: '0.8rem', marginTop: 6 }}>🎯 To continue: run at least 400 photons with Eve switched on and look at the QBER.</div>
      )}
    </Widget>
  );
}
