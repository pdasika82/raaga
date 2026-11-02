import type { Job } from 'bullmq';
import { analyzeRecording, RecordingError } from './audio.ts';
import { pool, transaction, withAttemptLock } from './db.ts';
import { transcribe, writeFeedback } from './feedback.ts';
import type { Exercise, Measurements } from '../../shared/attempts.ts';

export async function gradeAttempt(job: Pick<Job, 'data'>) {
  const id = job.data.attempt_id as string;
  return withAttemptLock('grade', id, async client => {
    const { rows: [attempt] } = await client.query('SELECT * FROM attempts WHERE id=$1', [id]);
    if (!attempt) throw new Error('Attempt does not exist.');
    if (['graded', 'needs_review'].includes(attempt.status)) return;
    await client.query("UPDATE attempts SET status='analyzing', error=NULL WHERE id=$1", [id]);
    const exercise: Exercise = attempt.exercise;
    let measurements: Measurements;
    try {
      measurements = attempt.measurements || await analyzeRecording(attempt.storage_path, exercise);
      // Transcription is optional evidence: its failure must not become a false lyrics grade.
      try { await transcribe(attempt.storage_path, exercise, measurements); }
      catch { measurements.transcription = { status: 'unavailable' }; }
      await client.query('UPDATE attempts SET measurements=$2 WHERE id=$1', [id, JSON.stringify(measurements)]);
    } catch (error) {
      if (!(error instanceof RecordingError)) throw error;
      await client.query("UPDATE attempts SET status='needs_review', error=$2 WHERE id=$1", [id, error.message]);
      return;
    }
    const feedback = await writeFeedback(exercise, measurements, attempt.teacher_note);
    await transaction(async tx => {
      await tx.query("UPDATE attempts SET status='graded', score=$2, measurements=$3, feedback=$4, error=NULL, graded_at=now() WHERE id=$1", [id, measurements.score, JSON.stringify(measurements), JSON.stringify(feedback)]);
      await tx.query('INSERT INTO practice_assignments(attempt_id, student_id, exercise_id, reason) VALUES($1,$2,$3,$4) ON CONFLICT (attempt_id) DO NOTHING', [id, attempt.student_id, feedback.practiceNext.exerciseId, feedback.practiceNext.reason]);
      // Snapshot the authorized roster before delivery; neither the model nor upload supplies recipients.
      const { rows: recipients } = await tx.query(`SELECT id,name,email,role FROM people WHERE id=$1
        UNION SELECT p.id,p.name,p.email,p.role FROM student_parents sp JOIN people p ON p.id=sp.parent_id
        WHERE sp.student_id=$1 AND sp.opted_in=true AND p.role='parent'`, [attempt.student_id]);
      for (const recipient of recipients) {
        await tx.query(`INSERT INTO notification_deliveries(attempt_id,recipient_id,recipient_name,recipient_email,recipient_role,message_id)
          VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`, [id, recipient.id, recipient.name, recipient.email, recipient.role, `<grade-${id}-${Buffer.from(recipient.id).toString('hex')}@raaga.example.test>`]);
      }
      await tx.query(`INSERT INTO outbox(id,attempt_id,event_type,payload) VALUES($1,$2,'grade_ready',$3) ON CONFLICT DO NOTHING`,
        [`grade-ready-${id}`, id, JSON.stringify({ attempt_id: id, student_id: attempt.student_id, run_id: attempt.run_id })]);
    });
  });
}

export async function markGradeFailed(id: string) {
  await pool.query("UPDATE attempts SET status='failed', error='Grading could not finish. Please try a new attempt or contact your teacher.' WHERE id=$1 AND status IN ('queued','analyzing')", [id]);
}
