import type { PerformanceReport } from './analyzer';
import { midiFromHz, type Notation, type PitchFrame } from './pitch';
import type { Scale } from './scale';
import type { PracticeSession } from './session';
import { describeSemitone, detectedLabel, familyName, parseToken, tokenSpoken, type Token } from './swara';

export type LiveKind = 'silent' | 'unclear' | 'onPitch' | 'slightlyHigh' | 'slightlyLow' | 'wrongNote';

export interface LiveGuidance {
  kind: LiveKind;
  headline: string;
  detail: string;
  /** signed cents from the target, when a pitch was heard */
  cents: number | null;
  /** what the detector heard, for the details table */
  detected: string;
}

export interface LiveInput {
  frame: PitchFrame;
  targetMidi: number | null;
  targetName: string;
  scale: Scale;
  tonic: number;
  a4: number;
  notation: Notation;
  silentFor: number;
  /** what to say about holding, e.g. 'Hold it for about a second.' */
  holdHint?: string;
}

/** Turn one microphone frame into short guidance toward a target note. */
export function liveGuidance(i: LiveInput): LiveGuidance {
  const { frame } = i;
  if (frame.frequency == null || frame.clarity < 0.5) {
    if (frame.rms >= 0.01 && frame.clarity > 0.2) {
      return { kind: 'unclear', headline: "Can't hear clearly", detail: 'Sing a steady "aa", a little louder.', cents: null, detected: 'Unclear' };
    }
    return { kind: 'silent', headline: `Sing ${i.targetName}`, detail: i.silentFor > 2 ? (i.holdHint ?? 'Hold it for about a second.') : '', cents: null, detected: 'Nothing yet' };
  }
  const midi = midiFromHz(frame.frequency, i.a4);
  const detected = detectedLabel(midi, i.scale, i.notation, i.tonic);
  if (i.targetMidi == null) return { kind: 'onPitch', headline: 'Listening', detail: '', cents: null, detected };
  const cents = Math.round((midi - i.targetMidi) * 100);
  if (Math.abs(cents) <= 20) return { kind: 'onPitch', headline: 'On pitch', detail: 'Hold it.', cents, detected };
  if (Math.abs(cents) <= 60) {
    const high = cents > 0;
    return { kind: high ? 'slightlyHigh' : 'slightlyLow', headline: high ? 'A little high' : 'A little low', detail: high ? 'Lower your pitch slightly.' : 'Raise your pitch slightly.', cents, detected };
  }
  return { kind: 'wrongNote', headline: `That didn't match ${i.targetName}`, detail: 'Listen to the reference and try again.', cents, detected };
}

export interface NextStep {
  headline: string;
  detail: string;
  action?: { label: string; title: string; sequence: string; hold?: number };
}

/** One observation and one action for the review page. */
export function nextStep(session: PracticeSession, report: PerformanceReport, scale: Scale, notation: Notation): NextStep {
  const targets = session.targets ?? [];
  const matched = targets.filter((t) => t.matchedAt != null && t.cents != null);
  const fam = (f: string) => familyName(f as Token['family'], scale.tradition);
  if (targets.length && matched.length) {
    const byToken = new Map<string, { tok: Token; cents: number[]; attempts: number }>();
    for (const t of matched) {
      const tok = parseToken(t.token);
      if (!tok) continue;
      const e = byToken.get(t.token) ?? { tok, cents: [], attempts: 0 };
      e.cents.push(t.cents!);
      e.attempts += t.attempts;
      byToken.set(t.token, e);
    }
    let worst: { tok: Token; mean: number; retries: number } | null = null;
    let worstScore = -1;
    for (const [, e] of byToken) {
      const mean = e.cents.reduce((a, b) => a + b, 0) / e.cents.length;
      const retries = Math.max(0, e.attempts - e.cents.length);
      const s = Math.abs(mean) + 15 * retries;
      if (s > worstScore) { worstScore = s; worst = { tok: e.tok, mean, retries }; }
    }
    const unmatched = targets.length - matched.length;
    if (worst && (Math.abs(worst.mean) > 20 || worst.retries >= 2)) {
      const name = tokenSpoken(worst.tok, notation, session.tonic, scale);
      const order = ['S', 'R', 'G', 'M', 'P', 'D', 'N'];
      const idx = order.indexOf(worst.tok.family);
      const suffix = worst.tok.octave > 0 ? "'" : worst.tok.octave < 0 ? ',' : '';
      const seq = idx === 0 ? 'S R S R S' : `${order[idx - 1]}${suffix} ${worst.tok.family}${suffix} ${order[Math.min(6, idx + 1)]}${suffix} ${worst.tok.family}${suffix} ${order[idx - 1]}${suffix}`;
      const phrase = seq.split(' ').map((t) => fam(t[0])).join('–');
      const how = worst.mean > 20 ? 'a little high' : worst.mean < -20 ? 'a little low' : `matched only after ${worst.retries} retries`;
      return {
        headline: `Practise ${name} before repeating the scale`,
        detail: `${name} was ${how}${Math.abs(worst.mean) > 20 ? ` (${worst.mean > 0 ? '+' : ''}${Math.round(worst.mean)} cents)` : ''}. Start with ${phrase}, slowly.`,
        action: { label: `Practise ${phrase}`, title: `${phrase} drill`, sequence: seq, hold: 1 },
      };
    }
    if (unmatched > 0) {
      return {
        headline: 'Finish the whole exercise next time',
        detail: `${matched.length} of ${targets.length} notes matched. Hold each note until it turns green before moving on.`,
        action: { label: 'Repeat the exercise', title: session.lessonTitle, sequence: (session.lessonSequence ?? []).join(' ') },
      };
    }
    return {
      headline: 'Every note matched. Try it a little faster',
      detail: 'All notes were within 20 cents. Keep the same Sa and shorten each hold slightly.',
      action: { label: 'Repeat the exercise', title: session.lessonTitle, sequence: (session.lessonSequence ?? []).join(' '), hold: 0.6 },
    };
  }
  if (!report.events.length) return { headline: 'No clear notes were heard', detail: 'Sing a little louder and closer to the phone, holding each note for about a second.' };
  if (report.within20 >= 0.7 && report.scaleToneFraction >= 0.9) return { headline: 'Good tuning throughout', detail: 'Most notes were within 20 cents. Try a guided lesson to work on sequence and pace.' };
  const off = report.degrees.filter((d) => !d.isScaleTone).sort((a, b) => b.seconds - a.seconds)[0];
  if (off && off.seconds > 0.5) {
    return { headline: `${describeSemitone(off.semitone, scale, notation, session.tonic)} is outside this scale`, detail: `You spent ${off.seconds.toFixed(1)} s on it. Sing the scale slowly and check each note against its tile.` };
  }
  return { headline: 'Notes landed between pitches', detail: `Average deviation was ${Math.round(report.meanAbsCents)} cents. Slow down and hold each note until it turns green.` };
}
