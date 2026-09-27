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
  /** speeds available: 1 = one swara per beat, 2 = two, 3 = four */
  speeds?: (1 | 2 | 3)[];
  /** grouping in the practice list */
  group: string;
}

const p = (id: string, title: string, subtitle: string, scaleId: string, sequence: string, bpm: number, instructions: string, pulse?: string): Practice => ({
  id, title, subtitle, scaleId, sequence, bpm, instructions, isBuiltIn: true, mode: 'LISTEN & REPEAT', pulse, group: 'First steps',
});

const ADI = 'Adi tala: a clap and three finger counts, then two clap-and-wave pairs, eight beats in all. Keep the same beat at every speed; the swaras get faster, the clap does not.';

/** Sarali Varisai 1–14 in Shankarabharanam, written in first speed. "," holds the previous swara one more count. */
const v = (n: number, subtitle: string, sequence: string): Practice => ({
  id: `sarali_${n}`, title: `Sarali Varisai ${n}`, subtitle, scaleId: 'shankarabharanam', sequence, bpm: 45,
  instructions: 'Listen at the chosen speed, then sing it back. First speed is one swara per beat, second two, third four.',
  isBuiltIn: true, mode: 'LISTEN & REPEAT', pulse: ADI, speeds: [1, 2, 3], group: 'Sarali Varisai',
});

export const SARALI: Practice[] = [
  v(1, 'Up the scale and back', "S R G M P D N S' | S' N D P M G R S"),
  v(2, 'Step and climb', "S R S R S R G M | S R G M P D N S' | S' N S' N S' N D P | S' N D P M G R S"),
  v(3, 'Three-note turns', "S R G S R G S R | S R G M P D N S' | S' N D S' N D S' N | S' N D P M G R S"),
  v(4, 'Four notes twice', "S R G M S R G M | S R G M P D N S' | S' N D P S' N D P | S' N D P M G R S"),
  v(5, 'Rest on Pa and Ma', "S R G M P , S R | S R G M P D N S' | S' N D P M , S' N | S' N D P M G R S"),
  v(6, 'Six notes, then two', "S R G M P D S R | S R G M P D N S' | S' N D P M G S' N | S' N D P M G R S"),
  v(7, 'Rest on Ni and Ri', "S R G M P D N , | S R G M P D N S' | S' N D P M G R , | S' N D P M G R S"),
  v(8, 'Turn at Pa', "S R G M P M G R | S R G M P D N S' | S' N D P M P D N | S' N D P M G R S"),
  v(9, 'Turn at Dha and Ga', "S R G M P M D P | S R G M P D N S' | S' N D P M P G M | S' N D P M G R S"),
  v(10, 'Long Pa', "S R G M P , G M | P , , , P , , , | G M P M N D P M | G M P G M G R S"),
  v(11, 'From the top, with rests', "S' , N D N , D P | D , P M P , P , | G M P D N D P M | G M P G M G R S"),
  v(12, 'From the top, doubled', "S' S' N D N N D P | D D P M P , P , | G M P D N D P M | G M P G M G R S"),
  v(13, 'Neighbours', "S R G R G , G M | P M P , D P D , | M P D P D N D P | M P D P M G R S"),
  v(14, 'Rests throughout', "S R G M P , P , | D D P , M M P , | D N S' , S' N D P | S' N D P M G R S"),
];

export const PRACTICES: Practice[] = [
  p('find_sa', 'Find Sa', 'One steady note', 'shankarabharanam', 'S S S S', 0, 'Sing Sa steadily for four beats. Return to it before every phrase.'),
  p('sa_pa', 'Sa & Pa', 'Hear the relationship', 'shankarabharanam', 'S P S P S', 0, 'Sa and Pa are the two fixed notes. Hear the interval, then sing it.'),
  p('first_notes', 'First notes', 'Sa–Ri–Ga–Ri–Sa', 'shankarabharanam', 'S R G R S', 0, 'Hear it once, then sing it back at the same pace.'),
  ...SARALI,
  { ...p('mayamalavagowla', 'Mayamalavagowla', 'Up and back, small steps', 'mayamalavagowla', "S R G M P D N S' | S' N D P M G R S", 45, 'Ri and Dha sit close to Sa and Pa. Listen for the small steps.'), group: 'Other ragas', speeds: [1, 2, 3] },
  { ...p('mohanam', 'Mohanam', 'Five notes', 'mohanam', "S R G P D S' | S' D P G R S", 50, 'There is no Ma or Ni. Jump cleanly over them.'), group: 'Other ragas', speeds: [1, 2, 3] },
];

export const NOTES_PER_BEAT: Record<1 | 2 | 3, number> = { 1: 1, 2: 2, 3: 4 };

export function practiceById(id: string): Practice {
  return PRACTICES.find((x) => x.id === id) ?? PRACTICES[2];
}

/** 0 = your pace: the next swara lights up when the current one is heard. */
export const BPM_OPTIONS = [0, 40, 45, 50, 60, 72, 90];
export const YOUR_PACE = 0;
