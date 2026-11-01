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

export async function audioEvidence(file: File, signal: AbortSignal, progress: (text: string) => void): Promise<{ samples: PitchSample[]; duration: number }> {
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
    return { samples: await extractPitch(buffer, signal, progress), duration: buffer.duration };
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
