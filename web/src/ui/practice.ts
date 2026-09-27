import { AudioCapture } from '../audio/capture';
import { liveGuidance, type LiveGuidance } from '../core/guidance';
import { lessonScale, type Lesson } from '../core/lesson';
import { hzFromMidi, midiFromHz, westernName, type PitchFrame } from '../core/pitch';
import { reading } from '../core/scale';
import { newSession, type TargetMark } from '../core/session';
import { detectedLabel, parseSequence, scaleGlossary, startingMidi, tokenLabel, tokenMidi, tokenSpoken, type Token } from '../core/swara';
import { SessionStore } from '../storage/db';
import type { App } from './app';
import { clear, formatTime, h } from './dom';
import { PitchMeter } from './meter';
import { showPitchReference } from './reference';
import { attemptsPanel, noteGuideControl, pitchSetupInline, showAdjustSheet, tanpuraControl } from './setup';
import { tanpura } from '../audio/tanpura';
import { playPhrase, playTone } from './tone';

type Phase = 'idle' | 'countdown' | 'recording';

/** Practice: Start → countdown → one note at a time → Finish & review. Sa and the starting note stay fixed. */
export class PracticeView {
  readonly el = h('div', { class: 'view' });
  private capture = new AudioCapture();
  private meter = new PitchMeter();
  private unsub: (() => void) | null = null;
  private phase: Phase = 'idle';
  private tunerMode = false;
  private lesson: Lesson;
  private tokens: Token[] = [];
  private targets: TargetMark[] = [];
  private index = 0;
  private saMidi = 55;
  private window: { at: number; midi: number }[] = [];
  private judgedAt = 0;
  private lastVoiced = 0;
  private countdownTimer: number | null = null;
  private ticker: number | null = null;
  private finishing = false;
  private flash: { headline: string; detail: string; kind: string; until: number } | null = null;
  /** The note just judged; the singer is usually still holding it, so it is not a new attempt. */
  private carry: number | null = null;
  private octaveMisses = 0;
  private octaveOffered = false;
  private recentKinds: string[] = [];
  private qualityWarnedAt = 0;
  private attemptCount = 0;

  private targetName = h('div', { class: 'target-name' }, '');
  private guidance = h('div', { class: 'guidance' });
  private needle = h('div', { class: 'gneedle' });
  private tiles = h('div', { class: 'tiles' });
  private counter = h('span', { class: 'muted small' }, '');
  private recDot = h('span', { class: 'rec-dot' });
  private timerText = h('span', {}, '');
  private timer = h('span', { class: 'rec-state' }, this.recDot, this.timerText);
  private holdBar = h('div', { class: 'level-bar hold-fill' });
  private status = h('div', { class: 'status' });
  private attemptRows = h('tbody', {});
  private attempts = h('table', { class: 'attempts-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Asked'), h('th', {}, 'You sang'))), this.attemptRows);
  private dTarget = h('td', {}, '—');
  private dDetected = h('td', {}, '—');
  private dDiff = h('td', {}, '—');
  private offer = h('div', { class: 'offer', hidden: true });

  constructor(private app: App) {
    this.lesson = app.lesson();
    this.render();
  }

  refresh(): void {
    if (this.phase !== 'idle') return;
    this.lesson = this.app.lesson();
    this.render();
  }

  async leave(): Promise<void> {
    if (tanpura.running) tanpura.stop();
    if (this.phase === 'recording') await this.finish();
    if (this.countdownTimer) window.clearInterval(this.countdownTimer);
    this.phase = 'idle';
    await this.capture.stop();
    this.render();
  }

  // MARK: render

  private render(): void {
    const { prefs } = this.app;
    const lesson = this.lesson;
    const scale = lessonScale(lesson);
    this.tokens = lesson.sequence ? parseSequence(lesson.sequence) : [];
    const guided = this.tokens.length > 0;
    const drill = this.app.drill != null;
    const recording = this.phase === 'recording';

    clear(this.el);
    if (!prefs.onboarded && this.phase === 'idle' && !this.tunerMode) this.el.append(this.onboardingCard());

    const lessonSelect = h('select', { class: 'select', disabled: this.phase !== 'idle' || drill, onChange: (e) => this.app.setLesson((e.target as HTMLSelectElement).value) });
    for (const g of this.app.lessonGroups()) {
      const grp = h('optgroup', { label: g.label });
      for (const l of g.lessons) grp.append(h('option', { value: l.id, selected: l.id === lesson.id }, l.title));
      lessonSelect.append(grp);
    }
    const holdText = !prefs.holdNotes ? 'Notes register as soon as they are steady.' : lesson.hold ? `Hold each note for ${lesson.hold} second${lesson.hold === 1 ? '' : 's'}.` : '';
    this.el.append(h('section', { class: 'card header' },
      h('div', { class: 'row space header-row' },
        h('span', { class: 'crumb-title' }, h('span', { class: 'muted' }, '⫶'), h('b', {}, 'Practice'), h('span', { class: 'divider' }), h('span', { class: 'muted' }, scale.tradition)),
        h('span', { class: 'header-right' }, this.tunerMode ? null : pitchSetupInline(this.app, { locked: this.phase !== 'idle', scale }), noteGuideControl(this.app), tanpuraControl(this.app), recording ? this.timer : null)),
      this.phase === 'idle' && !drill ? lessonSelect : h('h2', {}, lesson.title),
      h('div', { class: 'muted small' }, `${scale.name}${holdText ? ' · ' + holdText : ''}`),
      this.phase === 'idle' ? h('p', { class: 'instructions' }, lesson.instructions) : null,
      drill && this.phase === 'idle' ? h('button', { class: 'link small', onClick: () => this.app.clearDrill() }, 'Back to lessons') : null,
    ));

    if (this.tunerMode) {
      this.el.append(this.meter.el, h('section', { class: 'controls' },
        h('button', { class: 'btn', onClick: () => this.toggleTuner() }, this.capture.running ? 'Stop listening' : 'Start listening'),
        h('button', { class: 'link', onClick: () => { this.tunerMode = false; void this.capture.stop(); this.render(); } }, 'Back to practice')),
        this.status);
      this.meter.setScale(scale, prefs.tonic, prefs.notation);
      this.meter.update(this.capture.frame, null, prefs.notation, prefs.tonic, this.capture.running);
      this.subscribe((f) => {
        const r = f.frequency && f.clarity >= 0.5 ? reading(scale, midiFromHz(f.frequency, prefs.a4), prefs.tonic) : null;
        this.meter.update(f, r, prefs.notation, prefs.tonic, this.capture.running);
      });
      return;
    }

    const setup = guided ? attemptsPanel(this.attempts, this.attemptCount, this.phase !== 'idle') : h('span', {});

    if (this.phase === 'idle') {
      this.el.append(h('div', { class: 'practice-grid' },
        h('section', { class: 'card exercise center' },
          guided ? this.renderTiles(scale) : h('p', { class: 'muted small' }, 'Free singing: nothing is prompted, every note is accepted.'),
          guided ? h('div', { class: 'muted tiny' }, 'Tap a swara to practise it on its own.') : null,
          h('button', { class: 'btn btn-big', onClick: () => this.startPractice() }, 'Start practice'),
          h('div', { class: 'muted tiny' }, 'Three-second countdown, then recording.'),
          h('button', { class: 'link small', onClick: () => { this.tunerMode = true; this.render(); } }, 'Just use the pitch tuner ›')),
        setup), this.status);
      return;
    }

    if (this.phase === 'countdown') {
      this.el.append(h('div', { class: 'practice-grid' },
        h('section', { class: 'card exercise center countdown' }, h('div', { class: 'muted' }, 'Get ready'), h('div', { class: 'count' }, '3'),
          h('div', { class: 'muted small' }, guided ? `First note: ${tokenSpoken(this.tokens[0], prefs.notation, prefs.tonic, scale)} (${westernName(tokenMidi(this.tokens[0], scale, this.saMidi) ?? this.saMidi)})` : 'Recording starts after the countdown')),
        setup));
      return;
    }

    const finishBtn = h('button', { class: 'link', onClick: () => void this.finish() }, 'Finish & review →');
    if (guided) {
      const pauseBtn = h('button', { class: 'btn btn-secondary' }, 'Pause');
      pauseBtn.addEventListener('click', () => {
        if (this.capture.paused) {
          this.capture.resumeRecording();
          pauseBtn.textContent = 'Pause';
          this.recDot.classList.remove('paused');
          this.timerText.textContent = `Recording · ${formatTime(this.capture.elapsed)}`;
        } else {
          this.capture.pauseRecording();
          pauseBtn.textContent = 'Resume';
          this.window = [];
          this.recDot.classList.add('paused');
          this.timerText.textContent = 'Paused';
          this.guidance.className = 'guidance g-paused';
          this.guidance.replaceChildren(h('div', { class: 'g-head' }, 'Paused'), h('div', { class: 'g-detail' }, "Resume when you're ready."));
          this.needle.style.opacity = '0';
          this.holdBar.style.width = '0%';
        }
      });
      const glossary = scaleGlossary(scale);
      this.el.append(h('div', { class: 'practice-grid' },
        h('div', { class: 'exercise-col' },
          h('section', { class: 'card exercise' },
            h('div', { class: 'row space tiles-row' }, this.renderTiles(scale), this.counter),
            h('div', { class: 'exercise-body' },
              this.targetName,
              this.guidance,
              this.offer,
              h('div', { class: 'level hold-track' }, this.holdBar),
              h('div', { class: 'gauge2' }, h('div', { class: 'gauge2-track' }), h('div', { class: 'gauge2-zone' }), h('div', { class: 'gauge2-center' }), this.needle),
              h('div', { class: 'gauge-labels' }, h('span', {}, 'Lower'), h('span', {}, 'Target'), h('span', {}, 'Higher')),
              h('div', { class: 'row center-row' }, h('button', { class: 'btn play-btn', onClick: () => void this.playTarget() }, '🔈 Play'), pauseBtn)),
            h('div', { class: 'row space footer-row' },
              h('span', { class: 'row' },
                h('button', { class: 'link', onClick: () => this.skipTarget() }, 'Skip note'),
                h('button', { class: 'link muted', onClick: () => this.restart() }, 'Restart'),
                h('button', { class: 'link muted', onClick: () => void this.discard() }, 'Discard')),
              finishBtn)),
          h('details', { class: 'details', open: true },
            h('summary', {}, 'Pitch details ', h('button', { class: 'info', title: 'Pitch reference', 'aria-label': 'Pitch reference', onClick: (e) => { e.preventDefault(); showPitchReference(this.app, scale); } }, 'ⓘ')),
            h('table', { class: 'detail-table' },
              h('thead', {}, h('tr', {}, h('th', {}, 'Target'), h('th', {}, 'Detected'), h('th', {}, 'Difference from target'))),
              h('tbody', {}, h('tr', {}, this.dTarget, this.dDetected, this.dDiff))),
            glossary ? h('div', { class: 'muted tiny glossary' }, glossary) : null)),
        setup), this.status);
      this.updateTargetHeader();
    } else {
      this.el.append(h('div', { class: 'practice-grid' },
        h('div', { class: 'exercise-col' }, this.meter.el, h('section', { class: 'controls' }, h('button', { class: 'link muted', onClick: () => void this.discard() }, 'Discard'), finishBtn)), setup), this.status);
      this.meter.setScale(scale, prefs.tonic, prefs.notation);
    }
  }

  private onboardingCard(): HTMLElement {
    const { prefs } = this.app;
    const start = startingMidi(prefs.tonic, prefs.saOctave);
    const demo = [0, 2, 4, 2, 0].map((st) => start + st);
    return h('section', { class: 'card onboarding' },
      h('div', { class: 'eyebrow' }, 'FIRST TIME HERE'),
      h('h2', {}, 'Three steps'),
      h('ol', {},
        h('li', {}, h('b', {}, 'Choose a comfortable Sa. '), h('button', { class: 'link', onClick: () => this.app.navigate('tune') }, 'Find comfortable Sa ›')),
        h('li', {}, h('b', {}, 'Hear Sa Ri Ga from it. '), h('button', { class: 'link', onClick: () => void playPhrase(demo, prefs.a4, 0.7) }, '▶ Play ›')),
        h('li', {}, h('b', {}, 'Try it. '), h('button', { class: 'link', onClick: () => { this.app.setLesson('first_notes'); this.app.update({ onboarded: true }); } }, 'Start First notes ›'))),
      h('div', { class: 'muted small' }, 'Shankarabharanam is one common starting raga; Mayamalavagowla is another and is also in the lesson list.'),
      h('button', { class: 'link small muted', onClick: () => this.app.update({ onboarded: true }) }, 'Hide'));
  }

  private renderTiles(scale: ReturnType<typeof lessonScale>): HTMLElement {
    const { prefs } = this.app;
    clear(this.tiles);
    this.tokens.forEach((tok, i) => {
      const done = this.phase === 'recording' && i < this.index;
      const cur = this.phase === 'recording' && i === this.index;
      const label = tokenLabel(tok, prefs.notation, prefs.tonic, scale);
      const spoken = tokenSpoken(tok, prefs.notation, prefs.tonic, scale);
      this.tiles.append(h('button', {
        class: `tile${cur ? ' current' : ''}${done ? ' done' : ''}`,
        title: this.phase === 'recording' ? `Jump to ${spoken}` : `Practise ${spoken} only`,
        onClick: () => (this.phase === 'recording' ? this.jumpTo(i) : this.app.startSwaraDrill(this.lesson, tok.raw, spoken)),
      }, label));
    });
    return this.tiles;
  }

  private updateTargetHeader(): void {
    const { prefs } = this.app;
    const scale = lessonScale(this.lesson);
    const tok = this.tokens[this.index];
    if (!tok) return;
    this.targetName.textContent = tokenLabel(tok, prefs.notation, prefs.tonic, scale);
    const midi = tokenMidi(tok, scale, this.saMidi);
    this.dTarget.textContent = midi == null ? '—' : `${tok.raw} · ${westernName(midi)}`;
    [...this.tiles.children].forEach((p, i) => { p.className = `tile${i === this.index ? ' current' : ''}${i < this.index ? ' done' : ''}`; });
    (this.tiles.children[this.index] as HTMLElement | undefined)?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    this.counter.textContent = `${this.index + 1} of ${this.tokens.length}`;
    const btn = this.el.querySelector<HTMLButtonElement>('.play-btn');
    if (btn) btn.textContent = `🔈 Play ${tokenSpoken(tok, prefs.notation, prefs.tonic, scale)}`;
  }

  // MARK: flow

  private async startPractice(): Promise<void> {
    if (this.phase !== 'idle') return;
    this.status.textContent = 'Starting microphone…';
    try {
      await this.capture.start();
    } catch (err) {
      this.status.textContent = (err as Error).message;
      return;
    }
    this.status.textContent = '';
    this.saMidi = startingMidi(this.app.prefs.tonic, this.app.prefs.saOctave);
    this.phase = 'countdown';
    this.render();
    let n = 3;
    this.countdownTimer = window.setInterval(() => {
      n--;
      const e = this.el.querySelector('.count');
      if (n > 0) { if (e) e.textContent = String(n); return; }
      if (this.countdownTimer) window.clearInterval(this.countdownTimer);
      this.countdownTimer = null;
      this.beginRecording();
    }, 1000);
  }

  private beginRecording(): void {
    const scale = lessonScale(this.lesson);
    this.capture.beginRecording();
    this.phase = 'recording';
    this.index = 0;
    this.window = [];
    this.judgedAt = 0;
    this.finishing = false;
    this.carry = null;
    this.octaveMisses = 0;
    this.octaveOffered = false;
    this.recentKinds = [];
    this.attemptCount = 0;
    clear(this.attemptRows);
    this.attemptCount = 0;
    this.showAllAttempts = false;
    this.el.querySelector('.attempts .show-all')?.remove();
    this.targets = this.tokens.map((tok, i) => ({ index: i, token: tok.raw, midi: tokenMidi(tok, scale, this.saMidi), start: 0, matchedAt: null, cents: null, attempts: 0 }));
    this.render();
    this.ticker = window.setInterval(() => { if (!this.capture.paused) this.timerText.textContent = `Recording · ${formatTime(this.capture.elapsed)}`; }, 250);
    this.subscribe((f) => (this.tokens.length ? this.onGuidedFrame(f) : this.onFreeFrame(f)));
    if (!this.app.prefs.onboarded) this.app.update({ onboarded: true });
    if (this.tokens.length) this.cueTarget();
  }

  private subscribe(fn: (f: PitchFrame) => void): void {
    this.unsub?.();
    this.unsub = this.capture.onFrame(fn);
  }

  private holdSeconds(): number {
    return this.app.prefs.holdNotes ? (this.lesson.hold ?? 0.6) : 0.35;
  }

  private onFreeFrame(f: PitchFrame): void {
    const { prefs } = this.app;
    const scale = lessonScale(this.lesson);
    const r = f.frequency && f.clarity >= 0.5 ? reading(scale, midiFromHz(f.frequency, prefs.a4), prefs.tonic) : null;
    this.meter.update(f, r, prefs.notation, prefs.tonic, true);
  }

  private onGuidedFrame(f: PitchFrame): void {
    if (this.phase !== 'recording' || this.finishing || this.capture.paused) return;
    const { prefs } = this.app;
    const scale = lessonScale(this.lesson);
    const tok = this.tokens[this.index];
    if (!tok) return;
    const now = performance.now();
    const t = this.capture.elapsed;
    const voiced = f.frequency != null && f.clarity >= 0.5 && f.rms >= 0.008;
    if (voiced) this.lastVoiced = now;
    const targetMidi = tokenMidi(tok, scale, this.saMidi);
    const sungMidi = voiced ? midiFromHz(f.frequency!, prefs.a4) : null;
    const targetName = tokenSpoken(tok, prefs.notation, prefs.tonic, scale);

    // Still holding the note that was just judged: wait for a new onset before judging again.
    if (this.carry != null) {
      if (sungMidi != null && Math.abs(sungMidi - this.carry) <= 0.6) {
        if (!(this.flash && now < this.flash.until)) this.renderGuidance({ kind: 'silent', headline: `Now sing ${targetName}`, detail: prefs.holdNotes ? 'Take a breath, then hold it.' : 'Take a breath, then sing it.', cents: null, detected: detectedLabel(sungMidi, scale, prefs.notation, prefs.tonic) });
        else this.renderGuidance({ kind: 'silent', headline: '', detail: '', cents: null, detected: '' });
        return;
      }
      if (sungMidi != null || now - this.lastVoiced > 300) this.carry = null;
    }

    const hold = this.holdSeconds();
    const holdHint = !prefs.holdNotes ? 'Sing it steadily.' : hold >= 0.95 ? `Hold it for ${hold === 1 ? 'about a second' : `${hold} seconds`}.` : `Hold it for about ${hold} seconds.`;
    const g = liveGuidance({ frame: f, targetMidi, targetName, scale, tonic: prefs.tonic, a4: prefs.a4, notation: prefs.notation, silentFor: (now - this.lastVoiced) / 1000, holdHint });
    this.renderGuidance(g);
    this.trackQuality(g.kind, now);

    if (now < this.judgedAt) return;
    const holdMs = this.holdSeconds() * 1000;
    if (voiced && sungMidi != null) this.window.push({ at: now, midi: sungMidi });
    this.window = this.window.filter((w) => now - w.at <= holdMs + 150);
    const frames = this.window;
    const sorted = frames.map((w) => w.midi).sort((a, b) => a - b);
    const median = sorted.length ? sorted[sorted.length >> 1] : null;
    const steady = median == null ? [] : frames.filter((w) => Math.abs(w.midi - median) <= 0.6);
    const covered = frames.length ? now - frames[0].at : 0;
    const expectedFrames = Math.max(1, holdMs / 45);
    this.holdBar.style.width = `${Math.round(Math.min(1, Math.min(covered / holdMs, steady.length / (expectedFrames * 0.7))) * 100)}%`;
    if (!voiced && frames.length && now - this.lastVoiced > 600) {
      this.window = [];
      this.holdBar.style.width = '0%';
      return;
    }
    if (median == null || covered < holdMs || steady.length < expectedFrames * 0.7 || steady.length < frames.length * 0.7) return;

    // Held long enough: judge against the fixed target
    const mean = steady.reduce((a, w) => a + w.midi, 0) / steady.length;
    this.window = [];
    this.judgedAt = now + 250;
    this.carry = mean;
    this.holdBar.style.width = '0%';
    const target = this.targets[this.index];
    target.attempts++;
    this.attemptCount++;
    const dev = targetMidi == null ? null : Math.round((mean - targetMidi) * 100);
    const detected = detectedLabel(mean, scale, prefs.notation, prefs.tonic);

    if (targetMidi != null && dev != null && Math.abs(dev) <= 60) {
      target.matchedAt = t;
      target.cents = dev;
      this.octaveMisses = 0;
      this.addAttempt(Math.abs(dev) <= 20 ? 'ok' : 'near', this.noteText(targetName, targetMidi), `${this.noteText(targetName, mean)} · ${dev > 0 ? '+' : ''}${dev}¢`);
      this.flash = { headline: `${targetName} ✓`, detail: Math.abs(dev) <= 20 ? 'On pitch.' : `${dev > 0 ? 'Slightly high' : 'Slightly low'}, accepted.`, kind: 'onPitch', until: now + 700 };
      this.index++;
      if (this.index >= this.tokens.length) {
        this.finishing = true;
        this.renderGuidance({ kind: 'onPitch', headline: 'All notes done', detail: 'Finishing…', cents: null, detected: '' });
        window.setTimeout(() => void this.finish(), 900);
        return;
      }
      this.targets[this.index].start = t;
      this.updateTargetHeader();
      this.cueTarget();
      return;
    }

    // Mismatch: replay the reference and invite another attempt. Sa stays fixed.
    const sungName = detected.replace(/^near /, '').replace(' (outside this scale)', '');
    const steps = dev == null ? 0 : Math.round(Math.abs(dev) / 100);
    const where = dev == null ? '' : ` · ${steps >= 1 ? `${steps} step${steps > 1 ? 's' : ''}` : `${Math.abs(dev)}¢`} ${dev > 0 ? 'above' : 'below'}`;
    this.addAttempt('wrong', targetMidi == null ? targetName : this.noteText(targetName, targetMidi), `${this.noteText(sungName, mean)}${where}`);
    this.flash = { headline: `That didn't match ${targetName}`, detail: prefs.noteGuide ? 'Listen to the reference and try again.' : 'Find it against the drone and try again.', kind: 'wrongNote', until: now + 1600 };
    const nextTok = this.tokens[this.index + 1];
    const nextMidi = nextTok ? tokenMidi(nextTok, scale, this.saMidi) : null;
    const octaveOf = (m: number | null) => (m == null ? 0 : Math.abs(mean - (m - 12)) <= 0.6 ? 1 : Math.abs(mean - (m + 12)) <= 0.6 ? -1 : 0);
    const oct = octaveOf(targetMidi) || octaveOf(nextMidi);
    if (oct !== 0) {
      this.octaveMisses += oct;
      if (!this.octaveOffered && Math.abs(this.octaveMisses) >= 2) this.offerOctave(this.octaveMisses > 0 ? -1 : 1);
    } else {
      this.octaveMisses = 0;
    }
    if (targetMidi != null && prefs.noteGuide) {
      this.judgedAt = now + 1500;
      void playTone(targetMidi, prefs.a4, 1.0);
    }
  }

  private offerOctave(direction: 1 | -1): void {
    this.octaveOffered = true;
    const { prefs } = this.app;
    const newOct = prefs.saOctave + direction;
    if (newOct < 1 || newOct > 6) return;
    const newStart = startingMidi(prefs.tonic, newOct);
    this.offer.hidden = false;
    this.offer.replaceChildren(
      h('div', {}, `You're singing an octave ${direction < 0 ? 'lower' : 'higher'} than ${westernName(this.saMidi)}. Start on ${westernName(newStart)} instead?`),
      h('div', { class: 'row' },
        h('button', { class: 'btn btn-sm', onClick: () => { this.app.update({ saOctave: newOct }); this.retarget(newStart); this.offer.hidden = true; } }, `Use ${westernName(newStart)}`),
        h('button', { class: 'btn btn-secondary btn-sm', onClick: () => { this.offer.hidden = true; } }, `Keep ${westernName(this.saMidi)}`)));
  }

  /** Transpose all remaining targets to a new starting note. */
  private retarget(newStart: number): void {
    const scale = lessonScale(this.lesson);
    this.saMidi = newStart;
    if (tanpura.running) tanpura.retune(newStart, this.app.prefs.a4);
    for (const tg of this.targets) if (tg.matchedAt == null) tg.midi = tokenMidi(this.tokens[tg.index], scale, newStart);
    this.octaveMisses = 0;
    this.updateTargetHeader();
    const setup = this.el.querySelector('.setup');
    if (setup) setup.replaceWith(pitchSetupInline(this.app, { locked: true, scale }));
  }

  private trackQuality(kind: string, now: number): void {
    this.recentKinds.push(kind);
    if (this.recentKinds.length > 140) this.recentKinds.shift();
    if (this.recentKinds.length < 60 || now - this.qualityWarnedAt < 20000) return;
    const unclear = this.recentKinds.filter((k) => k === 'unclear').length;
    if (unclear / this.recentKinds.length >= 0.6) {
      this.qualityWarnedAt = now;
      this.status.textContent = 'Check the recording: move closer to the phone or reduce background noise.';
    }
  }

  private showAllAttempts = false;

  private addAttempt(kind: 'ok' | 'near' | 'wrong' | 'skip', asked: string, sung: string): void {
    this.attemptRows.prepend(h('tr', { class: `attempt-${kind}` }, h('td', {}, asked), h('td', {}, sung)));
    const count = this.el.querySelector('.attempts .count');
    if (count) count.textContent = String(this.attemptCount);
    this.trimAttempts();
  }

  /** Keep the panel short: the latest 8 rows unless expanded. */
  private trimAttempts(): void {
    const rows = [...this.attemptRows.children] as HTMLElement[];
    const limit = 8;
    rows.forEach((r, i) => { r.hidden = !this.showAllAttempts && i >= limit; });
    let more = this.el.querySelector<HTMLButtonElement>('.attempts .show-all');
    if (rows.length > limit) {
      if (!more) {
        more = h('button', { class: 'link small show-all', onClick: () => { this.showAllAttempts = !this.showAllAttempts; this.trimAttempts(); } }, '');
        this.attempts.after(more);
      }
      more.textContent = this.showAllAttempts ? 'Show latest 8' : `Show all ${rows.length}`;
    } else if (more) {
      more.remove();
    }
  }

  /** "Ri · D4 · 294 Hz" */
  private noteText(name: string, midi: number): string {
    return `${name} · ${westernName(Math.round(midi))} · ${hzFromMidi(midi, this.app.prefs.a4).toFixed(0)} Hz`;
  }

  private renderGuidance(g: LiveGuidance): void {
    const now = performance.now();
    const shown = this.flash && now < this.flash.until ? this.flash : g;
    this.guidance.className = `guidance g-${shown.kind}`;
    this.guidance.replaceChildren(h('div', { class: 'g-head' }, shown.headline), h('div', { class: 'g-detail' }, shown.detail || ' '));
    const c = g.cents == null ? null : Math.max(-100, Math.min(100, g.cents));
    this.needle.style.opacity = c == null ? '0' : '1';
    if (c != null) this.needle.style.left = `${50 + c / 2}%`;
    this.needle.className = `gneedle g-${g.kind}`;
    this.dDetected.textContent = g.detected ? g.detected[0].toUpperCase() + g.detected.slice(1) : '—';
    this.dDiff.textContent = g.cents == null ? '—' : `${g.cents > 0 ? '+' : '−'}${Math.abs(g.cents)} cents`;
  }

  /** Make tile i the current target without judging anything. */
  private jumpTo(i: number): void {
    if (this.phase !== 'recording' || i < 0 || i >= this.tokens.length) return;
    this.window = [];
    this.carry = null;
    this.offer.hidden = true;
    this.index = i;
    this.targets[i].start = this.capture.elapsed;
    this.updateTargetHeader();
    this.cueTarget();
  }

  /** Start the sequence over; the recording keeps running, attempts so far are dropped. */
  private restart(): void {
    if (this.phase !== 'recording') return;
    const scale = lessonScale(this.lesson);
    const t = this.capture.elapsed;
    this.targets = this.tokens.map((tok, i) => ({ index: i, token: tok.raw, midi: tokenMidi(tok, scale, this.saMidi), start: i === 0 ? t : 0, matchedAt: null, cents: null, attempts: 0 }));
    this.attemptCount = 0;
    clear(this.attemptRows);
    const count = this.el.querySelector('.attempts .count');
    if (count) count.textContent = '0';
    this.octaveMisses = 0;
    this.offer.hidden = true;
    this.flash = null;
    this.jumpTo(0);
  }

  /** Stop and throw the recording away. */
  private async discard(): Promise<void> {
    if (this.phase !== 'recording') return;
    if (!confirm('Discard this recording? Nothing will be saved.')) return;
    this.phase = 'idle';
    if (this.ticker) window.clearInterval(this.ticker);
    this.ticker = null;
    this.unsub?.();
    this.unsub = null;
    if (this.capture.paused) this.capture.resumeRecording();
    await this.capture.endRecording();
    await this.capture.stop();
    this.status.textContent = 'Recording discarded.';
    this.render();
  }

  private skipTarget(): void {
    if (this.phase !== 'recording' || !this.tokens.length) return;
    this.window = [];
    const tok = this.tokens[this.index];
    if (tok) {
      this.attemptCount++;
      const m = tokenMidi(tok, lessonScale(this.lesson), this.saMidi);
      const name = tokenSpoken(tok, this.app.prefs.notation, this.app.prefs.tonic, lessonScale(this.lesson));
      this.addAttempt('skip', m == null ? name : this.noteText(name, m), 'skipped');
    }
    this.index++;
    if (this.index >= this.tokens.length) { void this.finish(); return; }
    this.targets[this.index].start = this.capture.elapsed;
    this.updateTargetHeader();
    this.cueTarget();
  }

  /** With the note guide on, play the current target and hold judging until it has finished. */
  private cueTarget(): void {
    if (!this.app.prefs.noteGuide || this.phase !== 'recording') return;
    const tok = this.tokens[this.index];
    const midi = tok ? tokenMidi(tok, lessonScale(this.lesson), this.saMidi) : null;
    if (midi == null) return;
    this.window = [];
    this.judgedAt = performance.now() + 1100;
    void playTone(midi, this.app.prefs.a4, 1.0);
  }

  private async playTarget(): Promise<void> {
    const tok = this.tokens[this.index];
    const midi = tok ? tokenMidi(tok, lessonScale(this.lesson), this.saMidi) : null;
    if (midi == null) return;
    this.window = [];
    this.judgedAt = performance.now() + 1500;
    await playTone(midi, this.app.prefs.a4, 1.2);
  }

  private async toggleTuner(): Promise<void> {
    if (this.capture.running) await this.capture.stop();
    else {
      try { await this.capture.start(); } catch (err) { this.status.textContent = (err as Error).message; }
    }
    this.render();
  }

  private async finish(): Promise<void> {
    if (this.phase !== 'recording') return;
    this.phase = 'idle';
    this.status.textContent = '';
    if (this.ticker) window.clearInterval(this.ticker);
    this.ticker = null;
    this.unsub?.();
    this.unsub = null;
    if (this.capture.paused) this.capture.resumeRecording();
    const result = await this.capture.endRecording();
    await this.capture.stop();
    if (!result) { this.render(); return; }
    if (result.duration < 1) { this.status.textContent = 'Recording too short to save.'; this.render(); return; }
    const guided = this.tokens.length > 0;
    const session = newSession({
      id: crypto.randomUUID(), lesson: this.lesson, tonic: this.app.prefs.tonic, a4: this.app.prefs.a4,
      duration: result.duration, audioMime: result.mime, samples: result.samples,
      mode: guided ? 'guided' : 'free', lessonSequence: guided ? this.tokens.map((t) => t.raw) : undefined, targets: guided ? this.targets : undefined,
    });
    await SessionStore.save(session, result.blob);
    this.render();
    this.app.openSession(session.id);
  }

  /** Used by the header "Too high or low?" affordance. */
  adjust(): void {
    showAdjustSheet(this.app);
  }
}
