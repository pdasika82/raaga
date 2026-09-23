import { pitchClass, SWARA_NAMES, westernPitchClassName, type Notation } from './pitch';

export type Tradition = 'Western' | 'Carnatic' | 'Hindustani';
export const TRADITIONS: Tradition[] = ['Western', 'Carnatic', 'Hindustani'];

export interface Scale {
  id: string;
  name: string;
  tradition: Tradition;
  /** Semitone offsets from the tonic, sorted, 0..11 */
  intervals: number[];
  note?: string;
}

export type Accuracy = 'inTune' | 'close' | 'off' | 'offScale';

/** How a single sung pitch relates to a scale. */
export interface ScaleReading {
  midi: number;
  chromaticMidi: number;
  chromaticCents: number;
  semitoneFromTonic: number;
  isScaleTone: boolean;
  scaleMidi: number;
  scaleCents: number;
  /** Cents shown on the tuner: relative to the scale tone if on one, else to the chromatic note. */
  displayCents: number;
  accuracy: Accuracy;
}

function s(id: string, name: string, tradition: Tradition, intervals: number[], note?: string): Scale {
  return { id, name, tradition, intervals: [...new Set(intervals.map(pitchClass))].sort((a, b) => a - b), note };
}

export const CHROMATIC = s('chromatic', 'Chromatic (any note)', 'Western', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

export const SCALES: Scale[] = [
  s('major', 'Major (Ionian)', 'Western', [0, 2, 4, 5, 7, 9, 11]),
  s('natural_minor', 'Natural minor (Aeolian)', 'Western', [0, 2, 3, 5, 7, 8, 10]),
  s('harmonic_minor', 'Harmonic minor', 'Western', [0, 2, 3, 5, 7, 8, 11]),
  s('melodic_minor', 'Melodic minor (asc.)', 'Western', [0, 2, 3, 5, 7, 9, 11]),
  s('dorian', 'Dorian', 'Western', [0, 2, 3, 5, 7, 9, 10]),
  s('phrygian', 'Phrygian', 'Western', [0, 1, 3, 5, 7, 8, 10]),
  s('lydian', 'Lydian', 'Western', [0, 2, 4, 6, 7, 9, 11]),
  s('mixolydian', 'Mixolydian', 'Western', [0, 2, 4, 5, 7, 9, 10]),
  s('major_pentatonic', 'Major pentatonic', 'Western', [0, 2, 4, 7, 9]),
  s('minor_pentatonic', 'Minor pentatonic', 'Western', [0, 3, 5, 7, 10]),
  s('blues', 'Blues', 'Western', [0, 3, 5, 6, 7, 10]),
  CHROMATIC,
  s('shankarabharanam', 'Shankarabharanam', 'Carnatic', [0, 2, 4, 5, 7, 9, 11], '29th melakarta; same notes as the major scale'),
  s('kalyani', 'Kalyani', 'Carnatic', [0, 2, 4, 6, 7, 9, 11], '65th melakarta; prati madhyama'),
  s('kharaharapriya', 'Kharaharapriya', 'Carnatic', [0, 2, 3, 5, 7, 9, 10], '22nd melakarta'),
  s('harikambhoji', 'Harikambhoji', 'Carnatic', [0, 2, 4, 5, 7, 9, 10], '28th melakarta'),
  s('mayamalavagowla', 'Mayamalavagowla', 'Carnatic', [0, 1, 4, 5, 7, 8, 11], "15th melakarta; the beginner's raga"),
  s('natabhairavi', 'Natabhairavi', 'Carnatic', [0, 2, 3, 5, 7, 8, 10], '20th melakarta'),
  s('keeravani', 'Keeravani', 'Carnatic', [0, 2, 3, 5, 7, 8, 11], '21st melakarta'),
  s('charukesi', 'Charukesi', 'Carnatic', [0, 2, 4, 5, 7, 8, 10], '26th melakarta'),
  s('hanumatodi', 'Hanumatodi', 'Carnatic', [0, 1, 3, 5, 7, 8, 10], '8th melakarta'),
  s('mohanam', 'Mohanam', 'Carnatic', [0, 2, 4, 7, 9], 'Audava (pentatonic) janya of Harikambhoji'),
  s('hamsadhwani', 'Hamsadhwani', 'Carnatic', [0, 2, 4, 7, 11], 'Pentatonic janya of Shankarabharanam'),
  s('hindolam', 'Hindolam', 'Carnatic', [0, 3, 5, 8, 10], 'Pentatonic janya of Natabhairavi'),
  s('abhogi', 'Abhogi', 'Carnatic', [0, 2, 3, 5, 9], 'Pentatonic janya of Kharaharapriya'),
  s('sriranjani', 'Sriranjani', 'Carnatic', [0, 2, 3, 5, 9, 10], 'Shadava janya of Kharaharapriya'),
  s('madhyamavati', 'Madhyamavati', 'Carnatic', [0, 2, 5, 7, 10], 'Pentatonic janya of Kharaharapriya'),
  s('bilawal', 'Bilawal', 'Hindustani', [0, 2, 4, 5, 7, 9, 11], 'Thaat; all shuddha swaras'),
  s('yaman', 'Yaman (Kalyan)', 'Hindustani', [0, 2, 4, 6, 7, 9, 11], 'Tivra Ma'),
  s('kafi', 'Kafi', 'Hindustani', [0, 2, 3, 5, 7, 9, 10], 'Komal Ga and Ni'),
  s('khamaj', 'Khamaj', 'Hindustani', [0, 2, 4, 5, 7, 9, 10], 'Komal Ni descending'),
  s('bhairav', 'Bhairav', 'Hindustani', [0, 1, 4, 5, 7, 8, 11], 'Komal Re and Dha'),
  s('bhairavi', 'Bhairavi', 'Hindustani', [0, 1, 3, 5, 7, 8, 10], 'All komal swaras'),
  s('asavari', 'Asavari', 'Hindustani', [0, 2, 3, 5, 7, 8, 10], 'Komal Ga, Dha, Ni'),
  s('bhoop', 'Bhoop (Bhupali)', 'Hindustani', [0, 2, 4, 7, 9], 'Pentatonic'),
  s('durga', 'Durga', 'Hindustani', [0, 2, 5, 7, 9], 'Pentatonic'),
  s('malkauns', 'Malkauns', 'Hindustani', [0, 3, 5, 8, 10], 'Pentatonic; komal Ga, Dha, Ni'),
  s('des', 'Des', 'Hindustani', [0, 2, 4, 5, 7, 9, 10, 11], 'Uses both Ni; shuddha Ni ascending, komal descending'),
];

export function scaleById(id: string): Scale {
  return SCALES.find((x) => x.id === id) ?? CHROMATIC;
}

export function scaleDisplayName(scale: Scale): string {
  return `${scale.name} (${scale.tradition})`;
}

export function degreeName(scale: Scale, semitone: number, tonic: number, notation: Notation): string {
  const st = pitchClass(semitone);
  return notation === 'indian' ? SWARA_NAMES[st] : westernPitchClassName(tonic + st);
}

/** Both names, e.g. "R (D)". */
export function degreeLabel(semitone: number, tonic: number): string {
  const st = pitchClass(semitone);
  return `${SWARA_NAMES[st]} (${westernPitchClassName(tonic + st)})`;
}

export function reading(scale: Scale, midi: number, tonic: number): ScaleReading {
  const chroma = Math.round(midi);
  const chromaticCents = (midi - chroma) * 100;
  const st = pitchClass(chroma - tonic);
  const isScaleTone = scale.intervals.includes(st);

  let best = chroma;
  let bestDist = Infinity;
  for (let m = chroma - 12; m <= chroma + 12; m++) {
    if (!scale.intervals.includes(pitchClass(m - tonic))) continue;
    const dist = Math.abs(midi - m);
    if (dist < bestDist) {
      bestDist = dist;
      best = m;
    }
  }
  const scaleCents = (midi - best) * 100;
  const displayCents = isScaleTone ? scaleCents : chromaticCents;
  const c = Math.abs(displayCents);
  const accuracy: Accuracy = !isScaleTone ? 'offScale' : c <= 10 ? 'inTune' : c <= 25 ? 'close' : 'off';
  return { midi, chromaticMidi: chroma, chromaticCents, semitoneFromTonic: st, isScaleTone, scaleMidi: best, scaleCents, displayCents, accuracy };
}
