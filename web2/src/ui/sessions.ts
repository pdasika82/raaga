import { analyze, hasVoice, noteSequence, score, type NoteEvent, type PerformanceReport } from '@core/analyzer';
import { nextStep } from '@core/guidance';
import { westernName, westernPitchClassName } from '@core/pitch';
import { SYSTEM_PROMPT, userMessage } from '@core/prompt';
import { scaleById, type Scale } from '@core/scale';
import type { PracticeSession } from '@core/session';
import { describeSemitone, detectedLabel, parseToken, tokenSpoken } from '@core/swara';
import { askCoach, describeError } from '@llm/claude';
import { SessionStore } from '@storage/db';
import type { App } from './app';
import { PitchChart, type ChartSelection } from './chart';
import { clear, formatDate, formatTime, h, pct } from './dom';
import { showScoreGuide } from './guide';
import { playTone } from './tone';

function report(s: PracticeSession): PerformanceReport {
  return analyze(s.samples, scaleById(s.scaleId), s.tonic, s.a4, { totalSeconds: s.duration });
}

function badge(r: PerformanceReport): HTMLElement {
  const sc = score(r);
  const cls = !hasVoice(r) ? 'none' : sc >= 80 ? 'good' : sc >= 55 ? 'mid' : 'low';
  return h('span', { class: `badge badge-${cls}` }, hasVoice(r) ? String(sc) : '–');
}

export class SessionsView {
  readonly el = h('div', { class: 'view' });
  constructor(private app: App) {}

  async refresh(): Promise<void> {
    const sessions = await SessionStore.all();
    clear(this.el);
    if (!sessions.length) {
      this.el.append(h('section', { class: 'card empty' }, h('h3', {}, 'No sessions yet'), h('p', { class: 'muted' }, 'Start a practice on the Practice tab and it will show up here.')));
      return;
    }
    const selected = new Set<string>();
    const countEl = h('span', { class: 'muted small' }, `${sessions.length} session${sessions.length === 1 ? '' : 's'}`);
    const deleteBtn = h('button', { class: 'btn btn-danger btn-sm', disabled: true }, 'Delete selected');
    const selectAll = h('input', { type: 'checkbox', 'aria-label': 'Select all' }) as HTMLInputElement;
    const boxes = new Map<string, HTMLInputElement>();
    const sync = () => {
      deleteBtn.disabled = selected.size === 0;
      deleteBtn.textContent = selected.size ? `Delete ${selected.size} selected` : 'Delete selected';
      selectAll.checked = selected.size === sessions.length && sessions.length > 0;
      selectAll.indeterminate = selected.size > 0 && selected.size < sessions.length;
    };
    selectAll.addEventListener('change', () => {
      for (const s of sessions) { if (selectAll.checked) selected.add(s.id); else selected.delete(s.id); boxes.get(s.id)!.checked = selectAll.checked; }
      sync();
    });
    deleteBtn.addEventListener('click', async () => {
      if (!confirm(`Delete ${selected.size} session${selected.size === 1 ? '' : 's'} and their recordings?`)) return;
      for (const id of selected) await SessionStore.delete(id);
      await this.refresh();
    });
    this.el.append(h('div', { class: 'row space' },
      h('span', { class: 'row' }, h('label', { class: 'row select-all' }, selectAll, h('span', { class: 'muted small' }, 'All')), countEl, deleteBtn),
      h('button', { class: 'link small', onClick: () => showScoreGuide() }, 'What does the score mean? ›')));
    const list = h('ul', { class: 'list' });
    for (const s of sessions) {
      const r = report(s);
      const matched = s.targets?.filter((t) => t.matchedAt != null).length;
      const box = h('input', { type: 'checkbox', 'aria-label': `Select ${s.lessonTitle} session`, onClick: (e) => e.stopPropagation() }) as HTMLInputElement;
      box.addEventListener('change', () => { if (box.checked) selected.add(s.id); else selected.delete(s.id); sync(); });
      boxes.set(s.id, box);
      const row = h(
        'li',
        { class: 'list-item', onClick: () => this.app.openSession(s.id) },
        box,
        h('div', { class: 'grow' },
          h('div', { class: 'title' }, s.lessonTitle),
          h('div', { class: 'muted small' }, `${scaleById(s.scaleId).name} · Sa ${westernPitchClassName(s.tonic)} · ${formatTime(s.duration)}${s.targets ? ` · ${matched}/${s.targets.length} notes` : ''}`),
          h('div', { class: 'muted tiny' }, formatDate(s.date) + (s.feedback ? ' · 💬' : ''))),
        badge(r),
        h('button', { class: 'icon-btn', title: 'Delete session', 'aria-label': `Delete ${s.lessonTitle} session`, onClick: async (e) => {
          e.stopPropagation();
          if (!confirm(`Delete this ${s.lessonTitle} session and its recording?`)) return;
          await SessionStore.delete(s.id);
          row.remove();
          if (!list.children.length) await this.refresh();
        } }, '🗑'),
      );
      list.append(row);
    }
    this.el.append(list);
  }
}

/** Review page: next step first, then playback + chart, explore a note, guidance, details. */
export class SessionDetailView {
  readonly el = h('div', { class: 'view' });
  private audioUrl: string | null = null;
  private raf: number | null = null;

  constructor(private app: App) {}

  async show(id: string): Promise<void> {
    const session = await SessionStore.get(id);
    clear(this.el);
    if (this.raf) cancelAnimationFrame(this.raf);
    if (!session) {
      this.el.append(h('p', { class: 'muted' }, 'Session not found.'));
      return;
    }
    const { notation } = this.app.prefs;
    const scale = scaleById(session.scaleId);
    const r = report(session);
    const step = nextStep(session, r, scale, notation);

    // Playback
    if (this.audioUrl) URL.revokeObjectURL(this.audioUrl);
    const blob = await SessionStore.recording(id);
    const audio = h('audio', { controls: true, class: 'audio' });
    if (blob) {
      this.audioUrl = URL.createObjectURL(blob);
      audio.src = this.audioUrl;
    }

    // Chart + inspector
    const canvas = h('canvas', { class: 'chart' });
    let chart: PitchChart | null = null;
    const zoomLabel = h('span', { class: 'muted small zoom-level' }, '1×');
    const zoomControls = h('div', { class: 'row zoom' },
      h('button', { class: 'btn btn-secondary btn-sm', title: 'Zoom out', onClick: () => chart?.zoom(1 / 1.5) }, '−'),
      zoomLabel,
      h('button', { class: 'btn btn-secondary btn-sm', title: 'Zoom in', onClick: () => chart?.zoom(1.5) }, '+'),
      h('button', { class: 'btn btn-secondary btn-sm', onClick: () => chart?.reset() }, 'Reset'));
    const inspector = h('div', { class: 'inspector', hidden: true });
    let stopAt: number | null = null;
    const replay = (from: number, to: number) => {
      if (!audio.src) return;
      audio.currentTime = Math.max(0, from);
      stopAt = to;
      void audio.play();
    };
    const showSelection = (sel: ChartSelection | null) => {
      clear(inspector);
      if (!sel) { inspector.hidden = true; return; }
      inspector.hidden = false;
      const chroma = Math.round(sel.midi);
      const cents = Math.round((sel.midi - chroma) * 100);
      const signed = (c: number) => `${c >= 0 ? '+' : ''}${c}`;
      const detected = detectedLabel(sel.midi, scale, notation, session.tonic);
      const targetTok = sel.target ? parseToken(sel.target.token) : null;
      const expected = targetTok ? tokenSpoken(targetTok, notation, session.tonic, scale) : null;
      let verdict: string;
      if (sel.target?.midi != null) {
        const dev = Math.round((sel.midi - sel.target.midi) * 100);
        verdict = Math.abs(dev) <= 20 ? `On pitch for ${expected}` : Math.abs(dev) <= 60 ? `A little ${dev > 0 ? 'high' : 'low'} for ${expected} (${signed(dev)} cents)` : `Asked ${expected} · detected ${detected}`;
      } else {
        verdict = `Detected ${detected}`;
      }
      inspector.append(
        h('div', { class: 'row space' },
          h('div', {}, h('div', { class: 'title' }, verdict), h('div', { class: `small acc-${sel.accuracy}` }, `${sel.t.toFixed(2)} s · ${westernName(chroma)} · ${sel.hz.toFixed(1)} Hz · ${signed(cents)} ¢ from ${westernName(chroma)}`)),
          h('button', { class: 'link small', onClick: () => chart?.clearSelection() }, '✕')));
      if (sel.event) {
        const e = sel.event;
        inspector.append(
          h('div', { class: 'small muted' }, `Held ${e.duration.toFixed(2)} s, average ${signed(Math.round(e.meanCents))} ¢, wobble ±${e.centsStdDev.toFixed(0)} ¢`),
          h('div', { class: 'row' },
            h('button', { class: 'btn btn-secondary btn-sm', onClick: () => replay(e.start - 0.2, e.start + e.duration + 0.2) }, '▶ Replay'),
            sel.target?.midi != null ? h('button', { class: 'btn btn-secondary btn-sm', onClick: () => void playTone(sel.target!.midi!, session.a4, 1.2) }, `♪ ${expected} tone`) : null,
            targetTok ? h('button', { class: 'btn btn-secondary btn-sm', onClick: () => this.app.startDrill(session, phraseAround(targetTok.raw), `${expected} drill`) }, `Retry ${expected}`) : null,
            h('button', { class: 'btn btn-secondary btn-sm', onClick: () => chart?.zoomToEvent(e) }, 'Zoom')));
      } else {
        inspector.append(h('div', { class: 'small muted' }, 'A passing pitch between notes, not a held note.'));
      }
    };

    // Explore a note: one chip per distinct target (guided) or per held swara (free)
    const explore = this.exploreChips(session, r, scale, notation, (e) => chart?.selectEvent(e), (tok) => this.app.startDrill(session, phraseAround(tok), `${tok} drill`));

    // Guidance
    const feedbackBox = h('div', { class: 'feedback' });
    const feedbackStatus = h('div', { class: 'status' });
    const renderFeedback = () => {
      clear(feedbackBox);
      if (session.feedback) {
        for (const line of session.feedback.split('\n')) feedbackBox.append(h('p', { class: line.startsWith('- ') ? 'bullet' : '' }, line || ' '));
        feedbackBox.append(h('div', { class: 'muted tiny' }, `${session.feedbackModel ?? 'Claude'} · ${session.feedbackDate ? formatDate(session.feedbackDate) : ''}`));
      }
    };
    renderFeedback();
    const noteInput = h('textarea', { class: 'input', rows: 2, placeholder: 'For example: practise Ri slowly tomorrow' });
    noteInput.value = session.userNote ?? '';
    const persistNote = async () => {
      const v = noteInput.value.trim();
      if ((session.userNote ?? '') !== v) { session.userNote = v || undefined; await SessionStore.save(session); }
    };
    noteInput.addEventListener('change', persistNote);
    const askBtn = h('button', { class: 'btn', disabled: !hasVoice(r) }, session.feedback ? 'Ask for guidance again' : 'Get practice guidance');
    askBtn.addEventListener('click', async () => {
      await persistNote();
      const key = this.app.prefs.apiKey;
      if (!key.trim()) { feedbackStatus.textContent = 'Add your Anthropic API key in Settings first.'; return; }
      askBtn.disabled = true;
      feedbackStatus.textContent = 'Preparing guidance…';
      try {
        const reply = await askCoach(key, SYSTEM_PROMPT, userMessage(session, r));
        session.feedback = reply.text;
        session.feedbackDate = new Date().toISOString();
        session.feedbackModel = reply.model;
        await SessionStore.save(session);
        renderFeedback();
        askBtn.textContent = 'Ask for guidance again';
        feedbackStatus.textContent = '';
      } catch (err) {
        feedbackStatus.textContent = describeError(err);
      }
      askBtn.disabled = false;
    });

    const deleteBtn = h('button', { class: 'btn btn-danger', onClick: async () => {
      if (!confirm('Delete this session and its recording?')) return;
      await SessionStore.delete(id);
      this.app.navigate('sessions');
    } }, '🗑 Delete this session');
    const stat = (label: string, value: string) => h('div', { class: 'stat' }, h('span', { class: 'muted' }, label), h('span', {}, value));
    const matched = session.targets?.filter((t) => t.matchedAt != null).length;

    this.el.append(h('div', { class: 'view' },
      h('button', { class: 'link', onClick: () => this.app.navigate('sessions') }, '‹ Sessions'),
      h('section', { class: 'card' },
        h('div', { class: 'eyebrow' }, session.lessonTitle.toUpperCase()),
        h('h2', {}, "Here's what to practise next"),
        h('div', { class: 'muted small' }, `${scale.name} · Your Sa: ${westernPitchClassName(session.tonic)} · ${formatDate(session.date)} · ${formatTime(session.duration)}${session.targets ? ` · ${matched}/${session.targets.length} notes matched` : ''}`),
        h('div', { class: 'next-step' },
          h('div', { class: 'eyebrow' }, 'YOUR NEXT STEP'),
          h('div', { class: 'title' }, step.headline),
          h('p', { class: 'small' }, step.detail),
          step.action ? h('button', { class: 'btn', onClick: () => this.app.startDrill(session, step.action!.sequence, step.action!.title, step.action!.hold) }, step.action.label) : null)),
      h('section', { class: 'card' },
        h('div', { class: 'row space' }, h('h3', {}, 'What you sang'), zoomControls),
        audio,
        canvas,
        inspector,
        h('div', { class: 'muted tiny' }, session.targets ? 'Shaded bands are the notes the exercise asked for; dots are what you sang. Tap a dot to inspect, replay or retry it. Pinch or scroll to zoom.' : 'Dots are what you sang. Tap a dot to inspect or replay it. Pinch or scroll to zoom.')),
      explore,
      h('section', { class: 'card' },
        h('h3', {}, 'Practice guidance'),
        feedbackBox,
        askBtn,
        feedbackStatus,
        h('div', { class: 'muted tiny' }, 'Generated by Claude from the pitch measurements and the lesson text; it covers pitch only, not tone, breath or diction. The recording itself stays on this device.')),
      h('details', { class: 'card details-card' },
        h('summary', {}, h('span', { class: 'row space' }, h('span', {}, 'Exact measurements'), badge(r))),
        h('button', { class: 'link small', onClick: () => showScoreGuide() }, 'What does the score mean? ›'),
        stat('Singing detected', `${r.voicedSeconds.toFixed(1)} s`),
        stat('Within ±20 cents', pct(r.within20)),
        stat('Within ±50 cents', pct(r.within50)),
        stat('On scale tones', pct(r.scaleToneFraction)),
        stat('Average deviation', `${r.meanAbsCents.toFixed(0)} cents`),
        r.stabilityCents != null ? stat('Steadiness on held notes', `±${r.stabilityCents.toFixed(0)} cents`) : null,
        r.lowestMidi != null && r.highestMidi != null ? stat('Range', `${westernName(r.lowestMidi)} – ${westernName(r.highestMidi)}`) : null,
        r.events.length ? h('div', { class: 'stat' }, h('span', { class: 'muted' }, 'Notes heard'), h('span', { class: 'mono small' }, noteSequence(r, scale, session.tonic, notation))) : null),
      h('details', { class: 'card details-card' }, h('summary', {}, 'Add a practice note'), noteInput),
      deleteBtn,
    ));

    requestAnimationFrame(() => {
      chart = new PitchChart(canvas, { samples: session.samples, scale, tonic: session.tonic, a4: session.a4, notation, events: r.events, targets: session.targets });
      chart.onViewChange(() => (zoomLabel.textContent = `${chart!.zoomLevel.toFixed(chart!.zoomLevel < 10 ? 1 : 0)}×`));
      chart.onSelect(showSelection);
      chart.draw();
      const tick = () => {
        if (!audio.paused) {
          chart?.setPlayhead(audio.currentTime);
          if (stopAt != null && audio.currentTime >= stopAt) { audio.pause(); stopAt = null; }
        }
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
      audio.addEventListener('pause', () => chart?.setPlayhead(null));
      audio.addEventListener('ended', () => chart?.setPlayhead(null));
    });
  }

  private exploreChips(session: PracticeSession, r: PerformanceReport, scale: Scale, notation: 'indian' | 'western',
    select: (e: NoteEvent) => void, drill: (tok: string) => void): HTMLElement | null {
    const chips = h('div', { class: 'chips' });
    const targets = session.targets ?? [];
    if (targets.length) {
      const seen = new Set<string>();
      for (const t of targets) {
        if (seen.has(t.token)) continue;
        seen.add(t.token);
        const same = targets.filter((x) => x.token === t.token);
        const matched = same.filter((x) => x.matchedAt != null && x.cents != null);
        const tok = parseToken(t.token);
        if (!tok) continue;
        const name = tokenSpoken(tok, notation, session.tonic, scale);
        let verdict: string, cls: string;
        if (!matched.length) { verdict = 'Not matched'; cls = 'offScale'; }
        else {
          const mean = matched.reduce((a, x) => a + x.cents!, 0) / matched.length;
          const retries = same.reduce((a, x) => a + x.attempts, 0) - matched.length;
          if (Math.abs(mean) <= 20 && retries === 0) { verdict = 'On pitch'; cls = 'inTune'; }
          else if (Math.abs(mean) <= 20) { verdict = `On pitch after ${retries} retr${retries === 1 ? 'y' : 'ies'}`; cls = 'close'; }
          else { verdict = `A little ${mean > 0 ? 'high' : 'low'}`; cls = 'off'; }
        }
        const ev = matched.length ? eventNear(r, matched[0].matchedAt!) : null;
        chips.append(h('button', { class: `chip acc-${cls}`, onClick: () => { if (ev) select(ev); else drill(t.token); } },
          h('div', { class: 'chip-name' }, name), h('div', { class: 'chip-verdict' }, verdict)));
      }
    } else {
      for (const d of r.degrees.filter((x) => x.seconds >= 0.3)) {
        const name = describeSemitone(d.semitone, scale, notation, session.tonic);
        const cls = !d.isScaleTone ? 'offScale' : Math.abs(d.meanCents) <= 20 ? 'inTune' : 'off';
        const verdict = !d.isScaleTone ? 'Outside this scale' : Math.abs(d.meanCents) <= 20 ? 'On pitch' : `A little ${d.meanCents > 0 ? 'high' : 'low'}`;
        const ev = r.events.find((e) => e.semitoneFromTonic === d.semitone);
        chips.append(h('button', { class: `chip acc-${cls}`, onClick: () => ev && select(ev) }, h('div', { class: 'chip-name' }, name), h('div', { class: 'chip-verdict' }, verdict)));
      }
    }
    if (!chips.children.length) return null;
    return h('section', { class: 'card' }, h('h3', {}, 'Explore a note'), chips, h('div', { class: 'muted tiny' }, 'Tap a note to see it on the chart, replay it, or retry it on its own.'));
  }
}

function eventNear(r: PerformanceReport, t: number): NoteEvent | null {
  let best: NoteEvent | null = null;
  for (const e of r.events) {
    if (t >= e.start - 0.1 && t <= e.start + e.duration + 0.1) return e;
    if (!best || Math.abs(e.start + e.duration / 2 - t) < Math.abs(best.start + best.duration / 2 - t)) best = e;
  }
  return best;
}

/** A five-note phrase around a swara token, e.g. R -> "S R G R S". */
function phraseAround(token: string): string {
  const tok = parseToken(token);
  if (!tok) return 'S R S';
  const order = ['S', 'R', 'G', 'M', 'P', 'D', 'N'];
  const i = order.indexOf(tok.family);
  const suf = tok.octave > 0 ? "'" : tok.octave < 0 ? ',' : '';
  if (i === 0) return tok.octave > 0 ? "N D N S' N" : 'S R S R S';
  const prev = order[i - 1] + suf, cur = tok.family + suf, next = order[Math.min(6, i + 1)] + suf;
  return `${prev} ${cur} ${next} ${cur} ${prev}`;
}
