import React, { useState } from 'react';
import { Widget, Segmented, Toggle, ProgressBar } from '../../../components/ui';

type Choice = 'none' | 'Z' | 'X';
interface Round {
  choice: Choice;
  a: string; // Alice's outcome label
  b: 0 | 1;
  agree: boolean | null;
}

const COL = ['#58c4dd', '#fcd34d'];

/** One round with a shared |Φ+⟩: Alice (optionally) measures in Z or X, Bob always measures Z. */
function playRound(choice: Choice): Round {
  if (choice === 'Z') {
    const a = Math.random() < 0.5 ? 0 : 1;
    return { choice, a: String(a), b: a as 0 | 1, agree: true };
  }
  if (choice === 'X') {
    // Alice gets ± at random; Bob's qubit becomes |±⟩, so his Z result is 50/50 regardless.
    const plus = Math.random() < 0.5;
    const b = (Math.random() < 0.5 ? 0 : 1) as 0 | 1;
    return { choice, a: plus ? '+' : '−', b, agree: null };
  }
  return { choice, a: '·', b: (Math.random() < 0.5 ? 0 : 1) as 0 | 1, agree: null };
}

/**
 * No-signalling demo: Alice tries to send Bob a message by choosing whether/how to measure.
 * Bob only ever sees a fair coin — until Alice phones him her results.
 */
export function NoSignalling() {
  const [choice, setChoice] = useState<Choice>('Z');
  const [rounds, setRounds] = useState<Round[]>([]);
  const [phone, setPhone] = useState(false);
  const [tally, setTally] = useState<Record<Choice, [number, number]>>({ none: [0, 0], Z: [0, 0], X: [0, 0] });

  const run = (n: number) => {
    const fresh = Array.from({ length: n }, () => playRound(choice));
    setRounds((r) => [...fresh, ...r].slice(0, 32));
    setTally((t) => {
      const [z, tot] = t[choice];
      return { ...t, [choice]: [z + fresh.filter((r) => r.b === 0).length, tot + n] };
    });
  };
  const bigRun = () => {
    const n = 5000;
    let z = 0;
    for (let i = 0; i < n; i++) if (playRound(choice).b === 0) z++;
    setTally((t) => ({ ...t, [choice]: [t[choice][0] + z, t[choice][1] + n] }));
  };

  const tile = (txt: string, color: string, glow = false, key?: React.Key) => (
    <span
      key={key}
      className="mono"
      style={{
        width: 22,
        height: 22,
        display: 'inline-grid',
        placeItems: 'center',
        borderRadius: 5,
        fontSize: '0.75rem',
        fontWeight: 700,
        color: '#111',
        background: color,
        boxShadow: glow ? '0 0 0 2px var(--green)' : 'none',
      }}
    >
      {txt}
    </span>
  );

  const labels: Record<Choice, string> = { none: 'Alice does nothing', Z: 'Alice measures Z', X: 'Alice measures X' };

  return (
    <Widget title="Can Alice signal to Bob? (shared |Φ⁺⟩ pairs, Bob always measures Z)">
      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        <span className="faint" style={{ fontSize: '0.85rem' }}>Alice's choice this batch:</span>
        <Segmented
          options={[
            { value: 'none' as Choice, label: 'do nothing' },
            { value: 'Z' as Choice, label: 'measure Z' },
            { value: 'X' as Choice, label: 'measure X' },
          ]}
          value={choice}
          onChange={setChoice}
        />
        <button className="btn primary small" onClick={() => run(8)}>
          ▶ 8 rounds
        </button>
        <button className="btn small" onClick={bigRun}>
          ⚡ 5000 rounds
        </button>
        <button className="btn small ghost" onClick={() => { setRounds([]); setTally({ none: [0, 0], Z: [0, 0], X: [0, 0] }); }}>
          reset
        </button>
      </div>

      <div className="panel" style={{ marginTop: 12, padding: 12 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <b style={{ color: 'var(--yellow)' }}>🔭 Bob's lab (light-years away)</b>
          <Toggle label="📞 Alice phones Bob her results" value={phone} onChange={setPhone} />
        </div>
        {phone && (
          <div className="row pop" style={{ gap: 3, marginTop: 8, flexWrap: 'wrap' }}>
            <span className="faint" style={{ width: 60, fontSize: '0.8rem' }}>Alice</span>
            {rounds.map((r, i) =>
              tile(r.a, r.a === '0' ? COL[0] : r.a === '1' ? COL[1] : r.a === '·' ? '#3a4256' : '#c49ad6', false, i),
            )}
          </div>
        )}
        <div className="row" style={{ gap: 3, marginTop: 6, flexWrap: 'wrap' }}>
          <span className="faint" style={{ width: 60, fontSize: '0.8rem' }}>Bob</span>
          {rounds.length === 0 && <span className="faint" style={{ fontSize: '0.85rem' }}>(run some rounds)</span>}
          {rounds.map((r, i) => tile(String(r.b), COL[r.b], phone && r.agree === true, i))}
        </div>
        {phone && rounds.some((r) => r.choice === 'Z') && (
          <div className="faint" style={{ fontSize: '0.8rem', marginTop: 6 }}>
            Green outlines: rounds where Alice measured Z. Her result and Bob's always match, but Bob can only see this <i>after</i> the phone call.
          </div>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="faint" style={{ fontSize: '0.8rem', marginBottom: 4 }}>
          What Bob can see without the phone call: the fraction of 0s in his results, sorted by what Alice was secretly doing
        </div>
        {(['none', 'Z', 'X'] as Choice[]).map((ch) => {
          const [z, tot] = tally[ch];
          const f = tot ? z / tot : 0;
          return (
            <div key={ch} className="row" style={{ gap: 10, marginBottom: 4 }}>
              <span style={{ width: 150, fontSize: '0.85rem' }}>{labels[ch]}</span>
              <ProgressBar value={f} color="var(--blue)" style={{ flex: 1 }} />
              <span className="mono" style={{ width: 150, fontSize: '0.8rem' }}>
                {tot ? `${(f * 100).toFixed(1)}% zeros` : '—'} <span className="faint">({tot})</span>
              </span>
            </div>
          );
        })}
      </div>
    </Widget>
  );
}
