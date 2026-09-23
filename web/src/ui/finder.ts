import { AudioCapture } from '../audio/capture';
import { hzFromMidi, midiFromHz, pitchClass, SWARA_NAMES, westernName, westernPitchClassName, type PitchFrame } from '../core/pitch';
import type { App } from './app';
import { clear, h } from './dom';

interface Step {
  swara: string;
  title: string;
  hint: string;
  /** semitones above Sa; 0 for Sa itself */
  offset: number;
}

const STEPS: Step[] = [
  { swara: 'S', title: 'Sing Sa', hint: 'Your home note. Sing "aa" on the most comfortable, relaxed pitch you have, and hold it steady.', offset: 0 },
  { swara: 'R', title: 'Sing Ri', hint: 'Two half-steps above your Sa. Tap "Hear it" if you are unsure, then match it.', offset: 2 },
  { swara: 'G', title: 'Sing Ga', hint: 'Four half-steps above Sa, the bright third.', offset: 4 },
  { swara: 'P', title: 'Sing Pa', hint: 'Seven half-steps above Sa. After Sa this is the most stable note; it should feel like it locks in.', offset: 7 },
  { swara: 'Ṡ', title: 'Sing upper Sa', hint: 'One octave above your Sa. If this strains, your Sa is probably set too high.', offset: 12 },
];

interface Result {
  step: Step;
  midi: number;
  verdict: string;
  ok: boolean;
}

/** Guided pitch check: sing a prompted swara, hold it, hear where you landed. */
export class PitchFinderView {
  readonly el = h('div', { class: 'view' });
  private capture = new AudioCapture();
  private unsub: (() => void) | null = null;
  private stepIndex = 0;
  private saMidi: number | null = null;
  private results: Result[] = [];
  private recent: number[] = [];
  private voicedFrames = 0;
  private listening = false;
  private muteUntil = 0;
  private toneCtx: AudioContext | null = null;

  private live = h('div', { class: 'meter-note' }, '—');
  private liveSub = h('div', { class: 'meter-sub' }, '');
  private hold = h('div', { class: 'level-bar' });
  private panel = h('div', { class: 'finder-panel' });
  private status = h('div', { class: 'status' });

  constructor(private app: App) {}

  async show(): Promise<void> {
    this.stepIndex = 0;
    this.saMidi = null;
    this.results = [];
    this.render();
    this.unsub?.();
    this.unsub = this.capture.onFrame((f) => this.onFrame(f));
  }

  async leave(): Promise<void> {
    this.listening = false;
    this.unsub?.();
    this.unsub = null;
    await this.capture.stop();
  }

  private get step(): Step {
    return STEPS[this.stepIndex];
  }

  private render(): void {
    const step = this.step;
    const target = this.saMidi != null && step.offset > 0 ? this.saMidi + step.offset : null;
    clear(this.el).append(h('div', { class: 'view' },
      h('button', { class: 'link', onClick: () => this.app.navigate('practice') }, '‹ Practice'),
      h(
        'section',
        { class: 'card' },
        h('div', { class: 'muted small' }, `Step ${this.stepIndex + 1} of ${STEPS.length}`),
        h('h2', {}, step.title),
        h('p', { class: 'instructions' }, step.hint),
        target != null
          ? h('div', { class: 'row' }, h('button', { class: 'btn btn-secondary', onClick: () => this.playTone(target) }, '🔊 Hear it'), h('span', { class: 'muted small' }, `Target: ${westernName(target)} · ${hzFromMidi(target).toFixed(0)} Hz`))
          : null,
      ),
      h(
        'section',
        { class: 'card meter' },
        this.live,
        this.liveSub,
        h('div', { class: 'level finder-hold' }, this.hold),
        h('div', { class: 'muted tiny' }, 'Hold the note until the bar fills'),
        !this.capture.running
          ? h('button', { class: 'btn', onClick: () => this.startListening() }, 'Start listening')
          : null,
        this.status,
      ),
      this.panel,
      this.results.length ? this.summary() : null,
    ));
    if (this.capture.running) this.beginStep();
  }

  private async startListening(): Promise<void> {
    this.status.textContent = 'Starting microphone…';
    try {
      await this.capture.start();
      this.status.textContent = '';
      this.render();
    } catch (err) {
      this.status.textContent = (err as Error).message;
    }
  }

  private beginStep(): void {
    this.recent = [];
    this.voicedFrames = 0;
    this.listening = true;
    clear(this.panel);
    this.hold.style.width = '0%';
    this.live.textContent = '—';
    this.live.className = 'meter-note';
    this.liveSub.textContent = 'Listening…';
  }

  private onFrame(f: PitchFrame): void {
    if (!this.listening || performance.now() < this.muteUntil) return;
    if (f.frequency == null || f.clarity < 0.6 || f.rms < 0.01) {
      if (this.recent.length === 0) this.liveSub.textContent = 'Listening… sing and hold';
      return;
    }
    const midi = midiFromHz(f.frequency, this.app.prefs.a4);
    this.recent.push(midi);
    if (this.recent.length > 60) this.recent.shift();
    this.voicedFrames++;

    // Live readout relative to Sa when we have one
    const chroma = Math.round(midi);
    const cents = Math.round((midi - chroma) * 100);
    this.live.textContent = this.saMidi != null ? SWARA_NAMES[pitchClass(chroma - this.saMidi)] : westernName(chroma);
    this.liveSub.textContent = `${westernName(chroma)} · ${f.frequency.toFixed(0)} Hz · ${cents >= 0 ? '+' : ''}${cents} ¢`;

    // Stability: 80% of the last ~1.7 s within ±50 cents of the median
    const need = 40;
    const window = this.recent.slice(-need);
    const sorted = [...window].sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1];
    const steady = window.filter((m) => Math.abs(m - median) <= 0.5);
    const progress = Math.min(1, (steady.length / need) * (window.length >= need ? 1 : window.length / need));
    this.hold.style.width = `${Math.round(progress * 100)}%`;

    if (window.length >= need && steady.length >= need * 0.8) {
      const value = steady.reduce((a, b) => a + b, 0) / steady.length;
      this.finishStep(value);
    } else if (this.voicedFrames > 200) {
      this.listening = false;
      this.liveSub.textContent = 'Could not get a steady note.';
      clear(this.panel).append(h('section', { class: 'card' }, h('p', {}, 'The pitch kept moving. Take a breath, pick one note and hold it without sliding.'), h('button', { class: 'btn', onClick: () => this.beginStep() }, 'Try again')));
    }
  }

  private finishStep(midi: number): void {
    this.listening = false;
    this.hold.style.width = '100%';
    const step = this.step;
    const chroma = Math.round(midi);
    const cents = Math.round((midi - chroma) * 100);
    const signed = (c: number) => `${c >= 0 ? '+' : ''}${c}`;
    let verdict: string;
    let ok: boolean;

    if (step.offset === 0) {
      this.saMidi = chroma;
      const pc = westernPitchClassName(chroma);
      verdict = `You sang ${westernName(chroma)} (${hzFromMidi(midi).toFixed(0)} Hz), ${signed(cents)} cents from ${pc}. Your Sa is ${pc}.`;
      ok = true;
      if (chroma < 45) verdict += ' That is very low for a singing voice; if it felt gravelly, try again a little higher.';
      if (chroma > 69) verdict += ' That is quite high; make sure it is relaxed, not pushed.';
    } else {
      const target = this.saMidi! + step.offset;
      const dev = Math.round((midi - target) * 100);
      const targetName = `${step.swara} (${westernName(target)})`;
      if (Math.abs(dev) <= 20) {
        verdict = `That's ${targetName}, ${signed(dev)} cents. In tune.`;
        ok = true;
      } else if (Math.abs(dev) <= 50) {
        verdict = `That's ${targetName}, but ${dev > 0 ? 'sharp' : 'flat'} by ${Math.abs(dev)} cents. Ease it ${dev > 0 ? 'down' : 'up'} a touch.`;
        ok = false;
      } else {
        const semis = chroma - this.saMidi!;
        const sungName = SWARA_NAMES[pitchClass(semis)];
        const diff = chroma - target;
        verdict = `You sang ${sungName} (${westernName(chroma)}), ${Math.abs(diff)} half-step${Math.abs(diff) === 1 ? '' : 's'} ${diff > 0 ? 'above' : 'below'} ${targetName}. Tap "Hear it", then match it.`;
        ok = false;
      }
    }
    this.results = this.results.filter((r) => r.step !== step);
    this.results.push({ step, midi, verdict, ok });

    const last = this.stepIndex === STEPS.length - 1;
    const buttons = h('div', { class: 'row' });
    buttons.append(h('button', { class: 'btn btn-secondary', onClick: () => this.beginStep() }, 'Try again'));
    if (step.offset === 0) {
      const pc = pitchClass(this.saMidi!);
      buttons.append(h('button', { class: 'btn', onClick: () => { this.app.setTonic(pc); this.next(); } }, `Use Sa = ${westernPitchClassName(pc)} and continue`));
    } else if (!last) {
      buttons.append(h('button', { class: 'btn', onClick: () => this.next() }, 'Next'));
    } else {
      buttons.append(h('button', { class: 'btn', onClick: () => this.app.navigate('practice') }, 'Done'));
    }
    clear(this.panel).append(h('section', { class: `card finder-result ${ok ? 'ok-border' : 'warn-border'}` }, h('p', { class: 'verdict' }, verdict), buttons));
    this.live.className = `meter-note ${ok ? 'acc-inTune' : 'acc-off'}`;
    this.el.querySelector('.finder-summary')?.replaceWith(this.summary());
    if (!this.el.querySelector('.finder-summary')) this.el.append(this.summary());
  }

  private next(): void {
    this.stepIndex = Math.min(STEPS.length - 1, this.stepIndex + 1);
    this.render();
  }

  private summary(): HTMLElement {
    const sa = this.saMidi != null ? `Sa = ${westernPitchClassName(this.saMidi)} (${westernName(this.saMidi)})` : 'Sa not found yet';
    return h(
      'section',
      { class: 'card finder-summary' },
      h('h3', {}, 'So far'),
      h('div', { class: 'small' }, sa),
      ...this.results.map((r) => h('div', { class: `small ${r.ok ? 'ok' : 'warn'}` }, `${r.step.swara}: ${r.verdict}`)),
    );
  }

  private playTone(midi: number): void {
    try {
      this.toneCtx ??= new AudioContext();
      const ctx = this.toneCtx;
      void ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = hzFromMidi(midi, this.app.prefs.a4);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 1.7);
      // Don't let the mic hear the reference tone as the singer's note
      this.muteUntil = performance.now() + 1900;
      this.recent = [];
    } catch {
      this.status.textContent = 'Could not play the reference tone.';
    }
  }
}
