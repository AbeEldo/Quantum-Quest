import React from 'react';
import { useToasts } from '../state/toasts';

export function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div style={{ position: 'fixed', right: 20, bottom: 20, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 1000, pointerEvents: 'none' }}>
      {toasts.map((t) => {
        const big = t.kind === 'achievement' || t.kind === 'rank';
        return (
          <div
            key={t.id}
            className="pop"
            onClick={() => dismiss(t.id)}
            style={{
              pointerEvents: 'auto',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: big ? '12px 18px' : '8px 14px',
              borderRadius: 12,
              background: big ? 'linear-gradient(135deg, #2a2412, #1b1a14)' : 'var(--panel)',
              border: `1px solid ${big ? '#8a7428' : 'var(--border)'}`,
              boxShadow: big ? '0 0 24px rgba(252,211,77,.25)' : 'var(--shadow)',
              minWidth: big ? 260 : 0,
            }}
          >
            {t.kind === 'xp' ? (
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--yellow)' }}>{t.title}</span>
            ) : (
              <>
                <span style={{ fontSize: big ? '1.8rem' : '1.2rem' }}>{t.icon ?? 'ℹ️'}</span>
                <span>
                  <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--yellow)' }}>{t.title}</div>
                  <div style={{ fontWeight: 700 }}>{t.detail}</div>
                </span>
              </>
            )}
            {t.kind === 'xp' && t.detail && <span className="faint" style={{ fontSize: '0.82rem' }}>{t.detail}</span>}
          </div>
        );
      })}
    </div>
  );
}
