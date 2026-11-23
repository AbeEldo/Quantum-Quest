import { useEffect, useRef } from 'react';

/**
 * HiDPI canvas with its own requestAnimationFrame loop (no React re-render per frame).
 * `draw(ctx, w, h, dt)` is called every frame while `running`, and once whenever
 * the size or `deps` change while paused. dt is in seconds (clamped to 50 ms).
 */
export function useLiveCanvas(
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number, dt: number) => void,
  opts: { height?: number; aspect?: number; running?: boolean },
  deps: unknown[] = [],
) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const size = useRef({ w: 0, h: 0 });
  const running = opts.running ?? true;

  const paint = (dt: number) => {
    const el = ref.current;
    if (!el || !size.current.w) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawRef.current(ctx, size.current.w, size.current.h, dt);
  };

  useEffect(() => {
    const el = ref.current;
    if (!el || !el.parentElement) return;
    const parent = el.parentElement;
    const ro = new ResizeObserver(() => {
      const w = parent.clientWidth;
      if (!w) return;
      const h = opts.height ?? Math.round(w * (opts.aspect ?? 0.5));
      const dpr = window.devicePixelRatio || 1;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      el.style.height = `${h}px`;
      size.current = { w, h };
      paint(0);
    });
    ro.observe(parent);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.height, opts.aspect]);

  useEffect(() => {
    if (!running) {
      paint(0);
      return;
    }
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      paint(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, ...deps]);

  return ref;
}
