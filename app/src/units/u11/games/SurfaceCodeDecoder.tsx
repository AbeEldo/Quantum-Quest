import React, { useMemo, useRef, useState } from 'react';
import { useGame, GameOverlay, HowToPlay } from '../../../components/game';
import { Stat, Segmented } from '../../../components/ui';
import { mulberry32 } from '../../../engine/qsim';
import { makeSurfaceCode, defects, decodeMWPM, isLogicalFlip, xorArr, weightOf, type Pauli1 } from '../engine/surface';
import { SurfaceLattice, XCOL, ZCOL } from '../widgets/SurfaceLattice';

interface Level {
  name: string;
  d: number;
  p: number;
  both: boolean;
  rounds: number;
}
const LEVELS: Level[] = [
  { name: '1 · Small patch', d: 3, p: 0.07, both: false, rounds: 5 },
  { name: '2 · Stormy patch', d: 3, p: 0.13, both: false, rounds: 5 },
  { name: '3 · Distance five', d: 5, p: 0.06, both: false, rounds: 5 },
  { name: '4 · Near the edge', d: 5, p: 0.1, both: false, rounds: 5 },
  { name: '5 · Both kinds of error', d: 5, p: 0.06, both: true, rounds: 5 },
];
const GAME_ID = 'surface-code-decoder';

export default function SurfaceCodeDecoder() {
  const g = useGame(GAME_ID);
  const [lvl, setLvl] = useState(0);
  const L = LEVELS[lvl];
  const code = useMemo(() => makeSurfaceCode(L.d), [L.d]);
  const rng = useRef(mulberry32((Date.now() & 0xffff) + 7));
  const [xe, setXe] = useState<Uint8Array>(new Uint8Array(9));
  const [ze, setZe] = useState<Uint8Array>(new Uint8Array(9));
  const [xc, setXc] = useState<Uint8Array>(new Uint8Array(9));
  const [zc, setZc] = useState<Uint8Array>(new Uint8Array(9));
  const [mode, setMode] = useState<Pauli1>('X');
  const [phase, setPhase] = useState<'intro' | 'play' | 'reveal' | 'levelEnd' | 'over'>('intro');
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [failsThisLevel, setFails] = useState(0);
  const [verdict, setVerdict] = useState<{ kind: 'ok' | 'fail' | 'unlucky'; text: string } | null>(null);

  const newRound = (cd = code, lv = L) => {
    let nx: Uint8Array, nz: Uint8Array;
    do {
      nx = new Uint8Array(cd.n);
      nz = new Uint8Array(cd.n);
      for (let q = 0; q < cd.n; q++) {
        if (rng.current() < lv.p) nx[q] = 1;
        if (lv.both && rng.current() < lv.p) nz[q] = 1;
      }
    } while (defects(cd, 'X', nx).length + defects(cd, 'Z', nz).length === 0);
    setXe(nx);
    setZe(nz);
    setXc(new Uint8Array(cd.n));
    setZc(new Uint8Array(cd.n));
    setMode('X');
    setVerdict(null);
    setPhase('play');
  };

  const rx = xorArr(xe, xc), rz = xorArr(ze, zc);
  const defX = defects(code, 'X', rx), defZ = defects(code, 'Z', rz);
  const lit = new Set([...defX, ...defZ]);
  const mw = useMemo(() => ({ x: decodeMWPM(code, 'X', defects(code, 'X', xe)), z: decodeMWPM(code, 'Z', defects(code, 'Z', ze)) }), [xe, ze, code]);

  const click = (q: number) => {
    if (phase !== 'play') return;
    if (mode === 'X') setXc((a) => { const b = a.slice(); b[q] ^= 1; return b; });
    else setZc((a) => { const b = a.slice(); b[q] ^= 1; return b; });
  };

  const submit = () => {
    const fail = isLogicalFlip(code, 'X', rx) || isLogicalFlip(code, 'Z', rz);
    const mwFail = isLogicalFlip(code, 'X', xorArr(xe, mw.x.correction)) || isLogicalFlip(code, 'Z', xorArr(ze, mw.z.correction));
    const myW = weightOf(xc) + weightOf(zc);
    const mwW = mw.x.weight + mw.z.weight;
    if (!fail) {
      const bonus = myW <= mwW ? 50 : 0;
      setScore((s) => s + 100 + bonus + L.d * 10);
      setVerdict({ kind: 'ok', text: `✓ Logical qubit safe! You used ${myW} flip${myW === 1 ? '' : 's'}; the matching decoder used ${mwW}.${bonus ? ' +50 efficiency bonus.' : ''}` });
    } else if (mwFail) {
      setVerdict({ kind: 'unlucky', text: '✗ Logical error, but the minimum-weight decoder would have failed too: the true error chain was longer than the shortest explanation. That is how codes fail below threshold, rarely and unavoidably. No life lost.' });
    } else {
      setLives((l) => l - 1);
      setFails((f) => f + 1);
      setVerdict({ kind: 'fail', text: '✗ Logical error! Your correction plus the real error forms a chain across the lattice (glowing). The decoder\'s pairing (dashed lines) would have closed it into harmless loops instead.' });
    }
    setPhase('reveal');
  };

  const next = () => {
    if (lives <= 0) {
      setPhase('over');
      g.finish(score, false, { level: lvl });
      return;
    }
    if (round + 1 >= L.rounds) {
      if (lvl === 3 && failsThisLevel === 0) g.unlock('below-threshold');
      g.finish(score, lvl === LEVELS.length - 1, { level: lvl + 1 });
      setPhase('levelEnd');
      return;
    }
    setRound((r) => r + 1);
    newRound();
  };

  const goLevel = (k: number) => {
    setLvl(k);
    setRound(0);
    setFails(0);
    const cd = makeSurfaceCode(LEVELS[k].d);
    setXe(new Uint8Array(cd.n));
    setZe(new Uint8Array(cd.n));
    setXc(new Uint8Array(cd.n));
    setZc(new Uint8Array(cd.n));
    setPhase('intro');
  };

  const reveal = phase === 'reveal';
  const glow = reveal && verdict?.kind !== 'ok' ? Array.from({ length: code.n }, (_, q) => q).filter((q) => (isLogicalFlip(code, 'X', rx) && rx[q]) || (isLogicalFlip(code, 'Z', rz) && rz[q])) : undefined;
  const pairs = reveal ? [...mw.x.pairs.map(([a, b]) => ({ a, b, color: ZCOL })), ...mw.z.pairs.map(([a, b]) => ({ a, b, color: XCOL }))] : undefined;

  return (
    <div>
      <HowToPlay defaultOpen={g.plays === 0}>
        Random errors have hit a surface-code patch. You can't see them, only the glowing <b>defects</b>: checks whose parity flipped. Errors form chains, and defects sit at
        their <b>ends</b> (or where a chain meets the boundary). Click data qubits to apply corrections. Your flips change the defects live. When every defect is gone, press{' '}
        <b>Submit</b>. If your correction plus the hidden error closes into loops, the logical qubit survives. If together they stretch across the patch, it's a{' '}
        <b>logical error</b>. Hint: pair nearby defects with the shortest paths, like a matching decoder. Orange checks catch X errors (they end on the top/bottom edges);
        blue checks catch Z errors (left/right edges).
      </HowToPlay>
      <div className="row" style={{ gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
        <Stat label="level" value={`${lvl + 1}/5`} />
        <Stat label="round" value={`${Math.min(round + 1, L.rounds)}/${L.rounds}`} />
        <Stat label="score" value={score} color="var(--yellow)" />
        <Stat label="lives" value={'♥'.repeat(Math.max(0, lives)) || '—'} color="var(--red)" />
        <Stat label="defects" value={phase === 'play' ? lit.size : '—'} color="var(--gold)" />
      </div>
      <div className="panel" style={{ position: 'relative', padding: 12 }}>
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <b>{L.name} — d = {L.d}, p = {(L.p * 100).toFixed(0)}%{L.both ? ' (X and Z errors)' : ' (X errors)'}</b>
          {L.both && phase === 'play' && (
            <Segmented value={mode} onChange={setMode} options={[{ value: 'X', label: 'place X fix' }, { value: 'Z', label: 'place Z fix' }]} />
          )}
        </div>
        <div style={{ maxWidth: 420, margin: '6px auto' }}>
          <SurfaceLattice code={code} xErr={xe} zErr={ze} hideErrors={!reveal} lit={phase === 'intro' ? new Set() : lit} xCorr={xc} zCorr={zc} pairs={pairs} onQubit={click} size={400} glow={glow} />
        </div>
        <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
          {phase === 'intro' && <button className="btn primary" onClick={() => newRound()}>▶ Start level {lvl + 1}</button>}
          {phase === 'play' && (
            <>
              <button className="btn ghost" onClick={() => { setXc(new Uint8Array(code.n)); setZc(new Uint8Array(code.n)); }}>clear fixes</button>
              <button className="btn primary" disabled={lit.size > 0} onClick={submit}>{lit.size > 0 ? `${lit.size} defect${lit.size === 1 ? '' : 's'} left` : '✔ Submit'}</button>
            </>
          )}
          {phase === 'reveal' && <button className="btn primary" onClick={next}>{lives <= 0 ? 'Game over…' : 'Next →'}</button>}
        </div>
        {verdict && (
          <div className="pop" style={{ marginTop: 8, textAlign: 'center', color: verdict.kind === 'ok' ? 'var(--green)' : verdict.kind === 'fail' ? 'var(--red)' : 'var(--gold)' }}>
            {verdict.text}
            <div className="faint" style={{ fontSize: '0.8rem' }}>Revealed: actual errors (letters), the decoder's matching (dashed), your fixes (green rings).</div>
          </div>
        )}
        {phase === 'levelEnd' && (
          <GameOverlay title={lvl === LEVELS.length - 1 ? '🛡 Fault-tolerant!' : `Level ${lvl + 1} cleared`} tone="win">
            <p>Score {score}.</p>
            <p style={{ textAlign: 'left' }}>
              {lvl === 1 && 'At 13% the d = 3 patch fails often, even with perfect decoding. You are above this code\'s practical comfort zone. Bigger codes only help below threshold.'}
              {lvl === 3 && 'At 10% you are close to the code-capacity threshold (~10%): extra distance barely helps there. Real hardware must sit well below the ~1% circuit-level threshold.'}
              {lvl === 4 && 'X and Z errors are decoded independently on two separate matching graphs. A Y error lights both. Real decoders also match through time, because the checks themselves are noisy.'}
              {(lvl === 0 || lvl === 2) && 'Short pairings won: the most likely error is the one with the fewest flips. That is exactly what minimum-weight perfect matching computes.'}
            </p>
            {lvl < LEVELS.length - 1 ? (
              <button className="btn primary" onClick={() => goLevel(lvl + 1)}>Next level →</button>
            ) : (
              <button className="btn primary" onClick={() => { setScore(0); setLives(3); goLevel(0); }}>Play again</button>
            )}
          </GameOverlay>
        )}
        {phase === 'over' && (
          <GameOverlay title="Logical failure" tone="lose">
            <p>Out of lives at level {lvl + 1}. Score {score}.</p>
            <button className="btn primary" onClick={() => { setScore(0); setLives(3); goLevel(0); }}>Try again</button>
          </GameOverlay>
        )}
      </div>
    </div>
  );
}
