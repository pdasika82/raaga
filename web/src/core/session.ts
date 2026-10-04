import type { Lesson } from './lesson';

/** One pitch measurement taken while recording. */
export interface PitchSample {
  /** seconds since the recording started */
  t: number;
  /** Hz, 0 if unvoiced */
  hz: number;
  clarity: number;
  rms: number;
}

/** One expected note in a guided exercise and how the singer met it. */
export interface TargetMark {
  index: number;
  token: string;
  /** absolute MIDI once the singer's Sa octave was known */
  midi: number | null;
  /** seconds into the recording when this became the target */
  start: number;
  /** seconds when it was matched, or null if skipped/unfinished */
  matchedAt: number | null;
  /** signed cents at the moment of matching */
  cents: number | null;
  attempts: number;
  /** pitch actually sung for this target (fractional MIDI), when one was heard */
  detected?: number | null;
}

export interface PracticeSession {
  id: string;
  /** ISO date */
  date: string;
  lessonId: string;
  lessonTitle: string;
  lessonInstructions: string;
  scaleId: string;
  /** tonic pitch class 0..11 */
  tonic: number;
  a4: number;
  duration: number;
  /** MIME type of the stored recording blob */
  audioMime: string;
  samples: PitchSample[];
  mode?: 'guided' | 'free';
  lessonSequence?: string[];
  targets?: TargetMark[];
  userNote?: string;
  feedback?: string;
  feedbackDate?: string;
  feedbackModel?: string;
}

export function newSession(args: {
  id: string;
  lesson: Lesson;
  tonic: number;
  a4: number;
  duration: number;
  audioMime: string;
  samples: PitchSample[];
  mode?: 'guided' | 'free';
  lessonSequence?: string[];
  targets?: TargetMark[];
}): PracticeSession {
  return {
    id: args.id,
    date: new Date().toISOString(),
    lessonId: args.lesson.id,
    lessonTitle: args.lesson.title,
    lessonInstructions: args.lesson.instructions,
    scaleId: args.lesson.scaleId,
    tonic: args.tonic,
    a4: args.a4,
    duration: args.duration,
    audioMime: args.audioMime,
    samples: args.samples,
    mode: args.mode,
    lessonSequence: args.lessonSequence,
    targets: args.targets,
  };
}
