import { CHROMATIC, scaleById, type Scale } from './scale';

export interface Lesson {
  id: string;
  title: string;
  instructions: string;
  scaleId: string;
  isBuiltIn: boolean;
  /** Swara tokens, e.g. "S R G M P D N S'" (' = upper octave, , = lower). Absent for free singing. */
  sequence?: string;
  /** seconds a note must be held to count (default 0.6) */
  hold?: number;
}

export function lessonScale(l: Lesson): Scale {
  return scaleById(l.scaleId) ?? CHROMATIC;
}

const b = (id: string, title: string, instructions: string, scaleId: string, sequence?: string, hold?: number): Lesson => ({ id, title, instructions, scaleId, isBuiltIn: true, sequence, hold });

const UP_DOWN = "S R G M P D N S' S' N D P M G R S";

export const FREE_PRACTICE: Lesson = b('free', 'Free practice', 'Sing anything. Every note is accepted; the tuner shows the nearest chromatic note.', 'chromatic');

export const BUILT_IN_LESSONS: Lesson[] = [
  b('first_notes', 'First notes', 'A short exercise to practise your first three swaras: Sa, Ri, Ga and back. Hold each note for 1 second.', 'shankarabharanam', 'S R G R S', 1),
  b('first_notes_mmg', 'First notes (Mayamalavagowla)', 'The same three swaras in Mayamalavagowla, another common starting raga. Ri sits closer to Sa here.', 'mayamalavagowla', 'S R G R S', 1),
  b('sustain_sa', 'Sustain Sa', "Sa three times, six seconds each, on 'aa'. Aim for a straight, unwavering tone.", 'shankarabharanam', 'S S S', 6),
  b('sarali_1', 'Sarali Varisai 1', 'Sa Ri Ga Ma Pa Dha Ni Ṡa ascending, then back down.', 'shankarabharanam', UP_DOWN, 0.8),
  b('sarali_2', 'Sarali Varisai 2', 'Sa Ri Sa Ri Sa Ri Ga Ma, Sa Ri Ga Ma Pa Dha Ni Ṡa; then the same pattern down. Keep a steady tempo.', 'shankarabharanam', "S R S R S R G M S R G M P D N S' S' N S' N S' N D P S' N D P M G R S", 0.6),
  b('janta_1', 'Janta Varisai 1', 'Each note twice, up and down. Give the second of each pair a slight stress.', 'shankarabharanam', "S S R R G G M M P P D D N N S' S' S' S' N N D D P P M M G G R R S S", 0.5),
  b('mayamalavagowla_scale', 'Mayamalavagowla arohana / avarohana', 'Up and down the scale. Ri and Dha sit close to Sa and Pa; listen for the small steps.', 'mayamalavagowla', UP_DOWN, 0.8),
  b('mohanam_scale', 'Mohanam arohana / avarohana', 'Sa Ri Ga Pa Dha Ṡa and back. There is no Ma or Ni; jump cleanly over them.', 'mohanam', "S R G P D S' S' D P G R S", 0.8),
  b('kalyani_scale', 'Kalyani arohana / avarohana', 'Up and down with the raised Ma (Prati Madhyamam). It sits just a half-step below Pa.', 'kalyani', UP_DOWN, 0.8),
  b('yaman_scale', 'Yaman aroha / avaroha', 'Ni Re Ga Ma Dha Ni Sa up, skipping Sa and Pa; Sa Ni Dha Pa Ma Ga Re Sa down. Tivra Ma throughout.', 'yaman', "N, R G M D N S' S' N D P M G R S", 0.8),
  b('major_scale', 'Major scale', "Sing do re mi fa sol la ti do ascending and descending on 'ah'. One beat per note, then again at half speed.", 'major', UP_DOWN, 0.8),
  b('minor_scale', 'Natural minor scale', "Sing the natural minor scale ascending and descending on 'oo'. Listen for the flat 3rd, 6th and 7th.", 'natural_minor', UP_DOWN, 0.8),
  b('major_pentatonic', 'Major pentatonic', 'Sing 1 2 3 5 6 8 up and down, then skip: 1 3 5 8 5 3 1.', 'major_pentatonic', "S R G P D S' S' D P G R S S G P S' P G S", 0.7),
  b('arpeggio_major', 'Major arpeggio', "Sing 1 3 5 8 5 3 1 (do mi sol do sol mi do) on 'ah'. Land each note cleanly without sliding.", 'major', "S G P S' P G S", 0.8),
];
