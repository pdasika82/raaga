import { CHROMATIC, scaleById, type Scale } from './scale';

export interface Lesson {
  id: string;
  title: string;
  instructions: string;
  scaleId: string;
  isBuiltIn: boolean;
}

export function lessonScale(l: Lesson): Scale {
  return scaleById(l.scaleId) ?? CHROMATIC;
}

const b = (id: string, title: string, instructions: string, scaleId: string): Lesson => ({ id, title, instructions, scaleId, isBuiltIn: true });

export const FREE_PRACTICE: Lesson = b('free', 'Free practice', 'Sing anything. Every note is accepted; the tuner shows the nearest chromatic note.', 'chromatic');

export const BUILT_IN_LESSONS: Lesson[] = [
  b('sustain_sa', 'Sustain Sa', "Hold Sa (the tonic) steadily on 'aa' for 8–10 seconds. Rest, then repeat three times. Aim for a straight, unwavering tone.", 'shankarabharanam'),
  b('sarali_1', 'Sarali Varisai 1', 'Sing S R G M P D N Ṡ ascending, then Ṡ N D P M G R S descending. Hold each note for about one second. Repeat twice.', 'shankarabharanam'),
  b('sarali_2', 'Sarali Varisai 2', 'S R S R S R G M | S R G M P D N Ṡ || Ṡ N Ṡ N Ṡ N D P | Ṡ N D P M G R S. Keep a steady tempo.', 'shankarabharanam'),
  b('janta_1', 'Janta Varisai 1', 'Sing each note twice: S S R R G G M M P P D D N N Ṡ Ṡ, then back down. Give the second of each pair a slight stress.', 'shankarabharanam'),
  b('mayamalavagowla_scale', 'Mayamalavagowla arohana / avarohana', 'S r G m P d N Ṡ ascending, then Ṡ N d P m G r S descending. Notice the small steps S–r and P–d.', 'mayamalavagowla'),
  b('mohanam_scale', 'Mohanam arohana / avarohana', 'S R G P D Ṡ ascending, then Ṡ D P G R S descending. Skip M and N cleanly.', 'mohanam'),
  b('kalyani_scale', 'Kalyani arohana / avarohana', 'S R G M P D N Ṡ and back, using the raised (prati) Ma. Compare M against P: it should sit just a semitone below.', 'kalyani'),
  b('yaman_scale', 'Yaman aroha / avaroha', 'Ṇ R G M̄ D N Ṡ ascending (Sa and Pa are skipped on the way up), Ṡ N D P M̄ G R S descending. Tivra Ma throughout.', 'yaman'),
  b('major_scale', 'Major scale', "Sing do re mi fa sol la ti do ascending and descending on 'ah'. One beat per note, then again at half speed.", 'major'),
  b('minor_scale', 'Natural minor scale', "Sing the natural minor scale ascending and descending on 'oo'. Listen for the flat 3rd, 6th and 7th.", 'natural_minor'),
  b('major_pentatonic', 'Major pentatonic', 'Sing 1 2 3 5 6 8 up and down, then try skipping: 1 3 5 8 5 3 1.', 'major_pentatonic'),
  b('arpeggio_major', 'Major arpeggio', "Sing 1 3 5 8 5 3 1 (do mi sol do sol mi do) on 'ah'. Land each note cleanly without sliding.", 'major'),
];
