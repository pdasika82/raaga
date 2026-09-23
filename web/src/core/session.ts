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
  };
}
