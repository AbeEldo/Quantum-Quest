import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { GLOSSARY } from '../content/glossary';
import { lessonById } from '../content/curriculum';
import { RichText } from '../components/ui';

export function GlossaryPage() {
  const [q, setQ] = useState('');
  const terms = GLOSSARY.filter((t) => !q || (t.term + ' ' + t.def).toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.term.localeCompare(b.term));
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px 80px' }}>
      <h1 style={{ marginBottom: 4 }}>📖 Glossary</h1>
      <p className="dim" style={{ marginTop: 0 }}>
        {GLOSSARY.length} key terms, each linked to the lesson where it's introduced.
      </p>
      <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search terms…" style={{ width: '100%', marginBottom: 16, padding: '10px 14px' }} />
      {terms.map((t) => {
        const l = t.lesson ? lessonById(t.lesson) : undefined;
        return (
          <div key={t.term} className="panel" style={{ margin: '8px 0', padding: '10px 16px' }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <b style={{ color: 'var(--yellow)', fontFamily: 'var(--serif)', fontSize: '1.1rem' }}>{t.term}</b>
              {l && (
                <Link to={`/lesson/${l.id}`} style={{ fontSize: '0.8rem' }}>
                  {l.unit.icon} {l.title} →
                </Link>
              )}
            </div>
            <div className="dim" style={{ marginTop: 2 }}>
              <RichText text={t.def} />
            </div>
          </div>
        );
      })}
      {terms.length === 0 && <div className="faint">No matches.</div>}
    </div>
  );
}
