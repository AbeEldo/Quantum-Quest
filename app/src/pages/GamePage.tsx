import React, { ComponentType, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { gameById } from '../content/curriculum';
import { isGameUnlocked } from '../content/unlocks';
import { useProgress } from '../state/progress';
import { ErrorBoundary } from '../components/ErrorBoundary';

export function GamePage() {
  const { id } = useParams();
  const g = gameById(id ?? '');
  const p = useProgress();
  const [Comp, setComp] = useState<ComponentType<any> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setComp(null);
    if (!g) return;
    g.load()
      .then((m) => setComp(() => m.default))
      .catch((e) => setErr(String(e)));
  }, [g]);
  if (!g) return <div style={{ padding: 40 }}>Unknown game. <Link to="/">Back</Link></div>;
  const rec = p.games[g.id];
  if (!isGameUnlocked(g, p))
    return (
      <div className="panel" style={{ maxWidth: 700, margin: '60px auto' }}>
        🔒 This game unlocks after you complete the lesson it belongs to. <Link to={`/unit/${g.unit.id}`}>Back to {g.unit.title}</Link>
      </div>
    );
  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '20px 24px 80px' }}>
      <div className="row" style={{ justifyContent: 'space-between', fontSize: '0.9rem' }}>
        <Link to={`/unit/${g.unit.id}`}>
          ← {g.unit.icon} {g.unit.title}
        </Link>
        <span className="faint">
          {rec ? `${rec.plays} plays · best ${Number.isFinite(rec.best) ? +rec.best.toFixed(2) : '—'}` : 'First play'}
          {rec?.completed ? ' · ✓ beaten' : !g.sandbox ? ` · +${g.xp} XP for beating it` : ''}
        </span>
      </div>
      <header style={{ display: 'flex', gap: 16, alignItems: 'center', margin: '14px 0 18px' }}>
        <span style={{ fontSize: '2.6rem' }}>{g.icon}</span>
        <div>
          <h1 style={{ margin: 0 }}>{g.title}</h1>
          <div className="dim">{g.description}</div>
        </div>
      </header>
      {err && <div className="panel" style={{ borderColor: 'var(--red)' }}>Failed to load: {err}</div>}
      {!Comp && !err && <div className="faint">Loading…</div>}
      {Comp && (
        <ErrorBoundary>
          <div style={{ position: 'relative' }}>
            <Comp />
          </div>
        </ErrorBoundary>
      )}
    </div>
  );
}
