import React, { ReactNode, useState } from 'react';

function Box({ icon, label, color, children, title }: { icon: string; label: string; color: string; children?: ReactNode; title?: ReactNode }) {
  return (
    <div
      className="callout"
      style={{
        margin: '1.4em 0',
        padding: '12px 16px',
        borderRadius: 12,
        background: `linear-gradient(90deg, ${color}18, ${color}06)`,
        border: `1px solid ${color}44`,
        borderLeft: `4px solid ${color}`,
      }}
    >
      <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color, marginBottom: 4 }}>
        {icon} {title ?? label}
      </div>
      <div className="callout-body">{children}</div>
    </div>
  );
}

/** The single most important takeaway of a section. */
export const KeyIdea = ({ children, title }: { children?: ReactNode; title?: ReactNode }) => (
  <Box icon="★" label="Key idea" color="#fcd34d" title={title}>
    {children}
  </Box>
);
/** Neutral side note. */
export const Note = ({ children, title }: { children?: ReactNode; title?: ReactNode }) => (
  <Box icon="✎" label="Note" color="#9aa3b5" title={title}>
    {children}
  </Box>
);
/** Common misconception or trap. */
export const Warning = ({ children, title }: { children?: ReactNode; title?: ReactNode }) => (
  <Box icon="⚠" label="Common misconception" color="#fc6255" title={title}>
    {children}
  </Box>
);
/** Historical context / story. */
export const History = ({ children, title }: { children?: ReactNode; title?: ReactNode }) => (
  <Box icon="📜" label="History" color="#c49a6c" title={title}>
    {children}
  </Box>
);
/** Analogy or connection for computer scientists. */
export const CSCorner = ({ children, title }: { children?: ReactNode; title?: ReactNode }) => (
  <Box icon="⌨" label="CS corner" color="#58c4dd" title={title}>
    {children}
  </Box>
);
/** Instructions for playing with the widget that follows/precedes. */
export const Try = ({ children, title }: { children?: ReactNode; title?: ReactNode }) => (
  <Box icon="👆" label="Try this" color="#5cd0b3" title={title}>
    {children}
  </Box>
);
/** Formal definition. */
export const Definition = ({ children, term }: { children?: ReactNode; term?: ReactNode }) => (
  <Box icon="≡" label="Definition" color="#9a72ac" title={term ? <>Definition — {term}</> : undefined}>
    {children}
  </Box>
);

/** Collapsible optional section for extra rigor. */
export function DeepDive({ title = 'Deep dive (optional)', children }: { title?: ReactNode; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ margin: '1.4em 0', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--panel)' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: '10px 16px',
          background: 'var(--panel-2)',
          border: 'none',
          color: 'var(--purple)',
          font: 'inherit',
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>🔬 {title}</span>
        <span>{open ? '▾' : '▸'}</span>
      </button>
      {open && <div style={{ padding: '4px 16px 12px' }}>{children}</div>}
    </div>
  );
}

/** Link card for an external video/article (opens in browser). */
export function Watch({ title, by, url, note, kind = 'video' }: { title: string; by?: string; url: string; note?: string; kind?: 'video' | 'article' | 'paper' | 'book' | 'interactive' }) {
  const icon = { video: '▶', article: '📄', paper: '📑', book: '📘', interactive: '🕹' }[kind];
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        padding: '10px 14px',
        margin: '1em 0',
        borderRadius: 12,
        border: '1px solid var(--border)',
        background: 'var(--panel)',
        color: 'var(--text)',
        textDecoration: 'none',
      }}
    >
      <span
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          display: 'grid',
          placeItems: 'center',
          background: kind === 'video' ? '#c4302b' : 'var(--panel-2)',
          color: '#fff',
          fontSize: '1rem',
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <span>
        <div style={{ fontWeight: 600 }}>{title}</div>
        <div className="faint" style={{ fontSize: '0.85rem' }}>
          {by}
          {note ? ` — ${note}` : ''}
        </div>
      </span>
    </a>
  );
}

/** Two-column layout helper for side-by-side text + widget. */
export function Columns({ children, ratio = '1fr 1fr' }: { children?: ReactNode; ratio?: string }) {
  return <div style={{ display: 'grid', gridTemplateColumns: ratio, gap: 20, alignItems: 'start' }}>{children}</div>;
}
