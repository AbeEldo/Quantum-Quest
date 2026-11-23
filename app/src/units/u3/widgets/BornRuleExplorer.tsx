import React, { useRef, useState } from 'react';
import { Widget, Segmented, Toggle, Slider, useAnimationFrame } from '../../../components/ui';
import { useChallengeGate } from '../../../components/lesson/gates';
import { easeInOut } from '../../u2/widgets/canvas';

type Basis = 'z' | 'x' | 'tilt';
const DEG = Math.PI / 180;

/** Normalise an angle to (−90°, 90°] — states differing by a sign (α vs α+180°) are the same state. */
const wrap = (a: number) => {
  let x = a;
  while (x > Math.PI / 2) x -= Math.PI;
  while (x <= -Math.PI / 2) x += Math.PI;
  return x;
};

/**
 * Real-amplitude qubit states as unit vectors in a plane: |ψ⟩ = cos α|0⟩ + sin α|1⟩.
 * Pick a measurement basis (an orthogonal pair of axes); probabilities are squared projections.
 * Measure once (collapse) or many fresh copies (statistics). Optional polarization labels and Bloch-angle view.
 */
export function BornRuleExplorer({
  initialAlpha = 30,
  showBloch = true,
  allowPolarization = true,
  challengeId,
}: {
  initialAlpha?: number;
  showBloch?: boolean;
  allowPolarization?: boolean;
  /** challenge: find a basis in which the current state gives a 100% certain outcome */
  challengeId?: string;
}) {
  const [alpha, setAlpha] = useState(initialAlpha * DEG); // prepared state
  const [shown, setShown] = useState(initialAlpha * DEG); // displayed (after collapse)
  const [basis, setBasis] = useState<Basis>('z');
  const [beta, setBeta] = useState(60 * DEG);
  const [pol, setPol] = useState(false);
  const [counts, setCounts] = useState<[number, number]>([0, 0]);
  const [log, setLog] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const anim = useRef<{ from: number; to: number; t: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const [, tick] = useState(0);

  const b0 = basis === 'z' ? 0 : basis === 'x' ? 45 * DEG : beta; // angle of first basis vector
  const b1 = b0 + 90 * DEG;
  const amp0 = Math.cos(shown - b0); // ⟨b0|ψ⟩
  const amp1 = Math.cos(shown - b1); // ⟨b1|ψ⟩
  const p0 = amp0 * amp0, p1 = amp1 * amp1;

  const certain = Math.max(p0, p1) > 0.995 && (!challengeId || basis === 'tilt');
  useChallengeGate(challengeId ?? 'born-none', challengeId ? certain && !collapsed : true);

  useAnimationFrame((dt) => {
    const a = anim.current;
    if (!a) return;
    a.t += dt / 0.45;
    const f = Math.min(1, a.t);
    setShown(a.from + (a.to - a.from) * easeInOut(f));
    if (f >= 1) anim.current = null;
    tick((k) => k + 1);
  }, true);

  const labels = (() => {
    if (basis === 'z') return pol ? ['H', 'V'] : ['|0⟩', '|1⟩'];
    if (basis === 'x') return pol ? ['D', 'A'] : ['|+⟩', '|−⟩'];
    return pol ? [`${Math.round(b0 / DEG)}°`, `${Math.round(b1 / DEG)}°`] : ['|b₀⟩', '|b₁⟩'];
  })();

  const measureOnce = () => {
    const outcome = Math.random() < p0 ? 0 : 1;
    // collapse onto ±basis vector nearest to the current vector (sign = global phase, irrelevant)
    let target = outcome === 0 ? b0 : b1;
    if (Math.cos(target - shown) < 0) target += Math.PI;
    // choose the shortest rotation path
    while (target - shown > Math.PI) target -= 2 * Math.PI;
    while (target - shown < -Math.PI) target += 2 * Math.PI;
    anim.current = { from: shown, to: target, t: 0 };
    setCollapsed(true);
    setLog((l) => [labels[outcome], ...l].slice(0, 14));
  };
  const reprepare = () => {
    anim.current = { from: shown, to: alpha, t: 0 };
    setCollapsed(false);
    setLog([]);
  };
  const measureMany = (m: number) => {
    let c0 = 0;
    for (let i = 0; i < m; i++) if (Math.random() < p0) c0++;
    setCounts(([a, b]) => [a + c0, b + m - c0]);
  };

  // SVG geometry
  const S = 300, C = S / 2, R = 112;
  const pt = (ang: number, r = R): [number, number] => [C + r * Math.cos(ang), C - r * Math.sin(ang)];
  const [tx, ty] = pt(shown);

  const onPointer = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const svg = svgRef.current!;
    const r = svg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * S - C;
    const y = -(((e.clientY - r.top) / r.height) * S - C);
    let a = Math.atan2(y, x);
    a = Math.round(a / DEG) * DEG;
    anim.current = null;
    setAlpha(a);
    setShown(a);
    setCollapsed(false);
    setCounts([0, 0]);
    setLog([]);
  };

  const proj = (b: number, amp: number, col: string, label: string) => {
    const [px, py] = pt(b, R * amp);
    const [ex, ey] = pt(b, R + 22);
    const [nx, ny] = pt(b + Math.PI, R + 4);
    const [ex2, ey2] = pt(b, R + 4);
    return (
      <g>
        <line x1={nx} y1={ny} x2={ex2} y2={ey2} stroke={col} strokeOpacity={0.35} strokeWidth={1.5} />
        <line x1={C} y1={C} x2={px} y2={py} stroke={col} strokeWidth={6} strokeOpacity={0.75} strokeLinecap="round" />
        <line x1={tx} y1={ty} x2={px} y2={py} stroke={col} strokeDasharray="4 3" strokeWidth={1.2} />
        <text x={ex} y={ey + 4} textAnchor="middle" fill={col} fontSize={14} fontWeight={700}>
          {label}
        </text>
      </g>
    );
  };

  const totalC = counts[0] + counts[1];
  const blochTheta = 2 * wrap(shown); // polar angle on the Bloch sphere (x–z plane)

  return (
    <Widget title={pol ? 'Polarization states as vectors' : 'States as vectors: the Born rule'}>
      <div style={{ display: 'grid', gridTemplateColumns: showBloch ? 'minmax(240px, 1.2fr) minmax(200px, 1fr)' : '1fr', gap: 16, alignItems: 'start' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${S} ${S}`}
          style={{ width: '100%', maxWidth: 380, height: 'auto', touchAction: 'none', userSelect: 'none', justifySelf: 'center' }}
          onPointerMove={onPointer}
          onPointerUp={() => (dragging.current = false)}
          onPointerLeave={() => (dragging.current = false)}
        >
          <rect x={0} y={0} width={S} height={S} rx={10} fill="#0a0d14" />
          <circle cx={C} cy={C} r={R} fill="none" stroke="#2a3142" />
          {proj(b0, amp0, '#83c167', labels[0])}
          {proj(b1, amp1, '#e07ab6', labels[1])}
          {/* state vector */}
          <line x1={C} y1={C} x2={tx} y2={ty} stroke="#fcd34d" strokeWidth={3.5} strokeLinecap="round" />
          {pol && <line x1={C} y1={C} x2={2 * C - tx} y2={2 * C - ty} stroke="#fcd34d" strokeWidth={3.5} strokeOpacity={0.5} strokeLinecap="round" />}
          <circle
            cx={tx}
            cy={ty}
            r={11}
            fill="#fcd34d"
            fillOpacity={0.25}
            stroke="#fcd34d"
            style={{ cursor: 'grab' }}
            onPointerDown={(e) => {
              dragging.current = true;
              (e.target as Element).setPointerCapture?.(e.pointerId);
            }}
          />
          <text x={tx + 14} y={ty - 10} fill="#fcd34d" fontSize={14} fontWeight={700}>
            {pol ? 'E' : '|ψ⟩'}
          </text>
          <text x={8} y={S - 10} fill="#6b7385" fontSize={11}>
            drag the yellow tip
          </text>
        </svg>
        <div className="col" style={{ gap: 8 }}>
          <div className="mono" style={{ fontSize: '0.92rem' }}>
            {pol ? '|E⟩' : '|ψ⟩'} = {Math.cos(shown).toFixed(3)} {pol ? '|H⟩' : '|0⟩'} {Math.sin(shown) < 0 ? '−' : '+'} {Math.abs(Math.sin(shown)).toFixed(3)} {pol ? '|V⟩' : '|1⟩'}
          </div>
          <Segmented
            options={[
              { value: 'z' as Basis, label: pol ? 'H/V' : 'Z basis' },
              { value: 'x' as Basis, label: pol ? 'D/A' : 'X basis' },
              { value: 'tilt' as Basis, label: 'tilted' },
            ]}
            value={basis}
            onChange={(b) => {
              setBasis(b);
              setCounts([0, 0]);
            }}
          />
          {basis === 'tilt' && (
            <Slider
              label="basis angle"
              value={beta / DEG}
              min={0}
              max={90}
              step={1}
              onChange={(v) => {
                setBeta(v * DEG);
                setCounts([0, 0]);
              }}
              format={(v) => `${v.toFixed(0)}°`}
            />
          )}
          {([0, 1] as const).map((k) => {
            const p = k === 0 ? p0 : p1;
            const amp = k === 0 ? amp0 : amp1;
            const col = k === 0 ? '#83c167' : '#e07ab6';
            return (
              <div key={k}>
                <div className="row" style={{ justifyContent: 'space-between', fontSize: '0.88rem' }}>
                  <span style={{ color: col }}>
                    P({labels[k]}) = |⟨{labels[k].replace(/[|⟩]/g, '')}|ψ⟩|² = ({amp.toFixed(3)})²
                  </span>
                  <b className="mono">{(p * 100).toFixed(1)}%</b>
                </div>
                <div style={{ height: 10, background: 'var(--panel-2)', borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ width: `${p * 100}%`, height: '100%', background: col, transition: 'width .2s' }} />
                </div>
              </div>
            );
          })}
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <button className="btn small primary" onClick={measureOnce}>
              Measure once
            </button>
            <button className="btn small" onClick={reprepare} disabled={!collapsed}>
              Re-prepare
            </button>
            <button className="btn small" onClick={() => measureMany(100)}>
              100 fresh copies
            </button>
          </div>
          {log.length > 0 && (
            <div className="mono" style={{ fontSize: '0.85rem' }}>
              results (newest first): {log.join(' ')}
            </div>
          )}
          {totalC > 0 && (
            <div className="mono faint" style={{ fontSize: '0.85rem' }}>
              {totalC} copies: {labels[0]} {counts[0]} ({((100 * counts[0]) / totalC).toFixed(0)}%) · {labels[1]} {counts[1]} ({((100 * counts[1]) / totalC).toFixed(0)}%)
            </div>
          )}
          {allowPolarization && <Toggle label="show as photon polarization" value={pol} onChange={setPol} />}
          {showBloch && (
            <div className="row" style={{ gap: 10, alignItems: 'center' }}>
              <svg width={96} height={96} viewBox="-48 -48 96 96">
                <circle r={38} fill="none" stroke="#2a3142" />
                <line x1={0} y1={-44} x2={0} y2={44} stroke="#2a3142" />
                <line x1={-44} y1={0} x2={44} y2={0} stroke="#2a3142" />
                <text x={3} y={-38} fill="#6b7385" fontSize={9}>+z</text>
                <text x={36} y={-3} fill="#6b7385" fontSize={9}>+x</text>
                <line x1={0} y1={0} x2={38 * Math.sin(blochTheta)} y2={-38 * Math.cos(blochTheta)} stroke="#fcd34d" strokeWidth={2.5} />
                <circle cx={38 * Math.sin(blochTheta)} cy={-38 * Math.cos(blochTheta)} r={3.5} fill="#fcd34d" />
              </svg>
              <div className="faint" style={{ fontSize: '0.8rem' }}>
                {pol ? 'Equivalent spin direction' : 'Spin direction (x–z plane)'}: angle from +z = <b className="mono">{Math.round(Math.abs(blochTheta) / DEG)}°</b> = 2 × {Math.round(Math.abs(wrap(shown)) / DEG)}°. Angles double!
              </div>
            </div>
          )}
          {challengeId && (
            <div className="panel" style={{ padding: 8, borderColor: certain && !collapsed ? 'var(--green)' : 'var(--border)', fontSize: '0.88rem' }}>
              {certain && !collapsed ? '✅ ' : '🎯 '}Challenge: keep the state you prepared (no collapsing!) and choose a <b>tilted</b> basis in which one outcome is
              certain.
            </div>
          )}
        </div>
      </div>
    </Widget>
  );
}
