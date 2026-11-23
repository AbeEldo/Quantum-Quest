import React, { ReactNode } from 'react';
import { useProgress } from '../state/progress';
import { gameById } from '../content/curriculum';

/**
 * Hook for game components.
 *   const g = useGame('chsh-tournament');
 *   g.finish(score, beaten)   // records a play; first time beaten=true awards the game's XP
 *   g.best, g.completed, g.plays, g.data, g.unlock('achievement-id')
 */
export function useGame(id: string) {
  const rec = useProgress((s) => s.games[id]);
  const recordGame = useProgress((s) => s.recordGame);
  const unlock = useProgress((s) => s.unlock);
  const addXp = useProgress((s) => s.addXp);
  const def = gameById(id);
  return {
    best: rec?.best ?? 0,
    plays: rec?.plays ?? 0,
    completed: !!rec?.completed,
    data: (rec?.data ?? {}) as Record<string, unknown>,
    finish: (score: number, beaten: boolean, data?: Record<string, unknown>) => recordGame(id, score, beaten, def?.xp ?? 100, data),
    /** Save game data without counting a play. */
    save: (data: Record<string, unknown>) => recordGame(id, rec?.best ?? 0, !!rec?.completed, def?.xp ?? 100, data),
    unlock,
    addXp,
  };
}

/** Standard overlay for win/lose screens inside a game. */
export function GameOverlay({ title, children, onClose, tone = 'win' }: { title: ReactNode; children?: ReactNode; onClose?: () => void; tone?: 'win' | 'lose' | 'info' }) {
  const col = tone === 'win' ? 'var(--green)' : tone === 'lose' ? 'var(--red)' : 'var(--blue)';
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(8,10,15,.82)', display: 'grid', placeItems: 'center', zIndex: 10, borderRadius: 12, backdropFilter: 'blur(2px)' }}>
      <div className="panel pop" style={{ textAlign: 'center', borderColor: col, maxWidth: 460, padding: 28 }}>
        <h2 style={{ marginTop: 0, color: col }}>{title}</h2>
        <div className="dim">{children}</div>
        {onClose && (
          <button className="btn primary" style={{ marginTop: 16 }} onClick={onClose}>
            Continue
          </button>
        )}
      </div>
    </div>
  );
}

/** Collapsible "How to play" box. */
export function HowToPlay({ children, defaultOpen = true }: { children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="panel" style={{ marginBottom: 14, padding: open ? 14 : '8px 14px' }}>
      <div className="row" style={{ justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setOpen((o) => !o)}>
        <b>📖 How to play</b>
        <span className="faint">{open ? 'hide ▴' : 'show ▾'}</span>
      </div>
      {open && <div className="dim" style={{ marginTop: 8 }}>{children}</div>}
    </div>
  );
}
