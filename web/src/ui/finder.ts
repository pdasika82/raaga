import { AudioCapture } from '../audio/capture';
import { midiFromHz, westernName, westernPitchClassName, type PitchFrame } from '../core/pitch';
import { scaleById } from '../core/scale';
import { resolveDegrees, startingMidi } from '../core/swara';
import type { App } from './app';
import { clear, h } from './dom';
import { showAdjustSheet } from './setup';
import { playPhrase, playTone } from './tone';

type Step = 'hum' | 'hear' | 'range' | 'confirm';

/** Guided "Find comfortable Sa": hum, hear a suggestion, check the range, confirm. */
export class PitchFinderView {
  readonly el = h('div', { class: 'view' });
  private capture = new AudioCapture();
  private unsub: (() => void) | null = null;
  private step: Step = 'hum';
  private hums: number[] = [];
  private window: { at: number; midi: number }[] = [];
  private suggested = 55; // MIDI of the suggested starting note
  private rangeAnswers: { high?: 'ok' | 'high'; low?: 'ok' | 'low' } = {};
  private live = h('div', { class: 'target-name' }, '—');
  private liveSub = h('div', { class: 'muted small' }, '');
  private bar = h('div', { class: 'level-bar hold-fill' });
  private status = h('div', { class: 'status' });
  private muteUntil = 0;

  constructor(private app: App) {}

  async show(): Promise<void> {
    this.step = 'hum';
    this.hums = [];
    this.window = [];
    this.rangeAnswers = {};
    this.render();
    this.unsub?.();
    this.unsub = this.capture.onFrame((f) => this.onFrame(f));
  }

  async leave(): Promise<void> {
    this.unsub?.();
    this.unsub = null;
    await this.capture.stop();
  }

  private get sa(): { tonic: number; saOctave: number } {
    return { tonic: ((this.suggested % 12) + 12) % 12, saOctave: Math.floor(this.suggested / 12) - 1 };
  }

  private render(): void {
    const { prefs } = this.app;
    clear(this.el);
    const back = h('button', { class: 'link', onClick: () => this.app.navigate('practice') }, '‹ Practice');
    const steps = ['Hum', 'Hear', 'Range', 'Confirm'];
    const idx = ['hum', 'hear', 'range', 'confirm'].indexOf(this.step);
    const crumbs = h('div', { class: 'crumbs' }, ...steps.map((s, i) => h('span', { class: i === idx ? 'crumb current' : i < idx ? 'crumb done' : 'crumb' }, s)));

    if (this.step === 'hum') {
      this.el.append(back, h('section', { class: 'card' },
        h('h2', {}, 'Find a comfortable Sa'),
        crumbs,
        h('p', {}, `Hum a relaxed note and hold it. Any note is fine. Three hums, ${3 - this.hums.length} to go.`),
        h('div', { class: 'center' }, this.live, this.liveSub, h('div', { class: 'level hold-track' }, this.bar)),
        !this.capture.running ? h('button', { class: 'btn', onClick: () => this.start() }, 'Start listening') : null,
        this.hums.length ? h('div', { class: 'muted small' }, 'Heard: ' + this.hums.map((m) => westernName(Math.round(m))).join(', ')) : null,
        this.status));
      return;
    }
    const s = this.sa;
    const start = startingMidi(s.tonic, s.saOctave);
    const deg = resolveDegrees(scaleById('shankarabharanam'));
    const phrase = ['S', 'R', 'G', 'P', 'S'].map((f) => start + (deg[f as keyof typeof deg] ?? 0));
    if (this.step === 'hear') {
      this.el.append(back, h('section', { class: 'card' },
        h('h2', {}, 'Hear the suggestion'),
        crumbs,
        h('div', { class: 'kv' }, h('span', { class: 'muted' }, 'Suggested Sa'), h('span', { class: 'kv-val' }, `${westernPitchClassName(s.tonic)} · starting note ${westernName(start)}`)),
        h('div', { class: 'row' },
          h('button', { class: 'btn btn-secondary', onClick: () => void playTone(start, prefs.a4, 1.5) }, '▶ Play Sa'),
          h('button', { class: 'btn btn-secondary', onClick: () => void playPhrase(phrase, prefs.a4, 0.6) }, '▶ Sa Ri Ga Pa Sa')),
        h('p', { class: 'muted small' }, 'Sing along once. Then check the range.'),
        h('div', { class: 'row' }, h('button', { class: 'btn', onClick: () => { this.step = 'range'; this.render(); } }, 'Next'))));
      return;
    }
    if (this.step === 'range') {
      const hi = start + 12, lo = start - 5;
      const ask = (label: string, midi: number, key: 'high' | 'low') => h('div', { class: 'range-row' },
        h('div', {}, h('div', {}, label), h('div', { class: 'muted small' }, westernName(midi))),
        h('div', { class: 'row' },
          h('button', { class: 'btn btn-secondary btn-sm', onClick: () => void playTone(midi, prefs.a4, 1.2) }, '▶'),
          h('button', { class: `btn btn-sm ${this.rangeAnswers[key] === 'ok' ? '' : 'btn-secondary'}`, onClick: () => { this.rangeAnswers[key] = 'ok'; this.render(); } }, 'Comfortable'),
          h('button', { class: `btn btn-sm ${this.rangeAnswers[key] && this.rangeAnswers[key] !== 'ok' ? '' : 'btn-secondary'}`, onClick: () => { if (key === 'high') this.rangeAnswers.high = 'high'; else this.rangeAnswers.low = 'low'; this.render(); } }, key === 'high' ? 'Too high' : 'Too low')));
      const both = this.rangeAnswers.high && this.rangeAnswers.low;
      this.el.append(back, h('section', { class: 'card' },
        h('h2', {}, 'Check the range'),
        crumbs,
        h('p', {}, 'Play each note, sing it, and say how it felt.'),
        ask('Highest note of the lesson (upper Sa)', hi, 'high'),
        ask('Lowest note (Pa below Sa)', lo, 'low'),
        both ? h('div', { class: 'row' }, h('button', { class: 'btn', onClick: () => this.applyRange() }, 'Next')) : null));
      return;
    }
    this.el.append(back, h('section', { class: 'card' },
      h('h2', {}, 'Confirm'),
      crumbs,
      h('div', { class: 'kv' }, h('span', { class: 'muted' }, 'Suggested Sa'), h('span', { class: 'kv-val' }, westernPitchClassName(s.tonic))),
      h('div', { class: 'kv' }, h('span', { class: 'muted' }, 'Starting note'), h('span', { class: 'kv-val' }, westernName(start))),
      h('div', { class: 'row' },
        h('button', { class: 'btn btn-secondary', onClick: () => void playPhrase([start, ...phrase.slice(1)], prefs.a4, 0.6) }, '▶ Hear & try'),
        h('button', { class: 'btn', onClick: () => { this.app.update({ tonic: s.tonic, saOctave: s.saOctave }); this.app.navigate('practice'); } }, 'Use this setting'),
        h('button', { class: 'btn btn-secondary', onClick: () => showAdjustSheet(this.app, s, () => this.app.navigate('practice')) }, 'Adjust')),
      h('p', { class: 'muted small' }, 'Keep it fixed for a few weeks so your ear learns the intervals. A teacher\'s setting can be entered under Adjust.')));
  }

  private applyRange(): void {
    let start = this.suggested;
    if (this.rangeAnswers.high === 'high' && this.rangeAnswers.low === 'low') { /* narrow range: keep */ }
    else if (this.rangeAnswers.high === 'high') start -= 2;
    else if (this.rangeAnswers.low === 'low') start += 2;
    this.suggested = start;
    this.step = 'confirm';
    this.render();
  }

  private async start(): Promise<void> {
    this.status.textContent = 'Starting microphone…';
    try {
      await this.capture.start();
      this.status.textContent = '';
      this.render();
    } catch (err) {
      this.status.textContent = (err as Error).message;
    }
  }

  private onFrame(f: PitchFrame): void {
    if (this.step !== 'hum' || performance.now() < this.muteUntil) return;
    const now = performance.now();
    const voiced = f.frequency != null && f.clarity >= 0.5 && f.rms >= 0.008;
    if (voiced) {
      const midi = midiFromHz(f.frequency!, this.app.prefs.a4);
      this.window.push({ at: now, midi });
      this.live.textContent = westernName(Math.round(midi));
      this.liveSub.textContent = `${f.frequency!.toFixed(0)} Hz`;
    } else if (this.window.length && now - this.window[this.window.length - 1].at > 600) {
      this.window = [];
      this.bar.style.width = '0%';
    }
    this.window = this.window.filter((w) => now - w.at <= 1400);
    const sorted = this.window.map((w) => w.midi).sort((a, b) => a - b);
    if (!sorted.length) return;
    const median = sorted[sorted.length >> 1];
    const steady = this.window.filter((w) => Math.abs(w.midi - median) <= 0.6);
    const covered = now - this.window[0].at;
    this.bar.style.width = `${Math.round(Math.min(1, covered / 1200) * 100)}%`;
    if (covered >= 1200 && steady.length >= 18) {
      this.hums.push(steady.reduce((a, w) => a + w.midi, 0) / steady.length);
      this.window = [];
      this.muteUntil = now + 800;
      this.bar.style.width = '0%';
      if (this.hums.length >= 3) {
        const s = [...this.hums].sort((a, b) => a - b);
        this.suggested = Math.round(s[1]);
        void this.capture.stop();
        this.step = 'hear';
      }
      this.render();
    }
  }
}
