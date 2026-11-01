// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DanceCamera } from './camera';

let getUserMedia: ReturnType<typeof vi.fn>;
let stop: ReturnType<typeof vi.fn>;
let camera: DanceCamera;

function click(label: string): void {
  const button = [...camera.el.querySelectorAll('button')].find(button => button.textContent === label);
  if (!button) throw new Error(`Missing button ${label}`);
  button.click();
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  getUserMedia = vi.fn(); stop = vi.fn();
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  camera = new DanceCamera();
});
afterEach(() => { camera.dispose(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('dance camera lifecycle', () => {
  it('does not request camera access until explicitly enabled and stops tracks on leave', async () => {
    expect(getUserMedia).not.toHaveBeenCalled();
    getUserMedia.mockResolvedValue({ getTracks: () => [{ stop }] });
    click('Enable camera');
    await vi.waitFor(() => expect(camera.el.textContent).toContain('Turn camera off'));
    expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: false }));
    camera.dispose();
    expect(stop).toHaveBeenCalledOnce();
    expect(camera.el.querySelector('video')?.srcObject).toBeNull();
  });

  it('closes a camera permission request that resolves after navigation', async () => {
    let resolve!: (stream: unknown) => void;
    getUserMedia.mockReturnValue(new Promise(result => { resolve = result; }));
    click('Enable camera');
    camera.dispose();
    resolve({ getTracks: () => [{ stop }] });
    await vi.waitFor(() => expect(stop).toHaveBeenCalledOnce());
    expect(camera.el.querySelector('video')?.srcObject).toBeNull();
  });

  it('keeps practice usable when camera permission is denied', async () => {
    getUserMedia.mockRejectedValue(new Error('Permission denied'));
    click('Enable camera');
    await vi.waitFor(() => expect(camera.el.textContent).toContain('practice without a camera'));
    expect(camera.el.querySelector('button')?.disabled).toBe(false);
  });
});
