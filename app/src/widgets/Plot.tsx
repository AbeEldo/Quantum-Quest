import React, { ReactNode } from 'react';

export interface Series {
  /** y = f(x). Return NaN to break the line. */
  f?: (x: number) => number;
  /** Or explicit points. */
  points?: [number, number][];
  color?: string;
  width?: number;
  dashed?: boolean;
  label?: string;
  /** Fill area between curve and y=0. */
  fill?: boolean;
  samples?: number;
}

export interface PlotProps {
  series: Series[];
  xRange: [number, number];
  yRange: [number, number];
  height?: number;
  width?: number;
  xLabel?: string;
  yLabel?: string;
  /** Tick spacing; omit for automatic. */
  xTicks?: number[];
  yTicks?: number[];
  /** Extra SVG drawn in data coordinates via the provided mappers. */
  overlay?: (sx: (x: number) => number, sy: (y: number) => number) => ReactNode;
  grid?: boolean;
  /** Vertical marker lines. */
  vlines?: { x: number; color?: string; label?: string }[];
  hlines?: { y: number; color?: string; label?: string }[];
  onClick?: (x: number, y: number) => void;
  onDrag?: (x: number, y: number) => void;
}

/** Simple, crisp SVG function plotter in the 3B1B style (dark background, coloured curves). */
export function Plot({
  series,
  xRange,
  yRange,
  height = 260,
  width = 640,
  xLabel,
  yLabel,
  xTicks,
  yTicks,
  overlay,
  grid = true,
  vlines = [],
  hlines = [],
  onClick,
  onDrag,
}: PlotProps) {
  const pad = { l: 46, r: 14, t: 12, b: 34 };
  const W = width, H = height;
  const sx = (x: number) => pad.l + ((x - xRange[0]) / (xRange[1] - xRange[0])) * (W - pad.l - pad.r);
  const sy = (y: number) => H - pad.b - ((y - yRange[0]) / (yRange[1] - yRange[0])) * (H - pad.t - pad.b);
  const ix = (px: number) => xRange[0] + ((px - pad.l) / (W - pad.l - pad.r)) * (xRange[1] - xRange[0]);
  const iy = (py: number) => yRange[0] + ((H - pad.b - py) / (H - pad.t - pad.b)) * (yRange[1] - yRange[0]);
  const xt = xTicks ?? niceTicks(xRange[0], xRange[1], 8);
  const yt = yTicks ?? niceTicks(yRange[0], yRange[1], 5);
  const dragging = React.useRef(false);
  const clipId = 'clip' + React.useId().replace(/[^a-zA-Z0-9]/g, '');

  const evt = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const py = ((e.clientY - r.top) / r.height) * H;
    return [ix(px), iy(py)] as [number, number];
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto', display: 'block', touchAction: onDrag ? 'none' : undefined, cursor: onDrag || onClick ? 'crosshair' : undefined }}
      onPointerDown={(e) => {
        const [x, y] = evt(e);
        onClick?.(x, y);
        if (onDrag) {
          dragging.current = true;
          (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
          onDrag(x, y);
        }
      }}
      onPointerMove={(e) => {
        if (dragging.current && onDrag) onDrag(...evt(e));
      }}
      onPointerUp={() => (dragging.current = false)}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={pad.l} y={pad.t} width={W - pad.l - pad.r} height={H - pad.t - pad.b} />
        </clipPath>
      </defs>
      {grid &&
        xt.map((x) => <line key={`gx${x}`} x1={sx(x)} x2={sx(x)} y1={pad.t} y2={H - pad.b} stroke="#232a38" strokeWidth={1} />)}
      {grid &&
        yt.map((y) => <line key={`gy${y}`} x1={pad.l} x2={W - pad.r} y1={sy(y)} y2={sy(y)} stroke="#232a38" strokeWidth={1} />)}
      {/* axes */}
      {yRange[0] <= 0 && yRange[1] >= 0 && <line x1={pad.l} x2={W - pad.r} y1={sy(0)} y2={sy(0)} stroke="#6b7385" strokeWidth={1.2} />}
      {xRange[0] <= 0 && xRange[1] >= 0 && <line x1={sx(0)} x2={sx(0)} y1={pad.t} y2={H - pad.b} stroke="#6b7385" strokeWidth={1.2} />}
      <rect x={pad.l} y={pad.t} width={W - pad.l - pad.r} height={H - pad.t - pad.b} fill="none" stroke="#2a3142" />
      {xt.map((x) => (
        <text key={`tx${x}`} x={sx(x)} y={H - pad.b + 15} fontSize={11} fill="#7d8699" textAnchor="middle">
          {fmtTick(x)}
        </text>
      ))}
      {yt.map((y) => (
        <text key={`ty${y}`} x={pad.l - 6} y={sy(y) + 4} fontSize={11} fill="#7d8699" textAnchor="end">
          {fmtTick(y)}
        </text>
      ))}
      {xLabel && (
        <text x={(pad.l + W - pad.r) / 2} y={H - 4} fontSize={12} fill="#9aa3b5" textAnchor="middle" fontStyle="italic">
          {xLabel}
        </text>
      )}
      {yLabel && (
        <text x={12} y={(pad.t + H - pad.b) / 2} fontSize={12} fill="#9aa3b5" textAnchor="middle" fontStyle="italic" transform={`rotate(-90 12 ${(pad.t + H - pad.b) / 2})`}>
          {yLabel}
        </text>
      )}
      <g clipPath={`url(#${clipId})`}>
        {series.map((s, i) => {
          const pts: [number, number][] = s.points ?? sample(s.f!, xRange, s.samples ?? 400);
          const segs: string[] = [];
          let cur = '';
          for (const [x, y] of pts) {
            if (!isFinite(y)) {
              if (cur) segs.push(cur);
              cur = '';
              continue;
            }
            const yy = Math.max(-1e4, Math.min(1e4, sy(y)));
            cur += `${cur ? 'L' : 'M'}${sx(x).toFixed(2)} ${yy.toFixed(2)}`;
          }
          if (cur) segs.push(cur);
          const col = s.color ?? '#58c4dd';
          return (
            <g key={i}>
              {s.fill &&
                segs.map((d, k) => {
                  const first = d.match(/^M([\d.-]+)/)?.[1];
                  const last = d.match(/([\d.-]+) [\d.-]+$/)?.[1];
                  return <path key={`f${k}`} d={`${d} L${last} ${sy(0)} L${first} ${sy(0)} Z`} fill={col} fillOpacity={0.18} stroke="none" />;
                })}
              {segs.map((d, k) => (
                <path key={k} d={d} fill="none" stroke={col} strokeWidth={s.width ?? 2.4} strokeDasharray={s.dashed ? '6 5' : undefined} strokeLinejoin="round" />
              ))}
            </g>
          );
        })}
        {vlines.map((v, i) => (
          <g key={`v${i}`}>
            <line x1={sx(v.x)} x2={sx(v.x)} y1={pad.t} y2={H - pad.b} stroke={v.color ?? '#fcd34d'} strokeDasharray="4 4" />
            {v.label && (
              <text x={sx(v.x) + 4} y={pad.t + 12} fontSize={11} fill={v.color ?? '#fcd34d'}>
                {v.label}
              </text>
            )}
          </g>
        ))}
        {hlines.map((h, i) => (
          <g key={`h${i}`}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(h.y)} y2={sy(h.y)} stroke={h.color ?? '#fcd34d'} strokeDasharray="4 4" />
            {h.label && (
              <text x={W - pad.r - 4} y={sy(h.y) - 4} fontSize={11} fill={h.color ?? '#fcd34d'} textAnchor="end">
                {h.label}
              </text>
            )}
          </g>
        ))}
        {overlay?.(sx, sy)}
      </g>
      {/* legend */}
      {series.some((s) => s.label) && (
        <g>
          {series
            .filter((s) => s.label)
            .map((s, i) => (
              <g key={i} transform={`translate(${W - pad.r - 150}, ${pad.t + 8 + i * 16})`}>
                <line x1={0} x2={18} y1={0} y2={0} stroke={s.color ?? '#58c4dd'} strokeWidth={2.5} strokeDasharray={s.dashed ? '4 3' : undefined} />
                <text x={24} y={4} fontSize={11} fill="#cfd6e4">
                  {s.label}
                </text>
              </g>
            ))}
        </g>
      )}
    </svg>
  );
}

function sample(f: (x: number) => number, [a, b]: [number, number], n: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const x = a + ((b - a) * i) / n;
    out.push([x, f(x)]);
  }
  return out;
}

export function niceTicks(a: number, b: number, count: number): number[] {
  const span = b - a;
  if (span <= 0) return [a];
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) out.push(Math.abs(v) < 1e-12 ? 0 : +v.toFixed(10));
  return out;
}

function fmtTick(v: number) {
  if (Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0)) return v.toExponential(0);
  return String(+v.toFixed(3));
}
