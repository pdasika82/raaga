// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { PracticeSession, TargetMark } from '@core/session';
import { raagaGrading } from './grading';

const target: TargetMark = { index: 0, token: 'S', midi: 60, start: 0, matchedAt: 1, cents: 0, attempts: 1, detected: 60 };
export const take: PracticeSession = { id: 'test-take', date: '2026-11-01T12:00:00Z', lessonId: 'first_notes', lessonTitle: 'Test phrase', lessonInstructions: 'Sing Sa', scaleId: 'shankarabharanam', tonic: 0, a4: 440, duration: 2, audioMime: 'audio/webm', samples: [], targets: [target] };

function grade(session: PracticeSession): HTMLElement {
  const el = raagaGrading(session, 'indian');
  el.querySelector('button')!.click();
  return el;
}

describe('Raaga practice grade', () => {
  it('grades the requested pitch and includes missed notes in the score', () => {
    expect(grade(take).textContent).toContain('100/100');
    const el = grade({ ...take, targets: [target, { ...target, index: 1, matchedAt: null, cents: null, detected: null }] });
    expect(el.textContent).toContain('50/100');
    expect(el.textContent).toContain('Matched 1 of 2');
    expect(el.textContent).toContain('Guided pitch grade');
  });

  it('distinguishes wrong notes from silence rather than inventing a grade', () => {
    expect(grade({ ...take, targets: [{ ...target, matchedAt: null, cents: null, detected: 64 }] }).textContent).toContain('0/100');
    const el = grade({ ...take, targets: [{ ...target, matchedAt: null, cents: null, detected: null }] });
    expect(el.textContent).toContain('Not enough evidence to grade');
    expect(el.textContent).not.toContain('0/100');
  });

  it('labels unprompted singing as tuning only and supports closing the result', () => {
    const samples = Array.from({ length: 24 }, (_, i) => ({ t: i / 12, hz: 261.625565, clarity: 1, rms: 0.1 }));
    const el = grade({ ...take, targets: undefined, samples });
    expect(el.textContent).toContain('Free-practice tuning grade');
    expect(el.textContent).toContain('100/100');
    expect(el.textContent).toContain('does not grade lesson completion');
    el.querySelector('button')!.click();
    expect(el.querySelector('button')!.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector<HTMLDivElement>('div')!.hidden).toBe(true);
    expect(grade({ ...take, targets: undefined }).textContent).toContain('Not enough evidence to grade');
  });
});
