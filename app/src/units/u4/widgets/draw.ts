/** Canvas drawing helpers shared by World 4 widgets. */
import { phaseColor } from '../../../engine/complex';

export function arrow(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, width = 2.2, head = 7) {
  const dx = x1 - x0, dy = y1 - y0;
  const L = Math.hypot(dx, dy);
  if (L < 0.5) return;
  const ux = dx / L, uy = dy / L;
  const h = Math.min(head, L * 0.45);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1 - ux * h * 0.8, y1 - uy * h * 0.8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - ux * h - uy * h * 0.5, y1 - uy * h + ux * h * 0.5);
  ctx.lineTo(x1 - ux * h + uy * h * 0.5, y1 - uy * h - ux * h * 0.5);
  ctx.closePath();
  ctx.fill();
}

/** A phasor "clock": circle of radius R, arrow for complex number (re, im) scaled so |z| = maxR fills the circle. */
export function clock(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, re: number, im: number, maxR = 1, ring = true) {
  const mag = Math.hypot(re, im) / maxR;
  const th = Math.atan2(im, re);
  const col = phaseColor(th);
  if (ring) {
    ctx.strokeStyle = '#3a4256';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, 2 * Math.PI);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(cx, cy, R * Math.min(1, mag), 0, 2 * Math.PI);
  ctx.fill();
  ctx.globalAlpha = 1;
  arrow(ctx, cx, cy, cx + R * mag * Math.cos(th), cy - R * mag * Math.sin(th), col, 2.4, 8);
}

export function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = '#9aa3b5', size = 12, align: CanvasTextAlign = 'left') {
  ctx.fillStyle = color;
  ctx.font = `${size}px Segoe UI, system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
  ctx.textAlign = 'left';
}
