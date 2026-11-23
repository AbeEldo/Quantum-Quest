import React, { useRef, useState } from 'react';
import { ALL_ACHIEVEMENTS, ALL_LESSONS, ALL_GAMES, UNITS } from '../content/curriculum';
import { useProgress, rankFor, RANKS } from '../state/progress';
import { Stat, ProgressBar, Toggle } from '../components/ui';
import { unitProgress } from '../content/unlocks';

export function ProfilePage() {
  const p = useProgress();
  const rank = rankFor(p.xp);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const earned = ALL_ACHIEVEMENTS.filter((a) => p.achievements[a.id]);
  const preds = Object.values(p.predictions);
  const quizzes = Object.values(p.quizzes);
  const firstTry = quizzes.filter((q) => q.correct && q.attempts === 1).length;
  const maxDay = Math.max(1, ...p.xpLog.map((d) => d.xp));

  const exportProgress = () => {
    const raw = localStorage.getItem('quantum-quest-progress') ?? '{}';
    const blob = new Blob([raw], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `quantum-quest-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  const importProgress = (f: File) => {
    f.text().then((t) => {
      try {
        JSON.parse(t);
        localStorage.setItem('quantum-quest-progress', t);
        location.reload();
      } catch {
        alert('That file is not a valid progress export.');
      }
    });
  };

  return (
    <div style={{ maxWidth: 1050, margin: '0 auto', padding: '24px 20px 80px' }}>
      <div className="panel" style={{ display: 'flex', gap: 22, alignItems: 'center', padding: 24, background: 'radial-gradient(ellipse at top left, #1d2238, #121620 70%)' }}>
        <div style={{ fontSize: '4rem' }}>{rank.icon}</div>
        <div style={{ flex: 1 }}>
          <div className="faint" style={{ letterSpacing: '0.15em', fontSize: '0.75rem' }}>
            RANK {rank.index + 1} OF {RANKS.length}
          </div>
          <h1 style={{ margin: '2px 0' }}>{rank.title}</h1>
          <ProgressBar value={rank.progress} color="linear-gradient(90deg,#58c4dd,#fcd34d)" height={10} style={{ maxWidth: 420, marginTop: 6 }} />
          <div className="faint" style={{ fontSize: '0.85rem', marginTop: 4 }}>
            {p.xp} XP{rank.next ? ` · ${rank.next.xp - p.xp} XP to ${rank.next.icon} ${rank.next.title}` : ' · maximum rank reached!'}
          </div>
        </div>
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <Stat label="Lessons" value={`${Object.keys(p.lessons).length}/${ALL_LESSONS.length}`} color="var(--blue)" />
        <Stat label="Games beaten" value={`${Object.values(p.games).filter((g) => g.completed).length}/${ALL_GAMES.length}`} color="var(--teal)" />
        <Stat label="Bosses" value={Object.values(p.bosses).filter((b) => b.defeated).length} color="var(--red)" />
        <Stat label="Puzzle stars" value={Object.values(p.puzzles).reduce((a, x) => a + x.stars, 0)} color="var(--yellow)" />
        <Stat label="1st-try answers" value={firstTry} color="var(--green)" />
        <Stat label="Predictions right" value={`${preds.filter((x) => x.correct).length}/${preds.length}`} color="var(--purple)" />
        <Stat label="Best streak" value={`🔥${p.streak.best}`} color="var(--orange)" />
      </div>

      <h2>World progress</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 8 }}>
        {UNITS.filter((u) => u.lessons.length).map((u) => (
          <div key={u.id} className="row" style={{ gap: 10 }}>
            <span style={{ width: 26, textAlign: 'center', color: u.color }}>{u.icon}</span>
            <span style={{ width: 170, fontSize: '0.88rem' }}>{u.title}</span>
            <ProgressBar value={unitProgress(u, p)} color={u.color} style={{ flex: 1 }} />
          </div>
        ))}
      </div>

      {p.xpLog.length > 0 && (
        <>
          <h2>XP per day</h2>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 110, padding: '0 4px' }}>
            {p.xpLog.slice(-30).map((d) => (
              <div key={d.day} title={`${d.day}: ${d.xp} XP`} style={{ flex: 1, maxWidth: 28, height: `${(d.xp / maxDay) * 100}%`, background: 'linear-gradient(180deg,#fcd34d,#f0ac5f)', borderRadius: '3px 3px 0 0', minHeight: 2 }} />
            ))}
          </div>
        </>
      )}

      <h2>
        Achievements <span className="faint" style={{ fontSize: '1rem' }}>({earned.length}/{ALL_ACHIEVEMENTS.length})</span>
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>
        {ALL_ACHIEVEMENTS.map((a) => {
          const got = !!p.achievements[a.id];
          const hidden = a.secret && !got;
          return (
            <div key={a.id} className="panel" style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, opacity: got ? 1 : 0.5, borderColor: got ? '#8a7428' : 'var(--border)' }}>
              <span style={{ fontSize: '1.8rem', filter: got ? 'none' : 'grayscale(1)' }}>{hidden ? '❓' : a.icon}</span>
              <span>
                <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>{hidden ? 'Secret achievement' : a.title}</div>
                <div className="faint" style={{ fontSize: '0.8rem' }}>{hidden ? 'Keep exploring…' : a.description}</div>
              </span>
            </div>
          );
        })}
      </div>

      <h2>😮 Surprise journal</h2>
      <p className="dim" style={{ marginTop: 0 }}>
        Every time an experiment overturned one of your predictions, it's logged here. These are the moments where intuition got upgraded.
      </p>
      {p.journal.length === 0 && <div className="faint">No surprises yet. Make some predictions!</div>}
      {p.journal.map((j) => (
        <div key={j.id + j.time} className="panel" style={{ margin: '6px 0', padding: '8px 12px', fontSize: '0.9rem' }}>
          <span className="faint mono" style={{ fontSize: '0.75rem' }}>
            {new Date(j.time).toLocaleDateString()} · {j.id}
          </span>
          <div>{j.text}</div>
        </div>
      ))}

      <h2>Settings</h2>
      <div className="panel col" style={{ gap: 12 }}>
        <Toggle
          label="Free roam: unlock every world, lesson and game (skip the progression gates)"
          value={p.settings.freeRoam}
          onChange={(v) => {
            p.setSetting('freeRoam', v);
            if (v) p.unlock('free-roam');
          }}
        />
        <Toggle label="Sound effects" value={p.settings.sound} onChange={(v) => p.setSetting('sound', v)} />
        <div className="row">
          <button className="btn small" onClick={exportProgress}>
            ⬇ Export progress
          </button>
          <button className="btn small" onClick={() => fileRef.current?.click()}>
            ⬆ Import progress
          </button>
          <input ref={fileRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && importProgress(e.target.files[0])} />
          {!confirmReset ? (
            <button className="btn small danger" onClick={() => setConfirmReset(true)}>
              Reset all progress
            </button>
          ) : (
            <span className="row">
              <span style={{ color: 'var(--red)' }}>Really erase everything?</span>
              <button
                className="btn small danger"
                onClick={() => {
                  p.reset();
                  setConfirmReset(false);
                }}
              >
                Yes, reset
              </button>
              <button className="btn small" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
            </span>
          )}
        </div>
        <div className="faint" style={{ fontSize: '0.82rem' }}>
          Progress is saved in this browser's local storage. Use export/import to back it up or move it to another browser.
        </div>
      </div>
    </div>
  );
}
