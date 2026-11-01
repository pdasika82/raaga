import { auth } from '../../auth/service';
import type { App } from '../../ui/app';
import { formatDate, formatTime, h } from '../../ui/dom';
import { exampleSearch } from '../../ui/examples';
import { DanceCamera } from './camera';
import { DANCE_LESSONS, danceLesson } from './lessons';
import { clearDanceSessions, readDanceSessions, writeDanceSession } from './progress';

type Phase = 'watch' | 'try' | 'review';

export class KuchipudiView {
  readonly el = h('div', { class: 'arts-page dance-page' });
  private lessonId = DANCE_LESSONS[0].id;
  private phase: Phase = 'watch';
  private camera = new DanceCamera();
  private demo = h('video', { controls: true, playsinline: true, class: 'dance-demo', preload: 'metadata' });
  private demoUrl = '';
  private demoName = '';
  private segmentStart = 0;
  private segmentEnd = 0;
  private looping = false;
  private segmentLabel = h('span', { class: 'small muted' });
  private seconds = 0;
  private startedAt: number | null = null;
  private interval: ReturnType<typeof setInterval> | undefined;
  private timer = h('span', { class: 'practice-clock', 'aria-label': 'Practice time' });
  private checks = new Set<number>();
  private note = '';
  private message = '';
  private saved = false;

  constructor(private app: App) {
    this.demo.addEventListener('timeupdate', () => {
      if (this.looping && this.segmentEnd > this.segmentStart && this.demo.currentTime >= this.segmentEnd) this.demo.currentTime = this.segmentStart;
    });
    this.demo.addEventListener('ended', () => {
      if (this.looping) { this.demo.currentTime = this.segmentStart; void this.demo.play().catch(() => {}); }
    });
    this.demo.addEventListener('error', () => { this.message = 'This video could not play. Try a recording in MP4 or WebM format.'; this.refresh(); });
  }

  private get elapsed(): number { return this.seconds + (this.startedAt === null ? 0 : (performance.now() - this.startedAt) / 1000); }
  private get uid(): string | null { return auth.state.user?.uid ?? null; }

  private pause(): void {
    this.seconds = this.elapsed;
    this.startedAt = null;
    clearInterval(this.interval);
  }

  private toggleTimer(): void {
    if (this.startedAt !== null) this.pause();
    else {
      this.startedAt = performance.now();
      this.interval = setInterval(() => { this.timer.textContent = formatTime(this.elapsed); }, 250);
    }
    this.refresh();
  }

  private changePhase(phase: Phase): void {
    this.pause();
    this.demo.pause();
    if (phase !== 'try') this.camera.stop();
    this.phase = phase;
    this.refresh();
  }

  private resetPractice(): void {
    this.pause(); this.seconds = 0; this.checks.clear(); this.note = ''; this.saved = false; this.message = '';
    this.phase = 'watch';
    this.camera.dispose();
  }

  leave(): void {
    this.resetPractice();
    this.demo.pause();
    this.demo.removeAttribute('src');
    this.demo.load();
    if (this.demoUrl) URL.revokeObjectURL(this.demoUrl);
    this.demoUrl = ''; this.demoName = ''; this.segmentStart = 0; this.segmentEnd = 0; this.looping = false;
  }

  private selectLesson(id: string): void {
    if (id === this.lessonId) return;
    this.leave(); this.lessonId = id; this.refresh();
  }

  private videoPanel(): HTMLElement {
    const input = h('input', { type: 'file', accept: 'video/*', class: 'video-file-input', 'aria-label': 'Choose teacher demonstration video' });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('video/')) { this.message = 'Choose a video file from your teacher.'; this.refresh(); return; }
      this.demo.pause();
      if (this.demoUrl) URL.revokeObjectURL(this.demoUrl);
      this.demoUrl = URL.createObjectURL(file); this.demoName = file.name;
      this.demo.src = this.demoUrl; this.demo.playbackRate = 1;
      this.segmentStart = 0; this.segmentEnd = 0; this.looping = false; this.message = '';
      this.refresh();
    });
    const label = () => { this.segmentLabel.textContent = `${formatTime(this.segmentStart)} – ${this.segmentEnd ? formatTime(this.segmentEnd) : 'end'}`; };
    label();
    const speed = h('select', { class: 'select select-sm', 'aria-label': 'Demonstration playback speed' },
      ...[0.5, 0.75, 1].map(value => h('option', { value, selected: this.demo.playbackRate === value }, `${value}× speed`)));
    speed.addEventListener('change', () => { this.demo.playbackRate = Number(speed.value); });
    const loop = h('input', { type: 'checkbox', checked: this.looping });
    loop.addEventListener('change', () => { this.looping = loop.checked; if (loop.checked) this.demo.currentTime = this.segmentStart; });
    return h('section', { class: 'card demo-card' },
      h('div', { class: 'row space' }, h('h3', {}, 'Your teacher’s demonstration'), h('span', { class: 'small muted' }, 'Watch & repeat')),
      this.demoUrl ? this.demo : h('div', { class: 'demo-empty' },
        h('span', { class: 'demo-symbol', 'aria-hidden': 'true' }, '▷'),
        h('strong', {}, 'Bring your class into practice'),
        h('p', {}, 'Open a video shared by your teacher to slow it down and repeat a short passage. Teacher demonstrations have not been added to this starter course yet.')),
      this.demoUrl ? h('div', { class: 'demo-controls' }, speed,
        h('button', { class: 'btn btn-secondary btn-sm', onClick: () => { this.segmentStart = this.demo.currentTime; if (this.segmentEnd <= this.segmentStart) this.segmentEnd = 0; label(); } }, 'Set start'),
        h('button', { class: 'btn btn-secondary btn-sm', onClick: () => { if (this.demo.currentTime > this.segmentStart) this.segmentEnd = this.demo.currentTime; label(); } }, 'Set end'),
        h('label', { class: 'row small' }, loop, 'Loop'), this.segmentLabel) : null,
      h('label', { class: 'video-file-label' }, h('span', { class: 'small' }, this.demoName || 'Choose a teacher video'), input),
      h('p', { class: 'tiny muted' }, 'Your file stays on this device and is available until you leave this lesson. Follow the left/right orientation explained by your teacher.'));
  }

  refresh(): void {
    const lesson = danceLesson(this.lessonId);
    const sessions = readDanceSessions(this.uid);
    const practiced = new Set(sessions.map(session => session.lessonId));
    const totalSeconds = sessions.reduce((sum, session) => sum + session.seconds, 0);
    const totalMinutes = totalSeconds > 0 && totalSeconds < 60 ? '<1' : String(Math.floor(totalSeconds / 60));
    const sidebar = h('aside', { class: 'dance-sidebar' },
      h('section', { class: 'card' }, h('h3', {}, 'AI practice review'),
        h('p', { class: 'small muted' }, 'Upload a short recording for AI feedback on visible positions and a focus for next time.'),
        h('button', { class: 'btn btn-secondary', onClick: () => this.app.openGrader('kuchipudi', lesson.id) }, 'Upload & grade with AI')),
      exampleSearch(lesson.exampleQuery),
      h('section', { class: 'card lesson-list' }, h('span', { class: 'eyebrow' }, 'YOUR BEGINNER PATH'),
        ...DANCE_LESSONS.map((item, index) => h('button', {
          class: `dance-lesson${item.id === lesson.id ? ' selected' : ''}`, 'aria-current': item.id === lesson.id ? 'step' : undefined,
          onClick: () => this.selectLesson(item.id),
        }, h('span', { class: `lesson-index${practiced.has(item.id) ? ' practiced' : ''}` }, practiced.has(item.id) ? '✓' : String(index + 1).padStart(2, '0')),
        h('span', {}, h('strong', {}, item.title), h('span', { class: 'small muted' }, `${item.minutes} min · ${item.focus}`))))),
      h('section', { class: 'card practice-summary' }, h('h3', {}, 'A little, often.'),
        h('div', { class: 'practice-totals' }, h('div', {}, h('strong', {}, String(sessions.length)), h('span', {}, sessions.length === 1 ? 'practice' : 'practices')), h('div', {}, h('strong', {}, totalMinutes), h('span', {}, totalMinutes === '1' ? 'minute' : 'minutes'))),
        h('p', { class: 'small muted' }, `${practiced.size} of ${DANCE_LESSONS.length} guides practiced. Your teacher decides when you are ready to advance.`)));

    const steps: [Phase, string][] = [['watch', 'Watch'], ['try', 'Try'], ['review', 'Review']];
    const stage = h('section', { class: 'card dance-stage' },
      h('nav', { class: 'dance-phases', 'aria-label': 'Practice steps' }, ...steps.map(([phase, title], index) => h('button', {
        class: `dance-phase${this.phase === phase ? ' current' : ''}`, 'aria-current': this.phase === phase ? 'step' : undefined,
        onClick: () => this.changePhase(phase),
      }, h('span', {}, String(index + 1)), title))),
      h('div', { class: 'dance-lesson-heading' }, h('span', { class: 'eyebrow' }, lesson.focus), h('h2', {}, lesson.title), h('p', { class: 'muted' }, lesson.introduction)));

    if (this.phase === 'watch') {
      stage.append(this.videoPanel(),
        h('div', { class: 'dance-task' }, h('h3', {}, 'Today’s small practice'), h('p', {}, lesson.task)),
        h('button', { class: 'btn', onClick: () => this.changePhase('try') }, 'Let’s practice →'));
    } else if (this.phase === 'try') {
      this.timer.textContent = formatTime(this.elapsed);
      stage.append(h('div', { class: 'dance-task' }, h('h3', {}, 'One thing to focus on'), h('p', {}, lesson.task)),
        h('div', { class: 'practice-timer' }, this.timer, h('span', { class: 'small muted' }, `${lesson.minutes} minutes suggested · go at your pace`),
          h('button', { class: 'btn', disabled: this.saved, onClick: () => this.toggleTimer() }, this.startedAt !== null ? 'Pause practice' : this.elapsed > 0 ? 'Resume practice' : 'Start practice')),
        ...(this.demoUrl ? [this.videoPanel()] : []), this.camera.el,
        h('button', { class: 'btn btn-secondary', onClick: () => this.changePhase('review') }, 'Finish & reflect →'));
    } else {
      const note = h('textarea', { class: 'input', rows: 3, maxlength: 2000, placeholder: 'What felt clearer? What will you ask your teacher?', disabled: this.saved });
      note.value = this.note;
      note.addEventListener('input', () => { this.note = note.value; });
      stage.append(h('div', { class: 'dance-task' }, h('h3', {}, 'Notice your progress'), h('p', {}, `${formatTime(this.elapsed)} of practice. These are your reflections, not an assessment of technique.`)),
        h('div', { class: 'review-checks' }, ...lesson.cues.map((cue, index) => {
          const check = h('input', { type: 'checkbox', checked: this.checks.has(index), disabled: this.saved });
          check.addEventListener('change', () => check.checked ? this.checks.add(index) : this.checks.delete(index));
          return h('label', { class: 'review-check' }, check, h('span', {}, cue));
        })), h('label', { class: 'field col' }, h('span', {}, 'A note for next time'), note), this.camera.el,
        h('div', { class: 'row' },
          h('button', { class: 'btn', disabled: this.saved || this.elapsed < 1 || auth.state.status === 'loading', onClick: () => this.save() }, this.saved ? 'Practice saved ✓' : 'Save practice'),
          h('button', { class: 'btn btn-secondary', onClick: () => { this.resetPractice(); this.refresh(); } }, 'Practice again')),
        ...(this.elapsed < 1 ? [h('p', { class: 'small muted' }, 'Start the timer in Try to log a practice session.')] : []));
    }
    stage.append(h('p', { class: 'small', role: 'status', 'aria-live': 'polite' }, this.message));
    const history = h('section', { class: 'card dance-history' },
      h('div', { class: 'row space' }, h('h2', {}, 'Your practice journal'), h('span', { class: 'small muted' }, 'Saved on this device')),
      sessions.length ? h('ul', { class: 'journal-list' }, ...sessions.slice(0, 8).map(session => h('li', {},
        h('div', { class: 'row space' }, h('strong', {}, danceLesson(session.lessonId).title), h('span', { class: 'small muted' }, `${formatTime(session.seconds)} · ${formatDate(session.date)}`)),
        session.note ? h('p', {}, session.note) : h('p', { class: 'muted small' }, 'Practice logged.')))) : h('p', { class: 'muted' }, 'Your first practice starts a story. Save a session to see it here.'),
      sessions.length ? h('button', { class: 'link small danger', onClick: () => {
        if (confirm('Delete this learner’s Kuchipudi journal on this device?')) {
          this.message = clearDanceSessions(this.uid) ? 'Journal cleared.' : 'Could not clear the journal. Check browser storage permissions.';
          this.refresh();
        }
      } }, 'Clear journal') : null);
    this.el.replaceChildren(
      h('div', { class: 'dance-heading' }, h('div', {}, h('span', { class: 'eyebrow' }, 'LMS FOR ARTS / DANCE'), h('h1', {}, 'Kuchipudi'), h('p', { class: 'muted' }, 'Bring what you learn in class into your everyday practice.')),
        h('span', { class: 'arts-pill' }, 'Beginner · 6 practice guides')),
      h('div', { class: 'dance-grid' }, sidebar, stage), history,
      h('p', { class: 'small muted course-note' }, 'Starter practice guides, pending a teacher-approved syllabus. Follow your teacher for technique and preparation; stop if a movement hurts. ',
        !auth.state.user ? h('button', { class: 'link small', onClick: () => this.app.navigate('account') }, 'Sign in to use your own journal on this device.') : null));
  }

  private save(): void {
    if (this.saved || this.elapsed < 1 || auth.state.status === 'loading') return;
    this.pause();
    const saved = writeDanceSession(this.uid, {
      id: crypto.randomUUID(), lessonId: this.lessonId, date: new Date().toISOString(),
      seconds: Math.min(86400, Math.max(1, Math.floor(this.seconds))), checks: [...this.checks], note: this.note.trim(),
    });
    this.saved = saved;
    this.message = saved ? 'Practice saved on this device. Come back to the same focus next time.' : 'Your browser could not save this practice. Keep a copy of your note before leaving.';
    this.refresh();
  }
}
