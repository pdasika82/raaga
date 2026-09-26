import { analyze, hasVoice, noteSequence, score, type PerformanceReport } from '../core/analyzer';
import { pitchClass, SWARA_NAMES, westernName, westernPitchClassName } from '../core/pitch';
import { SYSTEM_PROMPT, userMessage } from '../core/prompt';
import { degreeName, scaleById, scaleDisplayName } from '../core/scale';
import type { PracticeSession } from '../core/session';
import { askCoach, describeError } from '../llm/claude';
import { SessionStore } from '../storage/db';
import type { App } from './app';
import { PitchChart, type ChartSelection } from './chart';
import { clear, formatDate, formatTime, h, pct } from './dom';

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
      this.el.append(h('section', { class: 'card empty' }, h('h3', {}, 'No sessions yet'), h('p', { class: 'muted' }, 'Record an exercise on the Practice tab and it will show up here.')));
      return;
    }
    const list = h('ul', { class: 'list' });
    for (const s of sessions) {
      const r = report(s);
      list.append(
        h(
          'li',
          { class: 'list-item', onClick: () => this.app.openSession(s.id) },
          h(
            'div',
            { class: 'grow' },
            h('div', { class: 'title' }, s.lessonTitle),
            h('div', { class: 'muted small' }, `${scaleById(s.scaleId).name} · Sa ${westernPitchClassName(s.tonic)} · ${formatTime(s.duration)}`),
            h('div', { class: 'muted tiny' }, formatDate(s.date) + (s.feedback ? ' · 💬' : '')),
          ),
          badge(r),
        ),
      );
    }
    this.el.append(list);
  }
}

export class SessionDetailView {
  readonly el = h('div', { class: 'view' });
  private audioUrl: string | null = null;

  constructor(private app: App) {}

  async show(id: string): Promise<void> {
    const session = await SessionStore.get(id);
    clear(this.el);
    if (!session) {
      this.el.append(h('p', { class: 'muted' }, 'Session not found.'));
      return;
    }
    const { notation } = this.app.prefs;
    const scale = scaleById(session.scaleId);
    const r = report(session);

    // Playback
    if (this.audioUrl) URL.revokeObjectURL(this.audioUrl);
    const blob = await SessionStore.recording(id);
    const audio = h('audio', { controls: true, class: 'audio' });
    if (blob) {
      this.audioUrl = URL.createObjectURL(blob);
      audio.src = this.audioUrl;
    }

    const canvas = h('canvas', { class: 'chart' });
    let chart: PitchChart | null = null;
    const inspector = h('div', { class: 'inspector', hidden: true });
    const showSelection = (sel: ChartSelection | null) => {
      clear(inspector);
      if (!sel) {
        inspector.hidden = true;
        return;
      }
      inspector.hidden = false;
      const chroma = Math.round(sel.midi);
      const cents = Math.round((sel.midi - chroma) * 100);
      const swara = SWARA_NAMES[pitchClass(chroma - session.tonic)];
      const signed = (c: number) => `${c >= 0 ? '+' : ''}${c}`;
      const inScale = scale.intervals.includes(pitchClass(chroma - session.tonic));
      inspector.append(
        h('div', { class: 'row space' },
          h('div', {},
            h('div', { class: 'title' }, `${sel.t.toFixed(2)} s · ${swara} (${westernName(chroma)}) · ${sel.hz.toFixed(1)} Hz`),
            h('div', { class: `small acc-${sel.accuracy}` }, `${signed(cents)} ¢ from ${westernName(chroma)}${inScale ? '' : ' · not in this scale'}`),
          ),
          h('button', { class: 'link small', onClick: () => chart?.clearSelection() }, '✕'),
        ),
      );
      if (sel.event) {
        const e = sel.event;
        const name = degreeName(scale, e.semitoneFromTonic, session.tonic, notation);
        inspector.append(
          h('div', { class: 'row space' },
            h('div', { class: 'small muted' }, `Part of a held ${e.isScaleTone ? name : `(${name})`}: ${e.duration.toFixed(2)} s, average ${signed(Math.round(e.meanCents))} ¢, wobble ±${e.centsStdDev.toFixed(0)} ¢`),
            h('button', { class: 'btn btn-secondary btn-sm', onClick: () => chart?.zoomToEvent(e) }, 'Zoom to note'),
          ),
        );
      } else {
        inspector.append(h('div', { class: 'small muted' }, 'A passing pitch between notes, not a held note.'));
      }
    };
    const zoomLabel = h('span', { class: 'muted small zoom-level' }, '1×');
    const zoomControls = h(
      'div',
      { class: 'row zoom' },
      h('button', { class: 'btn btn-secondary btn-sm', title: 'Zoom out', onClick: () => chart?.zoom(1 / 1.5) }, '−'),
      zoomLabel,
      h('button', { class: 'btn btn-secondary btn-sm', title: 'Zoom in', onClick: () => chart?.zoom(1.5) }, '+'),
      h('button', { class: 'btn btn-secondary btn-sm', onClick: () => chart?.reset() }, 'Reset'),
    );
    const noteInput = h('textarea', { class: 'input', rows: 2, placeholder: 'How did it feel? Anything you were working on?' });
    noteInput.value = session.userNote ?? '';
    const persistNote = async () => {
      const v = noteInput.value.trim();
      if ((session.userNote ?? '') !== v) {
        session.userNote = v || undefined;
        await SessionStore.save(session);
      }
    };
    noteInput.addEventListener('change', persistNote);

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
    const askBtn = h(
      'button',
      { class: 'btn', disabled: !hasVoice(r) },
      session.feedback ? 'Ask again' : 'Get feedback from Claude',
    );
    askBtn.addEventListener('click', async () => {
      await persistNote();
      const key = this.app.prefs.apiKey;
      if (!key.trim()) {
        feedbackStatus.textContent = 'Add your Anthropic API key in Settings first.';
        return;
      }
      askBtn.disabled = true;
      feedbackStatus.textContent = 'Asking your coach…';
      try {
        const reply = await askCoach(key, SYSTEM_PROMPT, userMessage(session, r));
        session.feedback = reply.text;
        session.feedbackDate = new Date().toISOString();
        session.feedbackModel = reply.model;
        await SessionStore.save(session);
        renderFeedback();
        askBtn.textContent = 'Ask again';
        feedbackStatus.textContent = '';
      } catch (err) {
        feedbackStatus.textContent = describeError(err);
      }
      askBtn.disabled = false;
    });

    const deleteBtn = h('button', { class: 'btn btn-danger' }, 'Delete session');
    deleteBtn.addEventListener('click', async () => {
      if (!confirm('Delete this session and its recording?')) return;
      await SessionStore.delete(id);
      this.app.navigate('sessions');
    });

    const stat = (label: string, value: string) => h('div', { class: 'stat' }, h('span', { class: 'muted' }, label), h('span', {}, value));

    this.el.append(h('div', { class: 'view' },
      h('button', { class: 'link', onClick: () => this.app.navigate('sessions') }, '‹ Sessions'),
      h(
        'section',
        { class: 'card' },
        h('h2', {}, session.lessonTitle),
        h('div', { class: 'muted small' }, `${scaleDisplayName(scale)} · Sa = ${westernPitchClassName(session.tonic)} · ${formatDate(session.date)} · ${formatTime(session.duration)}`),
        h('p', { class: 'instructions' }, session.lessonInstructions),
        audio,
      ),
      h(
        'section',
        { class: 'card' },
        h('div', { class: 'row space' }, h('h3', {}, 'Pitch'), zoomControls),
        canvas,
        inspector,
        h('div', { class: 'muted tiny' }, 'Tap a dot to inspect it. Pinch or scroll to zoom, drag to pan, double-tap to reset. Each held note is labelled with the swara it landed on and its tuning in cents (− flat, + sharp). Right axis shows the Western name.'),
      ),
      h(
        'section',
        { class: 'card' },
        h('div', { class: 'row' }, badge(r), h('div', {}, h('div', { class: 'title' }, 'Overall'), h('div', { class: 'muted small' }, `${r.voicedSeconds.toFixed(1)} s of singing detected`))),
        stat('Within ±20 cents', pct(r.within20)),
        stat('Within ±50 cents', pct(r.within50)),
        stat('On scale tones', pct(r.scaleToneFraction)),
        stat('Average deviation', `${r.meanAbsCents.toFixed(0)} cents`),
        r.stabilityCents != null ? stat('Steadiness on held notes', `±${r.stabilityCents.toFixed(0)} cents`) : null,
        r.lowestMidi != null && r.highestMidi != null ? stat('Range', `${westernName(r.lowestMidi)} – ${westernName(r.highestMidi)}`) : null,
      ),
      r.events.length
        ? h('section', { class: 'card' }, h('h3', {}, 'Notes sung'), h('p', { class: 'mono' }, noteSequence(r, scale, session.tonic, notation)), h('div', { class: 'muted tiny' }, 'Notes in parentheses are outside the scale.'))
        : null,
      h('section', { class: 'card' }, h('h3', {}, 'Your note'), noteInput),
      h(
        'section',
        { class: 'card' },
        h('h3', {}, 'Coach feedback'),
        feedbackBox,
        askBtn,
        feedbackStatus,
        h('div', { class: 'muted tiny' }, 'Only the pitch analysis and lesson text are sent; the audio stays on this device.'),
      ),
      deleteBtn,
    ));
    requestAnimationFrame(() => {
      chart = new PitchChart(canvas, { samples: session.samples, scale, tonic: session.tonic, a4: session.a4, notation, events: r.events });
      chart.onViewChange(() => (zoomLabel.textContent = `${chart!.zoomLevel.toFixed(chart!.zoomLevel < 10 ? 1 : 0)}×`));
      chart.onSelect(showSelection);
      chart.draw();
    });
  }
}
