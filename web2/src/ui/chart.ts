import type { NoteEvent } from '@core/analyzer';
import { midiFromHz, pitchClass, SWARA_NAMES, westernName, type Notation } from '@core/pitch';
import { degreeName, reading, type Scale } from '@core/scale';
import type { PitchSample, TargetMark } from '@core/session';
import { parseToken, tokenLabel } from '@core/swara';

function tokens(el: Element): Record<string, string> {
  const cs = getComputedStyle(el);
  const v = (n: string, fb: string) => cs.getPropertyValue(n).trim() || fb;
  return { inTune: v('--chart-intune', '#2f8f5b'), close: v('--chart-close', '#c9a227'), off: v('--chart-off', '#d97a1f'), offScale: v('--chart-offscale', '#d1435b'), band: v('--chart-band', 'rgba(123,63,110,0.14)'), bandMiss: v('--chart-band-miss', 'rgba(209,67,91,0.12)'), guide: v('--chart-guide', 'rgba(0,0,0,0.14)'), guideSa: v('--chart-guide-sa', 'rgba(0,0,0,0.4)'), labelBg: v('--chart-label-bg', 'rgba(255,255,255,0.9)'), fg: v('--fg', '#1f1a24'), muted: v('--fg-muted', '#6b6472') };
}

export interface ChartData {
  samples: PitchSample[];
  scale: Scale;
  tonic: number;
  a4: number;
  notation: Notation;
  events: NoteEvent[];
  /** expected notes from a guided session, drawn as bands */
  targets?: TargetMark[];
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
  target: TargetMark | null;
}

const PAD = { l: 34, r: 36, t: 18, b: 20 };
const H = 260;

/** Pitch over time with expected notes, zoom/pan along time, tap to inspect, playhead. */
export class PitchChart {
  private points: Point[];
  private tMax: number;
  private lo: number;
  private hi: number;
  private lo0 = 0;
  private hi0 = 0;
  private minMidi = 0;
  private maxMidi = 0;
  private t0 = 0;
  private t1 = 1;
  private playhead: number | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchStart: { dist: number; dy: number; t0: number; t1: number; mid: number; lo: number; hi: number; midM: number } | null = null;
  private dragStart: { x: number; y: number; t0: number; t1: number; lo: number; hi: number } | null = null;
  private downAt: { x: number; y: number } | null = null;
  private moved = false;
  private onChange: (() => void) | null = null;
  private onSelectCb: ((sel: ChartSelection | null) => void) | null = null;
  private selected: Point | null = null;

  constructor(private canvas: HTMLCanvasElement, private data: ChartData) {
    this.points = data.samples
      .filter((s) => s.hz > 0 && s.clarity >= 0.6 && s.rms >= 0.01)
      .map((s) => {
        const m = midiFromHz(s.hz, data.a4);
        return { t: s.t, midi: m, hz: s.hz, acc: reading(data.scale, m, data.tonic).accuracy };
      });
    this.tMax = Math.max(data.samples[data.samples.length - 1]?.t ?? 1, 1);
    const midis = [...this.points.map((p) => p.midi), ...(data.targets ?? []).map((t) => t.midi).filter((m): m is number => m != null)];
    // default view ignores stray readings: 2nd–98th percentile of the sung pitch, plus a margin
    const sorted = [...midis].sort((a, b) => a - b);
    const pct = (q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];
    const lo0 = sorted.length ? (sorted.length >= 20 ? pct(0.02) : sorted[0]) : 60;
    const hi0 = sorted.length ? (sorted.length >= 20 ? pct(0.98) : sorted[sorted.length - 1]) : 72;
    this.lo = this.lo0 = lo0 - 1.5;
    this.hi = this.hi0 = Math.max(hi0 + 1.5, this.lo + 6);
    this.minMidi = (sorted[0] ?? 60) - 2;
    this.maxMidi = (sorted[sorted.length - 1] ?? 72) + 2;
    this.t1 = this.tMax;
    this.attach();
  }

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
    this.lo = this.lo0;
    this.hi = this.hi0;
    this.setView(0, this.tMax);
  }

  /** Zoom the pitch axis; factor > 1 zooms in, around `centerMidi` (defaults to the middle). */
  zoomPitch(factor: number, centerMidi?: number): void {
    const c = centerMidi ?? (this.lo + this.hi) / 2;
    const span = Math.max(3, Math.min(this.maxMidi - this.minMidi + 3, (this.hi - this.lo) / factor));
    const frac = (c - this.lo) / (this.hi - this.lo);
    this.setPitch(c - span * frac, c - span * frac + span);
  }

  panPitch(dm: number): void {
    this.setPitch(this.lo + dm, this.hi + dm);
  }

  private setPitch(lo: number, hi: number): void {
    const span = hi - lo;
    const minLo = Math.min(this.minMidi, this.lo0), maxHi = Math.max(this.maxMidi, this.hi0);
    if (lo < minLo) { lo = minLo; hi = lo + span; }
    if (hi > maxHi) { hi = maxHi; lo = Math.max(minLo, hi - span); }
    this.lo = lo;
    this.hi = hi;
    this.draw();
    this.onChange?.();
  }

  get pitchZoomLevel(): number {
    return (this.hi0 - this.lo0) / (this.hi - this.lo);
  }

  private midiAt(py: number): number {
    const f = Math.max(0, Math.min(1, (py - PAD.t) / (H - PAD.t - PAD.b)));
    return this.hi - f * (this.hi - this.lo);
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

  setPlayhead(t: number | null): void {
    this.playhead = t;
    this.draw();
  }

  clearSelection(): void {
    this.selected = null;
    this.draw();
    this.onSelectCb?.(null);
  }

  /** Select the held note (its middle sample) and frame it. */
  selectEvent(e: NoteEvent, zoom = true): void {
    const mid = e.start + e.duration / 2;
    let best: Point | null = null;
    for (const p of this.points) if (!best || Math.abs(p.t - mid) < Math.abs(best.t - mid)) best = p;
    this.selected = best;
    if (zoom) this.zoomToEvent(e);
    else this.draw();
    if (best) this.onSelectCb?.({ t: best.t, midi: best.midi, hz: best.hz, accuracy: best.acc, event: e, target: this.targetAt(best.t) });
  }

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

  private targetAt(t: number): TargetMark | null {
    const ts = this.data.targets ?? [];
    for (let i = 0; i < ts.length; i++) {
      const end = ts[i].matchedAt ?? ts[i + 1]?.start ?? this.tMax;
      if (t >= ts[i].start && t <= end) return ts[i];
    }
    return null;
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

  private selectAt(px: number, py: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = this.xScale(rect.width), y = this.yScale();
    let best: Point | null = null;
    let bestD = 18;
    for (const p of this.points) {
      if (p.t < this.t0 || p.t > this.t1) continue;
      const d = Math.hypot(x(p.t) - px, y(p.midi) - py);
      if (d < bestD) { bestD = d; best = p; }
    }
    this.selected = best;
    this.draw();
    this.onSelectCb?.(best ? { t: best.t, midi: best.midi, hz: best.hz, accuracy: best.acc, event: this.eventAt(best.t), target: this.targetAt(best.t) } : null);
  }

  private xScale(cssW: number) {
    return (t: number) => PAD.l + ((t - this.t0) / (this.t1 - this.t0)) * (cssW - PAD.l - PAD.r);
  }
  private yScale() {
    return (m: number) => PAD.t + (1 - (m - this.lo) / (this.hi - this.lo)) * (H - PAD.t - PAD.b);
  }

  private tAt(px: number, width: number): number {
    const f = Math.max(0, Math.min(1, (px - PAD.l) / (width - PAD.l - PAD.r)));
    return this.t0 + f * (this.t1 - this.t0);
  }

  private attach(): void {
    const c = this.canvas;
    c.style.touchAction = 'none';
    c.style.cursor = 'grab';
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      const t = this.tAt(e.clientX - rect.left, rect.width);
      if (e.shiftKey || e.altKey) this.zoomPitch(e.deltaY < 0 || e.deltaX < 0 ? 1.2 : 1 / 1.2, this.midiAt(e.clientY - rect.top));
      else if (e.ctrlKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) this.zoom(e.deltaY < 0 ? 1.2 : 1 / 1.2, t);
      else this.pan((e.deltaX / rect.width) * (this.t1 - this.t0));
    }, { passive: false });
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) {
        this.downAt = { x: e.clientX, y: e.clientY };
        this.moved = false;
        this.dragStart = { x: e.clientX, y: e.clientY, t0: this.t0, t1: this.t1, lo: this.lo, hi: this.hi };
        c.style.cursor = 'grabbing';
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const rect = c.getBoundingClientRect();
        this.pinchStart = { dist: Math.abs(a.x - b.x), dy: Math.abs(a.y - b.y), t0: this.t0, t1: this.t1, mid: this.tAt((a.x + b.x) / 2 - rect.left, rect.width), lo: this.lo, hi: this.hi, midM: this.midiAt((a.y + b.y) / 2 - rect.top) };
        this.dragStart = null;
      }
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const rect = c.getBoundingClientRect();
      if (this.pointers.size === 2 && this.pinchStart) {
        const [a, b] = [...this.pointers.values()];
        const ps = this.pinchStart;
        // horizontal spread zooms time, vertical spread zooms pitch
        if (ps.dist > 30) {
          const factor = Math.max(10, Math.abs(a.x - b.x)) / ps.dist;
          const span = Math.max(1, Math.min(this.tMax, (ps.t1 - ps.t0) / factor));
          const frac = (ps.mid - ps.t0) / (ps.t1 - ps.t0);
          this.t0 = ps.mid - span * frac; this.t1 = this.t0 + span;
        }
        if (ps.dy > 30) {
          const factor = Math.max(10, Math.abs(a.y - b.y)) / ps.dy;
          const span = Math.max(3, (ps.hi - ps.lo) / factor);
          const frac = (ps.midM - ps.lo) / (ps.hi - ps.lo);
          this.setPitch(ps.midM - span * frac, ps.midM - span * frac + span);
        }
        this.setView(this.t0, this.t1);
      } else if (this.dragStart) {
        if (this.downAt && Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 6) this.moved = true;
        if (!this.moved) return;
        const ds = this.dragStart;
        const dt = -((e.clientX - ds.x) / (rect.width - PAD.l - PAD.r)) * (ds.t1 - ds.t0);
        const dm = ((e.clientY - ds.y) / (H - PAD.t - PAD.b)) * (ds.hi - ds.lo);
        if (this.pitchZoomLevel > 1.01 || Math.abs(this.lo - this.lo0) > 0.01) this.setPitch(ds.lo + dm, ds.hi + dm);
        this.setView(ds.t0 + dt, ds.t1 + dt);
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

  draw(): void {
    const canvas = this.canvas;
    const { scale, tonic, notation, events, targets } = this.data;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 340;
    canvas.width = cssW * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, H);
    const COLORS = tokens(canvas);
    const fg = COLORS.muted;
    if (!this.points.length) {
      ctx.fillStyle = fg;
      ctx.font = '13px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('No pitched singing detected', cssW / 2, H / 2);
      return;
    }
    const { lo, hi, t0, t1 } = this;
    const x = this.xScale(cssW), y = this.yScale();

    // Guides and both axes
    ctx.font = '11px system-ui';
    ctx.textBaseline = 'middle';
    let lastLabelY = -100;
    for (let m = Math.floor(lo); m <= Math.ceil(hi); m++) {
      const pc = pitchClass(m - tonic);
      if (!scale.intervals.includes(pc) || m < lo + 0.6 || m > hi - 0.6) continue;
      ctx.strokeStyle = pc === 0 ? COLORS.guideSa : COLORS.guide;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD.l, y(m));
      ctx.lineTo(cssW - PAD.r, y(m));
      ctx.stroke();
      // labels only where there is room; Sa is always labelled
      if (pc !== 0 && Math.abs(y(m) - lastLabelY) < 12) continue;
      if (pc === 0 || Math.abs(y(m) - lastLabelY) >= 12) {
        lastLabelY = y(m);
        ctx.fillStyle = fg;
        ctx.textAlign = 'right';
        ctx.fillText(notation === 'indian' ? SWARA_NAMES[pc] : westernName(m), PAD.l - 4, y(m));
        ctx.textAlign = 'left';
        ctx.fillText(notation === 'indian' ? westernName(m) : SWARA_NAMES[pc], cssW - PAD.r + 4, y(m));
      }
    }

    const span = t1 - t0;
    const step = [0.25, 0.5, 1, 2, 5, 10, 20, 30, 60].find((s) => span / s <= 8) ?? 60;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = fg;
    for (let t = Math.ceil(t0 / step) * step; t <= t1 + 1e-9; t += step) {
      ctx.fillText(step < 1 ? `${t.toFixed(2)}s` : `${Math.round(t)}s`, x(t), H - 5);
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(PAD.l - 2, PAD.t - 8, cssW - PAD.l - PAD.r + 4, H - PAD.b - PAD.t + 10);
    ctx.clip();

    // Expected notes: bands with the token written inside
    if (targets?.length) {
      ctx.font = 'bold 10px system-ui';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < targets.length; i++) {
        const tg = targets[i];
        if (tg.midi == null) continue;
        const end = tg.matchedAt ?? targets[i + 1]?.start ?? this.tMax;
        if (end < t0 || tg.start > t1) continue;
        const bx0 = x(tg.start), bx1 = x(end);
        ctx.fillStyle = tg.matchedAt != null ? COLORS.band : COLORS.bandMiss;
        ctx.fillRect(bx0, y(tg.midi + 0.5), Math.max(2, bx1 - bx0), y(tg.midi - 0.5) - y(tg.midi + 0.5));
        const tok = parseToken(tg.token);
        if (tok && bx1 - bx0 > 14) {
          ctx.fillStyle = COLORS.muted;
          ctx.textAlign = 'center';
          ctx.fillText(tokenLabel(tok, notation, tonic, scale), (bx0 + bx1) / 2, y(tg.midi));
        }
      }
      ctx.textBaseline = 'alphabetic';
    }

    const r = this.zoomLevel > 3 ? 3 : 2.2;
    for (const p of this.points) {
      if (p.t < t0 || p.t > t1) continue;
      ctx.fillStyle = COLORS[p.acc];
      ctx.beginPath();
      ctx.arc(x(p.t), y(p.midi), r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Thin bars for held notes; the label only on the selected one
    const selectedEvent = this.selected ? this.eventAt(this.selected.t) : null;
    for (const e of events) {
      if (e.start + e.duration < t0 || e.start > t1) continue;
      const midi = e.midi + e.meanCents / 100;
      const acc = e.isScaleTone ? (Math.abs(e.meanCents) <= 10 ? 'inTune' : Math.abs(e.meanCents) <= 25 ? 'close' : 'off') : 'offScale';
      ctx.strokeStyle = COLORS[acc];
      ctx.lineWidth = e === selectedEvent ? 3 : 1.5;
      ctx.beginPath();
      ctx.moveTo(x(e.start), y(midi));
      ctx.lineTo(x(e.start + e.duration), y(midi));
      ctx.stroke();
      if (e === selectedEvent) {
        const name = degreeName(scale, e.semitoneFromTonic, tonic, notation);
        const cents = Math.round(e.meanCents);
        const label = `${e.isScaleTone ? name : `(${name})`} ${cents >= 0 ? '+' : ''}${cents}`;
        ctx.font = 'bold 11px system-ui';
        ctx.textAlign = 'center';
        const w = ctx.measureText(label).width + 6;
        const cx = Math.min(cssW - PAD.r - w / 2, Math.max(PAD.l + w / 2, x(e.start + e.duration / 2)));
        const ly = Math.max(PAD.t + 2, y(midi) - 9);
        ctx.fillStyle = COLORS.labelBg;
        ctx.fillRect(cx - w / 2, ly - 10, w, 13);
        ctx.fillStyle = COLORS[acc];
        ctx.fillText(label, cx, ly);
      }
    }

    if (this.selected && this.selected.t >= t0 && this.selected.t <= t1) {
      const sx = x(this.selected.t), sy = y(this.selected.midi);
      ctx.strokeStyle = COLORS.muted;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(sx, PAD.t);
      ctx.lineTo(sx, H - PAD.b);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = COLORS.fg;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, r + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (this.playhead != null && this.playhead >= t0 && this.playhead <= t1) {
      ctx.strokeStyle = COLORS.accent ?? COLORS.fg;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x(this.playhead), PAD.t);
      ctx.lineTo(x(this.playhead), H - PAD.b);
      ctx.stroke();
    }
    ctx.restore();
  }
}
