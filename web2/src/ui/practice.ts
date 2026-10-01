import { AudioCapture } from '@audio/capture';
import { nextStep } from '@core/guidance';
import { lessonScale } from '@core/lesson';
import { midiFromHz, westernName, type PitchFrame } from '@core/pitch';
import { newSession, type PracticeSession } from '@core/session';
import { analyze, hasVoice, score, type PerformanceReport } from '@core/analyzer';
import { degreeSthana, describeSemitone, detectedLabel, parseSequence, scaleGlossary, startingMidi, tokenLabel, tokenMidi, tokenSpoken, type Token } from '@core/swara';
import { ExampleStore, SessionStore } from '@storage/db';
import { BPM_OPTIONS, NOTES_PER_BEAT, PRACTICES, SINGLE_SHAPES, SINGLE_SWARA_ID, YOUR_PACE, singleSwaraSequence, type Practice, type SingleShape } from '../core/practices';
import { resolveDegrees } from '@core/swara';
import { compareFree, compareTake, toTargetMarks, type BeatTarget, type TakeComparison } from '../core/repeat';
import type { App } from './app';
import { clear, h } from './dom';
import { showScoreGuide } from './guide';
import { showPitchReference } from './reference';
import { showPitchSetup } from './setup';
import { playTone } from './tone';

type Step = 'listen' | 'turn' | 'compare';
type Phase = 'idle' | 'countin' | 'recording';

export class PracticeView {
  readonly el = h('div', { class: 'page' });
  private capture = new AudioCapture();
  private unsub: (() => void) | null = null;
  private step: Step = 'listen';
  private phase: Phase = 'idle';
  private tokens: Token[] = [];
  private targets: BeatTarget[] = [];
  private listened = false;
  private playing = false;
  private listenCount: number | null = null;
  private beatIndex = -1;
  private phraseStart = 0;
  private timer: number | null = null;
  private comparison: TakeComparison | null = null;
  private takeUrl: string | null = null;
  private sessionId: string | null = null;
  private example: { blob: Blob; name: string } | null = null;
  private exampleAudio: HTMLAudioElement | null = null;

  // live elements
  private swaras = h('div', { class: 'swaras' });
  private countEl = h('div', { class: 'count-in' }, '');
  private detectedEl = h('div', { class: 'detected' }, '—');
  private guideText = h('div', { class: 'muted small' }, '');
  private needle = h('div', { class: 'gneedle' });
  private dTarget = h('td', {}, '—');
  private dDetected = h('td', {}, '—');
  private dDiff = h('td', {}, '—');
  private status = h('div', { class: 'status' });

  constructor(private app: App) {
    void this.loadExample();
    this.render();
  }

  private single: { token: string; shape: SingleShape } = { token: 'G', shape: 'fromSa' };

  private get isSingle(): boolean {
    return this.app.lesson().id === SINGLE_SWARA_ID;
  }

  private get practice(): Practice {
    const l = this.app.lesson();
    const base = PRACTICES.find((p) => p.id === l.id) ?? { ...l, subtitle: l.sequence ?? '', bpm: 60, mode: 'LISTEN & REPEAT' as const, group: 'Drill' };
    if (base.id !== SINGLE_SWARA_ID) return base;
    const scale = lessonScale(base);
    const degrees = Object.keys(resolveDegrees(scale));
    const shape = SINGLE_SHAPES.find((x) => x.id === this.single.shape)!;
    const name = this.singleName(this.single.token, scale);
    return { ...base, title: `One swara: ${name}`, subtitle: shape.label, instructions: shape.hint, sequence: singleSwaraSequence(this.single.token, this.single.shape, degrees) };
  }

  private singleName(token: string, scale: ReturnType<typeof lessonScale>): string {
    const tok = parseSequence(token)[0];
    return tok ? tokenSpoken(tok, this.app.prefs.notation, this.app.prefs.tonic, scale) : token;
  }

  /** Switch to the One swara practice with a given swara selected. */
  practiseSingle(token: string, shape: SingleShape = 'fromSa'): void {
    this.single = { token, shape };
    this.app.drill = null;
    this.app.setPractice(SINGLE_SWARA_ID);
  }

  private get bpm(): number {
    return this.app.prefs.bpm[this.practice.id] ?? this.practice.bpm;
  }

  /** true when the singer sets the pace: the next swara lights up when the current one is heard */
  private get freePace(): boolean {
    return this.bpm === YOUR_PACE;
  }

  /** seconds per tala beat; for your-pace mode the tone guide plays at 60 bpm */
  private get beat(): number {
    return 60 / (this.freePace ? 60 : this.bpm);
  }

  private get speed(): 1 | 2 | 3 {
    return this.practice.speeds ? (this.app.prefs.speed[this.practice.id] ?? 1) : 1;
  }

  /** seconds per count: one swara at first speed, two per beat at second, four at third */
  private get noteDur(): number {
    return this.beat / NOTES_PER_BEAT[this.speed];
  }

  private get totalCounts(): number {
    return this.tokens.reduce((a, t) => a + t.units, 0);
  }

  /** start of each note in counts from the phrase start */
  private get countOffsets(): number[] {
    const out: number[] = [];
    let acc = 0;
    for (const t of this.tokens) { out.push(acc); acc += t.units; }
    return out;
  }

  // your-pace detection state
  private window: { at: number; midi: number }[] = [];
  private carry: number | null = null;
  private lastVoiced = 0;
  private detected: { midi: number; at: number }[] = [];
  private finishTimer: number | null = null;
  private pass = 0;
  private passStarts: number[] = [];
  private passEl = h('span', { class: 'muted small pass' }, '');
  private passesCompared = 1;

  refresh(): void {
    if (this.phase !== 'idle') return;
    const id = this.practice.id;
    if (this.el.dataset.practice !== id) {
      this.step = 'listen';
      this.listened = false;
      this.comparison = null;
      void this.loadExample();
    }
    this.el.dataset.practice = id;
    this.render();
  }

  async leave(): Promise<void> {
    this.stopSchedule();
    this.unsub?.();
    this.unsub = null;
    this.exampleAudio?.pause();
    if (this.phase !== 'idle') { this.phase = 'idle'; await this.capture.endRecording(); }
    await this.capture.stop();
  }

  openPitchSetup(): void {
    showPitchSetup(this.app);
  }

  private async loadExample(): Promise<void> {
    this.example = (await ExampleStore.get(this.practice.id)) ?? null;
    if (this.phase === 'idle') this.render();
  }

  // MARK: render

  private render(): void {
    const { prefs } = this.app;
    const practice = this.practice;
    const scale = lessonScale(practice);
    this.tokens = parseSequence(practice.sequence ?? '');
    const start = startingMidi(prefs.tonic, prefs.saOctave);
    this.targets = this.tokens.map((t) => ({ token: t.raw, midi: tokenMidi(t, scale, start) ?? start, units: t.units }));
    const drill = this.app.drill != null;
    const secs = Math.round(this.totalCounts * this.noteDur);
    const lengthText = this.freePace ? `${this.tokens.length} notes · your pace` : `${this.tokens.length} notes · ${secs} seconds`;

    const stepBtn = (s: Step, n: number, label: string) => h('button', {
      class: `step${this.step === s ? ' current' : ''}${(s === 'listen' && this.listened) || (s === 'turn' && this.comparison) ? ' done' : ''}`,
      onClick: () => { if (this.phase === 'idle' && (s !== 'compare' || this.comparison)) { this.step = s; this.render(); } },
    }, h('span', { class: 'num' }, String(n)), h('span', {}, label));

    const paceSel = h('select', { class: 'select', disabled: this.phase !== 'idle', onChange: (e) => this.app.update({ bpm: { ...this.app.prefs.bpm, [practice.id]: Number((e.target as HTMLSelectElement).value) } }) });
    for (const b of BPM_OPTIONS) paceSel.append(h('option', { value: b, selected: b === this.bpm }, b === YOUR_PACE ? 'Your pace' : `${b} bpm`));

    const glossary = scaleGlossary(scale);
    clear(this.el).append(
      h('div', { class: 'page-head' },
        h('div', {},
          h('div', { class: 'eyebrow accent' }, practice.mode),
          h('h1', {}, practice.title),
          h('div', { class: 'muted' }, `${scale.name} · ${practice.subtitle}`)),
        h('button', { class: 'btn btn-secondary', onClick: () => showPitchSetup(this.app) }, 'Find a comfortable Sa')),
      h('div', { class: 'lr-grid' },
        h('div', { class: 'exercise-col' },
          h('section', { class: 'card main-card' },
            h('div', { class: 'steps' }, stepBtn('listen', 1, 'Listen'), stepBtn('turn', 2, 'Your turn'), stepBtn('compare', 3, 'Compare')),
            this.step === 'listen' ? this.listenStage(lengthText) : this.step === 'turn' ? this.turnStage(lengthText) : this.compareStage(),
            h('div', { class: 'card-foot' },
              h('span', { class: 'muted' }, 'Pace'), paceSel,
              practice.speeds ? h('span', { class: 'speed-switch', role: 'group', 'aria-label': 'Speed' },
                h('span', { class: 'muted' }, 'Speed'),
                ...practice.speeds.map((sp) => h('button', { class: `seg${sp === this.speed ? ' on' : ''}`, disabled: this.phase !== 'idle', onClick: () => this.app.update({ speed: { ...this.app.prefs.speed, [practice.id]: sp } }) }, String(sp)))) : null,
              h('span', { class: 'muted' }, this.freePace ? 'The next swara lights up when yours is heard' : `${scale.tradition === 'Carnatic' ? 'Adi tala · ' : ''}${NOTES_PER_BEAT[this.speed] === 1 ? 'one swara per beat' : `${NOTES_PER_BEAT[this.speed]} swaras per beat`}`),
              h('span', { class: 'spacer' }),
              h('button', { class: 'link', onClick: () => this.startOver() }, 'Start over'))),
          h('details', { class: 'details-row', open: true },
            h('summary', {},
              h('span', {}, 'Pitch details ', h('button', { class: 'info', title: 'Pitch reference', 'aria-label': 'Pitch reference', onClick: (e) => { e.preventDefault(); showPitchReference(this.app as never, scale); } }, 'ⓘ')),
              this.step === 'compare' && !this.isSingle ? this.scoreBadge() : null),
            this.step === 'compare' && this.comparison ? this.compareTable() : h('table', { class: 'detail-table' },
              h('thead', {}, h('tr', {}, h('th', {}, 'Target'), h('th', {}, 'Detected'), h('th', {}, 'Difference from target'))),
              h('tbody', {}, h('tr', {}, this.dTarget, this.dDetected, this.dDiff))),
            glossary ? h('div', { class: 'muted tiny glossary' }, glossary) : null),
          this.status),
        h('aside', { class: 'side' },
          h('section', { class: 'card' },
            h('h3', {}, 'Choose a practice'),
            drill ? h('button', { class: 'link small', onClick: () => this.app.clearDrill() }, '‹ Back to practices') : null,
            ...[...new Set(PRACTICES.map((p) => p.group))].map((group) => h('div', { class: 'practice-group' },
              h('div', { class: 'eyebrow' }, group),
              h('ul', { class: 'practices' }, ...PRACTICES.filter((p) => p.group === group).map((p, i) => h('li', { class: p.id === practice.id && !drill ? 'current' : '', onClick: () => { if (this.phase === 'idle') { this.app.drill = null; this.app.setPractice(p.id); } } },
                h('span', { class: 'num' }, String(i + 1)), h('span', {}, h('div', { class: 't' }, p.title), h('div', { class: 's' }, p.subtitle)))))))),
          h('section', { class: 'card' },
            h('h3', {}, practice.pulse ? 'Keep the pulse steady' : 'Hear the starting Sa'),
            h('p', { class: 'muted' }, practice.pulse ?? 'Return to this note before each phrase. Keep your voice comfortable.'),
            h('button', { class: 'btn btn-secondary', onClick: () => void playTone(start, prefs.a4, 1.5) }, '▶ Play starting Sa'),
            h('details', { class: 'teacher' },
              h('summary', {}, "Use a teacher's example"),
              this.example
                ? h('div', { class: 'file-row' }, h('span', { class: 'small' }, `Using: ${this.example.name}`), h('button', { class: 'link small danger', onClick: async () => { await ExampleStore.delete(practice.id); this.example = null; this.render(); } }, 'Remove'))
                : h('div', { class: 'file-row' }, h('input', { type: 'file', accept: 'audio/*', onChange: (e) => void this.setExample((e.target as HTMLInputElement).files?.[0]) }), h('span', { class: 'muted tiny' }, 'A short recording of this phrase. It replaces the tone guide in Listen.')))),
          h('div', {}, h('div', { class: 'eyebrow' }, 'REFERENCE SOUND'), h('p', { class: 'muted small' }, "The tone guide plays plain notes. Learn phrasing and gamakas from a teacher's example.")))),
    );
    this.renderSwaras();
  }

  private singlePicker(): HTMLElement {
    const scale = lessonScale(this.practice);
    const degrees = resolveDegrees(scale);
    const choices = [...(Object.keys(degrees) as string[]).map((f) => f), "S'", 'P,'];
    const { prefs } = this.app;
    return h('div', { class: 'single-picker' },
      h('div', { class: 'muted small' }, 'Which swara?'),
      h('div', { class: 'choice-row' }, ...choices.map((tok) => {
        const t = parseSequence(tok)[0];
        return h('button', { class: `chip${tok === this.single.token ? ' on' : ''}`, onClick: () => { this.single = { ...this.single, token: tok }; this.render(); } }, tokenLabel(t, prefs.notation, prefs.tonic, scale));
      })),
      h('div', { class: 'muted small' }, 'How?'),
      h('div', { class: 'choice-row' }, ...SINGLE_SHAPES.map((sh) => h('button', { class: `chip${sh.id === this.single.shape ? ' on' : ''}`, title: sh.hint, onClick: () => { this.single = { ...this.single, shape: sh.id }; this.render(); } }, sh.label))));
  }

  private listenStage(lengthText: string): HTMLElement {
    const guide = h('input', { type: 'checkbox', checked: this.app.prefs.livePitchGuide }) as HTMLInputElement;
    guide.addEventListener('change', () => this.app.update({ livePitchGuide: guide.checked }));
    return h('div', { class: 'stage' },
      h('div', { class: 'stage-head' }, h('span', { class: 'eyebrow accent' }, this.example ? "TEACHER'S EXAMPLE" : 'TONE GUIDE'), h('span', { class: 'muted' }, lengthText)),
      this.isSingle && this.phase === 'idle' && !this.playing && this.listenCount == null ? this.singlePicker() : null,
      h('h2', {}, this.listenCount != null ? 'Get ready' : this.playing ? 'Listen' : 'Listen to the phrase'),
      h('p', { class: 'lead' }, this.practice.instructions),
      this.listenCount != null ? h('div', { class: 'count-in' }, String(this.listenCount)) : null,
      this.swaras,
      this.listened && !this.playing && this.listenCount == null
        ? h('div', { class: 'row', style: 'justify-content:center' }, h('button', { class: 'btn cta', onClick: () => { this.step = 'turn'; this.render(); } }, 'Your turn →'), h('button', { class: 'link', onClick: () => void this.playExample() }, 'Listen again'))
        : h('button', { class: 'btn cta', disabled: this.playing || this.listenCount != null, onClick: () => void this.playExample() }, this.listenCount != null ? `Starting in ${this.listenCount}…` : this.playing ? 'Playing…' : '▶ Listen to example'),
      h('div', { class: 'stage-foot' }, h('span', { class: 'muted small' }, 'Tap a swara to hear a reference tone.'), h('label', { class: 'toggle' }, guide, h('span', {}, 'Live pitch guide'))));
  }

  private turnStage(lengthText: string): HTMLElement {
    const live = this.app.prefs.livePitchGuide;
    return h('div', { class: 'stage' },
      h('div', { class: 'stage-head' }, h('span', { class: 'eyebrow accent' }, 'YOUR TURN'), h('span', { class: 'muted' }, lengthText)),
      h('h2', {}, this.phase === 'countin' ? 'Ready…' : this.phase === 'recording' ? 'Sing' : 'Sing it back'),
      h('p', { class: 'lead' }, this.freePace ? 'Sing each swara and hold it a moment. The next one lights up when yours is heard.' : this.app.prefs.loop ? 'One swara per beat, after a two-beat count-in. The phrase repeats until you stop; your best pass counts.' : 'One swara per beat, after a two-beat count-in.'),
      this.phase === 'countin' ? this.countEl : null,
      !this.freePace && this.phase === 'recording' ? this.passEl : null,
      this.swaras,
      live ? h('div', { class: 'live-guide' }, this.detectedEl, this.guideText,
        h('div', { class: 'gauge2', style: 'width:100%;max-width:480px' }, h('div', { class: 'gauge2-track' }), h('div', { class: 'gauge2-zone' }), h('div', { class: 'gauge2-center' }), this.needle),
        h('div', { class: 'gauge-labels', style: 'max-width:480px;width:100%' }, h('span', {}, 'Lower'), h('span', {}, 'Target'), h('span', {}, 'Higher'))) : null,
      this.phase === 'idle'
        ? h('button', { class: 'btn cta', onClick: () => void this.startSinging() }, '● Start singing')
        : h('button', { class: 'btn btn-secondary cta', onClick: () => void this.stopSinging(true) }, 'Stop'),
      h('div', { class: 'stage-foot' },
        h('button', { class: 'link small', disabled: this.phase !== 'idle', onClick: () => { this.step = 'listen'; this.render(); } }, '‹ Listen again'),
        h('span', { class: 'row' },
          (() => {
            const along = h('input', { type: 'checkbox', checked: this.app.prefs.playAlong, disabled: this.phase !== 'idle' }) as HTMLInputElement;
            along.addEventListener('change', () => this.app.update({ playAlong: along.checked }));
            return h('label', { class: 'toggle', title: 'The tone guide plays each swara with you. Use headphones so the microphone hears only your voice.' }, along, h('span', {}, 'Play along 🎧'));
          })(),
          this.freePace ? null : (() => {
            const loop = h('input', { type: 'checkbox', checked: this.app.prefs.loop, disabled: this.phase !== 'idle' }) as HTMLInputElement;
            loop.addEventListener('change', () => this.app.update({ loop: loop.checked }));
            return h('label', { class: 'toggle' }, loop, h('span', {}, 'Loop until I stop'));
          })())),
      this.app.prefs.playAlong && this.phase === 'idle' ? h('div', { class: 'muted small' }, 'Play along is on: wear headphones, or the microphone will hear the guide instead of you.') : null);
  }

  private compareStage(): HTMLElement {
    const c = this.comparison!;
    const n = c.results.length;
    const headline = this.isSingle ? this.singleResult() : c.matched === n ? `All ${n} matched` : `${c.matched} of ${n} matched`;
    const worst = [...c.results].sort((a, b) => Math.abs(b.cents ?? 999) - Math.abs(a.cents ?? 999))[0];
    const worstTok = worst && (worst.verdict === 'wrong' || worst.verdict === 'near' || worst.verdict === 'silent') ? worst.token : null;
    return h('div', { class: 'stage' },
      h('div', { class: 'stage-head' }, h('span', { class: 'eyebrow accent' }, 'COMPARE'), h('span', { class: 'muted' }, this.freePace ? 'your pace' : `${this.passesCompared > 1 ? `best of ${this.passesCompared} passes · ` : ''}${c.offsetBeats ? `timing ${c.offsetBeats > 0 ? 'late' : 'early'} by ${Math.abs(c.offsetBeats).toFixed(1)} ${this.speed === 1 ? 'beat' : 'count'}` : 'timing on the beat'}`)),
      h('h2', {}, headline),
      h('p', { class: 'lead' }, this.isSingle ? (SINGLE_SHAPES.find((x) => x.id === this.single.shape)?.hint ?? '') : this.compareLead()),
      this.swaras,
      h('div', { class: 'row', style: 'justify-content:center' },
        h('button', { class: 'btn', onClick: () => this.replay() }, '▶ Replay'),
        h('button', { class: 'btn btn-secondary', onClick: () => { this.step = 'turn'; this.render(); } }, 'Try again'),
        h('button', { class: 'btn btn-secondary', onClick: () => { this.step = 'listen'; this.render(); } }, 'Listen again')),
      h('div', { class: 'stage-foot' },
        h('span', { class: 'muted small' }, 'Green matched, amber slightly off, red a different note, grey not heard.'),
        h('span', { class: 'row' },
          worstTok && !this.isSingle ? h('button', { class: 'link small', onClick: () => this.practiseSingle(worstTok) }, `Practise ${this.singleName(worstTok, lessonScale(this.practice))} on its own ›`) : null,
          this.sessionId ? h('button', { class: 'link small', onClick: () => this.app.openSession(this.sessionId!) }, 'Full review →') : h('span', { class: 'muted small' }, 'Not saved (Settings › Practice)'))));
  }

  /** One line for a single-swara take: the swara, its tuning, and how steady it was. */
  private singleResult(): string {
    const c = this.comparison!;
    const scale = lessonScale(this.practice);
    const name = this.singleName(this.single.token, scale);
    const mine = c.results.filter((r) => r.token === this.single.token);
    const heard = mine.filter((r) => r.cents != null);
    if (!heard.length) return `${name} was not heard`;
    const mean = Math.round(heard.reduce((a, r) => a + r.cents!, 0) / heard.length);
    const tuning = Math.abs(mean) <= 10 ? 'on pitch' : Math.abs(mean) <= 20 ? `${Math.abs(mean)} cents ${mean > 0 ? 'high' : 'low'}, close` : Math.abs(mean) <= 60 ? `${Math.abs(mean)} cents ${mean > 0 ? 'high' : 'low'}` : 'landed on a different note';
    const r = this.lastReport();
    const steady = r?.stabilityCents == null ? '' : r.stabilityCents <= 8 ? ', steady' : r.stabilityCents <= 15 ? `, slight wobble ±${Math.round(r.stabilityCents)}¢` : `, wobbled ±${Math.round(r.stabilityCents)}¢`;
    return `${name}: ${tuning}${steady}`;
  }

  private lastReport(): PerformanceReport | null {
    const session = this.lastSession;
    if (!session) return null;
    return analyze(session.samples, lessonScale(this.practice), session.tonic, session.a4, { totalSeconds: session.duration });
  }

  /** Session score for the last take, shown beside Pitch details on the Compare step. */
  private scoreBadge(): HTMLElement | null {
    const r = this.lastReport();
    if (!r) return null;
    const sc = score(r);
    const cls = !hasVoice(r) ? 'none' : sc >= 80 ? 'good' : sc >= 55 ? 'mid' : 'low';
    return h('span', { class: 'row score-row', onClick: (e) => e.preventDefault() },
      h('span', { class: 'muted small' }, `Within ±20¢ ${Math.round(r.within20 * 100)}% · on scale ${Math.round(r.scaleToneFraction * 100)}%`),
      h('span', { class: `badge badge-${cls} badge-sm`, title: 'Session score' }, hasVoice(r) ? `Score ${sc}` : 'Score –'),
      h('button', { class: 'link small', onClick: (e) => { e.preventDefault(); showScoreGuide(); } }, 'What does it mean? ›'));
  }

  private compareLead(): string {
    if (!this.sessionId || !this.comparison) return '';
    const session = this.lastSession;
    if (!session) return '';
    const report = this.lastReport();
    if (!report) return '';
    return nextStep(session, report, lessonScale(this.practice), this.app.prefs.notation).headline;
  }
  private lastSession: PracticeSession | null = null;

  private compareTable(): HTMLElement {
    const scale = lessonScale(this.practice);
    const { notation, tonic } = this.app.prefs;
    return h('table', { class: 'detail-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Beat'), h('th', {}, 'Target'), h('th', {}, 'Detected'), h('th', {}, 'Difference'))),
      h('tbody', {}, ...this.comparison!.results.map((r, i) => {
        const label = r.verdict === 'match' ? 'on pitch' : r.verdict === 'near' ? (r.cents! > 0 ? 'a little high' : 'a little low') : r.verdict === 'wrong' ? 'different note' : 'not heard';
        return h('tr', { class: `row-${r.verdict}` },
          h('td', {}, h('span', { class: `vdot vdot-${r.verdict}`, title: label, 'aria-label': label }), String(i + 1)),
          h('td', {}, `${r.token} · ${westernName(r.targetMidi)}`),
          h('td', {}, r.detectedMidi == null ? '—' : detectedLabel(r.detectedMidi, scale, notation, tonic).replace(/^\w/, (c) => c.toUpperCase())),
          h('td', { class: 'diff' }, r.cents == null ? '—' : `${r.cents > 0 ? '+' : '−'}${Math.abs(r.cents)} cents`, h('span', { class: 'muted tiny' }, ` ${label}`)));
      })));
  }

  private renderSwaras(): void {
    const { prefs } = this.app;
    const scale = lessonScale(this.practice);
    clear(this.swaras);
    this.tokens.forEach((tok, i) => {
      const name = tokenLabel(tok, prefs.notation, prefs.tonic, scale);
      let sub = tok.octave > 0 ? 'upper' : tok.octave < 0 ? 'lower' : tok.family === 'S' || tok.family === 'P' ? '' : (degreeSthana(tok.family, scale) ?? '').replace(/^([A-Z])[a-z]+/, '$1');
      if (tok.units > 1) sub = `${sub ? sub + ' · ' : ''}hold ${tok.units}`;
      let cls = 'swara';
      if (this.step === 'compare' && this.comparison) {
        const r = this.comparison.results[i];
        cls += ` v-${r.verdict}`;
        sub = r.verdict === 'match' ? `${r.cents! >= 0 ? '+' : ''}${r.cents}¢` : r.verdict === 'near' ? (r.cents! > 0 ? 'a little high' : 'a little low') : r.verdict === 'wrong' ? describeSemitone(Math.round(r.detectedMidi!) - prefs.tonic, scale, prefs.notation, prefs.tonic) : 'not heard';
      } else if (i === this.beatIndex && this.phase === 'recording') cls += ' current';
      this.swaras.append(h('button', { class: cls, title: tokenSpoken(tok, prefs.notation, prefs.tonic, scale), onClick: () => { if (this.phase === 'idle') void playTone(this.targets[i].midi, prefs.a4, Math.max(0.3, 0.9 * this.noteDur * tok.units)); } },
        h('span', { class: 'name' }, name), h('span', { class: 'sub' }, sub || ' ')));
    });
  }

  // MARK: listen

  private async playExample(): Promise<void> {
    if (this.playing || this.listenCount != null) return;
    // 3-2-1 above the tiles so the listener is ready for the first note
    for (let n = 3; n >= 1; n--) {
      this.listenCount = n;
      this.render();
      await new Promise((r) => setTimeout(r, 1000));
      if (this.step !== 'listen') { this.listenCount = null; return; }
    }
    this.listenCount = null;
    this.playing = true;
    this.render();
    if (this.example) {
      this.exampleAudio = new Audio(URL.createObjectURL(this.example.blob));
      await new Promise<void>((res) => { this.exampleAudio!.onended = () => res(); this.exampleAudio!.onerror = () => res(); void this.exampleAudio!.play(); });
    } else {
      const tiles = [...this.swaras.children] as HTMLElement[];
      for (let i = 0; i < this.targets.length; i++) {
        tiles.forEach((t, j) => t.classList.toggle('playing', j === i));
        const dur = this.noteDur * (this.targets[i].units ?? 1);
        await playTone(this.targets[i].midi, this.app.prefs.a4, dur * 0.92);
        await new Promise((r) => setTimeout(r, dur * 0.08 * 1000));
      }
      tiles.forEach((t) => t.classList.remove('playing'));
    }
    this.playing = false;
    this.listened = true;
    this.render();
  }

  // MARK: your turn

  private async startSinging(): Promise<void> {
    if (this.phase !== 'idle') return;
    try {
      await this.capture.start();
    } catch (err) {
      this.status.textContent = (err as Error).message;
      return;
    }
    this.status.textContent = '';
    this.capture.beginRecording();
    if (this.freePace) {
      this.phase = 'recording';
      this.beatIndex = 0;
      this.window = [];
      this.carry = null;
      this.detected = [];
      this.phraseStart = 0;
      this.render();
      this.unsub?.();
      this.unsub = this.capture.onFrame((f) => { this.onFrame(f); this.onFreeFrame(f); });
      this.playAlongNote(0);
      return;
    }
    this.phase = 'countin';
    this.beatIndex = -1;
    this.render();
    const beatMs = this.beat * 1000;
    const t0 = performance.now();
    const countIn = 2;
    let shownCount = 0;
    const sa = this.targets[0]?.midi ?? startingMidi(this.app.prefs.tonic, this.app.prefs.saOctave);
    this.unsub?.();
    this.unsub = this.capture.onFrame((f) => this.onFrame(f));
    this.timer = window.setInterval(() => {
      const elapsed = performance.now() - t0;
      const b = Math.floor(elapsed / beatMs);
      if (b < countIn) {
        if (b + 1 !== shownCount) { shownCount = b + 1; this.countEl.textContent = String(shownCount); void playTone(sa, this.app.prefs.a4, 0.12); }
        return;
      }
      if (this.phase === 'countin') { this.phase = 'recording'; this.phraseStart = this.capture.elapsed; this.pass = 0; this.passStarts = [this.phraseStart]; this.render(); }
      const npb = NOTES_PER_BEAT[this.speed];
      const passCounts = this.totalCounts + (this.app.prefs.loop ? npb : 0); // one beat's breath between passes
      let counts = (elapsed - countIn * beatMs) / (this.noteDur * 1000);
      if (!this.app.prefs.loop) {
        if (counts >= this.totalCounts + 0.6) { void this.stopSinging(false); return; }
      } else {
        const passNo = Math.floor(counts / passCounts);
        if (passNo !== this.pass) {
          this.pass = passNo;
          this.passStarts[passNo] = this.phraseStart + passNo * passCounts * this.noteDur;
          void playTone(sa, this.app.prefs.a4, 0.12);
        }
        counts -= passNo * passCounts;
        this.passEl.textContent = `Pass ${passNo + 1}`;
        if (counts >= this.totalCounts) { if (this.beatIndex !== -1) { this.beatIndex = -1; this.renderSwaras(); } return; } // breath
      }
      const offsets = this.countOffsets;
      let i = 0;
      while (i + 1 < offsets.length && counts >= offsets[i + 1]) i++;
      if (i !== this.beatIndex) { this.beatIndex = i; this.renderSwaras(); this.playAlongNote(i); }
    }, 25);
  }

  /** With Play along on, sound the current target for its length. */
  private playAlongNote(i: number): void {
    if (!this.app.prefs.playAlong || this.phase !== 'recording') return;
    const tg = this.targets[i];
    if (!tg) return;
    const dur = this.freePace ? 0.9 : this.noteDur * (tg.units ?? 1) * 0.92;
    void playTone(tg.midi, this.app.prefs.a4, dur);
  }

  private stopSchedule(): void {
    if (this.timer != null) window.clearInterval(this.timer);
    this.timer = null;
  }

  private async stopSinging(manual: boolean): Promise<void> {
    if (this.phase === 'idle') return;
    this.stopSchedule();
    const wasRecording = this.phase === 'recording';
    this.phase = 'idle';
    this.unsub?.();
    this.unsub = null;
    if (this.finishTimer != null) { window.clearTimeout(this.finishTimer); this.finishTimer = null; }
    const result = await this.capture.endRecording();
    const tooEarly = this.freePace ? this.detected.length === 0 : manual && this.beatIndex < 1 && this.pass === 0;
    if (!result || !wasRecording || tooEarly) { this.beatIndex = -1; this.render(); return; }
    const { prefs } = this.app;
    let c: TakeComparison;
    if (this.freePace) {
      c = compareFree(this.detected, this.targets);
      this.passesCompared = 1;
    } else {
      // score every pass (the last one may be partial) and keep the best
      const starts = this.passStarts.length ? this.passStarts : [this.phraseStart];
      const passes = starts.map((st) => compareTake(result.samples, this.targets, this.noteDur, st, prefs.a4));
      const good = (x: TakeComparison) => x.matched * 10 + x.results.filter((r) => r.verdict === 'match').length;
      c = passes.reduce((best, x) => (good(x) > good(best) ? x : best), passes[0]);
      this.passesCompared = passes.length;
    }
    this.comparison = c;
    if (this.takeUrl) URL.revokeObjectURL(this.takeUrl);
    this.takeUrl = URL.createObjectURL(result.blob);
    const session = newSession({
      id: crypto.randomUUID(), lesson: this.practice, tonic: prefs.tonic, a4: prefs.a4, duration: result.duration, audioMime: result.mime, samples: result.samples,
      mode: 'guided', lessonSequence: this.tokens.map((t) => t.raw), targets: toTargetMarks(c, this.noteDur),
    });
    if (prefs.saveTakes) {
      await SessionStore.save(session, result.blob);
      this.sessionId = session.id;
    } else {
      this.sessionId = null;
    }
    this.lastSession = session;
    this.beatIndex = -1;
    this.step = 'compare';
    this.render();
  }

  private onFrame(f: PitchFrame): void {
    if (!this.app.prefs.livePitchGuide || this.phase !== 'recording') return;
    const { prefs } = this.app;
    const scale = lessonScale(this.practice);
    const target = this.targets[Math.max(0, this.beatIndex)];
    if (!target) return;
    const tok = this.tokens[Math.max(0, this.beatIndex)];
    this.dTarget.textContent = `${tok.raw} · ${westernName(target.midi)}`;
    if (f.frequency == null || f.clarity < 0.5) {
      this.detectedEl.textContent = '—';
      this.guideText.textContent = `Sing ${tokenSpoken(tok, prefs.notation, prefs.tonic, scale)}`;
      this.needle.style.opacity = '0';
      this.dDetected.textContent = '—';
      this.dDiff.textContent = '—';
      return;
    }
    const midi = midiFromHz(f.frequency, prefs.a4);
    const cents = Math.round((midi - target.midi) * 100);
    const kind = Math.abs(cents) <= 20 ? 'onPitch' : Math.abs(cents) <= 60 ? (cents > 0 ? 'slightlyHigh' : 'slightlyLow') : 'wrongNote';
    this.detectedEl.textContent = describeSemitone(Math.round(midi) - prefs.tonic, scale, prefs.notation, prefs.tonic);
    this.detectedEl.className = `detected g-${kind}`;
    this.guideText.textContent = kind === 'onPitch' ? 'On pitch' : kind === 'slightlyHigh' ? 'A little high' : kind === 'slightlyLow' ? 'A little low' : `Target is ${tokenSpoken(tok, prefs.notation, prefs.tonic, scale)}`;
    this.needle.style.opacity = '1';
    this.needle.style.left = `${50 + Math.max(-100, Math.min(100, cents)) / 2}%`;
    this.needle.className = `gneedle g-${kind}`;
    const d = detectedLabel(midi, scale, prefs.notation, prefs.tonic);
    this.dDetected.textContent = d[0].toUpperCase() + d.slice(1);
    this.dDiff.textContent = `${cents > 0 ? '+' : '−'}${Math.abs(cents)} cents`;
  }

  /** Your pace: a steady note (about a third of a second) is taken as the current swara; then wait for a new onset. */
  private onFreeFrame(f: PitchFrame): void {
    if (this.phase !== 'recording' || !this.freePace) return;
    const now = performance.now();
    const voiced = f.frequency != null && f.clarity >= 0.5 && f.rms >= 0.008;
    const midi = voiced ? midiFromHz(f.frequency!, this.app.prefs.a4) : null;
    if (voiced) this.lastVoiced = now;
    if (this.carry != null) {
      if (midi != null && Math.abs(midi - this.carry) <= 0.9) return;
      if (midi != null || now - this.lastVoiced > 250) this.carry = null;
    }
    const holdMs = 350;
    if (midi != null) this.window.push({ at: now, midi });
    this.window = this.window.filter((w) => now - w.at <= holdMs + 120);
    if (!voiced && this.window.length && now - this.lastVoiced > 500) { this.window = []; return; }
    const sorted = this.window.map((w) => w.midi).sort((a, b) => a - b);
    if (sorted.length < 5) return;
    const median = sorted[sorted.length >> 1];
    const steady = this.window.filter((w) => Math.abs(w.midi - median) <= 0.6);
    const covered = now - this.window[0].at;
    if (covered < holdMs || steady.length < this.window.length * 0.7) return;
    const mean = steady.reduce((a, w) => a + w.midi, 0) / steady.length;
    this.window = [];
    this.carry = mean;
    this.detected.push({ midi: mean, at: this.capture.elapsed - holdMs / 1000 });
    this.beatIndex = Math.min(this.targets.length - 1, this.detected.length);
    this.renderSwaras();
    if (this.detected.length < this.targets.length) this.playAlongNote(this.beatIndex);
    if (this.detected.length >= this.targets.length) {
      this.finishTimer = window.setTimeout(() => void this.stopSinging(false), 700);
    }
  }

  private replay(): void {
    if (!this.takeUrl) return;
    void new Audio(this.takeUrl).play();
  }

  private startOver(): void {
    if (this.phase !== 'idle') void this.stopSinging(true);
    this.step = 'listen';
    this.listened = false;
    this.comparison = null;
    this.sessionId = null;
    this.render();
  }

  private async setExample(file?: File): Promise<void> {
    if (!file) return;
    await ExampleStore.save(this.practice.id, file, file.name);
    this.example = { blob: file, name: file.name };
    this.render();
  }
}
