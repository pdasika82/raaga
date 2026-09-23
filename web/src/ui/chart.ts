import { midiFromHz, pitchClass, SWARA_NAMES, westernName, type Notation } from '../core/pitch';
import { reading, type Scale } from '../core/scale';
import type { PitchSample } from '../core/session';

const COLORS: Record<string, string> = { inTune: '#3ddc84', close: '#f4d03f', off: '#ff9f43', offScale: '#ff5c7a' };

/** Pitch over time on a canvas, with scale degrees as horizontal guides. */
export function drawPitchChart(canvas: HTMLCanvasElement, samples: PitchSample[], scale: Scale, tonic: number, a4: number, notation: Notation): void {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 340;
  const cssH = 240;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssW, cssH);

  const pts = samples
    .filter((s) => s.hz > 0 && s.clarity >= 0.6 && s.rms >= 0.01)
    .map((s) => {
      const m = midiFromHz(s.hz, a4);
      return { t: s.t, midi: m, acc: reading(scale, m, tonic).accuracy };
    });
  const style = getComputedStyle(canvas);
  const fg = style.getPropertyValue('--fg-muted') || '#999';
  if (!pts.length) {
    ctx.fillStyle = fg;
    ctx.font = '13px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('No pitched singing detected', cssW / 2, cssH / 2);
    return;
  }
  const lo = Math.min(...pts.map((p) => p.midi)) - 1.5;
  const hi = Math.max(...pts.map((p) => p.midi)) + 1.5;
  const tMax = Math.max(samples[samples.length - 1]?.t ?? 1, 1);
  const padL = 34, padR = 8, padT = 8, padB = 20;
  const x = (t: number) => padL + (t / tMax) * (cssW - padL - padR);
  const y = (m: number) => padT + (1 - (m - lo) / (hi - lo)) * (cssH - padT - padB);

  ctx.font = '11px system-ui';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let m = Math.floor(lo); m <= Math.ceil(hi); m++) {
    const pc = pitchClass(m - tonic);
    if (!scale.intervals.includes(pc) || m < lo + 0.6 || m > hi - 0.6) continue;
    ctx.strokeStyle = pc === 0 ? 'rgba(128,128,128,0.7)' : 'rgba(128,128,128,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, y(m));
    ctx.lineTo(cssW - padR, y(m));
    ctx.stroke();
    ctx.fillStyle = fg;
    ctx.fillText(notation === 'indian' ? SWARA_NAMES[pc] : westernName(m), padL - 4, y(m));
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (let t = 0; t <= tMax; t += tMax > 30 ? 10 : 5) {
    ctx.fillStyle = fg;
    ctx.fillText(`${t}s`, x(t), cssH - 5);
  }
  for (const p of pts) {
    ctx.fillStyle = COLORS[p.acc];
    ctx.beginPath();
    ctx.arc(x(p.t), y(p.midi), 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
}
