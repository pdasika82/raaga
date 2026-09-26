import { westernName, westernPitchClassName, WESTERN_NAMES } from '../core/pitch';
import { startingMidi } from '../core/swara';
import type { App } from './app';
import { h } from './dom';
import { showPitchReference } from './reference';
import { playTone } from './tone';
import type { Scale } from '../core/scale';

/** Compact pitch setup for the header: Sa, starting note, reference, Adjust, Find comfortable Sa. */
export function pitchSetupInline(app: App, opts: { locked: boolean; scale?: Scale }): HTMLElement {
  const { prefs } = app;
  const start = startingMidi(prefs.tonic, prefs.saOctave);
  return h('span', { class: 'setup' },
    h('span', { class: 'kv' }, h('span', { class: 'muted' }, 'Sa'), h('span', { class: 'kv-val' }, westernPitchClassName(prefs.tonic))),
    h('span', { class: 'kv' }, h('span', { class: 'muted' }, 'Start'), h('span', { class: 'kv-val' }, westernName(start))),
    h('button', { class: 'info', title: 'Pitch reference', 'aria-label': 'Pitch reference', onClick: () => showPitchReference(app, opts.scale) }, 'ⓘ'),
    h('button', { class: 'link small', disabled: opts.locked, onClick: () => showAdjustSheet(app) }, 'Adjust'),
    h('button', { class: 'link small find-sa', disabled: opts.locked, onClick: () => app.navigate('tune') }, 'Find comfortable Sa →'),
  );
}

/** Always-open attempts panel. */
export function attemptsPanel(table: HTMLElement, count: number, locked: boolean): HTMLElement {
  return h('aside', { class: 'card attempts' },
    h('div', { class: 'row space' }, h('h3', {}, 'Recent attempts'), h('span', { class: 'count' }, String(count))),
    locked ? h('div', { class: 'muted small' }, 'Sa and the starting note stay fixed for this exercise.') : h('div', { class: 'muted small' }, 'Each judged note appears here once you start.'),
    table,
  );
}

/** Sheet to set Sa and the starting note separately, each with a preview. */
export function showAdjustSheet(app: App, initial?: { tonic: number; saOctave: number }, onDone?: () => void): void {
  let tonic = initial?.tonic ?? app.prefs.tonic;
  let octave = initial?.saOctave ?? app.prefs.saOctave;
  const overlay = h('div', { class: 'overlay', onClick: (e) => { if (e.target === overlay) overlay.remove(); } });
  const saSel = h('select', { class: 'select' });
  WESTERN_NAMES.forEach((n, i) => saSel.append(h('option', { value: i, selected: i === tonic }, n)));
  const octSel = h('select', { class: 'select' });
  const preview = h('div', { class: 'muted small' });
  const refreshOct = () => {
    octSel.replaceChildren();
    for (const o of [2, 3, 4, 5]) octSel.append(h('option', { value: o, selected: o === octave }, `${westernPitchClassName(tonic)}${o}${o === 2 ? ' · low' : o === 3 ? ' · most men' : o === 4 ? ' · most women' : ' · high'}`));
    preview.textContent = `Starting note ${westernName(startingMidi(tonic, octave))}. The exercise's highest note will be ${westernName(startingMidi(tonic, octave) + 12)}.`;
  };
  refreshOct();
  saSel.addEventListener('change', () => { tonic = Number(saSel.value); refreshOct(); });
  octSel.addEventListener('change', () => { octave = Number(octSel.value); refreshOct(); });
  overlay.append(h('div', { class: 'card sheet' },
    h('div', { class: 'row space' }, h('h3', {}, 'Adjust pitch setup'), h('button', { class: 'link', onClick: () => overlay.remove() }, 'Cancel')),
    h('label', { class: 'field' }, h('span', {}, 'Sa'), saSel, h('button', { class: 'btn btn-secondary btn-sm', onClick: () => void playTone(startingMidi(tonic, octave), app.prefs.a4, 1.2) }, '▶')),
    h('label', { class: 'field' }, h('span', {}, 'Starting note'), octSel, h('button', { class: 'btn btn-secondary btn-sm', onClick: () => void playTone(startingMidi(tonic, octave), app.prefs.a4, 1.2) }, '▶')),
    preview,
    h('div', { class: 'row' },
      h('button', { class: 'btn btn-secondary', onClick: () => void playTone(startingMidi(tonic, octave) + 12, app.prefs.a4, 1.2) }, '▶ Highest note'),
      h('button', { class: 'btn', onClick: () => { app.update({ tonic, saOctave: octave }); overlay.remove(); onDone?.(); } }, 'Use this setting')),
  ));
  document.body.append(overlay);
}
