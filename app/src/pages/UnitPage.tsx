import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { unitById, UNITS } from '../content/curriculum';
import { useProgress } from '../state/progress';
import { isUnitUnlocked, isLessonUnlocked, isGameUnlocked, unitProgress, unitComplete } from '../content/unlocks';
import { ProgressBar } from '../components/ui';

export function UnitPage() {
  const { id } = useParams();
  const u = unitById(id ?? '');
  const p = useProgress();
  const nav = useNavigate();
  if (!u) return <div style={{ padding: 40 }}>Unknown world.</div>;
  const unlocked = isUnitUnlocked(u, p);
  const prog = unitProgress(u, p);
  const idx = UNITS.indexOf(u);
  const prev = UNITS[idx - 1], next = UNITS[idx + 1];
  const boss = u.boss;
  const bossRec = boss ? p.bosses[boss.id] : undefined;

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 20px 80px' }}>
      <div className="row" style={{ justifyContent: 'space-between', fontSize: '0.9rem' }}>
        <Link to="/">← Map</Link>
        <span className="row" style={{ gap: 12 }}>
          {prev && <Link to={`/unit/${prev.id}`}>‹ {prev.title}</Link>}
          {next && <Link to={`/unit/${next.id}`}>{next.title} ›</Link>}
        </span>
      </div>
      <section
        className="panel"
        style={{
          marginTop: 14,
          padding: 28,
          background: `radial-gradient(ellipse at top left, ${u.color}22 0%, #121620 65%)`,
          borderColor: `${u.color}55`,
          display: 'flex',
          gap: 24,
          alignItems: 'center',
        }}
      >
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: 48,
            border: `3px solid ${u.color}`,
            display: 'grid',
            placeItems: 'center',
            fontSize: 46,
            color: u.color,
            fontFamily: 'var(--serif)',
            flexShrink: 0,
            boxShadow: `0 0 30px ${u.color}44`,
          }}
        >
          {u.icon}
        </div>
        <div style={{ flex: 1 }}>
          <div className="faint" style={{ letterSpacing: '0.15em', fontSize: '0.75rem' }}>
            {u.number === 12 ? 'FINALE' : `WORLD ${u.number}`}
          </div>
          <h1 style={{ margin: '2px 0 4px' }}>{u.title}</h1>
          <div className="dim">{u.tagline}</div>
          {u.lessons.length > 0 && (
            <div className="row" style={{ marginTop: 12 }}>
              <ProgressBar value={prog} color={u.color} style={{ flex: 1, maxWidth: 360 }} />
              <span className="faint" style={{ fontSize: '0.85rem' }}>
                {Math.round(prog * 100)}% complete
              </span>
            </div>
          )}
        </div>
      </section>

      {!unlocked && (
        <div className="panel" style={{ marginTop: 16, borderColor: '#5c5233' }}>
          🔒 This world is locked. Finish the previous world (or defeat its boss) to enter — or turn on <b>free roam</b> in your{' '}
          <Link to="/profile">profile settings</Link>.
          {boss && (
            <div style={{ marginTop: 8 }} className="faint">
              Already know this material? You can still challenge this world's boss once the world is unlocked.
            </div>
          )}
        </div>
      )}

      {u.lessons.length > 0 && <h2>Lessons</h2>}
      <div className="col" style={{ gap: 10 }}>
        {u.lessons.map((l, i) => {
          const done = !!p.lessons[l.id];
          const open = isLessonUnlocked(l.id, p);
          return (
            <div
              key={l.id}
              onClick={() => open && nav(`/lesson/${l.id}`)}
              className="panel"
              style={{
                display: 'flex',
                gap: 16,
                alignItems: 'center',
                cursor: open ? 'pointer' : 'not-allowed',
                opacity: open ? 1 : 0.5,
                borderColor: done ? `${u.color}66` : 'var(--border)',
                transition: 'transform .1s, border-color .15s',
              }}
              onMouseEnter={(e) => open && (e.currentTarget.style.transform = 'translateX(4px)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'none')}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 700,
                  background: done ? u.color : 'var(--panel-2)',
                  color: done ? '#0b0d12' : open ? u.color : '#555',
                  border: `2px solid ${open ? u.color : '#333'}`,
                  flexShrink: 0,
                }}
              >
                {done ? '✓' : open ? i + 1 : '🔒'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '1.05rem' }}>{l.title}</div>
                {l.subtitle && <div className="faint" style={{ fontSize: '0.88rem' }}>{l.subtitle}</div>}
              </div>
              <span className="faint" style={{ fontSize: '0.82rem' }}>
                ~{l.minutes} min · {l.xp ?? 100} XP
              </span>
            </div>
          );
        })}
      </div>

      {u.games.length > 0 && (
        <>
          <h2>Games & labs</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {u.games.map((g) => {
              const open = isGameUnlocked(g, p);
              const rec = p.games[g.id];
              const after = u.lessons.find((l) => l.id === g.unlockAfter);
              return (
                <div
                  key={g.id}
                  className="panel"
                  onClick={() => open && nav(`/game/${g.id}`)}
                  style={{ cursor: open ? 'pointer' : 'not-allowed', opacity: open ? 1 : 0.55, borderColor: rec?.completed ? '#3c5c33' : 'var(--border)' }}
                >
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '1.8rem' }}>{open ? g.icon : '🔒'}</span>
                    {rec?.completed && <span className="pill good">beaten</span>}
                    {g.sandbox && <span className="pill">sandbox</span>}
                  </div>
                  <div style={{ fontWeight: 700, marginTop: 4 }}>{g.title}</div>
                  <div className="dim" style={{ fontSize: '0.88rem' }}>{g.description}</div>
                  {!open && after && <div className="faint" style={{ fontSize: '0.8rem', marginTop: 6 }}>Unlocks after “{after.title}”</div>}
                  {open && !g.sandbox && <div className="faint" style={{ fontSize: '0.8rem', marginTop: 6 }}>{rec ? `${rec.plays} plays` : `+${g.xp} XP for beating it`}</div>}
                </div>
              );
            })}
          </div>
        </>
      )}

      {boss && (
        <>
          <h2>Boss battle</h2>
          <div
            className="panel"
            style={{
              display: 'flex',
              gap: 20,
              alignItems: 'center',
              padding: 20,
              background: 'linear-gradient(135deg, #2a1418, #161a24)',
              borderColor: bossRec?.defeated ? '#3c5c33' : '#5c2a2f',
            }}
          >
            <div style={{ fontSize: '3.4rem', filter: unlocked ? 'none' : 'grayscale(1)' }}>{boss.avatar}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>{boss.name}</div>
              <div className="dim" style={{ fontStyle: 'italic' }}>“{boss.taunt}”</div>
              <div className="faint" style={{ fontSize: '0.82rem', marginTop: 4 }}>
                {boss.hp} HP · you have {boss.hearts} hearts · +{boss.xp} XP
                {bossRec?.defeated ? ' · ✓ defeated' : bossRec ? ` · ${bossRec.attempts} attempt(s)` : ''}
              </div>
            </div>
            <button className={`btn ${bossRec?.defeated ? '' : 'danger'}`} disabled={!unlocked} onClick={() => nav(`/boss/${u.id}`)}>
              {bossRec?.defeated ? 'Rematch' : unitComplete(u, p) ? '⚔️ Fight' : '⚔️ Fight (skip ahead)'}
            </button>
          </div>
        </>
      )}
      {u.lessons.length === 0 && u.games.length === 0 && !boss && (
        <div className="panel faint" style={{ marginTop: 20 }}>
          This world is still being charted. Check back soon!
        </div>
      )}
    </div>
  );
}
