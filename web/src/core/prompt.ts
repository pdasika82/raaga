import { summaryText, type PerformanceReport } from './analyzer';
import { scaleById } from './scale';
import type { PracticeSession } from './session';

export const SYSTEM_PROMPT = `You are a patient, expert vocal coach who teaches both Indian classical music (Carnatic and Hindustani) and Western singing. A student has just recorded a practice exercise on their phone. The app measured their pitch continuously and produced the objective report below. You cannot hear the audio; base every observation on the report. Say plainly that your guidance covers pitch only: tone, breath, diction and ornamentation cannot be judged from these measurements. Use readable swara names (Sa, Ri, Ga, Ma, Pa, Dha, Ni), never single letters.

Write feedback the student can act on in their next attempt. Be specific: name the swaras or notes, say whether they were flat or sharp and by roughly how much, and refer to the exercise's instructions. Be honest about problems but encouraging in tone. Use the note names the student uses (swaras for Indian lessons, Western names otherwise), giving the Western equivalent in parentheses the first time.

Format: plain text with short paragraphs and simple "- " bullets. No headings, no tables, no markdown emphasis. Structure: (1) one sentence on the overall impression with the key numbers, (2) 2–4 bullets on what went well, (3) 2–4 bullets on the most important things to fix, in priority order, (4) one concrete drill for the next session, with the tonic named. Keep the whole thing under 300 words.`;

export function userMessage(session: PracticeSession, report: PerformanceReport): string {
  const parts: string[] = [];
  parts.push(`Lesson: ${session.lessonTitle}`);
  parts.push(`Instructions given to the student: ${session.lessonInstructions}`);
  const note = session.userNote?.trim();
  if (note) parts.push(`Student's own note about this attempt: ${note}`);
  if (session.targets?.length) {
    const t = session.targets;
    const matched = t.filter((x) => x.matchedAt != null);
    parts.push(`Guided exercise: the app prompted each note in turn (${(session.lessonSequence ?? []).join(' ')}). ${matched.length} of ${t.length} targets were matched.`);
    parts.push('Per target (note, attempts before it was matched, tuning at the moment of matching):');
    parts.push(t.map((x) => `${x.token}: ${x.matchedAt == null ? 'not matched' : `${x.attempts} attempt${x.attempts === 1 ? '' : 's'}, ${x.cents! >= 0 ? '+' : ''}${x.cents}c`}`).join('; '));
  }
  parts.push('');
  parts.push('Pitch analysis report:');
  parts.push(summaryText(report, scaleById(session.scaleId), session.tonic));
  parts.push('');
  parts.push(
    'Notes on reading the report: cents are deviation from the nearest equal-tempered note (100 cents = one semitone). Within ±20 cents is generally in tune for a beginner; ±10 is good. The note sequence is what the detector heard, so short blips between notes may be slides rather than deliberate notes.',
  );
  return parts.join('\n');
}
