import { AudioCapture } from '../audio/capture';
import { lessonScale, type Lesson } from '../core/lesson';
import { midiFromHz, westernPitchClassName, WESTERN_NAMES } from '../core/pitch';
import { reading, scaleDisplayName } from '../core/scale';
import { newSession, type PracticeSession } from '../core/session';
import { SessionStore } from '../storage/db';
import type { App } from './app';
import { clear, formatTime, h } from './dom';
import { PitchMeter } from './meter';

export class PracticeView {
  readonly el = h('div', { class: 'view' });
  private capture = new AudioCapture();
  private meter = new PitchMeter();
  private status = h('div', { class: 'status' });
  private timer = h('div', { class: 'rec-timer' });
  private recBtn!: HTMLButtonElement;
  private startBtn!: HTMLButtonElement;
  private ticker: number | null = null;
  private unsub: (() => void) | null = null;
  private currentLesson: Lesson;

  constructor(private app: App) {
    this.currentLesson = app.lesson();
    this.render();
  }

  private render(): void {
    const { prefs } = this.app;
    const lesson = this.app.lesson();
    this.currentLesson = lesson;
    const scale = lessonScale(lesson);

    const lessonSelect = h('select', { class: 'select', onChange: (e) => this.app.setLesson((e.target as HTMLSelectElement).value) });
    for (const l of this.app.lessons) lessonSelect.append(h('option', { value: l.id, selected: l.id === lesson.id }, l.title));

    const tonicSelect = h('select', { class: 'select select-sm', onChange: (e) => this.app.setTonic(Number((e.target as HTMLSelectElement).value)) });
    WESTERN_NAMES.forEach((n, i) => tonicSelect.append(h('option', { value: i, selected: i === prefs.tonic }, `Sa = ${n}`)));

    this.startBtn = h('button', { class: 'btn', onClick: () => this.toggleListening() }, this.capture.running ? 'Stop listening' : 'Start listening');
    this.recBtn = h('button', { class: 'btn btn-rec', disabled: !this.capture.running, onClick: () => this.toggleRecording() }, 'Record');

    clear(this.el).append(
      h(
        'section',
        { class: 'card' },
        h('div', { class: 'row' }, lessonSelect, tonicSelect),
        h('div', { class: 'muted small' }, `${scaleDisplayName(scale)} · Sa = ${westernPitchClassName(prefs.tonic)}`),
        h('p', { class: 'instructions' }, lesson.instructions),
      ),
      this.meter.el,
      h('section', { class: 'controls' }, this.startBtn, this.recBtn, this.timer),
      this.status,
    );
    this.meter.setScale(scale, prefs.tonic, prefs.notation);
    this.meter.update(this.capture.frame, null, prefs.notation, prefs.tonic, this.capture.running);
    this.unsub?.();
    this.unsub = this.capture.onFrame((frame) => {
      const p = this.app.prefs;
      const r = frame.frequency && frame.clarity >= 0.5 ? reading(scale, midiFromHz(frame.frequency, p.a4), p.tonic) : null;
      this.meter.update(frame, r, p.notation, p.tonic, this.capture.running);
    });
  }

  /** Called by the app when prefs or lessons change. */
  refresh(): void {
    if (this.capture.recording) return;
    this.render();
  }

  private async toggleListening(): Promise<void> {
    if (this.capture.running) {
      await this.finishRecording();
      await this.capture.stop();
      this.status.textContent = '';
    } else {
      this.startBtn.disabled = true;
      this.status.textContent = 'Starting microphone…';
      try {
        await this.capture.start();
        this.status.textContent = '';
      } catch (err) {
        this.status.textContent = (err as Error).message;
      }
      this.startBtn.disabled = false;
    }
    this.render();
  }

  private async toggleRecording(): Promise<void> {
    if (this.capture.recording) {
      await this.finishRecording();
    } else {
      this.capture.beginRecording();
      this.recBtn.textContent = 'Stop';
      this.recBtn.classList.add('recording');
      this.ticker = window.setInterval(() => (this.timer.textContent = `● ${formatTime(this.capture.elapsed)}`), 250);
      this.el.querySelectorAll('select').forEach((s) => (s.disabled = true));
    }
  }

  private async finishRecording(): Promise<void> {
    if (!this.capture.recording) return;
    if (this.ticker) window.clearInterval(this.ticker);
    this.ticker = null;
    this.timer.textContent = '';
    this.recBtn.textContent = 'Record';
    this.recBtn.classList.remove('recording');
    this.el.querySelectorAll('select').forEach((s) => (s.disabled = false));
    const result = await this.capture.endRecording();
    if (!result) return;
    if (result.duration < 1) {
      this.status.textContent = 'Recording too short to save.';
      return;
    }
    const session: PracticeSession = newSession({
      id: crypto.randomUUID(),
      lesson: this.currentLesson,
      tonic: this.app.prefs.tonic,
      a4: this.app.prefs.a4,
      duration: result.duration,
      audioMime: result.mime,
      samples: result.samples,
    });
    await SessionStore.save(session, result.blob);
    this.status.textContent = 'Saved.';
    this.app.openSession(session.id);
  }

  async leave(): Promise<void> {
    await this.finishRecording();
    await this.capture.stop();
    this.render();
  }
}
