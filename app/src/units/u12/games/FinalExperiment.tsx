import React, { useMemo, useRef, useState } from 'react';
import { useGame, HowToPlay } from '../../../components/game';
import { Stat, Tex } from '../../../components/ui';
import { CircuitLab } from '../../../widgets/CircuitLab';
import { StateVector, Ry, Rz, mulberry32, GATES, Rx } from '../../../engine/qsim';
import { c } from '../../../engine/complex';
import { runSyndromeRound, decodeSyndrome } from '../../u11/engine/bitflip';
import { useAnimCanvas } from '../../u10/widgets/anim';

const GAME_ID = 'final-experiment';
type Stage = 0 | 1 | 2 | 3;

export default function FinalExperiment() {
  const g = useGame(GAME_ID);
  const [stage, setStage] = useState<Stage>(0);
  const [scores, setScores] = useState<number[]>([0, 0, 0]);
  const [mistakes, setMistakes] = useState(0);
  const total = scores.reduce((a, b) => a + b, 0);

  const done = (k: number, pts: number, errs: number) => {
    const s = scores.map((x, i) => (i === k ? pts : x));
    setScores(s);
    const m = mistakes + errs;
    setMistakes(m);
    if (k === 2) {
      const t = s.reduce((a, b) => a + b, 0);
      g.finish(t, true, { total: t, mistakes: m });
      g.unlock('final-experiment');
      if (m === 0) g.unlock('flawless-finale');
    }
    setStage((k + 1) as Stage);
  };

  return (
    <div>
      <HowToPlay defaultOpen={g.plays === 0}>
        Three experiments stand between you and the title of <b>Fault-Tolerant Master</b>. Each one is checked by the simulator, not by a quiz:
        <ol style={{ margin: '6px 0 0' }}>
          <li><b>Teleport</b> an unknown qubit from Alice to Bob, using only a shared Bell pair, local operations and two classical bits.</li>
          <li><b>Protect</b> a qubit with the 3-qubit repetition code while the Decoherence Demon injects errors.</li>
          <li><b>Search</b> 8 boxes for a marked item with Grover's algorithm, using as few oracle calls as possible.</li>
        </ol>
      </HowToPlay>
      <div className="row" style={{ gap: 14, marginBottom: 10, flexWrap: 'wrap' }}>
        {['① Teleport', '② Protect', '③ Search', '🏆 Finale'].map((t, i) => (
          <span key={t} className={`pill ${stage > i ? 'good' : stage === i ? 'warn' : ''}`}>{t}{i < 3 && stage > i ? ` · ${scores[i]}` : ''}</span>
        ))}
        <span style={{ marginLeft: 'auto' }}>
          <Stat label="score" value={total} color="var(--yellow)" />
        </span>
      </div>
      {stage === 0 && <TeleportStage onDone={(p, e) => done(0, p, e)} />}
      {stage === 1 && <ProtectStage onDone={(p, e) => done(1, p, e)} />}
      {stage === 2 && <GroverStage onDone={(p, e) => done(2, p, e)} />}
      {stage === 3 && <Finale total={total} mistakes={mistakes} onReplay={() => { setScores([0, 0, 0]); setMistakes(0); setStage(0); }} />}
    </div>
  );
}

/* ------------------------------ Stage 1: teleport ------------------------------ */

interface Card {
  id: string;
  label: string;
  apply?: (s: StateVector, m: { m0: number; m1: number }, rng: () => number) => void;
  illegal?: string;
}
const CARDS: Card[] = [
  { id: 'bell', label: 'Share a Bell pair: H on q1, CNOT q1→q2 (before Bob leaves)', apply: (s) => { s.h(1); s.cx(1, 2); } },
  { id: 'cx01', label: 'Alice: CNOT q0→q1', apply: (s) => { s.cx(0, 1); } },
  { id: 'h0', label: 'Alice: H on q0', apply: (s) => { s.h(0); } },
  { id: 'meas', label: 'Alice: measure q0 → m₀ and q1 → m₁, phone Bob', apply: (s, m, rng) => { m.m0 = s.measure(0, rng); m.m1 = s.measure(1, rng); } },
  { id: 'xif1', label: 'Bob: if m₁ = 1 apply X to q2', apply: (s, m) => { if (m.m1) s.x(2); } },
  { id: 'zif0', label: 'Bob: if m₀ = 1 apply Z to q2', apply: (s, m) => { if (m.m0) s.z(2); } },
  { id: 'xif0', label: 'Bob: if m₀ = 1 apply X to q2', apply: (s, m) => { if (m.m0) s.x(2); } },
  { id: 'zif1', label: 'Bob: if m₁ = 1 apply Z to q2', apply: (s, m) => { if (m.m1) s.z(2); } },
  { id: 'h2', label: 'Bob: H on q2', apply: (s) => { s.h(2); } },
  { id: 'swap', label: 'SWAP q0 ↔ q2', illegal: 'Alice and Bob are in different cities: no quantum gate can act on both of their qubits. Only classical bits travel.' },
  { id: 'copy', label: 'Alice: copy q0 onto a fresh qubit and mail it', illegal: 'No-cloning theorem: an unknown quantum state cannot be copied.' },
];

function TeleportStage({ onDone }: { onDone: (pts: number, errs: number) => void }) {
  const order = useMemo(() => [...CARDS].sort(() => Math.random() - 0.5), []);
  const [prog, setProg] = useState<string[]>([]);
  const [fails, setFails] = useState(0);
  const [report, setReport] = useState<{ ok: boolean; text: string; fids?: number[] } | null>(null);

  const run = () => {
    const cards = prog.map((id) => CARDS.find((c0) => c0.id === id)!);
    const bad = cards.find((c0) => c0.illegal);
    if (bad) {
      setFails((f) => f + 1);
      setReport({ ok: false, text: `⛔ "${bad.label}": ${bad.illegal}` });
      return;
    }
    const rng = mulberry32(Date.now() & 0xffff);
    const fids: number[] = [];
    for (let t = 0; t < 24; t++) {
      const th = Math.acos(1 - 2 * rng()), ph = 2 * Math.PI * rng();
      const s = new StateVector(3);
      s.apply(Ry(th), 0).apply(Rz(ph), 0);
      const m = { m0: 0, m1: 0 };
      for (const cd of cards) cd.apply!(s, m, rng);
      const v = s.bloch(2);
      const target = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
      fids.push((1 + v[0] * target[0] + v[1] * target[1] + v[2] * target[2]) / 2);
    }
    const ok = fids.every((f) => f > 0.999);
    const avg = fids.reduce((a, b) => a + b, 0) / fids.length;
    if (!ok) setFails((f) => f + 1);
    setReport({
      ok,
      fids,
      text: ok
        ? '✓ All 24 random unknown states arrived perfectly at Bob (fidelity 1.000). Alice’s copy was destroyed by her measurement, so no cloning happened.'
        : `✗ Average fidelity of Bob’s qubit with the unknown state: ${avg.toFixed(3)}. Some states arrive damaged. Check the order of Alice’s gates and which measurement result controls which correction.`,
    });
  };

  return (
    <div className="panel" style={{ padding: 14 }}>
      <h3 style={{ marginTop: 0 }}>① Teleport an unknown state</h3>
      <p className="dim" style={{ marginTop: 0 }}>
        q0 holds Alice's unknown state <Tex>{'|\\psi\\rangle'}</Tex>. q1 is Alice's, q2 is Bob's, far away. Click cards to build the protocol in order (click a step in your
        program to remove it). The simulator runs it on 24 random unknown states, measurements and all.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="col" style={{ gap: 6 }}>
          <div className="faint" style={{ fontSize: '0.8rem' }}>Available steps</div>
          {order.map((cd) => (
            <button key={cd.id} className="btn small" style={{ justifyContent: 'flex-start', textAlign: 'left', opacity: prog.includes(cd.id) ? 0.4 : 1 }} disabled={prog.includes(cd.id)} onClick={() => { setProg([...prog, cd.id]); setReport(null); }}>
              {cd.label}
            </button>
          ))}
        </div>
        <div className="col" style={{ gap: 6 }}>
          <div className="faint" style={{ fontSize: '0.8rem' }}>Your protocol</div>
          {prog.length === 0 && <div className="faint">— empty —</div>}
          {prog.map((id, i) => (
            <button key={id} className="btn small active pop" style={{ justifyContent: 'flex-start', textAlign: 'left' }} onClick={() => { setProg(prog.filter((x) => x !== id)); setReport(null); }}>
              {i + 1}. {CARDS.find((c0) => c0.id === id)!.label}
            </button>
          ))}
          <div className="row" style={{ gap: 6, marginTop: 6 }}>
            <button className="btn primary" disabled={!prog.length} onClick={run}>▶ Run on 24 unknown states</button>
            <button className="btn ghost" onClick={() => { setProg([]); setReport(null); }}>clear</button>
          </div>
          {report && (
            <div className="pop" style={{ color: report.ok ? 'var(--green)' : 'var(--red)', fontSize: '0.9rem' }}>
              {report.text}
              {report.fids && (
                <div className="row" style={{ gap: 2, marginTop: 4 }}>
                  {report.fids.map((f, i) => <span key={i} title={f.toFixed(3)} style={{ width: 10, height: 18, borderRadius: 2, background: f > 0.999 ? 'var(--green)' : f > 0.75 ? 'var(--yellow)' : 'var(--red)' }} />)}
                </div>
              )}
            </div>
          )}
          {report?.ok && (
            <button className="btn gold" onClick={() => onDone(Math.max(100, 300 - 50 * fails), fails)}>
              Stage complete (+{Math.max(100, 300 - 50 * fails)}) → next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Stage 2: protect ------------------------------ */

const PSI = { theta: (2 * Math.PI) / 5, phi: Math.PI / 3 };

function ProtectStage({ onDone }: { onDone: (pts: number, errs: number) => void }) {
  const [encoded, setEncoded] = useState(false);
  const [round, setRound] = useState(0);
  const [step, setStep] = useState<'inject' | 'choose' | 'fix' | 'result'>('inject');
  const [errs, setErrs] = useState(0);
  const [pts, setPts] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const rng = useRef(mulberry32(Date.now() & 0xffff));
  const plan = useMemo(() => {
    // three rounds: a random full flip, a small rotation, and a random (possibly no) error
    const q1 = Math.floor(Math.random() * 3), q2 = Math.floor(Math.random() * 3), q3 = Math.floor(Math.random() * 4) - 1;
    return [
      { q: q1, err: GATES.X, name: 'a bit flip' },
      { q: q2, err: Rx(0.9), name: 'a small over-rotation Rx(0.9)' },
      { q: q3, err: GATES.X, name: q3 < 0 ? 'nothing (it was bluffing)' : 'a bit flip' },
    ];
  }, []);
  const [syn, setSyn] = useState<[0 | 1, 0 | 1]>([0, 0]);
  const a = Math.cos(PSI.theta / 2), b = Math.sin(PSI.theta / 2);
  const init: [number, number][] = [[a, 0], [0, 0], [0, 0], [0, 0], [b * Math.cos(PSI.phi), b * Math.sin(PSI.phi)], [0, 0], [0, 0], [0, 0]];
  const goal = [c(a), c(0), c(0), c(0), c(0), c(0), c(0), c(b * Math.cos(PSI.phi), b * Math.sin(PSI.phi))];

  const measureParities = () => {
    const P = plan[round];
    const r = runSyndromeRound({ theta: PSI.theta, phi: PSI.phi, errorQubit: P.q, error: P.err, rng: rng.current });
    setSyn(r.syndrome);
    setStep('fix');
    setMsg(null);
  };
  const measureDirect = () => {
    setErrs((e) => e + 1);
    setMsg({ ok: false, text: '💥 Measuring a data qubit collapses the superposition: α and β are lost! Rewind… measure only parities, via ancillas.' });
  };
  const fix = (q: number) => {
    const P = plan[round];
    // apply the player's correction to the post-syndrome branch and compute fidelity exactly
    const r = runSyndromeRound({ theta: PSI.theta, phi: PSI.phi, errorQubit: P.q, error: P.err, forceSyndrome: syn });
    const right = decodeSyndrome(syn);
    const ok = q === right;
    if (ok) setPts((p) => p + 100);
    else setErrs((e) => e + 1);
    setMsg({
      ok,
      text: ok
        ? `✓ Fidelity restored to ${r.fidelityAfterCorrection.toFixed(4)}. The demon had applied ${P.name}${P.q >= 0 ? ` on q${P.q}` : ''}. ${round === 1 ? `Syndrome measurement digitized the rotation: ${syn.join('') === '00' ? 'this time it collapsed to "no error".' : 'it collapsed to a full flip.'}` : ''}`
        : `✗ Syndrome ${syn.join('')} means ${right < 0 ? 'no error' : `flip q${right}`}. Your choice left the encoded state damaged.`,
    });
    setStep('result');
  };

  if (!encoded)
    return (
      <div className="panel" style={{ padding: 14 }}>
        <h3 style={{ marginTop: 0 }}>② Protect: first, encode</h3>
        <p className="dim" style={{ marginTop: 0 }}>Spread q0's state <Tex>{'\\alpha|0\\rangle + \\beta|1\\rangle'}</Tex> into <Tex>{'\\alpha|000\\rangle + \\beta|111\\rangle'}</Tex>. The demon is warming up…</p>
        <CircuitLab title="Encoder" n={3} gates={['H', 'X', 'Z', 'CNOT']} initialState={init} goal={{ kind: 'state', amps: goal, label: 'encode into α|000⟩ + β|111⟩' }} maxGates={4} showBloch={false} onSolved={() => setTimeout(() => setEncoded(true), 900)} />
      </div>
    );

  return (
    <div className="panel" style={{ padding: 14 }}>
      <h3 style={{ marginTop: 0 }}>② Protect: round {round + 1} of 3</h3>
      {step === 'inject' && (
        <div className="center">
          <div style={{ fontSize: '3rem' }} className="pop">😈</div>
          <p>The Decoherence Demon is about to strike one of your qubits, or maybe not. You won't see what it did.</p>
          <button className="btn danger" onClick={() => setStep('choose')}>Let it strike</button>
        </div>
      )}
      {step === 'choose' && (
        <div>
          <p><b>Something happened.</b> How do you find out what?</p>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" onClick={measureDirect}>Measure q0, q1, q2 directly and take a majority vote</button>
            <button className="btn primary" onClick={measureParities}>Measure parities Z₀Z₁ and Z₁Z₂ with two ancillas</button>
          </div>
        </div>
      )}
      {step === 'fix' && (
        <div>
          <p>
            Ancillas report: Z₀Z₁ → <b className="mono">{syn[0] ? '−1' : '+1'}</b>, Z₁Z₂ → <b className="mono">{syn[1] ? '−1' : '+1'}</b> (syndrome <span className="mono">{syn.join('')}</span>). Which correction?
          </p>
          <div className="row" style={{ gap: 8 }}>
            {[-1, 0, 1, 2].map((q) => (
              <button key={q} className="btn" onClick={() => fix(q)}>{q < 0 ? 'do nothing' : `X on q${q}`}</button>
            ))}
          </div>
        </div>
      )}
      {msg && <div className="pop" style={{ marginTop: 8, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.text}</div>}
      {step === 'result' && (
        <div style={{ marginTop: 10 }}>
          {round < 2 ? (
            <button className="btn primary" onClick={() => { setRound(round + 1); setStep('inject'); setMsg(null); }}>Next round →</button>
          ) : (
            <button className="btn gold" onClick={() => onDone(pts, errs)}>Stage complete (+{pts}) → next</button>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Stage 3: Grover ------------------------------ */

type Block = 'H' | 'O' | 'D';
const BLOCK_LABEL: Record<Block, string> = { H: 'H⊗3', O: 'Oracle', D: 'Diffuser' };

function groverRun(blocks: Block[], marked: number): number[] {
  const s = new StateVector(3);
  for (const bl of blocks) {
    if (bl === 'H') { s.h(0); s.h(1); s.h(2); }
    if (bl === 'O') { s.re[marked] *= -1; s.im[marked] *= -1; }
    if (bl === 'D') {
      s.h(0); s.h(1); s.h(2);
      for (let i = 1; i < 8; i++) { s.re[i] *= -1; s.im[i] *= -1; }
      s.h(0); s.h(1); s.h(2);
    }
  }
  return s.probabilities();
}

function GroverStage({ onDone }: { onDone: (pts: number, errs: number) => void }) {
  const marked = useMemo(() => Math.floor(Math.random() * 8), []);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [hist, setHist] = useState<number[] | null>(null);
  const [errs, setErrs] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [won, setWon] = useState<number | null>(null);
  const probs = groverRun(blocks, marked);
  const oracleCalls = blocks.filter((b) => b === 'O').length;

  const run = () => {
    const rng = mulberry32(Date.now() & 0xffff);
    const counts = new Array(8).fill(0);
    for (let k = 0; k < 200; k++) {
      let r = rng(), i = 0;
      while (i < 7 && r >= probs[i]) { r -= probs[i]; i++; }
      counts[i]++;
    }
    setHist(counts);
    setMsg(null);
  };

  const guess = (i: number) => {
    if (won !== null) return;
    const p = probs[marked];
    if (i !== marked) {
      setErrs((e) => e + 1);
      setMsg({ ok: false, text: `✗ Box ${i.toString(2).padStart(3, '0')} is empty. (Your circuit finds the marked item with probability ${(p * 100).toFixed(0)}%.)` });
      return;
    }
    if (p < 0.9) {
      setErrs((e) => e + 1);
      setMsg({ ok: false, text: `Right box, but your circuit only succeeds ${(p * 100).toFixed(0)}% of the time. The lab demands ≥ 90%. ${oracleCalls > 2 ? 'Too many iterations: the amplitude rotated past the target (overshoot)!' : 'Try another Grover iteration (oracle + diffuser).'}` });
      return;
    }
    const pts = Math.round(300 * p) + (oracleCalls === 2 ? 50 : 0);
    setWon(pts);
    setMsg({ ok: true, text: `✓ Found it: box ${marked.toString(2).padStart(3, '0')} with ${(p * 100).toFixed(1)}% success using ${oracleCalls} oracle calls. A classical search needs about 4.4 on average. For N = 8, ⌊π/4·√8⌋ = 2 iterations is optimal (94.5%).` });
  };

  return (
    <div className="panel" style={{ padding: 14 }}>
      <h3 style={{ marginTop: 0 }}>③ Search: find the marked box among 8</h3>
      <p className="dim" style={{ marginTop: 0 }}>
        Build a Grover circuit from blocks. The <b>Oracle</b> flips the sign of the marked basis state (you don't know which). The <b>Diffuser</b> reflects about the average.
        Run 200 shots, then click the bar you think is marked. You need a circuit that succeeds ≥ 90% of the time.
      </p>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {(['H', 'O', 'D'] as Block[]).map((bl) => (
          <button key={bl} className="btn" disabled={blocks.length >= 9 || won !== null} onClick={() => { setBlocks([...blocks, bl]); setHist(null); }}>
            + {BLOCK_LABEL[bl]}
          </button>
        ))}
        <button className="btn ghost" disabled={won !== null} onClick={() => { setBlocks(blocks.slice(0, -1)); setHist(null); }}>⌫ undo</button>
      </div>
      <div className="row mono" style={{ gap: 4, margin: '10px 0', minHeight: 34, flexWrap: 'wrap' }}>
        <span className="faint">|000⟩ →</span>
        {blocks.map((bl, i) => (
          <span key={i} className="pop" style={{ padding: '4px 10px', borderRadius: 8, border: `2px solid ${bl === 'H' ? '#f4d35e' : bl === 'O' ? '#e07ab6' : '#58c4dd'}`, color: bl === 'H' ? '#f4d35e' : bl === 'O' ? '#e07ab6' : '#58c4dd' }}>
            {BLOCK_LABEL[bl]}
          </span>
        ))}
        <span className="faint">→ measure</span>
      </div>
      <button className="btn primary" disabled={!blocks.length || won !== null} onClick={run}>▶ Run 200 shots</button>
      {hist && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 150, marginTop: 10 }}>
          {hist.map((n, i) => (
            <div key={i} onClick={() => guess(i)} style={{ flex: 1, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center' }} title="click to claim this box">
              <span className="mono faint" style={{ fontSize: '0.7rem' }}>{n}</span>
              <div style={{ width: '70%', height: `${(n / 200) * 120}px`, background: 'linear-gradient(180deg,#e07ab6,#9a72ac)', borderRadius: '4px 4px 0 0', transition: 'height .4s' }} />
              <span className="mono" style={{ fontSize: '0.78rem' }}>{i.toString(2).padStart(3, '0')}</span>
            </div>
          ))}
        </div>
      )}
      {msg && <div className="pop" style={{ marginTop: 8, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.text}</div>}
      {won !== null && <button className="btn gold" style={{ marginTop: 8 }} onClick={() => onDone(won, errs)}>Finish the experiment (+{won}) 🏆</button>}
    </div>
  );
}

/* ------------------------------ Finale ------------------------------ */

function Finale({ total, mistakes, onReplay }: { total: number; mistakes: number; onReplay: () => void }) {
  const parts = useRef<{ x: number; y: number; vx: number; vy: number; c: string; r: number }[]>([]);
  const ref = useAnimCanvas(260, (ctx, w, h, dt) => {
    if (parts.current.length < 160) {
      for (let k = 0; k < 4; k++)
        parts.current.push({ x: w / 2, y: h * 0.85, vx: (Math.random() - 0.5) * 420, vy: -250 - Math.random() * 300, c: `hsl(${Math.random() * 360},85%,62%)`, r: 2 + Math.random() * 3 });
    }
    for (const p of parts.current) {
      p.vy += 300 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    parts.current = parts.current.filter((p) => p.y < h + 10);
    ctx.fillStyle = '#ffd700';
    ctx.font = "700 34px Cambria, Georgia, serif";
    ctx.textAlign = 'center';
    ctx.fillText('|ψ⟩ survived.', w / 2, h / 2 - 10);
    ctx.font = "16px 'Segoe UI', sans-serif";
    ctx.fillStyle = '#e9ecf2';
    ctx.fillText(`Final score ${total} · ${mistakes === 0 ? 'flawless!' : `${mistakes} mistake${mistakes === 1 ? '' : 's'}`}`, w / 2, h / 2 + 22);
  });
  return (
    <div className="panel" style={{ padding: 14, borderColor: '#ffd700' }}>
      <div style={{ width: '100%' }}>
        <canvas ref={ref} style={{ display: 'block' }} />
      </div>
      <p>
        You teleported a state you never knew, protected another from a demon you never saw, and found a needle in a haystack with fewer looks than any classical searcher. Those three
        ideas, entanglement as a resource, error correction by measuring the right questions, and interference that amplifies the right answer, are the foundations of quantum computing.
      </p>
      <p className="dim">Now go and run something on real hardware. The lesson "Where to go next" has the links.</p>
      <button className="btn" onClick={onReplay}>↻ Play again</button>
    </div>
  );
}
