import React, { useState } from 'react';
import { useGame, GameOverlay, HowToPlay } from '../../../components/game';
import { Stat, shuffle } from '../../../components/ui';
import { SpectrumStrip } from '../widgets/HydrogenAtom';
import { hydrogenLambda, hydrogenE, SERIES, wavelengthCSS } from '../physics';

/** Strong visible lines (air wavelengths, nm). */
const ELEMENTS: Record<string, { name: string; lines: number[]; color: string }> = {
  H: { name: 'Hydrogen', lines: [656.3, 486.1, 434.0, 410.2], color: '#e07ab6' },
  He: { name: 'Helium', lines: [447.1, 471.3, 492.2, 501.6, 587.6, 667.8, 706.5], color: '#fcd34d' },
  Na: { name: 'Sodium', lines: [589.0, 589.6, 568.8, 498.3], color: '#f0ac5f' },
  Hg: { name: 'Mercury', lines: [404.7, 435.8, 546.1, 577.0, 579.1], color: '#83c167' },
  Ne: { name: 'Neon', lines: [585.2, 588.2, 594.5, 614.3, 616.4, 621.7, 626.6, 633.4, 638.3, 640.2, 650.7, 659.9, 692.9, 703.2], color: '#fc6255' },
};
const KEYS = Object.keys(ELEMENTS);

type Round =
  | { kind: 'jump'; up: number; lo: number }
  | { kind: 'id'; set: string[]; absorb: boolean; source: string };

function makeRounds(): Round[] {
  const jumps: Round[] = shuffle([
    { kind: 'jump', up: 3, lo: 2 },
    { kind: 'jump', up: 5, lo: 2 },
    { kind: 'jump', up: 2, lo: 1 },
    { kind: 'jump', up: 4, lo: 3 },
    { kind: 'jump', up: 6, lo: 2 },
    { kind: 'jump', up: 3, lo: 1 },
  ] as Round[]).slice(0, 4);
  const ids: Round[] = shuffle([
    { kind: 'id', set: ['Na'], absorb: false, source: 'An old orange street lamp' },
    { kind: 'id', set: ['Hg'], absorb: false, source: 'A fluorescent-tube lamp (before the phosphor)' },
    { kind: 'id', set: ['Ne'], absorb: false, source: 'A red “open” sign' },
    { kind: 'id', set: ['H', 'He'], absorb: true, source: 'The atmosphere of a hot star (dark absorption lines)' },
    { kind: 'id', set: ['H', 'Hg'], absorb: false, source: 'A discharge tube contaminated with mercury' },
    { kind: 'id', set: ['He'], absorb: false, source: 'A glowing gas from a solar-eclipse observation, 1868' },
    { kind: 'id', set: ['Na', 'Ne'], absorb: false, source: 'A mystery lab lamp' },
  ] as Round[]).slice(0, 5);
  // interleave
  const out: Round[] = [];
  for (let i = 0; i < 9; i++) {
    const r = i % 2 === 0 ? ids.shift() : jumps.shift();
    if (r) out.push(r);
    else {
      const rest = ids.shift() ?? jumps.shift();
      if (rest) out.push(rest);
    }
  }
  return out;
}

export default function SpectrumSleuth() {
  const g = useGame('spectrum-sleuth');
  const [rounds, setRounds] = useState<Round[]>(() => makeRounds());
  const [ri, setRi] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [hearts, setHearts] = useState(3);
  const [up, setUp] = useState<number | null>(null);
  const [lo, setLo] = useState<number | null>(null);
  const [pick, setPick] = useState<string[]>([]);
  const [refs, setRefs] = useState<string[]>([]);
  const [verdict, setVerdict] = useState<{ ok: boolean; text: string } | null>(null);
  const [over, setOver] = useState(false);
  const [foundHe, setFoundHe] = useState(false);
  const R = rounds[ri];

  const check = () => {
    let ok = false,
      text = '';
    if (R.kind === 'jump') {
      ok = up === R.up && lo === R.lo;
      const lam = hydrogenLambda(R.up, R.lo);
      text = `It was ${R.up} → ${R.lo} (${SERIES[R.lo]} series): ΔE = ${(hydrogenE(R.up) - hydrogenE(R.lo)).toFixed(2)} eV, λ = 1240/ΔE ≈ ${lam.toFixed(1)} nm.`;
    } else {
      const a = [...pick].sort().join(','),
        b = [...R.set].sort().join(',');
      ok = a === b;
      text = `The spectrum contained: ${R.set.map((k) => ELEMENTS[k].name).join(' + ')}.` + (R.absorb ? ' Absorption lines sit at exactly the wavelengths the same atoms would emit.' : '');
      if (ok && R.set.includes('He') && !foundHe) {
        setFoundHe(true);
        g.unlock('helium-hunter');
      }
    }
    const gain = ok ? 100 + 20 * streak : 0;
    setScore((s) => s + gain);
    setStreak((s) => (ok ? s + 1 : 0));
    if (!ok) setHearts((h) => h - 1);
    setVerdict({ ok, text: (ok ? `✓ +${gain}. ` : '✗ ') + text });
  };

  const next = () => {
    const last = ri + 1 >= rounds.length || hearts <= 0;
    if (last) {
      const beaten = hearts > 0 && score >= 600;
      g.finish(score, beaten, { score });
      setOver(true);
      return;
    }
    setRi(ri + 1);
    setUp(null);
    setLo(null);
    setPick([]);
    setRefs([]);
    setVerdict(null);
  };

  const restart = () => {
    setRounds(makeRounds());
    setRi(0);
    setScore(0);
    setStreak(0);
    setHearts(3);
    setUp(null);
    setLo(null);
    setPick([]);
    setRefs([]);
    setVerdict(null);
    setOver(false);
  };

  const shown = R.kind === 'jump' ? [{ nm: hydrogenLambda(R.up, R.lo) }] : R.set.flatMap((k) => ELEMENTS[k].lines.map((nm) => ({ nm, strength: R.absorb ? 0.9 : 1 })));
  const jumpLam = R.kind === 'jump' ? hydrogenLambda(R.up, R.lo) : 0;
  const jumpRange: [number, number] = R.kind === 'jump' ? (jumpLam < 380 ? [80, 400] : jumpLam > 750 ? [700, 2000] : [380, 750]) : [380, 750];

  return (
    <div style={{ position: 'relative' }}>
      <HowToPlay defaultOpen={ri === 0}>
        Two kinds of case. <b>Hydrogen jumps:</b> a single hydrogen line is shown with its wavelength; pick the upper and lower levels of the jump that made it (use <i>E<sub>n</sub> = −13.6 eV/n²</i> and <i>λ = 1240 nm·eV / ΔE</i>). <b>Identify the source:</b> compare the spectrum with reference barcodes and select every element present.
        Correct answers score 100 plus a streak bonus; each mistake costs a heart. Score 600 with a heart left to win.
      </HowToPlay>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <b style={{ fontSize: '1.1rem' }}>
          Case {ri + 1}/{rounds.length}: {R.kind === 'jump' ? 'Which hydrogen jump?' : 'Identify the source'}
        </b>
        <div className="row" style={{ gap: 8 }}>
          <Stat label="hearts" value={'♥'.repeat(Math.max(0, hearts)) || '—'} color="#fc6255" />
          <Stat label="streak" value={streak} color="#58c4dd" />
          <Stat label="score" value={score} color="#fcd34d" />
        </div>
      </div>

      {R.kind === 'jump' ? (
        <div className="panel" style={{ padding: 14 }}>
          <div className="dim" style={{ marginBottom: 6 }}>
            A hydrogen lamp emits a line at <b style={{ color: wavelengthCSS(Math.max(380, Math.min(750, jumpLam))) }}>{jumpLam.toFixed(1)} nm</b>
            {jumpLam < 380 ? ' (ultraviolet)' : jumpLam > 750 ? ' (infrared)' : ''}. Photon energy = {(1239.84 / jumpLam).toFixed(2)} eV.
          </div>
          <SpectrumStrip lines={shown.map((l) => ({ ...l, color: jumpLam < 380 ? '#aa78ff' : jumpLam > 750 ? '#c0503c' : undefined }))} range={jumpRange} />
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8, marginTop: 12, alignItems: 'center' }}>
            <span className="faint">upper level</span>
            <div className="row" style={{ gap: 4 }}>
              {[2, 3, 4, 5, 6, 7].map((k) => (
                <button key={k} className={`btn small ${up === k ? 'active' : ''}`} disabled={!!verdict} onClick={() => setUp(k)}>
                  n = {k} ({hydrogenE(k).toFixed(2)} eV)
                </button>
              ))}
            </div>
            <span className="faint">lower level</span>
            <div className="row" style={{ gap: 4 }}>
              {[1, 2, 3, 4].map((k) => (
                <button key={k} className={`btn small ${lo === k ? 'active' : ''}`} disabled={!!verdict} onClick={() => setLo(k)}>
                  n = {k} ({hydrogenE(k).toFixed(2)} eV)
                </button>
              ))}
            </div>
          </div>
          {up !== null && lo !== null && up > lo && !verdict && (
            <div className="faint mono" style={{ fontSize: '0.82rem', marginTop: 6 }}>
              your guess: ΔE = {(hydrogenE(up) - hydrogenE(lo)).toFixed(2)} eV
            </div>
          )}
        </div>
      ) : (
        <div className="panel" style={{ padding: 14 }}>
          <div className="dim" style={{ marginBottom: 6 }}>
            Source: <b>{R.source}</b>
          </div>
          <SpectrumStrip lines={shown} dark={R.absorb} />
          <div className="faint" style={{ fontSize: '0.8rem', margin: '10px 0 4px' }}>
            Reference barcodes (click to overlay), then select the elements present:
          </div>
          {KEYS.map((k) => (
            <div key={k} style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 8, alignItems: 'center', marginBottom: 4 }}>
              <div className="row" style={{ gap: 4 }}>
                <button className={`btn small ${pick.includes(k) ? 'active' : ''}`} disabled={!!verdict} onClick={() => setPick((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]))}>
                  {pick.includes(k) ? '✓ ' : ''}
                  {ELEMENTS[k].name}
                </button>
              </div>
              <div onClick={() => setRefs((r) => (r.includes(k) ? r.filter((x) => x !== k) : [...r, k]))} style={{ cursor: 'pointer', opacity: refs.includes(k) ? 1 : 0.75 }}>
                <SpectrumStrip lines={ELEMENTS[k].lines.map((nm) => ({ nm }))} height={22} showScale={false} />
              </div>
            </div>
          ))}
          {refs.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div className="faint" style={{ fontSize: '0.78rem' }}>Overlay: mystery spectrum (top) vs selected references (bottom)</div>
              <SpectrumStrip lines={shown} dark={R.absorb} height={30} showScale={false} />
              <SpectrumStrip lines={refs.flatMap((k) => ELEMENTS[k].lines.map((nm) => ({ nm, color: ELEMENTS[k].color })))} height={30} />
            </div>
          )}
        </div>
      )}

      <div className="row" style={{ marginTop: 12, gap: 10 }}>
        {!verdict ? (
          <button className="btn gold" onClick={check} disabled={R.kind === 'jump' ? up === null || lo === null : pick.length === 0}>
            Submit
          </button>
        ) : (
          <>
            <div className={`panel pop ${verdict.ok ? '' : 'shake'}`} style={{ padding: 10, borderColor: verdict.ok ? 'var(--green)' : 'var(--red)', flex: 1 }}>
              <span style={{ color: verdict.ok ? 'var(--green)' : 'var(--red)' }}>{verdict.text}</span>
            </div>
            <button className="btn primary" onClick={next}>
              {ri + 1 >= rounds.length || hearts <= 0 ? 'Finish' : 'Next case →'}
            </button>
          </>
        )}
      </div>
      {over && (
        <GameOverlay title={hearts > 0 && score >= 600 ? 'Case closed!' : 'The trail went cold'} tone={hearts > 0 && score >= 600 ? 'win' : 'lose'} onClose={restart}>
          Final score <b>{score}</b>. Every line is a photon carrying exactly the energy difference between two atomic levels, so a spectrum is a fingerprint of the atom’s energy ladder. This is how we know what stars billions of light years away are made of.
        </GameOverlay>
      )}
    </div>
  );
}
