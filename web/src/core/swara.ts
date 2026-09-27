import { pitchClass, westernName, westernPitchClassName, type Notation } from './pitch';
import type { Scale, Tradition } from './scale';

/** Swara families in scale order. */
export const FAMILIES = ['S', 'R', 'G', 'M', 'P', 'D', 'N'] as const;
export type Family = (typeof FAMILIES)[number];

const FAMILY_NAMES_CARNATIC: Record<Family, string> = { S: 'Sa', R: 'Ri', G: 'Ga', M: 'Ma', P: 'Pa', D: 'Dha', N: 'Ni' };
const FAMILY_NAMES_HINDUSTANI: Record<Family, string> = { S: 'Sa', R: 'Re', G: 'Ga', M: 'Ma', P: 'Pa', D: 'Dha', N: 'Ni' };

export function familyName(fam: Family, tradition: Tradition = 'Carnatic'): string {
  return tradition === 'Hindustani' ? FAMILY_NAMES_HINDUSTANI[fam] : FAMILY_NAMES_CARNATIC[fam];
}

/** Twelve svarasthanas: short label and full name, per tradition. */
const CARNATIC: [string, string][] = [
  ['Sa', 'Shadjam'], ['Ri₁', 'Shuddha Rishabham'], ['Ri₂', 'Chatusruti Rishabham'], ['Ga₂', 'Sadharana Gandharam'],
  ['Ga₃', 'Antara Gandharam'], ['Ma₁', 'Shuddha Madhyamam'], ['Ma₂', 'Prati Madhyamam'], ['Pa', 'Panchamam'],
  ['Dha₁', 'Shuddha Dhaivatam'], ['Dha₂', 'Chatusruti Dhaivatam'], ['Ni₂', 'Kaisiki Nishadam'], ['Ni₃', 'Kakali Nishadam'],
];
const HINDUSTANI: [string, string][] = [
  ['Sa', 'Shadja'], ['komal Re', 'komal Rishabh'], ['Re', 'shuddha Rishabh'], ['komal Ga', 'komal Gandhar'],
  ['Ga', 'shuddha Gandhar'], ['Ma', 'shuddha Madhyam'], ['tivra Ma', 'tivra Madhyam'], ['Pa', 'Pancham'],
  ['komal Dha', 'komal Dhaivat'], ['Dha', 'shuddha Dhaivat'], ['komal Ni', 'komal Nishad'], ['Ni', 'shuddha Nishad'],
];

/** Short svarasthana label for a semitone above Sa, e.g. "Ri₂" or "komal Re". */
export function sthanaLabel(st: number, tradition: Tradition): string {
  const pc = pitchClass(st);
  return tradition === 'Hindustani' ? HINDUSTANI[pc][0] : CARNATIC[pc][0];
}

/** Full name, e.g. "Chatusruti Rishabham". */
export function sthanaFullName(st: number, tradition: Tradition): string {
  const pc = pitchClass(st);
  return tradition === 'Hindustani' ? HINDUSTANI[pc][1] : CARNATIC[pc][1];
}

/** Which semitones each family may occupy. */
const FAMILY_RANGE: Record<Family, number[]> = { S: [0], R: [1, 2, 3], G: [2, 3, 4], M: [5, 6], P: [7], D: [8, 9, 10], N: [9, 10, 11] };

/** Map each swara family to the semitone this scale uses for it. Missing families are absent. */
export function resolveDegrees(scale: Scale): Partial<Record<Family, number>> {
  const out: Partial<Record<Family, number>> = {};
  const used = new Set<number>();
  for (const fam of FAMILIES) {
    const candidates = FAMILY_RANGE[fam].filter((st) => scale.intervals.includes(st) && !used.has(st));
    if (!candidates.length) continue;
    const st = fam === 'G' || fam === 'N' ? candidates[candidates.length - 1] : candidates[0];
    out[fam] = st;
    used.add(st);
  }
  return out;
}

export interface Token {
  family: Family;
  /** octave relative to the starting Sa: -1 lower, 0 middle, +1 upper */
  octave: number;
  raw: string;
  /** counts the note is held for; a standalone "," (karvai) in the sequence adds one */
  units: number;
}

/** Parse "S", "S'" (upper), "N," (lower). Dots (Ṡ, Ṇ) are also accepted. */
export function parseToken(raw: string): Token | null {
  const t = raw.trim().normalize('NFD');
  if (!t) return null;
  const base = t[0].toUpperCase();
  if (!FAMILIES.includes(base as Family)) return null;
  let octave = 0;
  if (t.includes("'") || t.includes('̇') || t.includes('˙')) octave = 1;
  if (t.includes(',') || t.includes('̣')) octave = -1;
  return { family: base as Family, octave, raw, units: 1 };
}

/** Parse a sequence. Bar lines are ignored; a standalone "," holds the previous note one more count. */
export function parseSequence(text: string): Token[] {
  const out: Token[] = [];
  for (const piece of text.split(/[\s|]+/)) {
    if (!piece) continue;
    if (piece === ',') { if (out.length) out[out.length - 1].units++; continue; }
    const t = parseToken(piece);
    if (t) out.push(t);
  }
  return out;
}

/** Beginner tile label: "Sa", "Ri", "Ṡa" (upper), "Ṣa" (lower); Western letters in Western notation. */
export function tokenLabel(tok: Token, notation: Notation, tonic: number, scale: Scale): string {
  if (notation === 'western') {
    const st = resolveDegrees(scale)[tok.family];
    if (st == null) return '?';
    const name = westernPitchClassName(tonic + st);
    return tok.octave > 0 ? `${name}′` : tok.octave < 0 ? `${name}ˌ` : name;
  }
  const name = familyName(tok.family, scale.tradition);
  const mark = tok.octave > 0 ? '̇' : tok.octave < 0 ? '̣' : '';
  return (name[0] + mark + name.slice(1)).normalize('NFC');
}

/** Spoken name: "Ri", "upper Sa", "lower Ni". */
export function tokenSpoken(tok: Token, notation: Notation, tonic: number, scale: Scale): string {
  if (notation === 'western') return tokenLabel(tok, notation, tonic, scale);
  const name = familyName(tok.family, scale.tradition);
  return tok.octave > 0 ? `upper ${name}` : tok.octave < 0 ? `lower ${name}` : name;
}

/** Exact svarasthana of the scale's degree for a family, e.g. Shankarabharanam R -> "Ri₂". */
export function degreeSthana(fam: Family, scale: Scale): string | null {
  const st = resolveDegrees(scale)[fam];
  return st == null ? null : sthanaLabel(st, scale.tradition);
}

/**
 * Name for any semitone relative to Sa. Degrees of the scale get the plain family name ("Ri");
 * other svarasthanas get their exact label ("Ri₁"), which the caller may mark as outside the scale.
 */
export function describeSemitone(st: number, scale: Scale, notation: Notation, tonic: number): string {
  const pc = pitchClass(st);
  if (notation === 'western') return westernPitchClassName(tonic + pc);
  const degrees = resolveDegrees(scale);
  const fam = (Object.keys(degrees) as Family[]).find((f) => degrees[f] === pc);
  return fam ? familyName(fam, scale.tradition) : sthanaLabel(pc, scale.tradition);
}

export function isScaleDegree(st: number, scale: Scale): boolean {
  return scale.intervals.includes(pitchClass(st));
}

/**
 * What the detector heard, worded with appropriate confidence:
 * "near Sa", "near Ri₁ (outside this scale)", or "between Ri₁ and Ri₂" when close to halfway.
 */
export function detectedLabel(midi: number, scale: Scale, notation: Notation, tonic: number): string {
  const frac = midi - Math.floor(midi);
  if (Math.abs(frac - 0.5) <= 0.15) {
    const lo = Math.floor(midi), hi = lo + 1;
    return `between ${describeSemitone(lo - tonic, scale, notation, tonic)} and ${describeSemitone(hi - tonic, scale, notation, tonic)}`;
  }
  const chroma = Math.round(midi);
  const name = describeSemitone(chroma - tonic, scale, notation, tonic);
  return isScaleDegree(chroma - tonic, scale) ? `near ${name}` : `near ${name} (outside this scale)`;
}

/** Absolute MIDI note for a token given the starting Sa. */
export function tokenMidi(tok: Token, scale: Scale, saMidi: number): number | null {
  const st = resolveDegrees(scale)[tok.family];
  if (st == null) return null;
  return saMidi + st + tok.octave * 12;
}

export function midiLabel(midi: number, notation: Notation, tonic: number, scale: Scale): string {
  if (notation === 'western') return westernName(midi);
  return describeSemitone(midi - tonic, scale, notation, tonic);
}

/** "Ri₂: Chatusruti Rishabham · Ga₃: Antara Gandharam · …" for the scale's variable degrees. */
export function scaleGlossary(scale: Scale): string {
  if (scale.tradition === 'Western') return '';
  const degrees = resolveDegrees(scale);
  return (Object.entries(degrees) as [Family, number][])
    .filter(([fam]) => fam !== 'S' && fam !== 'P')
    .map(([, st]) => `${sthanaLabel(st, scale.tradition)}: ${sthanaFullName(st, scale.tradition)}`)
    .join(' · ');
}

/** Starting note for Sa from a pitch class and an octave number, e.g. (7, 3) -> G3 = 55. */
export function startingMidi(tonic: number, octave: number): number {
  return 12 * (octave + 1) + pitchClass(tonic);
}
