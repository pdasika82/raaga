import type { Exercise, SavedAttempt } from '../../../shared/attempts';
import { getAttempt, getAttempts, getExercises, submitAttempt } from '../core/attemptsApi';
import { validateRecording } from '../core/recording';
import { gradeResult } from './grading';
import { exampleSearch } from './examples';
import { h, formatDate } from './dom';
import type { App } from './app';

export class SavedGradeView {
  readonly el = h('div', { class: 'arts-page recording-grade-page' });
  private controller: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private exercises: Exercise[] = [];
  private exerciseId = 'first_notes';
  private file: File | null = null;
  private preview = '';
  private teacherNote = '';
  private key = '';
  private runId = '';
  private busy = false;
  private demo = false;
  private feedbackMode = 'live';
  private attempts: SavedAttempt[] = [];
  private current: SavedAttempt | null = null;
  private status = '';
  private result = h('div');
  private history = h('section');

  constructor(private app: App) {}
  show(lessonId: string) {
    this.leave();
    const controller = new AbortController(); this.controller = controller;
    const run = new URLSearchParams(location.search).get('run_id');
    this.runId = run && /^[a-zA-Z0-9_-]{1,80}$/.test(run) ? run : `practice-${crypto.randomUUID()}`;
    this.status = 'Loading your saved practice…'; this.render();
    void Promise.all([getExercises(controller.signal), getAttempts(controller.signal)]).then(([catalog, history]) => {
      if (this.controller !== controller) return;
      this.exercises = catalog.exercises; this.demo = catalog.demo; this.feedbackMode = catalog.feedbackMode;
      this.exerciseId = this.exercises.some(e => e.id === lessonId) ? lessonId : this.exercises[0].id;
      this.attempts = history.attempts; this.status = ''; this.render();
      const pending = this.attempts.find(a => ['queued', 'analyzing'].includes(a.status) || (a.status === 'graded' && a.notification === 'pending'));
      if (pending) this.openAttempt(pending);
    }).catch(error => { if (!controller.signal.aborted) { this.status = error.message; this.render(); } });
  }
  leave() {
    this.controller?.abort(); this.controller = null;
    if (this.timer) clearTimeout(this.timer); this.timer = null;
    this.el.querySelectorAll('audio,video').forEach(player => { (player as HTMLMediaElement).pause(); player.removeAttribute('src'); (player as HTMLMediaElement).load(); });
    if (this.preview) URL.revokeObjectURL(this.preview);
    this.preview = ''; this.file = null; this.current = null; this.attempts = []; this.exercises = [];
    this.busy = false; this.teacherNote = ''; this.key = ''; this.status = ''; this.el.replaceChildren();
  }
  private get exercise() { return this.exercises.find(e => e.id === this.exerciseId); }

  private render() {
    const lesson = h('select', { class: 'select', 'aria-label': 'Lesson to grade', disabled: this.busy },
      ...this.exercises.map(e => h('option', { value: e.id, selected: e.id === this.exerciseId }, e.title)));
    lesson.addEventListener('change', () => { this.exerciseId = lesson.value; this.key = ''; this.render(); });
    const file = h('input', { type: 'file', accept: 'audio/*,video/*', class: 'video-file-input', 'aria-label': 'Upload Raaga recording', disabled: this.busy });
    file.addEventListener('change', () => {
      const selected = file.files?.[0]; if (!selected) return;
      try {
        validateRecording(selected, 'raaga');
        if (this.preview) URL.revokeObjectURL(this.preview);
        this.file = selected; this.preview = URL.createObjectURL(selected); this.key = ''; this.status = '';
      } catch (error) { this.status = (error as Error).message; }
      this.render();
    });
    const note = h('textarea', { class: 'input', rows: 2, maxlength: 1000, disabled: this.busy, 'aria-label': 'Teacher focus', placeholder: 'A correction your teacher asked you to focus on (optional)' });
    note.value = this.teacherNote;
    note.addEventListener('input', () => { this.teacherNote = note.value; this.key = ''; });
    this.result = h('div', { 'aria-live': 'polite', 'data-testid': 'saved-attempt' });
    this.history = h('section', { class: 'card saved-attempt-history' });
    const card = h('section', { class: 'card' }, h('h2', {}, 'Upload your practice'),
      h('label', { class: 'field col' }, 'Lesson', lesson),
      this.exercise ? h('div', { class: 'saved-assignment' }, h('strong', {}, `${this.exercise.tonic} Sa · ${this.exercise.bpm} BPM`), h('p', {}, this.exercise.instructions)) : null,
      h('label', { class: 'field col' }, 'Your recording', file),
      h('p', { class: 'small muted' }, '1 second–2 minutes, up to 80 MB. WAV, MP3, M4A, or video with audio. Sing the assigned phrase once.'),
      this.file ? h('p', { class: 'small recording-name' }, this.file.name) : null,
      this.preview ? h(this.file?.type.startsWith('video/') ? 'video' : 'audio', { controls: true, src: this.preview, class: 'grading-preview', preload: 'metadata' }) : null,
      h('label', { class: 'field col' }, 'Teacher’s focus', note),
      h('p', { class: 'small muted' }, 'Your recording is uploaded for pitch and timing analysis. Measurements and your notes are sent to the AI coach. Your review and next exercise are saved to your account.'),
      h('p', { class: 'small muted' }, 'When the review is ready, a score email goes to you and any linked parent who has opted in.'),
      this.feedbackMode === 'rules' ? h('div', { class: 'account-notice' }, 'Rules-based demo feedback is enabled. No AI model is called in this mode.') : null,
      h('button', { class: 'btn', disabled: this.busy || !this.file || !this.exercise, onClick: () => void this.submit() }, this.busy ? 'Saving recording…' : 'Grade and save recording'),
      h('p', { class: 'small', role: 'status' }, this.status));
    this.el.querySelectorAll('audio,video').forEach(player => (player as HTMLMediaElement).pause());
    this.el.replaceChildren(h('div', { class: 'dance-heading' }, h('div', {}, h('span', { class: 'eyebrow accent' }, 'RAAGA / SAVED PRACTICE'),
      h('h1', {}, 'Grade this lesson'), h('p', { class: 'muted' }, 'A review of your take. A clear next step. Your progress, saved.')),
      h('button', { class: 'link', onClick: () => this.app.navigate('practice') }, 'Back to practice')),
      h('div', { class: 'recording-grade-grid' }, h('div', { class: 'view' }, card, this.result),
        h('aside', { class: 'view' }, this.history, exampleSearch(`Carnatic ${this.exercise?.title || 'first notes'} Shankarabharanam lesson demonstration`),
          h('section', { class: 'card' }, h('h3', {}, 'About this review'), h('p', { class: 'small muted' }, 'This beginner rubric measures pitch (80%) and note timing (20%) against the assigned reference. Lyrics, tone quality, expression, and gamakas are not assessed.'),
            h('p', { class: 'small muted' }, 'Saved grading currently supports First notes and Find Sa. Your teacher remains the guide for musical interpretation.')),
          this.demo ? h('section', { class: 'card' }, h('h3', {}, 'Demo recordings'), h('p', { class: 'small muted' }, 'Synthetic tones for checking the workflow, not human singing or evidence of teaching accuracy.'),
            h('div', { class: 'col' }, h('a', { class: 'link', href: `${import.meta.env.BASE_URL}demo/good.wav`, download: 'good.wav' }, 'Download in-tune example'), h('a', { class: 'link', href: `${import.meta.env.BASE_URL}demo/off-key.wav`, download: 'off-key.wav' }, 'Download off-key example'))) : null)));
    this.renderResult(); this.renderHistory();
  }
  private async submit() {
    if (!this.file || !this.controller || this.busy) return;
    const controller = this.controller;
    this.key ||= crypto.randomUUID(); this.busy = true; this.status = 'Uploading your recording…'; this.render();
    try {
      const { attempt } = await submitAttempt(this.file, this.exerciseId, this.teacherNote, this.runId, this.key, controller.signal);
      if (this.controller !== controller) return;
      this.key = ''; this.current = attempt;
      this.attempts = [attempt, ...this.attempts.filter(a => a.id !== attempt.id)];
      this.status = 'Recording saved. You can leave this page while the review finishes.';
      this.openAttempt(attempt);
    } catch (error) { if (!controller.signal.aborted) this.status = (error as Error).message; }
    finally { if (this.controller === controller) { this.busy = false; this.render(); } }
  }
  private openAttempt(attempt: SavedAttempt) {
    if (this.timer) clearTimeout(this.timer);
    this.current = attempt; this.renderResult();
    if (['queued', 'analyzing'].includes(attempt.status) || (attempt.status === 'graded' && attempt.notification === 'pending')) this.poll(attempt.id, Date.now() + 180000);
  }
  private poll(id: string, deadline: number) {
    const controller = this.controller; if (!controller) return;
    this.timer = setTimeout(() => {
      void getAttempt(id, controller.signal).then(({ attempt }) => {
        if (this.controller !== controller || this.current?.id !== id) return;
        this.current = attempt; this.attempts = this.attempts.map(a => a.id === id ? attempt : a);
        this.renderResult(); this.renderHistory();
        if (Date.now() < deadline && (['queued', 'analyzing'].includes(attempt.status) || (attempt.status === 'graded' && attempt.notification === 'pending'))) this.poll(id, deadline);
      }).catch(error => {
        if (!controller.signal.aborted && this.current?.id === id) this.result.append(h('p', { role: 'status' }, (error as Error).message), h('button', { class: 'link', onClick: () => this.openAttempt(this.current!) }, 'Refresh review'));
      });
    }, 1500);
  }
  private renderResult() {
    const a = this.current;
    if (!a) { this.result.replaceChildren(); return; }
    const progress = a.status === 'queued' ? 'Your recording is saved and waiting for review.' : a.status === 'analyzing' ? 'Measuring your notes and preparing feedback…' : a.error || '';
    const report = h('section', { class: 'card ai-review', 'data-attempt-id': a.id },
      h('h2', {}, a.exerciseTitle), h('p', { class: 'small muted' }, `${a.filename} · ${formatDate(a.createdAt)}`),
      a.status !== 'graded' ? h('p', { role: 'status' }, progress) : null);
    if (a.status === 'graded' && a.feedback && a.measurements) {
      report.append(gradeResult(a.score, 'Saved practice review', a.feedback.summary, a.feedback.practiceNext.reason, 'Provisional beginner feedback based on measured pitch and timing.'));
      report.append(h('div', { class: 'row saved-metrics' }, h('strong', {}, `Pitch ${a.measurements.pitchAccuracy}%`), h('strong', {}, `Timing ${a.measurements.timingAccuracy}%`), h('span', { class: 'small muted' }, 'Lyrics: not assessed')));
      report.append(h('ul', {}, ...a.feedback.feedback.map(text => h('li', {}, text))));
      report.append(h('div', { class: 'saved-assignment' }, h('h3', {}, 'Your next practice'), h('p', {}, a.feedback.practiceNext.reason),
        h('button', { class: 'btn btn-secondary', onClick: () => {
          const nextId = a.feedback!.practiceNext.exerciseId;
          this.app.update({ tonic: 0, saOctave: 4, a4: 440, beginnerRaga: 'shankarabharanam', bpm: { ...this.app.prefs.bpm, [nextId]: 60 }, speed: { ...this.app.prefs.speed, [nextId]: 1 } });
          this.app.setPractice(nextId); this.app.navigate('practice');
        } }, 'Practice this exercise')));
      report.append(h('h3', {}, 'Score email'), h('p', { role: 'status' }, a.notification === 'complete' ? 'Sent to your authorized recipients.' : a.notification === 'attention' ? 'A delivery needs attention. Your saved review is available here.' : 'Delivery is pending. Your saved review is available here.'),
        h('ul', { class: 'small' }, ...a.deliveries.map(d => h('li', {}, `${d.name} (${d.role}): ${d.status === 'sent' ? 'sent' : d.status === 'uncertain' ? 'needs attention' : 'pending'}`))),
        h('p', { class: 'tiny muted' }, a.feedback.source === 'rules' ? 'Rules-based feedback · no AI model called' : `AI feedback · ${a.feedback.source === 'openai' ? 'OpenAI · ' : ''}${a.feedback.model}`));
      report.append(h('button', { class: 'link small', onClick: () => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(a, null, 2)], { type: 'application/json' }));
        h('a', { href: url, download: `raaga-${a.id}.json` }).click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      } }, 'Download review'));
    }
    report.append(h('p', { class: 'tiny muted' }, `Attempt ${a.id}`));
    this.result.replaceChildren(report);
  }
  private renderHistory() {
    this.history.replaceChildren(h('h3', {}, 'Your saved attempts'), this.attempts.length ? h('div', { class: 'col' }, ...this.attempts.map(a => h('button', { class: 'saved-attempt-link', onClick: () => this.openAttempt(a) },
      h('strong', {}, a.exerciseTitle), h('span', { class: 'small muted' }, `${formatDate(a.createdAt)} · ${a.score === null ? a.status.replace('_', ' ') : `${a.score}/100`}`)))) : h('p', { class: 'small muted' }, 'Your first saved review will appear here.'));
  }
}
