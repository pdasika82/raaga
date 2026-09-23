/** Conversions between frequency, MIDI note numbers and cents. */
export function midiFromHz(hz: number, a4 = 440): number {
  return 69 + 12 * Math.log2(hz / a4);
}

export function hzFromMidi(midi: number, a4 = 440): number {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

/** Wraps a semitone offset into 0..11. */
export function pitchClass(semitones: number): number {
  return ((semitones % 12) + 12) % 12;
}

export type Notation = 'western' | 'indian';

export const NOTATION_TITLES: Record<Notation, string> = {
  western: 'Western (C D E)',
  indian: 'Indian (S R G)',
};

export const WESTERN_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

/** Twelve-tone swara labels relative to Sa. Lower case = komal / lower variant. */
export const SWARA_NAMES = ['S', 'r', 'R', 'g', 'G', 'm', 'M', 'P', 'd', 'D', 'n', 'N'];

/** e.g. 60 -> "C4" */
export function westernName(midi: number): string {
  return `${WESTERN_NAMES[pitchClass(midi)]}${Math.floor(midi / 12) - 1}`;
}

export function westernPitchClassName(pc: number): string {
  return WESTERN_NAMES[pitchClass(pc)];
}

export function swaraName(midi: number, tonic: number): string {
  return SWARA_NAMES[pitchClass(midi - tonic)];
}

export interface PitchFrame {
  /** RMS level 0..1 */
  rms: number;
  /** Fundamental in Hz, or null if silent / unpitched */
  frequency: number | null;
  /** Periodicity 0..1 */
  clarity: number;
}

export const SILENT_FRAME: PitchFrame = { rms: 0, frequency: null, clarity: 0 };

export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let acc = 0;
  for (let i = 0; i < samples.length; i++) acc += samples[i] * samples[i];
  return Math.sqrt(acc / samples.length);
}

export interface YinOptions {
  threshold?: number;
  minFrequency?: number;
  maxFrequency?: number;
  silenceRMS?: number;
}

/**
 * Monophonic pitch detector using the YIN algorithm
 * (de Cheveigné & Kawahara, 2002) with parabolic interpolation.
 */
export class YinPitchDetector {
  readonly threshold: number;
  readonly minFrequency: number;
  readonly maxFrequency: number;
  readonly silenceRMS: number;
  private diff = new Float64Array(0);

  constructor(readonly sampleRate: number, opts: YinOptions = {}) {
    this.threshold = opts.threshold ?? 0.15;
    this.minFrequency = opts.minFrequency ?? 60;
    this.maxFrequency = opts.maxFrequency ?? 1400;
    this.silenceRMS = opts.silenceRMS ?? 0.004;
  }

  analyze(samples: Float32Array): PitchFrame {
    const level = rms(samples);
    if (level < this.silenceRMS || samples.length < 512) {
      return { rms: level, frequency: null, clarity: 0 };
    }
    const est = this.estimate(samples);
    if (!est) return { rms: level, frequency: null, clarity: 0 };
    return { rms: level, frequency: est[0], clarity: est[1] };
  }

  private estimate(x: Float32Array): [number, number] | null {
    const n = x.length;
    const w = n >> 1;
    const tauMax = Math.min(w, Math.floor(this.sampleRate / this.minFrequency));
    const tauMin = Math.max(2, Math.floor(this.sampleRate / this.maxFrequency));
    if (tauMax <= tauMin + 2) return null;
    if (this.diff.length < tauMax) this.diff = new Float64Array(tauMax);
    const d = this.diff;

    // Difference function
    for (let tau = 0; tau < tauMax; tau++) {
      let acc = 0;
      for (let j = 0; j < w; j++) {
        const delta = x[j] - x[j + tau];
        acc += delta * delta;
      }
      d[tau] = acc;
    }

    // Cumulative mean normalised difference
    let running = 0;
    d[0] = 1;
    for (let tau = 1; tau < tauMax; tau++) {
      running += d[tau];
      d[tau] = running > 0 ? (d[tau] * tau) / running : 1;
    }

    // Absolute threshold, then slide to the local minimum
    let found = -1;
    let tau = tauMin;
    while (tau < tauMax - 1) {
      if (d[tau] < this.threshold) {
        while (tau + 1 < tauMax - 1 && d[tau + 1] < d[tau]) tau++;
        found = tau;
        break;
      }
      tau++;
    }
    if (found < 0) {
      let best = tauMin;
      let bestVal = d[tauMin];
      for (let t = tauMin; t < tauMax - 1; t++) {
        if (d[t] < bestVal) {
          bestVal = d[t];
          best = t;
        }
      }
      if (bestVal >= 0.45) return null;
      found = best;
    }

    // Parabolic interpolation
    let refined = found;
    if (found > 0 && found < tauMax - 1) {
      const s0 = d[found - 1], s1 = d[found], s2 = d[found + 1];
      const denom = s0 - 2 * s1 + s2;
      if (Math.abs(denom) > 1e-12) {
        const offset = (s0 - s2) / (2 * denom);
        if (Math.abs(offset) <= 1) refined += offset;
      }
    }

    const freq = this.sampleRate / refined;
    if (freq < this.minFrequency || freq > this.maxFrequency) return null;
    const clarity = Math.max(0, Math.min(1, 1 - d[found]));
    return [freq, clarity];
  }
}
