import { SILENT_FRAME, YinPitchDetector, type PitchFrame } from '../core/pitch';
import type { PitchSample } from '../core/session';

export interface RecordingResult {
  blob: Blob;
  mime: string;
  duration: number;
  samples: PitchSample[];
}

type Listener = (frame: PitchFrame) => void;

/** Microphone -> AudioWorklet blocks -> YIN on the main thread; MediaRecorder in parallel. */
export class AudioCapture {
  frame: PitchFrame = SILENT_FRAME;
  running = false;
  recording = false;
  error: string | null = null;

  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private detector: YinPitchDetector | null = null;
  private listeners = new Set<Listener>();

  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private samples: PitchSample[] = [];
  private recordStartFrame = 0;
  private lastFrame = 0;
  private recordStartTime = 0;
  private mime = '';

  onFrame(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  get sampleRate(): number {
    return this.ctx?.sampleRate ?? 48000;
  }

  get elapsed(): number {
    return this.recording ? (performance.now() - this.recordStartTime) / 1000 : 0;
  }

  /** Must be called from a user gesture (tap) for iOS Safari. */
  async start(): Promise<void> {
    if (this.running) return;
    this.error = null;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
      });
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      this.ctx = ctx;
      await ctx.resume();
      await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}worklet.js`);
      this.detector = new YinPitchDetector(ctx.sampleRate);
      const source = ctx.createMediaStreamSource(this.stream);
      const node = new AudioWorkletNode(ctx, 'block-forwarder', { numberOfInputs: 1, numberOfOutputs: 0 });
      node.port.onmessage = (e: MessageEvent<{ frame: number; block: Float32Array }>) => this.handleBlock(e.data.frame, e.data.block);
      source.connect(node);
      this.node = node;
      this.running = true;
    } catch (err) {
      this.error =
        err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')
          ? 'Microphone access was denied. Allow it in the browser settings for this site.'
          : `Could not start audio: ${(err as Error).message ?? err}`;
      await this.stop();
      throw new Error(this.error);
    }
  }

  async stop(): Promise<void> {
    if (this.recording) this.cancelRecording();
    this.node?.disconnect();
    this.node = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.ctx) {
      try {
        await this.ctx.close();
      } catch {
        /* already closed */
      }
    }
    this.ctx = null;
    this.running = false;
    this.frame = SILENT_FRAME;
    this.emit();
  }

  beginRecording(): void {
    if (!this.running || this.recording || !this.stream) return;
    const candidates = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
    this.mime = candidates.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) ?? '';
    this.recorder = new MediaRecorder(this.stream, this.mime ? { mimeType: this.mime, audioBitsPerSecond: 96_000 } : undefined);
    this.chunks = [];
    this.samples = [];
    this.recordStartFrame = this.lastFrame;
    this.recordStartTime = performance.now();
    this.recorder.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data);
    };
    this.recorder.start(1000);
    this.recording = true;
  }

  paused = false;

  pauseRecording(): void {
    if (!this.recording || !this.recorder || this.paused) return;
    if (this.recorder.state === 'recording') this.recorder.pause();
    this.pausedAt = performance.now();
    this.paused = true;
  }

  resumeRecording(): void {
    if (!this.recording || !this.recorder || !this.paused) return;
    if (this.recorder.state === 'paused') this.recorder.resume();
    // shift the clock so paused time does not count
    const gap = performance.now() - this.pausedAt;
    this.recordStartTime += gap;
    this.recordStartFrame += Math.round((gap / 1000) * this.sampleRate);
    this.paused = false;
  }

  private pausedAt = 0;

  async endRecording(): Promise<RecordingResult | null> {
    if (!this.recording || !this.recorder) return null;
    const recorder = this.recorder;
    const duration = this.elapsed;
    const samples = this.samples;
    this.recording = false;
    this.paused = false;
    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(this.chunks, { type: recorder.mimeType || this.mime || 'audio/webm' }));
      recorder.stop();
    });
    this.recorder = null;
    this.chunks = [];
    this.samples = [];
    return { blob, mime: blob.type, duration, samples };
  }

  private cancelRecording(): void {
    try {
      this.recorder?.stop();
    } catch {
      /* ignore */
    }
    this.recorder = null;
    this.recording = false;
    this.chunks = [];
    this.samples = [];
  }

  private handleBlock(frameIndex: number, block: Float32Array): void {
    if (!this.detector) return;
    this.lastFrame = frameIndex + 2048;
    const frame = this.detector.analyze(block);
    this.frame = frame;
    if (this.recording && !this.paused) {
      const t = Math.max(0, (frameIndex - this.recordStartFrame) / this.sampleRate);
      this.samples.push({ t, hz: frame.frequency ?? 0, clarity: frame.clarity, rms: frame.rms });
    }
    this.emit();
  }

  private emit(): void {
    for (const l of this.listeners) l(this.frame);
  }
}
