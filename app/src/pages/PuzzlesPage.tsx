import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PUZZLES } from '../units/u7/puzzles';
import { useProgress } from '../state/progress';
import { RichText, ProgressBar } from '../components/ui';
import { CircuitLab, CircuitGoal } from '../widgets/CircuitLab';
import { c } from '../engine/complex';
import { parseCircuit } from '../engine/parse';
import { circuitUnitary, GateName } from '../engine/circuit';
import type { PuzzleDef } from '../content/types';

const starsFor = (p: PuzzleDef, gates: number) => (gates <= p.par ? 3 : gates <= p.par + 2 ? 2 : 1);

export function PuzzlesPage() {
  const { id } = useParams();
  if (id) return <PuzzleView id={id} />;
  return <PuzzleIndex />;
}

function isUnlocked(i: number, solved: Record<string, { stars: number }>, free: boolean) {
  if (free || i === 0) return true;
  // unlock in a sliding window: up to 3 unsolved puzzles ahead are open
  let unsolvedBefore = 0;
  for (let k = 0; k < i; k++) if (!solved[PUZZLES[k].id]) unsolvedBefore++;
  return unsolvedBefore < 3;
}

function PuzzleIndex() {
  const puzzles = useProgress((s) => s.puzzles);
  const free = useProgress((s) => s.settings.freeRoam);
  const nav = useNavigate();
  const chapters = useMemo(() => {
    const m = new Map<string, { p: PuzzleDef; i: number }[]>();
    PUZZLES.forEach((p, i) => {
      if (!m.has(p.chapter)) m.set(p.chapter, []);
      m.get(p.chapter)!.push({ p, i });
    });
    return [...m.entries()];
  }, []);
  const totalStars = PUZZLES.reduce((a, p) => a + (puzzles[p.id]?.stars ?? 0), 0);
  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 20px 80px' }}>
      <h1 style={{ marginBottom: 4 }}>🧩 Circuit Puzzles</h1>
      <p className="dim" style={{ marginTop: 0, maxWidth: 720 }}>
        Build quantum circuits that reach a target state or reproduce a target operation. You get three stars for matching par (the fewest gates we know of) and two stars for coming within two gates of it. The early puzzles need only World 3; the later ones assume World 7.
      </p>
      <div className="row" style={{ marginBottom: 20 }}>
        <span className="pill warn">
          ★ {totalStars} / {PUZZLES.length * 3}
        </span>
        <ProgressBar value={totalStars / (PUZZLES.length * 3)} color="var(--yellow)" style={{ flex: 1, maxWidth: 300 }} />
      </div>
      {chapters.map(([ch, items]) => (
        <section key={ch}>
          <h3>{ch}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {items.map(({ p, i }) => {
              const rec = puzzles[p.id];
              const open = isUnlocked(i, puzzles, free);
              return (
                <div
                  key={p.id}
                  className="panel"
                  onClick={() => open && nav(`/puzzles/${p.id}`)}
                  style={{ cursor: open ? 'pointer' : 'not-allowed', opacity: open ? 1 : 0.45, padding: 12, borderColor: rec ? '#5c5233' : 'var(--border)' }}
                >
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="faint mono" style={{ fontSize: '0.78rem' }}>
                      #{i + 1} · {p.n}q
                    </span>
                    <span style={{ color: 'var(--yellow)', letterSpacing: 1 }}>
                      {[0, 1, 2].map((k) => (k < (rec?.stars ?? 0) ? '★' : '☆')).join('')}
                    </span>
                  </div>
                  <div style={{ fontWeight: 600, marginTop: 4 }}>{open ? p.title : '🔒 Locked'}</div>
                  <div className="faint" style={{ fontSize: '0.78rem' }}>
                    par {p.par}
                    {rec ? ` · best ${rec.gates}` : ''}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function PuzzleView({ id }: { id: string }) {
  const idx = PUZZLES.findIndex((p) => p.id === id);
  const p = PUZZLES[idx];
  const rec = useProgress((s) => s.puzzles[id]);
  const record = useProgress((s) => s.recordPuzzle);
  const [result, setResult] = useState<{ stars: number; gates: number } | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const nav = useNavigate();

  const goal = useMemo<CircuitGoal | null>(() => {
    if (!p) return null;
    if (p.goal.kind === 'state') return { kind: 'state', amps: p.goal.amps.map(([r, i]) => c(r, i)) };
    return { kind: 'unitary', U: circuitUnitary(parseCircuit(p.goal.circuit, p.n)), label: 'implement the target operation' };
  }, [p]);

  if (!p || !goal) return <div style={{ padding: 40 }}>Puzzle not found. <Link to="/puzzles">Back</Link></div>;
  const next = PUZZLES[idx + 1];

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '20px 20px 80px' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <Link to="/puzzles">← All puzzles</Link>
        <span className="faint">
          {p.chapter} · #{idx + 1} of {PUZZLES.length}
        </span>
      </div>
      <h1 style={{ margin: '12px 0 4px' }}>{p.title}</h1>
      <div style={{ fontSize: '1.1rem' }}>
        <RichText text={p.description} />
      </div>
      <div className="row faint" style={{ fontSize: '0.88rem', marginTop: 6 }}>
        <span>par: {p.par} gates</span>
        {rec && (
          <span style={{ color: 'var(--yellow)' }}>
            best: {'★'.repeat(rec.stars)} ({rec.gates} gates)
          </span>
        )}
        {p.hint && (
          <button className="btn small ghost" onClick={() => setShowHint((s) => !s)}>
            💡 {showHint ? 'hide hint' : 'hint'}
          </button>
        )}
      </div>
      {showHint && p.hint && (
        <div className="panel" style={{ marginTop: 8, borderColor: '#5c5233', color: 'var(--yellow)' }}>
          <RichText text={p.hint} />
        </div>
      )}
      <CircuitLab
        key={`${p.id}-${attempt}`}
        title="Puzzle circuit"
        n={p.n}
        gates={p.gates as GateName[]}
        goal={goal}
        initialState={p.initialState}
        maxGates={p.maxGates}
        columns={Math.max(6, p.par + 3)}
        onSolved={(gates) => {
          const stars = starsFor(p, gates);
          record(p.id, stars, gates);
          setResult({ stars, gates });
        }}
      />
      {result && (
        <div className="panel pop" style={{ borderColor: 'var(--yellow)', display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '2rem', color: 'var(--yellow)', letterSpacing: 4 }}>
            {[0, 1, 2].map((k) => (k < result.stars ? '★' : '☆')).join('')}
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <b>Solved with {result.gates} gate{result.gates === 1 ? '' : 's'}!</b>{' '}
            {result.stars < 3 && <span className="dim">Par is {p.par}. Can you find a shorter circuit?</span>}
            {p.explain && (
              <div className="dim" style={{ marginTop: 4 }}>
                <RichText text={p.explain} />
              </div>
            )}
          </div>
          <div className="row">
            <button
              className="btn"
              onClick={() => {
                setResult(null);
                setAttempt((a) => a + 1);
              }}
            >
              Retry
            </button>
            {next && (
              <button
                className="btn primary"
                onClick={() => {
                  setResult(null);
                  nav(`/puzzles/${next.id}`);
                }}
              >
                Next puzzle →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
