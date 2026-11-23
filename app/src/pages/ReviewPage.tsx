import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ALL_CARDS } from '../content/curriculum';
import { useProgress } from '../state/progress';
import { RichText, ProgressBar, Stat } from '../components/ui';

export function ReviewPage() {
  const cards = useProgress((s) => s.cards);
  const review = useProgress((s) => s.reviewCard);
  const [flipped, setFlipped] = useState(false);
  const [session, setSession] = useState({ done: 0, again: 0 });
  const [practice, setPractice] = useState(false);
  const [practiceIdx, setPracticeIdx] = useState(0);

  const now = Date.now();
  const owned = ALL_CARDS.filter((c) => cards[c.id]);
  const due = useMemo(
    () => owned.filter((c) => cards[c.id].due <= now).sort((a, b) => cards[a.id].due - cards[b.id].due),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cards],
  );
  const mature = owned.filter((c) => cards[c.id].interval >= 21).length;
  const learning = owned.filter((c) => cards[c.id].interval < 21).length;

  const card = practice ? owned[practiceIdx % Math.max(1, owned.length)] : due[0];

  const grade = (g: 0 | 1 | 2 | 3) => {
    if (!card) return;
    if (practice) {
      setPracticeIdx((i) => i + 1);
    } else {
      review(card.id, g);
      setSession((s) => ({ done: s.done + 1, again: s.again + (g === 0 ? 1 : 0) }));
    }
    setFlipped(false);
  };

  const nextDue = owned.length ? Math.min(...owned.map((c) => cards[c.id].due)) : null;

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px 20px 80px' }}>
      <h1 style={{ marginBottom: 4 }}>🧠 Review</h1>
      <p className="dim" style={{ marginTop: 0 }}>
        Spaced repetition, inspired by the mnemonic-medium research of <i>Quantum Country</i> (Matuschak & Nielsen). Each finished lesson adds cards, and every review you get right pushes a card's next appearance further into the future, so a few minutes a day keeps everything in long-term memory.
      </p>
      <div className="row" style={{ marginBottom: 18 }}>
        <Stat label="Due now" value={due.length} color="var(--red)" />
        <Stat label="Learning" value={learning} color="var(--blue)" />
        <Stat label="Mature (21d+)" value={mature} color="var(--green)" />
        <Stat label="Reviewed today" value={session.done} />
      </div>

      {owned.length === 0 && (
        <div className="panel">
          No cards yet. Complete a lesson to add its flashcards to your deck. <Link to="/">Go to the map →</Link>
        </div>
      )}

      {owned.length > 0 && !card && !practice && (
        <div className="panel center" style={{ padding: 30 }}>
          <div style={{ fontSize: '2.5rem' }}>✨</div>
          <h2 style={{ marginTop: 6 }}>All caught up!</h2>
          <p className="dim">
            {nextDue ? `Next card due ${new Date(nextDue).toLocaleString()}.` : ''} Come back later, or practise freely (practice doesn't change scheduling).
          </p>
          <button className="btn" onClick={() => setPractice(true)}>
            Practice all {owned.length} cards
          </button>
        </div>
      )}

      {card && (
        <>
          {!practice && <ProgressBar value={session.done / (session.done + due.length)} style={{ marginBottom: 14 }} />}
          {practice && (
            <div className="row" style={{ marginBottom: 10 }}>
              <span className="pill warn">Practice mode — scheduling unchanged</span>
              <button className="btn small ghost" onClick={() => setPractice(false)}>
                exit practice
              </button>
            </div>
          )}
          <div
            onClick={() => setFlipped(true)}
            className="panel"
            style={{
              minHeight: 260,
              padding: 28,
              cursor: flipped ? 'default' : 'pointer',
              borderColor: card.unit.color + '88',
              background: `radial-gradient(ellipse at top left, ${card.unit.color}14 0%, var(--panel) 60%)`,
            }}
          >
            <div className="faint" style={{ fontSize: '0.78rem', marginBottom: 10 }}>
              {card.unit.icon} World {card.unit.number}: {card.unit.title}
            </div>
            <div style={{ fontSize: '1.25rem', lineHeight: 1.6 }}>
              <RichText text={card.front} />
            </div>
            {flipped ? (
              <div className="pop" style={{ marginTop: 20, paddingTop: 16, borderTop: '1px dashed var(--border)', fontSize: '1.1rem', color: 'var(--text)' }}>
                <RichText text={card.back} />
              </div>
            ) : (
              <div className="faint center" style={{ marginTop: 40 }}>
                Recall the answer, then click to reveal
              </div>
            )}
          </div>
          {flipped && (
            <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
              <button className="btn danger" onClick={() => grade(0)}>
                Again
              </button>
              <button className="btn" onClick={() => grade(1)}>
                Hard
              </button>
              <button className="btn primary" onClick={() => grade(2)}>
                Good
              </button>
              <button className="btn gold" onClick={() => grade(3)}>
                Easy
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
