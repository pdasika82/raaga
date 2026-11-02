// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from './app';
import type { SavedAttempt } from '../../../shared/attempts';
const api = vi.hoisted(() => ({ catalog: vi.fn(), history: vi.fn(), submit: vi.fn(), attempt: vi.fn() }));
vi.mock('../core/attemptsApi', () => ({ getExercises: api.catalog, getAttempts: api.history, submitAttempt: api.submit, getAttempt: api.attempt }));
import { SavedGradeView } from './savedGrade';
const exercise = { id: 'first_notes', title: 'First notes', instructions: 'Sing once at C4.', tonic: 'C4', bpm: 60 };
const attempt = { id: 'attempt-1', studentId: 'maya', exerciseId: 'first_notes', exerciseTitle: 'First notes', filename: 'take.wav', status: 'queued', createdAt: '2026-11-01T12:00:00Z', score: null, notification: 'not_applicable', deliveries: [] } as unknown as SavedAttempt;
let view: SavedGradeView;
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const button = () => [...view.el.querySelectorAll('button')].find(b => b.textContent === 'Grade and save recording')!;
function upload() {
  const input = view.el.querySelector('input[type=file]')!;
  Object.defineProperty(input, 'files', { value: [new File(['audio'], 'take.wav', { type: 'audio/wav' })] });
  input.dispatchEvent(new Event('change'));
}
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: vi.fn(() => 'blob:take'), revokeObjectURL: vi.fn() }));
  api.catalog.mockResolvedValue({ exercises: [exercise], demo: true, feedbackMode: 'live' }); api.history.mockResolvedValue({ attempts: [] }); api.submit.mockReset(); api.attempt.mockReset();
  view = new SavedGradeView({ prefs: {}, navigate: vi.fn(), setPractice: vi.fn() } as unknown as App);
});
afterEach(() => { view.leave(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('saved practice flow', () => {
  it('uploads only on submission and keeps the persisted attempt visible', async () => {
    api.submit.mockResolvedValue({ attempt }); view.show('first_notes'); await tick(); upload();
    expect(api.submit).not.toHaveBeenCalled(); button().click(); await tick();
    expect(api.submit).toHaveBeenCalledTimes(1); expect(api.submit.mock.calls[0][1]).toBe('first_notes');
    expect(view.el.textContent).toContain('Recording saved.'); expect(view.el.textContent).toContain('Attempt attempt-1');
  });
  it('reuses the upload key after a lost response', async () => {
    api.submit.mockRejectedValueOnce(new Error('Network failed')).mockResolvedValueOnce({ attempt });
    view.show('first_notes'); await tick(); upload(); button().click(); await tick();
    const firstKey = api.submit.mock.calls[0][4]; button().click(); await tick();
    expect(api.submit.mock.calls[1][4]).toBe(firstKey);
  });
  it('restores saved grades after returning to the page and labels non-AI feedback honestly', async () => {
    api.history.mockResolvedValue({ attempts: [{ ...attempt, status: 'graded', score: 92, notification: 'complete',
      measurements: { pitchAccuracy: 90, timingAccuracy: 100 }, feedback: { summary: 'Steady notes.', feedback: ['Repeat slowly.'], practiceNext: { exerciseId: 'first_notes', reason: 'Keep a steady tempo.' }, source: 'rules', model: 'rules-v1' },
      deliveries: [{ name: 'Maya Rao', role: 'student', status: 'sent' }, { name: 'Arun Rao', role: 'parent', status: 'sent' }] }] });
    view.show('first_notes'); await tick(); view.el.querySelector<HTMLButtonElement>('.saved-attempt-link')!.click();
    expect(view.el.textContent).toContain('92/100'); expect(view.el.textContent).toContain('Arun Rao (parent): sent');
    expect(view.el.textContent).toContain('Rules-based feedback · no AI model called');
  });
  it('clears account content and ignores a response after leaving', async () => {
    let resolve!: (value: unknown) => void;
    api.submit.mockImplementation(() => new Promise(done => { resolve = done; }));
    view.show('first_notes'); await tick(); upload(); button().click(); await tick();
    const signal = api.submit.mock.calls[0][5]; view.leave(); expect(signal.aborted).toBe(true);
    resolve({ attempt }); await tick(); expect(view.el.textContent).toBe('');
  });
});
