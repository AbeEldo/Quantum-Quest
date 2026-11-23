import React, { useEffect, useRef, useState } from 'react';
import { Widget, Slider, Segmented, useAnimationFrame } from '../../../components/ui';
import { useSizedCanvas, useInView } from '../../u2/widgets/canvas';

type Model = 'classical' | 'quantum';

interface Atom {
  t: number; // seconds since emission
  mu: number; // μ_z / |μ| in [-1, 1]
  v: number; // speed factor (≈1)
  u: number; // position across the ribbon beam, −1..1
  dirX: number; // projected moment direction for drawing (classical)
}

const FLIGHT = 1.6; // seconds from oven to plate at v = 1

/**
 * Side view of the 1922 Stern–Gerlach apparatus with atoms flying through, plus a face-on view of the
 * collector plate. Toggle between the classical prediction (uniform smear) and what nature does (two lips).
 */
export function SternGerlachApparatus({ initialModel = 'classical' as Model }: { initialModel?: Model }) {
  const [model, setModel] = useState<Model>(initialModel);
  const [grad, setGrad] = useState(0.85);
  const [rate, setRate] = useState(1.6); // log10 atoms/s
  const [count, setCount] = useState(0);
  const { ref, w: W, h: H, getCtx } = useSizedCanvas({ height: 330 });
  const inView = useInView(ref);
  const atoms = useRef<Atom[]>([]);
  const acc = useRef(0);
  const plate = useRef<HTMLCanvasElement | null>(null);
  const hist = useRef(new Float64Array(60));
  const deposits = useRef<{ u: number; y: number }[]>([]);

  // geometry
  const cy = H * 0.45;
  const xOven = 46;
  const xm0 = W * 0.27, xm1 = W * 0.52;
  const xPlate = W * 0.68;
  const pX0 = W * 0.74, pX1 = W - 12; // plate face-on panel
  const pCy = cy;
  const maxDefl = Math.min(95, H * 0.3);

  const reset = () => {
    atoms.current = [];
    deposits.current = [];
    hist.current = new Float64Array(60);
    setCount(0);
    drawPlate();
  };
  useEffect(reset, [model, grad, W, H]); // eslint-disable-line react-hooks/exhaustive-deps

  const plateMap = (u: number, y: number) => {
    const pw = pX1 - pX0;
    return [pX0 + pw / 2 + u * pw * 0.38, pCy + y] as const;
  };

  const drawPlate = () => {
    if (!plate.current) plate.current = document.createElement('canvas');
    const pc = plate.current;
    const dpr = window.devicePixelRatio || 1;
    pc.width = Math.round(W * dpr);
    pc.height = Math.round(H * dpr);
    const g = pc.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    for (const d of deposits.current) depositDot(g, d.u, d.y);
  };
  const depositDot = (g: CanvasRenderingContext2D, u: number, y: number) => {
    const [x, yy] = plateMap(u, y);
    g.fillStyle = 'rgba(40,30,20,0.85)';
    g.fillRect(x - 0.9, yy - 0.9, 1.8, 1.8);
  };

  /** deflection at the plate for an atom (screen y, positive = down) */
  const deflection = (a: Atom) => {
    const lip = 1 - 0.78 * a.u * a.u; // gradient strongest at the centre of the knife edge
    return (-a.mu * grad * maxDefl * lip) / (a.v * a.v);
  };

  const yAt = (a: Atom, x: number) => {
    const Yp = deflection(a);
    // inside the magnet: parabola; afterwards: straight line. Choose Ymag so that y(xPlate) = Yp.
    const Lm = xm1 - xm0;
    const k = Yp / (1 + (2 * (xPlate - xm1)) / Lm); // = Ymag
    if (x <= xm0) return 0;
    if (x <= xm1) {
      const s = (x - xm0) / Lm;
      return k * s * s;
    }
    return k + (2 * k * (x - xm1)) / Lm;
  };

  const spawn = () => {
    let mu: number;
    if (model === 'classical') mu = 2 * Math.random() - 1; // random orientation in 3D ⇒ μ_z uniform on [−1, 1]
    else mu = Math.random() < 0.5 ? 1 : -1;
    const v = 0.8 + 0.4 * Math.random();
    atoms.current.push({ t: 0, mu, v, u: 2 * Math.random() - 1, dirX: Math.sqrt(1 - mu * mu) * (Math.random() < 0.5 ? -1 : 1) });
  };

  useAnimationFrame((dt) => {
    acc.current += 10 ** rate * dt;
    let n = Math.min(80, Math.floor(acc.current));
    acc.current -= n;
    while (n-- > 0) spawn();
    const done: Atom[] = [];
    for (const a of atoms.current) {
      a.t += dt;
      if (a.t * a.v >= FLIGHT) done.push(a);
    }
    if (done.length) {
      if (!plate.current) drawPlate();
      const g = plate.current!.getContext('2d')!;
      for (const a of done) {
        const y = deflection(a) + (Math.random() - 0.5) * 3;
        if (deposits.current.length < 40000) deposits.current.push({ u: a.u, y });
        depositDot(g, a.u, y);
        if (Math.abs(a.u) < 0.35) {
          const b = Math.floor(((y + maxDefl * 1.25) / (2.5 * maxDefl)) * hist.current.length);
          if (b >= 0 && b < hist.current.length) hist.current[b]++;
        }
      }
      atoms.current = atoms.current.filter((a) => a.t * a.v < FLIGHT);
      setCount((c) => c + done.length);
    }
    draw();
  }, inView);

  const draw = () => {
    const ctx = getCtx();
    if (!ctx) return;
    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(0, 0, W, H);

    // beam axis
    ctx.strokeStyle = '#1d2230';
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(xOven, cy);
    ctx.lineTo(xPlate, cy);
    ctx.stroke();
    ctx.setLineDash([]);

    // oven
    const glow = ctx.createRadialGradient(xOven, cy, 2, xOven, cy, 34);
    glow.addColorStop(0, 'rgba(255,170,80,0.9)');
    glow.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(xOven - 34, cy - 34, 68, 68);
    ctx.fillStyle = '#3a2a22';
    ctx.fillRect(xOven - 26, cy - 20, 30, 40);
    ctx.strokeStyle = '#ff8c42';
    ctx.strokeRect(xOven - 26, cy - 20, 30, 40);
    ctx.fillStyle = '#9aa3b5';
    ctx.font = '11px system-ui';
    ctx.fillText('silver oven', xOven - 30, cy + 36);
    ctx.fillText('~1000 °C', xOven - 26, cy + 49);

    // collimating slits
    for (const xs of [xOven + 36, xOven + 70]) {
      ctx.fillStyle = '#566078';
      ctx.fillRect(xs, cy - 40, 4, 37);
      ctx.fillRect(xs, cy + 3, 4, 37);
    }

    // magnet (side view): top pole = knife edge (N), bottom = groove (S)
    const gap = 14;
    ctx.fillStyle = '#7a2e2a';
    ctx.beginPath();
    ctx.moveTo(xm0, cy - 80);
    ctx.lineTo(xm1, cy - 80);
    ctx.lineTo(xm1, cy - gap);
    ctx.lineTo(xm0, cy - gap);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#26476b';
    ctx.fillRect(xm0, cy + gap + 4, xm1 - xm0, 70);
    ctx.fillStyle = '#e9ecf2';
    ctx.font = 'bold 14px system-ui';
    ctx.fillText('N', (xm0 + xm1) / 2 - 5, cy - 40);
    ctx.fillText('S', (xm0 + xm1) / 2 - 5, cy + 56);
    ctx.font = '11px system-ui';
    ctx.fillStyle = '#9aa3b5';
    ctx.fillText(grad > 0.01 ? 'inhomogeneous field: B stronger near the N edge' : 'magnet off', xm0, cy - 88);

    // cross-section inset
    const ix = xm0 + 4, iy = H - 66, iw = 96, ih = 56;
    ctx.fillStyle = '#11141c';
    ctx.fillRect(ix, iy, iw, ih);
    ctx.strokeStyle = '#2a3142';
    ctx.strokeRect(ix, iy, iw, ih);
    ctx.fillStyle = '#7a2e2a';
    ctx.beginPath();
    ctx.moveTo(ix + 10, iy + 4);
    ctx.lineTo(ix + iw - 10, iy + 4);
    ctx.lineTo(ix + iw / 2, iy + 22);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#26476b';
    ctx.beginPath();
    ctx.moveTo(ix + 8, iy + ih - 4);
    ctx.lineTo(ix + 8, iy + 36);
    ctx.lineTo(ix + iw / 2 - 12, iy + 36);
    ctx.lineTo(ix + iw / 2 - 8, iy + 42);
    ctx.lineTo(ix + iw / 2 + 8, iy + 42);
    ctx.lineTo(ix + iw / 2 + 12, iy + 36);
    ctx.lineTo(ix + iw - 8, iy + 36);
    ctx.lineTo(ix + iw - 8, iy + ih - 4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(252,211,77,0.6)';
    for (const dx of [-14, -6, 0, 6, 14]) {
      ctx.beginPath();
      ctx.moveTo(ix + iw / 2 + dx * 0.3, iy + 22);
      ctx.quadraticCurveTo(ix + iw / 2 + dx * 1.2, iy + 30, ix + iw / 2 + dx * 2.2, iy + 37);
      ctx.stroke();
    }
    ctx.fillStyle = '#fcd34d';
    ctx.beginPath();
    ctx.arc(ix + iw / 2, iy + 29, 2.5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = '#6b7385';
    ctx.font = '10px system-ui';
    ctx.fillText('cross-section', ix + 2, iy - 3);

    // plate (edge on)
    ctx.fillStyle = '#c9d1e0';
    ctx.fillRect(xPlate - 2, cy - maxDefl - 30, 4, 2 * maxDefl + 60);
    ctx.fillStyle = '#9aa3b5';
    ctx.font = '11px system-ui';
    ctx.fillText('glass plate', xPlate - 26, cy + maxDefl + 46);

    // atoms in flight
    for (const a of atoms.current) {
      const s = (a.t * a.v) / FLIGHT;
      const x = xOven + s * (xPlate - xOven);
      const y = cy + yAt(a, x);
      let col = '#c9d1e0';
      if (x > xm0) {
        if (model === 'quantum') col = a.mu > 0 ? '#fcd34d' : '#58c4dd';
        else {
          const t = (a.mu + 1) / 2;
          col = `rgb(${Math.round(88 + t * (252 - 88))},${Math.round(196 + t * (211 - 196))},${Math.round(221 + t * (77 - 221))})`;
        }
      }
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, 2 * Math.PI);
      ctx.fill();
      if (model === 'classical' && x < xm1) {
        // little magnetic-moment arrow
        ctx.strokeStyle = col;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - a.dirX * 5, y + a.mu * 5);
        ctx.lineTo(x + a.dirX * 5, y - a.mu * 5);
        ctx.stroke();
      }
    }

    // plate face-on
    const pw = pX1 - pX0;
    ctx.fillStyle = '#d9dde6';
    ctx.globalAlpha = 0.12;
    ctx.fillRect(pX0, cy - maxDefl - 30, pw, 2 * maxDefl + 60);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#3a4256';
    ctx.strokeRect(pX0 + 0.5, cy - maxDefl - 30 + 0.5, pw - 1, 2 * maxDefl + 59);
    // tint deposit area so the dark silver-sulfide dots show
    ctx.fillStyle = 'rgba(230,220,200,0.85)';
    ctx.fillRect(pX0 + 1, cy - maxDefl - 29, pw - 2, 2 * maxDefl + 58);
    if (plate.current) ctx.drawImage(plate.current, 0, 0, W, H);
    ctx.fillStyle = '#9aa3b5';
    ctx.font = '11px system-ui';
    ctx.fillText('plate, face on', pX0 + 4, cy - maxDefl - 36);
    ctx.fillText(`${deposits.current.length} atoms`, pX0 + 4, cy + maxDefl + 46);

    // histogram (centre strip), drawn to the left of the plate panel
    const hb = hist.current;
    let hmax = 0;
    for (let i = 0; i < hb.length; i++) hmax = Math.max(hmax, hb[i]);
    const hx = xPlate + 8, hwid = pX0 - hx - 8;
    if (hwid > 20) {
      for (let i = 0; i < hb.length; i++) {
        const y = cy - maxDefl * 1.25 + ((i + 0.5) / hb.length) * 2.5 * maxDefl;
        const len = hmax ? (hb[i] / hmax) * hwid : 0;
        ctx.fillStyle = model === 'quantum' ? '#fcd34d' : '#9a72ac';
        ctx.globalAlpha = 0.7;
        ctx.fillRect(hx, y - 1.5, len, 3);
      }
      ctx.globalAlpha = 1;
    }
  };

  return (
    <Widget title="The Stern–Gerlach apparatus (1922)">
      <div style={{ marginBottom: 10 }}>
        <Segmented
          options={[
            { value: 'classical' as Model, label: '🧲 Classical prediction' },
            { value: 'quantum' as Model, label: '⚛ What nature does' },
          ]}
          value={model}
          onChange={setModel}
        />
      </div>
      <div style={{ width: '100%', minWidth: 0 }}>
        <canvas ref={ref} style={{ display: 'block', borderRadius: 10, border: '1px solid var(--border)' }} />
      </div>
      <div className="faint" style={{ fontSize: '0.85rem', margin: '8px 0' }}>
        {model === 'classical'
          ? 'Classically each atom is a tiny bar magnet pointing in a random direction, so μ_z takes every value between −μ and +μ: the beam should smear into a continuous band.'
          : 'Every atom is deflected either up or down by the same amount. Nothing lands in the middle. The "lip" shape comes from the field gradient being strongest at the centre of the knife edge.'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '6px 18px' }}>
        <Slider label="field gradient" value={grad} min={0} max={1} step={0.01} onChange={setGrad} format={(v) => (v < 0.01 ? 'off' : `${Math.round(v * 100)}%`)} />
        <Slider label="atoms/s" value={rate} min={0} max={2.6} step={0.05} onChange={setRate} format={(v) => `${Math.round(10 ** v)}`} />
      </div>
      <div className="row" style={{ gap: 10, marginTop: 6 }}>
        <button className="btn small ghost" onClick={reset}>
          Clean plate
        </button>
        <span className="faint mono" style={{ fontSize: '0.85rem' }}>
          {count} atoms detected
        </span>
      </div>
    </Widget>
  );
}
