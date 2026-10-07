import { describe, expect, it } from 'vitest';
import { collapse, followPasses, octaveCents, type HeardNote } from './follow';

const P = [60, 62, 64, 65, 67, 69, 71, 72, 72, 71, 69, 67, 65, 64, 62, 60].map((midi, i) => ({ token: String(i), midi })); // Sarali 1
const sing = (midis: number[], t0: number, dur: number): HeardNote[] => midis.map((m, i) => ({ midi: m, start: t0 + i * dur, duration: dur * 0.9 }));
const C = collapse(P).map((p) => p.midi);

describe('follow', () => {
  it('folds octaves', () => {
    expect(octaveCents(48.1, 60)).toBe(10);
    expect(octaveCents(71.6, 60)).toBe(-40);
  });
  it('collapses repeated swaras', () => {
    expect(collapse(P).length).toBe(15);
  });
  it('finds two passes at different speeds with noise between', () => {
    const heard = [...sing([55], 0, 0.5), ...sing(C, 1, 1), ...sing([57, 59], 17, 0.3), ...sing(C, 18, 0.5)];
    const passes = followPasses(heard, P);
    expect(passes).toHaveLength(2);
    expect(passes.map((p) => p.matched)).toEqual([15, 15]);
    expect(passes[0].start).toBe(1);
    expect(passes[1].start).toBe(18);
  });
  it('reports a flat Ma and a missed note in place', () => {
    const sung = C.map((m) => (m === 65 ? 64.6 : m)).filter((_, i) => i !== 10); // Ma 40 cents flat; skip one descent note
    const [pass] = followPasses(sing(sung, 0, 1), P);
    expect(pass.notes.filter((n) => n.verdict === 'near').length).toBe(2);
    expect(pass.notes.filter((n) => n.verdict === 'missing').length).toBe(1);
    expect(pass.matched).toBe(14);
  });
  it('handles a restart partway through', () => {
    const heard = [...sing(C.slice(0, 5), 0, 1), ...sing(C, 6, 1)];
    const passes = followPasses(heard, P);
    expect(passes.find((p) => p.matched === 15)).toBeTruthy();
  });
  it('finds nothing in unrelated singing', () => {
    expect(followPasses(sing([61, 66, 61, 66], 0, 1), P)).toHaveLength(0);
  });
});
