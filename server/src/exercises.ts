import type { Exercise } from '../../shared/attempts.ts';

export const EXERCISES: Exercise[] = [{
  id: 'first_notes', title: 'First notes · Sa–Ri–Ga–Ri–Sa', art: 'raaga',
  instructions: 'Sing Sa–Ri–Ga–Ri–Sa once, one note per second (60 BPM), with Sa at C4 (261.63 Hz). Leave a short gap between notes. Use a solo recording without accompaniment.',
  sequence: ['Sa', 'Ri', 'Ga', 'Ri', 'Sa'], midi: [60, 62, 64, 62, 60],
  bpm: 60, tonic: 'C4', noteSeconds: 1, pitchToleranceCents: 50, onsetToleranceSeconds: 0.15,
  rubricVersion: 'first-notes-v1',
}, {
  id: 'find_sa', title: 'Find Sa · four steady beats', art: 'raaga',
  instructions: 'Hold Sa at C4 (261.63 Hz) for four seconds. Use a solo voice without accompaniment.',
  sequence: ['Sa'], midi: [60], bpm: 60, tonic: 'C4', noteSeconds: 4,
  pitchToleranceCents: 50, onsetToleranceSeconds: 0.15, rubricVersion: 'steady-sa-v1',
}];
export const exerciseById = (id: string) => EXERCISES.find(exercise => exercise.id === id);
