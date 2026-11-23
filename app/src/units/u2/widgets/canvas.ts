import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * A HiDPI canvas that tracks its parent's width. Returns the ref, CSS size, and a function that
 * returns a 2D context already scaled to CSS pixels (call it inside your animation loop).
 */
export function useSizedCanvas(opts: { height?: number; aspect?: number; minHeight?: number; maxHeight?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 640, h: opts.height ?? 320 });
  useEffect(() => {
    const el = ref.current;
    if (!el || !el.parentElement) return;
    const parent = el.parentElement;
    const measure = () => {
      const w = Math.max(280, parent.clientWidth);
      let h = opts.height ?? Math.round(w * (opts.aspect ?? 0.5));
      if (opts.minHeight) h = Math.max(opts.minHeight, h);
      if (opts.maxHeight) h = Math.min(opts.maxHeight, h);
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [opts.height, opts.aspect, opts.minHeight, opts.maxHeight]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = Math.round(size.w * dpr);
    el.height = Math.round(size.h * dpr);
    el.style.width = `${size.w}px`;
    el.style.height = `${size.h}px`;
  }, [size]);
  const getCtx = () => {
    const el = ref.current;
    if (!el) return null;
    const ctx = el.getContext('2d');
    if (!ctx) return null;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  };
  return { ref, w: size.w, h: size.h, getCtx };
}

/** Pause animation when the element is off-screen (saves battery in long lessons). */
export function useInView<T extends Element>(ref: RefObject<T | null>) {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((ents) => setInView(ents[0]?.isIntersecting ?? true), { rootMargin: '100px' });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return inView;
}

export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
