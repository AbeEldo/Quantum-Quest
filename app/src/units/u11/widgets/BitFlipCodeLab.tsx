import React, { useMemo, useRef, useState } from 'react';
import { Widget, Slider, Segmented, Stat, fmtPi } from '../../../components/ui';
import { AmplitudeView } from '../../../widgets/AmplitudeView';
import { GATES, Rx, Rz, mulberry32, type Mat2 } from '../../../engine/qsim';
import { runSyndromeRound, type RoundResult } from '../engine/bitflip';

type Kind = 'bit' | 'phase';
type Err = 'none' | 'flip' | 'small';

const SYN_LABEL: Record<string, string> = { '00': 'no error', '10': 'flip qubit 0', '11': 'flip qubit 1', '01': 'flip qubit 2' };

/** Full simulation of the 3-qubit bit-flip / phase-flip code with ancilla syndrome extraction. */
export function BitFlipCodeLab({ initialKind = 'bit' }: { initialKind?: Kind }) {
  const [kind, setKind] = useState<Kind>(initialKind);
  const [theta, setTheta] = useState(Math.PI / 3);
  const [phi, setPhi] = useState(Math.PI / 4);
  const [err, setErr] = useState<Err>('small');
  const [q, setQ] = useState(1);
  const [eps, setEps] = useState(0.6);
  const [seed, setSeed] = useState(1);
  const [stats, setStats] = useState<{ counts: Record<string, number>; fid: number; N: number } | null>(null);
  const rng = useRef(mulberry32(77));

  const errMat: Mat2 | undefined = err === 'none' ? undefined : err === 'flip' ? (kind === 'bit' ? GATES.X : GATES.Z) : kind === 'bit' ? Rx(eps) : Rz(eps);
  const opts = { theta, phi, errorQubit: err === 'none' ? -1 : q, error: errMat, kind };
  const r: RoundResult = useMemo(() => runSyndromeRound({ ...opts, rng: mulberry32(seed * 131) }), [theta, phi, err, q, eps, kind, seed]);

  const runMany = () => {
    const counts: Record<string, number> = { '00': 0, '01': 0, '10': 0, '11': 0 };
    let fid = 0;
    const N = 1000;
    for (let i = 0; i < N; i++) {
      const rr = runSyndromeRound({ ...opts, rng: rng.current });
      counts[rr.syndrome.join('')]++;
      fid += rr.fidelityAfterCorrection;
    }
    setStats({ counts, fid: fid / N, N });
  };

  const synKey = r.syndrome.join('');
  const errName = kind === 'bit' ? 'X' : 'Z';
  const rotName = kind === 'bit' ? 'Rx' : 'Rz';
  const labels = kind === 'phase' ? ['+++', '++−', '+−+', '+−−', '−++', '−+−', '−−+', '−−−'] : undefined;
  // For the phase code, show amplitudes in the ± basis (apply H⊗3 for display)
  const show = (amps: RoundResult['encoded']) => (kind === 'phase' ? hadamard3(amps) : amps);

  return (
    <Widget title={`The 3-qubit ${kind}-flip code, simulated end to end`}>
      <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <Segmented value={kind} onChange={(k) => { setKind(k); setStats(null); }} options={[{ value: 'bit', label: 'bit-flip code' }, { value: 'phase', label: 'phase-flip code' }]} />
        <Segmented
          value={err}
          onChange={(e) => { setErr(e); setStats(null); }}
          options={[
            { value: 'none', label: 'no error' },
            { value: 'flip', label: `full ${errName} error` },
            { value: 'small', label: `small ${rotName}(ε) error` },
          ]}
        />
        {err !== 'none' && (
          <Segmented value={q} onChange={(v) => { setQ(v); setStats(null); }} options={[0, 1, 2].map((k) => ({ value: k, label: `on q${k}` }))} />
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 18px' }}>
        <Slider label="input θ" value={theta} min={0} max={Math.PI} step={Math.PI / 48} onChange={(v) => { setTheta(v); setStats(null); }} format={fmtPi} />
        <Slider label="input φ" value={phi} min={0} max={2 * Math.PI} step={Math.PI / 48} onChange={(v) => { setPhi(v); setStats(null); }} format={fmtPi} />
        {err === 'small' && <Slider label="error angle ε" value={eps} min={0} max={Math.PI} step={0.01} onChange={(v) => { setEps(v); setStats(null); }} format={(x) => `${x.toFixed(2)} rad`} />}
      </div>

      <CodeCircuit kind={kind} errQ={err === 'none' ? -1 : q} errLabel={err === 'flip' ? errName : `${rotName}`} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginTop: 6 }}>
        <Stage title="① encoded" amps={show(r.encoded)} labels={labels} />
        <Stage title="② after the error" amps={show(r.afterError)} labels={labels} note={`fidelity ${r.fidelityBefore.toFixed(3)}`} />
        <Stage title={`③ syndrome measured: ${synKey}`} amps={show(r.afterMeasure)} labels={labels} note={SYN_LABEL[synKey]} highlight />
        <Stage title="④ after correction" amps={show(r.corrected)} labels={labels} note={`fidelity ${r.fidelityAfterCorrection.toFixed(4)}`} good={r.fidelityAfterCorrection > 0.9999} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px,1fr) 1fr', gap: 16, marginTop: 10, alignItems: 'start' }}>
        <div>
          <div className="faint" style={{ fontSize: '0.8rem', marginBottom: 4 }}>Syndrome probabilities before measuring (from the state)</div>
          {(['00', '10', '11', '01'] as const).map((k) => (
            <div key={k} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 56px', gap: 8, alignItems: 'center', fontSize: '0.84rem' }}>
              <span className="mono">{k} · {SYN_LABEL[k]}</span>
              <div style={{ height: 10, background: 'var(--panel-2)', borderRadius: 5, overflow: 'hidden', border: '1px solid var(--border)' }}>
                <div style={{ width: `${r.syndromeProbs[k] * 100}%`, height: '100%', background: k === '00' ? 'var(--green)' : 'var(--yellow)', transition: 'width .25s' }} />
              </div>
              <span className="mono" style={{ textAlign: 'right' }}>{(r.syndromeProbs[k] * 100).toFixed(1)}%</span>
            </div>
          ))}
          {err === 'small' && (
            <div className="faint" style={{ fontSize: '0.8rem', marginTop: 4 }}>
              Theory: P(no error) = cos²(ε/2) = {(Math.cos(eps / 2) ** 2 * 100).toFixed(1)}%, P(flip) = sin²(ε/2) = {(Math.sin(eps / 2) ** 2 * 100).toFixed(1)}%
            </div>
          )}
          <div className="row" style={{ gap: 6, marginTop: 8 }}>
            <button className="btn small" onClick={() => setSeed((s) => s + 1)}>🎲 measure again</button>
            <button className="btn small primary" onClick={runMany}>▶ run 1,000 rounds</button>
          </div>
        </div>
        <div>
          {stats ? (
            <div className="panel pop" style={{ padding: 10 }}>
              <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
                {(['00', '10', '11', '01'] as const).map((k) => (
                  <Stat key={k} label={SYN_LABEL[k]} value={stats.counts[k]} color={k === '00' ? 'var(--green)' : 'var(--yellow)'} />
                ))}
              </div>
              <div style={{ marginTop: 8 }}>
                Average fidelity after correction over {stats.N} rounds: <b style={{ color: 'var(--green)' }}>{stats.fid.toFixed(6)}</b>
              </div>
              <div className="faint" style={{ fontSize: '0.8rem', marginTop: 4 }}>
                Every round ends in exactly one of the discrete branches, and every branch is fixed perfectly. A continuous error became "no error" or "a full flip."
              </div>
            </div>
          ) : (
            <div className="faint" style={{ fontSize: '0.85rem' }}>
              Run many rounds to see the syndrome statistics and the average fidelity after correction.
            </div>
          )}
        </div>
      </div>
    </Widget>
  );
}

function hadamard3(a: RoundResult['encoded']): RoundResult['encoded'] {
  // apply H⊗3 to 8 amplitudes (so |+++⟩ shows as index 0)
  let v = a.map((z) => ({ ...z }));
  for (let bit = 0; bit < 3; bit++) {
    const step = 1 << bit;
    const out = v.map((z) => ({ ...z }));
    for (let i = 0; i < 8; i++) {
      if (i & step) continue;
      const j = i | step;
      out[i] = { re: (v[i].re + v[j].re) * Math.SQRT1_2, im: (v[i].im + v[j].im) * Math.SQRT1_2 };
      out[j] = { re: (v[i].re - v[j].re) * Math.SQRT1_2, im: (v[i].im - v[j].im) * Math.SQRT1_2 };
    }
    v = out;
  }
  return v;
}

function Stage({ title, amps, labels, note, highlight, good }: { title: string; amps: RoundResult['encoded']; labels?: string[]; note?: string; highlight?: boolean; good?: boolean }) {
  return (
    <div className="panel" style={{ padding: 8, borderColor: good ? 'var(--green)' : highlight ? 'var(--yellow)' : 'var(--border)' }}>
      <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>{title}</div>
      <AmplitudeView amps={amps} n={3} labels={labels} compact hideZero />
      {note && <div className="faint" style={{ fontSize: '0.78rem', marginTop: 2 }}>{note}</div>}
    </div>
  );
}

/** Static circuit diagram of the code (encode → error → syndrome → correct). */
function CodeCircuit({ kind, errQ, errLabel }: { kind: Kind; errQ: number; errLabel: string }) {
  const W = 760, H = 210, top = 22, dy = 36;
  const y = (k: number) => top + k * dy;
  const labels = ['q0 (ψ)', 'q1', 'q2', 'anc a', 'anc b'];
  let x = 90;
  const els: React.ReactNode[] = [];
  const cnot = (c: number, t: number, key: string) => {
    els.push(
      <g key={key}>
        <line x1={x} x2={x} y1={y(Math.min(c, t))} y2={y(Math.max(c, t))} stroke="#e8655a" strokeWidth={2} />
        <circle cx={x} cy={y(c)} r={5} fill="#e8655a" />
        <circle cx={x} cy={y(t)} r={10} fill="#141821" stroke="#e8655a" strokeWidth={2} />
        <line x1={x - 10} x2={x + 10} y1={y(t)} y2={y(t)} stroke="#e8655a" strokeWidth={2} />
        <line x1={x} x2={x} y1={y(t) - 10} y2={y(t) + 10} stroke="#e8655a" strokeWidth={2} />
      </g>,
    );
    x += 30;
  };
  const box = (k: number, label: string, color: string, key: string) =>
    els.push(
      <g key={key}>
        <rect x={x - 13} y={y(k) - 13} width={26} height={26} rx={5} fill="#141821" stroke={color} strokeWidth={2} />
        <text x={x} y={y(k) + 5} textAnchor="middle" fontSize={label.length > 1 ? 10 : 14} fontWeight={700} fill={color} fontFamily="var(--serif)">
          {label}
        </text>
      </g>,
    );
  const hLayer = (key: string) => {
    [0, 1, 2].forEach((k) => box(k, 'H', '#f4d35e', `${key}${k}`));
    x += 32;
  };
  const region = (x0: number, x1: number, label: string, color: string) =>
    els.unshift(
      <g key={`r${label}`}>
        <rect x={x0} y={4} width={x1 - x0} height={H - 10} rx={8} fill={color} opacity={0.06} />
        <text x={(x0 + x1) / 2} y={H - 10} textAnchor="middle" fontSize={11} fill={color}>
          {label}
        </text>
      </g>,
    );
  const e0 = x - 16;
  cnot(0, 1, 'e1');
  cnot(0, 2, 'e2');
  if (kind === 'phase') hLayer('he');
  region(e0, x - 12, 'encode', '#58c4dd');
  const r0 = x - 12;
  if (errQ >= 0) box(errQ, errLabel, '#fc6255', 'err');
  else els.push(<text key="noerr" x={x} y={y(1) + 4} textAnchor="middle" fontSize={11} fill="#6b7385">—</text>);
  x += 34;
  region(r0, x - 12, 'error', '#fc6255');
  const s0 = x - 12;
  if (kind === 'phase') hLayer('hs1');
  cnot(0, 3, 's1');
  cnot(1, 3, 's2');
  cnot(1, 4, 's3');
  cnot(2, 4, 's4');
  if (kind === 'phase') hLayer('hs2');
  [3, 4].forEach((k) =>
    els.push(
      <g key={`m${k}`}>
        <rect x={x - 13} y={y(k) - 13} width={26} height={26} rx={5} fill="#1d2230" stroke="#bbb" />
        <path d={`M${x - 8} ${y(k) + 5} A 9 9 0 0 1 ${x + 8} ${y(k) + 5}`} fill="none" stroke="#ddd" strokeWidth={1.4} />
        <line x1={x} y1={y(k) + 5} x2={x + 6} y2={y(k) - 6} stroke="#fcd34d" strokeWidth={1.5} />
      </g>,
    ),
  );
  x += 40;
  region(s0, x - 12, 'measure syndrome (parities)', '#fcd34d');
  const c0 = x - 12;
  [0, 1, 2].forEach((k) => box(k, kind === 'bit' ? 'X?' : 'Z?', '#83c167', `c${k}`));
  els.push(<line key="cl" x1={x} x2={x} y1={y(2) + 13} y2={y(4)} stroke="#83c167" strokeDasharray="3 3" />);
  x += 34;
  region(c0, x - 12, 'correct', '#83c167');
  return (
    <div style={{ overflowX: 'auto', marginTop: 8 }}>
      <svg width={W} height={H} style={{ display: 'block' }}>
        {labels.map((l, k) => (
          <g key={l}>
            <text x={6} y={y(k) + 4} fontSize={11} fill="#9aa3b5" fontFamily="var(--mono)">
              {l}
            </text>
            <line x1={70} x2={x + 10} y1={y(k)} y2={y(k)} stroke={k < 3 ? '#4a5368' : '#3a4256'} strokeWidth={1.5} strokeDasharray={k < 3 ? undefined : '0'} />
          </g>
        ))}
        {els}
      </svg>
    </div>
  );
}
