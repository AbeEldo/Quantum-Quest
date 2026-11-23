import React, { ReactElement, ReactNode, useMemo, useState } from 'react';
import { useProgress } from '../../state/progress';
import { useStepGate } from './gates';
import { sfx } from '../../state/sfx';

/* Marker components: Quiz/Predict read these from their children. */
export function Q({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}
export function Opt({ children }: { children?: ReactNode; correct?: boolean; why?: string }) {
  return <>{children}</>;
}
export function Explain({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}
export function Reveal({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}
export function Hint({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

function collect(children: ReactNode) {
  const arr = React.Children.toArray(children) as ReactElement<any>[];
  const pick = (t: unknown) => arr.filter((c) => React.isValidElement(c) && c.type === t);
  return {
    q: pick(Q)[0]?.props.children as ReactNode,
    opts: pick(Opt).map((o) => ({ content: o.props.children as ReactNode, correct: !!o.props.correct, why: o.props.why as string | undefined })),
    explain: pick(Explain)[0]?.props.children as ReactNode,
    reveal: pick(Reveal)[0]?.props.children as ReactNode,
    hints: pick(Hint).map((h) => h.props.children as ReactNode),
    rest: arr.filter((c) => !(React.isValidElement(c) && [Q, Opt, Explain, Reveal, Hint].includes(c.type as any))),
  };
}

const LETTERS = 'ABCDEFGH';

/**
 * Multiple-choice checkpoint. Mark correct options with `<Opt correct>`.
 * If more than one option is correct, the learner must select all of them.
 */
export function Quiz({ id, children, xp = 15, optional = false }: { id: string; children?: ReactNode; xp?: number; optional?: boolean }) {
  const { q, opts, explain, hints } = useMemo(() => collect(children), [children]);
  const saved = useProgress((s) => s.quizzes[id]);
  const recordQuiz = useProgress((s) => s.recordQuiz);
  const multi = opts.filter((o) => o.correct).length > 1;
  const [selected, setSelected] = useState<number[]>([]);
  const [status, setStatus] = useState<'idle' | 'wrong' | 'right' | 'revealed'>(saved?.correct ? 'right' : 'idle');
  const [attempts, setAttempts] = useState(0);
  const [shake, setShake] = useState(false);
  const [hintsShown, setHintsShown] = useState(0);
  const done = status === 'right' || status === 'revealed';
  useStepGate(`quiz:${id}`, optional || done);

  const correctSet = opts.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0);

  const submit = (sel: number[]) => {
    const ok = sel.length === correctSet.length && sel.every((i) => correctSet.includes(i));
    recordQuiz(id, ok, xp);
    setAttempts((a) => a + 1);
    if (ok) {
      sfx.correct();
      setStatus('right');
    } else {
      sfx.wrong();
      setShake(true);
      setTimeout(() => setShake(false), 450);
      setStatus(attempts + 1 >= 2 ? 'revealed' : 'wrong');
    }
  };

  const click = (i: number) => {
    if (done) return;
    if (multi) {
      setSelected((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]));
      setStatus('idle');
    } else {
      setSelected([i]);
      submit([i]);
    }
  };

  const wrongWhy = status === 'wrong' && selected.length === 1 ? opts[selected[0]]?.why : undefined;

  return (
    <div className={`quiz ${shake ? 'shake' : ''}`} style={quizBox(done ? (status === 'right' ? 'var(--green)' : 'var(--gold)') : 'var(--blue)')}>
      <div className="quiz-head" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={tag('var(--blue)')}>{multi ? 'Select all that apply' : 'Check yourself'}</span>
        {status === 'right' && <span className="pill good">✓ Correct</span>}
        {status === 'revealed' && <span className="pill warn">Answer revealed</span>}
      </div>
      <div className="quiz-q" style={{ fontSize: '1.05rem', marginBottom: 10 }}>
        {q}
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {opts.map((o, i) => {
          const isSel = selected.includes(i);
          const showCorrect = done && o.correct;
          const showWrong = isSel && (status === 'wrong' || (status === 'revealed' && !o.correct));
          return (
            <button
              key={i}
              onClick={() => click(i)}
              className="quiz-opt"
              style={{
                textAlign: 'left',
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                padding: '9px 12px',
                borderRadius: 10,
                cursor: done ? 'default' : 'pointer',
                font: 'inherit',
                color: 'var(--text)',
                background: showCorrect ? 'rgba(131,193,103,.15)' : showWrong ? 'rgba(252,98,85,.12)' : isSel ? 'rgba(88,196,221,.12)' : 'var(--panel-2)',
                border: `1px solid ${showCorrect ? 'var(--green)' : showWrong ? 'var(--red)' : isSel ? 'var(--blue)' : 'var(--border)'}`,
                transition: 'all .15s',
              }}
            >
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: multi ? 6 : 13,
                  border: '1px solid var(--border)',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  flexShrink: 0,
                  background: isSel ? 'var(--blue-d)' : 'transparent',
                  color: isSel ? '#04141a' : 'var(--text-dim)',
                }}
              >
                {showCorrect ? '✓' : LETTERS[i]}
              </span>
              <span className="quiz-opt-content">{o.content}</span>
            </button>
          );
        })}
      </div>
      {multi && !done && (
        <div style={{ marginTop: 10 }}>
          <button className="btn primary small" disabled={!selected.length} onClick={() => submit(selected)}>
            Check
          </button>
        </div>
      )}
      {status === 'wrong' && (
        <div style={{ marginTop: 10, color: 'var(--red)' }}>
          Not quite{wrongWhy ? <> — {wrongWhy}</> : '.'} Try again{hints.length > 0 && hintsShown === 0 ? ', or take a hint.' : '.'}
        </div>
      )}
      {!done && hints.length > hintsShown && (attempts > 0 || hintsShown > 0) && (
        <button className="btn ghost small" style={{ marginTop: 8 }} onClick={() => setHintsShown((h) => h + 1)}>
          💡 Hint {hintsShown + 1}/{hints.length}
        </button>
      )}
      {hints.slice(0, hintsShown).map((h, i) => (
        <div key={i} style={{ marginTop: 8, color: 'var(--yellow)', fontSize: '0.95rem' }}>
          💡 {h}
        </div>
      ))}
      {done && explain && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--border)', color: 'var(--text-dim)' }} className="pop">
          {explain}
        </div>
      )}
    </div>
  );
}

/** Numeric-answer checkpoint with tolerance. */
export function NumQuiz({
  id,
  answer,
  tol = 0.01,
  unit,
  children,
  xp = 20,
}: {
  id: string;
  answer: number;
  tol?: number;
  unit?: string;
  children?: ReactNode;
  xp?: number;
}) {
  const { q, explain, hints } = useMemo(() => collect(children), [children]);
  const saved = useProgress((s) => s.quizzes[id]);
  const recordQuiz = useProgress((s) => s.recordQuiz);
  const [val, setVal] = useState('');
  const [status, setStatus] = useState<'idle' | 'wrong' | 'right' | 'revealed'>(saved?.correct ? 'right' : 'idle');
  const [attempts, setAttempts] = useState(0);
  const [hintsShown, setHintsShown] = useState(0);
  const done = status === 'right' || status === 'revealed';
  useStepGate(`quiz:${id}`, done);

  const check = () => {
    const x = parseNumber(val);
    if (x === null) return;
    const ok = Math.abs(x - answer) <= tol * Math.max(1, Math.abs(answer) < 1 ? 1 : 1);
    recordQuiz(id, ok, xp);
    setAttempts((a) => a + 1);
    if (ok) sfx.correct();
    else sfx.wrong();
    setStatus(ok ? 'right' : attempts + 1 >= 3 ? 'revealed' : 'wrong');
  };

  return (
    <div style={quizBox(done ? (status === 'right' ? 'var(--green)' : 'var(--gold)') : 'var(--blue)')}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={tag('var(--blue)')}>Calculate</span>
        {status === 'right' && <span className="pill good">✓ Correct</span>}
        {status === 'revealed' && <span className="pill warn">Answer: {answer}</span>}
      </div>
      <div style={{ fontSize: '1.05rem', marginBottom: 10 }}>{q}</div>
      <div className="row">
        <input
          type="text"
          value={val}
          disabled={done}
          placeholder="Your answer (e.g. 0.5, 1/3, sqrt(2)/2)"
          onChange={(e) => {
            setVal(e.target.value);
            if (status === 'wrong') setStatus('idle');
          }}
          onKeyDown={(e) => e.key === 'Enter' && check()}
          style={{ width: 280 }}
        />
        {unit && <span className="dim">{unit}</span>}
        {!done && (
          <button className="btn primary small" onClick={check} disabled={parseNumber(val) === null}>
            Check
          </button>
        )}
      </div>
      {status === 'wrong' && <div style={{ marginTop: 8, color: 'var(--red)' }}>Not quite — try again.</div>}
      {!done && hints.length > hintsShown && attempts > 0 && (
        <button className="btn ghost small" style={{ marginTop: 8 }} onClick={() => setHintsShown((h) => h + 1)}>
          💡 Hint
        </button>
      )}
      {hints.slice(0, hintsShown).map((h, i) => (
        <div key={i} style={{ marginTop: 8, color: 'var(--yellow)' }}>
          💡 {h}
        </div>
      ))}
      {done && explain && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--border)', color: 'var(--text-dim)' }} className="pop">
          {explain}
        </div>
      )}
    </div>
  );
}

/** Parse numbers like "0.5", "1/3", "sqrt(2)/2", "pi/4", "2e-3", "50%". */
export function parseNumber(s: string): number | null {
  const t = s.trim().toLowerCase();
  if (!t) return null;
  if (!/^[0-9+\-*/().,\s%e^a-z√π]+$/.test(t)) return null;
  let expr = t
    .replace(/(\d),(?=\d{3}(?!\d))/g, '$1') // thousands separators: 10,000 -> 10000
    .replace(/\s+/g, '')
    .replace(/,/g, '.')
    .replace(/π/g, 'pi')
    .replace(/√\s*\(?([0-9.]+)\)?/g, 'sqrt($1)')
    .replace(/(\d+(?:\.\d+)?)%/g, '($1/100)')
    .replace(/\^/g, '**');
  if (/[a-df-oq-rt-z]/.test(expr.replace(/sqrt|pi|exp|log|ln|sin|cos|tan/g, ''))) return null;
  expr = expr.replace(/sqrt/g, 'Math.sqrt').replace(/\bpi\b/g, 'Math.PI').replace(/\bexp\b/g, 'Math.exp').replace(/\bln\b/g, 'Math.log').replace(/\blog\b/g, 'Math.log10')
    .replace(/\bsin\b/g, 'Math.sin').replace(/\bcos\b/g, 'Math.cos').replace(/\btan\b/g, 'Math.tan');
  try {
    // eslint-disable-next-line no-new-func
    const v = Function(`"use strict"; return (${expr});`)();
    return typeof v === 'number' && isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Predict-then-reveal. The learner commits to a prediction before the <Reveal> content
 * (usually an experiment widget) is shown. Mark the actual outcome with <Opt correct>;
 * if no option is marked correct, it is a poll with no right answer.
 */
export function Predict({ id, children }: { id: string; children?: ReactNode }) {
  const { q, opts, reveal, explain } = useMemo(() => collect(children), [children]);
  const saved = useProgress((s) => s.predictions[id]);
  const record = useProgress((s) => s.recordPrediction);
  const [choice, setChoice] = useState<number | null>(null);
  const revealed = choice !== null || !!saved;
  useStepGate(`predict:${id}`, revealed);
  const hasAnswer = opts.some((o) => o.correct);

  const pick = (i: number) => {
    if (revealed) return;
    setChoice(i);
    const ok = !hasAnswer || opts[i].correct;
    if (hasAnswer && ok) sfx.correct();
    else sfx.click();
    const correctText = opts.find((o) => o.correct)?.content;
    record(id, ok, `Predicted “${textOf(opts[i].content)}” — actually: “${textOf(correctText)}”`);
  };

  return (
    <div style={{ ...quizBox('var(--yellow)'), background: 'linear-gradient(180deg, rgba(252,211,77,.07), rgba(252,211,77,.02))' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={tag('var(--yellow)')}>🔮 Make a prediction</span>
        {revealed && choice !== null && hasAnswer && (
          <span className={`pill ${opts[choice].correct ? 'good' : 'warn'}`}>{opts[choice].correct ? 'You called it!' : 'Surprise!'}</span>
        )}
      </div>
      <div style={{ fontSize: '1.05rem', marginBottom: 10 }}>{q}</div>
      <div style={{ display: 'grid', gridTemplateColumns: opts.length <= 3 ? `repeat(${opts.length}, 1fr)` : 'repeat(2, 1fr)', gap: 8 }}>
        {opts.map((o, i) => {
          const isChoice = choice === i;
          const show = revealed && hasAnswer;
          return (
            <button
              key={i}
              onClick={() => pick(i)}
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                font: 'inherit',
                color: 'var(--text)',
                cursor: revealed ? 'default' : 'pointer',
                textAlign: 'left',
                background: show && o.correct ? 'rgba(131,193,103,.15)' : isChoice ? 'rgba(252,211,77,.15)' : 'var(--panel-2)',
                border: `1px solid ${show && o.correct ? 'var(--green)' : isChoice ? 'var(--yellow)' : 'var(--border)'}`,
                opacity: revealed && !isChoice && !(show && o.correct) ? 0.6 : 1,
              }}
            >
              {o.content}
              {isChoice && <span className="faint" style={{ fontSize: '0.8rem' }}> ← your prediction</span>}
            </button>
          );
        })}
      </div>
      {!revealed && <div className="faint" style={{ marginTop: 10, fontSize: '0.85rem' }}>Commit to an answer to unlock the experiment. There's no penalty for being wrong — surprises are where learning happens.</div>}
      {revealed && (
        <div className="pop" style={{ marginTop: 14 }}>
          {explain && <div style={{ marginBottom: 10 }}>{explain}</div>}
          {reveal}
        </div>
      )}
    </div>
  );
}

function textOf(n: ReactNode): string {
  if (n == null || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(textOf).join('');
  if (React.isValidElement(n)) {
    const p = n.props as any;
    if (typeof p?.tex === 'string') return '$' + p.tex + '$';
    if (p?.className?.includes?.('katex')) return '[math]';
    return textOf(p?.children);
  }
  return '';
}

const quizBox = (accent: string): React.CSSProperties => ({
  border: `1px solid var(--border)`,
  borderLeft: `4px solid ${accent}`,
  borderRadius: 12,
  padding: '14px 16px',
  margin: '1.4em 0',
  background: 'var(--panel)',
});

const tag = (color: string): React.CSSProperties => ({
  fontSize: '0.72rem',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  fontWeight: 700,
  color,
});
