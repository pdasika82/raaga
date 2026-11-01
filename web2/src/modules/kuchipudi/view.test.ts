// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from '../../ui/app';

vi.mock('../../auth/service', () => ({ auth: { state: { user: null, status: 'ready' } } }));
import { KuchipudiView } from './view';

let view: KuchipudiView;
let revoke: ReturnType<typeof vi.fn>;
const click = (label: string) => {
  const button = [...view.el.querySelectorAll('button')].find(button => button.textContent === label);
  if (!button) throw new Error(`Missing ${label}`);
  button.click();
};

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: vi.fn(() => 'blob:teacher-fixture'), revokeObjectURL: revoke = vi.fn() }));
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
  view = new KuchipudiView({ navigate: vi.fn() } as unknown as App);
  view.refresh();
});
afterEach(() => { view?.leave(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('teacher demonstration playback', () => {
  it('loads a local video, adjusts speed, loops a segment, and releases it on leaving', () => {
    const input = view.el.querySelector<HTMLInputElement>('input[type=file]')!;
    Object.defineProperty(input, 'files', { value: [new File(['test video'], 'teacher.mp4', { type: 'video/mp4' })] });
    input.dispatchEvent(new Event('change'));
    let video = view.el.querySelector<HTMLVideoElement>('.dance-demo')!;
    expect(video.getAttribute('src')).toBe('blob:teacher-fixture');
    expect(view.el.textContent).toContain('teacher.mp4');
    const speed = view.el.querySelector<HTMLSelectElement>('[aria-label="Demonstration playback speed"]')!;
    speed.value = '0.5'; speed.dispatchEvent(new Event('change'));
    expect(video.playbackRate).toBe(0.5);
    video.currentTime = 1; click('Set start');
    video.currentTime = 2; click('Set end');
    const loop = view.el.querySelector<HTMLInputElement>('.demo-controls input')!;
    loop.checked = true; loop.dispatchEvent(new Event('change'));
    video.currentTime = 2.1; video.dispatchEvent(new Event('timeupdate'));
    expect(video.currentTime).toBe(1);
    click('Let’s practice →');
    video = view.el.querySelector<HTMLVideoElement>('.dance-demo')!;
    expect(video.getAttribute('src')).toBe('blob:teacher-fixture');
    expect(video.playbackRate).toBe(0.5);
    view.leave();
    expect(revoke).toHaveBeenCalledWith('blob:teacher-fixture');
    expect(video.hasAttribute('src')).toBe(false);
  });

  it('rejects a non-video file without replacing the practice experience', () => {
    const input = view.el.querySelector<HTMLInputElement>('input[type=file]')!;
    Object.defineProperty(input, 'files', { value: [new File(['text'], 'notes.txt', { type: 'text/plain' })] });
    input.dispatchEvent(new Event('change'));
    expect(view.el.textContent).toContain('Choose a video file from your teacher.');
    expect(view.el.querySelector('.dance-demo')).toBeNull();
    click('Let’s practice →');
    expect(view.el.textContent).toContain('Start practice');
  });
});
