import { hzFromMidi, westernName, westernPitchClassName } from '@core/pitch';
import type { Scale } from '@core/scale';
import { resolveDegrees, sthanaFullName, sthanaLabel, startingMidi } from '@core/swara';
import type { App } from './app';
import { h } from './dom';
import { playTone } from './tone';

const JUST: [number, number][] = [[1, 1], [16, 15], [9, 8], [6, 5], [5, 4], [4, 3], [45, 32], [3, 2], [8, 5], [5, 3], [9, 5], [15, 8], [2, 1]];

/** Pitch reference for the current Sa: the twelve svarasthanas with frequencies, and the notes around the starting octave. */
export function showPitchReference(app: App, scale?: Scale): void {
  const { prefs } = app;
  const sa = startingMidi(prefs.tonic, prefs.saOctave);
  const tradition = scale?.tradition ?? 'Carnatic';
  const inScale = new Set(scale ? Object.values(resolveDegrees(scale)) : []);
  const overlay = h('div', { class: 'overlay', onClick: (e) => { if (e.target === overlay) overlay.remove(); } });
  const play = (m: number) => h('button', { class: 'link small', onClick: () => void playTone(m, prefs.a4, 1) }, '▶');

  const sthanas = h('table', { class: 'ref-table' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Svarasthana'), h('th', {}, 'Note'), h('th', {}, 'Hz'), h('th', {}, 'Just vs app'), h('th', {}, ''))),
    h('tbody', {}, ...Array.from({ length: 13 }, (_, st) => {
      const m = sa + st;
      const et = Math.pow(2, st / 12);
      const just = JUST[st][0] / JUST[st][1];
      const diff = Math.round(1200 * Math.log2(just / et));
      const label = st === 12 ? 'Ṡa · upper Sa' : `${sthanaLabel(st, tradition)} · ${sthanaFullName(st, tradition)}`;
      const used = scale ? inScale.has(st % 12) : true;
      return h('tr', { class: used ? '' : 'ref-dim' }, h('td', {}, label), h('td', {}, westernName(m)), h('td', {}, hzFromMidi(m, prefs.a4).toFixed(1)), h('td', {}, diff === 0 ? '0' : `${diff > 0 ? '+' : ''}${diff}¢`), h('td', {}, play(m)));
    })));

  const lo = sa - 12, hi = sa + 19;
  const notes = h('table', { class: 'ref-table' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Note'), h('th', {}, 'Hz'), h('th', {}, ''))),
    h('tbody', {}, ...Array.from({ length: hi - lo + 1 }, (_, i) => {
      const m = lo + i;
      const mark = m === sa ? ' · your Sa' : m === sa + 12 ? ' · upper Sa' : m === sa - 12 ? ' · lower Sa' : '';
      return h('tr', { class: m === sa ? 'ref-sa' : '' }, h('td', {}, westernName(m) + mark), h('td', {}, hzFromMidi(m, prefs.a4).toFixed(1)), h('td', {}, play(m)));
    })));

  overlay.append(h('div', { class: 'card sheet ref' },
    h('div', { class: 'row space' }, h('h3', {}, 'Pitch reference'), h('button', { class: 'link', onClick: () => overlay.remove() }, 'Close')),
    h('div', { class: 'muted small' }, `Sa = ${westernPitchClassName(prefs.tonic)}, starting note ${westernName(sa)} (${hzFromMidi(sa, prefs.a4).toFixed(1)} Hz). A4 = ${prefs.a4} Hz.`),
    h('h4', {}, 'Svarasthanas from your Sa'),
    h('div', { class: 'muted tiny' }, `Each half-step multiplies the frequency by 1.0595. "Just vs app" is how far the traditional interval sits from the equal-tempered grid the app measures against; within 20 cents counts as on pitch.${scale ? ' Greyed rows are not in ' + scale.name + '.' : ''}`),
    sthanas,
    h('h4', {}, 'Notes around your starting octave'),
    notes,
    h('div', { class: 'muted tiny' }, 'Usual Sa: men C3–D3, women G3–A3. One octave doubles the frequency.'),
  ));
  document.body.append(overlay);
}
