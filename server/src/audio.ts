import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { YinPitchDetector, midiFromHz } from '../../web/src/core/pitch.ts';
import type { Exercise, Measurements, NoteMeasurement } from '../../shared/attempts.ts';

const exec = promisify(execFile);
export class RecordingError extends Error {}
export interface PitchFrame { t: number; midi: number | null; clarity: number }
const RATE = 12000, WINDOW = 1024, HOP = 240;

export async function decodeRecording(path: string): Promise<{ pcm: Float32Array; duration: number }> {
  try {
    const probe = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', path], { timeout: 15000, maxBuffer: 1024 * 1024 });
    const duration = Number(JSON.parse(probe.stdout).format?.duration);
    if (!Number.isFinite(duration) || duration < 1 || duration > 120) throw new RecordingError('Use a recording between 1 second and 2 minutes.');
    const { stdout } = await exec('ffmpeg', ['-nostdin', '-v', 'error', '-i', path, '-t', '120', '-vn', '-ac', '1', '-ar', String(RATE), '-f', 'f32le', 'pipe:1'],
      { timeout: 30000, maxBuffer: RATE * 121 * 4, encoding: 'buffer' });
    const pcm = new Float32Array(stdout.length / 4);
    for (let i = 0; i < pcm.length; i++) pcm[i] = stdout.readFloatLE(i * 4);
    if (pcm.some(x => !Number.isFinite(x))) throw new RecordingError('The recording contains invalid audio samples.');
    return { pcm, duration: pcm.length / RATE };
  } catch (error) {
    if (error instanceof RecordingError) throw error;
    throw new RecordingError('Could not decode audio. Upload a valid WAV, MP3, M4A, or a video with an audio track.');
  }
}

export function detectPitch(pcm: Float32Array): PitchFrame[] {
  const detector = new YinPitchDetector(RATE);
  const frames: PitchFrame[] = [];
  for (let at = 0; at + WINDOW <= pcm.length; at += HOP) {
    const pitch = detector.analyze(pcm.subarray(at, at + WINDOW));
    frames.push({ t: (at + WINDOW / 2) / RATE, midi: pitch.frequency && pitch.clarity >= 0.85 ? midiFromHz(pitch.frequency) : null, clarity: pitch.clarity });
  }
  return frames;
}
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const round = (n: number) => Math.round(n * 1000) / 1000;

/** Fixed-tempo rubric. Only leading silence is aligned; pitch and tempo errors remain. */
export function scoreFrames(frames: PitchFrame[], duration: number, exercise: Exercise): Measurements {
  const voiced = frames.filter(frame => frame.midi !== null);
  if (!voiced.length) throw new RecordingError('No clear pitched audio was detected. Try a louder solo recording.');
  // Reject short clicks as the start anchor: require 120 ms of contiguous voice.
  const first = frames.findIndex((frame, i) => frame.midi !== null && frames.slice(i, i + 6).length === 6 && frames.slice(i, i + 6).every(f => f.midi !== null));
  if (first < 0) throw new RecordingError('Not enough sustained pitch to assess this exercise.');
  const startOffset = frames[first].t;
  const expectedDuration = exercise.midi.length * exercise.noteSeconds;
  const voicedInExercise = voiced.filter(f => f.t >= startOffset && f.t < startOffset + expectedDuration);
  const voicedFraction = Math.min(1, voicedInExercise.length * HOP / RATE / expectedDuration);
  if (voicedFraction < 0.45) throw new RecordingError('Too little of the assigned phrase is audible. Record the complete exercise once.');

  const onsets: number[] = [startOffset];
  let lastVoiced = startOffset, lastMidi = frames[first].midi!;
  for (let i = first + 1; i < frames.length; i++) {
    const frame = frames[i];
    if (frame.midi === null) continue;
    const changed = Math.abs(frame.midi - lastMidi) > 0.75;
    const gap = frame.t - lastVoiced > 0.12;
    const stable = frames.slice(i, i + 4).length === 4 && frames.slice(i, i + 4).every(f => f.midi !== null && Math.abs(f.midi - frame.midi!) < 0.5);
    if ((changed || gap) && stable && frame.t - onsets[onsets.length - 1] > 0.2) { onsets.push(frame.t); lastMidi = frame.midi; }
    lastVoiced = frame.t;
  }
  let pitchSum = 0, timingSum = 0;
  const usedOnsets = new Set<number>();
  const notes: NoteMeasurement[] = exercise.midi.map((expectedMidi, index) => {
    const expectedStart = startOffset + index * exercise.noteSeconds;
    const window = frames.filter(f => f.t >= expectedStart + 0.12 && f.t < expectedStart + exercise.noteSeconds - 0.08);
    const noteVoiced = window.filter(f => f.midi !== null);
    const coverage = noteVoiced.length / Math.max(1, Math.round((exercise.noteSeconds - 0.2) / (HOP / RATE)));
    const measuredMidi = noteVoiced.length ? median(noteVoiced.map(f => f.midi!)) : null;
    const inTune = noteVoiced.filter(f => Math.abs(f.midi! - expectedMidi) * 100 <= exercise.pitchToleranceCents).length;
    pitchSum += Math.min(1, inTune / Math.max(1, Math.round((exercise.noteSeconds - 0.2) / (HOP / RATE))));
    const closest = onsets.filter(t => !usedOnsets.has(t)).sort((a, b) => Math.abs(a - expectedStart) - Math.abs(b - expectedStart))[0];
    const actualStart = closest !== undefined && Math.abs(closest - expectedStart) <= exercise.noteSeconds * 0.45 ? closest : null;
    if (actualStart !== null) usedOnsets.add(actualStart);
    const timingError = actualStart === null ? null : actualStart - expectedStart;
    if (timingError !== null && Math.abs(timingError) <= exercise.onsetToleranceSeconds && coverage >= 0.5) timingSum++;
    return { label: exercise.sequence[index], expectedMidi, measuredMidi: measuredMidi === null ? null : round(measuredMidi),
      centsError: measuredMidi === null ? null : Math.round((measuredMidi - expectedMidi) * 100),
      expectedStart: round(expectedStart), actualStart: actualStart === null ? null : round(actualStart),
      timingError: timingError === null ? null : round(timingError), coverage: round(Math.min(1, coverage)) };
  });
  const pitchAccuracy = Math.round(100 * pitchSum / notes.length), timingAccuracy = Math.round(100 * timingSum / notes.length);
  return { detector: 'yin-12000-v1', duration: round(duration), startOffset: round(startOffset), voicedFraction: round(voicedFraction),
    pitchAccuracy, timingAccuracy, score: Math.round(0.8 * pitchAccuracy + 0.2 * timingAccuracy), notes,
    rubricVersion: exercise.rubricVersion, lyricsAccuracy: null, transcription: { status: 'not_applicable' } };
}

export async function analyzeRecording(path: string, exercise: Exercise): Promise<Measurements> {
  const { pcm, duration } = await decodeRecording(path);
  return scoreFrames(detectPitch(pcm), duration, exercise);
}
