import { describe, expect, it } from 'vitest';
import { parseFeedback } from '../src/feedback.ts';
const valid = { summary: 'The second note was sharp.', feedback: ['Match Ri to the reference.'], practiceNext: { exerciseId: 'find_sa', reason: 'Re-establish your Sa.' } };
describe('bounded coaching response', () => {
  it('accepts grounded feedback and a known next exercise', () => { expect(parseFeedback(JSON.stringify(valid))).toEqual(valid); });
  it('rejects model attempts to set the score, recipients, or an unknown assignment', () => {
    expect(() => parseFeedback(JSON.stringify({ ...valid, score: 100 }))).toThrow();
    expect(() => parseFeedback(JSON.stringify({ ...valid, recipients: ['outsider@example.test'] }))).toThrow();
    expect(() => parseFeedback(JSON.stringify({ ...valid, practiceNext: { ...valid.practiceNext, exerciseId: 'invented' } }))).toThrow('unknown exercise');
  });
});
