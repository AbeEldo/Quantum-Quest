import React, { ReactNode, useState } from 'react';
import { Plot, PlotProps, Series } from './Plot';
import { Slider, Widget, fmtPi } from '../components/ui';

export interface Param {
  name: string;
  /** Display label (may be plain text like "k" or "frequency"). */
  label?: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  /** Display values as multiples of π. */
  pi?: boolean;
  unit?: string;
}

export interface ParamPlotProps extends Omit<PlotProps, 'series' | 'overlay' | 'vlines' | 'hlines'> {
  title?: string;
  params: Param[];
  /** Series as a function of the current parameter values. */
  series: (p: Record<string, number>) => Series[];
  /** Optional readout under the plot, e.g. computed quantities. */
  readout?: (p: Record<string, number>) => ReactNode;
  vlines?: (p: Record<string, number>) => PlotProps['vlines'];
  hlines?: (p: Record<string, number>) => PlotProps['hlines'];
  overlay?: (p: Record<string, number>, sx: (x: number) => number, sy: (y: number) => number) => ReactNode;
}

/** A plot with sliders: the quickest way to make an explorable formula. */
export function ParamPlot({ title, params, series, readout, vlines, hlines, overlay, ...plot }: ParamPlotProps) {
  const [vals, setVals] = useState<Record<string, number>>(() => Object.fromEntries(params.map((p) => [p.name, p.value])));
  return (
    <Widget title={title ?? 'Explore'}>
      <Plot
        {...plot}
        series={series(vals)}
        vlines={vlines?.(vals)}
        hlines={hlines?.(vals)}
        overlay={overlay ? (sx, sy) => overlay(vals, sx, sy) : undefined}
      />
      <div style={{ marginTop: 8 }}>
        {params.map((p) => (
          <Slider
            key={p.name}
            label={p.label ?? p.name}
            value={vals[p.name]}
            min={p.min}
            max={p.max}
            step={p.step ?? (p.max - p.min) / 200}
            onChange={(v) => setVals((s) => ({ ...s, [p.name]: v }))}
            format={(v) => (p.pi ? fmtPi(v) : `${+v.toFixed(3)}${p.unit ? ' ' + p.unit : ''}`)}
          />
        ))}
      </div>
      {readout && <div style={{ marginTop: 8 }}>{readout(vals)}</div>}
    </Widget>
  );
}
