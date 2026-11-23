import React, { useMemo, useState } from 'react';
import { Widget, Segmented } from '../../../components/ui';
import { shorCode, steaneCode, repetitionCode, syndromeOf, synKey, buildLookup, outcome, pauliString, weight, type Pauli, type StabilizerCode, I0 } from '../engine/codes';

type CodeKey = 'shor' | 'steane' | 'bit3' | 'phase3';
const CODES: Record<CodeKey, () => StabilizerCode> = {
  shor: shorCode,
  steane: steaneCode,
  bit3: () => repetitionCode(3, 'bit'),
  phase3: () => repetitionCode(3, 'phase'),
};
const LABEL: Record<CodeKey, string> = { shor: "Shor [[9,1,3]]", steane: 'Steane [[7,1,3]]', bit3: '3-qubit bit-flip', phase3: '3-qubit phase-flip' };

const PCOL: Record<string, string> = { X: '#fc6255', Z: '#58c4dd', Y: '#b48ce0', I: '#3a4256' };
const CYCLE = ['I', 'X', 'Z', 'Y'] as const;

function getP(p: Pauli, q: number): 'I' | 'X' | 'Y' | 'Z' {
  const x = (p.x >> q) & 1, z = (p.z >> q) & 1;
  return x && z ? 'Y' : x ? 'X' : z ? 'Z' : 'I';
}
function setP(p: Pauli, q: number, t: 'I' | 'X' | 'Y' | 'Z'): Pauli {
  const m = 1 << q;
  let x = p.x & ~m, z = p.z & ~m;
  if (t === 'X' || t === 'Y') x |= m;
  if (t === 'Z' || t === 'Y') z |= m;
  return { x, z };
}

/** Click qubits to inject Pauli errors; see which stabilizer generators light up and what the decoder does. */
export function StabilizerExplorer({ initial = 'shor' }: { initial?: CodeKey }) {
  const [key, setKey] = useState<CodeKey>(initial);
  const code = useMemo(() => CODES[key](), [key]);
  const table = useMemo(() => buildLookup(code, key === 'bit3' ? ['X'] : key === 'phase3' ? ['Z'] : ['X', 'Y', 'Z'], 2), [code, key]);
  const [err, setErr] = useState<Pauli>(I0);
  const syn = syndromeOf(code, err);
  const corr = table.get(synKey(syn));
  const res = corr ? outcome(code, err, corr) : 'detected';
  const n = code.n;

  const click = (q: number) => {
    const cur = getP(err, q);
    const next = CYCLE[(CYCLE.indexOf(cur) + 1) % 4];
    setErr(setP(err, q, next));
  };

  const blocks = key === 'shor' ? [[0, 1, 2], [3, 4, 5], [6, 7, 8]] : [Array.from({ length: n }, (_, i) => i)];
  const w = weight(err);

  return (
    <Widget title="Stabilizer explorer: errors, syndromes, corrections">
      <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <Segmented value={key} onChange={(k) => { setKey(k); setErr(I0); }} options={(Object.keys(CODES) as CodeKey[]).map((k) => ({ value: k, label: LABEL[k] }))} />
        <button className="btn small ghost" onClick={() => setErr(I0)}>clear errors</button>
      </div>
      <div className="faint" style={{ fontSize: '0.85rem', marginBottom: 6 }}>
        Click a qubit to cycle its error: none → <b style={{ color: PCOL.X }}>X</b> → <b style={{ color: PCOL.Z }}>Z</b> → <b style={{ color: PCOL.Y }}>Y</b>.
      </div>
      <div className="row" style={{ gap: 18, flexWrap: 'wrap', marginBottom: 10 }}>
        {blocks.map((b, bi) => (
          <div key={bi} className="row" style={{ gap: 6, padding: 6, borderRadius: 10, border: key === 'shor' ? '1px dashed var(--border)' : 'none' }}>
            {b.map((q) => {
              const t = getP(err, q);
              const c = corr ? getP(corr, q) : 'I';
              return (
                <button
                  key={q}
                  onClick={() => click(q)}
                  style={{
                    width: 46, height: 46, borderRadius: 23, cursor: 'pointer', position: 'relative',
                    border: `2px solid ${t === 'I' ? '#4a5368' : PCOL[t]}`,
                    background: t === 'I' ? '#141821' : `${PCOL[t]}33`,
                    color: t === 'I' ? '#9aa3b5' : PCOL[t],
                    fontWeight: 700, fontFamily: 'var(--serif)', fontSize: '1rem',
                    boxShadow: t !== 'I' ? `0 0 10px ${PCOL[t]}` : 'none', transition: 'all .15s',
                  }}
                  title={`qubit ${q}`}
                >
                  {t === 'I' ? q : t}
                  {c !== 'I' && (
                    <span style={{ position: 'absolute', top: -8, right: -8, fontSize: '0.65rem', background: 'var(--green)', color: '#111', borderRadius: 8, padding: '0 4px' }}>
                      fix {c}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr>
              <th style={th}>generator</th>
              {Array.from({ length: n }, (_, q) => (
                <th key={q} style={{ ...th, textAlign: 'center', width: 28 }} className="mono">{q}</th>
              ))}
              <th style={th}>outcome</th>
            </tr>
          </thead>
          <tbody>
            {code.stabilizers.map((s, i) => (
              <tr key={i} style={{ background: syn[i] ? 'rgba(252,211,77,.10)' : undefined, transition: 'background .2s' }}>
                <td style={td} className="mono">{code.labels[i]}</td>
                {Array.from({ length: n }, (_, q) => {
                  const t = getP(s, q);
                  return (
                    <td key={q} style={{ ...td, textAlign: 'center', color: PCOL[t], fontWeight: t === 'I' ? 400 : 700, fontFamily: 'var(--serif)' }}>
                      {t === 'I' ? '·' : t}
                    </td>
                  );
                })}
                <td style={{ ...td, fontWeight: 700, color: syn[i] ? 'var(--yellow)' : 'var(--text-faint)' }} className="mono">{syn[i] ? '−1 ⚠' : '+1'}</td>
              </tr>
            ))}
            <tr>
              <td style={{ ...td, color: 'var(--pink)' }} className="mono">logical X̄</td>
              {Array.from({ length: n }, (_, q) => {
                const t = getP(code.logicalX, q);
                return <td key={q} style={{ ...td, textAlign: 'center', color: PCOL[t], opacity: 0.7, fontFamily: 'var(--serif)' }}>{t === 'I' ? '·' : t}</td>;
              })}
              <td style={td}></td>
            </tr>
            <tr>
              <td style={{ ...td, color: 'var(--pink)' }} className="mono">logical Z̄</td>
              {Array.from({ length: n }, (_, q) => {
                const t = getP(code.logicalZ, q);
                return <td key={q} style={{ ...td, textAlign: 'center', color: PCOL[t], opacity: 0.7, fontFamily: 'var(--serif)' }}>{t === 'I' ? '·' : t}</td>;
              })}
              <td style={td}></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="panel" style={{ marginTop: 10, padding: 10, borderColor: w === 0 ? 'var(--border)' : res === 'ok' ? 'var(--green)' : 'var(--red)' }}>
        {w === 0 ? (
          <span className="faint">No errors. Every generator reports +1: we're in the code space.</span>
        ) : (
          <>
            <div>
              Error <span className="mono">{pauliString(err, n)}</span> (weight {w}) → syndrome <span className="mono" style={{ color: 'var(--yellow)' }}>{syn.join('')}</span> → decoder applies{' '}
              <span className="mono" style={{ color: 'var(--green)' }}>{corr ? pauliString(corr, n) : '??'}</span>
            </div>
            <div style={{ marginTop: 4, fontWeight: 600, color: res === 'ok' ? 'var(--green)' : 'var(--red)' }}>
              {res === 'ok'
                ? corr && (corr.x !== err.x || corr.z !== err.z)
                  ? '✓ Corrected, even though the decoder\'s fix differs from the actual error! Error × fix is a stabilizer, which acts trivially on the code space (degeneracy).'
                  : '✓ Corrected: the logical information is intact.'
                : res === 'logical'
                  ? '✗ Logical error! The decoder\'s "fix" combined with the real error is a logical operator. Too many errors for this code.'
                  : '✗ This syndrome is not in the decoder\'s table (too many errors).'}
            </div>
          </>
        )}
      </div>
    </Widget>
  );
}

const th: React.CSSProperties = { textAlign: 'left', padding: '3px 8px', borderBottom: '1px solid var(--border)', color: 'var(--text-dim)', fontWeight: 500 };
const td: React.CSSProperties = { padding: '3px 8px', borderBottom: '1px solid #20263a' };
