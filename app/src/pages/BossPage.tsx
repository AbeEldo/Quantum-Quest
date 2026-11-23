import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { unitById } from '../content/curriculum';
import { isUnitUnlocked } from '../content/unlocks';
import { useProgress } from '../state/progress';
import { RichText, shuffle, ProgressBar } from '../components/ui';
import { parseNumber } from '../components/lesson/Quiz';
import type { BossQuestion } from '../content/types';
import { CircuitLab } from '../widgets/CircuitLab';
import { c } from '../engine/complex';
import { sfx } from '../state/sfx';
import type { GateName } from '../engine/circuit';

type Phase = 'intro' | 'fight' | 'won' | 'lost';

export function BossPage() {
  const { unitId } = useParams();
  const u = unitById(unitId ?? '');
  const p = useProgress();
  const nav = useNavigate();
  const boss = u?.boss;
  const [phase, setPhase] = useState<Phase>('intro');
  const [seed, setSeed] = useState(0);
  const order = useMemo(() => (boss ? shuffle(boss.questions.map((_, i) => i)) : []), [boss, seed]);
  const [qi, setQi] = useState(0);
  const [hp, setHp] = useState(boss?.hp ?? 0);
  const [hearts, setHearts] = useState(boss?.hearts ?? 0);
  const [feedback, setFeedback] = useState<null | { ok: boolean; explain: string }>(null);
  const [hit, setHit] = useState<'boss' | 'player' | null>(null);

  if (!u || !boss) return <div style={{ padding: 40 }}>No boss here. <Link to="/">Back</Link></div>;
  if (!isUnitUnlocked(u, p)) return <div className="panel" style={{ maxWidth: 600, margin: '60px auto' }}>🔒 Unlock this world first.</div>;

  const start = () => {
    setSeed((s) => s + 1);
    setQi(0);
    setHp(boss.hp);
    setHearts(boss.hearts);
    setFeedback(null);
    setPhase('fight');
  };

  const answer = (ok: boolean, explain: string) => {
    if (feedback) return;
    setFeedback({ ok, explain });
    if (ok) sfx.hit();
    else sfx.wrong();
    setHit(ok ? 'boss' : 'player');
    setTimeout(() => setHit(null), 500);
    if (ok) setHp((h) => h - 1);
    else setHearts((h) => h - 1);
  };

  const next = () => {
    const nhp = hp, nh = hearts;
    setFeedback(null);
    if (nhp <= 0) {
      p.recordBoss(boss.id, true, nh, boss.xp);
      if (nh === boss.hearts) p.unlock(`flawless`);
      setPhase('won');
      return;
    }
    if (nh <= 0 || qi + 1 >= order.length) {
      p.recordBoss(boss.id, false, nh, boss.xp);
      setPhase('lost');
      return;
    }
    setQi((i) => i + 1);
  };

  const q = boss.questions[order[qi]];

  return (
    <div style={{ maxWidth: 940, margin: '0 auto', padding: '20px 24px 80px' }}>
      <Link to={`/unit/${u.id}`}>← {u.title}</Link>
      <div
        className="panel"
        style={{
          marginTop: 14,
          padding: 24,
          background: 'radial-gradient(ellipse at top, #2a1418 0%, #12141c 70%)',
          borderColor: '#5c2a2f',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div
            className={hit === 'boss' ? 'shake' : ''}
            style={{
              fontSize: '5rem',
              filter: hit === 'boss' ? 'drop-shadow(0 0 20px #fc6255) brightness(1.6)' : 'drop-shadow(0 0 14px rgba(252,98,85,.35))',
              transition: 'filter .2s',
              animation: phase === 'fight' ? 'bossFloat 3s ease-in-out infinite' : undefined,
            }}
          >
            {phase === 'won' ? '💥' : boss.avatar}
          </div>
          <div style={{ flex: 1 }}>
            <div className="faint" style={{ letterSpacing: '0.15em', fontSize: '0.75rem' }}>
              BOSS OF WORLD {u.number}
            </div>
            <h1 style={{ margin: '2px 0 6px' }}>{boss.name}</h1>
            <div className="dim" style={{ fontStyle: 'italic', marginBottom: 10 }}>
              “{phase === 'won' ? 'Impossible… you have mastered this world.' : phase === 'lost' ? 'Ha! Come back when you have studied more.' : boss.taunt}”
            </div>
            {phase !== 'intro' && (
              <>
                <div className="row" style={{ fontSize: '0.85rem', marginBottom: 4 }}>
                  <span style={{ color: 'var(--red)', fontWeight: 700 }}>HP</span>
                  <ProgressBar value={Math.max(0, hp) / boss.hp} color="linear-gradient(90deg,#fc6255,#ff9a76)" height={12} style={{ flex: 1 }} />
                  <span className="mono">
                    {Math.max(0, hp)}/{boss.hp}
                  </span>
                </div>
                <div className={hit === 'player' ? 'shake' : ''} style={{ fontSize: '1.4rem', letterSpacing: 4 }}>
                  {Array.from({ length: boss.hearts }, (_, i) => (
                    <span key={i} style={{ opacity: i < hearts ? 1 : 0.2 }}>
                      ❤️
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <style>{`@keyframes bossFloat { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-8px) } }`}</style>

      {phase === 'intro' && (
        <div className="panel" style={{ marginTop: 16, textAlign: 'center', padding: 28 }}>
          <p className="dim" style={{ maxWidth: 560, margin: '0 auto 16px' }}>
            Answer correctly to deal damage. Each wrong answer costs a heart. Deal <b>{boss.hp}</b> damage before your <b>{boss.hearts}</b> hearts run out to win{' '}
            <b style={{ color: 'var(--yellow)' }}>{boss.xp} XP</b>.
          </p>
          <button className="btn danger" style={{ fontSize: '1.1rem', padding: '12px 30px' }} onClick={start}>
            ⚔️ Begin battle
          </button>
        </div>
      )}

      {phase === 'fight' && q && (
        <div className="panel" style={{ marginTop: 16, padding: 20 }}>
          <div className="faint" style={{ fontSize: '0.8rem', marginBottom: 6 }}>
            Question {qi + 1}
          </div>
          <BossQuestionView key={`${seed}-${qi}`} q={q} onAnswer={answer} locked={!!feedback} />
          {feedback && (
            <div className="pop" style={{ marginTop: 14, padding: 12, borderRadius: 10, background: feedback.ok ? 'rgba(131,193,103,.1)' : 'rgba(252,98,85,.1)', border: `1px solid ${feedback.ok ? 'var(--green)' : 'var(--red)'}` }}>
              <b style={{ color: feedback.ok ? 'var(--green)' : 'var(--red)' }}>{feedback.ok ? '⚔️ Direct hit!' : '💔 Ouch!'}</b>{' '}
              <span className="dim">
                <RichText text={feedback.explain} />
              </span>
              <div style={{ marginTop: 10 }}>
                <button className="btn primary" onClick={next}>
                  {hp <= 0 ? 'Finish him!' : hearts <= 0 ? 'Continue' : 'Next →'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {(phase === 'won' || phase === 'lost') && (
        <div className="panel pop" style={{ marginTop: 16, textAlign: 'center', padding: 28, borderColor: phase === 'won' ? 'var(--green)' : 'var(--red)' }}>
          <h2 style={{ marginTop: 0, color: phase === 'won' ? 'var(--green)' : 'var(--red)' }}>{phase === 'won' ? '🏆 Victory!' : '☠️ Defeated'}</h2>
          <p className="dim">
            {phase === 'won'
              ? `You defeated ${boss.name}${hearts === boss.hearts ? ' without losing a single heart' : ''}. The next world is open.`
              : 'Review the lessons of this world and try again — every attempt teaches you something.'}
          </p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn" onClick={start}>
              {phase === 'won' ? 'Rematch' : 'Try again'}
            </button>
            <button className="btn primary" onClick={() => nav(`/unit/${u.id}`)}>
              Back to world
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function BossQuestionView({ q, onAnswer, locked }: { q: BossQuestion; onAnswer: (ok: boolean, explain: string) => void; locked: boolean }) {
  const [sel, setSel] = useState<number | null>(null);
  const [val, setVal] = useState('');
  const [solvedCircuit, setSolvedCircuit] = useState(false);
  const goal = useMemo(() => (q.type === 'circuit' ? { kind: 'state' as const, amps: q.target.map(([r, i]) => c(r, i)) } : undefined), [q]);
  return (
    <div>
      <div style={{ fontSize: '1.1rem', marginBottom: 12 }}>
        <RichText text={q.prompt} />
      </div>
      {q.type === 'mc' && (
        <div className="col" style={{ gap: 8 }}>
          {q.options.map((o, i) => (
            <button
              key={i}
              className="btn"
              disabled={locked}
              style={{
                justifyContent: 'flex-start',
                textAlign: 'left',
                fontWeight: 400,
                borderColor: locked && i === q.answer ? 'var(--green)' : locked && i === sel ? 'var(--red)' : undefined,
              }}
              onClick={() => {
                setSel(i);
                onAnswer(i === q.answer, q.explain);
              }}
            >
              <RichText text={o} />
            </button>
          ))}
        </div>
      )}
      {q.type === 'numeric' && (
        <div className="row">
          <input type="text" value={val} disabled={locked} onChange={(e) => setVal(e.target.value)} placeholder="e.g. 0.5, 1/3, sqrt(2)/2" style={{ width: 240 }}
            onKeyDown={(e) => { if (e.key === 'Enter' && parseNumber(val) !== null && !locked) onAnswer(Math.abs(parseNumber(val)! - q.answer) <= q.tolerance, q.explain); }} />
          {q.unit && <span className="dim">{q.unit}</span>}
          <button className="btn primary" disabled={locked || parseNumber(val) === null} onClick={() => onAnswer(Math.abs(parseNumber(val)! - q.answer) <= q.tolerance, q.explain)}>
            Attack!
          </button>
          {locked && <span className="faint">Answer: {+q.answer.toFixed(4)}</span>}
        </div>
      )}
      {q.type === 'circuit' && goal && (
        <div>
          <CircuitLab
            title="Build it"
            n={q.n}
            gates={q.gates as GateName[]}
            goal={goal}
            maxGates={q.maxGates}
            showBloch={false}
            stepper={false}
            columns={6}
            onSolved={() => setSolvedCircuit(true)}
          />
          <div className="row">
            <button className="btn primary" disabled={locked} onClick={() => onAnswer(solvedCircuit, q.explain)}>
              {solvedCircuit ? 'Submit circuit ⚔️' : 'Submit (goal not met yet)'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
