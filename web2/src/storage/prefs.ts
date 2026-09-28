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
}

const KEY = 'raaga2.prefs';
const defaults: Prefs = { notation: 'indian', tonic: 7, saOctave: 2, a4: 440, practiceId: 'first_notes', apiKey: '', livePitchGuide: false, droneVolume: 0.5, bpm: {}, speed: {}, loop: true, saveTakes: true };

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
