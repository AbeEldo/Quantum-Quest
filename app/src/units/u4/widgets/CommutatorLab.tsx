import React, { useState } from 'react';
import { Widget, Tex } from '../../../components/ui';
import { c, sub, matMul, type C } from '../../../engine/complex';
import { texMat } from './spin';

const s2 = Math.SQRT1_2;
const MATS: Record<string, { tex: string; m: C[][] }> = {
  X: { tex: '\\sigma_x', m: [[c(0), c(1)], [c(1), c(0)]] },
  Y: { tex: '\\sigma_y', m: [[c(0), c(0, -1)], [c(0, 1), c(0)]] },
  Z: { tex: '\\sigma_z', m: [[c(1), c(0)], [c(0), c(-1)]] },
  I: { tex: 'I', m: [[c(1), c(0)], [c(0), c(1)]] },
  H: { tex: 'H', m: [[c(s2), c(s2)], [c(s2), c(-s2)]] },
  P0: { tex: '|0\\rangle\\langle 0|', m: [[c(1), c(0)], [c(0), c(0)]] },
  E: { tex: '\\mathcal{E}', m: [[c(2), c(0)], [c(0), c(5)]] },
};
const NAMES = Object.keys(MATS);

const isZero = (m: C[][]) => m.every((r) => r.every((z) => Math.abs(z.re) < 1e-9 && Math.abs(z.im) < 1e-9));

/** Pick two observables; see AB, BA and the commutator [A,B] = AB − BA. */
export function CommutatorLab() {
  const [a, setA] = useState('X');
  const [b, setB] = useState('Y');
  const A = MATS[a].m, B = MATS[b].m;
  const AB = matMul(A, B), BA = matMul(B, A);
  const comm = AB.map((row, i) => row.map((z, j) => sub(z, BA[i][j])));
  const commutes = isZero(comm);
  const pick = (cur: string, set: (s: string) => void, color: string) => (
    <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
      {NAMES.map((n) => (
        <button
          key={n}
          className="btn small"
          style={{ borderColor: cur === n ? color : undefined, color: cur === n ? color : undefined, minWidth: 44 }}
          onClick={() => set(n)}
        >
          <Tex>{MATS[n].tex}</Tex>
        </button>
      ))}
    </div>
  );
  return (
    <Widget title="Commutator lab — does the order matter?">
      <div className="col" style={{ gap: 8 }}>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <b style={{ color: 'var(--blue)', width: 22 }}>A</b>
          {pick(a, setA, 'var(--blue)')}
        </div>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <b style={{ color: 'var(--pink)', width: 22 }}>B</b>
          {pick(b, setB, 'var(--pink)')}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginTop: 6 }}>
          <div className="panel center" style={{ padding: 8 }}>
            <div className="faint" style={{ fontSize: '0.8rem' }}>AB</div>
            <Tex display>{texMat(AB)}</Tex>
          </div>
          <div className="panel center" style={{ padding: 8 }}>
            <div className="faint" style={{ fontSize: '0.8rem' }}>BA</div>
            <Tex display>{texMat(BA)}</Tex>
          </div>
          <div className="panel center" style={{ padding: 8, borderColor: commutes ? 'var(--green)' : 'var(--orange)' }}>
            <div className="faint" style={{ fontSize: '0.8rem' }}>[A, B] = AB − BA</div>
            <Tex display>{texMat(comm)}</Tex>
          </div>
        </div>
        <div
          key={a + b}
          className="pop panel"
          style={{ padding: 10, borderColor: commutes ? 'var(--green)' : 'var(--orange)', color: commutes ? 'var(--green)' : 'var(--orange)' }}
        >
          {commutes ? (
            <>
              ✓ <b>They commute.</b> <span className="dim">They share a full set of eigenvectors, so both can have sharp values at the same time — they are <b>compatible</b>.</span>
            </>
          ) : (
            <>
              ✗ <b>They don't commute.</b>{' '}
              <span className="dim">There is no basis of states in which both have definite values — they are <b>incompatible</b>, and an uncertainty relation links their spreads.</span>
            </>
          )}
        </div>
        <div className="faint" style={{ fontSize: '0.8rem' }}>
          <Tex>{'\\mathcal{E} = \\mathrm{diag}(2,5)'}</Tex> is an "energy" observable that is diagonal in the{' '}
          <Tex>{'\\{|0\\rangle,|1\\rangle\\}'}</Tex> basis. Try it against <Tex>{'\\sigma_z'}</Tex> and against <Tex>{'\\sigma_x'}</Tex>.
        </div>
      </div>
    </Widget>
  );
}
