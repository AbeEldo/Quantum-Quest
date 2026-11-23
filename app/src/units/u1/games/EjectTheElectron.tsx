import React, { useMemo, useState } from 'react';
import { useGame, GameOverlay, HowToPlay } from '../../../components/game';
import { Slider, Stat, RichText } from '../../../components/ui';
import { METALS, c0, eC, h as H_TRUE, wavelengthCSS } from '../physics';

type Answer = { key: 'phi' | 'lam0' | 'h' | 'metal'; label: string; unit: string; tol: number; rel?: boolean };
interface LevelDef {
  name: string;
  brief: string;
  par: number;
  noise: number; // σ of voltmeter noise (V)
  lamp?: number[]; // fixed lamp lines (nm); otherwise tunable 150–800 nm
  alien?: boolean; // Planck's constant is unknown
  metalPool?: number[]; // indices into METALS for "identify the metal"
  answers: Answer[];
  lesson: string;
}

const HG_LINES = [365.0, 404.7, 435.8, 546.1, 577.0];

const LEVELS: LevelDef[] = [
  {
    name: 'First contact',
    brief: 'A plate of unknown metal. Planck’s constant is the usual $h$. Find its **work function** $\\phi$ (± 0.10 eV).',
    par: 1,
    noise: 0.01,
    answers: [{ key: 'phi', label: 'work function φ', unit: 'eV', tol: 0.1 }],
    lesson: 'One measurement is enough: $\\phi = hf - eV_0$. If you picked a wavelength below threshold you learned only that $\\phi > hf$, which costs you a measurement.',
  },
  {
    name: 'Threshold hunter',
    brief: 'Find this metal’s **threshold wavelength** $\\lambda_0$, the longest wavelength that still ejects electrons (± 8 nm).',
    par: 1,
    noise: 0.01,
    answers: [{ key: 'lam0', label: 'threshold λ₀', unit: 'nm', tol: 8 }],
    lesson: 'You don’t need to scan for the edge. One measured stopping voltage gives $\\phi$, and then $\\lambda_0 = hc/\\phi$.',
  },
  {
    name: 'Shaky voltmeter',
    brief: 'The voltmeter is noisy (± 0.08 V). Find $\\phi$ to within **± 0.05 eV**.',
    par: 4,
    noise: 0.08,
    answers: [{ key: 'phi', label: 'work function φ', unit: 'eV', tol: 0.05 }],
    lesson: 'Averaging $N$ independent measurements shrinks random error by $\\sqrt N$: four readings halve it. Experimental physics is mostly the art of beating noise.',
  },
  {
    name: 'Mercury lamp',
    brief: 'Like Millikan, you only have a mercury lamp (fixed lines). The plate is one of Cs, K, Na or Ca. **Which metal is it?**',
    par: 1,
    noise: 0.01,
    lamp: HG_LINES,
    metalPool: [0, 1, 2, 3],
    answers: [{ key: 'metal', label: 'metal', unit: '', tol: 0 }],
    lesson: 'Work functions are fingerprints: Cs 2.1, K 2.3, Na 2.36, Ca 2.9 eV. A single good stopping-voltage measurement distinguishes them (K and Na need care!).',
  },
  {
    name: 'Alien universe',
    brief: 'You’ve woken up in a universe where Planck’s constant is different. Measure it: give $h$ in units of $10^{-34}$ J s (± 4%).',
    par: 2,
    noise: 0.01,
    alien: true,
    answers: [{ key: 'h', label: 'h', unit: '×10⁻³⁴ J s', tol: 0.04, rel: true }],
    lesson: 'With $\\phi$ unknown you need two frequencies: $h = e\\,\\Delta V_0/\\Delta f$, the slope of the Millikan line. One measurement can never separate $h$ from $\\phi$.',
  },
  {
    name: 'Millikan’s challenge',
    brief: 'Our universe again, noisy meter (± 0.03 V). Measure **both** $h$ (± 3%) and $\\phi$ (± 0.1 eV) as if $h$ were unknown.',
    par: 4,
    noise: 0.03,
    alien: true,
    answers: [
      { key: 'h', label: 'h', unit: '×10⁻³⁴ J s', tol: 0.03, rel: true },
      { key: 'phi', label: 'work function φ', unit: 'eV', tol: 0.1 },
    ],
    lesson: 'Spread your frequencies widely: the further apart they are, the less a given voltage error tilts the line. Millikan got $h$ within about 1% this way in 1916.',
  },
];

function gauss() {
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

interface Secret {
  phi: number;
  h: number;
  metal: number;
}
function makeSecret(L: LevelDef, li: number): Secret {
  if (L.metalPool) {
    const metal = L.metalPool[Math.floor(Math.random() * L.metalPool.length)];
    return { phi: METALS[metal].phi, h: H_TRUE, metal };
  }
  const phi = +(1.9 + Math.random() * (li === 4 ? 1.1 : 3.2)).toFixed(2);
  const h = L.alien && li === 4 ? (3 + Math.random() * 9) * 1e-34 : H_TRUE;
  return { phi, h, metal: -1 };
}

interface Meas {
  nm: number;
  f: number; // Hz
  V: number | null; // null = no current
}

export default function EjectTheElectron() {
  const g = useGame('eject-the-electron');
  const [li, setLi] = useState(0);
  const L = LEVELS[li];
  const [secret, setSecret] = useState<Secret>(() => makeSecret(LEVELS[0], 0));
  const [nm, setNm] = useState(400);
  const [meas, setMeas] = useState<Meas[]>([]);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ pts: number; lines: string[]; pass: boolean } | null>(null);
  const [score, setScore] = useState(0);
  const [passed, setPassed] = useState(0);
  const [done, setDone] = useState(false);

  const measure = () => {
    const f = c0 / (nm * 1e-9);
    const E = (secret.h * f) / eC; // photon energy in eV in this universe
    const K = E - secret.phi;
    setMeas((m) => [...m, { nm, f, V: K > 0 ? Math.max(0, K + L.noise * gauss()) : null }]);
  };

  const submit = () => {
    const lines: string[] = [];
    let ok = true;
    let acc = 0;
    for (const a of L.answers) {
      if (a.key === 'metal') {
        const pick = +(inputs.metal ?? -1);
        const good = pick === secret.metal;
        ok = ok && good;
        acc += good ? 1 : 0;
        lines.push(`${good ? '✓' : '✗'} It was **${METALS[secret.metal].name}** ($\\phi$ = ${METALS[secret.metal].phi} eV).`);
        continue;
      }
      const truth = a.key === 'phi' ? secret.phi : a.key === 'lam0' ? (secret.h * c0) / (secret.phi * eC) * 1e9 : secret.h / 1e-34;
      const val = parseFloat((inputs[a.key] ?? '').replace(',', '.'));
      const err = Math.abs(val - truth);
      const tol = a.rel ? a.tol * truth : a.tol;
      const good = isFinite(val) && err <= tol;
      ok = ok && good;
      acc += good ? 1 - (0.5 * err) / tol : 0;
      lines.push(`${good ? '✓' : '✗'} ${a.label}: you said ${isFinite(val) ? val : '—'}, true value ${truth.toFixed(a.key === 'lam0' ? 0 : 3)} ${a.unit}`);
    }
    const accuracy = acc / L.answers.length;
    const over = Math.max(0, meas.length - L.par);
    const pts = ok ? Math.max(20, Math.round(100 * accuracy) - 10 * over) : 0;
    lines.push(ok ? `${meas.length} measurement${meas.length === 1 ? '' : 's'} (par ${L.par})${over ? `: −${10 * over} for extras` : ': on par!'}` : 'Outside tolerance: no points this time.');
    setResult({ pts, lines, pass: ok });
    setScore((s) => s + pts);
    if (ok) setPassed((p) => p + 1);
    if (ok && li === 5 && Math.abs(parseFloat(inputs.h) - secret.h / 1e-34) / (secret.h / 1e-34) < 0.01) g.unlock('millikan-medal');
  };

  const next = () => {
    if (li + 1 >= LEVELS.length) {
      const beaten = passed >= 4 && score >= 360;
      g.finish(score, beaten, { score, passed });
      setDone(true);
      return;
    }
    const n = li + 1;
    setLi(n);
    setSecret(makeSecret(LEVELS[n], n));
    setMeas([]);
    setInputs({});
    setResult(null);
    if (LEVELS[n].lamp) setNm(LEVELS[n].lamp![1]);
  };

  const restart = () => {
    setLi(0);
    setSecret(makeSecret(LEVELS[0], 0));
    setMeas([]);
    setInputs({});
    setResult(null);
    setScore(0);
    setPassed(0);
    setDone(false);
  };

  // plot V0 vs f
  const PW = 460,
    PH = 260,
    pl = 44,
    pb = 34;
  const fmin = 3.5,
    fmax = 20;
  const vmax = Math.max(4, ...meas.map((m) => (m.V ?? 0) + 0.5));
  const px = (f: number) => pl + ((f - fmin) / (fmax - fmin)) * (PW - pl - 10);
  const py = (v: number) => PH - pb - (v / vmax) * (PH - pb - 14);
  const truthLine = useMemo(() => {
    if (!result) return null;
    const v = (f14: number) => (secret.h * f14 * 1e14) / eC - secret.phi;
    return { a: [fmin, v(fmin)], b: [fmax, v(fmax)] };
  }, [result, secret]);

  return (
    <div style={{ position: 'relative' }}>
      <HowToPlay defaultOpen={li === 0}>
        Each level hides a photo-emitting metal (and sometimes a strange value of Planck’s constant). Choose a wavelength and press <b>Measure</b> to get the stopping voltage V₀, or “no current” if the photons are below threshold. Then enter your answer. You score for accuracy, and lose 10 points for
        every measurement beyond par. Use <i>eV₀ = hf − φ</i> and <i>hc ≈ 1240 eV·nm</i>.
      </HowToPlay>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <b style={{ fontSize: '1.1rem' }}>
            Level {li + 1}/{LEVELS.length}: {L.name}
          </b>
          <div className="dim" style={{ fontSize: '0.92rem', marginTop: 3, maxWidth: 560 }}>
            <RichText text={L.brief} />
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Stat label="measurements" value={`${meas.length} / par ${L.par}`} color={meas.length <= L.par ? '#83c167' : '#fc6255'} />
          <Stat label="score" value={score} color="#fcd34d" />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.1fr)', gap: 16 }}>
        <div className="col" style={{ gap: 10 }}>
          <div className="panel" style={{ padding: 12 }}>
            <div className="faint" style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
              Lamp
            </div>
            {L.lamp ? (
              <div className="row" style={{ gap: 6 }}>
                {L.lamp.map((l) => (
                  <button key={l} className={`btn small ${nm === l ? 'active' : ''}`} onClick={() => setNm(l)} style={{ borderColor: wavelengthCSS(l) }}>
                    Hg {l} nm
                  </button>
                ))}
              </div>
            ) : (
              <Slider label="wavelength" value={nm} min={150} max={800} step={1} onChange={setNm} format={(v) => `${v} nm`} />
            )}
            <div className="row" style={{ gap: 10, marginTop: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: wavelengthCSS(nm), boxShadow: `0 0 14px ${wavelengthCSS(nm)}` }} />
              <span className="mono dim" style={{ fontSize: '0.85rem' }}>
                f = {(c0 / (nm * 1e-9) / 1e14).toFixed(3)} × 10¹⁴ Hz{!L.alien ? ` · hf = ${(1239.84 / nm).toFixed(3)} eV` : ''}
              </span>
            </div>
            <button className="btn primary" style={{ marginTop: 10 }} onClick={measure} disabled={!!result}>
              ⚡ Measure stopping voltage
            </button>
          </div>
          <div className="panel" style={{ padding: 12, maxHeight: 170, overflowY: 'auto' }}>
            <div className="faint" style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
              Lab notebook
            </div>
            {meas.length === 0 && <div className="faint">No measurements yet.</div>}
            {meas.map((m, i) => (
              <div key={i} className="mono" style={{ fontSize: '0.85rem' }}>
                #{i + 1} λ = {m.nm} nm → {m.V === null ? <span style={{ color: 'var(--red)' }}>no current</span> : <span style={{ color: 'var(--green)' }}>V₀ = {m.V.toFixed(3)} V</span>}
              </div>
            ))}
          </div>
          <div className="panel" style={{ padding: 12 }}>
            {L.answers.map((a) =>
              a.key === 'metal' ? (
                <div key={a.key} className="row" style={{ gap: 6 }}>
                  {L.metalPool!.map((mi) => (
                    <button key={mi} className={`btn small ${inputs.metal === String(mi) ? 'active' : ''}`} disabled={!!result} onClick={() => setInputs({ ...inputs, metal: String(mi) })}>
                      {METALS[mi].name}
                    </button>
                  ))}
                </div>
              ) : (
                <div key={a.key} className="row" style={{ gap: 8, marginBottom: 6 }}>
                  <label style={{ minWidth: 120 }}>{a.label}</label>
                  <input type="text" value={inputs[a.key] ?? ''} disabled={!!result} onChange={(e) => setInputs({ ...inputs, [a.key]: e.target.value })} style={{ width: 110 }} />
                  <span className="faint">{a.unit}</span>
                </div>
              ),
            )}
            {!result && (
              <button className="btn gold" style={{ marginTop: 6 }} onClick={submit} disabled={L.answers.some((a) => !(inputs[a.key] ?? '').trim())}>
                Submit answer
              </button>
            )}
          </div>
        </div>
        <div className="col" style={{ gap: 10 }}>
          <svg viewBox={`0 0 ${PW} ${PH}`} style={{ width: '100%', height: 'auto' }}>
            <rect width={PW} height={PH} rx={8} fill="#0d1018" />
            {[4, 8, 12, 16, 20].map((f) => (
              <g key={f}>
                <line x1={px(f)} x2={px(f)} y1={14} y2={PH - pb} stroke="#1a2030" />
                <text x={px(f)} y={PH - pb + 14} fill="#6b7385" fontSize={10} textAnchor="middle">
                  {f}
                </text>
              </g>
            ))}
            {Array.from({ length: Math.floor(vmax) + 1 }, (_, v) => (
              <text key={v} x={pl - 6} y={py(v) + 4} fill="#6b7385" fontSize={10} textAnchor="end">
                {v}
              </text>
            ))}
            <line x1={pl} x2={PW - 10} y1={py(0)} y2={py(0)} stroke="#55607a" />
            <text x={(pl + PW) / 2} y={PH - 6} fill="#9aa3b5" fontSize={11} textAnchor="middle" fontStyle="italic">
              frequency (10¹⁴ Hz)
            </text>
            <text x={pl + 6} y={20} fill="#9aa3b5" fontSize={11}>
              stopping voltage V₀ (V)
            </text>
            {truthLine && (
              <line x1={px(truthLine.a[0])} y1={py(truthLine.a[1])} x2={px(truthLine.b[0])} y2={py(truthLine.b[1])} stroke="#83c167" strokeWidth={2} strokeDasharray="6 4" />
            )}
            {meas.map((m, i) =>
              m.V === null ? (
                <text key={i} x={px(m.f / 1e14)} y={py(0) - 4} fill="#fc6255" fontSize={14} textAnchor="middle">
                  ×
                </text>
              ) : (
                <circle key={i} cx={px(m.f / 1e14)} cy={py(m.V)} r={5} fill="#fcd34d" className="pop" />
              ),
            )}
          </svg>
          {result && (
            <div className="panel pop" style={{ padding: 12, borderColor: result.pass ? 'var(--green)' : 'var(--red)' }}>
              <div style={{ fontWeight: 700, color: result.pass ? 'var(--green)' : 'var(--red)' }}>{result.pass ? `Correct! +${result.pts}` : 'Not quite.'}</div>
              {result.lines.map((l, i) => (
                <div key={i} className="dim" style={{ fontSize: '0.88rem' }}>
                  <RichText text={l} />
                </div>
              ))}
              <div className="dim" style={{ fontSize: '0.88rem', marginTop: 6 }}>
                <RichText text={L.lesson} />
              </div>
              <div className="faint" style={{ fontSize: '0.8rem', marginTop: 4 }}>
                The green dashed line is the true V₀(f) line for this metal.
              </div>
              <button className="btn primary small" style={{ marginTop: 8 }} onClick={next}>
                {li + 1 >= LEVELS.length ? 'Finish' : 'Next level →'}
              </button>
            </div>
          )}
        </div>
      </div>
      {done && (
        <GameOverlay title={passed >= 4 && score >= 360 ? 'Lab certified!' : 'Experiment over'} tone={passed >= 4 && score >= 360 ? 'win' : 'lose'} onClose={restart}>
          You passed {passed} of {LEVELS.length} levels for <b>{score}</b> points.
          <br />
          {passed >= 4 && score >= 360 ? 'Einstein’s equation eV₀ = hf − φ is now a working tool in your hands.' : 'Pass at least 4 levels with 360+ points to certify. Remember: one point gives φ if you know h; two points give the slope h/e.'}
        </GameOverlay>
      )}
    </div>
  );
}
