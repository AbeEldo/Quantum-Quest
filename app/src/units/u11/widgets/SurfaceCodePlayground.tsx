import React, { useMemo, useRef, useState } from 'react';
import { Widget, Segmented, Slider, Toggle } from '../../../components/ui';
import { mulberry32 } from '../../../engine/qsim';
import { makeSurfaceCode, defects, decodeMWPM, isLogicalFlip, xorArr, weightOf, syndrome, type Matching } from '../engine/surface';
import { SurfaceLattice, XCOL, ZCOL } from './SurfaceLattice';

type Mode = 'X' | 'Z' | 'Y';

/** Inject errors on a rotated surface code, watch syndrome defects appear in pairs, and run a matching decoder. */
export function SurfaceCodePlayground() {
  const [d, setD] = useState(5);
  const code = useMemo(() => makeSurfaceCode(d), [d]);
  const [mode, setMode] = useState<Mode>('X');
  const [xe, setXe] = useState<Uint8Array>(() => new Uint8Array(25));
  const [ze, setZe] = useState<Uint8Array>(() => new Uint8Array(25));
  const [dec, setDec] = useState<{ x: Matching; z: Matching } | null>(null);
  const [applied, setApplied] = useState(false);
  const [showLogical, setShowLogical] = useState(false);
  const [p, setP] = useState(0.06);
  const rng = useRef(mulberry32(3));

  const reset = (nd = d) => {
    setXe(new Uint8Array(nd * nd));
    setZe(new Uint8Array(nd * nd));
    setDec(null);
    setApplied(false);
  };

  const xx = applied && dec ? xorArr(xe, dec.x.correction) : xe;
  const zz = applied && dec ? xorArr(ze, dec.z.correction) : ze;
  const defX = defects(code, 'X', xx); // Z-checks lit by X errors
  const defZ = defects(code, 'Z', zz); // X-checks lit by Z errors
  const lit = new Set([...defX, ...defZ]);
  const logX = applied && dec ? isLogicalFlip(code, 'X', xx) : false;
  const logZ = applied && dec ? isLogicalFlip(code, 'Z', zz) : false;

  const click = (q: number) => {
    if (applied) return;
    setDec(null);
    if (mode === 'X' || mode === 'Y') setXe((a) => { const b = a.slice(); b[q] ^= 1; return b; });
    if (mode === 'Z' || mode === 'Y') setZe((a) => { const b = a.slice(); b[q] ^= 1; return b; });
  };

  const sprinkle = () => {
    const nx = new Uint8Array(code.n), nz = new Uint8Array(code.n);
    for (let q = 0; q < code.n; q++) {
      const r = rng.current();
      // depolarizing-style: X, Y, Z each with p/3
      if (r < p / 3) nx[q] = 1;
      else if (r < (2 * p) / 3) nz[q] = 1;
      else if (r < p) { nx[q] = 1; nz[q] = 1; }
    }
    setXe(nx);
    setZe(nz);
    setDec(null);
    setApplied(false);
  };

  const decode = () => {
    setDec({ x: decodeMWPM(code, 'X', defects(code, 'X', xe)), z: decodeMWPM(code, 'Z', defects(code, 'Z', ze)) });
  };

  const pairs = dec && !applied ? [...dec.x.pairs.map(([a, b]) => ({ a, b, color: ZCOL })), ...dec.z.pairs.map(([a, b]) => ({ a, b, color: XCOL }))] : undefined;
  const nErr = weightOf(xe.map((v, i) => v | ze[i]));

  return (
    <Widget title="Surface code playground">
      <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <Segmented value={d} onChange={(v) => { setD(v); reset(v); }} options={[3, 5, 7].map((v) => ({ value: v, label: `d = ${v}` }))} />
        <span className="faint" style={{ fontSize: '0.82rem' }}>click adds:</span>
        <Segmented value={mode} onChange={setMode} options={[{ value: 'X', label: 'X error' }, { value: 'Z', label: 'Z error' }, { value: 'Y', label: 'Y error' }]} />
        <Toggle label="show logical operators" value={showLogical} onChange={setShowLogical} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) minmax(220px, 0.9fr)', gap: 16, alignItems: 'start' }}>
        <SurfaceLattice code={code} xErr={xe} zErr={ze} lit={lit} pairs={pairs} xCorr={dec && !applied ? dec.x.correction : undefined} zCorr={dec && !applied ? dec.z.correction : undefined} showLogical={showLogical} onQubit={click} size={380} glow={logX || logZ ? Array.from({ length: code.n }, (_, q) => q).filter((q) => (logX && xx[q]) || (logZ && zz[q])) : undefined} />
        <div className="col" style={{ gap: 8 }}>
          <div style={{ fontSize: '0.88rem' }}>
            <span style={{ color: ZCOL }}>■</span> Z-checks (catch X errors) &nbsp; <span style={{ color: XCOL }}>■</span> X-checks (catch Z errors)
          </div>
          <div className="mono" style={{ fontSize: '0.85rem' }}>
            {code.n} data qubits · {code.plaquettes.length} checks · {nErr} qubit{nErr === 1 ? '' : 's'} with errors · {lit.size} defect{lit.size === 1 ? '' : 's'}
          </div>
          <Slider label="random error rate p" value={p} min={0.01} max={0.25} step={0.01} onChange={setP} format={(x) => `${(x * 100).toFixed(0)}%`} />
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <button className="btn small" onClick={sprinkle}>🎲 random errors</button>
            <button className="btn small primary" disabled={applied || lit.size === 0} onClick={decode}>🧩 decode (matching)</button>
            <button className="btn small gold" disabled={!dec || applied} onClick={() => setApplied(true)}>✚ apply correction</button>
            <button className="btn small ghost" onClick={() => reset()}>clear</button>
          </div>
          {dec && !applied && (
            <div className="faint" style={{ fontSize: '0.84rem' }}>
              The decoder paired the defects (dashed lines) using the fewest flips: {dec.x.weight} X-flip{dec.x.weight === 1 ? '' : 's'} and {dec.z.weight} Z-flip{dec.z.weight === 1 ? '' : 's'}. Green rings mark the
              qubits it will flip.
            </div>
          )}
          {applied && (
            <div className="panel pop" style={{ padding: 10, borderColor: logX || logZ ? 'var(--red)' : 'var(--green)' }}>
              {logX || logZ ? (
                <>
                  <b style={{ color: 'var(--red)' }}>✗ Logical error!</b> The error plus the correction forms a chain stretching across the whole lattice
                  {logX ? ' (top to bottom: a logical X̄)' : ''}
                  {logZ ? ' (left to right: a logical Z̄)' : ''}. No check can see it, and the stored qubit has been flipped.
                </>
              ) : (
                <>
                  <b style={{ color: 'var(--green)' }}>✓ Success.</b> All defects are gone, and what remains of error × correction is a product of stabilizers (closed loops), which does nothing to
                  the logical qubit.
                </>
              )}
              <div style={{ marginTop: 6 }}>
                <button className="btn small" onClick={sprinkle}>try another</button>
              </div>
            </div>
          )}
          {!dec && !applied && lit.size === 0 && nErr > 0 && syndrome(code, 'X', xe).every((v) => !v) && (
            <div className="faint" style={{ fontSize: '0.84rem' }}>No defects even though there are errors. Either they form closed loops (harmless stabilizers) or a chain across the lattice: a logical operator!</div>
          )}
        </div>
      </div>
    </Widget>
  );
}
