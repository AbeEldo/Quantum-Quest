import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ALL_SOURCES, UNITS } from '../content/curriculum';
import { Watch } from '../components/lesson/Callouts';

const CORE: { title: string; by: string; url?: string; kind: 'video' | 'book' | 'paper' | 'article' | 'interactive'; note: string }[] = [
  { title: 'Quantum Computation and Quantum Information', by: 'Nielsen & Chuang (2010)', kind: 'book', note: 'The standard reference ("Mike & Ike"). Chapters 1, 2, 4–6, 8, 10 map onto this course.' },
  { title: 'Quantum Country', by: 'Andy Matuschak & Michael Nielsen', url: 'https://quantum.country/', kind: 'interactive', note: 'Mnemonic-medium essays on quantum computing; inspiration for the Review deck.' },
  { title: 'Introduction to Quantum Mechanics', by: 'Griffiths & Schroeter', kind: 'book', note: 'The classic undergraduate QM text: wavefunctions, operators, spin.' },
  { title: 'Quantum Mechanics: The Theoretical Minimum', by: 'Susskind & Friedman', kind: 'book', note: 'Spin-first QM for people with math but no physics background.' },
  { title: 'Quantum Computer Science: An Introduction', by: 'N. David Mermin', kind: 'book', note: 'Written for computer scientists; very clear on circuits and algorithms.' },
  { title: 'Quantum Computing Since Democritus', by: 'Scott Aaronson', kind: 'book', note: 'Complexity-theoretic tour of quantum computing, witty and deep.' },
  { title: 'The Feynman Lectures on Physics, Vol. III', by: 'Richard Feynman', url: 'https://www.feynmanlectures.caltech.edu/III_toc.html', kind: 'book', note: 'Free online. Chapter 1 on the double slit is legendary.' },
  { title: 'Lecture Notes for Ph219: Quantum Information and Computation', by: 'John Preskill (Caltech)', url: 'http://theory.caltech.edu/~preskill/ph229/', kind: 'article', note: 'Graduate-level notes, especially strong on error correction.' },
  { title: 'MIT OCW 8.04 Quantum Physics I', by: 'Allan Adams et al.', url: 'https://ocw.mit.edu/courses/8-04-quantum-physics-i-spring-2016/', kind: 'article', note: 'Full lecture videos and problem sets.' },
  { title: '3Blue1Brown', by: 'Grant Sanderson', url: 'https://www.youtube.com/@3blue1brown', kind: 'video', note: 'Essence of Linear Algebra, Fourier transforms, and the quantum computing / Grover explainer.' },
  { title: 'Veritasium', by: 'Derek Muller', url: 'https://www.youtube.com/@veritasium', kind: 'video', note: 'Double-slit, Bell inequality and quantum computing explainers.' },
  { title: 'MinutePhysics', by: 'Henry Reich', url: 'https://www.youtube.com/@minutephysics', kind: 'video', note: 'Short, sharp explainers incl. Bell\'s theorem with 3Blue1Brown.' },
  { title: 'IBM Quantum Platform', by: 'IBM', url: 'https://quantum.cloud.ibm.com/', kind: 'interactive', note: 'Run circuits on real quantum hardware (free tier).' },
  { title: 'Quirk', by: 'Craig Gidney', url: 'https://algassert.com/quirk', kind: 'interactive', note: 'A drag-and-drop quantum circuit simulator in the browser.' },
];

export function LibraryPage() {
  const [filter, setFilter] = useState<string>('all');
  const byUnit = UNITS.map((u) => ({ u, items: ALL_SOURCES.filter((s) => s.unit.id === u.id) })).filter((x) => x.items.length);
  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 20px 80px' }}>
      <h1 style={{ marginBottom: 4 }}>📚 Library</h1>
      <p className="dim" style={{ marginTop: 0 }}>
        The textbooks, videos, papers and interactive resources this course draws on. Links open in your web browser. The lessons work offline, but these links need an internet connection.
      </p>
      <h2>Core references</h2>
      {CORE.map((s) =>
        s.url ? (
          <Watch key={s.title} title={s.title} by={s.by} url={s.url} note={s.note} kind={s.kind} />
        ) : (
          <div key={s.title} className="panel" style={{ margin: '10px 0', padding: '10px 14px', display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: '1.4rem' }}>📘</span>
            <span>
              <div style={{ fontWeight: 600 }}>{s.title}</div>
              <div className="faint" style={{ fontSize: '0.85rem' }}>
                {s.by} — {s.note}
              </div>
            </span>
          </div>
        ),
      )}
      {byUnit.length > 0 && (
        <>
          <h2>By world</h2>
          <div className="row" style={{ marginBottom: 10 }}>
            <button className={`btn small ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
              All
            </button>
            {['video', 'book', 'paper', 'article', 'interactive', 'course'].map((k) => (
              <button key={k} className={`btn small ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>
                {k}
              </button>
            ))}
          </div>
          {byUnit.map(({ u, items }) => {
            const shown = items.filter((s) => filter === 'all' || s.kind === filter);
            if (!shown.length) return null;
            return (
              <section key={u.id}>
                <h3 style={{ color: u.color }}>
                  {u.icon} World {u.number}: {u.title}
                </h3>
                {shown.map((s, i) =>
                  s.url ? (
                    <Watch key={i} title={s.title} by={`${s.by ?? ''} · from “${s.lessonTitle}”`} url={s.url} note={s.note} kind={s.kind === 'course' ? 'article' : s.kind} />
                  ) : (
                    <div key={i} className="panel" style={{ margin: '8px 0', padding: '8px 14px', fontSize: '0.92rem' }}>
                      📘 <b>{s.title}</b>{' '}
                      <span className="faint">
                        {s.by}
                        {s.note ? ` — ${s.note}` : ''} · from <Link to={`/lesson/${s.lessonId}`}>{s.lessonTitle}</Link>
                      </span>
                    </div>
                  ),
                )}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
