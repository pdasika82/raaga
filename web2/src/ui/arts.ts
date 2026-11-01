import type { App, Route } from './app';
import { auth } from '../auth/service';
import { h } from './dom';

export const isMusicRoute = (route: Route): boolean => ['practice', 'free', 'sessions', 'session', 'settings', 'grade-raaga'].includes(route);

export function artsBar(app: App, route: Route): HTMLElement {
  const link = (target: Route, title: string, selected: boolean) => h('button', {
    class: `arts-nav-link${selected ? ' active' : ''}`, 'aria-current': selected ? 'page' : undefined, onClick: () => app.navigate(target),
  }, title);
  const user = auth.state.user;
  return h('header', { class: 'arts-header' },
    h('button', { class: 'arts-brand', onClick: () => app.navigate('arts'), 'aria-label': 'LMS for Arts home' },
      h('span', { class: 'arts-mark', 'aria-hidden': 'true' }, 'a'), h('span', {}, 'LMS for Arts')),
    h('nav', { class: 'arts-nav', 'aria-label': 'Art modules' },
      link('arts', 'Explore', route === 'arts'), link('practice', 'Raaga', isMusicRoute(route)), link('kuchipudi', 'Kuchipudi', route === 'kuchipudi' || route === 'grade-kuchipudi')),
    h('button', { class: 'arts-account', onClick: () => app.navigate('account'), 'aria-label': user ? 'Your account' : 'Sign in' },
      user ? h('span', { class: 'account-avatar small', 'aria-hidden': 'true' }, (user.displayName || user.email || 'A').slice(0, 1).toUpperCase()) : null,
      h('span', {}, user ? 'My account' : 'Sign in')));
}

export function artsHome(app: App): HTMLElement {
  return h('div', { class: 'arts-page arts-home' },
    h('section', { class: 'arts-intro' }, h('span', { class: 'eyebrow' }, 'A LITTLE PRACTICE. A LIFELONG ART.'),
      h('h1', {}, 'Find your rhythm.', h('br'), h('span', {}, 'Make it a practice.')),
      h('p', {}, 'A space to begin, return, and grow. Explore music and dance, then bring a little of what you learn into every day.')),
    h('div', { class: 'arts-section-heading' }, h('h2', {}, 'Choose your art'), h('span', { class: 'muted small' }, 'Start wherever you are')),
    h('section', { class: 'arts-modules', 'aria-label': 'Available art modules' },
      h('article', { class: 'art-module music-module' },
        h('div', { class: 'art-visual music-visual', 'aria-hidden': 'true' }, h('div', { class: 'music-notes' }, ...['Sa', 'Ri', 'Ga', 'Ma', 'Pa'].map((note, index) => h('span', { style: `--note:${index}` }, note)))),
        h('div', { class: 'art-module-body' }, h('span', { class: 'eyebrow' }, 'MUSIC · CARNATIC PRACTICE'), h('h2', {}, 'Raaga'),
          h('p', {}, 'Listen closely. Sing it back. Find your voice, one swara at a time.'),
          h('div', { class: 'art-features' }, h('span', {}, 'Live pitch feedback'), h('span', {}, 'Guided exercises')),
          h('button', { class: 'btn', onClick: () => app.navigate('practice') }, 'Practice with Raaga →'))),
      h('article', { class: 'art-module dance-module' },
        h('div', { class: 'art-visual dance-visual', 'aria-hidden': 'true' }, h('div', { class: 'dance-rings' }, h('span'), h('span'), h('span')), h('span', { class: 'dance-visual-word' }, 'Move. Repeat. Remember.')),
        h('div', { class: 'art-module-body' }, h('span', { class: 'eyebrow' }, 'DANCE · BEGINNER PRACTICE'), h('h2', {}, 'Kuchipudi'),
          h('p', {}, 'Carry your class into your day. Watch, practice, and reflect on one movement at a time.'),
          h('div', { class: 'art-features' }, h('span', {}, '6 practice guides'), h('span', {}, 'Video self-review')),
          h('button', { class: 'btn', onClick: () => app.navigate('kuchipudi') }, 'Explore Kuchipudi →')))),
    h('section', { class: 'arts-principles' },
      h('div', {}, h('span', { class: 'eyebrow' }, '01 / BEGIN'), h('h3', {}, 'Start small.'), h('p', {}, 'A few minutes and a little curiosity are enough to begin.')),
      h('div', {}, h('span', { class: 'eyebrow' }, '02 / PRACTICE'), h('h3', {}, 'Return often.'), h('p', {}, 'Repeat a phrase or a movement. Notice what feels clearer each time.')),
      h('div', {}, h('span', { class: 'eyebrow' }, '03 / GROW'), h('h3', {}, 'Learn with a teacher.'), h('p', {}, 'Bring their guidance home, and bring your questions to your next class.'))));
}
