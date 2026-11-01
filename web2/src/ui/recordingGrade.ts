import { analyze, hasVoice } from '@core/analyzer';
import { scaleById } from '@core/scale';
import { parseSequence, startingMidi, tokenMidi } from '@core/swara';
import { WESTERN_NAMES } from '@core/pitch';
import { describeError } from '@llm/claude';
import { auth } from '../auth/service';
import { isSignedIn } from '../auth/access';
import { overallAIGrade, requestAIGrade, type AIGrade, type Art, type GradeContext } from '../core/aiGrading';
import { audioEvidence, validateRecording, videoEvidence } from '../core/recording';
import { compareFree, toTargetMarks } from '../core/repeat';
import { practiceById, PRACTICES, usesBeginnerRaga } from '../core/practices';
import { DANCE_LESSONS, danceLesson } from '../modules/kuchipudi/lessons';
import { gradeResult } from './grading';
import { exampleSearch } from './examples';
import { formatTime, h } from './dom';
import type { App } from './app';

export class RecordingGradeView {
  readonly el = h('div', { class: 'arts-page recording-grade-page' });
  private art: Art = 'raaga';
  private lessonId = '';
  private file: File | null = null;
  private previewUrl = '';
  private player: HTMLMediaElement | null = null;
  private teacherNote = '';
  private controller: AbortController | null = null;
  private report: AIGrade | null = null;
  private status = '';
  private statusEl = h('p', { class: 'small', role: 'status', 'aria-live': 'polite' });

  constructor(private app: App) {}

  show(art: Art, lessonId?: string): void {
    this.art = art;
    this.lessonId = art === 'raaga' ? practiceById(lessonId || this.app.prefs.practiceId).id : danceLesson(lessonId || 'first-step').id;
    this.refresh();
  }

  leave(): void {
    this.controller?.abort(); this.controller = null;
    this.player?.pause(); this.player?.removeAttribute('src'); this.player?.load(); this.player = null;
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = ''; this.file = null; this.report = null; this.status = ''; this.teacherNote = '';
    this.el.replaceChildren();
  }

  private get topic(): string {
    return this.art === 'raaga' ? `Carnatic ${practiceById(this.lessonId).title} ${this.scale.name} lesson demonstration` : danceLesson(this.lessonId).exampleQuery;
  }

  private get scale() {
    const lesson = practiceById(this.lessonId);
    return scaleById(usesBeginnerRaga(lesson) ? this.app.prefs.beginnerRaga : lesson.scaleId);
  }

  private refresh(): void {
    const dance = this.art === 'kuchipudi';
    const busy = !!this.controller;
    this.player?.pause();
    const lesson = h('select', { class: 'select', 'aria-label': 'Lesson to grade', disabled: busy },
      ...(dance ? DANCE_LESSONS : PRACTICES).map(item => h('option', { value: item.id, selected: item.id === this.lessonId }, item.title)));
    lesson.addEventListener('change', () => { this.lessonId = lesson.value; this.report = null; this.refresh(); });
    const note = h('textarea', { class: 'input', rows: 2, maxlength: 1000, disabled: busy, placeholder: dance ? 'Name the step or sequence and the correction your teacher asked you to practice.' : 'For example: first speed, one swara per beat, repeat the phrase once.' });
    note.value = this.teacherNote;
    note.addEventListener('input', () => { this.teacherNote = note.value; if (this.report) { this.report = null; this.el.querySelector('.ai-review')?.remove(); } });
    const fileInput = h('input', { class: 'video-file-input', type: 'file', accept: dance ? 'video/*' : 'audio/*,video/*', disabled: busy, 'aria-label': dance ? 'Upload Kuchipudi recording' : 'Upload Raaga recording' });
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0]; if (!file) return;
      try {
        validateRecording(file, this.art);
        this.player?.pause();
        if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
        this.file = file; this.previewUrl = URL.createObjectURL(file); this.report = null; this.status = '';
      } catch (error) { this.status = (error as Error).message; }
      this.refresh();
    });
    this.player = this.file ? h(this.file.type.startsWith('video/') ? 'video' : 'audio', { controls: true, playsinline: true, class: 'grading-preview', src: this.previewUrl, preload: 'metadata' }) : null;
    const tonic = h('select', { class: 'select', 'aria-label': 'Recording Sa', disabled: busy }, ...WESTERN_NAMES.map((name, i) => h('option', { value: i, selected: this.app.prefs.tonic === i }, name)));
    tonic.addEventListener('change', () => { this.app.update({ tonic: Number(tonic.value) }); this.report = null; this.refresh(); });
    const octave = h('select', { class: 'select', 'aria-label': 'Recording starting octave', disabled: busy }, ...[2, 3, 4, 5].map(value => h('option', { value, selected: value === this.app.prefs.saOctave }, String(value))));
    octave.addEventListener('change', () => { this.app.update({ saOctave: Number(octave.value) }); this.report = null; this.refresh(); });
    const keyReady = !!this.app.prefs.apiKey.trim();
    const upload = h('section', { class: 'card' },
      h('h2', {}, 'Upload your practice'),
      h('label', { class: 'field col' }, h('span', {}, 'Lesson'), lesson),
      !dance ? h('div', { class: 'row' }, h('label', { class: 'field col' }, 'Recording Sa', tonic), h('label', { class: 'field col' }, 'Starting octave', octave), h('span', { class: 'small muted' }, `${this.scale.name} · A4 ${this.app.prefs.a4} Hz`)) : null,
      h('label', { class: 'field col' }, h('span', {}, 'Teacher’s assignment or focus (optional)'), note),
      h('label', { class: 'field col' }, h('span', {}, dance ? 'Your video recording' : 'Your audio or video recording'), fileInput),
      h('p', { class: 'small muted' }, dance ? '1 second–2 minutes, up to 80 MB. Keep your full body visible; MP4 or WebM recommended.' : '1 second–2 minutes, up to 80 MB. Use a solo voice recording; WAV, MP3, or M4A recommended. Video works if your browser can decode its audio.'),
      this.file ? h('p', { class: 'small recording-name' }, this.file.name) : null,
      this.player,
      h('p', { class: 'small muted' }, dance ? 'Grading sends 16 timestamped images from your video and your lesson notes to Anthropic. It reviews visible positions, not audio or continuous movement.' : 'Grading measures pitch on your device, then sends pitch summaries, note timing, and your lesson notes to Anthropic. The original recording stays on this device.'),
      !keyReady ? h('div', { class: 'account-notice' }, 'Set up your Anthropic API key to enable AI grading. ', h('button', { class: 'link small', onClick: () => this.app.navigate('settings') }, 'Open Advanced settings →')) : h('p', { class: 'tiny muted' }, 'Uses your configured Anthropic API key. Each review uses paid API credits.'),
      h('div', { class: 'row' }, h('button', { class: 'btn', disabled: busy || !this.file || !keyReady, onClick: () => void this.grade() }, busy ? 'Reviewing recording…' : 'Grade recording with AI'),
        busy ? h('button', { class: 'btn btn-secondary', onClick: () => { this.controller?.abort(); this.controller = null; this.status = 'Review cancelled.'; this.refresh(); } }, 'Cancel review') : null),
      this.statusEl);
    this.statusEl.textContent = this.status;
    this.el.replaceChildren(h('div', { class: 'dance-heading' }, h('div', {}, h('span', { class: 'eyebrow accent' }, `${dance ? 'KUCHIPUDI' : 'RAAGA'} / AI PRACTICE REVIEW`),
      h('h1', {}, 'Grade this lesson'), h('p', { class: 'muted' }, 'Upload a take. Get an evidence-based review and a focus for your next practice.')),
      h('button', { class: 'link', onClick: () => this.app.navigate(dance ? 'kuchipudi' : 'practice') }, 'Back to practice')),
      h('div', { class: 'recording-grade-grid' }, h('div', { class: 'view' }, upload, this.report ? this.reportView(this.report) : null),
        h('aside', { class: 'view' }, exampleSearch(this.topic), h('section', { class: 'card' }, h('h3', {}, 'What the AI can assess'),
          h('p', { class: 'small muted' }, dance ? 'Visible stance, arm and hand positions, and consistency across sampled images. Rhythm and transitions need a teacher’s review of the full recording.' : 'Pitch accuracy, the swara sequence, and pitch steadiness. Voice quality, expression, and breath are outside this review.'),
          h('p', { class: 'small muted' }, 'AI feedback may be wrong. Missing evidence is marked “Not assessed”; an overall grade appears only when every criterion can be assessed.')))));
  }

  private async grade(): Promise<void> {
    if (!this.file || this.controller || !isSignedIn(auth.state)) return;
    const controller = new AbortController(); this.controller = controller;
    this.report = null; this.status = 'Preparing your recording…'; this.refresh();
    const progress = (message: string) => { if (this.controller === controller) { this.status = message; this.statusEl.textContent = message; } };
    try {
      const music = practiceById(this.lessonId), dance = danceLesson(this.lessonId);
      const context: GradeContext = { art: this.art, lesson: this.art === 'raaga' ? music.title : dance.title, instructions: this.art === 'raaga' ? music.instructions : dance.task, teacherNote: this.teacherNote, duration: 0 };
      let measurements: unknown = null;
      let frames: Awaited<ReturnType<typeof videoEvidence>>['frames'] = [];
      if (this.art === 'raaga') {
        const evidence = await audioEvidence(this.file, controller.signal, progress);
        context.duration = evidence.duration;
        const report = analyze(evidence.samples, this.scale, this.app.prefs.tonic, this.app.prefs.a4, { totalSeconds: evidence.duration });
        if (!hasVoice(report)) throw new Error('No clear singing was detected. Try a louder solo voice recording; no AI request was sent.');
        const start = startingMidi(this.app.prefs.tonic, this.app.prefs.saOctave);
        const targets = parseSequence(music.sequence || '').map(token => ({ token: token.raw, midi: tokenMidi(token, this.scale, start) ?? start }));
        const comparison = targets.length ? compareFree(report.events.map(event => ({ midi: event.midi + event.meanCents / 100, at: event.start })), targets) : null;
        measurements = { scale: this.scale.name, tonic: this.app.prefs.tonic, startingMidi: start, a4: this.app.prefs.a4,
          voicedSeconds: report.voicedSeconds, within20: report.within20, within50: report.within50, scaleToneFraction: report.scaleToneFraction,
          meanAbsCents: report.meanAbsCents, stabilityCents: report.stabilityCents, events: report.events,
          targets: comparison ? toTargetMarks(comparison, 1) : [], caveat: 'Monophonic pitch detection. Sequence alignment assumes one pass; repeated phrases, accompaniment and fast ornamentation can reduce reliability. Target matchedAt values are alignment markers, not precise observed timings; use event start times for citations.' };
      } else {
        const evidence = await videoEvidence(this.file, controller.signal, progress);
        context.duration = evidence.duration; frames = evidence.frames;
      }
      controller.signal.throwIfAborted();
      progress('AI is reviewing the evidence…');
      const report = await requestAIGrade(this.app.prefs.apiKey, context, measurements, frames, controller.signal);
      if (this.controller !== controller || controller.signal.aborted) return;
      this.report = report; this.status = 'Review complete. Download it before leaving this page to keep a copy.';
    } catch (error) {
      if (this.controller === controller && !controller.signal.aborted) this.status = describeError(error);
    } finally {
      if (this.controller === controller) { this.controller = null; this.refresh(); }
    }
  }

  private reportView(report: AIGrade): HTMLElement {
    const list = (title: string, items: string[]) => items.length ? h('div', {}, h('h3', {}, title), h('ul', {}, ...items.map(item => h('li', {}, item)))) : null;
    return h('section', { class: 'card ai-review' },
      gradeResult(overallAIGrade(report), this.art === 'raaga' ? 'Raaga · AI pitch review' : 'Kuchipudi · AI position review', report.summary,
        report.improvements[0] || 'Discuss this review with your teacher.', 'Provisional AI feedback based only on the supplied evidence.'),
      ...report.criteria.map(item => h('div', { class: 'ai-criterion' }, h('div', { class: 'row space' }, h('h3', {}, item.name), h('strong', {}, item.score === null ? 'Not assessed' : `${item.score}/100`)), h('p', {}, item.evidence),
        h('div', { class: 'row' }, ...item.timestamps.map(seconds => h('button', { class: 'link small', onClick: () => { if (this.player) this.player.currentTime = seconds; } }, `Review ${formatTime(seconds)}`))))),
      list('What went well', report.strengths), list('What to practice next', report.improvements), list('Limits of this review', report.limitations),
      h('p', { class: 'tiny muted' }, `AI model: ${report.model}. Criterion scores are equally weighted; unassessed criteria prevent an overall grade.`),
      h('button', { class: 'btn btn-secondary', onClick: () => {
        const blob = new Blob([JSON.stringify({ art: this.art, lessonId: this.lessonId, recording: this.file?.name, date: new Date().toISOString(), ...report }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob); const link = h('a', { href: url, download: `${this.art}-practice-review.json` }); link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      } }, 'Download review'));
  }
}
