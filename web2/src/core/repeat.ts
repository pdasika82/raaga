import { midiFromHz } from '@core/pitch';
import type { PitchSample, TargetMark } from '@core/session';

export type BeatVerdict = 'match' | 'near' | 'wrong' | 'silent';

export interface BeatTarget {
  token: string;
  midi: number;
}

export interface BeatResult {
  index: number;
  token: string;
  targetMidi: number;
  verdict: BeatVerdict;
  /** signed cents from the target when a note was heard */
  cents: number | null;
  detectedMidi: number | null;
  /** seconds into the recording where this beat's window starts, after alignment */
  start: number;
}

export interface TakeComparison {
  results: BeatResult[];
  matched: number;
  /** alignment applied, in beats (negative = the singer was early) */
  offsetBeats: number;
}

/**
 * Compare a sung take against a phrase of one note per beat.
 * The singer's timing is aligned by trying small global offsets and keeping the one with most matches.
 */
export function compareTake(samples: PitchSample[], targets: BeatTarget[], beat: number, phraseStart: number, a4 = 440): TakeComparison {
  const voiced = samples.filter((s) => s.hz > 0 && s.clarity >= 0.5 && s.rms >= 0.008).map((s) => ({ t: s.t, midi: midiFromHz(s.hz, a4) }));
  let best: TakeComparison | null = null;
  for (const off of [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3]) {
    const results = targets.map((tg, i) => {
      const start = phraseStart + (i + off) * beat;
      const w0 = start + 0.2 * beat, w1 = start + 0.9 * beat;
      const inWin = voiced.filter((v) => v.t >= w0 && v.t <= w1).map((v) => v.midi).sort((a, b) => a - b);
      if (inWin.length < 3) return { index: i, token: tg.token, targetMidi: tg.midi, verdict: 'silent' as BeatVerdict, cents: null, detectedMidi: null, start };
      const median = inWin[inWin.length >> 1];
      const steady = inWin.filter((m) => Math.abs(m - median) <= 0.6);
      const mean = steady.reduce((a, b) => a + b, 0) / steady.length;
      const cents = Math.round((mean - tg.midi) * 100);
      const verdict: BeatVerdict = Math.abs(cents) <= 20 ? 'match' : Math.abs(cents) <= 60 ? 'near' : 'wrong';
      return { index: i, token: tg.token, targetMidi: tg.midi, verdict, cents, detectedMidi: mean, start };
    });
    const matched = results.filter((r) => r.verdict === 'match' || r.verdict === 'near').length;
    const score = matched + results.filter((r) => r.verdict === 'match').length * 0.1;
    const bestScore = best ? best.matched + best.results.filter((r) => r.verdict === 'match').length * 0.1 : -1;
    if (!best || score > bestScore || (score === bestScore && Math.abs(off) < Math.abs(best.offsetBeats))) best = { results, matched, offsetBeats: off };
  }
  return best!;
}

/** Convert a comparison into the session's target marks so the review page and next-step logic work unchanged. */
export function toTargetMarks(c: TakeComparison, beat: number): TargetMark[] {
  return c.results.map((r) => ({
    index: r.index,
    token: r.token,
    midi: r.targetMidi,
    start: r.start,
    matchedAt: r.verdict === 'match' || r.verdict === 'near' ? r.start + beat * 0.5 : null,
    cents: r.verdict === 'match' || r.verdict === 'near' ? r.cents : null,
    attempts: 1,
  }));
}

/** Compare notes the singer produced at their own pace, one detected note per target in order. */
export function compareFree(detected: { midi: number; at: number }[], targets: BeatTarget[]): TakeComparison {
  const results: BeatResult[] = targets.map((tg, i) => {
    const d = detected[i];
    if (!d) return { index: i, token: tg.token, targetMidi: tg.midi, verdict: 'silent', cents: null, detectedMidi: null, start: detected[detected.length - 1]?.at ?? 0 };
    const cents = Math.round((d.midi - tg.midi) * 100);
    const verdict: BeatVerdict = Math.abs(cents) <= 20 ? 'match' : Math.abs(cents) <= 60 ? 'near' : 'wrong';
    return { index: i, token: tg.token, targetMidi: tg.midi, verdict, cents, detectedMidi: d.midi, start: d.at };
  });
  return { results, matched: results.filter((r) => r.verdict === 'match' || r.verdict === 'near').length, offsetBeats: 0 };
}
