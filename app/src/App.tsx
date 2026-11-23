import React, { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, NavLink, Link, useLocation } from 'react-router-dom';
import { useProgress, rankFor } from './state/progress';
import { Toasts } from './components/Toasts';
import { ProgressBar } from './components/ui';
import { ErrorBoundary } from './components/ErrorBoundary';
import './content/curriculum';
import { ALL_CARDS } from './content/curriculum';
import { Home } from './pages/Home';
import { UnitPage } from './pages/UnitPage';
import { LessonPage } from './pages/LessonPage';
import { GamePage } from './pages/GamePage';
import { BossPage } from './pages/BossPage';
import { ReviewPage } from './pages/ReviewPage';
import { LabsPage } from './pages/LabsPage';
import { LibraryPage } from './pages/LibraryPage';
import { ProfilePage } from './pages/ProfilePage';
import { CircuitLabPage } from './pages/CircuitLabPage';
import { PuzzlesPage } from './pages/PuzzlesPage';
import { GlossaryPage } from './pages/GlossaryPage';

export function App() {
  const loc = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);
  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopBar />
      <main style={{ flex: 1 }}>
        <ErrorBoundary key={loc.pathname}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/unit/:id" element={<UnitPage />} />
            <Route path="/lesson/:id" element={<LessonPage />} />
            <Route path="/game/:id" element={<GamePage />} />
            <Route path="/boss/:unitId" element={<BossPage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/labs" element={<LabsPage />} />
            <Route path="/labs/circuit" element={<CircuitLabPage />} />
            <Route path="/puzzles" element={<PuzzlesPage />} />
            <Route path="/puzzles/:id" element={<PuzzlesPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/glossary" element={<GlossaryPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </ErrorBoundary>
      </main>
      <Toasts />
    </div>
  );
}

function TopBar() {
  const xp = useProgress((s) => s.xp);
  const streak = useProgress((s) => s.streak);
  const cards = useProgress((s) => s.cards);
  const rank = rankFor(xp);
  const now = Date.now();
  const due = Object.entries(cards).filter(([id, c]) => c.due <= now && ALL_CARDS.some((x) => x.id === id)).length;
  const link = ({ isActive }: { isActive: boolean }) => ({
    padding: '6px 12px',
    borderRadius: 8,
    color: isActive ? 'var(--text)' : 'var(--text-dim)',
    background: isActive ? 'var(--panel-2)' : 'transparent',
    fontWeight: 600,
    fontSize: '0.92rem',
    textDecoration: 'none',
  });
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        padding: '8px 20px',
        background: 'rgba(11,13,18,0.88)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'var(--text)' }}>
        <Logo />
        <span style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: '1.2rem', letterSpacing: '0.02em' }}>
          Quantum <span style={{ color: 'var(--blue)' }}>Quest</span>
        </span>
      </Link>
      <nav style={{ display: 'flex', gap: 4 }}>
        <NavLink to="/" end style={link}>
          Map
        </NavLink>
        <NavLink to="/review" style={link}>
          Review{due > 0 && <span style={{ marginLeft: 6, background: 'var(--red)', color: '#fff', borderRadius: 99, padding: '0 7px', fontSize: '0.75rem' }}>{due}</span>}
        </NavLink>
        <NavLink to="/labs" style={link}>
          Labs
        </NavLink>
        <NavLink to="/puzzles" style={link}>
          Puzzles
        </NavLink>
        <NavLink to="/library" style={link}>
          Library
        </NavLink>
        <NavLink to="/glossary" style={link}>
          Glossary
        </NavLink>
      </nav>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
        <span title={`Study streak (best ${streak.best})`} style={{ fontWeight: 700, color: streak.count ? 'var(--orange)' : 'var(--text-faint)' }}>
          🔥 {streak.count}
        </span>
        <Link to="/profile" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'var(--text)' }}>
          <span style={{ fontSize: '1.3rem' }}>{rank.icon}</span>
          <span style={{ display: 'flex', flexDirection: 'column', minWidth: 150 }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>
              {rank.title} <span className="faint mono">· {xp} XP</span>
            </span>
            <ProgressBar value={rank.progress} height={5} color="linear-gradient(90deg,#58c4dd,#fcd34d)" />
          </span>
        </Link>
      </div>
    </header>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-16 -16 32 32">
      <ellipse rx={13} ry={5} fill="none" stroke="#58c4dd" strokeWidth={1.6} />
      <ellipse rx={13} ry={5} fill="none" stroke="#fcd34d" strokeWidth={1.6} transform="rotate(60)" />
      <ellipse rx={13} ry={5} fill="none" stroke="#e07ab6" strokeWidth={1.6} transform="rotate(-60)" />
      <circle r={2.8} fill="#fff" />
    </svg>
  );
}
