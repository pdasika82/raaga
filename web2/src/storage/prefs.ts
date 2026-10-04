import type { Notation } from '@core/pitch';

export interface Prefs {
  notation: Notation;
  tonic: number;
  saOctave: number;
  a4: number;
  practiceId: string;
  apiKey: string;
  livePitchGuide: boolean;
  droneVolume: number;
  /** bpm chosen per practice id */
  bpm: Record<string, number>;
  /** speed chosen per practice id: 1, 2 or 3 */
  speed: Record<string, 1 | 2 | 3>;
  /** timed mode: repeat the phrase until Stop, keep the best pass */
  loop: boolean;
  /** save each take under Sessions */
  saveTakes: boolean;
  /** play the tone guide alongside the singer during Your turn (for headphones) */
  playAlong: boolean;
  /** your pace: count the next swara only after a pause (else after a change of note) */
  advanceOnPause: boolean;
  /** raga for First steps and Sarali Swaralu */
  beginnerRaga: 'shankarabharanam' | 'mayamalavagowla';
}

const KEY = 'raaga2.prefs';
const defaults: Prefs = { notation: 'indian', tonic: 7, saOctave: 2, a4: 440, practiceId: 'first_notes', apiKey: '', livePitchGuide: false, droneVolume: 0.5, bpm: {}, speed: {}, loop: true, saveTakes: true, playAlong: false, advanceOnPause: true, beginnerRaga: 'shankarabharanam' };

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
    /* private mode */
  }
}
