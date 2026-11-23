import React, { useEffect, useMemo, useState } from 'react';
import { Widget, Segmented, Slider, Tex } from '../../../components/ui';
import { StateVector } from '../../../engine/qsim';
import { c } from '../../../engine/complex';
import { AmplitudeView, PhaseLegend } from '../../../widgets/AmplitudeView';
import { MiniBloch } from '../../../widgets/MiniBloch';
import { ClockDial, ProbBars, useTween } from './viz';
import { applyQFT, bitstr } from '../algos';

/**
 * The QFT as clocks. Mode 1: a basis input |x⟩ goes to a product state in which output qubit k
 * carries the phase x/2^{k+1} of a turn: the top qubit is the fastest hand, the bottom the slowest.
 * Mode 2: a periodic input comb goes to peaks at multiples of N/r.
 */
export function QFTClocks() {
  const [mode, setMode] = useState<'basis' | 'periodic'>('basis');
  return (
    <Widget title="The quantum Fourier transform as a set of clocks">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <Segmented
          options={[
            { value: 'basis', label: 'Input |x⟩: the clocks' },
            { value: 'periodic', label: 'Periodic input → peaks' },
          ]}
          value={mode}
          onChange={setMode}
        />
        <PhaseLegend size={38} />
      </div>
      {mode === 'basis' ? <BasisMode /> : <PeriodicMode />}
    </Widget>
  );
}

function BasisMode() {
  const [n, setN] = useState(3);
  const N = 1 << n;
  const [x, setX] = useState(1);
  const [playing, setPlaying] = useState(false);
  const xs = useTween(x, 700);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setX((v) => v + 1), 1100);
    return () => clearInterval(id);
  }, [playing, N]);
  const xi = ((x % N) + N) % N;
  const out = useMemo(() => {
    const s = new StateVector(n, xi);
    applyQFT(s, Array.from({ length: n }, (_, q) => q));
    return s.amplitudes();
  }, [n, xi]);

  return (
    <>
      <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <Segmented options={[3, 4].map((k) => ({ value: k, label: `${k} qubits` }))} value={n} onChange={(k) => { setN(k); setX(1); }} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <Slider label={<span className="mono">x</span>} value={xi} min={0} max={N - 1} step={1} onChange={(v) => { setPlaying(false); setX(v); }} format={(v) => `${v} = ${bitstr(v, n)}₂`} />
        </div>
        <button className={`btn small ${playing ? 'active' : 'primary'}`} onClick={() => setPlaying((p) => !p)}>
          {playing ? '⏸ pause' : '▶ count x = 0, 1, 2, …'}
        </button>
      </div>
      <div className="faint" style={{ fontSize: '0.8rem', marginBottom: 6 }}>
        Each output qubit is in <Tex>{'\\tfrac{1}{\\sqrt2}(|0\\rangle + e^{2\\pi i\\,\\varphi_k}|1\\rangle)'}</Tex>, with its phase <Tex>{'\\varphi_k = x/2^{k+1}'}</Tex> turns.
        Watch the hands as x counts up.
      </div>
      <div className="row" style={{ gap: 18, flexWrap: 'wrap', justifyContent: 'center', margin: '8px 0' }}>
        {Array.from({ length: n }, (_, k) => {
          const turns = xs / 2 ** (k + 1);
          const ang = 2 * Math.PI * turns;
          return (
            <div key={k} className="col" style={{ alignItems: 'center', gap: 4 }}>
              <ClockDial turns={turns} size={92} ticks={2 ** (k + 1)} label={`output q${k}`} sub={`x/${2 ** (k + 1)} turn`} />
              <MiniBloch v={[Math.cos(ang), Math.sin(ang), 0]} size={64} color="#fcd34d" />
              <span className="faint" style={{ fontSize: '0.72rem' }}>{k === 0 ? 'fastest: ½ turn per step' : k === n - 1 ? `slowest: 1/${2 ** n} turn per step` : `1/${2 ** (k + 1)} turn per step`}</span>
            </div>
          );
        })}
      </div>
      <div className="faint" style={{ fontSize: '0.8rem', margin: '10px 0 4px' }}>
        Multiply the qubits out and you get every amplitude of <Tex>{`\\mathrm{QFT}|${xi}\\rangle = \\tfrac{1}{\\sqrt{${N}}}\\sum_y e^{2\\pi i\\,${xi}y/${N}}|y\\rangle`}</Tex>: equal magnitudes,
        phases that wind {xi} time{xi === 1 ? '' : 's'} around the circle as y goes from 0 to {N - 1}. A pure frequency.
      </div>
      <AmplitudeView amps={out} n={n} mode="clocks" compact showNumbers={false} />
    </>
  );
}

function PeriodicMode() {
  const [n, setN] = useState(4);
  const N = 1 << n;
  const [r, setR] = useState(4);
  const [shift, setShift] = useState(1);
  const sh = Math.min(shift, r - 1);
  const input = useMemo(() => Array.from({ length: N }, (_, x) => c(x % r === sh ? 1 : 0)), [N, r, sh]);
  const outP = useMemo(() => {
    const s = StateVector.fromAmplitudes(input);
    applyQFT(s, Array.from({ length: n }, (_, q) => q));
    return s.probabilities();
  }, [input, n]);
  const inP = useMemo(() => {
    const k = input.filter((z) => z.re > 0).length;
    return input.map((z) => (z.re > 0 ? 1 / k : 0));
  }, [input]);
  const guides = Array.from({ length: r }, (_, j) => ({ x: (j * N) / r - 0.5, label: j === 0 ? '0' : `${j}N/${r}` }));
  return (
    <>
      <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <Segmented options={[4, 5].map((k) => ({ value: k, label: `N = ${1 << k}` }))} value={n} onChange={setN} />
        <span className="dim">period r</span>
        <Segmented options={[2, 3, 4, 5, 6, 8].map((k) => ({ value: k, label: String(k) }))} value={r} onChange={(k) => { setR(k); setShift((s) => Math.min(s, k - 1)); }} />
        <span className="dim">offset</span>
        <Segmented options={Array.from({ length: r }, (_, k) => ({ value: k, label: String(k) }))} value={sh} onChange={setShift} />
      </div>
      <div className="faint" style={{ fontSize: '0.8rem' }}>Input: equal superposition of x = {sh}, {sh + r}, {sh + 2 * r}, … (a comb with spacing r = {r})</div>
      <ProbBars bars={inP.map((p, x) => ({ value: p, label: String(x), color: '#9a72ac' }))} height={110} />
      <div className="faint" style={{ fontSize: '0.8rem', marginTop: 8 }}>
        After the QFT: probability of each y. Dashed lines mark multiples of N/r = {(N / r).toFixed(N % r ? 2 : 0)}.
      </div>
      <ProbBars bars={outP.map((p, y) => ({ value: p, label: String(y) }))} height={150} guides={guides} />
      <div className="dim" style={{ fontSize: '0.88rem' }}>
        {N % r === 0
          ? `r divides N, so the peaks sit exactly on multiples of N/r and nothing lands in between. Change the offset: the peaks don't move (the offset only changes their phases).`
          : `r does not divide N, so the peaks smear across neighbouring y values but still cluster near multiples of N/r. Shor's algorithm handles this with continued fractions.`}
      </div>
    </>
  );
}
