import type { NoteEvent } from '../core/analyzer';
import { midiFromHz, pitchClass, SWARA_NAMES, westernName, type Notation } from '../core/pitch';
import { degreeName, reading, type Scale } from '../core/scale';
import type { PitchSample } from '../core/session';

const COLORS: Record<string, string> = { inTune: '#3ddc84', close: '#f4d03f', off: '#ff9f43', offScale: '#ff5c7a' };

export interface ChartData {
  samples: PitchSample[];
  scale: Scale;
  tonic: number;
  a4: number;
  notation: Notation;
  events: NoteEvent[];
}

interface Point {
  t: number;
  midi: number;
  hz: number;
  acc: string;
}

export interface ChartSelection {
  t: number;
  midi: number;
  hz: number;
  accuracy: string;
  event: NoteEvent | null;
}

/** Pitch over time on a canvas, with scale degrees as guides. Zoom and pan along time. */
export class PitchChart {
  private points: Point[];
  private tMax: number;
  private lo: number;
  private hi: number;
  private t0 = 0;
  private t1 = 1;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchStart: { dist: number; t0: number; t1: number; mid: number } | null = null;
  private dragStart: { x: number; t0: number; t1: number } | null = null;
  private onChange: (() => void) | null = null;
  private onSelectCb: ((sel: ChartSelection | null) => void) | null = null;
  private selected: Point | null = null;
  private downAt: { x: number; y: number } | null = null;
  private moved = false;

  constructor(private canvas: HTMLCanvasElement, private data: ChartData) {
    this.points = data.samples
      .filter((s) => s.hz > 0 && s.clarity >= 0.6 && s.rms >= 0.01)
      .map((s) => {
        const m = midiFromHz(s.hz, data.a4);
        return { t: s.t, midi: m, hz: s.hz, acc: reading(data.scale, m, data.tonic).accuracy };
      });
    this.tMax = Math.max(data.samples[data.samples.length - 1]?.t ?? 1, 1);
    this.lo = (this.points.length ? Math.min(...this.points.map((p) => p.midi)) : 60) - 1.5;
    this.hi = (this.points.length ? Math.max(...this.points.map((p) => p.midi)) : 72) + 1.5;
    this.t1 = this.tMax;
    this.attach();
  }

  /** Zoom factor > 1 zooms in, around time `centerT` (defaults to the middle of the view). */
  zoom(factor: number, centerT?: number): void {
    const c = centerT ?? (this.t0 + this.t1) / 2;
    let span = (this.t1 - this.t0) / factor;
    span = Math.max(1, Math.min(this.tMax, span));
    const frac = (c - this.t0) / (this.t1 - this.t0);
    this.setView(c - span * frac, c - span * frac + span);
  }

  pan(dt: number): void {
    this.setView(this.t0 + dt, this.t1 + dt);
  }

  reset(): void {
    this.setView(0, this.tMax);
  }

  get zoomLevel(): number {
    return this.tMax / (this.t1 - this.t0);
  }

  onViewChange(cb: () => void): void {
    this.onChange = cb;
  }

  onSelect(cb: (sel: ChartSelection | null) => void): void {
    this.onSelectCb = cb;
  }

  clearSelection(): void {
    this.selected = null;
    this.draw();
    this.onSelectCb?.(null);
  }

  /** Zoom the view to one held note with a little context either side. */
  zoomToEvent(e: NoteEvent): void {
    const pad = Math.max(0.3, e.duration * 0.5);
    let t0 = e.start - pad;
    let t1 = e.start + e.duration + pad;
    if (t1 - t0 < 1) {
      const c = (t0 + t1) / 2;
      t0 = c - 0.5;
      t1 = c + 0.5;
    }
    this.setView(t0, t1);
  }

  private eventAt(t: number): NoteEvent | null {
    return this.data.events.find((e) => t >= e.start - 0.03 && t <= e.start + e.duration + 0.03) ?? null;
  }

  private selectAt(px: number, py: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const cssW = rect.width, cssH = 260;
    const padL = 34, padR = 36, padT = 18, padB = 20;
    const x = (t: number) => padL + ((t - this.t0) / (this.t1 - this.t0)) * (cssW - padL - padR);
    const y = (m: number) => padT + (1 - (m - this.lo) / (this.hi - this.lo)) * (cssH - padT - padB);
    let best: Point | null = null;
    let bestD = 18;
    for (const p of this.points) {
      if (p.t < this.t0 || p.t > this.t1) continue;
      const d = Math.hypot(x(p.t) - px, y(p.midi) - py);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    this.selected = best;
    this.draw();
    this.onSelectCb?.(best ? { t: best.t, midi: best.midi, hz: best.hz, accuracy: best.acc, event: this.eventAt(best.t) } : null);
  }

  private setView(t0: number, t1: number): void {
    const span = t1 - t0;
    if (t0 < 0) { t0 = 0; t1 = span; }
    if (t1 > this.tMax) { t1 = this.tMax; t0 = Math.max(0, t1 - span); }
    this.t0 = t0;
    this.t1 = t1;
    this.draw();
    this.onChange?.();
  }

  private attach(): void {
    const c = this.canvas;
    c.style.touchAction = 'pan-y';
    c.style.cursor = 'grab';
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      const t = this.tAt(e.clientX - rect.left, rect.width);
      if (e.ctrlKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) this.zoom(e.deltaY < 0 ? 1.2 : 1 / 1.2, t);
      else this.pan(((e.deltaX) / rect.width) * (this.t1 - this.t0));
    }, { passive: false });
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) {
        this.downAt = { x: e.clientX, y: e.clientY };
        this.moved = false;
        this.dragStart = { x: e.clientX, t0: this.t0, t1: this.t1 };
        c.style.cursor = 'grabbing';
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const rect = c.getBoundingClientRect();
        this.pinchStart = { dist: Math.abs(a.x - b.x), t0: this.t0, t1: this.t1, mid: this.tAt((a.x + b.x) / 2 - rect.left, rect.width) };
        this.dragStart = null;
      }
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const rect = c.getBoundingClientRect();
      if (this.pointers.size === 2 && this.pinchStart) {
        const [a, b] = [...this.pointers.values()];
        const dist = Math.max(10, Math.abs(a.x - b.x));
        const factor = dist / Math.max(10, this.pinchStart.dist);
        const span = Math.max(1, Math.min(this.tMax, (this.pinchStart.t1 - this.pinchStart.t0) / factor));
        const frac = (this.pinchStart.mid - this.pinchStart.t0) / (this.pinchStart.t1 - this.pinchStart.t0);
        this.setView(this.pinchStart.mid - span * frac, this.pinchStart.mid - span * frac + span);
      } else if (this.dragStart) {
        if (this.downAt && Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 6) this.moved = true;
        if (!this.moved) return;
        const dt = -((e.clientX - this.dragStart.x) / (rect.width - 70)) * (this.dragStart.t1 - this.dragStart.t0);
        this.setView(this.dragStart.t0 + dt, this.dragStart.t1 + dt);
      }
    });
    const end = (e: PointerEvent) => {
      const wasTap = e.type === 'pointerup' && this.pointers.size === 1 && !this.moved && !this.pinchStart && this.downAt;
      this.pointers.delete(e.pointerId);
      if (wasTap) {
        const rect = c.getBoundingClientRect();
        this.selectAt(e.clientX - rect.left, e.clientY - rect.top);
      }
      this.downAt = null;
      if (this.pointers.size < 2) this.pinchStart = null;
      if (this.pointers.size === 0) {
        this.dragStart = null;
        c.style.cursor = 'grab';
      }
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('dblclick', () => this.reset());
  }

  private tAt(px: number, width: number): number {
    const padL = 34, padR = 36;
    const f = Math.max(0, Math.min(1, (px - padL) / (width - padL - padR)));
    return this.t0 + f * (this.t1 - this.t0);
  }

  draw(): void {
    const canvas = this.canvas;
    const { scale, tonic, notation, events } = this.data;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 340;
    const cssH = 260;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);

    const style = getComputedStyle(canvas);
    const fg = style.getPropertyValue('--fg-muted') || '#999';
    if (!this.points.length) {
      ctx.fillStyle = fg;
      ctx.font = '13px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('No pitched singing detected', cssW / 2, cssH / 2);
      return;
    }
    const { lo, hi, t0, t1 } = this;
    const padL = 34, padR = 36, padT = 18, padB = 20;
    const x = (t: number) => padL + ((t - t0) / (t1 - t0)) * (cssW - padL - padR);
    const y = (m: number) => padT + (1 - (m - lo) / (hi - lo)) * (cssH - padT - padB);

    // Guides and both axes
    ctx.font = '11px system-ui';
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
      ctx.textAlign = 'right';
      ctx.fillText(notation === 'indian' ? SWARA_NAMES[pc] : westernName(m), padL - 4, y(m));
      ctx.textAlign = 'left';
      ctx.fillText(notation === 'indian' ? westernName(m) : SWARA_NAMES[pc], cssW - padR + 4, y(m));
    }

    // Time axis: pick a tick step that gives 4-8 ticks
    const span = t1 - t0;
    const step = [0.25, 0.5, 1, 2, 5, 10, 20, 30, 60].find((s) => span / s <= 8) ?? 60;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = fg;
    for (let t = Math.ceil(t0 / step) * step; t <= t1 + 1e-9; t += step) {
      ctx.fillText(step < 1 ? `${t.toFixed(2)}s` : `${Math.round(t)}s`, x(t), cssH - 5);
    }

    // Clip to the plot area for points and labels
    ctx.save();
    ctx.beginPath();
    ctx.rect(padL - 2, 0, cssW - padL - padR + 4, cssH - padB + 2);
    ctx.clip();

    const r = this.zoomLevel > 3 ? 3 : 2.2;
    for (const p of this.points) {
      if (p.t < t0 || p.t > t1) continue;
      ctx.fillStyle = COLORS[p.acc];
      ctx.beginPath();
      ctx.arc(x(p.t), y(p.midi), r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.selected && this.selected.t >= t0 && this.selected.t <= t1) {
      const sx = x(this.selected.t), sy = y(this.selected.midi);
      ctx.strokeStyle = 'rgba(243,238,250,0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(sx, padT);
      ctx.lineTo(sx, cssH - padB);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = '#f3eefa';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, r + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Label each held note with the swara it landed on and its tuning.
    const visible = events.filter((e) => e.start + e.duration >= t0 && e.start <= t1);
    const minLabelDuration = visible.length > 24 ? 0.25 : 0.15;
    ctx.font = 'bold 10px system-ui';
    ctx.textAlign = 'center';
    const placed: { x0: number; x1: number; row: number }[] = [];
    for (const e of visible) {
      if (e.duration < minLabelDuration) continue;
      const midi = e.midi + e.meanCents / 100;
      const acc = e.isScaleTone ? (Math.abs(e.meanCents) <= 10 ? 'inTune' : Math.abs(e.meanCents) <= 25 ? 'close' : 'off') : 'offScale';
      const color = COLORS[acc];
      const x0 = x(e.start), x1 = x(e.start + e.duration);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x0, y(midi));
      ctx.lineTo(x1, y(midi));
      ctx.stroke();
      const name = degreeName(scale, e.semitoneFromTonic, tonic, notation);
      const cents = Math.round(e.meanCents);
      const label = `${e.isScaleTone ? name : `(${name})`} ${cents >= 0 ? '+' : ''}${cents}`;
      const w = ctx.measureText(label).width + 4;
      const cx = Math.min(cssW - padR - w / 2, Math.max(padL + w / 2, (Math.max(x0, padL) + Math.min(x1, cssW - padR)) / 2));
      let row = 0;
      while (placed.some((q) => q.row === row && cx - w / 2 < q.x1 && cx + w / 2 > q.x0)) row++;
      placed.push({ x0: cx - w / 2, x1: cx + w / 2, row });
      const ly = Math.max(padT + 2, y(midi) - 7 - row * 11);
      ctx.fillStyle = 'rgba(18,10,28,0.75)';
      ctx.fillRect(cx - w / 2, ly - 9, w, 11);
      ctx.fillStyle = color;
      ctx.fillText(label, cx, ly);
    }
    ctx.restore();
  }
}
