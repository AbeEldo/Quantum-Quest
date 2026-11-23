import React, { useState } from 'react';
import { Widget, Toggle, Tex, Segmented, Slider, fmtPi } from '../../../components/ui';
import { c, add, mul, conj, abs, abs2, arg, scale, phaseColor, fmt, type C } from '../../../engine/complex';
import { AmplitudeView } from '../../../widgets/AmplitudeView';
import { Arrow, useSvgDrag, fx } from './common';

/** A draggable phasor "clock" used as an input for one complex number. */
export function ClockInput({ z, onChange, size = 110, maxR = 1.2, label, disabled }: { z: C; onChange?: (z: C) => void; size?: number; maxR?: number; label?: React.ReactNode; disabled?: boolean }) {
  const S = 120;
  const R = 50;
  const k = R / maxR;
  const { ref, handlers } = useSvgDrag<'tip'>(
    S,
    S,
    () => (disabled || !onChange ? null : 'tip'),
    (_, px, py) => {
      let x = (px - S / 2) / k,
        y = (S / 2 - py) / k;
      const r = Math.hypot(x, y);
      if (r > maxR) {
        x *= maxR / r;
        y *= maxR / r;
      }
      // gentle snapping to nice values
      const snapV = (v: number) => {
        for (const t of [0, 0.5, -0.5, 1, -1, Math.SQRT1_2, -Math.SQRT1_2]) if (Math.abs(v - t) < 0.04) return t;
        return v;
      };
      onChange!(c(snapV(x), snapV(y)));
    },
  );
  const col = phaseColor(arg(z));
  return (
    <div style={{ textAlign: 'center', width: size }}>
      <svg ref={ref} viewBox={`0 0 ${S} ${S}`} style={{ width: size, height: size, touchAction: 'none', cursor: disabled || !onChange ? 'default' : 'crosshair', userSelect: 'none' }} {...handlers}>
        <circle cx={S / 2} cy={S / 2} r={R} fill="#0d1018" stroke="#34405a" />
        <circle cx={S / 2} cy={S / 2} r={k} fill="none" stroke="#2a3346" strokeDasharray="2 3" />
        <line x1={S / 2 - R} x2={S / 2 + R} y1={S / 2} y2={S / 2} stroke="#222a3a" />
        <line y1={S / 2 - R} y2={S / 2 + R} x1={S / 2} x2={S / 2} stroke="#222a3a" />
        <circle cx={S / 2} cy={S / 2} r={abs(z) * k} fill={col} fillOpacity={0.12} />
        <Arrow x1={S / 2} y1={S / 2} x2={S / 2 + z.re * k} y2={S / 2 - z.im * k} color={col} width={3} head={10} />
        {onChange && !disabled && <circle cx={S / 2 + z.re * k} cy={S / 2 - z.im * k} r={6} fill={col} fillOpacity={0.35} stroke={col} />}
      </svg>
      <div className="mono" style={{ fontSize: '0.78rem', color: col, marginTop: -2 }}>
        {fmt(z, 2)}
      </div>
      {label && <div className="faint" style={{ fontSize: '0.75rem' }}>{label}</div>}
    </div>
  );
}

const PRESETS: { name: string; v: [C, C] }[] = [
  { name: '|0⟩', v: [c(1), c(0)] },
  { name: '|1⟩', v: [c(0), c(1)] },
  { name: '|+⟩', v: [c(Math.SQRT1_2), c(Math.SQRT1_2)] },
  { name: '|−⟩', v: [c(Math.SQRT1_2), c(-Math.SQRT1_2)] },
  { name: '|+i⟩', v: [c(Math.SQRT1_2), c(0, Math.SQRT1_2)] },
  { name: '(1, i)', v: [c(1), c(0, 1)] },
];

/** Two kets in ℂ² with draggable components; the inner product drawn as a sum of arrows. */
export function KetExplorer() {
  const [psi, setPsi] = useState<[C, C]>([c(0.6), c(0, 0.8)]);
  const [phi, setPhi] = useState<[C, C]>([c(Math.SQRT1_2), c(Math.SQRT1_2)]);
  const [noConj, setNoConj] = useState(false);

  const bra = (v: [C, C]) => (noConj ? v : [conj(v[0]), conj(v[1])]);
  const pb = bra(phi);
  const t0 = mul(pb[0], psi[0]);
  const t1 = mul(pb[1], psi[1]);
  const ip = add(t0, t1);
  const nPsi = add(mul(bra(psi)[0], psi[0]), mul(bra(psi)[1], psi[1]));
  const nPhi = add(mul(bra(phi)[0], phi[0]), mul(bra(phi)[1], phi[1]));
  const normPsi = Math.sqrt(abs2(psi[0]) + abs2(psi[1]));
  const normPhi = Math.sqrt(abs2(phi[0]) + abs2(phi[1]));
  const normalized = Math.abs(normPsi - 1) < 0.01 && Math.abs(normPhi - 1) < 0.01;

  const normalize = (v: [C, C]): [C, C] => {
    const n = Math.sqrt(abs2(v[0]) + abs2(v[1]));
    return n < 1e-9 ? v : [scale(v[0], 1 / n), scale(v[1], 1 / n)];
  };

  // inner-product sum diagram
  const D = 220,
    R = 1.6,
    k = D / (2 * R);
  const X = (x: number) => D / 2 + x * k,
    Y = (y: number) => D / 2 - y * k;

  const setComp = (which: 'psi' | 'phi', i: 0 | 1) => (z: C) => {
    const f = (v: [C, C]): [C, C] => (i === 0 ? [z, v[1]] : [v[0], z]);
    which === 'psi' ? setPsi(f) : setPhi(f);
  };

  const ketRow = (name: string, v: [C, C], which: 'psi' | 'phi', color: string) => (
    <div className="panel" style={{ padding: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ color, fontWeight: 600 }}>
          <Tex>{`|${name}\\rangle`}</Tex>
        </span>
        <span className="faint mono" style={{ fontSize: '0.78rem' }}>
          ‖·‖ = {fx(which === 'psi' ? normPsi : normPhi, 3)}
        </span>
      </div>
      <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
        <ClockInput z={v[0]} onChange={setComp(which, 0)} size={96} label="component 0" />
        <ClockInput z={v[1]} onChange={setComp(which, 1)} size={96} label="component 1" />
      </div>
      <div className="row" style={{ gap: 4, marginTop: 6, justifyContent: 'center' }}>
        {PRESETS.map((p) => (
          <button key={p.name} className="btn small ghost" style={{ padding: '2px 7px' }} onClick={() => (which === 'psi' ? setPsi(p.v) : setPhi(p.v))}>
            {p.name}
          </button>
        ))}
        <button className="btn small" onClick={() => (which === 'psi' ? setPsi(normalize(psi)) : setPhi(normalize(phi)))}>
          normalize
        </button>
      </div>
    </div>
  );

  return (
    <Widget title="Kets, bras and the inner product in ℂ²">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12 }}>
        {ketRow('\\psi', psi, 'psi', '#58c4dd')}
        {ketRow('\\phi', phi, 'phi', '#fcd34d')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,0.9fr) minmax(0,1.1fr)', gap: 14, marginTop: 12, alignItems: 'center' }}>
        <div>
          <div className="faint" style={{ fontSize: '0.8rem', marginBottom: 4 }}>
            The bra <Tex>{'\\langle\\phi|'}</Tex> {noConj ? <b style={{ color: 'var(--red)' }}>(NOT conjugated!)</b> : '(components conjugated: arrows mirrored)'}:
          </div>
          <div className="row" style={{ gap: 6, justifyContent: 'center' }}>
            <ClockInput z={pb[0]} size={70} />
            <ClockInput z={pb[1]} size={70} />
          </div>
          <svg viewBox={`0 0 ${D} ${D}`} style={{ width: '100%', maxWidth: 260, height: 'auto', display: 'block', margin: '6px auto 0' }}>
            <rect width={D} height={D} rx={10} fill="#0d1018" />
            <line x1={0} x2={D} y1={Y(0)} y2={Y(0)} stroke="#2a3346" />
            <line y1={0} y2={D} x1={X(0)} x2={X(0)} stroke="#2a3346" />
            <circle cx={X(0)} cy={Y(0)} r={k} fill="none" stroke="#3a4458" strokeDasharray="3 4" />
            <Arrow x1={X(0)} y1={Y(0)} x2={X(ip.re)} y2={Y(ip.im)} color="#fff" width={3.4} glow />
            <Arrow x1={X(0)} y1={Y(0)} x2={X(t0.re)} y2={Y(t0.im)} color={phaseColor(arg(t0))} width={2.4} />
            <Arrow x1={X(t0.re)} y1={Y(t0.im)} x2={X(ip.re)} y2={Y(ip.im)} color={phaseColor(arg(t1))} width={2.4} />
            <text x={6} y={14} fill="#9aa3b5" fontSize={11}>
              term 0 + term 1 = ⟨φ|ψ⟩ (white)
            </text>
          </svg>
        </div>
        <div className="col" style={{ gap: 8, fontSize: '0.95rem' }}>
          <Tex>{`\\langle\\phi|\\psi\\rangle = ${noConj ? '' : '\\bar'}\\phi_0\\,\\psi_0 + ${noConj ? '' : '\\bar'}\\phi_1\\,\\psi_1`}</Tex>
          <Tex>{`= (${fmt(t0, 2)}) + (${fmt(t1, 2)}) = ${fmt(ip, 3)}`}</Tex>
          <div>
            <Tex>{`|\\langle\\phi|\\psi\\rangle|^2 = ${fx(abs2(ip), 3)}`}</Tex>{' '}
            {normalized && !noConj && <span className="faint" style={{ fontSize: '0.82rem' }}>(both normalized: this is the overlap probability)</span>}
          </div>
          <div style={{ color: noConj && Math.abs(nPsi.im) > 1e-6 ? 'var(--red)' : undefined }}>
            <Tex>{`\\langle\\psi|\\psi\\rangle = ${fmt(nPsi, 3)}`}</Tex>
            {noConj && (Math.abs(nPsi.im) > 1e-6 || nPsi.re < 1e-6) && <span style={{ fontSize: '0.82rem' }}> ← not a sensible squared length!</span>}
          </div>
          <div>
            <Tex>{`\\langle\\phi|\\phi\\rangle = ${fmt(nPhi, 3)}`}</Tex>
          </div>
          {!noConj && (
            <div className="faint" style={{ fontSize: '0.82rem' }}>
              Check conjugate symmetry: <Tex>{`\\langle\\psi|\\phi\\rangle = ${fmt(conj(ip), 3)} = \\overline{\\langle\\phi|\\psi\\rangle}`}</Tex>
            </div>
          )}
          <Toggle label={<span>forget the conjugate (the wrong way)</span>} value={noConj} onChange={setNoConj} />
        </div>
      </div>
    </Widget>
  );
}

type BasisName = 'Z' | 'X' | 'Y' | 'tilted';

/** Components of a qubit state in different orthonormal bases, as inner products. */
export function BasisComponents() {
  const [theta, setTheta] = useState(Math.PI / 3);
  const [ph, setPh] = useState(Math.PI / 2);
  const [basis, setBasis] = useState<BasisName>('X');
  const [tilt, setTilt] = useState(Math.PI / 8);
  const psi: [C, C] = [c(Math.cos(theta / 2)), mul(c(Math.cos(ph), Math.sin(ph)), c(Math.sin(theta / 2)))];
  const s = Math.SQRT1_2;
  const bases: Record<BasisName, { labels: [string, string]; tex: [string, string]; v: [[C, C], [C, C]] }> = {
    Z: { labels: ['0', '1'], tex: ['0', '1'], v: [[c(1), c(0)], [c(0), c(1)]] },
    X: { labels: ['+', '−'], tex: ['+', '-'], v: [[c(s), c(s)], [c(s), c(-s)]] },
    Y: { labels: ['+i', '−i'], tex: ['{+i}', '{-i}'], v: [[c(s), c(0, s)], [c(s), c(0, -s)]] },
    tilted: {
      labels: ['a', 'b'],
      tex: ['a', 'b'],
      v: [
        [c(Math.cos(tilt)), c(Math.sin(tilt))],
        [c(-Math.sin(tilt)), c(Math.cos(tilt))],
      ],
    },
  };
  const B = bases[basis];
  const ipf = (b: [C, C], v: [C, C]) => add(mul(conj(b[0]), v[0]), mul(conj(b[1]), v[1]));
  const comps = [ipf(B.v[0], psi), ipf(B.v[1], psi)];
  const tot = abs2(comps[0]) + abs2(comps[1]);
  return (
    <Widget title="Components are inner products">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
        <div className="col" style={{ gap: 6 }}>
          <div className="faint" style={{ fontSize: '0.8rem' }}>Choose a normalized state:</div>
          <Slider label={<Tex>{'\\theta'}</Tex>} value={theta} min={0} max={Math.PI} step={Math.PI / 48} onChange={setTheta} format={fmtPi} />
          <Slider label={<Tex>{'\\varphi'}</Tex>} value={ph} min={0} max={2 * Math.PI} step={Math.PI / 48} onChange={setPh} format={fmtPi} />
          <div style={{ fontSize: '0.95rem' }}>
            <Tex>{`|\\psi\\rangle = ${fmt(psi[0], 3)}\\,|0\\rangle + (${fmt(psi[1], 3)})\\,|1\\rangle`}</Tex>
          </div>
          <div className="faint" style={{ fontSize: '0.8rem', marginTop: 8 }}>Measure it against the basis:</div>
          <Segmented<BasisName>
            options={[
              { value: 'Z', label: '{|0⟩,|1⟩}' },
              { value: 'X', label: '{|+⟩,|−⟩}' },
              { value: 'Y', label: '{|+i⟩,|−i⟩}' },
              { value: 'tilted', label: 'tilted' },
            ]}
            value={basis}
            onChange={setBasis}
          />
          {basis === 'tilted' && <Slider label="tilt" value={tilt} min={0} max={Math.PI} step={Math.PI / 48} onChange={setTilt} format={fmtPi} />}
        </div>
        <div className="col" style={{ gap: 8 }}>
          <AmplitudeView amps={comps} labels={B.labels} />
          <div style={{ fontSize: '0.92rem' }}>
            <Tex>{`\\langle ${B.tex[0]}|\\psi\\rangle = ${fmt(comps[0], 3)}`}</Tex>
            <br />
            <Tex>{`\\langle ${B.tex[1]}|\\psi\\rangle = ${fmt(comps[1], 3)}`}</Tex>
          </div>
          <div className="faint" style={{ fontSize: '0.85rem' }}>
            <Tex>{`|c_0|^2 + |c_1|^2 = ${fx(abs2(comps[0]), 3)} + ${fx(abs2(comps[1]), 3)} = ${fx(tot, 3)}`}</Tex>
          </div>
          <div className="faint" style={{ fontSize: '0.82rem' }}>
            Reassemble: <Tex>{`|\\psi\\rangle = c_0 |${B.tex[0]}\\rangle + c_1 |${B.tex[1]}\\rangle`}</Tex>. Same vector, different coordinates.
          </div>
        </div>
      </div>
    </Widget>
  );
}
