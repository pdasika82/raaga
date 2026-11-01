import { describe, expect, it } from 'vitest';
import { extractPitch, validateDuration, validateRecording } from './recording';

describe('uploaded recording evidence', () => {
  it('rejects invalid media, oversize uploads, and unsupported lengths', () => {
    expect(() => validateRecording({ size: 100, type: 'audio/wav' }, 'raaga')).not.toThrow();
    expect(() => validateRecording({ size: 100, type: 'audio/wav' }, 'kuchipudi')).toThrow('video');
    for (const size of [0, 81 * 1024 * 1024]) expect(() => validateRecording({ size, type: 'video/mp4' }, 'kuchipudi')).toThrow();
    for (const duration of [0, 0.5, 121, Infinity, NaN]) expect(() => validateDuration(duration)).toThrow();
  });

  it('extracts usable pitch from a real waveform and honors cancellation', async () => {
    const sampleRate = 24000;
    const channel = Float32Array.from({ length: sampleRate }, (_, i) => 0.2 * Math.sin(2 * Math.PI * 220 * i / sampleRate));
    const buffer = { duration: 1, sampleRate, length: channel.length, numberOfChannels: 1, getChannelData: () => channel } as unknown as AudioBuffer;
    const samples = await extractPitch(buffer, new AbortController().signal, () => {});
    expect(samples.length).toBeGreaterThan(8);
    expect(samples.every(sample => Math.abs(sample.hz - 220) < 2 && sample.clarity > 0.9)).toBe(true);
    const controller = new AbortController(); controller.abort();
    await expect(extractPitch(buffer, controller.signal, () => {})).rejects.toThrow();
  });
});
