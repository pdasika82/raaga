import type { Lesson } from '@core/lesson';

/** A practice in the listen-and-repeat app: a lesson plus how it is presented. */
export interface Practice extends Lesson {
  subtitle: string;
  /** default tempo, one note per beat; 0 means the singer sets the pace */
  bpm: number;
  /** eyebrow for the main card */
  mode: 'LISTEN & REPEAT';
  /** text for the right-hand pulse card */
  pulse?: string;
}

const p = (id: string, title: string, subtitle: string, scaleId: string, sequence: string, bpm: number, instructions: string, pulse?: string): Practice => ({
  id, title, subtitle, scaleId, sequence, bpm, instructions, isBuiltIn: true, mode: 'LISTEN & REPEAT', pulse,
});

export const PRACTICES: Practice[] = [
  p('find_sa', 'Find Sa', 'One steady note', 'shankarabharanam', 'S S S S', 0, 'Sing Sa steadily for four beats. Return to it before every phrase.'),
  p('sa_pa', 'Sa & Pa', 'Hear the relationship', 'shankarabharanam', 'S P S P S', 0, 'Sa and Pa are the two fixed notes. Hear the interval, then sing it.'),
  p('first_notes', 'First notes', 'Sa–Ri–Ga–Ri–Sa', 'shankarabharanam', 'S R G R S', 0, 'Hear it once, then sing it back at the same pace.'),
  p('sarali_1', 'Sarali Varisai 1', 'Up the scale and back', 'shankarabharanam', "S R G M P D N S' S' N D P M G R S", 45, 'Listen to the ascent and descent. Then sing one swara per beat.',
    'Practise in Adi tala: a clap and three finger counts, then two clap-and-wave pairs. One swara per beat.'),
  p('sarali_2', 'Sarali Varisai 2', 'Step and climb', 'shankarabharanam', "S R S R S R G M S R G M P D N S' S' N S' N S' N D P S' N D P M G R S", 60, 'The same pattern up and down. Keep the pulse even.',
    'Adi tala again: eight beats per line. Count the claps before you start.'),
  p('mayamalavagowla', 'Mayamalavagowla', 'Up and back, small steps', 'mayamalavagowla', "S R G M P D N S' S' N D P M G R S", 45, 'Ri and Dha sit close to Sa and Pa. Listen for the small steps.'),
  p('mohanam', 'Mohanam', 'Five notes', 'mohanam', "S R G P D S' S' D P G R S", 50, 'There is no Ma or Ni. Jump cleanly over them.'),
];

export function practiceById(id: string): Practice {
  return PRACTICES.find((x) => x.id === id) ?? PRACTICES[2];
}

/** 0 = your pace: the next swara lights up when the current one is heard. */
export const BPM_OPTIONS = [0, 40, 45, 50, 60, 72, 90];
export const YOUR_PACE = 0;
