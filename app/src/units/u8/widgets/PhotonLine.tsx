import React, { useEffect, useRef, useState } from 'react';
import { useAnimationFrame } from '../../../components/ui';
import { phaseColor } from '../../../engine/complex';
import { PhotonEvent, polAngle } from '../lib/bb84';

/** Colour for a polarisation angle in degrees (0/90 = rectilinear hues, 45/135 = diagonal hues). */
export const polColor = (deg: number) => phaseColor(((deg % 180) / 180) * 2 * Math.PI, 62);

interface Flight {
  ev: PhotonEvent;
  t: number;
}

/**
 * Canvas fibre from Alice to Bob with (optional) Eve in the middle. Photons are drawn as glowing
 * dots carrying a polarisation arrow; Eve re-emits intercepted photons with her own polarisation.
 * Call `launch(events)` via the ref-free `queue` prop: each new event appended to `queue` is animated once.
 */
export function PhotonLine({
  queue,
  eveOn,
  height = 130,
  speed = 0.9,
  onArrive,
}: {
  queue: PhotonEvent[];
  eveOn: boolean;
  height?: number;
  speed?: number;
  onArrive?: (ev: PhotonEvent) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [W, setW] = useState(700);
  const flights = useRef<Flight[]>([]);
  const seen = useRef(0);
  const pendingStart = useRef<PhotonEvent[]>([]);
  const since = useRef(0);
  const flashes = useRef<{ x: number; t: number; col: string }[]>([]);
  const [running, setRunning] = useState(false);
  const arriveRef = useRef(onArrive);
  arriveRef.current = onArrive;

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (queue.length < seen.current) seen.current = 0; // reset
    const fresh = queue.slice(seen.current);
    seen.current = queue.length;
    if (fresh.length) {
      pendingStart.current.push(...fresh);
      setRunning(true);
    }
  }, [queue]);

  const H = height;
  const draw = () => {
    const c = cv.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
      c.style.height = `${H}px`;
    }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const y = H / 2, x0 = 60, x1 = W - 60, xe = W / 2;
    ctx.strokeStyle = '#2f3749';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
    ctx.font = '12px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    const station = (x: number, label: string, col: string, emoji: string) => {
      ctx.fillStyle = '#141821';
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 24, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
      ctx.font = '20px Segoe UI Emoji, sans-serif';
      ctx.fillText(emoji, x, y + 7);
      ctx.font = '12px Segoe UI, sans-serif';
      ctx.fillStyle = col;
      ctx.fillText(label, x, y + 42);
    };
    station(x0, 'Alice', '#58c4dd', '👩‍🔬');
    station(x1, 'Bob', '#fcd34d', '👨‍🔬');
    if (eveOn) station(xe, 'Eve', '#fc6255', '🕵️');
    const now = performance.now();
    flashes.current = flashes.current.filter((f) => now - f.t < 400);
    for (const f of flashes.current) {
      const a = 1 - (now - f.t) / 400;
      ctx.strokeStyle = f.col;
      ctx.globalAlpha = a;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(f.x, y, 26 + 14 * (1 - a), 0, 2 * Math.PI);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (const f of flights.current) {
      const x = x0 + 26 + (x1 - x0 - 52) * f.t;
      const afterEve = eveOn && f.ev.eve && x > xe;
      const deg = afterEve ? polAngle(f.ev.eve!.basis, f.ev.eve!.bit) : polAngle(f.ev.aBasis, f.ev.aBit);
      const col = polColor(deg);
      const g = ctx.createRadialGradient(x, y, 0, x, y, 14);
      g.addColorStop(0, col);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, 2 * Math.PI);
      ctx.fill();
      const r = (deg * Math.PI) / 180;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 11 * Math.cos(r), y + 11 * Math.sin(r));
      ctx.lineTo(x + 11 * Math.cos(r), y - 11 * Math.sin(r));
      ctx.stroke();
    }
  };

  useAnimationFrame((dt) => {
    since.current += dt;
    if (pendingStart.current.length && since.current > 0.16) {
      flights.current.push({ ev: pendingStart.current.shift()!, t: 0 });
      since.current = 0;
    }
    const keep: Flight[] = [];
    const xe = 0.5;
    for (const f of flights.current) {
      const before = f.t;
      f.t += dt * speed;
      if (eveOn && f.ev.eve && before < xe && f.t >= xe) flashes.current.push({ x: W / 2, t: performance.now(), col: '#fc6255' });
      if (f.t >= 1) {
        flashes.current.push({ x: W - 60, t: performance.now(), col: '#fcd34d' });
        arriveRef.current?.(f.ev);
      } else keep.push(f);
    }
    flights.current = keep;
    draw();
    if (!keep.length && !pendingStart.current.length && !flashes.current.length) setRunning(false);
  }, running);

  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, eveOn]);

  return (
    <div ref={wrap} style={{ width: '100%' }}>
      <canvas ref={cv} style={{ width: '100%', display: 'block' }} />
    </div>
  );
}

/** Tiny SVG glyph of a polarisation (angle in degrees). */
export function PolGlyph({ deg, size = 20, dim = false }: { deg: number; size?: number; dim?: boolean }) {
  const r = (deg * Math.PI) / 180, R = size / 2 - 3;
  const col = polColor(deg);
  return (
    <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} style={{ opacity: dim ? 0.35 : 1, verticalAlign: 'middle' }}>
      <circle r={R + 2} fill={col} fillOpacity={0.15} />
      <line x1={-R * Math.cos(r)} y1={R * Math.sin(r)} x2={R * Math.cos(r)} y2={-R * Math.sin(r)} stroke={col} strokeWidth={2.4} strokeLinecap="round" />
    </svg>
  );
}
