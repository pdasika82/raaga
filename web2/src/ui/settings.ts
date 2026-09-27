import { NOTATION_TITLES, type Notation } from '@core/pitch';
import { DEFAULT_MODEL } from '@llm/claude';
import type { App } from './app';
import { clear, h } from './dom';

export class SettingsView {
  readonly el = h('div', { class: 'view' });
  constructor(private app: App) {}

  async refresh(): Promise<void> {
    const p = this.app.prefs;
    const keyInput = h('input', { class: 'input', type: 'password', placeholder: 'sk-ant-…', autocomplete: 'off' }) as HTMLInputElement;
    const keyStatus = h('div', { class: 'small' });
    const show = () => { keyStatus.textContent = p.apiKey ? `✓ Key saved, ending in ${this.app.prefs.apiKey.slice(-4)}` : 'No key saved. Practice guidance needs one.'; keyStatus.className = this.app.prefs.apiKey ? 'small ok' : 'small warn'; };
    show();
    const notation = h('select', { class: 'select' });
    for (const n of Object.keys(NOTATION_TITLES) as Notation[]) notation.append(h('option', { value: n, selected: n === p.notation }, NOTATION_TITLES[n]));
    notation.addEventListener('change', () => this.app.update({ notation: notation.value as Notation }));
    const a4 = h('input', { class: 'input', type: 'number', min: 415, max: 466, step: 1, value: p.a4 }) as HTMLInputElement;
    a4.addEventListener('change', () => this.app.update({ a4: Number(a4.value) || 440 }));
    clear(this.el).append(
      h('section', { class: 'card' },
        h('h3', {}, 'Anthropic API key'),
        keyInput,
        h('div', { class: 'row' },
          h('button', { class: 'btn', onClick: () => { const v = keyInput.value.trim(); if (v) { this.app.update({ apiKey: v }); keyInput.value = ''; show(); } } }, 'Save key'),
          h('button', { class: 'btn btn-secondary', onClick: () => { this.app.update({ apiKey: '' }); show(); } }, 'Remove')),
        keyStatus,
        h('p', { class: 'muted tiny' }, `Stored only in this browser. Used for practice guidance with the ${DEFAULT_MODEL} model.`)),
      h('section', { class: 'card' },
        h('h3', {}, 'Display'),
        h('label', { class: 'field' }, h('span', {}, 'Note names'), notation),
        h('label', { class: 'field' }, h('span', {}, 'A4 reference (Hz)'), a4),
        h('div', { class: 'muted tiny' }, 'Sa and the starting octave are set from the header.')),
      h('section', { class: 'card' }, h('h3', {}, 'Other version'), h('a', { href: '../steps/', class: 'link' }, 'Open Raaga Steps (one note at a time) ›'), h('a', { href: '../', class: 'link' }, 'All apps ›')),
    );
  }
}
