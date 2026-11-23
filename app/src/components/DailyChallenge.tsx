import React, { useMemo, useState } from 'react';
import { UNITS } from '../content/curriculum';
import { useProgress, today } from '../state/progress';
import { isUnitUnlocked } from '../content/unlocks';
import { RichText } from './ui';
import { parseNumber } from './lesson/Quiz';
import { mulberry32 } from '../engine/qsim';

/** One question per day drawn from boss question banks of unlocked worlds. */
export function DailyChallenge() {
  const p = useProgress();
  const d = today();
  const lastDone = p.games['daily']?.data?.last as string | undefined;
  const doneToday = lastDone === d;

  const q = useMemo(() => {
    const pool = UNITS.filter((u) => isUnitUnlocked(u, p) && u.boss && u.lessons.some((l) => p.lessons[l.id]))
      .flatMap((u) => (u.boss?.questions ?? []).filter((x) => x.type !== 'circuit').map((x) => ({ q: x, unit: u })));
    if (!pool.length) return null;
    const seed = d.split('-').reduce((a, b) => a * 31 + parseInt(b, 10), 7);
    return pool[Math.floor(mulberry32(seed)() * pool.length)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, Object.keys(p.lessons).length]);

  const [ans, setAns] = useState<string>('');
  const [result, setResult] = useState<null | boolean>(null);

  const finish = (ok: boolean) => {
    setResult(ok);
    p.recordGame('daily', ok ? 1 : 0, false, 0, { last: d });
    if (ok) p.addXp(30, 'Daily challenge');
  };

  return (
    <div className="panel" style={{ padding: 14, borderColor: '#3b4560' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 700 }}>☀️ Daily challenge</span>
        <span className="faint" style={{ fontSize: '0.8rem' }}>+30 XP</span>
      </div>
      {!q && <div className="faint" style={{ fontSize: '0.9rem', marginTop: 6 }}>Complete your first lesson to unlock daily challenges.</div>}
      {q && doneToday && result === null && <div className="faint" style={{ fontSize: '0.9rem', marginTop: 6 }}>Done for today — come back tomorrow for a new one!</div>}
      {q && (!doneToday || result !== null) && (
        <div style={{ marginTop: 6, fontSize: '0.92rem' }}>
          <div className="faint" style={{ fontSize: '0.75rem' }}>
            from World {q.unit.number}: {q.unit.title}
          </div>
          <div style={{ margin: '4px 0 8px' }}>
            <RichText text={q.q.prompt} />
          </div>
          {q.q.type === 'mc' && (
            <div className="col" style={{ gap: 4 }}>
              {q.q.options.map((o, i) => {
                const isAns = q.q.type === 'mc' && i === q.q.answer;
                return (
                  <button
                    key={i}
                    className="btn small"
                    disabled={result !== null}
                    style={{
                      justifyContent: 'flex-start',
                      textAlign: 'left',
                      borderColor: result !== null && isAns ? 'var(--green)' : undefined,
                      fontWeight: 400,
                    }}
                    onClick={() => finish(isAns)}
                  >
                    <RichText text={o} />
                  </button>
                );
              })}
            </div>
          )}
          {q.q.type === 'numeric' && (
            <div className="row">
              <input type="text" value={ans} onChange={(e) => setAns(e.target.value)} disabled={result !== null} style={{ width: 140 }} />
              <button
                className="btn small primary"
                disabled={result !== null || parseNumber(ans) === null}
                onClick={() => q.q.type === 'numeric' && finish(Math.abs((parseNumber(ans) ?? NaN) - q.q.answer) <= q.q.tolerance)}
              >
                Check
              </button>
            </div>
          )}
          {result !== null && (
            <div style={{ marginTop: 8, color: result ? 'var(--green)' : 'var(--red)' }}>
              {result ? '✓ Correct!' : '✗ Not this time.'}{' '}
              <span className="dim">
                <RichText text={q.q.explain} />
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
