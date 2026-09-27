import type { Lesson } from '../core/lesson';
import { NOTATION_TITLES, SWARA_NAMES, WESTERN_NAMES, westernPitchClassName, type Notation } from '../core/pitch';
import { SCALES, scaleById, scaleDisplayName, TRADITIONS } from '../core/scale';
import { LessonStore } from '../storage/db';
import { DEFAULT_MODEL } from '../llm/claude';
import type { App } from './app';
import { clear, h } from './dom';

export class SettingsView {
  readonly el = h('div', { class: 'view' });

  constructor(private app: App) {}

  async refresh(): Promise<void> {
    const p = this.app.prefs;
    const keyInput = h('input', { class: 'input', type: 'password', placeholder: 'sk-ant-…', autocomplete: 'off' }) as HTMLInputElement;
    const keyStatus = h('div', { class: 'small' });
    const showKeyStatus = () => {
      const key = this.app.prefs.apiKey;
      keyStatus.textContent = key ? `✓ Key saved, ending in ${key.slice(-4)}` : 'No key saved. Feedback needs one.';
      keyStatus.className = key ? 'small ok' : 'small warn';
    };
    showKeyStatus();

    const notation = h('select', { class: 'select' });
    for (const n of Object.keys(NOTATION_TITLES) as Notation[]) notation.append(h('option', { value: n, selected: n === p.notation }, NOTATION_TITLES[n]));
    notation.addEventListener('change', () => this.app.update({ notation: notation.value as Notation }));

    const tonic = h('select', { class: 'select' });
    WESTERN_NAMES.forEach((n, i) => tonic.append(h('option', { value: i, selected: i === p.tonic }, n)));
    tonic.addEventListener('change', () => this.app.setTonic(Number(tonic.value)));
    const octave = h('select', { class: 'select' });
    for (const o of [2, 3, 4, 5]) octave.append(h('option', { value: o, selected: o === p.saOctave }, `${westernPitchClassName(p.tonic)}${o}`));
    octave.addEventListener('change', () => this.app.update({ saOctave: Number(octave.value) }));

    const a4 = h('input', { class: 'input', type: 'number', min: 415, max: 466, step: 1, value: p.a4 }) as HTMLInputElement;
    a4.addEventListener('change', () => this.app.update({ a4: Number(a4.value) || 440 }));

    const holdToggle = h('input', { type: 'checkbox', checked: p.holdNotes }) as HTMLInputElement;
    holdToggle.addEventListener('change', () => this.app.update({ holdNotes: holdToggle.checked }));
    const custom = await LessonStore.custom();
    const lessonList = h('ul', { class: 'list' });
    for (const l of custom) {
      lessonList.append(
        h(
          'li',
          { class: 'list-item' },
          h('div', { class: 'grow', onClick: () => this.editLesson(l) }, h('div', { class: 'title' }, l.title), h('div', { class: 'muted small' }, scaleDisplayName(scaleById(l.scaleId)))),
          h('button', { class: 'link danger', onClick: async () => { if (confirm(`Delete "${l.title}"?`)) { await LessonStore.delete(l.id); await this.app.reloadLessons(); } } }, 'Delete'),
        ),
      );
    }

    clear(this.el).append(
      h(
        'section',
        { class: 'card' },
        h('h3', {}, 'Anthropic API key'),
        keyInput,
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn', onClick: () => { const v = keyInput.value.trim(); if (v) { this.app.update({ apiKey: v }); keyInput.value = ''; showKeyStatus(); } } }, 'Save key'),
          h('button', { class: 'btn btn-secondary', onClick: () => { this.app.update({ apiKey: '' }); showKeyStatus(); } }, 'Remove'),
        ),
        keyStatus,
        h('p', { class: 'muted tiny' }, `Stored only in this browser. Used to request feedback from the ${DEFAULT_MODEL} model. `, h('a', { href: 'https://console.anthropic.com/settings/keys', target: '_blank', rel: 'noopener' }, 'Create a key')),
      ),
      h(
        'section',
        { class: 'card' },
        h('h3', {}, 'Display'),
        h('label', { class: 'field' }, h('span', {}, 'Note names'), notation),
        h('label', { class: 'field' }, h('span', {}, 'Sa'), tonic),
        h('label', { class: 'field' }, h('span', {}, 'Starting note'), octave),
        h('button', { class: 'link small', onClick: () => this.app.navigate('tune') }, 'Not sure? Find comfortable Sa ›'),
        h('label', { class: 'field' }, h('span', {}, 'A4 reference (Hz)'), a4),
      ),
      h(
        'section',
        { class: 'card' },
        h('h3', {}, 'Practice'),
        h('label', { class: 'field' }, h('span', {}, 'Hold each note for the lesson\'s time (usually 1 s)'), holdToggle),
        h('div', { class: 'muted tiny' }, 'Off: a note registers as soon as it is steady for about a third of a second. Useful for running through a sequence quickly; keep it on to build steadiness.'),
      ),
      h(
        'section',
        { class: 'card' },
        h('div', { class: 'row space' }, h('h3', {}, 'Custom lessons'), h('button', { class: 'btn btn-secondary', onClick: () => this.editLesson(null) }, '+ Add')),
        custom.length ? lessonList : h('p', { class: 'muted small' }, 'Add a lesson to practise a specific exercise or raga.'),
      ),
      h(
        'section',
        { class: 'card' },
        h('h3', {}, 'Other version'),
        h('a', { href: 'v2/', class: 'link small' }, 'Open the listen & repeat version ›'),
        h('h3', {}, 'First-time guide'),
        h('button', { class: 'link small', onClick: () => this.app.update({ onboarded: false }) }, 'Show the three-step introduction on Practice again ›'),
        h('h3', {}, 'Install on iPhone'),
        h('p', { class: 'muted small' }, 'In Safari tap Share, then "Add to Home Screen". Installed apps keep their data and open full screen.'),
        h('p', { class: 'muted tiny' }, 'Raaga listens to your voice, shows how close each note is to the chosen scale or raga, and saves your practice so a coach model can review it.'),
      ),
    );
  }

  private editLesson(existing: Lesson | null): void {
    const lesson: Lesson = existing ? { ...existing } : { id: crypto.randomUUID(), title: '', instructions: '', scaleId: 'shankarabharanam', isBuiltIn: false, sequence: '', hold: 0.8 };
    const sequence = h('input', { class: 'input', placeholder: "e.g. S R G M P D N S' S' N D P M G R S", value: lesson.sequence ?? '' }) as HTMLInputElement;
    const hold = h('input', { class: 'input', type: 'number', min: 0.3, max: 10, step: 0.1, value: lesson.hold ?? 0.8 }) as HTMLInputElement;
    const title = h('input', { class: 'input', placeholder: 'e.g. Alankaram 3 in Mayamalavagowla', value: lesson.title }) as HTMLInputElement;
    const instructions = h('textarea', { class: 'input', rows: 4, placeholder: 'What to sing' }) as HTMLTextAreaElement;
    instructions.value = lesson.instructions;
    const scaleSel = h('select', { class: 'select' });
    for (const tr of TRADITIONS) {
      const grp = h('optgroup', { label: tr });
      for (const s of SCALES.filter((x) => x.tradition === tr)) grp.append(h('option', { value: s.id, selected: s.id === lesson.scaleId }, s.name));
      scaleSel.append(grp);
    }
    const degrees = h('div', { class: 'muted small' });
    const showDegrees = () => {
      const sc = scaleById(scaleSel.value);
      degrees.textContent = `Degrees: ${sc.intervals.map((i) => SWARA_NAMES[i]).join(' ')}${sc.note ? ` · ${sc.note}` : ''}`;
    };
    showDegrees();
    scaleSel.addEventListener('change', showDegrees);
    const status = h('div', { class: 'status' });

    const overlay = h(
      'div',
      { class: 'overlay' },
      h(
        'div',
        { class: 'card sheet' },
        h('h3', {}, existing ? 'Edit lesson' : 'New lesson'),
        h('label', { class: 'field col' }, h('span', {}, 'Title'), title),
        h('label', { class: 'field col' }, h('span', {}, 'What to sing'), instructions),
        h('label', { class: 'field col' }, h('span', {}, 'Judge against'), scaleSel, degrees),
        h('label', { class: 'field col' }, h('span', {}, 'Swara sequence (optional; the app prompts each note)'), sequence, h('span', { class: 'muted tiny' }, "Use S R G M P D N. Add ' for the upper octave (S') and , for the lower (N,). Leave empty for free singing.")),
        h('label', { class: 'field' }, h('span', {}, 'Hold each note (seconds)'), hold),
        status,
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn btn-secondary', onClick: () => overlay.remove() }, 'Cancel'),
          h(
            'button',
            {
              class: 'btn',
              onClick: async () => {
                if (!title.value.trim()) {
                  status.textContent = 'Give the lesson a title.';
                  return;
                }
                await LessonStore.save({ ...lesson, title: title.value.trim(), instructions: instructions.value.trim(), scaleId: scaleSel.value, sequence: sequence.value.trim() || undefined, hold: Number(hold.value) || 0.8 });
                overlay.remove();
                await this.app.reloadLessons();
              },
            },
            'Save',
          ),
        ),
      ),
    );
    document.body.append(overlay);
  }
}
