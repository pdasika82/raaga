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
