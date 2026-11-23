import React, { useState } from 'react';
import { useGame, GameOverlay, HowToPlay } from '../../../components/game';
import { Toggle } from '../../../components/ui';
import { sfx } from '../../../state/sfx';
import {
  RELAY_LEVELS, RelayState, initialRelay, stepTick, swapAt, discard, holds, linkFree, endToEnd, teleportFidelity,
} from '../lib/relay';

export default function TeleportRelay() {
  const g = useGame('teleport-relay');
  const beatenLevels = (g.data.levels as number[] | undefined) ?? [];
  const [li, setLi] = useState(0);
  const lvl = RELAY_LEVELS[li];
  const [s, setS] = useState<RelayState>(initialRelay());
  const [armed, setArmed] = useState<number[]>([]);
  const [autoArm, setAutoArm] = useState(false);
  const [flash, setFlash] = useState<{ ok: number[]; bad: number[]; t: number } | null>(null);
  const [msg, setMsg] = useState<string>('');
  const [over, setOver] = useState<null | { win: boolean; text: string }>(null);
  const [done, setDone] = useState<number[]>(beatenLevels);

  const reset = (i = li) => {
    setLi(i);
    setS(initialRelay());
    setArmed([]);
    setMsg('');
    setFlash(null);
    setOver(null);
  };

  const tick = () => {
    if (s.tick >= lvl.budget) return;
    const ar = autoArm ? Array.from({ length: lvl.hops }, (_, k) => k).filter((k) => linkFree(s, k)) : armed.filter((k) => linkFree(s, k));
    const r = stepTick(s, lvl, ar, Math.random);
    setS(r.state);
    setFlash({ ok: r.succeeded, bad: r.failed, t: Date.now() });
    setArmed((a) => a.filter((k) => !r.succeeded.includes(k)));
    if (r.succeeded.length) sfx.click();
    setMsg(r.succeeded.length ? `✓ link${r.succeeded.length > 1 ? 's' : ''} ${r.succeeded.map((k) => k + 1).join(', ')} heralded` : ar.length ? 'no luck this tick' : 'waited one tick');
    if (r.state.tick >= lvl.budget && !endToEnd(r.state, lvl)) setOver({ win: false, text: 'Out of time: the tick budget ran out before Alice and Bob shared a good pair.' });
  };

  const swap = (n: number) => {
    const r = swapAt(s, n, Math.random, lvl.swapP ?? 1);
    setS(r.state);
    setMsg(r.ok ? `🔀 swapped at R${n}: new pair spans ${r.state.pairs[r.state.pairs.length - 1].a}–${r.state.pairs[r.state.pairs.length - 1].b}` : '💥 swap failed: both pairs lost');
    if (r.ok) sfx.correct();
    else sfx.wrong();
  };

  const teleport = () => {
    const e = endToEnd(s, lvl);
    if (!e) return;
    const fT = teleportFidelity(e.F);
    const win = fT >= lvl.target;
    if (win) {
      sfx.levelUp();
      const nd = Array.from(new Set([...done, li]));
      setDone(nd);
      const all = nd.length >= RELAY_LEVELS.length;
      g.finish(nd.length, all, { ...g.data, levels: nd });
      setOver({ win: true, text: `Teleported with fidelity ${(fT * 100).toFixed(1)}% (needed ${(lvl.target * 100).toFixed(0)}%) in ${s.tick} ticks.${all ? ' All levels complete!' : ''}` });
    } else {
      sfx.wrong();
      setS(discard(s, e.id));
      setMsg(`Teleport fidelity would be only ${(fT * 100).toFixed(1)}% (< ${(lvl.target * 100).toFixed(0)}%). The pair was used up. Build a fresher one.`);
    }
  };

  const W = 760, H = 210, pad = 60, ny = 130;
  const nx = (n: number) => pad + (n / lvl.hops) * (W - 2 * pad);
  const e2e = endToEnd(s, lvl);
  const fresh = flash && Date.now() - flash.t < 700;

  return (
    <div>
      <HowToPlay defaultOpen={g.plays === 0}>
        <p>
          Get Alice’s qubit to Bob across a chain of repeater stations. Each fibre <b>link</b> tries to create a Bell pair once per tick and succeeds only with probability <i>p</i>. Pairs wait in
          <b> quantum memories</b> and slowly decohere (their fidelity drops toward 25%). A station holding pairs on both sides can do an <b>entanglement swap</b>, which joins them into one longer pair
          (fidelities multiply roughly). Once Alice and Bob share a pair, <b>teleport</b>: the result has fidelity (2F+1)/3, which must beat the level’s target before the tick budget runs out.
        </p>
      </HowToPlay>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {RELAY_LEVELS.map((L, i) => (
          <button key={L.name} className={`btn small ${i === li ? 'active' : ''}`} onClick={() => reset(i)} disabled={i > 0 && !done.includes(i - 1) && !done.includes(i)}>
            {done.includes(i) ? '✓ ' : i > 0 && !done.includes(i - 1) ? '🔒 ' : ''}
            {L.name}
          </button>
        ))}
      </div>
      <div className="panel" style={{ padding: 12 }}>
        <div className="dim" style={{ fontSize: '0.9rem' }}>{lvl.blurb}</div>
        <div className="row mono faint" style={{ gap: 14, fontSize: '0.8rem', marginTop: 4, flexWrap: 'wrap' }}>
          <span>new-pair fidelity {lvl.F0}</span>
          <span>memory time T = {Number.isFinite(lvl.T) ? `${lvl.T} ticks` : '∞'}</span>
          <span>swap success {Math.round((lvl.swapP ?? 1) * 100)}%</span>
          <span>target teleport fidelity ≥ {(lvl.target * 100).toFixed(0)}%</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block', marginTop: 4 }}>
          {/* links */}
          {Array.from({ length: lvl.hops }, (_, k) => {
            const isArmed = autoArm ? linkFree(s, k) : armed.includes(k);
            const ok = fresh && flash!.ok.includes(k);
            const bad = fresh && flash!.bad.includes(k);
            return (
              <g
                key={k}
                style={{ cursor: linkFree(s, k) ? 'pointer' : 'default' }}
                onClick={() => !autoArm && linkFree(s, k) && setArmed((a) => (a.includes(k) ? a.filter((x) => x !== k) : [...a, k]))}
              >
                <line x1={nx(k) + 18} x2={nx(k + 1) - 18} y1={ny} y2={ny} stroke={ok ? '#83c167' : bad ? '#fc6255' : isArmed ? '#58c4dd' : '#3a4256'} strokeWidth={isArmed ? 6 : 4} strokeLinecap="round" style={{ transition: 'stroke .3s' }} />
                <line x1={nx(k) + 18} x2={nx(k + 1) - 18} y1={ny} y2={ny} stroke="transparent" strokeWidth={24} />
                <text x={(nx(k) + nx(k + 1)) / 2} y={ny + 24} fontSize={11} fill="#9aa3b5" textAnchor="middle" fontFamily="var(--mono)">
                  p = {Math.round(lvl.p[k] * 100)}%{isArmed ? ' · armed' : ''}
                </text>
              </g>
            );
          })}
          {/* pairs as arcs */}
          {s.pairs.map((p) => {
            const x1 = nx(p.a), x2 = nx(p.b);
            const h = 24 + (x2 - x1) * 0.28;
            const fT = teleportFidelity(p.F);
            const col = fT >= lvl.target ? '#e07ab6' : '#9a72ac';
            return (
              <g key={p.id} style={{ cursor: 'pointer' }} onClick={() => { setS(discard(s, p.id)); setMsg('pair discarded'); }}>
                <path d={`M ${x1} ${ny - 16} Q ${(x1 + x2) / 2} ${ny - 16 - h * 2} ${x2} ${ny - 16}`} fill="none" stroke={col} strokeWidth={3} strokeOpacity={0.35 + 0.65 * Math.max(0, (p.F - 0.5) * 2)} strokeDasharray="6 4">
                  <animate attributeName="stroke-dashoffset" from="0" to="-20" dur="1s" repeatCount="indefinite" />
                </path>
                <text x={(x1 + x2) / 2} y={ny - 22 - h} fontSize={11} fill={col} textAnchor="middle" fontFamily="var(--mono)">
                  F={(p.F * 100).toFixed(0)}%
                </text>
              </g>
            );
          })}
          {/* nodes */}
          {Array.from({ length: lvl.hops + 1 }, (_, n) => {
            const end = n === 0 || n === lvl.hops;
            const canSwap = !end && holds(s, n, -1) && holds(s, n, 1);
            return (
              <g key={n}>
                <circle cx={nx(n)} cy={ny} r={17} fill="#141821" stroke={n === 0 ? '#58c4dd' : n === lvl.hops ? '#fcd34d' : canSwap ? '#83c167' : '#6b7385'} strokeWidth={2.5} />
                <text x={nx(n)} y={ny + 5} fontSize={13} textAnchor="middle" fill="#cfd6e4">{n === 0 ? '👩' : n === lvl.hops ? '👨' : `R${n}`}</text>
                {canSwap && (
                  <g style={{ cursor: 'pointer' }} onClick={() => swap(n)} className="pop">
                    <rect x={nx(n) - 26} y={ny + 34} width={52} height={22} rx={6} fill="#83c16733" stroke="#83c167" />
                    <text x={nx(n)} y={ny + 49} fontSize={11.5} textAnchor="middle" fill="#83c167" fontWeight={700}>swap</text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="btn primary" onClick={tick} disabled={!!over || s.tick >= lvl.budget}>⏭ next tick</button>
          <Toggle label="auto-arm every free link" value={autoArm} onChange={setAutoArm} />
          <button className="btn gold" disabled={!e2e || !!over} onClick={teleport}>
            🚀 teleport{e2e ? ` (fidelity ${(teleportFidelity(e2e.F) * 100).toFixed(1)}%)` : ''}
          </button>
          <button className="btn ghost" onClick={() => reset()}>↺ restart level</button>
          <span className="mono" style={{ marginLeft: 'auto' }}>
            tick <b>{s.tick}</b> / {lvl.budget}
          </span>
        </div>
        <div className="faint" style={{ fontSize: '0.82rem', marginTop: 6, minHeight: 18 }}>
          {msg || 'Click links to arm them (blue), then press “next tick”. Click a pair’s arc to discard it.'}
        </div>
      </div>
      <div className="panel" style={{ marginTop: 12, padding: 12, fontSize: '0.9rem' }}>
        <b>The physics.</b>{' '}
        <span className="dim">
          Sending photons straight down 1000 km of fibre would lose all but 1 in 10²⁰. Repeaters beat this by <i>heralding</i> short-range entanglement (you know when a link succeeded), storing it,
          and swapping. A swap is a Bell measurement on the two middle qubits, i.e. teleporting one pair’s half through the other. Each swap multiplies the Werner parameters (w = (4F−1)/3), and waiting
          memories decay as w·e^(−t/T). Real repeaters add <i>entanglement purification</i> to win fidelity back.
        </span>
      </div>
      {over && (
        <GameOverlay title={over.win ? '🚀 Qubit delivered!' : '⌛ Link budget exhausted'} tone={over.win ? 'win' : 'lose'} onClose={() => (over.win && li + 1 < RELAY_LEVELS.length ? reset(li + 1) : reset())}>
          {over.text}
        </GameOverlay>
      )}
    </div>
  );
}
