// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from './app';
const service = vi.hoisted(() => ({ grade: vi.fn(), audio: vi.fn(), video: vi.fn() }));
vi.mock('../auth/service', () => ({ auth: { state: { status: 'ready', user: { uid: 'test-learner', isAnonymous: false } } } }));
vi.mock('../core/aiGrading', async original => ({ ...await original<typeof import('../core/aiGrading')>(), requestAIGrade: service.grade }));
vi.mock('../core/recording', async original => ({ ...await original<typeof import('../core/recording')>(), audioEvidence: service.audio, videoEvidence: service.video }));
import { RecordingGradeView } from './recordingGrade';
import { RUBRICS } from '../core/aiGrading';

let view: RecordingGradeView;
let app: App;
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const click = () => [...view.el.querySelectorAll('button')].find(button => button.textContent === 'Grade recording with AI')!.click();
function upload(type: string) {
  const input = view.el.querySelector<HTMLInputElement>('input[type=file]')!;
  Object.defineProperty(input, 'files', { value: [new File(['fixture'], type.startsWith('video') ? 'practice.mp4' : 'practice.wav', { type })] });
  input.dispatchEvent(new Event('change'));
}

beforeEach(() => {
  service.grade.mockReset(); service.audio.mockReset(); service.video.mockReset();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: vi.fn(() => 'blob:practice'), revokeObjectURL: vi.fn() }));
  app = { prefs: { apiKey: 'test-key', tonic: 0, saOctave: 4, a4: 440, practiceId: 'first_notes', beginnerRaga: 'shankarabharanam' }, update: vi.fn(), navigate: vi.fn() } as unknown as App;
  view = new RecordingGradeView(app);
});
afterEach(() => { view.leave(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('upload → AI review flow', () => {
  it.each(['raaga', 'kuchipudi'] as const)('reviews an uploaded %s recording only after submission', async art => {
    service.audio.mockResolvedValue({ duration: 2, samples: Array.from({ length: 24 }, (_, i) => ({ t: i / 12, hz: 261.625565, clarity: 1, rms: 0.1 })) });
    service.video.mockResolvedValue({ duration: 2, frames: [{ seconds: 1, jpeg: 'frame-data' }] });
    service.grade.mockResolvedValue({ summary: 'Evidence from this take.', criteria: RUBRICS[art].map(name => ({ name, score: 80, evidence: 'Visible or measured at 1s.', timestamps: [1] })), strengths: ['Steady'], improvements: ['Repeat slowly'], limitations: ['Limited review'], model: 'fixture-model' });
    view.show(art); upload(art === 'raaga' ? 'audio/wav' : 'video/mp4');
    expect(service.grade).not.toHaveBeenCalled(); expect(view.el.querySelector('audio, video')).not.toBeNull();
    click(); await tick();
    expect(service.grade).toHaveBeenCalledTimes(1);
    const args = service.grade.mock.calls[0];
    expect(args[1].art).toBe(art);
    if (art === 'raaga') { expect(args[2].voicedSeconds).toBeGreaterThan(0); expect(args[3]).toEqual([]); }
    else expect(args[3]).toEqual([{ seconds: 1, jpeg: 'frame-data' }]);
    expect(view.el.textContent).toContain('80/100'); expect(view.el.textContent).toContain('Download review');
    const timestamp = [...view.el.querySelectorAll('button')].find(button => button.textContent === 'Review 0:01')!;
    timestamp.click(); expect(view.el.querySelector<HTMLMediaElement>('audio, video')!.currentTime).toBe(1);
  });

  it('does not send an AI request for silent audio', async () => {
    service.audio.mockResolvedValue({ duration: 2, samples: [] });
    view.show('raaga'); upload('audio/wav'); click(); await tick();
    expect(service.grade).not.toHaveBeenCalled(); expect(view.el.textContent).toContain('No clear singing was detected');
  });

  it('aborts navigation-away requests and ignores a late result', async () => {
    let resolve!: (value: unknown) => void;
    service.video.mockResolvedValue({ duration: 2, frames: [{ seconds: 1, jpeg: 'frame' }] });
    service.grade.mockImplementation(() => new Promise(done => { resolve = done; }));
    view.show('kuchipudi'); upload('video/mp4'); click(); await tick();
    const signal: AbortSignal = service.grade.mock.calls[0][4];
    view.leave(); expect(signal.aborted).toBe(true);
    resolve({ summary: 'Stale review' }); await tick();
    expect(view.el.textContent).toBe(''); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:practice');
  });

  it('explains missing setup and keeps submission disabled without an API key', () => {
    app.prefs.apiKey = ''; view.show('raaga'); upload('audio/wav');
    const button = [...view.el.querySelectorAll('button')].find(button => button.textContent === 'Grade recording with AI')!;
    expect(button.disabled).toBe(true); expect(view.el.textContent).toContain('Set up your Anthropic API key');
    expect(service.grade).not.toHaveBeenCalled();
  });
});
