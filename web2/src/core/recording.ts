import { YinPitchDetector } from '@core/pitch';
import type { PitchSample } from '@core/session';

export const MAX_RECORDING_SECONDS = 120;
export const MAX_RECORDING_BYTES = 80 * 1024 * 1024;
export interface VideoFrame { seconds: number; jpeg: string }

export function validateRecording(file: Pick<File, 'size' | 'type'>, art: 'raaga' | 'kuchipudi'): void {
  if (!file.size || file.size > MAX_RECORDING_BYTES) throw new Error('Choose a recording between 1 byte and 80 MB.');
  if (!(file.type.startsWith('video/') || (art === 'raaga' && file.type.startsWith('audio/')))) {
    throw new Error(art === 'raaga' ? 'Choose an audio or video recording.' : 'Choose a video recording with the dancer visible.');
  }
}

export function validateDuration(duration: number): void {
  if (!Number.isFinite(duration) || duration < 1 || duration > MAX_RECORDING_SECONDS) throw new Error('Use a short recording between 1 second and 2 minutes. Trim a longer recording before uploading.');
}

/** Downsample before YIN; yield regularly so cancel/navigation remain responsive. */
export async function extractPitch(buffer: AudioBuffer, signal: AbortSignal, progress: (text: string) => void): Promise<PitchSample[]> {
  validateDuration(buffer.duration);
  const rate = 12000;
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const mono = new Float32Array(Math.ceil(buffer.duration * rate));
  for (let i = 0; i < mono.length; i++) {
    const start = Math.floor(i * buffer.sampleRate / rate), end = Math.max(start + 1, Math.floor((i + 1) * buffer.sampleRate / rate));
    let sum = 0, count = 0;
    for (let j = start; j < end && j < buffer.length; j++) for (const channel of channels) { sum += channel[j]; count++; }
    mono[i] = count ? sum / count : 0;
  }
  const detector = new YinPitchDetector(rate);
  const samples: PitchSample[] = [];
  for (let i = 0; i + 2048 <= mono.length; i += 960) {
    signal.throwIfAborted();
    const pitch = detector.analyze(mono.subarray(i, i + 2048));
    samples.push({ t: i / rate, hz: pitch.frequency ?? 0, rms: pitch.rms, clarity: pitch.clarity });
    if (samples.length % 24 === 0) {
      progress(`Measuring pitch… ${Math.round(i / mono.length * 100)}%`);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  return samples;
}

/** Power of one frequency in a window (Goertzel). */
function power(data: Float32Array, start: number, length: number, hz: number, rate: number): number {
  const k = 2 * Math.cos((2 * Math.PI * hz) / rate);
  let s1 = 0, s2 = 0;
  for (let i = start; i < start + length; i++) { const s = data[i] + k * s1 - s2; s2 = s1; s1 = s; }
  return s1 * s1 + s2 * s2 - k * s1 * s2;
}

/** Share of a note's energy in its overtones (2nd–4th harmonic), averaged over up to 24 pitched moments.
 *  A voice is rich in overtones; a pure generated tone has none. */
export function overtoneShare(buffer: AudioBuffer, samples: PitchSample[]): number {
  const data = buffer.getChannelData(0), rate = buffer.sampleRate, length = 2048;
  const voiced = samples.filter(s => s.hz > 0 && s.t * rate + length < data.length);
  const picked = voiced.filter((_, i) => i % Math.max(1, Math.floor(voiced.length / 24)) === 0).slice(0, 24);
  if (!picked.length) return 0;
  const shares = picked.map(s => {
    const start = Math.floor(s.t * rate), [f1, ...overtones] = [1, 2, 3, 4].map(n => power(data, start, length, s.hz * n, rate));
    const rest = overtones.reduce((a, b) => a + b, 0);
    return rest / (f1 + rest || 1);
  });
  return shares.reduce((a, b) => a + b, 0) / shares.length;
}

export async function audioEvidence(file: File, signal: AbortSignal, progress: (text: string) => void): Promise<{ samples: PitchSample[]; duration: number; overtones: number }> {
  // Check duration before decoding a highly compressed file into a large PCM buffer.
  const metadata = document.createElement(file.type.startsWith('video/') ? 'video' : 'audio');
  const url = URL.createObjectURL(file);
  try {
    metadata.preload = 'metadata';
    await waitForMedia(metadata, 'loadedmetadata', signal, () => { metadata.src = url; metadata.load(); });
    validateDuration(metadata.duration);
  } finally { metadata.removeAttribute('src'); metadata.load(); URL.revokeObjectURL(url); }
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    signal.throwIfAborted();
    const samples = await extractPitch(buffer, signal, progress);
    return { samples, duration: buffer.duration, overtones: overtoneShare(buffer, samples) };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'EncodingError') throw new Error('This browser cannot read the recording’s audio. Try a WAV, MP3, or M4A audio file.');
    throw error;
  } finally { await context.close(); }
}

function waitForMedia(video: HTMLMediaElement, event: string, signal: AbortSignal, action: () => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timeout); video.removeEventListener(event, done); video.removeEventListener('error', fail); signal.removeEventListener('abort', abort); };
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error('Could not read this recording. Try WAV/MP3 for audio or MP4/WebM for video.')); };
    const abort = () => { cleanup(); reject(new DOMException('Cancelled', 'AbortError')); };
    const timeout = setTimeout(fail, 15000);
    video.addEventListener(event, done, { once: true }); video.addEventListener('error', fail, { once: true }); signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort(); else action();
  });
}

export async function videoEvidence(file: File, signal: AbortSignal, progress: (text: string) => void): Promise<{ frames: VideoFrame[]; duration: number }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video'); video.muted = true; video.preload = 'auto'; video.playsInline = true;
  try {
    await waitForMedia(video, 'loadeddata', signal, () => { video.src = url; video.load(); });
    validateDuration(video.duration);
    if (!video.videoWidth || !video.videoHeight) throw new Error('No visible video track was found.');
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 768 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not prepare video frames.');
    const frames: VideoFrame[] = [];
    for (let i = 0; i < 16; i++) {
      signal.throwIfAborted();
      const seconds = Math.min(video.duration - 0.05, video.duration * (i + 0.5) / 16);
      await waitForMedia(video, 'seeked', signal, () => { video.currentTime = seconds; });
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push({ seconds: Math.round(seconds * 100) / 100, jpeg: canvas.toDataURL('image/jpeg', 0.75).split(',')[1] });
      progress(`Preparing video evidence… ${i + 1}/16 frames`);
    }
    return { frames, duration: video.duration };
  } finally { video.pause(); video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); }
}
