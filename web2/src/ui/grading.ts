import { analyze } from '@core/analyzer';
import { nextStep } from '@core/guidance';
import type { Notation } from '@core/pitch';
import { scaleById } from '@core/scale';
import type { PracticeSession } from '@core/session';
import { GRADE_SCALE, practiceGrade } from '../core/grading';
import { h } from './dom';
import { sessionScore } from './scorecard';

export function gradeResult(value: number | null, basis: string, summary: string, next: string, limits: string): HTMLElement {
  const grade = practiceGrade(value);
  return h('div', { class: 'grade-result', role: 'status', 'aria-live': 'polite' },
    h('span', { class: 'eyebrow accent' }, basis),
    h('div', { class: 'grade-heading' },
      h('strong', { class: 'grade-letter' }, grade?.letter ?? '—'),
      h('div', {}, h('h3', {}, grade ? `${grade.score}/100 · ${grade.label}` : 'Not enough evidence to grade'), h('p', { class: 'small muted' }, summary))),
    h('p', {}, h('strong', {}, 'Next practice: '), next),
    h('p', { class: 'small muted' }, limits),
    h('details', { class: 'small grade-scale' }, h('summary', {}, 'How grades work'), h('p', {}, GRADE_SCALE), h('p', {}, 'These are app practice bands, not a teacher’s certification.')));
}

/** Available for an unsaved take too; all analysis runs locally. */
export function raagaGrading(session: PracticeSession, notation: Notation): HTMLElement {
  const panel = h('div', { hidden: true, id: `grade-${crypto.randomUUID()}` });
  const button = h('button', { class: 'btn btn-secondary', 'aria-expanded': 'false', 'aria-controls': panel.id }, 'View pitch grade');
  button.addEventListener('click', () => {
    if (!panel.hidden) {
      panel.hidden = true; button.setAttribute('aria-expanded', 'false'); button.textContent = 'View pitch grade'; return;
    }
    const scale = scaleById(session.scaleId);
    const report = analyze(session.samples, scale, session.tonic, session.a4, { totalSeconds: session.duration });
    const score = sessionScore(session, report);
    const step = nextStep(session, report, scale, notation);
    panel.replaceChildren(gradeResult(score.value, score.target ? 'Raaga · Guided pitch grade' : 'Raaga · Free-practice tuning grade',
      score.value === null ? 'No clear singing was detected in this take.' : score.summary,
      score.value === null ? 'Check your microphone, then sing a short, steady phrase and try again.' : `${step.headline} ${step.detail}`,
      score.target ? 'Based on pitch against the requested notes, including missed notes. Does not assess expression, tone, breath, or diction.' : 'Based on tuning and time on scale tones. This does not grade lesson completion, rhythm, tone, breath, or diction.'));
    panel.hidden = false; button.setAttribute('aria-expanded', 'true'); button.textContent = 'Hide pitch grade';
  });
  return h('section', { class: 'practice-grading' }, button, panel);
}
