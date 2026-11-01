import { describe, expect, it } from 'vitest';
import { practiceGrade } from './grading';

describe('practice grades', () => {
  it('uses documented bands, including a genuine zero', () => {
    for (const [value, letter] of [[100, 'A'], [90, 'A'], [89, 'B'], [80, 'B'], [79, 'C'], [70, 'C'], [69, 'D'], [60, 'D'], [59, 'E'], [0, 'E']] as const) {
      expect(practiceGrade(value)).toMatchObject({ score: value, letter });
    }
    for (const value of [null, NaN, Infinity, -1, 101]) expect(practiceGrade(value)).toBeNull();
  });

});
