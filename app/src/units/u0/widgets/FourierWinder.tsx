import React, { useMemo, useRef, useState } from 'react';
import { Widget, Slider, Toggle, Tex, useAnimationFrame } from '../../../components/ui';
import { phaseColor } from '../../../engine/complex';
import { Arrow, fx } from './common';

const T = 4; // seconds of signal
const N = 900; // samples

interface Comp {
  f: number;
  a: number;
  on: boolean;
}

function transform(sig: Float64Array, ts: Float64Array, f: number): [number, number] {
  let re = 0,
    im = 0;
  for (let i = 0; i < sig.length; i++) {
    const th = -2 * Math.PI * f * ts[i];
    re += sig[i] * Math.cos(th);
    im += sig[i] * Math.sin(th);
  }
  return [re / sig.length, im / sig.length];
}

/**
 * The "winding machine": wrap a signal around the origin at a chosen winding frequency and watch
 * the centre of mass (a complex number, drawn as a phase-coloured arrow). Sweeping the winding
 * frequency traces out the Fourier transform.
 */
export function FourierWinder() {
  const [comps, setComps] = useState<Comp[]>([
    { f: 2, a: 1, on: true },
    { f: 3, a: 0.7, on: false },
  ]);
  const [fw, setFw] = useState(0.6);
  const [sweep, setSweep] = useState(false);
  const [tracer, setTracer] = useState(0);
  const sweepDir = useRef(1);

  const ts = useMemo(() => Float64Array.from({ length: N }, (_, i) => (i / N) * T), []);
  const sig = useMemo(() => Float64Array.from(ts, (t) => comps.reduce((s, c) => s + (c.on ? c.a * Math.cos(2 * Math.PI * c.f * t) : 0), 0)), [comps, ts]);
  const maxAmp = Math.max(0.5, comps.reduce((s, c) => s + (c.on ? c.a : 0), 0));

  const spectrum = useMemo(() => {
    const out: [number, number, number][] = [];
    for (let k = 0; k <= 250; k++) {
      const f = (k / 250) * 5;
      const [re, im] = transform(sig, ts, f);
      out.push([f, re, im]);
    }
    return out;
  }, [sig, ts]);

  useAnimationFrame((dt) => {
    setTracer((x) => (x + dt * 0.5) % T);
    if (sweep) {
      setFw((f) => {
        let nf = f + dt * 0.35 * sweepDir.current;
        if (nf > 5) {
          nf = 5;
          sweepDir.current = -1;
        } else if (nf < 0) {
          nf = 0;
          sweepDir.current = 1;
        }
        return nf;
      });
    }
  }, true);

  const [cre, cim] = transform(sig, ts, fw);
  const cmag = Math.hypot(cre, cim);

  // --- time-domain plot ---
  const TW = 700,
    TH = 130;
  const tx = (t: number) => 30 + (t / T) * (TW - 40);
  const ty = (v: number) => TH / 2 - (v / maxAmp) * (TH / 2 - 12);
  const tPath = Array.from(sig, (v, i) => `${i ? 'L' : 'M'}${tx(ts[i]).toFixed(1)} ${ty(v).toFixed(1)}`).join('');
  const ti = Math.floor((tracer / T) * N) % N;

  // --- winding plot ---
  const WW = 340,
    WH = 340;
  const ws = (WW / 2 - 14) / maxAmp;
  const wx = (x: number) => WW / 2 + x * ws;
  const wy = (y: number) => WH / 2 - y * ws;
  const segs: React.ReactNode[] = [];
  const step = 3;
  for (let i = 0; i + step < N; i += step) {
    const p = (k: number) => {
      const th = -2 * Math.PI * fw * ts[k];
      return [sig[k] * Math.cos(th), sig[k] * Math.sin(th)];
    };
    const [x1, y1] = p(i),
      [x2, y2] = p(i + step);
    segs.push(<line key={i} x1={wx(x1)} y1={wy(y1)} x2={wx(x2)} y2={wy(y2)} stroke={`hsl(${200 + (i / N) * 60}, 70%, ${55 + (i / N) * 15}%)`} strokeWidth={1.4} strokeOpacity={0.85} />);
  }
  const thT = -2 * Math.PI * fw * ts[ti];
  const tracerPt = [sig[ti] * Math.cos(thT), sig[ti] * Math.sin(thT)];
  const comScale = 2.2; // magnify the centre of mass so it's visible

  // --- spectrum plot ---
  const SW = 340,
    SH = 340,
    sl = 36,
    sb = 30;
  const smax = Math.max(0.3, maxAmp / 2 + 0.05);
  const sx = (f: number) => sl + (f / 5) * (SW - sl - 10);
  const sy = (v: number) => SH - sb - (v / smax) * (SH - sb - 14);
  const specPath = spectrum.map(([f, re, im], i) => `${i ? 'L' : 'M'}${sx(f).toFixed(1)} ${sy(Math.hypot(re, im)).toFixed(1)}`).join('');

  return (
    <Widget title="The winding machine">
      <svg viewBox={`0 0 ${TW} ${TH}`} style={{ width: '100%', height: 'auto' }}>
        <rect width={TW} height={TH} rx={8} fill="#0d1018" />
        <line x1={30} x2={TW - 10} y1={ty(0)} y2={ty(0)} stroke="#2a3346" />
        {[0, 1, 2, 3, 4].map((t) => (
          <text key={t} x={tx(t)} y={TH - 4} fill="#6b7385" fontSize={10} textAnchor="middle">
            {t}s
          </text>
        ))}
        <path d={tPath} fill="none" stroke="#58c4dd" strokeWidth={2} />
        <circle cx={tx(ts[ti])} cy={ty(sig[ti])} r={5} fill="#fcd34d" />
        <text x={36} y={16} fill="#9aa3b5" fontSize={11}>
          signal g(t)
        </text>
      </svg>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12, marginTop: 8 }}>
        <svg viewBox={`0 0 ${WW} ${WH}`} style={{ width: '100%', height: 'auto' }}>
          <rect width={WW} height={WH} rx={8} fill="#0d1018" />
          <line x1={0} x2={WW} y1={wy(0)} y2={wy(0)} stroke="#2a3346" />
          <line y1={0} y2={WH} x1={wx(0)} x2={wx(0)} stroke="#2a3346" />
          {segs}
          <line x1={wx(0)} y1={wy(0)} x2={wx(tracerPt[0])} y2={wy(tracerPt[1])} stroke="#fcd34d" strokeOpacity={0.5} />
          <circle cx={wx(tracerPt[0])} cy={wy(tracerPt[1])} r={4.5} fill="#fcd34d" />
          <Arrow x1={wx(0)} y1={wy(0)} x2={wx(cre * comScale)} y2={wy(cim * comScale)} color={phaseColor(Math.atan2(cim, cre))} width={4} head={13} glow />
          <circle cx={wx(cre * comScale)} cy={wy(cim * comScale)} r={6} fill="#fff" stroke={phaseColor(Math.atan2(cim, cre))} strokeWidth={2} />
          <text x={8} y={16} fill="#9aa3b5" fontSize={11}>
            g(t)·e^(−2πi f t), wound at f = {fw.toFixed(2)} Hz
          </text>
          <text x={8} y={WH - 8} fill="#9aa3b5" fontSize={10}>
            arrow = centre of mass (×{comScale})
          </text>
        </svg>
        <svg viewBox={`0 0 ${SW} ${SH}`} style={{ width: '100%', height: 'auto' }}>
          <rect width={SW} height={SH} rx={8} fill="#0d1018" />
          <line x1={sl} x2={SW - 10} y1={sy(0)} y2={sy(0)} stroke="#2a3346" />
          {[0, 1, 2, 3, 4, 5].map((f) => (
            <g key={f}>
              <line x1={sx(f)} x2={sx(f)} y1={14} y2={sy(0)} stroke="#1a2030" />
              <text x={sx(f)} y={SH - 14} fill="#6b7385" fontSize={10} textAnchor="middle">
                {f}
              </text>
            </g>
          ))}
          <text x={(sl + SW) / 2} y={SH - 2} fill="#9aa3b5" fontSize={11} textAnchor="middle" fontStyle="italic">
            winding frequency f (Hz)
          </text>
          <path d={specPath} fill="none" stroke="#3a4458" strokeWidth={1.5} />
          {/* trace up to current f, coloured by phase */}
          {spectrum
            .filter(([f]) => f <= fw)
            .map(([f, re, im], i, arr) =>
              i === 0 ? null : (
                <line key={i} x1={sx(arr[i - 1][0])} y1={sy(Math.hypot(arr[i - 1][1], arr[i - 1][2]))} x2={sx(f)} y2={sy(Math.hypot(re, im))} stroke={phaseColor(Math.atan2(im, re))} strokeWidth={2.6} />
              ),
            )}
          <line x1={sx(fw)} x2={sx(fw)} y1={14} y2={sy(0)} stroke="#fcd34d" strokeDasharray="3 3" />
          <circle cx={sx(fw)} cy={sy(cmag)} r={5} fill="#fff" />
          <text x={sl + 6} y={18} fill="#9aa3b5" fontSize={11}>
            |centre of mass| vs f
          </text>
        </svg>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16, marginTop: 8 }}>
        <div>
          <Slider label="winding f" value={fw} min={0} max={5} step={0.01} onChange={(v) => { setFw(v); setSweep(false); }} format={(v) => `${v.toFixed(2)} Hz`} />
          <Toggle label="auto-sweep f" value={sweep} onChange={setSweep} />
          <div style={{ marginTop: 6, fontSize: '0.9rem' }}>
            <Tex>{`\\hat g(f) \\approx \\frac{1}{T}\\int_0^T g(t)\\,e^{-2\\pi i f t}\\,dt = ${fx(cre, 3)} ${cim < 0 ? '-' : '+'} ${fx(Math.abs(cim), 3)}i`}</Tex>
          </div>
        </div>
        <div className="col" style={{ gap: 4 }}>
          {comps.map((c, i) => (
            <div key={i} className="row" style={{ gap: 8 }}>
              <Toggle label={`wave ${i + 1}`} value={c.on} onChange={(v) => setComps((cs) => cs.map((x, j) => (j === i ? { ...x, on: v } : x)))} />
              <div className="grow">
                <Slider label="freq" value={c.f} min={0.5} max={4.5} step={0.25} onChange={(v) => setComps((cs) => cs.map((x, j) => (j === i ? { ...x, f: v } : x)))} format={(v) => `${v} Hz`} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Widget>
  );
}

/** Build a pulse from harmonics with a Gaussian spectrum; narrow spectrum ⇔ wide pulse. Phases shown as colour. */
export function PulseBuilder() {
  const K = 60;
  const [width, setWidth] = useState(8);
  const [terms, setTerms] = useState(60);
  const [scramble, setScramble] = useState(false);
  const phases = useMemo(() => {
    let s = 12345;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: K + 1 }, () => rnd() * 2 * Math.PI);
  }, []);
  const amps = Array.from({ length: K + 1 }, (_, k) => (k <= terms ? Math.exp(-0.5 * (k / width) ** 2) : 0));
  const ph = (k: number) => (scramble ? phases[k] : 0);
  const M = 600;
  const ts = Array.from({ length: M + 1 }, (_, i) => -0.5 + i / M);
  const sig = ts.map((t) => amps.reduce((s, a, k) => s + (k === 0 ? 0.5 : 1) * a * Math.cos(2 * Math.PI * k * t + ph(k)), 0));
  const peak = Math.max(...sig.map(Math.abs), 1e-9);
  const norm = amps.reduce((s, a, k) => s + (k === 0 ? 0.5 : 1) * a, 0);

  // rms widths
  const pw = sig.map((v) => v * v);
  const tot = pw.reduce((a, b) => a + b, 0);
  const mt = pw.reduce((a, p, i) => a + p * ts[i], 0) / tot;
  const dt = Math.sqrt(pw.reduce((a, p, i) => a + p * (ts[i] - mt) ** 2, 0) / tot);
  // spectrum as two-sided: weights a_k^2 at ±k
  const w2 = amps.map((a, k) => (k === 0 ? (a * a) / 4 : (a * a) / 2));
  const tw = w2.reduce((a, b) => a + b, 0);
  const df = Math.sqrt(w2.reduce((a, w, k) => a + w * k * k, 0) / tw);

  const SW = 700,
    SH = 120;
  const bx = (k: number) => 20 + (k / K) * (SW - 30);
  const TW = 700,
    TH = 170;
  const px = (t: number) => 20 + (t + 0.5) * (TW - 30);
  const py = (v: number) => TH / 2 - (v / (scramble ? peak : norm)) * (TH / 2 - 10);
  return (
    <Widget title="Narrow in time ⇔ wide in frequency">
      <svg viewBox={`0 0 ${SW} ${SH}`} style={{ width: '100%', height: 'auto' }}>
        <rect width={SW} height={SH} rx={8} fill="#0d1018" />
        <text x={24} y={16} fill="#9aa3b5" fontSize={11}>
          spectrum: amplitude of each frequency k (bar colour = its phase)
        </text>
        {amps.map((a, k) => (
          <rect key={k} x={bx(k) - 4} y={SH - 14 - a * (SH - 36)} width={8} height={a * (SH - 36)} rx={2} fill={phaseColor(ph(k))} fillOpacity={k <= terms ? 0.9 : 0.15} />
        ))}
        <line x1={20} x2={SW - 10} y1={SH - 14} y2={SH - 14} stroke="#2a3346" />
      </svg>
      <svg viewBox={`0 0 ${TW} ${TH}`} style={{ width: '100%', height: 'auto', marginTop: 6 }}>
        <rect width={TW} height={TH} rx={8} fill="#0d1018" />
        <line x1={20} x2={TW - 10} y1={TH / 2} y2={TH / 2} stroke="#2a3346" />
        <text x={24} y={16} fill="#9aa3b5" fontSize={11}>
          signal: the sum of all those cosines over one period
        </text>
        <polyline points={sig.map((v, i) => `${px(ts[i]).toFixed(1)},${py(v).toFixed(1)}`).join(' ')} fill="none" stroke="#fcd34d" strokeWidth={2} />
      </svg>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16, marginTop: 6 }}>
        <div>
          <Slider label="spectral width" value={width} min={1} max={25} step={0.5} onChange={setWidth} />
          <Slider label="terms used" value={terms} min={1} max={K} step={1} onChange={setTerms} format={(v) => String(v)} />
          <Toggle label="scramble the phases" value={scramble} onChange={setScramble} />
        </div>
        <div className="col" style={{ gap: 4, fontSize: '0.9rem' }}>
          <div>
            spread in frequency <Tex>{`\\Delta f \\approx ${df.toFixed(2)}`}</Tex>
          </div>
          <div>
            spread in time <Tex>{`\\Delta t \\approx ${dt.toFixed(4)}`}</Tex>
          </div>
          <div>
            product <Tex>{`\\Delta t\\,\\Delta f \\approx ${(dt * df).toFixed(3)}`}</Tex>{' '}
            <span className="faint" style={{ fontSize: '0.8rem' }}>(lower limit 1/4π ≈ 0.080)</span>
          </div>
          {scramble && <div style={{ color: 'var(--red)', fontSize: '0.85rem' }}>Same frequencies, same amplitudes, random phases: the pulse is gone.</div>}
        </div>
      </div>
    </Widget>
  );
}
