import React, { useMemo, useRef, useState } from 'react';
import { BlochSphere, vecFromAngles, anglesFromVec, type Vec3 } from '../../../widgets/BlochSphere';
import { Slider, Widget, Tex, Segmented, Toggle, fmtPi, useCanvas, useAnimationFrame, Stat } from '../../../components/ui';
import { mulberry32 } from '../../../engine/qsim';
import { dot } from './spin';

type Obs = 'X' | 'Y' | 'Z' | 'n';

/**
 * Repeated projective measurements of a spin observable A = a₊P₊ + a₋P₋ along an axis.
 * Shows the running mean converging to ⟨A⟩ = ⟨ψ|A|ψ⟩ inside the ±ΔA/√N funnel.
 */
export function MeasurementRunner({ general = false }: { general?: boolean }) {
  const [theta, setTheta] = useState(Math.PI / 3);
  const [phi, setPhi] = useState(0);
  const [obs, setObs] = useState<Obs>('Z');
  const [nTheta, setNTheta] = useState(Math.PI / 4);
  const [aPlus, setAPlus] = useState(1);
  const [aMinus, setAMinus] = useState(-1);
  const [reprepare, setReprepare] = useState(true);
  const [stream, setStream] = useState(false);
  const [version, setVersion] = useState(0);
  const rng = useRef(mulberry32(12345));
  const outcomes = useRef<number[]>([]); // +1 / -1 (eigen index)
  const collapsed = useRef<number | null>(null);

  const axis: Vec3 = obs === 'X' ? [1, 0, 0] : obs === 'Y' ? [0, 1, 0] : obs === 'Z' ? [0, 0, 1] : vecFromAngles(nTheta, 0);
  const r = vecFromAngles(theta, phi);
  const pPlus = (1 + dot(axis, r)) / 2;
  const expA = aPlus * pPlus + aMinus * (1 - pPlus);
  const varA = (aPlus - aMinus) ** 2 * pPlus * (1 - pPlus);
  const dA = Math.sqrt(Math.max(0, varA));

  const reset = () => {
    outcomes.current = [];
    collapsed.current = null;
    setVersion((v) => v + 1);
  };

  const shoot = (k: number) => {
    for (let i = 0; i < k; i++) {
      if (outcomes.current.length >= 20000) break;
      let p = pPlus;
      if (!reprepare && collapsed.current !== null) p = collapsed.current === 1 ? 1 : 0;
      const o = rng.current() < p ? 1 : -1;
      outcomes.current.push(o);
      collapsed.current = o;
    }
    setVersion((v) => v + 1);
  };

  useAnimationFrame(() => shoot(4), stream);

  // reset when the experiment changes
  const key = `${theta.toFixed(4)}|${phi.toFixed(4)}|${obs}|${nTheta.toFixed(4)}|${aPlus}|${aMinus}|${reprepare}`;
  const lastKey = useRef(key);
  if (lastKey.current !== key) {
    lastKey.current = key;
    outcomes.current = [];
    collapsed.current = null;
  }

  const N = outcomes.current.length;
  const nPlus = useMemo(() => outcomes.current.filter((o) => o === 1).length, [version, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const mean = N ? (aPlus * nPlus + aMinus * (N - nPlus)) / N : NaN;
  const last = N ? outcomes.current[N - 1] : 0;

  const fmtA = (v: number) => (v > 0 ? '+' : '') + (general ? v.toFixed(1) : v.toFixed(0));
  const lo = Math.min(aPlus, aMinus), hi = Math.max(aPlus, aMinus);
  const { ref } = useCanvas(
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const pad = { l: 44, r: 12, t: 12, b: 28 };
      const Nmax = Math.max(10, N);
      const lx = (n: number) => pad.l + (Math.log10(n) / Math.log10(Nmax)) * (w - pad.l - pad.r);
      const span = hi - lo || 1;
      const y0 = lo - 0.15 * span, y1 = hi + 0.15 * span;
      const ly = (y: number) => h - pad.b - ((y - y0) / (y1 - y0)) * (h - pad.t - pad.b);
      // axes
      ctx.strokeStyle = '#2a3142';
      ctx.lineWidth = 1;
      ctx.font = '11px Segoe UI, sans-serif';
      ctx.fillStyle = '#6b7385';
      for (let d = 1; d <= Nmax; d *= 10) {
        const x = lx(d);
        ctx.beginPath();
        ctx.moveTo(x, pad.t);
        ctx.lineTo(x, h - pad.b);
        ctx.stroke();
        ctx.fillText(String(d), x - 4, h - pad.b + 14);
      }
      ctx.fillText('number of measurements N (log scale)', w / 2 - 90, h - 3);
      for (const yv of [aMinus, aPlus, 0]) {
        const y = ly(yv);
        ctx.beginPath();
        ctx.moveTo(pad.l, y);
        ctx.lineTo(w - pad.r, y);
        ctx.stroke();
        ctx.fillText(yv.toFixed(1), 8, y + 4);
      }
      // funnel ±ΔA/√N
      ctx.fillStyle = 'rgba(252,211,77,0.12)';
      ctx.beginPath();
      const steps = 120;
      for (let i = 0; i <= steps; i++) {
        const n = Math.pow(Nmax, i / steps);
        const y = ly(expA + dA / Math.sqrt(n));
        if (i === 0) ctx.moveTo(lx(n), y);
        else ctx.lineTo(lx(n), y);
      }
      for (let i = steps; i >= 0; i--) {
        const n = Math.pow(Nmax, i / steps);
        ctx.lineTo(lx(n), ly(expA - dA / Math.sqrt(n)));
      }
      ctx.closePath();
      ctx.fill();
      // theory line
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = '#fcd34d';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(pad.l, ly(expA));
      ctx.lineTo(w - pad.r, ly(expA));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#fcd34d';
      ctx.fillText('⟨A⟩', w - pad.r - 26, ly(expA) - 5);
      // running mean
      const out = outcomes.current;
      if (out.length) {
        ctx.strokeStyle = '#58c4dd';
        ctx.lineWidth = 2;
        ctx.beginPath();
        let s = 0;
        let lastPx = -1;
        for (let i = 0; i < out.length; i++) {
          s += out[i] === 1 ? aPlus : aMinus;
          const n = i + 1;
          const px = lx(n);
          if (px - lastPx < 0.7 && i !== out.length - 1) continue;
          lastPx = px;
          const y = ly(s / n);
          if (i === 0) ctx.moveTo(px, y);
          else ctx.lineTo(px, y);
        }
        ctx.stroke();
        ctx.fillStyle = '#58c4dd';
        ctx.beginPath();
        ctx.arc(lx(out.length), ly(s / out.length), 4, 0, 2 * Math.PI);
        ctx.fill();
      }
    },
    [version, key],
    { height: 210 },
  );

  const shownState: Vec3 = !reprepare && collapsed.current !== null ? (collapsed.current === 1 ? axis : [-axis[0], -axis[1], -axis[2]]) : r;
  const minusAxis: Vec3 = [-axis[0], -axis[1], -axis[2]];

  return (
    <Widget title="Measurement machine — repeat, average, converge">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,0.9fr) minmax(0,1.1fr)', gap: 16, alignItems: 'start' }}>
        <div>
          <BlochSphere
            vector={shownState}
            axis={axis}
            vectors={[
              { v: axis, color: '#83c167' },
              { v: minusAxis, color: '#fc6255' },
            ]}
            onDrag={
              reprepare || collapsed.current === null
                ? (v) => {
                    const a = anglesFromVec(v);
                    setTheta(a.theta);
                    setPhi(a.phi);
                  }
                : undefined
            }
            height={270}
          />
          <Slider label={<Tex>{'\\theta'}</Tex>} value={theta} min={0} max={Math.PI} step={Math.PI / 48} onChange={setTheta} format={fmtPi} />
          <Slider label={<Tex>{'\\phi'}</Tex>} value={phi} min={0} max={2 * Math.PI} step={Math.PI / 48} onChange={setPhi} format={fmtPi} />
        </div>
        <div className="col" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <span className="faint" style={{ fontSize: '0.85rem' }}>Observable:</span>
            <Segmented
              options={[
                { value: 'X', label: 'σx' },
                { value: 'Y', label: 'σy' },
                { value: 'Z', label: 'σz' },
                { value: 'n', label: 'tilted' },
              ]}
              value={obs}
              onChange={setObs}
            />
          </div>
          {obs === 'n' && <Slider label="tilt from z" value={nTheta} min={0} max={Math.PI} step={Math.PI / 24} onChange={setNTheta} format={fmtPi} />}
          {general && (
            <>
              <Slider label={<Tex>{'a_+'}</Tex>} value={aPlus} min={-3} max={3} step={0.5} onChange={setAPlus} format={(v) => v.toFixed(1)} />
              <Slider label={<Tex>{'a_-'}</Tex>} value={aMinus} min={-3} max={3} step={0.5} onChange={setAMinus} format={(v) => v.toFixed(1)} />
            </>
          )}
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <button className="btn small primary" onClick={() => shoot(1)}>
              Measure ×1
            </button>
            <button className="btn small" onClick={() => shoot(10)}>
              ×10
            </button>
            <button className="btn small" onClick={() => shoot(100)}>
              ×100
            </button>
            <button className={`btn small ${stream ? 'active' : ''}`} onClick={() => setStream((s) => !s)}>
              {stream ? '❚❚ stop' : '▶ stream'}
            </button>
            <button className="btn small ghost" onClick={reset}>
              reset
            </button>
          </div>
          <Toggle label="Re-prepare ψ before every shot" value={reprepare} onChange={setReprepare} />
          <div className="row" style={{ gap: 14, alignItems: 'center' }}>
            <div
              key={N}
              className="pop"
              style={{
                width: 64,
                height: 44,
                borderRadius: 10,
                display: 'grid',
                placeItems: 'center',
                fontWeight: 700,
                fontSize: '1.2rem',
                border: '2px solid',
                borderColor: N ? (last === 1 ? 'var(--green)' : 'var(--red)') : 'var(--border)',
                color: N ? (last === 1 ? 'var(--green)' : 'var(--red)') : 'var(--text-faint)',
              }}
            >
              {N ? fmtA(last === 1 ? aPlus : aMinus) : '—'}
            </div>
            <Stat label="shots N" value={N} />
            <Stat label="running mean" value={N ? mean.toFixed(3) : '—'} color="var(--blue)" />
            <Stat label="⟨A⟩ theory" value={expA.toFixed(3)} color="var(--yellow)" />
            <Stat label="ΔA theory" value={dA.toFixed(3)} />
          </div>
          <div className="canvas-wrap">
            <canvas ref={ref} />
          </div>
          <div className="row" style={{ gap: 10, fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--green)', width: 120 }}>
              outcome {fmtA(aPlus)}: {N ? ((nPlus / N) * 100).toFixed(1) : '—'}%
            </span>
            <span style={{ color: 'var(--red)', width: 120 }}>
              outcome {fmtA(aMinus)}: {N ? (((N - nPlus) / N) * 100).toFixed(1) : '—'}%
            </span>
            <span className="faint">Born rule predicts {(pPlus * 100).toFixed(1)}% / {((1 - pPlus) * 100).toFixed(1)}%</span>
          </div>
        </div>
      </div>
    </Widget>
  );
}
