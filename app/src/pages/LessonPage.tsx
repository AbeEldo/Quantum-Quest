import React, { ComponentType, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MDXProvider } from '@mdx-js/react';
import { lessonById, ALL_LESSONS } from '../content/curriculum';
import { isLessonUnlocked } from '../content/unlocks';
import { useProgress } from '../state/progress';
import { mdxComponents } from '../components/mdx';
import { StepGateContext, GateCtx } from '../components/lesson/gates';
import { ProgressBar } from '../components/ui';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { Watch } from '../components/lesson/Callouts';
import { sfx } from '../state/sfx';

export function LessonPage() {
  const { id } = useParams();
  const lesson = lessonById(id ?? '');
  const p = useProgress();
  const [Content, setContent] = useState<ComponentType<any> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setContent(null);
    setErr(null);
    if (!lesson) return;
    lesson
      .load()
      .then((m) => setContent(() => m.default))
      .catch((e) => setErr(String(e)));
  }, [lesson]);

  if (!lesson) return <div style={{ padding: 40 }}>Lesson not found. <Link to="/">Back to map</Link></div>;
  if (!isLessonUnlocked(lesson.id, p))
    return (
      <div style={{ maxWidth: 700, margin: '60px auto', padding: 20 }} className="panel">
        🔒 This lesson is locked. Complete the previous lesson first. <Link to={`/unit/${lesson.unit.id}`}>Back to {lesson.unit.title}</Link>
      </div>
    );

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 24px 120px' }}>
      <div className="row" style={{ justifyContent: 'space-between', fontSize: '0.9rem' }}>
        <Link to={`/unit/${lesson.unit.id}`}>
          ← {lesson.unit.icon} World {lesson.unit.number}: {lesson.unit.title}
        </Link>
        <span className="faint">
          Lesson {lesson.index + 1} of {lesson.unit.lessons.length} · ~{lesson.minutes} min
        </span>
      </div>
      <header style={{ margin: '18px 0 8px', borderBottom: `2px solid ${lesson.unit.color}44`, paddingBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: '2.3rem' }}>{lesson.title}</h1>
        {lesson.subtitle && <div className="dim" style={{ fontSize: '1.1rem', marginTop: 4 }}>{lesson.subtitle}</div>}
      </header>
      {err && <div className="panel" style={{ borderColor: 'var(--red)' }}>Failed to load lesson: {err}</div>}
      {!Content && !err && <div className="faint" style={{ padding: 40 }}>Loading…</div>}
      {Content && <StepPlayer key={lesson.id} lessonId={lesson.id} Content={Content} />}
    </div>
  );
}

interface PlayerState {
  lessonId: string;
  current: number;
  setCurrent: (n: number) => void;
  total: number;
  setTotal: (n: number) => void;
  gates: Record<number, Record<string, boolean>>;
  ctxs: GateCtx[];
  stepRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
  celebrate: boolean;
  setCelebrate: (b: boolean) => void;
}
const PlayerCtx = React.createContext<PlayerState | null>(null);

/** Inserted around each section of a lesson by the remark-steps build plugin. */
function Step({ index, total, children }: { index: string; total: string; children?: ReactNode }) {
  const ps = React.useContext(PlayerCtx);
  const i = parseInt(index, 10);
  const n = parseInt(total, 10);
  useEffect(() => {
    if (ps && ps.total !== n) ps.setTotal(n);
  }, [ps, n]);
  if (!ps) return <>{children}</>;
  const shown = Math.min(ps.current, n - 1);
  if (i > shown) return null;
  return (
    <div
      ref={(el) => {
        ps.stepRefs.current[i] = el;
      }}
      className={i === shown && i > 0 && ps.current < 9999 ? 'step-enter' : ''}
      style={{ scrollMarginTop: 80 }}
    >
      <StepGateContext.Provider value={ps.ctxs[Math.min(i, ps.ctxs.length - 1)]}>
        <ErrorBoundary inline>{children}</ErrorBoundary>
      </StepGateContext.Provider>
    </div>
  );
}

/** MDX wrapper: progress bar + content + footer controls. */
function StepWrapper({ children }: { children?: ReactNode }) {
  const ps = React.useContext(PlayerCtx)!;
  const lesson = lessonById(ps.lessonId)!;
  const completed = !!useProgress((s) => s.lessons[ps.lessonId]);
  const total = Math.max(1, ps.total);
  const shown = Math.min(ps.current, total - 1);
  const isLast = shown === total - 1;
  return (
    <>
      <div style={{ position: 'sticky', top: 52, zIndex: 20, padding: '8px 0', background: 'linear-gradient(var(--bg) 70%, transparent)' }}>
        <ProgressBar value={(completed ? total : shown + (isLast ? 0.5 : 0)) / total} color={lesson.unit.color} height={6} />
      </div>
      {children}
      <StepsFooter />
    </>
  );
}

/** Reveals lesson steps one at a time, gating "Continue" on checkpoints. */
function StepPlayer({ lessonId, Content }: { lessonId: string; Content: ComponentType<any> }) {
  const p = useProgress();
  const savedStep = p.lessonStep[lessonId] ?? 0;
  const completed = !!p.lessons[lessonId];
  const [current, setCurrent] = useState(completed ? 9999 : savedStep);
  const [total, setTotal] = useState(0);
  const [gates, setGates] = useState<Record<number, Record<string, boolean>>>({});
  const [celebrate, setCelebrate] = useState(false);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

  const ctxs = useMemo(
    () =>
      Array.from({ length: 64 }, (_, step): GateCtx => ({
        lessonId,
        set: (id, resolved) =>
          setGates((g) => (g[step]?.[id] === resolved ? g : { ...g, [step]: { ...(g[step] ?? {}), [id]: resolved } })),
        remove: (id) =>
          setGates((g) => {
            if (!g[step] || !(id in g[step])) return g;
            const s2 = { ...g[step] };
            delete s2[id];
            return { ...g, [step]: s2 };
          }),
      })),
    [lessonId],
  );

  const value = useMemo<PlayerState>(
    () => ({ lessonId, current, setCurrent, total, setTotal, gates, ctxs, stepRefs, celebrate, setCelebrate }),
    [lessonId, current, total, gates, ctxs, celebrate],
  );

  const components = useMemo(() => ({ ...mdxComponents, Step, wrapper: StepWrapper }), []);

  return (
    <PlayerCtx.Provider value={value}>
      <MDXProvider components={components as any}>
        <article className="lesson-body">
          <Content />
        </article>
        <style>{lessonCss}</style>
      </MDXProvider>
    </PlayerCtx.Provider>
  );
}

function StepsFooter() {
  const ps = React.useContext(PlayerCtx)!;
  const { lessonId, current, setCurrent, gates, stepRefs, celebrate, setCelebrate } = ps;
  const lesson = lessonById(lessonId)!;
  const p = useProgress();
  const nav = useNavigate();
  const completed = !!p.lessons[lessonId];
  const total = Math.max(1, ps.total);
  const shown = Math.min(current, total - 1);
  const blocked = Object.values(gates[shown] ?? {}).some((v) => !v);
  const isLast = shown === total - 1;
  const contRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== 'Enter' || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(t.tagName)) return;
      if (contRef.current && !contRef.current.disabled) contRef.current.click();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <>
      <div style={{ margin: '36px 0', display: 'flex', justifyContent: 'center', gap: 12, alignItems: 'center', flexDirection: 'column' }}>
        {!isLast && (
          <>
            <button
              ref={contRef}
              className="btn primary"
              style={{ fontSize: '1.05rem', padding: '12px 34px' }}
              disabled={blocked}
              onClick={() => {
                const nx = shown + 1;
                setCurrent(nx);
                p.setLessonStep(lessonId, nx);
                setTimeout(() => stepRefs.current[nx]?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
              }}
            >
              Continue ↓
            </button>
            <span className="faint" style={{ fontSize: '0.82rem' }}>
              {blocked ? 'Complete the checkpoint above to continue.' : `Step ${shown + 1} of ${total} · press Enter`}
            </span>
          </>
        )}
        {isLast && !completed && (
          <button
            className="btn gold"
            style={{ fontSize: '1.1rem', padding: '13px 36px' }}
            disabled={blocked}
            onClick={() => {
              const xp = lesson.xp ?? 100;
              p.completeLesson(lessonId, xp, (lesson.cards ?? []).map((c) => c.id));
              const h = new Date().getHours();
              if (h >= 0 && h < 5) p.unlock('night-owl');
              sfx.levelUp();
              setCelebrate(true);
            }}
          >
            ✓ Complete lesson
          </button>
        )}
        {isLast && blocked && !completed && <span className="faint" style={{ fontSize: '0.82rem' }}>Complete the checkpoint above to finish.</span>}
        {completed && <NextNav lessonId={lessonId} />}
      </div>
      {lesson.sources && lesson.sources.length > 0 && (isLast || completed) && (
        <section style={{ marginTop: 20 }}>
          <h3>Go deeper</h3>
          {lesson.sources.map((s, i) =>
            s.url ? (
              <Watch key={i} title={s.title} by={s.by} url={s.url} note={s.note} kind={s.kind === 'course' ? 'article' : s.kind} />
            ) : (
              <div key={i} className="panel" style={{ margin: '8px 0', padding: '10px 14px' }}>
                📘 <b>{s.title}</b>{' '}
                <span className="faint">
                  {s.by}
                  {s.note ? ` — ${s.note}` : ''}
                </span>
              </div>
            ),
          )}
        </section>
      )}
      {celebrate && (
        <Celebration
          xp={lesson.xp ?? 100}
          cards={lesson.cards?.length ?? 0}
          color={lesson.unit.color}
          onClose={() => setCelebrate(false)}
          onNext={() => {
            setCelebrate(false);
            const nx = ALL_LESSONS[ALL_LESSONS.findIndex((l) => l.id === lessonId) + 1];
            if (nx && nx.unit.id === lesson.unit.id) nav(`/lesson/${nx.id}`);
            else nav(`/unit/${lesson.unit.id}`);
          }}
        />
      )}
    </>
  );
}

function NextNav({ lessonId }: { lessonId: string }) {
  const lesson = lessonById(lessonId)!;
  const idx = ALL_LESSONS.findIndex((l) => l.id === lessonId);
  const nx = ALL_LESSONS[idx + 1];
  const sameUnit = nx && nx.unit.id === lesson.unit.id;
  return (
    <div className="row" style={{ justifyContent: 'center' }}>
      <span className="pill good">✓ Lesson complete</span>
      <Link to={`/unit/${lesson.unit.id}`} className="btn">
        Back to world
      </Link>
      {sameUnit && (
        <Link to={`/lesson/${nx.id}`} className="btn primary">
          Next: {nx.title} →
        </Link>
      )}
    </div>
  );
}

function Celebration({ xp, cards, color, onClose, onNext }: { xp: number; cards: number; color: string; onClose: () => void; onNext: () => void }) {
  const particles = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        a: (i / 40) * Math.PI * 2 + Math.random() * 0.3,
        d: 120 + Math.random() * 140,
        c: ['#58c4dd', '#fcd34d', '#e07ab6', '#83c167', color][i % 5],
        s: 4 + Math.random() * 6,
      })),
    [color],
  );
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(5,6,10,0.75)', zIndex: 200, display: 'grid', placeItems: 'center', backdropFilter: 'blur(3px)' }}
    >
      <div onClick={(e) => e.stopPropagation()} className="panel pop" style={{ padding: 36, textAlign: 'center', position: 'relative', minWidth: 380, borderColor: color }}>
        <div style={{ position: 'absolute', left: '50%', top: '40%' }}>
          {particles.map((p, i) => (
            <span
              key={i}
              style={{
                position: 'absolute',
                width: p.s,
                height: p.s,
                borderRadius: '50%',
                background: p.c,
                animation: `burst 1.1s ease-out forwards`,
                ['--dx' as any]: `${Math.cos(p.a) * p.d}px`,
                ['--dy' as any]: `${Math.sin(p.a) * p.d}px`,
              }}
            />
          ))}
        </div>
        <div style={{ fontSize: '3rem' }}>🎉</div>
        <h2 style={{ margin: '6px 0', color: 'var(--yellow)' }}>Lesson complete!</h2>
        <div className="mono" style={{ fontSize: '1.6rem', color: 'var(--yellow)' }}>+{xp} XP</div>
        {cards > 0 && <div className="dim" style={{ marginTop: 6 }}>🧠 {cards} new flashcard{cards > 1 ? 's' : ''} added to your review deck</div>}
        <div className="row" style={{ justifyContent: 'center', marginTop: 20 }}>
          <button className="btn" onClick={onClose}>
            Stay here
          </button>
          <button className="btn primary" onClick={onNext}>
            Onward →
          </button>
        </div>
      </div>
      <style>{`@keyframes burst { from { transform: translate(0,0) scale(1); opacity: 1 } to { transform: translate(var(--dx), var(--dy)) scale(.3); opacity: 0 } }`}</style>
    </div>
  );
}

const lessonCss = `
.lesson-body { font-size: 1.06rem; line-height: 1.72; }
.lesson-body p { margin: 0.85em 0; }
.lesson-body h2 { margin-top: 1.6em; }
.lesson-body ul, .lesson-body ol { padding-left: 1.4em; }
.lesson-body li { margin: 0.3em 0; }
.lesson-body img { max-width: 100%; border-radius: 8px; }
.lesson-body strong { color: #fff; }
.lesson-body em { color: #dfe6f3; }
.step-enter { animation: stepIn .5s cubic-bezier(.2,.8,.2,1); }
@keyframes stepIn { from { opacity: 0; transform: translateY(14px);} to { opacity: 1; transform: none; } }
.quiz-opt-content p, .callout-body > p:first-child { margin-top: 0; }
.quiz-opt-content p:last-child, .callout-body > p:last-child { margin-bottom: 0; }
`;
