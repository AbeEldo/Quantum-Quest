import React, { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UNITS, ALL_LESSONS, ALL_CARDS } from '../content/curriculum';
import { useProgress, rankFor } from '../state/progress';
import { isUnitUnlocked, unitProgress, unitComplete, nextLesson } from '../content/unlocks';
import { Stat, ProgressBar } from '../components/ui';
import { DailyChallenge } from '../components/DailyChallenge';
import { mulberry32 } from '../engine/qsim';

export function Home() {
  const p = useProgress();
  const nav = useNavigate();
  const next = nextLesson(p);
  const rank = rankFor(p.xp);
  const done = Object.keys(p.lessons).length;
  const now = Date.now();
  const due = Object.entries(p.cards).filter(([id, c]) => c.due <= now && ALL_CARDS.some((x) => x.id === id)).length;

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 20px 80px' }}>
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: '1.4fr 1fr',
          gap: 20,
          marginBottom: 28,
        }}
      >
        <div className="panel" style={{ padding: 24, background: 'radial-gradient(ellipse at top left, #18233a 0%, #121620 70%)', position: 'relative', overflow: 'hidden' }}>
          <Orbits />
          <div style={{ position: 'relative' }}>
            <div className="faint" style={{ textTransform: 'uppercase', letterSpacing: '0.15em', fontSize: '0.75rem' }}>
              From first principles to quantum computers
            </div>
            <h1 style={{ margin: '6px 0 8px', fontSize: '2.2rem' }}>
              {done === 0 ? 'Welcome, explorer.' : `Welcome back, ${rank.title}.`}
            </h1>
            <p className="dim" style={{ maxWidth: 560, margin: '0 0 16px' }}>
              {done === 0
                ? 'Nature at its smallest scale follows rules that defy everyday intuition. In this course you will rediscover those rules through experiments, build the mathematics yourself, and use it to program quantum computers.'
                : `You've completed ${done} of ${ALL_LESSONS.length} lessons. Keep the coherence going!`}
            </p>
            <div className="row">
              {next ? (
                <button className="btn primary" onClick={() => nav(`/lesson/${next.id}`)} style={{ fontSize: '1.02rem', padding: '11px 22px' }}>
                  ▶ {done === 0 ? 'Start the journey' : 'Continue'}: {next.title}
                </button>
              ) : (
                <span className="pill good">All available lessons complete!</span>
              )}
              {due > 0 && (
                <button className="btn" onClick={() => nav('/review')}>
                  🧠 Review {due} card{due === 1 ? '' : 's'}
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="col" style={{ gap: 12 }}>
          <div className="row" style={{ gap: 10 }}>
            <Stat label="XP" value={p.xp} />
            <Stat label="Lessons" value={`${done}/${ALL_LESSONS.length}`} color="var(--blue)" />
            <Stat label="Streak" value={`🔥${p.streak.count}`} color="var(--orange)" />
            <Stat label="Badges" value={Object.keys(p.achievements).length} color="var(--pink)" />
          </div>
          <div className="panel" style={{ padding: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between', fontSize: '0.88rem' }}>
              <span>
                {rank.icon} <b>{rank.title}</b>
              </span>
              <span className="faint">{rank.next ? `${rank.next.xp - p.xp} XP to ${rank.next.title}` : 'Max rank!'}</span>
            </div>
            <ProgressBar value={rank.progress} style={{ marginTop: 6 }} color="linear-gradient(90deg,#58c4dd,#fcd34d)" />
          </div>
          <DailyChallenge />
        </div>
      </section>

      {done === 0 && (
        <section className="panel" style={{ marginBottom: 28, padding: 20 }}>
          <h3 style={{ marginTop: 0 }}>How Quantum Quest works</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16, fontSize: '0.92rem' }}>
            <div>
              <b>🔮 Predict, then see.</b>
              <div className="dim">Before each key experiment you commit to a prediction. Being wrong is the point: the surprises go into your journal.</div>
            </div>
            <div>
              <b>👆 Play with everything.</b>
              <div className="dim">Every lesson has live simulations: Bloch spheres, circuits, wave packets, interferometers. Drag, tweak and break them.</div>
            </div>
            <div>
              <b>⭐ Earn XP and ranks.</b>
              <div className="dim">Checkpoints, games, puzzles and boss battles award XP. Climb from Classical Thinker to Fault-Tolerant Master.</div>
            </div>
            <div>
              <b>🧠 Remember it.</b>
              <div className="dim">Finished lessons add flashcards to a spaced-repetition deck. A few minutes of review a day keeps it all in memory.</div>
            </div>
          </div>
          <div className="faint" style={{ fontSize: '0.85rem', marginTop: 12 }}>
            Already comfortable with complex numbers and linear algebra? World 0 is an optional refresher, and World 1 is open too. Want to explore freely? Turn on free roam in your profile.
          </div>
        </section>
      )}

      <h2 style={{ textAlign: 'center', marginBottom: 4 }}>The Map</h2>
      <p className="center faint" style={{ marginTop: 0 }}>
        Each world builds on the last. Finish every lesson in a world — or defeat its boss — to unlock the next.
      </p>
      <MapPath />
    </div>
  );
}

function MapPath() {
  const p = useProgress();
  const nav = useNavigate();
  const W = 1000;
  const rowH = 150;
  const H = UNITS.length * rowH + 60;
  const pos = UNITS.map((_, i) => {
    const x = W / 2 + Math.sin(i * 1.05) * 300;
    const y = 70 + i * rowH;
    return { x, y };
  });
  const stars = useMemo(() => {
    const r = mulberry32(42);
    return Array.from({ length: 220 }, () => ({ x: r() * W, y: r() * H, s: r() * 1.4 + 0.2, o: r() * 0.6 + 0.2 }));
  }, [H]);

  let d = `M${pos[0].x} ${pos[0].y}`;
  for (let i = 1; i < pos.length; i++) {
    const a = pos[i - 1], b = pos[i];
    d += ` C${a.x} ${a.y + rowH * 0.55}, ${b.x} ${b.y - rowH * 0.55}, ${b.x} ${b.y}`;
  }

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {stars.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.s} fill="#fff" opacity={s.o * 0.5} />
        ))}
        <path d={d} fill="none" stroke="#2a3142" strokeWidth={6} strokeLinecap="round" />
        <path d={d} fill="none" stroke="#58c4dd" strokeWidth={2} strokeDasharray="2 10" strokeLinecap="round" opacity={0.6} />
        {UNITS.map((u, i) => {
          const { x, y } = pos[i];
          const unlocked = isUnitUnlocked(u, p);
          const prog = unitProgress(u, p);
          const complete = unitComplete(u, p);
          const R = 46;
          const circ = 2 * Math.PI * (R + 7);
          const left = x > W / 2;
          return (
            <g key={u.id} style={{ cursor: unlocked ? 'pointer' : 'not-allowed' }} onClick={() => unlocked && nav(`/unit/${u.id}`)}>
              {unlocked && <circle cx={x} cy={y} r={R + 14} fill={u.color} opacity={0.08} filter="url(#glow)" />}
              <circle cx={x} cy={y} r={R + 7} fill="none" stroke="#232a38" strokeWidth={5} />
              {prog > 0 && (
                <circle
                  cx={x}
                  cy={y}
                  r={R + 7}
                  fill="none"
                  stroke={u.color}
                  strokeWidth={5}
                  strokeDasharray={`${prog * circ} ${circ}`}
                  transform={`rotate(-90 ${x} ${y})`}
                  strokeLinecap="round"
                />
              )}
              <circle cx={x} cy={y} r={R} fill={unlocked ? '#151a26' : '#101219'} stroke={unlocked ? u.color : '#333'} strokeWidth={2.5} />
              <text x={x} y={y + 12} textAnchor="middle" fontSize={34} fill={unlocked ? u.color : '#444'} style={{ fontFamily: 'var(--serif)' }}>
                {unlocked ? u.icon : '🔒'}
              </text>
              {complete && (
                <g>
                  <circle cx={x + R * 0.75} cy={y - R * 0.75} r={13} fill="#83c167" />
                  <text x={x + R * 0.75} y={y - R * 0.75 + 5} textAnchor="middle" fontSize={15} fill="#0b0d12" fontWeight={700}>
                    ✓
                  </text>
                </g>
              )}
              <text x={left ? x - R - 24 : x + R + 24} y={y - 8} textAnchor={left ? 'end' : 'start'} fontSize={13} fill="#7d8699" style={{ letterSpacing: '0.12em' }}>
                {u.number === 12 ? 'FINALE' : `WORLD ${u.number}`}
              </text>
              <text x={left ? x - R - 24 : x + R + 24} y={y + 14} textAnchor={left ? 'end' : 'start'} fontSize={21} fill={unlocked ? '#e9ecf2' : '#555'} style={{ fontFamily: 'var(--serif)', fontWeight: 600 }}>
                {u.title}
              </text>
              <text x={left ? x - R - 24 : x + R + 24} y={y + 34} textAnchor={left ? 'end' : 'start'} fontSize={12.5} fill="#7d8699">
                {u.lessons.length ? `${u.lessons.filter((l) => p.lessons[l.id]).length}/${u.lessons.length} lessons` : ''}
                {u.games.length ? ` · ${u.games.length} game${u.games.length > 1 ? 's' : ''}` : ''}
                {u.boss ? ' · boss' : ''}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Orbits() {
  return (
    <svg viewBox="-100 -100 200 200" style={{ position: 'absolute', right: -40, top: -40, width: 280, opacity: 0.35 }}>
      <g style={{ transformOrigin: 'center', animation: 'spin 40s linear infinite' }}>
        <ellipse rx={80} ry={30} fill="none" stroke="#58c4dd" />
        <ellipse rx={80} ry={30} fill="none" stroke="#fcd34d" transform="rotate(60)" />
        <ellipse rx={80} ry={30} fill="none" stroke="#e07ab6" transform="rotate(-60)" />
      </g>
      <circle r={7} fill="#fff" />
      <style>{`@keyframes spin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }`}</style>
    </svg>
  );
}

export { Link };
