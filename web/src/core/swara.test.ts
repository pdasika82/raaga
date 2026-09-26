import { describe, expect, it } from 'vitest';
import { liveGuidance, nextStep } from './guidance';
import { analyze } from './analyzer';
import { scaleById } from './scale';
import { describeSemitone, detectedLabel, parseSequence, resolveDegrees, scaleGlossary, startingMidi, tokenLabel, tokenMidi, tokenSpoken } from './swara';
import type { PracticeSession } from './session';

describe('swara resolution', () => {
  it('resolves families for melakarta scales', () => {
    expect(resolveDegrees(scaleById('shankarabharanam'))).toEqual({ S: 0, R: 2, G: 4, M: 5, P: 7, D: 9, N: 11 });
    expect(resolveDegrees(scaleById('kalyani')).M).toBe(6);
    expect(resolveDegrees(scaleById('mayamalavagowla'))).toEqual({ S: 0, R: 1, G: 4, M: 5, P: 7, D: 8, N: 11 });
  });
  it('drops missing families in pentatonics', () => {
    expect(resolveDegrees(scaleById('mohanam'))).toEqual({ S: 0, R: 2, G: 4, P: 7, D: 9 });
  });
  it('parses sequences with octave marks', () => {
    const seq = parseSequence("S R G M P D N S' S' N, ṡ");
    expect(seq.map((t) => `${t.family}${t.octave}`)).toEqual(['S0', 'R0', 'G0', 'M0', 'P0', 'D0', 'N0', 'S1', 'S1', 'N-1', 'S1']);
  });
  it('labels tiles with full names and octave dots', () => {
    const sh = scaleById('shankarabharanam');
    const [s, r, up] = parseSequence("S R S'");
    expect(tokenLabel(s, 'indian', 0, sh)).toBe('Sa');
    expect(tokenLabel(r, 'indian', 0, sh)).toBe('Ri');
    expect(tokenLabel(up, 'indian', 0, sh)).toBe('Ṡa');
    expect(tokenLabel(r, 'indian', 0, scaleById('yaman'))).toBe('Re');
    expect(tokenLabel(r, 'western', 2, sh)).toBe('E');
    expect(tokenSpoken(up, 'indian', 0, sh)).toBe('upper Sa');
    expect(tokenMidi(s, sh, 55)).toBe(55);
    expect(tokenMidi(up, sh, 55)).toBe(67);
    expect(tokenMidi(parseSequence('M')[0], scaleById('kalyani'), 60)).toBe(66);
    expect(tokenMidi(parseSequence('M')[0], scaleById('mohanam'), 60)).toBeNull();
    expect(startingMidi(7, 3)).toBe(55);
  });
  it('uses Carnatic names for Carnatic scales and Hindustani for Hindustani', () => {
    const sh = scaleById('shankarabharanam');
    expect(describeSemitone(2, sh, 'indian', 0)).toBe('Ri');
    expect(describeSemitone(1, sh, 'indian', 0)).toBe('Ri₁');
    expect(describeSemitone(3, sh, 'indian', 0)).toBe('Ga₂');
    expect(describeSemitone(6, sh, 'indian', 0)).toBe('Ma₂');
    expect(describeSemitone(6, sh, 'western', 0)).toBe('F♯');
    const yaman = scaleById('yaman');
    expect(describeSemitone(6, yaman, 'indian', 0)).toBe('Ma');
    expect(describeSemitone(5, yaman, 'indian', 0)).toBe('Ma');
    expect(describeSemitone(1, yaman, 'indian', 0)).toBe('komal Re');
    expect(scaleGlossary(sh)).toBe('Ri₂: Chatusruti Rishabham · Ga₃: Antara Gandharam · Ma₁: Shuddha Madhyamam · Dha₂: Chatusruti Dhaivatam · Ni₃: Kakali Nishadam');
  });
  it('words detections with appropriate confidence', () => {
    const sh = scaleById('shankarabharanam');
    expect(detectedLabel(62.1, sh, 'indian', 0)).toBe('near Ri');
    expect(detectedLabel(61.05, sh, 'indian', 0)).toBe('near Ri₁ (outside this scale)');
    expect(detectedLabel(61.5, sh, 'indian', 0)).toBe('between Ri₁ and Ri');
    expect(detectedLabel(63.55, sh, 'indian', 0)).toBe('between Ga₂ and Ga');
  });
});

describe('live guidance', () => {
  const base = { scale: scaleById('shankarabharanam'), tonic: 0, a4: 440, notation: 'indian' as const, targetName: 'Sa', silentFor: 0 };
  const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
  it('classifies without naming the wrong note in the headline', () => {
    expect(liveGuidance({ ...base, targetMidi: 60, frame: { rms: 0, frequency: null, clarity: 0 } }).kind).toBe('silent');
    expect(liveGuidance({ ...base, targetMidi: 60, frame: { rms: 0.05, frequency: null, clarity: 0.3 } }).kind).toBe('unclear');
    const on = liveGuidance({ ...base, targetMidi: 60, frame: { rms: 0.1, frequency: hz(60.1), clarity: 0.9 } });
    expect(on.kind).toBe('onPitch');
    expect(on.detected).toBe('near Sa');
    const low = liveGuidance({ ...base, targetMidi: 60, frame: { rms: 0.1, frequency: hz(59.7), clarity: 0.9 } });
    expect(low.headline).toBe('A little low');
    expect(low.detail).toBe('Raise your pitch slightly.');
    const w = liveGuidance({ ...base, targetMidi: 60, frame: { rms: 0.1, frequency: hz(62), clarity: 0.9 } });
    expect(w.kind).toBe('wrongNote');
    expect(w.headline).toBe("That didn't match Sa");
    expect(w.detail).toBe('Listen to the reference and try again.');
    expect(w.detected).toBe('near Ri');
    expect(liveGuidance({ ...base, targetMidi: 60, frame: { rms: 0.1, frequency: hz(61), clarity: 0.9 } }).detected).toBe('near Ri₁ (outside this scale)');
  });
});

describe('next step', () => {
  const sh = scaleById('shankarabharanam');
  const session = (targets: PracticeSession['targets']): PracticeSession => ({
    id: 'x', date: '', lessonId: 'sarali_1', lessonTitle: 'Sarali Varisai 1', lessonInstructions: '', scaleId: 'shankarabharanam', tonic: 0, a4: 440,
    duration: 10, audioMime: '', samples: [], mode: 'guided', lessonSequence: ['S', 'R', 'G'], targets,
  });
  const report = analyze([], sh, 0, 440);
  it('picks the worst note and proposes a phrase', () => {
    const ns = nextStep(session([
      { index: 0, token: 'S', midi: 60, start: 0, matchedAt: 1, cents: 3, attempts: 1 },
      { index: 1, token: 'R', midi: 62, start: 1, matchedAt: 3, cents: 34, attempts: 3 },
      { index: 2, token: 'G', midi: 64, start: 3, matchedAt: 4, cents: -5, attempts: 1 },
    ]), report, sh, 'indian');
    expect(ns.headline).toBe('Practise Ri before repeating the scale');
    expect(ns.action?.sequence).toBe('S R G R S');
    expect(ns.action?.label).toBe('Practise Sa–Ri–Ga–Ri–Sa');
  });
  it('praises a clean run and notes unfinished ones', () => {
    expect(nextStep(session([
      { index: 0, token: 'S', midi: 60, start: 0, matchedAt: 1, cents: 3, attempts: 1 },
      { index: 1, token: 'R', midi: 62, start: 1, matchedAt: 2, cents: -8, attempts: 1 },
    ]), report, sh, 'indian').headline).toContain('Every note matched');
    expect(nextStep(session([
      { index: 0, token: 'S', midi: 60, start: 0, matchedAt: 1, cents: 3, attempts: 1 },
      { index: 1, token: 'R', midi: 62, start: 1, matchedAt: null, cents: null, attempts: 2 },
    ]), report, sh, 'indian').headline).toContain('Finish the whole exercise');
  });
});
