import { phaseColor } from '../../../engine/complex';

/** 360 pre-built phase colours (hsl strings) so canvas loops don't allocate strings. */
export const PHASE_LUT: string[] = Array.from({ length: 360 }, (_, d) => phaseColor((d * Math.PI) / 180));

export function phaseIndex(theta: number): number {
  let d = Math.round((theta * 180) / Math.PI) % 360;
  if (d < 0) d += 360;
  return d;
}
