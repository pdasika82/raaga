import { h } from '../../ui/dom';

/** Camera recordings stay in memory and are discarded on leaving the module. */
export class DanceCamera {
  readonly el = h('section', { class: 'card dance-camera' });
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private url = '';
  private extension = 'webm';
  private pending = false;
  private generation = 0;
  private recordingLimit: ReturnType<typeof setTimeout> | undefined;
  private message = '';
  private preview = h('video', { autoplay: true, muted: true, playsinline: true, class: 'camera-video' });
  private playback = h('video', { controls: true, playsinline: true, class: 'camera-video' });

  constructor() { this.preview.muted = true; this.render(); }

  private render(): void {
    const recording = this.recorder?.state === 'recording';
    this.preview.hidden = !this.stream;
    this.playback.hidden = !this.url;
    this.el.replaceChildren(
      h('div', { class: 'row space' }, h('h3', {}, 'Your practice mirror'), h('span', { class: 'small muted' }, 'Optional · private')),
      h('p', { class: 'small muted' }, 'Use your camera to review a movement. Video stays in this tab unless you download it. No automatic movement scoring.'),
      this.preview, this.playback,
      h('div', { class: 'row' },
        h('button', { class: 'btn btn-secondary', disabled: this.pending, onClick: () => this.stream ? this.stop() : void this.start() }, this.pending ? 'Opening camera…' : this.stream ? 'Turn camera off' : 'Enable camera'),
        this.stream ? h('button', { class: 'btn btn-secondary', disabled: typeof MediaRecorder === 'undefined', onClick: () => recording ? this.finishRecording() : this.record() }, recording ? 'Stop recording' : 'Record a take') : null,
        this.url ? h('a', { class: 'btn btn-secondary', href: this.url, download: `kuchipudi-practice.${this.extension}` }, 'Download take') : null,
        this.url ? h('button', { class: 'link small', onClick: () => { this.discard(); this.render(); } }, 'Delete take') : null),
      h('p', { class: 'small muted', role: 'status', 'aria-live': 'polite' }, this.message || 'Camera preview is mirrored; recorded playback is not.'));
  }

  private async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) { this.message = 'Camera access is unavailable here. You can still practice without it.'; this.render(); return; }
    this.pending = true;
    this.message = '';
    const generation = ++this.generation;
    this.render();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 } }, audio: false });
      if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      this.preview.srcObject = stream;
      this.message = 'Frame your full body. Record up to two minutes of video (without audio).';
      void this.preview.play().catch(() => {});
    } catch {
      if (generation === this.generation) this.message = 'Camera could not open. Check permission and try again, or practice without a camera.';
    } finally {
      if (generation === this.generation) { this.pending = false; this.render(); }
    }
  }

  private record(): void {
    if (!this.stream || this.recorder || typeof MediaRecorder === 'undefined') return;
    this.discard();
    const generation = this.generation;
    try {
      const recorder = new MediaRecorder(this.stream);
      this.recorder = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        if (generation !== this.generation || this.recorder !== recorder) return;
        const blob = new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type || 'video/webm' });
        if (blob.size) {
          this.extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
          this.url = URL.createObjectURL(blob);
          this.playback.src = this.url;
          this.message = 'Review your take, download it, or delete it. Leaving this module discards the take.';
        }
        this.recorder = null;
        clearTimeout(this.recordingLimit);
        this.render();
      };
      recorder.onerror = () => { this.message = 'Recording failed. You can still use the camera mirror.'; this.finishRecording(); };
      recorder.start();
      this.recordingLimit = setTimeout(() => this.finishRecording(), 120_000);
      this.message = 'Recording… video only, up to two minutes.';
    } catch { this.message = 'Recording is unavailable in this browser. You can still use the camera mirror.'; }
    this.render();
  }

  private finishRecording(): void {
    clearTimeout(this.recordingLimit);
    if (this.recorder?.state === 'recording') this.recorder.stop();
  }

  stop(): void {
    // Cancel a pending permission request without discarding a completed recording.
    if (this.pending) { this.generation++; this.pending = false; }
    this.finishRecording();
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    this.preview.srcObject = null;
    this.render();
  }

  private discard(): void {
    this.playback.pause();
    this.playback.removeAttribute('src');
    this.playback.load();
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = '';
  }

  dispose(): void {
    this.generation++;
    this.stop();
    this.recorder = null;
    this.discard();
    this.message = '';
    this.render();
  }
}
