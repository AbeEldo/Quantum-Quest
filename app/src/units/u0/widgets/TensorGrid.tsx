import React, { useState } from 'react';
import { Widget, Slider, Segmented, Tex, fmtPi, Stat } from '../../../components/ui';
import { c, add, sub, mul, conj, abs, abs2, arg, phaseColor, fmt, type C } from '../../../engine/complex';
import { PhasorClock } from '../../../widgets/AmplitudeView';
import { AmplitudeView } from '../../../widgets/AmplitudeView';
import { fx } from './common';

const qubit = (theta: number, phi: number): [C, C] => [c(Math.cos(theta / 2)), c(Math.sin(theta / 2) * Math.cos(phi), Math.sin(theta / 2) * Math.sin(phi))];

function QubitSliders({ name, color, theta, phi, setTheta, setPhi }: { name: string; color: string; theta: number; phi: number; setTheta: (v: number) => void; setPhi: (v: number) => void }) {
  return (
    <div style={{ borderLeft: `3px solid ${color}`, paddingLeft: 8 }}>
      <div style={{ color, fontWeight: 600, fontSize: '0.9rem' }}>qubit {name}</div>
      <Slider label={<Tex>{'\\theta'}</Tex>} value={theta} min={0} max={Math.PI} step={Math.PI / 24} onChange={setTheta} format={fmtPi} />
      <Slider label={<Tex>{'\\varphi'}</Tex>} value={phi} min={0} max={2 * Math.PI} step={Math.PI / 24} onChange={setPhi} format={fmtPi} />
    </div>
  );
}

function Cell({ z, label, border, size = 46 }: { z: C; label?: string; border?: string; size?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 4, borderRadius: 8, border: `1px solid ${border ?? 'var(--border)'}`, background: 'rgba(255,255,255,0.02)' }}>
      <PhasorClock z={z} size={size} />
      <span className="mono" style={{ fontSize: '0.7rem', color: abs(z) > 1e-3 ? phaseColor(arg(z)) : 'var(--text-faint)' }}>
        {fmt(z, 2)}
      </span>
      {label && <span className="faint mono" style={{ fontSize: '0.68rem' }}>{label}</span>}
    </div>
  );
}

const s = Math.SQRT1_2;
const TARGETS: { name: string; tex: string; amps: [C, C, C, C] }[] = [
  { name: '|+⟩|0⟩', tex: '\\tfrac{1}{\\sqrt2}(|00\\rangle + |10\\rangle)', amps: [c(s), c(0), c(s), c(0)] },
  { name: 'uniform', tex: '\\tfrac12(|00\\rangle+|01\\rangle+|10\\rangle+|11\\rangle)', amps: [c(0.5), c(0.5), c(0.5), c(0.5)] },
  { name: 'Bell Φ⁺', tex: '\\tfrac{1}{\\sqrt2}(|00\\rangle + |11\\rangle)', amps: [c(s), c(0), c(0), c(s)] },
  { name: 'one minus sign', tex: '\\tfrac12(|00\\rangle+|01\\rangle+|10\\rangle-|11\\rangle)', amps: [c(0.5), c(0.5), c(0.5), c(-0.5)] },
  { name: 'phases', tex: '\\tfrac12(|00\\rangle+i|01\\rangle+|10\\rangle+i|11\\rangle)', amps: [c(0.5), c(0, 0.5), c(0.5), c(0, 0.5)] },
  { name: 'W-like', tex: '\\tfrac{1}{\\sqrt3}(|00\\rangle+|01\\rangle+|10\\rangle)', amps: [c(1 / Math.sqrt(3)), c(1 / Math.sqrt(3)), c(1 / Math.sqrt(3)), c(0)] },
];

/** Max overlap of a 2-qubit state with any product state = largest squared singular value of the amplitude table. */
export function bestProductOverlap(a: [C, C, C, C]): number {
  const tr = a.reduce((t, z) => t + abs2(z), 0);
  const det = sub(mul(a[0], a[3]), mul(a[1], a[2]));
  const d = Math.sqrt(Math.max(0, tr * tr - 4 * abs2(det)));
  return (tr + d) / 2;
}

type Tab = 'build' | 'factor' | 'wall';

export function TensorGrid({ tab: tab0 = 'build', tabs = ['build', 'factor', 'wall'] }: { tab?: Tab; tabs?: Tab[] }) {
  const [tab, setTab] = useState<Tab>(tab0);
  const [tA, setTA] = useState(Math.PI / 2);
  const [pA, setPA] = useState(0);
  const [tB, setTB] = useState(Math.PI / 3);
  const [pB, setPB] = useState(Math.PI / 2);
  const [target, setTarget] = useState(2);
  const [reveal, setReveal] = useState(false);
  const [n, setN] = useState(10);

  const a = qubit(tA, pA),
    b = qubit(tB, pB);
  const prod: [C, C, C, C] = [mul(a[0], b[0]), mul(a[0], b[1]), mul(a[1], b[0]), mul(a[1], b[1])];
  const T = TARGETS[target];
  const overlap = abs2(T.amps.reduce((acc, z, i) => add(acc, mul(conj(prod[i]), z)), c(0)));
  const best = bestProductOverlap(T.amps);
  const det = sub(mul(T.amps[0], T.amps[3]), mul(T.amps[1], T.amps[2]));
  const isProduct = abs(det) < 1e-6;

  const colA = '#58c4dd',
    colB = '#fcd34d';
  return (
    <Widget title="Tensor product workshop">
      {tabs.length > 1 && (
        <div style={{ marginBottom: 12 }}>
          <Segmented<Tab>
            options={tabs.map((t) => ({ value: t, label: t === 'build' ? 'Build a product state' : t === 'factor' ? 'Can it be factored?' : 'The exponential wall' }))}
            value={tab}
            onChange={(t) => {
              setTab(t);
              setReveal(false);
            }}
          />
        </div>
      )}

      {tab === 'build' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,0.8fr) minmax(0,1.2fr)', gap: 16, alignItems: 'start' }}>
          <div className="col" style={{ gap: 10 }}>
            <QubitSliders name="A" color={colA} theta={tA} phi={pA} setTheta={setTA} setPhi={setPA} />
            <QubitSliders name="B" color={colB} theta={tB} phi={pB} setTheta={setTB} setPhi={setPB} />
            <div className="faint" style={{ fontSize: '0.8rem' }}>
              Each entry of the product is (one amplitude of A) × (one amplitude of B): lengths multiply and phases add.
            </div>
          </div>
          <div className="col" style={{ gap: 10 }}>
            <div className="row" style={{ gap: 10, alignItems: 'center', justifyContent: 'center' }}>
              <div className="col" style={{ gap: 4 }}>
                <Cell z={a[0]} label="a₀" border={colA} />
                <Cell z={a[1]} label="a₁" border={colA} />
              </div>
              <span style={{ fontSize: '1.4rem' }}>⊗</span>
              <div className="col" style={{ gap: 4 }}>
                <Cell z={b[0]} label="b₀" border={colB} />
                <Cell z={b[1]} label="b₁" border={colB} />
              </div>
              <span style={{ fontSize: '1.4rem' }}>=</span>
              <div className="col" style={{ gap: 6 }}>
                {[0, 1].map((i) => (
                  <div key={i} style={{ border: `2px solid ${colA}55`, borderRadius: 10, padding: 3 }}>
                    <div className="faint" style={{ fontSize: '0.66rem', textAlign: 'center' }}>
                      a{i === 0 ? '₀' : '₁'} × (b₀, b₁)
                    </div>
                    <div className="col" style={{ gap: 3 }}>
                      <Cell z={prod[2 * i]} label={`|${i}0⟩`} border={colB + '88'} size={40} />
                      <Cell z={prod[2 * i + 1]} label={`|${i}1⟩`} border={colB + '88'} size={40} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <AmplitudeView amps={prod} n={2} mode="bars" compact />
            <div className="faint" style={{ fontSize: '0.8rem', textAlign: 'center' }}>
              Total probability: <Tex>{`\\sum |c_{ij}|^2 = ${fx(prod.reduce((t, z) => t + abs2(z), 0), 3)}`}</Tex> (normalized × normalized = normalized)
            </div>
          </div>
        </div>
      )}

      {tab === 'factor' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
          <div className="col" style={{ gap: 8 }}>
            <div className="faint" style={{ fontSize: '0.8rem' }}>Target two-qubit state:</div>
            <div className="row" style={{ gap: 4 }}>
              {TARGETS.map((t, i) => (
                <button key={t.name} className={`btn small ${i === target ? 'active' : ''}`} onClick={() => { setTarget(i); setReveal(false); }}>
                  {t.name}
                </button>
              ))}
            </div>
            <Tex>{`|\\Psi\\rangle = ${T.tex}`}</Tex>
            <div className="faint" style={{ fontSize: '0.8rem', marginTop: 6 }}>Arrange the amplitudes as a table, rows = qubit A, columns = qubit B:</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto auto auto', gap: 4, justifyContent: 'start', alignItems: 'center' }}>
              <span />
              <span className="faint mono center" style={{ fontSize: '0.75rem' }}>B=0</span>
              <span className="faint mono center" style={{ fontSize: '0.75rem' }}>B=1</span>
              <span className="faint mono" style={{ fontSize: '0.75rem' }}>A=0</span>
              <Cell z={T.amps[0]} />
              <Cell z={T.amps[1]} />
              <span className="faint mono" style={{ fontSize: '0.75rem' }}>A=1</span>
              <Cell z={T.amps[2]} />
              <Cell z={T.amps[3]} />
            </div>
            <div style={{ fontSize: '0.9rem' }}>
              <Tex>{`c_{00}c_{11} - c_{01}c_{10} = ${fmt(det, 3)}`}</Tex>{' '}
              {reveal && <span className={`pill ${isProduct ? 'good' : 'bad'}`}>{isProduct ? 'product state' : 'entangled'}</span>}
            </div>
          </div>
          <div className="col" style={{ gap: 8 }}>
            <div className="faint" style={{ fontSize: '0.8rem' }}>Try to build it as (state of A) ⊗ (state of B):</div>
            <QubitSliders name="A" color={colA} theta={tA} phi={pA} setTheta={setTA} setPhi={setPA} />
            <QubitSliders name="B" color={colB} theta={tB} phi={pB} setTheta={setTB} setPhi={setPB} />
            <div className="row" style={{ justifyContent: 'center' }}>
              <Stat label="overlap with target" value={`${(overlap * 100).toFixed(1)}%`} color={overlap > 0.995 ? '#83c167' : '#fcd34d'} />
              {reveal && <Stat label="best possible" value={`${(best * 100).toFixed(1)}%`} color={best > 0.995 ? '#83c167' : '#fc6255'} />}
            </div>
            <button className="btn small" onClick={() => setReveal(true)} disabled={reveal}>
              Reveal the best any product state can do
            </button>
            {reveal && (
              <div className="dim" style={{ fontSize: '0.85rem' }}>
                {isProduct
                  ? 'This state factors: some choice of sliders reaches 100%.'
                  : `No product state gets above ${(best * 100).toFixed(1)}%. This state cannot be written as (A) ⊗ (B) at all: it is entangled.`}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'wall' && <ExponentialWall n={n} setN={setN} />}
    </Widget>
  );
}

function humanBytes(b: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  let i = 0;
  while (b >= 1000 && i < units.length - 1) {
    b /= 1000;
    i++;
  }
  if (b >= 1000) return `${b.toExponential(1)} ${units[i]}`;
  return `${b.toFixed(b < 10 ? 1 : 0)} ${units[i]}`;
}

function ExponentialWall({ n, setN }: { n: number; setN: (v: number) => void }) {
  const amps = Math.pow(2, n);
  const bytes = amps * 16;
  const W = 640,
    H = 220,
    pl = 48,
    pb = 26,
    pt = 10;
  const maxN = 64;
  const x = (k: number) => pl + (k / maxN) * (W - pl - 12);
  const y = (log10v: number) => H - pb - (log10v / 20) * (H - pb - pt);
  const marks: { v: number; label: string }[] = [
    { v: 9.9, label: 'laptop RAM (16 GB)' },
    { v: 15.3, label: 'largest supercomputers (~PB of memory)' },
  ];
  const comparison =
    n <= 20
      ? 'Fits easily in a laptop.'
      : n <= 30
        ? 'Needs a beefy workstation (30 qubits ≈ 17 GB).'
        : n <= 45
          ? 'Needs a large fraction of a supercomputer: about the limit of brute-force state-vector simulation.'
          : n <= 60
            ? 'Beyond the memory of any computer ever built (exabytes and up).'
            : 'Absurd: more bytes than any conceivable classical machine. (At n ≈ 270, 2ⁿ exceeds the number of atoms in the observable universe.)';
  return (
    <div className="col" style={{ gap: 10 }}>
      <Slider label="qubits n" value={n} min={1} max={maxN} step={1} onChange={setN} format={(v) => String(v)} />
      <div className="row" style={{ justifyContent: 'center' }}>
        <Stat label="classical bits to store n bits" value={String(n)} color="#83c167" />
        <Stat label="complex amplitudes (2ⁿ)" value={amps < 1e7 ? amps.toLocaleString() : amps.toExponential(2)} color="#58c4dd" />
        <Stat label="memory at 16 bytes each" value={humanBytes(bytes)} color="#fcd34d" />
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
        <rect width={W} height={H} rx={8} fill="#0d1018" />
        {[0, 5, 10, 15, 20].map((p) => (
          <g key={p}>
            <line x1={pl} x2={W - 12} y1={y(p)} y2={y(p)} stroke="#1c2230" />
            <text x={pl - 6} y={y(p) + 4} fill="#6b7385" fontSize={10} textAnchor="end">
              10<tspan baselineShift="super" fontSize={8}>{p}</tspan>
            </text>
          </g>
        ))}
        {marks.map((m) => (
          <g key={m.label}>
            <line x1={pl} x2={W - 12} y1={y(m.v)} y2={y(m.v)} stroke="#e07ab6" strokeDasharray="4 4" strokeOpacity={0.6} />
            <text x={W - 16} y={y(m.v) - 4} fill="#e07ab6" fontSize={10} textAnchor="end">
              {m.label}
            </text>
          </g>
        ))}
        {Array.from({ length: maxN }, (_, i) => i + 1).map((k) => {
          const lv = Math.min(20, Math.log10(Math.pow(2, k) * 16));
          return <rect key={k} x={x(k) - 3.5} y={y(lv)} width={7} height={y(0) - y(lv)} fill={k === n ? '#fcd34d' : k <= n ? '#58c4dd' : '#26314a'} rx={1.5} />;
        })}
        <text x={(pl + W) / 2} y={H - 6} fill="#9aa3b5" fontSize={11} textAnchor="middle" fontStyle="italic">
          number of qubits → (bar height: bytes needed, log scale, capped at 10²⁰)
        </text>
      </svg>
      <div className="dim" style={{ fontSize: '0.9rem' }}>{comparison}</div>
    </div>
  );
}
