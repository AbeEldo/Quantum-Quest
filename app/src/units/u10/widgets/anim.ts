import { useEffect, useRef } from 'react';

/**
 * HiDPI canvas whose width tracks its parent, redrawn every animation frame.
 * draw(ctx, w, h, dt, t) receives CSS-pixel sizes; dt in seconds.
 * Returns a ref to attach to a <canvas>.
 */
export function useAnimCanvas(
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number, dt: number, t: number) => void,
  running = true,
) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const size = useRef({ w: 600, h: height, dpr: 1 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const resize = () => {
      const w = el.parentElement?.clientWidth || 600;
      const dpr = window.devicePixelRatio || 1;
      size.current = { w, h: height, dpr };
      el.width = Math.round(w * dpr);
      el.height = Math.round(height * dpr);
      el.style.width = `${w}px`;
      el.style.height = `${height}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (el.parentElement) ro.observe(el.parentElement);
    let raf = 0;
    let last = performance.now();
    const t0 = last;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const ctx = el.getContext('2d');
      if (ctx) {
        const { w, h, dpr } = size.current;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        drawRef.current(ctx, w, h, dt, (now - t0) / 1000);
      }
      if (running) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [height, running]);
  return ref;
}

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Box–Muller standard normal from a uniform RNG. */
export function gauss(rng: () => number): number {
  const u = Math.max(1e-12, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Canvas font stacks (CSS variables don't work inside ctx.font). */
export const SANS = "'Segoe UI', system-ui, -apple-system, Arial, sans-serif";
export const SERIF = "Cambria, Georgia, 'Times New Roman', serif";
export const MONO = "'Cascadia Code', Consolas, Menlo, monospace";
