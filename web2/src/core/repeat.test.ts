import { describe, expect, it } from 'vitest';
import { hzFromMidi } from '@core/pitch';
import type { PitchSample } from '@core/session';
import { compareTake } from './repeat';

function take(midis: (number | null)[], beat: number, start: number, lag = 0): PitchSample[] {
  const out: PitchSample[] = [];
  for (let t = 0; t < start + midis.length * beat + 1; t += 0.043) {
    const i = Math.floor((t - start - lag) / beat);
    const m = i >= 0 && i < midis.length ? midis[i] : null;
    out.push(m == null ? { t, hz: 0, clarity: 0, rms: 0 } : { t, hz: hzFromMidi(m), clarity: 0.9, rms: 0.1 });
  }
  return out;
}
const targets = [60, 62, 64, 62, 60].map((midi, i) => ({ token: ['S', 'R', 'G', 'R', 'S'][i], midi }));

describe('compareTake', () => {
  it('matches an in-tune take', () => {
    const c = compareTake(take([60, 62, 64, 62, 60], 1, 2), targets, 1, 2);
    expect(c.results.map((r) => r.verdict)).toEqual(['match', 'match', 'match', 'match', 'match']);
    expect(c.matched).toBe(5);
    expect(c.offsetBeats).toBe(0);
  });
  it('flags near, wrong and silent beats', () => {
    const c = compareTake(take([60, 62.4, 65, null, 60], 1, 2), targets, 1, 2);
    expect(c.results.map((r) => r.verdict)).toEqual(['match', 'near', 'wrong', 'silent', 'match']);
    expect(c.results[1].cents).toBe(40);
    expect(c.matched).toBe(3);
  });
  it('aligns a singer who starts late', () => {
    const c = compareTake(take([60, 62, 64, 62, 60], 1, 2, 0.6), targets, 1, 2);
    expect(c.matched).toBe(5);
    expect(c.offsetBeats).toBeGreaterThan(0);
    const early = compareTake(take([60, 62, 64, 62, 60], 1, 2, -0.6), targets, 1, 2);
    expect(early.matched).toBe(5);
    expect(early.offsetBeats).toBeLessThan(0);
  });
});

import { compareFree } from './repeat';
describe('compareFree', () => {
  const targets = [60, 62, 64].map((midi, i) => ({ token: 'SRG'[i], midi }));
  it('compares detected notes in order and marks missing ones silent', () => {
    const c = compareFree([{ midi: 60.05, at: 1 }, { midi: 62.5, at: 2 }], targets);
    expect(c.results.map((r) => r.verdict)).toEqual(['match', 'near', 'silent']);
    expect(c.matched).toBe(2);
    expect(c.offsetBeats).toBe(0);
  });
  it('does not let one extra note shift the rest', () => {
    // S R G R S sung, with Ga counted twice (settled sharper the second time)
    const t5 = [60, 62, 64, 62, 60].map((midi, i) => ({ token: 'SRGRS'[i], midi }));
    const c = compareFree([{ midi: 60, at: 1 }, { midi: 62.2, at: 2 }, { midi: 63.6, at: 3 }, { midi: 64.4, at: 3.5 }, { midi: 62, at: 4 }, { midi: 60, at: 5 }], t5);
    expect(c.results.map((r) => r.verdict)).toEqual(['match', 'match', 'near', 'match', 'match']);
    expect(c.matched).toBe(5);
  });
  it('marks a genuinely wrong note without shifting', () => {
    const t5 = [60, 62, 64, 62, 60].map((midi, i) => ({ token: 'SRGRS'[i], midi }));
    const c = compareFree([{ midi: 60, at: 1 }, { midi: 62, at: 2 }, { midi: 65, at: 3 }, { midi: 62, at: 4 }, { midi: 60, at: 5 }], t5);
    expect(c.results.map((r) => r.verdict)).toEqual(['match', 'match', 'wrong', 'match', 'match']);
  });
});

import { parseSequence } from '@core/swara';
describe('karvai and speeds', () => {
  it('parses a standalone comma as a held count', () => {
    const t = parseSequence("S R G M P , G M | P , , , P , , ,");
    expect(t.map((x) => `${x.family}${x.units}`)).toEqual(['S1', 'R1', 'G1', 'M1', 'P2', 'G1', 'M1', 'P4', 'P4']);
    expect(parseSequence("N, R")[0].octave).toBe(-1); // attached comma is still the lower-octave mark
  });
  it('compares held notes over their full duration', () => {
    const targets = [{ token: 'S', midi: 60 }, { token: 'P', midi: 67, units: 2 }, { token: 'S', midi: 60 }];
    // one count = 0.5 s; Pa lasts a full second
    const c = compareTake(take([60, 67, 67, 60], 0.5, 1), targets, 0.5, 1);
    expect(c.results.map((r) => r.verdict)).toEqual(['match', 'match', 'match']);
  });
});
