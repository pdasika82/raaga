import { midiFromHz, pitchClass, SWARA_NAMES, westernName, westernPitchClassName, type Notation } from './pitch';
import { degreeLabel, degreeName, reading, scaleDisplayName, type Scale, type ScaleReading } from './scale';
import type { PitchSample } from './session';

export interface DegreeStat {
  semitone: number;
  isScaleTone: boolean;
  seconds: number;
  meanCents: number;
  meanAbsCents: number;
}

export interface NoteEvent {
  start: number;
  duration: number;
  midi: number;
  semitoneFromTonic: number;
  isScaleTone: boolean;
  meanCents: number;
  centsStdDev: number;
}

export interface PerformanceReport {
  totalSeconds: number;
  voicedSeconds: number;
  scaleToneFraction: number;
  within20: number;
  within50: number;
  meanAbsCents: number;
  stabilityCents: number | null;
  lowestMidi: number | null;
  highestMidi: number | null;
  degrees: DegreeStat[];
  events: NoteEvent[];
}

export function hasVoice(r: PerformanceReport): boolean {
  return r.voicedSeconds > 0.3;
}

/** 0..100 headline score weighting tuning accuracy and scale adherence. */
export function score(r: PerformanceReport): number {
  if (!hasVoice(r)) return 0;
  const tuning = 0.6 * r.within20 + 0.4 * r.within50;
  return Math.round(100 * (0.7 * tuning + 0.3 * r.scaleToneFraction));
}

export function medianHop(samples: PitchSample[]): number {
  if (samples.length < 2) return 0.085;
  const gaps: number[] = [];
  for (let i = 1; i < samples.length; i++) gaps.push(samples[i].t - samples[i - 1].t);
  gaps.sort((a, b) => a - b);
  const m = gaps[gaps.length >> 1];
  return m > 0 ? m : 0.085;
}

export interface AnalyzeOptions {
  minClarity?: number;
  minRMS?: number;
  totalSeconds?: number;
}

export function analyze(samples: PitchSample[], scale: Scale, tonic: number, a4: number, opts: AnalyzeOptions = {}): PerformanceReport {
  const minClarity = opts.minClarity ?? 0.6;
  const minRMS = opts.minRMS ?? 0.01;
  const hop = medianHop(samples);
  const total = opts.totalSeconds ?? (samples.length ? samples[samples.length - 1].t + hop : 0);

  const voiced: { t: number; r: ScaleReading }[] = [];
  for (const s of samples) {
    if (s.hz > 0 && s.clarity >= minClarity && s.rms >= minRMS) {
      voiced.push({ t: s.t, r: reading(scale, midiFromHz(s.hz, a4), tonic) });
    }
  }

  if (voiced.length === 0) {
    return { totalSeconds: total, voicedSeconds: 0, scaleToneFraction: 0, within20: 0, within50: 0, meanAbsCents: 0, stabilityCents: null, lowestMidi: null, highestMidi: null, degrees: [], events: [] };
  }

  const n = voiced.length;
  const onScale = voiced.filter((v) => v.r.isScaleTone).length;
  const w20 = voiced.filter((v) => Math.abs(v.r.scaleCents) <= 20).length;
  const w50 = voiced.filter((v) => Math.abs(v.r.scaleCents) <= 50).length;
  const meanAbs = voiced.reduce((a, v) => a + Math.abs(v.r.scaleCents), 0) / n;

  const bySemitone = new Map<number, ScaleReading[]>();
  for (const v of voiced) {
    const list = bySemitone.get(v.r.semitoneFromTonic) ?? [];
    list.push(v.r);
    bySemitone.set(v.r.semitoneFromTonic, list);
  }
  const degrees: DegreeStat[] = [];
  for (let st = 0; st < 12; st++) {
    const rs = bySemitone.get(st);
    if (!rs?.length) continue;
    const cents = rs.map((r) => r.chromaticCents);
    degrees.push({
      semitone: st,
      isScaleTone: scale.intervals.includes(st),
      seconds: rs.length * hop,
      meanCents: cents.reduce((a, c) => a + c, 0) / cents.length,
      meanAbsCents: cents.reduce((a, c) => a + Math.abs(c), 0) / cents.length,
    });
  }

  const events: NoteEvent[] = [];
  let runStart = voiced[0].t;
  let runLast = voiced[0].t;
  let runMidi = voiced[0].r.chromaticMidi;
  let runCents: number[] = [voiced[0].r.chromaticCents];
  const flush = () => {
    const duration = runLast - runStart + hop;
    if (duration < 0.15) return;
    const mean = runCents.reduce((a, c) => a + c, 0) / runCents.length;
    const variance = runCents.reduce((a, c) => a + (c - mean) * (c - mean), 0) / runCents.length;
    const st = pitchClass(runMidi - tonic);
    events.push({ start: runStart, duration, midi: runMidi, semitoneFromTonic: st, isScaleTone: scale.intervals.includes(st), meanCents: mean, centsStdDev: Math.sqrt(variance) });
  };
  for (let i = 1; i < voiced.length; i++) {
    const v = voiced[i];
    if (v.r.chromaticMidi === runMidi && v.t - runLast <= hop * 2.5) {
      runLast = v.t;
      runCents.push(v.r.chromaticCents);
    } else {
      flush();
      runStart = v.t;
      runLast = v.t;
      runMidi = v.r.chromaticMidi;
      runCents = [v.r.chromaticCents];
    }
  }
  flush();

  const sustained = events.filter((e) => e.duration >= 0.6);
  const stability = sustained.length ? sustained.reduce((a, e) => a + e.centsStdDev, 0) / sustained.length : null;

  return {
    totalSeconds: total,
    voicedSeconds: n * hop,
    scaleToneFraction: onScale / n,
    within20: w20 / n,
    within50: w50 / n,
    meanAbsCents: meanAbs,
    stabilityCents: stability,
    lowestMidi: events.length ? Math.min(...events.map((e) => e.midi)) : null,
    highestMidi: events.length ? Math.max(...events.map((e) => e.midi)) : null,
    degrees,
    events,
  };
}

const f0 = (x: number) => x.toFixed(0);
const f1 = (x: number) => x.toFixed(1);
const signed = (x: number) => (x >= 0 ? '+' : '') + f0(x);

/** Plain-text summary suitable for a coach (human or model) to read. */
export function summaryText(r: PerformanceReport, scale: Scale, tonic: number, maxEvents = 150): string {
  const lines: string[] = [];
  lines.push(`Scale: ${scaleDisplayName(scale)}. Tonic (Sa) = ${westernPitchClassName(tonic)}. Scale degrees: ${scale.intervals.map((i) => degreeLabel(i, tonic)).join(' ')}`);
  lines.push(`Recording length ${f1(r.totalSeconds)} s, voiced (pitched singing) ${f1(r.voicedSeconds)} s.`);
  if (!hasVoice(r)) {
    lines.push('No pitched singing was detected.');
    return lines.join('\n');
  }
  lines.push(`Time on scale tones: ${f0(r.scaleToneFraction * 100)}%. Within ±20 cents of a scale tone: ${f0(r.within20 * 100)}%. Within ±50 cents: ${f0(r.within50 * 100)}%. Mean distance from nearest scale tone: ${f0(r.meanAbsCents)} cents.`);
  if (r.stabilityCents != null) lines.push(`Steadiness on held notes (average wobble): ±${f0(r.stabilityCents)} cents.`);
  if (r.lowestMidi != null && r.highestMidi != null) lines.push(`Range sung: ${westernName(r.lowestMidi)} to ${westernName(r.highestMidi)}.`);
  const onScale = r.degrees.filter((d) => d.isScaleTone);
  if (onScale.length) {
    lines.push('Per degree (time, average tuning; negative = flat):');
    for (const d of onScale) lines.push(`  ${degreeLabel(d.semitone, tonic)}: ${f1(d.seconds)} s, ${signed(d.meanCents)} cents (avg |${f0(d.meanAbsCents)}|)`);
  }
  const off = r.degrees.filter((d) => !d.isScaleTone && d.seconds >= 0.25);
  if (off.length) lines.push('Notes outside the scale: ' + off.map((d) => `${degreeLabel(d.semitone, tonic)} ${f1(d.seconds)} s`).join(', '));
  if (r.events.length) {
    lines.push('Note sequence as sung (note, duration, average tuning; * = outside the scale):');
    lines.push(r.events.slice(0, maxEvents).map((e) => `${SWARA_NAMES[e.semitoneFromTonic]}${e.isScaleTone ? '' : '*'} ${f1(e.duration)}s ${signed(e.meanCents)}c`).join(' → '));
    if (r.events.length > maxEvents) lines.push(`(${r.events.length - maxEvents} further notes omitted)`);
  }
  return lines.join('\n');
}

/** Compact note sequence for the UI, e.g. "S R G m P". */
export function noteSequence(r: PerformanceReport, scale: Scale, tonic: number, notation: Notation): string {
  return r.events
    .map((e) => {
      const name = degreeName(scale, e.semitoneFromTonic, tonic, notation);
      return e.isScaleTone ? name : `(${name})`;
    })
    .join(' ');
}
