import React, { useEffect, useState } from 'react';
import { BlochSphere, vecFromAngles, anglesFromVec } from '../../../widgets/BlochSphere';
import { Widget, Tex, Segmented, Slider, fmtPi } from '../../../components/ui';
import { useChallengeGate } from '../../../components/lesson/gates';
import { useProgress } from '../../../state/progress';

type Pair = 'XY' | 'YZ' | 'ZX';
const COLORS = { X: '#fc6255', Y: '#83c167', Z: '#58c4dd' };

function Bar({ label, value, max = 1, color, marker }: { label: React.ReactNode; value: number; max?: number; color: string; marker?: number }) {
  return (
    <div className="row" style={{ gap: 8 }}>
      <span style={{ width: 92, fontSize: '0.9rem' }}>{label}</span>
      <div style={{ position: 'relative', flex: 1, height: 14, background: 'var(--panel-2)', borderRadius: 7, border: '1px solid var(--border)' }}>
        <div style={{ width: `${Math.min(1, value / max) * 100}%`, height: '100%', background: color, borderRadius: 7, transition: 'width .12s' }} />
        {marker !== undefined && (
          <div style={{ position: 'absolute', top: -4, bottom: -4, left: `calc(${Math.min(1, marker / max) * 100}% - 1px)`, width: 2, background: '#fff' }} />
        )}
      </div>
      <span className="mono" style={{ width: 48, textAlign: 'right', fontSize: '0.85rem' }}>
        {value.toFixed(3)}
      </span>
    </div>
  );
}

/**
 * Drag a spin state around the Bloch sphere and watch the three spreads Δσx, Δσy, Δσz.
 * Robertson: Δσx Δσy ≥ ½|⟨[σx,σy]⟩| = |⟨σz⟩|. Sum rule for pure states: Σ (Δσi)² = 2.
 * Optional challenge: make all three spreads equal.
 */
export function UncertaintyExplorer({ challengeId }: { challengeId?: string }) {
  const [theta, setTheta] = useState(0.5);
  const [phi, setPhi] = useState(0.3);
  const [pair, setPair] = useState<Pair>('XY');
  const r = vecFromAngles(theta, phi);
  const d = { X: Math.sqrt(Math.max(0, 1 - r[0] ** 2)), Y: Math.sqrt(Math.max(0, 1 - r[1] ** 2)), Z: Math.sqrt(Math.max(0, 1 - r[2] ** 2)) };
  const [A, B] = pair.split('') as ('X' | 'Y' | 'Z')[];
  const C = (['X', 'Y', 'Z'] as const).find((k) => k !== A && k !== B)!;
  const prod = d[A] * d[B];
  const bound = Math.abs(r[{ X: 0, Y: 1, Z: 2 }[C]]);
  const saturated = Math.abs(prod - bound) < 0.0015;
  const sum = d.X ** 2 + d.Y ** 2 + d.Z ** 2;

  const equal = Math.max(d.X, d.Y, d.Z) - Math.min(d.X, d.Y, d.Z) < 0.03;
  const recordQuiz = useProgress((s) => s.recordQuiz);
  const solvedBefore = useProgress((s) => (challengeId ? !!s.quizzes[`unc:${challengeId}`]?.correct : false));
  const [solved, setSolved] = useState(false);
  useChallengeGate(challengeId ?? 'unc-none', !challengeId || solved || solvedBefore);
  useEffect(() => {
    if (challengeId && equal && !solved) {
      setSolved(true);
      recordQuiz(`unc:${challengeId}`, true, 25);
    }
  }, [equal]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Widget title="Uncertainty on the Bloch sphere">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.05fr)', gap: 16, alignItems: 'start' }}>
        <div>
          <BlochSphere
            vector={r}
            onDrag={(v) => {
              const a = anglesFromVec(v);
              setTheta(a.theta);
              setPhi(a.phi);
            }}
            vectors={[
              { v: [r[0], 0, 0], color: COLORS.X },
              { v: [0, r[1], 0], color: COLORS.Y },
              { v: [0, 0, r[2]], color: COLORS.Z },
            ]}
            height={300}
          />
          <Slider label={<Tex>{'\\theta'}</Tex>} value={theta} min={0} max={Math.PI} step={Math.PI / 96} onChange={setTheta} format={fmtPi} />
          <Slider label={<Tex>{'\\phi'}</Tex>} value={phi} min={0} max={2 * Math.PI} step={Math.PI / 96} onChange={setPhi} format={fmtPi} />
        </div>
        <div className="col" style={{ gap: 10 }}>
          <div className="faint" style={{ fontSize: '0.82rem' }}>
            Coloured arrows: the projections <Tex>{'\\langle\\sigma_x\\rangle,\\langle\\sigma_y\\rangle,\\langle\\sigma_z\\rangle'}</Tex>. A spread is zero only when
            the state lies along that axis: <Tex>{'\\Delta\\sigma_i = \\sqrt{1-\\langle\\sigma_i\\rangle^2}'}</Tex>.
          </div>
          <Bar label={<span style={{ color: COLORS.X }}>Δσx</span>} value={d.X} color={COLORS.X} />
          <Bar label={<span style={{ color: COLORS.Y }}>Δσy</span>} value={d.Y} color={COLORS.Y} />
          <Bar label={<span style={{ color: COLORS.Z }}>Δσz</span>} value={d.Z} color={COLORS.Z} />
          <div className="mono faint" style={{ fontSize: '0.82rem' }}>
            (Δσx)² + (Δσy)² + (Δσz)² = {sum.toFixed(3)}
          </div>
          <div className="panel" style={{ padding: 10 }}>
            <div className="row" style={{ gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <span className="faint" style={{ fontSize: '0.85rem' }}>Robertson check for</span>
              <Segmented
                options={[
                  { value: 'XY', label: 'σx, σy' },
                  { value: 'YZ', label: 'σy, σz' },
                  { value: 'ZX', label: 'σz, σx' },
                ]}
                value={pair}
                onChange={setPair}
              />
            </div>
            <Tex display>{`\\Delta\\sigma_${A.toLowerCase()}\\,\\Delta\\sigma_${B.toLowerCase()} \\;\\ge\\; \\tfrac12\\left|\\langle[\\sigma_${A.toLowerCase()},\\sigma_${B.toLowerCase()}]\\rangle\\right| = |\\langle\\sigma_${C.toLowerCase()}\\rangle|`}</Tex>
            <Bar label="product" value={prod} color="var(--yellow)" marker={bound} />
            <Bar label="bound" value={bound} color="var(--text-faint)" />
            <div style={{ fontSize: '0.85rem', marginTop: 6, color: saturated ? 'var(--teal)' : 'var(--text-dim)' }}>
              {saturated ? '◆ Saturated: the product sits exactly on the bound (the white tick).' : '✓ Inequality satisfied — the product is above the white tick.'}
            </div>
          </div>
          {challengeId && (
            <div className="panel" style={{ padding: 10, borderColor: solved || solvedBefore ? 'var(--green)' : 'var(--yellow)' }}>
              <b style={{ color: solved || solvedBefore ? 'var(--green)' : 'var(--yellow)' }}>
                {solved || solvedBefore ? '✓ Balanced! ' : '🎯 Challenge: '}
              </b>
              <span className="dim">
                {solved || solvedBefore
                  ? `All three spreads ≈ ${Math.sqrt(2 / 3).toFixed(3)} = √(2/3). The sum rule forces this value: three equal squares adding to 2.`
                  : 'Find a state where Δσx, Δσy and Δσz are all equal (within 0.03).'}
              </span>
            </div>
          )}
        </div>
      </div>
    </Widget>
  );
}
