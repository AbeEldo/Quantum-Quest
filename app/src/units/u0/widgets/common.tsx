import React, { useEffect, useRef, useState } from 'react';

/** Shared SVG helpers for World 0/1 widgets (arrows, drag handling, easing). */

export function Arrow({
  x1,
  y1,
  x2,
  y2,
  color = '#58c4dd',
  width = 2.6,
  head = 11,
  dashed = false,
  opacity = 1,
  glow = false,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color?: string;
  width?: number;
  head?: number;
  dashed?: boolean;
  opacity?: number;
  glow?: boolean;
}) {
  const dx = x2 - x1,
    dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return <circle cx={x1} cy={y1} r={width} fill={color} opacity={opacity} />;
  const h = Math.min(head, len * 0.45);
  const ux = dx / len,
    uy = dy / len;
  const bx = x2 - ux * h,
    by = y2 - uy * h;
  const px = -uy * h * 0.42,
    py = ux * h * 0.42;
  return (
    <g opacity={opacity} style={glow ? { filter: `drop-shadow(0 0 4px ${color})` } : undefined}>
      <line x1={x1} y1={y1} x2={bx + ux * 1} y2={by + uy * 1} stroke={color} strokeWidth={width} strokeLinecap="round" strokeDasharray={dashed ? '5 5' : undefined} />
      <polygon points={`${x2},${y2} ${bx + px},${by + py} ${bx - px},${by - py}`} fill={color} />
    </g>
  );
}

/** Convert a pointer event to SVG viewBox coordinates. */
export function svgPoint(e: { clientX: number; clientY: number }, svg: SVGSVGElement, W: number, H: number): [number, number] {
  const r = svg.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
}

/**
 * Generic drag controller for SVG widgets with several draggable handles.
 * `pick(x,y)` returns the id of the handle under the pointer (or null); `move(id,x,y)` updates it.
 */
export function useSvgDrag<T extends string | number>(W: number, H: number, pick: (x: number, y: number) => T | null, move: (id: T, x: number, y: number) => void, onEnd?: (id: T) => void) {
  const ref = useRef<SVGSVGElement>(null);
  const active = useRef<T | null>(null);
  const pickRef = useRef(pick);
  pickRef.current = pick;
  const moveRef = useRef(move);
  moveRef.current = move;
  const endRef = useRef(onEnd);
  endRef.current = onEnd;
  const handlers = {
    onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => {
      if (!ref.current) return;
      const [x, y] = svgPoint(e, ref.current, W, H);
      const id = pickRef.current(x, y);
      if (id !== null) {
        active.current = id;
        ref.current.setPointerCapture(e.pointerId);
        moveRef.current(id, x, y);
        e.preventDefault();
      }
    },
    onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => {
      if (active.current === null || !ref.current) return;
      const [x, y] = svgPoint(e, ref.current, W, H);
      moveRef.current(active.current, x, y);
    },
    onPointerUp: () => {
      if (active.current !== null) endRef.current?.(active.current);
      active.current = null;
    },
    onPointerCancel: () => {
      active.current = null;
    },
  };
  return { ref, handlers, active };
}

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Animate a number from its current value to a target with easing. Returns current value. */
export function useTween(target: number, ms = 600): number {
  const [v, setV] = useState(target);
  const from = useRef(target);
  const cur = useRef(target);
  useEffect(() => {
    from.current = cur.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ms);
      const val = lerp(from.current, target, easeInOut(t));
      cur.current = val;
      setV(val);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/** Observe an element's width (for canvases / responsive SVG layouts). */
export function useWidth<E extends HTMLElement>(initial = 640) {
  const ref = useRef<E>(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return { ref, w };
}

/** Format a number with a fixed number of decimals, trimming "-0". */
export function fx(x: number, d = 2): string {
  const s = x.toFixed(d);
  return s === (-0).toFixed(d) ? (0).toFixed(d) : s.replace(/^-/, '−');
}

/** Angle in degrees in (-180, 180]. */
export const deg = (rad: number) => {
  let d = (rad * 180) / Math.PI;
  d = ((((d + 180) % 360) + 360) % 360) - 180;
  return d === -180 ? 180 : d;
};

/** Little SVG arc (in screen coordinates; angles in math convention, y up) from a0 to a1 about (cx,cy). */
export function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const p = (a: number) => `${cx + r * Math.cos(a)} ${cy - r * Math.sin(a)}`;
  const span = a1 - a0;
  const large = Math.abs(span) > Math.PI ? 1 : 0;
  const sweep = span > 0 ? 0 : 1;
  return `M ${p(a0)} A ${r} ${r} 0 ${large} ${sweep} ${p(a1)}`;
}
