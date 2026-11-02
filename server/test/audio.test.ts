import { describe, expect, it } from 'vitest';
import { detectPitch, scoreFrames } from '../src/audio.ts';
import { EXERCISES } from '../src/exercises.ts';
import { fixturePcm } from '../scripts/fixture-audio.ts';

describe('reference-based beginner scoring', () => {
  it('scores an in-tune phrase above the same phrase one semitone sharp', () => {
    const good = scoreFrames(detectPitch(fixturePcm()), 6, EXERCISES[0]);
    const offKey = scoreFrames(detectPitch(fixturePcm(100)), 6, EXERCISES[0]);
    expect(good.score).toBeGreaterThanOrEqual(90);
    expect(offKey.score).toBeLessThanOrEqual(35);
    expect(good.score - offKey.score).toBeGreaterThanOrEqual(50);
    expect(offKey.notes.every(n => (n.centsError || 0) >= 95)).toBe(true);
    expect(good.lyricsAccuracy).toBeNull();
  });
  it('aligns leading silence without pitch-normalizing the take', () => {
    const original = scoreFrames(detectPitch(fixturePcm(0, 12000, 0.5)), 6, EXERCISES[0]);
    const delayed = scoreFrames(detectPitch(fixturePcm(0, 12000, 2)), 7.5, EXERCISES[0]);
    expect(delayed.score).toBe(original.score);
    expect(delayed.startOffset - original.startOffset).toBeCloseTo(1.5, 1);
  });
  it('abstains for silence and an incomplete short fragment', () => {
    expect(() => scoreFrames(detectPitch(new Float32Array(72000)), 6, EXERCISES[0])).toThrow('No clear pitched audio');
    expect(() => scoreFrames(detectPitch(fixturePcm().slice(0, 18000)), 1.5, EXERCISES[0])).toThrow('complete exercise');
  });
  it('penalizes missing notes and drift instead of stretching the reference', () => {
    const frames = detectPitch(fixturePcm());
    const good = scoreFrames(frames, 6, EXERCISES[0]);
    const drift = scoreFrames(frames.map(f => ({ ...f, t: f.t * 1.2 })), 7.2, EXERCISES[0]);
    expect(drift.timingAccuracy).toBeLessThan(good.timingAccuracy);
    expect(drift.score).toBeLessThan(good.score);
  });
});
