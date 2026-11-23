import React, { ReactNode, useEffect, useRef, useState } from 'react';
import katex from 'katex';

/* --------------------------------- Math --------------------------------- */

/** Render a TeX string. */
export function Tex({ children, tex, display = false, className }: { children?: string; tex?: string; display?: boolean; className?: string }) {
  const src = tex ?? (typeof children === 'string' ? children : '');
  const html = React.useMemo(() => {
    try {
      return katex.renderToString(src, { displayMode: display, throwOnError: false, strict: false });
    } catch {
      return src;
    }
  }, [src, display]);
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

/**
 * Render a string containing $inline$ / $$display$$ math and **bold** / *italic* / `code`.
 * Use for text that lives in TS data (flashcards, boss questions, game text).
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  const html = React.useMemo(() => renderRich(text), [text]);
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function renderRich(text: string): string {
  const out: string[] = [];
  const re = /\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    out.push(inlineMd(esc(text.slice(last, m.index))));
    const tex = m[1] ?? m[2];
    out.push(katex.renderToString(tex, { displayMode: !!m[1], throwOnError: false, strict: false }));
    last = m.index + m[0].length;
  }
  out.push(inlineMd(esc(text.slice(last))));
  return out.join('');
}

function inlineMd(s: string) {
  return s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+?)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br/>');
}

/* ------------------------------- Controls ------------------------------- */

export function Slider({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
  format,
  disabled,
}: {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  disabled?: boolean;
}) {
  return (
    <div className="slider-row">
      <label>{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span className="val">{format ? format(value) : value.toFixed(2)}</span>
    </div>
  );
}

export function Toggle({ label, value, onChange }: { label: ReactNode; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="row" style={{ gap: 8, cursor: 'pointer', fontSize: '0.92rem' }}>
      <span
        onClick={() => onChange(!value)}
        style={{
          width: 38,
          height: 22,
          borderRadius: 11,
          background: value ? 'var(--blue-d)' : 'var(--panel-2)',
          border: '1px solid var(--border)',
          position: 'relative',
          transition: 'background .15s',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: value ? 18 : 2,
            width: 16,
            height: 16,
            borderRadius: 8,
            background: '#fff',
            transition: 'left .15s',
          }}
        />
      </span>
      <span className="dim" onClick={() => onChange(!value)}>
        {label}
      </span>
    </label>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="row" style={{ gap: 4, background: 'var(--panel-2)', padding: 3, borderRadius: 10, border: '1px solid var(--border)', display: 'inline-flex' }}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          className="btn small ghost"
          style={{
            border: 'none',
            background: o.value === value ? 'var(--blue-d)' : 'transparent',
            color: o.value === value ? '#04141a' : 'var(--text-dim)',
          }}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Standard frame for interactive widgets in lessons. */
export function Widget({ title, children, style, className }: { title?: ReactNode; children: ReactNode; style?: React.CSSProperties; className?: string }) {
  return (
    <div className={`widget ${className ?? ''}`} style={style}>
      {title && <div className="widget-title">{title}</div>}
      {children}
    </div>
  );
}

export function Stat({ label, value, color }: { label: ReactNode; value: ReactNode; color?: string }) {
  return (
    <div className="stat">
      <span className="v" style={color ? { color } : undefined}>
        {value}
      </span>
      <span className="l">{label}</span>
    </div>
  );
}

export function ProgressBar({ value, color = 'var(--blue)', height = 8, style }: { value: number; color?: string; height?: number; style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'var(--panel-2)', borderRadius: height, height, overflow: 'hidden', border: '1px solid var(--border)', ...style }}>
      <div
        style={{
          width: `${Math.max(0, Math.min(1, value)) * 100}%`,
          height: '100%',
          background: color,
          borderRadius: height,
          transition: 'width .4s cubic-bezier(.2,.8,.2,1)',
        }}
      />
    </div>
  );
}

/* ------------------------------ Canvas hooks ----------------------------- */

/**
 * Hook for a HiDPI canvas that redraws on resize. `draw(ctx, w, h)` receives CSS-pixel sizes.
 * Height is aspect * width unless `height` is given.
 */
export function useCanvas(
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  deps: unknown[],
  opts: { aspect?: number; height?: number } = {},
) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 600, h: 300 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      // defer to the next frame to avoid "ResizeObserver loop" notices
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const w = el.parentElement?.clientWidth ?? 0;
        if (!w) return;
        const h = opts.height ?? Math.round(w * (opts.aspect ?? 0.5));
        setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
      });
    });
    ro.observe(el.parentElement!);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [opts.aspect, opts.height]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = Math.round(size.w * dpr);
    el.height = Math.round(size.h * dpr);
    el.style.height = `${size.h}px`;
    const ctx = el.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(ctx, size.w, size.h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, ...deps]);
  return { ref, size };
}

/** requestAnimationFrame loop; callback gets dt in seconds. Pauses when `running` is false. */
export function useAnimationFrame(cb: (dt: number, t: number) => void, running = true) {
  const cbRef = useRef(cb);
  cbRef.current = cb;
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    const t0 = last;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      cbRef.current(dt, (now - t0) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running]);
}

/** Format a number in units of π, e.g. 1.5708 -> "π/2". */
export function fmtPi(x: number): string {
  const r = x / Math.PI;
  const fracs: [number, string][] = [
    [0, '0'], [1, 'π'], [-1, '−π'], [0.5, 'π/2'], [-0.5, '−π/2'], [0.25, 'π/4'], [-0.25, '−π/4'],
    [0.75, '3π/4'], [-0.75, '−3π/4'], [2, '2π'], [1.5, '3π/2'], [-1.5, '−3π/2'], [1 / 3, 'π/3'], [2 / 3, '2π/3'],
    [1 / 8, 'π/8'], [1 / 6, 'π/6'], [1.25, '5π/4'], [1.75, '7π/4'],
  ];
  for (const [v, s] of fracs) if (Math.abs(r - v) < 0.004) return s;
  return `${r.toFixed(2)}π`;
}

export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
