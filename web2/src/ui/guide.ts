import { h } from './dom';

/** In-app version of docs/SCORE-GUIDE.md, shown as a sheet. */
export function showScoreGuide(): void {
  const overlay = h('div', { class: 'overlay', onClick: (e) => { if (e.target === overlay) overlay.remove(); } });
  const band = (cls: string, range: string, meaning: string, todo: string) =>
    h('div', { class: 'guide-band' }, h('span', { class: `badge badge-${cls} badge-sm` }, range), h('div', {}, h('div', {}, meaning), h('div', { class: 'muted small' }, todo)));
  overlay.append(
    h(
      'div',
      { class: 'card sheet guide' },
      h('div', { class: 'row space' }, h('h3', {}, 'Reading your score'), h('button', { class: 'link', onClick: () => overlay.remove() }, 'Close')),
      h('p', {}, 'The number from 0 to 100 combines two measurements of your pitch:'),
      h('ul', {},
        h('li', {}, h('b', {}, 'Tuning (70%). '), 'How close each moment of singing was to the nearest note of the scale. Within ±20 cents earns full credit, within ±50 partial, further earns nothing.'),
        h('li', {}, h('b', {}, 'Scale adherence (30%). '), 'The share of singing time on notes that belong to the lesson\'s scale or raga. This is the "On scale tones" line.'),
      ),
      band('good', '80+', 'Notes landed and stayed in tune.', 'Polish steadiness, then raise the tempo.'),
      band('mid', '55–79', 'Right notes mostly, but often 20–50 cents off, or a few strays outside the scale.', 'Slow down and hold each note until its pill turns green.'),
      band('low', '<55', 'Many notes never settled, or a good share were outside the scale.', 'Halve the tempo; check Sa with Find my Sa; hum each note before singing it.'),
      h('h4', {}, 'The lines under the score'),
      h('ul', {},
        h('li', {}, h('b', {}, 'Within ±20 / ±50 cents: '), 'share of singing time that close to a scale note. 100 cents is one half-step.'),
        h('li', {}, h('b', {}, 'On scale tones: '), 'share of time on an allowed note at all.'),
        h('li', {}, h('b', {}, 'Average deviation: '), 'mean distance from the nearest scale note. Under 15 is good; over 35 means notes landed between pitches.'),
        h('li', {}, h('b', {}, 'Steadiness: '), 'how much a held note wobbled. Under 8 cents is steady.'),
        h('li', {}, h('b', {}, 'Range: '), 'lowest and highest notes held long enough to count.'),
      ),
      h('h4', {}, 'What it does not measure'),
      h('p', { class: 'small' }, 'Only pitch. Tone, breath, rhythm, diction and ornaments are invisible to it, and it does not check that you sang the notes in the order the lesson asked. The coach feedback covers that.'),
      h('h4', {}, 'Comparing scores'),
      h('p', { class: 'small' }, 'Compare the same lesson at the same tempo: a fast, slurred run scores low even with the right notes, because each note never settles. Watch the trend over a week, and do not chase 100.'),
    ),
  );
  document.body.append(overlay);
}
