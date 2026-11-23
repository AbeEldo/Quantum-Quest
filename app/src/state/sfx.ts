/** Tiny synthesized sound effects (WebAudio, no asset files). Respects the "sound" setting. */
import { useProgress } from './progress';

let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.06) {
  const a = ac();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, a.currentTime + start);
  g.gain.setValueAtTime(0, a.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, a.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + start);
  o.stop(a.currentTime + start + dur + 0.05);
}

const enabled = () => useProgress.getState().settings.sound;

export const sfx = {
  correct() {
    if (!enabled()) return;
    tone(660, 0, 0.12, 'triangle');
    tone(990, 0.08, 0.18, 'triangle');
  },
  wrong() {
    if (!enabled()) return;
    tone(220, 0, 0.18, 'sawtooth', 0.035);
    tone(180, 0.1, 0.22, 'sawtooth', 0.03);
  },
  click() {
    if (!enabled()) return;
    tone(880, 0, 0.04, 'square', 0.02);
  },
  levelUp() {
    if (!enabled()) return;
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.25, 'triangle', 0.05));
  },
  achievement() {
    if (!enabled()) return;
    [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.07, 0.3, 'sine', 0.05));
  },
  hit() {
    if (!enabled()) return;
    tone(140, 0, 0.15, 'square', 0.05);
    tone(90, 0.05, 0.2, 'sawtooth', 0.04);
  },
};
