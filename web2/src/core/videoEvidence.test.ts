// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { audioEvidence, videoEvidence } from './recording';

beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: vi.fn(() => 'blob:video'), revokeObjectURL: vi.fn() }));
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'duration', 'get').mockReturnValue(16);
  vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(1280);
  vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(720);
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(function (this: HTMLMediaElement) {
    if (this.hasAttribute('src')) queueMicrotask(() => this.dispatchEvent(new Event('loadeddata')));
  });
  vi.spyOn(HTMLMediaElement.prototype, 'currentTime', 'set').mockImplementation(function (this: HTMLMediaElement) { queueMicrotask(() => this.dispatchEvent(new Event('seeked'))); });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,frame-data');
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('samples timestamped frames across the clip, resizes them, and releases the video', async () => {
  const evidence = await videoEvidence(new File(['video'], 'take.mp4', { type: 'video/mp4' }), new AbortController().signal, () => {});
  expect(evidence.frames).toHaveLength(16);
  expect(evidence.frames[0]).toEqual({ seconds: 0.5, jpeg: 'frame-data' });
  expect(evidence.frames[15].seconds).toBe(15.5);
  expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.75);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:video');
});

it('cleans up even if cancelled while waiting for metadata', async () => {
  vi.mocked(HTMLMediaElement.prototype.load).mockImplementation(() => {});
  const controller = new AbortController();
  const task = videoEvidence(new File(['video'], 'take.mp4', { type: 'video/mp4' }), controller.signal, () => {});
  controller.abort();
  await expect(task).rejects.toThrow('Cancelled');
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:video');
});

it('rejects long audio from metadata before allocating a decoded audio buffer', async () => {
  vi.mocked(HTMLMediaElement.prototype.load).mockImplementation(function (this: HTMLMediaElement) {
    if (this.hasAttribute('src')) queueMicrotask(() => this.dispatchEvent(new Event('loadedmetadata')));
  });
  vi.spyOn(HTMLMediaElement.prototype, 'duration', 'get').mockReturnValue(3600);
  const construct = vi.fn();
  vi.stubGlobal('AudioContext', construct);
  await expect(audioEvidence(new File(['audio'], 'take.mp3', { type: 'audio/mpeg' }), new AbortController().signal, () => {})).rejects.toThrow('2 minutes');
  expect(construct).not.toHaveBeenCalled();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:video');
});
