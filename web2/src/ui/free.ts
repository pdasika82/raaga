import { AudioCapture } from '@audio/capture';
import { analyze, hasVoice, noteSequence, type PerformanceReport } from '@core/analyzer';
import { lessonScale } from '@core/lesson';
import { midiFromHz, westernName, westernPitchClassName, type PitchFrame } from '@core/pitch';
import { reading, scaleById, SCALES, type Scale } from '@core/scale';
import { newSession, type PracticeSession } from '@core/session';
import { describeSemitone, detectedLabel, parseSequence, startingMidi, tokenLabel, tokenMidi } from '@core/swara';
import { SessionStore } from '@storage/db';
import { followPasses, type Pass } from '../core/follow';
import { PRACTICES, usesBeginnerRaga, type Practice } from '../core/practices';
import type { App } from './app';
import { PitchChart } from './chart';
import { clear, formatTime, h } from './dom';

type Phase = 'idle' | 'listening';

/** Free practice: the app does not prompt. It listens, records, shows what was sung, and afterwards finds the lesson in it. */
export class FreePracticeView {
  readonly el = h('div', { class: 'page' });
  private capture = new AudioCapture();
  private unsub: (() => void) | null = null;
  private phase: Phase = 'idle';
  private lessonId = '';
  private ragaId = '';
  private ticker: number | null = null;
  private window: { at: number; midi: number }[] = [];
  private lastChip: number | null = null;
  private result: { session: PracticeSession; report: PerformanceReport; passes: Pass[] | null; blobUrl: string } | null = null;
  private selectedPass = 0;

  private bigName = h('div', { class: 'free-name' }, '—');
  private sub = h('div', { class: 'muted' }, '');
  private needle = h('div', { class: 'gneedle' });
  private strip = h('div', { class: 'free-strip' });
  private timer = h('span', { class: 'rec-state' }, '');
  private status = h('div', { class: 'status' });

  constructor(private app: App) {}

  /** Lesson being followed, with the beginner raga applied. */
  private get lesson(): Practice | null {
    const p = PRACTICES.find((x) => x.id === this.lessonId);
    if (!p) return null;
    return usesBeginnerRaga(p) ? { ...p, scaleId: this.app.prefs.beginnerRaga } : p;
  }

  private get scale(): Scale {
    const l = this.lesson;
    return l ? lessonScale(l) : scaleById(this.ragaId || this.app.prefs.beginnerRaga);
  }

  async show(): Promise<void> {
    this.render();
  }

  async leave(): Promise<void> {
    if (this.phase === 'listening') await this.stop();
    await this.capture.stop();
  }

  private render(): void {
    const { prefs } = this.app;
    const scale = this.scale;
    const lessonSel = h('select', { class: 'select', disabled: this.phase !== 'idle', 'aria-label': 'What are you singing?' }) as HTMLSelectElement;
    lessonSel.append(h('option', { value: '', selected: !this.lessonId }, 'Anything (just listen)'));
    for (const group of [...new Set(PRACTICES.map((p) => p.group))]) {
      const og = h('optgroup', { label: group });
      for (const p of PRACTICES.filter((x) => x.group === group && x.id !== 'single_swara')) og.append(h('option', { value: p.id, selected: p.id === this.lessonId }, p.title));
      lessonSel.append(og);
    }
    lessonSel.addEventListener('change', () => { this.lessonId = lessonSel.value; this.result = null; this.render(); });
    const ragaSel = h('select', { class: 'select', disabled: this.phase !== 'idle', 'aria-label': 'Raga' }) as HTMLSelectElement;
    for (const s of SCALES.filter((x) => x.tradition === 'Carnatic')) ragaSel.append(h('option', { value: s.id, selected: s.id === scale.id }, s.name));
    ragaSel.addEventListener('change', () => { this.ragaId = ragaSel.value; this.result = null; this.render(); });

    clear(this.el).append(
      h('div', { class: 'page-head' },
        h('div', {},
          h('div', { class: 'eyebrow accent' }, 'FREE PRACTICE'),
          h('h1', {}, this.lesson ? `Following ${this.lesson.title}` : 'Just listening'),
          h('div', { class: 'muted' }, 'Sing from a book or along with a teacher. The app does not prompt; it listens, records, and shows what you sang.'))),
      h('div', { class: 'lr-grid' },
        h('div', { class: 'exercise-col' },
          h('section', { class: 'card free-card' },
            h('div', { class: 'row free-picks' },
              h('label', { class: 'field col grow' }, h('span', { class: 'muted small' }, 'What are you singing?'), lessonSel),
              this.lesson ? null : h('label', { class: 'field col grow' }, h('span', { class: 'muted small' }, 'Raga'), ragaSel)),
            this.phase === 'listening'
              ? h('div', { class: 'free-live' },
                  h('div', { class: 'row space' }, this.timer, h('span', { class: 'muted small' }, `${scale.name} · Sa ${westernPitchClassName(prefs.tonic)}`)),
                  this.bigName, this.sub,
                  h('div', { class: 'gauge2', style: 'width:100%;max-width:480px' }, h('div', { class: 'gauge2-track' }), h('div', { class: 'gauge2-zone' }), h('div', { class: 'gauge2-center' }), this.needle),
                  h('div', { class: 'gauge-labels', style: 'max-width:480px;width:100%' }, h('span', {}, 'Lower'), h('span', {}, 'On a swara'), h('span', {}, 'Higher')),
                  this.strip,
                  h('button', { class: 'btn cta', onClick: () => void this.stop() }, '■ Stop'))
              : h('div', { class: 'free-live' },
                  h('button', { class: 'btn cta', onClick: () => void this.start() }, '● Start listening'),
                  h('div', { class: 'muted small' }, 'Sing for as long as you like, then press Stop.')),
            this.status),
          this.result ? this.resultView() : null),
        h('aside', { class: 'side' },
          h('section', { class: 'card' },
            h('h3', {}, 'How it works'),
            h('ul', { class: 'small muted free-how' },
              h('li', {}, 'Live: the swara you are on, how far from it, and a strip of the notes you have sung.'),
              h('li', {}, 'With a lesson picked, Stop finds each time you sang it, even repeated, at another speed or restarted, and scores the passes.'),
              h('li', {}, 'With "Anything", Stop shows time and tuning on each swara and any notes outside the raga.'),
              h('li', {}, 'First and second speed follow reliably; third speed is approximate.'))))),
    );
  }

  private async start(): Promise<void> {
    try {
      await this.capture.start();
    } catch (err) {
      this.status.textContent = (err as Error).message;
      return;
    }
    this.status.textContent = '';
    this.result = null;
    this.lastChip = null;
    this.window = [];
    this.capture.beginRecording();
    this.phase = 'listening';
    this.render();
    clear(this.strip);
    this.ticker = window.setInterval(() => (this.timer.textContent = `● Recording · ${formatTime(this.capture.elapsed)}`), 250);
    this.unsub = this.capture.onFrame((f) => this.onFrame(f));
  }

  private onFrame(f: PitchFrame): void {
    const { prefs } = this.app;
    const scale = this.scale;
    const now = performance.now();
    if (f.frequency == null || f.clarity < 0.5 || f.rms < 0.008) {
      this.sub.textContent = 'Listening…';
      this.needle.style.opacity = '0';
      if (this.window.length && now - this.window[this.window.length - 1].at > 250) { this.window = []; this.lastChip = null; }
      return;
    }
    const midi = midiFromHz(f.frequency, prefs.a4);
    const r = reading(scale, midi, prefs.tonic);
    const kind = r.accuracy === 'inTune' ? 'onPitch' : r.accuracy === 'close' || r.accuracy === 'off' ? (r.scaleCents > 0 ? 'slightlyHigh' : 'slightlyLow') : 'wrongNote';
    this.bigName.textContent = describeSemitone(r.chromaticMidi - prefs.tonic, scale, prefs.notation, prefs.tonic);
    this.bigName.className = `free-name g-${kind}`;
    this.sub.textContent = `${westernName(r.chromaticMidi)} · ${f.frequency.toFixed(0)} Hz · ${r.displayCents >= 0 ? '+' : '−'}${Math.abs(Math.round(r.displayCents))}¢${r.isScaleTone ? '' : ' · outside this raga'}`;
    this.needle.style.opacity = '1';
    this.needle.style.left = `${50 + Math.max(-50, Math.min(50, r.displayCents))}%`;
    this.needle.className = `gneedle g-${kind}`;
    // strip: add a chip once a note has been steady for ~150 ms
    this.window.push({ at: now, midi });
    this.window = this.window.filter((w) => now - w.at <= 180);
    if (this.window.length >= 3 && now - this.window[0].at >= 120) {
      const sorted = this.window.map((w) => w.midi).sort((a, b) => a - b);
      const med = sorted[sorted.length >> 1];
      if (this.window.every((w) => Math.abs(w.midi - med) <= 0.6)) {
        const note = Math.round(med);
        if (note !== this.lastChip) {
          this.lastChip = note;
          const rr = reading(scale, med, prefs.tonic);
          this.strip.append(h('span', { class: `free-chip acc-${rr.accuracy}` }, describeSemitone(note - prefs.tonic, scale, prefs.notation, prefs.tonic)));
          while (this.strip.children.length > 48) this.strip.firstElementChild?.remove();
          this.strip.scrollLeft = this.strip.scrollWidth;
        }
      }
    }
  }

  private async stop(): Promise<void> {
    if (this.phase !== 'listening') return;
    this.phase = 'idle';
    if (this.ticker) window.clearInterval(this.ticker);
    this.unsub?.();
    this.unsub = null;
    const res = await this.capture.endRecording();
    await this.capture.stop();
    if (!res || res.duration < 1) { this.status.textContent = 'Too short to analyse.'; this.render(); return; }
    const { prefs } = this.app;
    const scale = this.scale;
    const lesson = this.lesson;
    const pseudo = lesson ?? { id: 'free', title: `Free practice · ${scale.name}`, instructions: 'Free practice', scaleId: scale.id, isBuiltIn: false };
    const session = newSession({ id: crypto.randomUUID(), lesson: { ...pseudo, title: lesson ? `Free practice · ${lesson.title}` : pseudo.title }, tonic: prefs.tonic, a4: prefs.a4, duration: res.duration, audioMime: res.mime, samples: res.samples, mode: 'free' });
    if (prefs.saveTakes) await SessionStore.save(session, res.blob);
    const report = analyze(res.samples, scale, prefs.tonic, prefs.a4, { totalSeconds: res.duration });
    let passes: Pass[] | null = null;
    if (lesson?.sequence) {
      const sa = startingMidi(prefs.tonic, prefs.saOctave);
      const pattern = parseSequence(lesson.sequence).map((t) => ({ token: t.raw, midi: tokenMidi(t, scale, sa) ?? sa }));
      const heard = report.events.map((e) => ({ midi: e.midi + e.meanCents / 100, start: e.start, duration: e.duration }));
      passes = followPasses(heard, pattern);
    }
    this.result = { session, report, passes, blobUrl: URL.createObjectURL(res.blob) };
    this.selectedPass = passes && passes.length ? passes.reduce((bi, p, i, arr) => (p.matched > arr[bi].matched ? i : bi), 0) : 0;
    this.render();
  }

  private resultView(): HTMLElement {
    const { session, report, passes, blobUrl } = this.result!;
    const { prefs } = this.app;
    const scale = this.scale;
    const audio = h('audio', { controls: true, class: 'audio', src: blobUrl });
    const canvas = h('canvas', { class: 'chart' });
    requestAnimationFrame(() => {
      const chart = new PitchChart(canvas, { samples: session.samples, scale, tonic: prefs.tonic, a4: prefs.a4, notation: prefs.notation, events: report.events });
      chart.draw();
      audio.addEventListener('timeupdate', () => chart.setPlayhead(audio.currentTime));
      audio.addEventListener('pause', () => chart.setPlayhead(null));
    });
    const blocks: (HTMLElement | null)[] = [];
    if (passes) blocks.push(this.passesView(passes));
    blocks.push(this.swaraSummary(report, scale));
    return h('section', { class: 'card free-result' },
      h('div', { class: 'row space' }, h('h3', {}, 'What you sang'), h('span', { class: 'muted small' }, `${formatTime(session.duration)} · ${prefs.saveTakes ? 'saved under Sessions' : 'not saved'}`)),
      audio, canvas,
      ...blocks,
      hasVoice(report) ? h('details', { class: 'details-row' }, h('summary', {}, h('span', {}, 'Every note heard')), h('p', { class: 'mono small' }, noteSequence(report, scale, prefs.tonic, prefs.notation))) : null);
  }

  private passesView(passes: Pass[]): HTMLElement {
    const lesson = this.lesson!;
    const { prefs } = this.app;
    const scale = this.scale;
    if (!passes.length) return h('div', { class: 'free-block' }, h('h4', {}, lesson.title), h('p', { class: 'small' }, `Couldn't find ${lesson.title} in this take. Check that Sa and the starting note match the book or teacher (top bar), and that the lesson picked is the one you sang.`));
    const p = passes[this.selectedPass] ?? passes[0];
    const total = p.notes.length;
    const best = passes.reduce((a, b) => (b.matched > a.matched ? b : a));
    // per-swara tendency across passes
    const bySwara = new Map<string, number[]>();
    for (const ps of passes) for (const n of ps.notes) if (n.cents != null && n.verdict !== 'wrong') bySwara.set(n.token.replace(/[',]/g, ''), [...(bySwara.get(n.token.replace(/[',]/g, '')) ?? []), n.cents]);
    const tendencies = [...bySwara.entries()].map(([tok, cs]) => ({ tok, mean: cs.reduce((a, b) => a + b, 0) / cs.length, n: cs.length })).filter((x) => Math.abs(x.mean) > 20 && x.n >= 2).sort((a, b) => Math.abs(b.mean) - Math.abs(a.mean));
    const name = (tok: string) => { const t = parseSequence(tok)[0]; return t ? tokenLabel(t, prefs.notation, prefs.tonic, scale) : tok; };
    return h('div', { class: 'free-block' },
      h('h4', {}, `${lesson.title}: found ${passes.length} pass${passes.length === 1 ? '' : 'es'}`),
      h('p', { class: 'small' }, `Best: pass ${passes.indexOf(best) + 1}, ${best.matched} of ${total} matched.${tendencies.length ? ' ' + tendencies.slice(0, 3).map((t) => `${name(t.tok)} ${t.mean > 0 ? 'sharp' : 'flat'} by about ${Math.round(Math.abs(t.mean))}¢`).join('; ') + ' across passes.' : ''}`),
      h('div', { class: 'choice-row' }, ...passes.map((ps, i) => h('button', { class: `chip${i === this.selectedPass ? ' on' : ''}`, onClick: () => { this.selectedPass = i; this.render(); } }, `Pass ${i + 1} · ${formatTime(ps.start)} · ${ps.matched}/${total}`))),
      h('div', { class: 'swaras free-tiles' }, ...p.notes.map((n) => {
        const t = parseSequence(n.token)[0];
        const sub = n.verdict === 'missing' ? 'not heard' : n.verdict === 'wrong' ? describeSemitone(Math.round(n.heard!.midi) - prefs.tonic, scale, prefs.notation, prefs.tonic) : `${n.cents! >= 0 ? '+' : '−'}${Math.abs(n.cents!)}¢`;
        return h('button', { class: `swara v-${n.verdict === 'missing' ? 'silent' : n.verdict}`, title: n.heard ? `${formatTime(n.heard.start)} · ${detectedLabel(n.heard.midi, scale, prefs.notation, prefs.tonic)}` : '' }, h('span', { class: 'name' }, t ? tokenLabel(t, prefs.notation, prefs.tonic, scale) : n.token), h('span', { class: 'sub' }, sub));
      })));
  }

  private swaraSummary(r: PerformanceReport, scale: Scale): HTMLElement {
    const { prefs } = this.app;
    if (!hasVoice(r)) return h('p', { class: 'muted' }, 'No clear singing was heard.');
    const rows = [...r.degrees].filter((d) => d.seconds >= 0.2).sort((a, b) => a.semitone - b.semitone);
    const off = rows.filter((d) => !d.isScaleTone);
    return h('div', { class: 'free-block' },
      h('h4', {}, 'Each swara'),
      h('table', { class: 'detail-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Swara'), h('th', {}, 'Time'), h('th', {}, 'Average tuning'))),
        h('tbody', {}, ...rows.map((d) => {
          const v = !d.isScaleTone ? 'wrong' : Math.abs(d.meanCents) <= 20 ? 'match' : 'near';
          return h('tr', { class: `row-${v}` },
            h('td', {}, h('span', { class: `vdot vdot-${v}` }), describeSemitone(d.semitone, scale, prefs.notation, prefs.tonic), d.isScaleTone ? '' : ' (outside raga)'),
            h('td', {}, `${d.seconds.toFixed(1)} s`),
            h('td', { class: 'diff' }, `${d.meanCents >= 0 ? '+' : '−'}${Math.abs(Math.round(d.meanCents))}¢`));
        }))),
      h('p', { class: 'small muted' }, [
        r.stabilityCents != null ? `Steadiness on held notes ±${Math.round(r.stabilityCents)}¢.` : '',
        off.length ? `Outside ${scale.name}: ${off.map((d) => describeSemitone(d.semitone, scale, prefs.notation, prefs.tonic)).join(', ')}.` : `Everything stayed inside ${scale.name}.`,
      ].filter(Boolean).join(' ')));
  }
}
