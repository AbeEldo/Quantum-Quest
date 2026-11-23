import React, { useMemo, useState } from 'react';
import { useGame, GameOverlay, HowToPlay } from '../../../components/game';
import { Slider, Stat, ProgressBar, shuffle } from '../../../components/ui';
import { sfx } from '../../../state/sfx';
import { PhotonEvent, sendPhoton, expectedQber } from '../lib/bb84';
import { PhotonLine } from '../widgets/PhotonLine';

const NOISE = 0.02;

/* ------------------------------ Defender mode ------------------------------ */

const D_ROUNDS = 6;
const D_BUDGET = 128;

function DefenderMode({ onDone }: { onDone: (correct: number) => void }) {
  const scenario = useMemo(() => shuffle([0, 0, 0.3, 0.5, 1, 0]), []);
  const [round, setRound] = useState(0);
  const [events, setEvents] = useState<PhotonEvent[]>([]);
  const [k, setK] = useState(20);
  const [sample, setSample] = useState<{ k: number; errors: number } | null>(null);
  const [verdict, setVerdict] = useState<null | { said: boolean; right: boolean }>(null);
  const [correct, setCorrect] = useState(0);
  const [score, setScore] = useState(0);
  const f = scenario[round];
  const sifted = events.filter((e) => e.sifted);

  const send = (n: number) => {
    const left = D_BUDGET - events.length;
    const m = Math.min(n, left);
    if (m <= 0) return;
    setEvents((ev) => [...ev, ...Array.from({ length: m }, () => sendPhoton(Math.random, { eveFraction: f, noise: NOISE }))]);
  };
  const check = () => {
    const kk = Math.min(k, sifted.length);
    const pick = shuffle(sifted).slice(0, kk);
    setSample({ k: kk, errors: pick.filter((e) => e.error).length });
  };
  const decide = (saysEve: boolean) => {
    const eve = f > 0;
    const right = saysEve === eve;
    setVerdict({ said: saysEve, right });
    if (right) {
      sfx.correct();
      setCorrect((c) => c + 1);
      const keyLeft = sifted.length - (sample?.k ?? 0);
      setScore((s) => s + 10 + (!eve ? Math.round(keyLeft / 2) : 0));
    } else sfx.wrong();
  };
  const next = () => {
    if (round + 1 >= D_ROUNDS) {
      onDone(correct);
      return;
    }
    setRound((r) => r + 1);
    setEvents([]);
    setSample(null);
    setVerdict(null);
  };

  return (
    <div className="panel" style={{ padding: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <b>🛡 Round {round + 1} / {D_ROUNDS}</b>
        <span className="mono faint">correct verdicts {correct} · score {score}</span>
      </div>
      <PhotonLine queue={events.slice(-16)} eveOn={false} height={110} speed={1.4} />
      <div className="faint" style={{ fontSize: '0.8rem' }}>Eve may or may not be on the fibre. You can’t see her, only her effect on your errors. The channel has about {NOISE * 100}% natural noise.</div>
      <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <button className="btn primary small" onClick={() => send(16)} disabled={!!sample || events.length >= D_BUDGET}>send 16 photons</button>
        <button className="btn small" onClick={() => send(D_BUDGET)} disabled={!!sample || events.length >= D_BUDGET}>send all</button>
        <div style={{ flex: 1, minWidth: 200 }}>
          <ProgressBar value={events.length / D_BUDGET} color="var(--blue)" />
          <span className="faint" style={{ fontSize: '0.75rem' }}>photon budget {events.length}/{D_BUDGET}</span>
        </div>
        <Stat label="sifted key" value={sifted.length} />
      </div>
      {sifted.length > 0 && !sample && (
        <div className="row" style={{ gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 260, flex: 1 }}>
            <Slider label="bits to sacrifice for checking" value={Math.min(k, sifted.length)} min={1} max={sifted.length} step={1} onChange={setK} format={(v) => `${v}`} />
          </div>
          <button className="btn gold small" onClick={check}>🔍 compare publicly</button>
        </div>
      )}
      {sample && (
        <div className="panel pop" style={{ marginTop: 8, padding: 10 }}>
          Checked <b>{sample.k}</b> bits: <b style={{ color: sample.errors ? 'var(--red)' : 'var(--green)' }}>{sample.errors} errors</b> (estimated QBER{' '}
          {((sample.errors / Math.max(1, sample.k)) * 100).toFixed(1)}%). {sifted.length - sample.k} key bits left.
          {!verdict && (
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <button className="btn danger" onClick={() => decide(true)}>🚨 Eve is listening: abort</button>
              <button className="btn primary" onClick={() => decide(false)}>✅ Channel clean: keep the key</button>
            </div>
          )}
          {verdict && (
            <div style={{ marginTop: 8 }}>
              <b style={{ color: verdict.right ? 'var(--green)' : 'var(--red)' }}>{verdict.right ? 'Correct!' : 'Wrong!'}</b>{' '}
              {f > 0
                ? `Eve was intercepting ${Math.round(f * 100)}% of photons, so the expected QBER was ${(expectedQber(f, NOISE) * 100).toFixed(1)}%.`
                : `No Eve this round: the expected QBER was just the ${NOISE * 100}% background.`}{' '}
              {!verdict.right && !verdict.said && 'You kept a key Eve partly knows.'}
              {!verdict.right && verdict.said && 'You threw away a good key. Safe, but costly.'}
              <div style={{ marginTop: 6 }}>
                <button className="btn small primary" onClick={next}>{round + 1 >= D_ROUNDS ? 'finish' : 'next round ▶'}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------------- Spy mode -------------------------------- */

const BLOCKS = 5;
const BLOCK_PHOTONS = 256;
const SAMPLE = 32;
const ABORT_AT = 5; // abort if ≥ 5 errors in the 32-bit sample (≈ 15%)
const STEAL_GOAL = 40;

interface BlockResult {
  f: number;
  sifted: number;
  errors: number;
  aborted: boolean;
  stolen: number;
  keyLeft: number;
}

function SpyMode({ onDone, onAchieve }: { onDone: (stolen: number, caught: boolean) => void; onAchieve: () => void }) {
  const [f, setF] = useState(0.3);
  const [blocks, setBlocks] = useState<BlockResult[]>([]);
  const [anim, setAnim] = useState<PhotonEvent[]>([]);
  const caught = blocks.some((b) => b.aborted);
  const stolen = blocks.filter((b) => !b.aborted).reduce((a, b) => a + b.stolen, 0);
  const over = caught || blocks.length >= BLOCKS;

  const runBlock = () => {
    const evs = Array.from({ length: BLOCK_PHOTONS }, () => sendPhoton(Math.random, { eveFraction: f, noise: NOISE }));
    setAnim(evs.slice(0, 14));
    const sifted = shuffle(evs.filter((e) => e.sifted));
    const sample = sifted.slice(0, SAMPLE);
    const rest = sifted.slice(SAMPLE);
    const errors = sample.filter((e) => e.error).length;
    const aborted = errors >= ABORT_AT;
    const res: BlockResult = { f, sifted: sifted.length, errors, aborted, stolen: rest.filter((e) => e.eveKnows).length, keyLeft: rest.length };
    const nb = [...blocks, res];
    setBlocks(nb);
    const tot = nb.filter((b) => !b.aborted).reduce((a, b) => a + b.stolen, 0);
    if (aborted) sfx.wrong();
    else sfx.correct();
    if (!aborted && tot >= 16) onAchieve();
    if (aborted || nb.length >= BLOCKS) onDone(aborted ? 0 : tot, aborted);
  };

  const q = expectedQber(f, NOISE);
  return (
    <div className="panel" style={{ padding: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <b>🕵️ Block {Math.min(blocks.length + 1, BLOCKS)} / {BLOCKS}</b>
        <span className="mono">
          bits stolen (undetected): <b style={{ color: stolen >= STEAL_GOAL ? 'var(--green)' : 'var(--yellow)' }}>{stolen}</b> / {STEAL_GOAL}
        </span>
      </div>
      <PhotonLine queue={anim} eveOn height={120} speed={1.2} />
      <div className="dim" style={{ fontSize: '0.88rem' }}>
        Each block: {BLOCK_PHOTONS} photons. Alice &amp; Bob sift (~{BLOCK_PHOTONS / 2} bits), publicly check {SAMPLE} of them, and <b>abort if they see {ABORT_AT} or more errors</b>. The fibre adds {NOISE * 100}%
        noise on its own. You learn a key bit for certain whenever you guessed Alice’s basis.
      </div>
      {!over && (
        <div className="row" style={{ gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 280, flex: 1 }}>
            <Slider label="fraction of photons you intercept" value={f} min={0} max={1} step={0.05} onChange={setF} format={(v) => `${Math.round(v * 100)}%`} />
          </div>
          <span className="faint mono" style={{ fontSize: '0.8rem' }}>
            expected QBER {(q * 100).toFixed(1)}% · expected haul ≈ {Math.round(((BLOCK_PHOTONS / 2 - SAMPLE) * f) / 2)} bits
          </span>
          <button className="btn danger" onClick={runBlock}>🎯 run block</button>
        </div>
      )}
      {blocks.length > 0 && (
        <table className="mono" style={{ marginTop: 10, fontSize: '0.82rem', borderCollapse: 'separate', borderSpacing: '8px 2px' }}>
          <thead className="faint">
            <tr><td>block</td><td>intercept</td><td>sample errors</td><td>outcome</td><td>bits you know</td></tr>
          </thead>
          <tbody>
            {blocks.map((b, i) => (
              <tr key={i} className={i === blocks.length - 1 ? 'pop' : ''}>
                <td>{i + 1}</td>
                <td>{Math.round(b.f * 100)}%</td>
                <td style={{ color: b.errors >= ABORT_AT ? 'var(--red)' : 'var(--text)' }}>{b.errors}/{SAMPLE}</td>
                <td style={{ color: b.aborted ? 'var(--red)' : 'var(--green)' }}>{b.aborted ? '🚨 ABORTED, caught!' : 'key accepted'}</td>
                <td>{b.aborted ? '—' : `${b.stolen} of ${b.keyLeft}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ---------------------------------- Game ---------------------------------- */

export default function Bb84SpyVsSpy() {
  const g = useGame('bb84-spy-vs-spy');
  const [mode, setMode] = useState<'menu' | 'defend' | 'spy'>('menu');
  const [key, setKey] = useState(0);
  const [result, setResult] = useState<null | { title: string; body: string; win: boolean }>(null);
  const best = g.data as { defend?: number; spy?: number };

  const finishDefend = (correct: number) => {
    const win = correct >= 5;
    g.finish(correct, win || !!best.spy, { ...g.data, defend: Math.max(correct, best.defend ?? 0) });
    setResult({
      title: win ? '🛡 Channel secured!' : 'Eve slipped through',
      body: `${correct}/${D_ROUNDS} correct verdicts. ${
        win ? 'You read the error statistics like a pro.' : 'Tip: a small check sample can hide a modest eavesdropper; bigger samples cost key but catch more.'
      } Real systems check thousands of bits and use the measured QBER to decide how much privacy amplification to apply.`,
      win,
    });
  };
  const finishSpy = (stolen: number, caught: boolean) => {
    const win = !caught && stolen >= STEAL_GOAL;
    g.finish(stolen, win || (best.defend ?? 0) >= 5, { ...g.data, spy: Math.max(stolen, best.spy ?? 0) });
    setResult({
      title: caught ? '🚨 Caught!' : win ? '🕵️ Mission accomplished… sort of' : 'Too timid',
      body: caught
        ? 'Your interceptions pushed the sample error rate over the alarm. Alice and Bob threw the key away, and everything you learned is worthless.'
        : `You learned ${stolen} key bits without triggering the alarm. But Alice and Bob saw a slightly raised QBER, and privacy amplification hashes the key down until your knowledge is essentially zero. In real QKD, an undetected Eve still ends up with (almost) nothing. That's the point of the security proofs.`,
      win,
    });
  };

  return (
    <div>
      <HowToPlay defaultOpen={g.plays === 0}>
        <p>
          BB84 sends random bits in random polarisation bases (<b>+</b>: 0°/90°, <b>×</b>: 45°/135°). Eve can intercept photons, but she must guess a basis, and a wrong guess makes errors
          in Alice and Bob’s sifted key 50% of the time. Intercepting a fraction <b>f</b> of the photons raises the error rate by about <b>f/4</b>.
        </p>
        <p>
          <b>🛡 Defend:</b> in each of {D_ROUNDS} rounds, spend your photon budget, choose how many key bits to sacrifice for checking, then decide whether Eve is there. Get 5 right to win.
          <br />
          <b>🕵️ Spy:</b> pick how aggressively to intercept, block by block. Steal {STEAL_GOAL} key bits without ever tripping the alarm. (Steal 16 undetected for the <i>Eve Was Here</i> badge.)
        </p>
      </HowToPlay>
      {mode === 'menu' && (
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <button className="btn primary" style={{ padding: '18px 26px', fontSize: '1.05rem' }} onClick={() => { setMode('defend'); setKey((k) => k + 1); }}>
            🛡 Play as Alice &amp; Bob {best.defend !== undefined && <span className="faint"> (best {best.defend}/{D_ROUNDS})</span>}
          </button>
          <button className="btn danger" style={{ padding: '18px 26px', fontSize: '1.05rem' }} onClick={() => { setMode('spy'); setKey((k) => k + 1); }}>
            🕵️ Play as Eve {best.spy !== undefined && <span className="faint"> (best {best.spy} bits)</span>}
          </button>
        </div>
      )}
      {mode !== 'menu' && (
        <div>
          <button className="btn small ghost" style={{ marginBottom: 8 }} onClick={() => setMode('menu')}>← modes</button>
          {mode === 'defend' ? (
            <DefenderMode key={key} onDone={finishDefend} />
          ) : (
            <SpyMode key={key} onDone={finishSpy} onAchieve={() => g.unlock('eve-was-here')} />
          )}
        </div>
      )}
      {result && (
        <GameOverlay title={result.title} tone={result.win ? 'win' : 'lose'} onClose={() => { setResult(null); setMode('menu'); }}>
          {result.body}
        </GameOverlay>
      )}
    </div>
  );
}
