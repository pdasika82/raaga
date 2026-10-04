import { describe, expect, it } from 'vitest';
import { noteCredit, targetScore } from './targetScore';
import type { TargetMark } from './session';

const mark = (token: string, midi: number, sung: number | null, matched: boolean): TargetMark => ({
  index: 0, token, midi, start: 0, attempts: 1, detected: sung,
  matchedAt: matched ? 1 : null, cents: matched && sung != null ? Math.round((sung - midi) * 100) : null,
});

describe('targetScore', () => {
  it('credits by distance from the asked note', () => {
    expect(noteCredit(5)).toBe(1);
    expect(noteCredit(-40)).toBe(0.75);
    expect(noteCredit(60)).toBe(0.5);
    expect(noteCredit(80)).toBe(0);
    expect(noteCredit(null)).toBe(0);
  });
  it('scores zero when every note is a different swara, even if those are in tune', () => {
    const ts = targetScore([mark('S', 46, 49.49, false), mark('S', 46, 50.2, false), mark('S', 46, 41.45, false), mark('S', 46, 42.04, false)])!;
    expect(ts.score).toBe(0);
    expect(ts.matched).toBe(0);
    expect(ts.notes.every((n) => n.verdict === 'wrong')).toBe(true);
    expect(ts.avgDistance).toBe(405);
  });
  it('averages credits', () => {
    const ts = targetScore([mark('S', 60, 60.05, true), mark('R', 62, 62.4, true), mark('G', 64, null, false)])!;
    expect(ts.notes.map((n) => n.verdict)).toEqual(['match', 'near', 'silent']);
    expect(ts.score).toBe(58); // (1 + 0.75 + 0) / 3
    expect(ts.matched).toBe(2);
  });
  it('returns null without targets', () => {
    expect(targetScore(undefined)).toBeNull();
    expect(targetScore([])).toBeNull();
  });
});
