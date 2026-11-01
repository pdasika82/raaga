import { h } from './dom';

export function youtubeSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query.trim())}`;
}

/** Search links are explicit, live searches, not invented video recommendations. */
export function exampleSearch(topic: string): HTMLElement {
  const query = h('input', { class: 'input', type: 'search', value: topic, 'aria-label': 'Search YouTube examples', maxlength: 240 });
  const link = h('a', { class: 'btn btn-secondary', href: youtubeSearchUrl(topic), target: '_blank', rel: 'noopener noreferrer' }, 'Find examples on YouTube ↗');
  query.addEventListener('input', () => { link.href = youtubeSearchUrl(query.value || topic); });
  return h('section', { class: 'card example-search' }, h('h3', {}, 'Learn from an example'),
    h('p', { class: 'small muted' }, 'Find a demonstration for this lesson. Refine the search with a teacher, step, or exercise name.'),
    query, link, h('p', { class: 'tiny muted' }, 'Opens YouTube search in a new tab. Choose a teacher-led example that matches your class; search results are not teacher-approved.'));
}
