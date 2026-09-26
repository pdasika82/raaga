import type { Notation } from '../core/pitch';

export interface Prefs {
  notation: Notation;
  tonic: number;
  /** octave number of the starting Sa, e.g. 3 for G3 */
  saOctave: number;
  a4: number;
  lessonId: string;
  apiKey: string;
  onboarded: boolean;
}

const KEY = 'raaga.prefs';
const defaults: Prefs = { notation: 'indian', tonic: 0, saOctave: 3, a4: 440, lessonId: 'first_notes', apiKey: '', onboarded: false };

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
