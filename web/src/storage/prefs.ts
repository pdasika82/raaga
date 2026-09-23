import type { Notation } from '../core/pitch';

export interface Prefs {
  notation: Notation;
  tonic: number;
  a4: number;
  lessonId: string;
  apiKey: string;
}

const KEY = 'raaga.prefs';
const defaults: Prefs = { notation: 'indian', tonic: 0, a4: 440, lessonId: 'sarali_1', apiKey: '' };

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults };
  } catch {
    return { ...defaults };
  }
}

export function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode etc. */
  }
}
