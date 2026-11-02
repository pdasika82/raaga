/** Wire contract shared by the server and web client. No provider credentials. */
export type AttemptStatus = 'queued' | 'analyzing' | 'graded' | 'needs_review' | 'failed';
export interface Exercise {
  id: string; title: string; art: 'raaga'; instructions: string;
  sequence: string[]; midi: number[]; bpm: number; tonic: string;
  noteSeconds: number; pitchToleranceCents: number; onsetToleranceSeconds: number;
  expectedLyrics?: string; rubricVersion: string;
}
export interface NoteMeasurement {
  label: string; expectedMidi: number; measuredMidi: number | null;
  centsError: number | null; expectedStart: number; actualStart: number | null;
  timingError: number | null; coverage: number;
}
export interface Measurements {
  detector: string; duration: number; startOffset: number; voicedFraction: number;
  pitchAccuracy: number; timingAccuracy: number; score: number;
  notes: NoteMeasurement[]; rubricVersion: string;
  lyricsAccuracy: number | null;
  transcription: { status: 'not_applicable' | 'unavailable' | 'assessed'; text?: string; words?: { word: string; start: number; end: number; confidence: number }[] };
}
export interface PracticeFeedback {
  summary: string; feedback: string[];
  practiceNext: { exerciseId: string; reason: string };
  source: 'anthropic' | 'rules'; model: string;
}
export interface SavedAttempt {
  id: string; studentId: string; exerciseId: string; exerciseTitle: string;
  runId: string; status: AttemptStatus; filename: string; createdAt: string;
  gradedAt: string | null; score: number | null; error: string | null;
  measurements: Measurements | null; feedback: PracticeFeedback | null;
  notification: 'pending' | 'complete' | 'attention' | 'not_applicable';
  deliveries: { name: string; role: string; status: string }[];
}
