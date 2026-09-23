import { describe, expect, it } from 'vitest';
import { analyze, noteSequence, score, summaryText, hasVoice } from './analyzer';
import { BUILT_IN_LESSONS } from './lesson';
import { hzFromMidi, midiFromHz, westernName, YinPitchDetector } from './pitch';
import { degreeName, reading, scaleById, SCALES } from './scale';
import type { PitchSample } from './session';

const sine = (hz: number, sr: number, n: number, amp = 0.3) =>
  Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / sr));

describe('YinPitchDetector', () => {
  it('detects pure sines within 0.5%', () => {
    const det = new YinPitchDetector(48000);
    for (const hz of [110, 146.83, 220, 329.63, 440, 659.25]) {
      const f = det.analyze(sine(hz, 48000, 4096));
      expect(f.frequency).not.toBeNull();
      expect(Math.abs(f.frequency! - hz)).toBeLessThan(hz * 0.005);
      expect(f.clarity).toBeGreaterThan(0.9);
    }
  });
  it('detects a harmonic-rich tone', () => {
    const sr = 44100, f0 = 196, n = 4096;
    const s = new Float32Array(n);
    for (let h = 1; h <= 6; h++) {
      const p = sine(f0 * h, sr, n, 0.25 / h);
      for (let i = 0; i < n; i++) s[i] += p[i];
    }
    expect(Math.abs(new YinPitchDetector(sr).analyze(s).frequency! - f0)).toBeLessThan(1.5);
  });
  it('treats silence as unvoiced and noise as unclear', () => {
    const det = new YinPitchDetector(48000);
    expect(det.analyze(new Float32Array(4096)).frequency).toBeNull();
    const noise = Float32Array.from({ length: 4096 }, () => Math.random() * 0.6 - 0.3);
    expect(det.analyze(noise).clarity).toBeLessThan(0.6);
  });
});

describe('pitch maths and scales', () => {
  it('converts', () => {
    expect(midiFromHz(440)).toBeCloseTo(69, 9);
    expect(hzFromMidi(57)).toBeCloseTo(220, 6);
    expect(westernName(60)).toBe('C4');
    expect(westernName(58)).toBe('A♯3');
  });
  it('has consistent scales and lessons', () => {
    expect(new Set(SCALES.map((s) => s.id)).size).toBe(SCALES.length);
    for (const s of SCALES) expect(s.intervals).toContain(0);
    for (const l of BUILT_IN_LESSONS) expect(SCALES.some((s) => s.id === l.scaleId)).toBe(true);
  });
  it('reads on-scale and off-scale notes', () => {
    const r = reading(scaleById('major'), 64.08, 0);
    expect(r.chromaticMidi).toBe(64);
    expect(r.isScaleTone).toBe(true);
    expect(r.scaleCents).toBeCloseTo(8, 6);
    expect(r.accuracy).toBe('inTune');
    const r2 = reading(scaleById('mohanam'), 65.1, 0);
    expect(r2.isScaleTone).toBe(false);
    expect(r2.scaleMidi).toBe(64);
    expect(r2.scaleCents).toBeCloseTo(110, 6);
    expect(r2.accuracy).toBe('offScale');
    const major = scaleById('major');
    expect(reading(major, 66, 2).isScaleTone).toBe(true);
    expect(reading(major, 65, 2).isScaleTone).toBe(false);
    expect(degreeName(major, 4, 2, 'western')).toBe('F♯');
    expect(degreeName(major, 4, 2, 'indian')).toBe('G');
  });
});

function trace(notes: [number, number][], hop = 0.05): PitchSample[] {
  const out: PitchSample[] = [];
  let t = 0;
  for (const [m, hold] of notes) {
    for (let e = 0; e < hold; e += hop) {
      out.push({ t, hz: hzFromMidi(m), clarity: 0.95, rms: 0.1 });
      t += hop;
    }
  }
  return out;
}

describe('analyze', () => {
  it('recognises an ascending sarali', () => {
    const sh = scaleById('shankarabharanam');
    const r = analyze(trace([60.05, 62.1, 63.9, 65.0, 67.15, 69.0, 70.8, 72.0].map((m) => [m, 0.5])), sh, 0, 440);
    expect(r.events.map((e) => e.semitoneFromTonic)).toEqual([0, 2, 4, 5, 7, 9, 11, 0]);
    expect(r.scaleToneFraction).toBeCloseTo(1, 9);
    expect(r.within50).toBeCloseTo(1, 9);
    expect(r.within20).toBeGreaterThan(0.8);
    expect(r.lowestMidi).toBe(60);
    expect(r.highestMidi).toBe(72);
    expect(noteSequence(r, sh, 0, 'indian')).toBe('S R G m P D N S');
    expect(noteSequence(r, sh, 0, 'western')).toBe('C D E F G A B C');
    expect(score(r)).toBeGreaterThan(80);
    const text = summaryText(r, sh, 0);
    expect(text).toContain('Shankarabharanam');
    expect(text).toContain('Note sequence');
  });
  it('flags off-scale notes', () => {
    const moh = scaleById('mohanam');
    const r = analyze(trace([[60, 0.5], [62, 0.5], [65, 0.5], [67, 0.5]]), moh, 0, 440);
    expect(r.events.filter((e) => !e.isScaleTone)).toHaveLength(1);
    expect(r.scaleToneFraction).toBeCloseTo(0.75, 9);
    expect(noteSequence(r, moh, 0, 'indian')).toContain('(m)');
    expect(summaryText(r, moh, 0)).toContain('outside the scale');
  });
  it('ignores unvoiced samples', () => {
    const samples = Array.from({ length: 40 }, (_, i) => ({ t: i * 0.05, hz: 0, clarity: 0, rms: 0 }));
    const r = analyze(samples, scaleById('major'), 0, 440);
    expect(hasVoice(r)).toBe(false);
    expect(score(r)).toBe(0);
  });
});
