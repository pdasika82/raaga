import nodemailer from 'nodemailer';
import { config } from './config.ts';
import { withAttemptLock } from './db.ts';

const transport = nodemailer.createTransport({ host: config.smtpHost, port: config.smtpPort, secure: false,
  connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 });

export async function sendNotifications(attemptId: string) {
  return withAttemptLock('notify', attemptId, async client => {
    const { rows: [attempt] } = await client.query("SELECT * FROM attempts WHERE id=$1 AND status='graded'", [attemptId]);
    if (!attempt) throw new Error('No saved grade exists for this notification.');
    const { rows: deliveries } = await client.query('SELECT * FROM notification_deliveries WHERE attempt_id=$1 ORDER BY recipient_role DESC,recipient_id', [attemptId]);
    if (!deliveries.length) throw new Error('No authorized recipients were saved.');
    for (const delivery of deliveries) {
      if (delivery.status === 'sent') continue;
      if (config.fault === 'skip-parent' && delivery.recipient_role === 'parent') continue;
      if (delivery.status === 'sending' || delivery.status === 'uncertain') {
        await client.query("UPDATE notification_deliveries SET status='uncertain', error='Delivery outcome requires mailbox reconciliation; automatic resend withheld.' WHERE attempt_id=$1 AND recipient_id=$2", [attemptId, delivery.recipient_id]);
        throw new Error('A previous SMTP outcome is uncertain. Reconcile the mailbox before retrying.');
      }
      if (config.demo && !delivery.recipient_email.endsWith('@example.test')) throw new Error('Demo delivery may only address synthetic example.test recipients.');
      // A crash after SMTP acceptance cannot be made exactly-once by a database key alone.
      // Persist "sending" first, and stop for reconciliation if that outcome becomes ambiguous.
      await client.query("UPDATE notification_deliveries SET status='sending',error=NULL WHERE attempt_id=$1 AND recipient_id=$2", [attemptId, delivery.recipient_id]);
      try {
        const sent = await transport.sendMail({ from: config.mailFrom, to: delivery.recipient_email,
          subject: `Your score for ${attempt.exercise.title}: ${attempt.score}`,
          messageId: delivery.message_id,
          headers: { 'X-Attempt-ID': attemptId, 'X-Run-ID': attempt.run_id, 'X-Student-ID': attempt.student_id },
          text: `Hello ${delivery.recipient_name},\n\nYour score for ${attempt.exercise.title}: ${attempt.score}/100\n\n${attempt.feedback.summary}\n\n${attempt.feedback.feedback.join('\n')}\n\nPractice next: ${attempt.feedback.practiceNext.reason}\n\nAttempt: ${attemptId}\nRun: ${attempt.run_id}\nFeedback source: ${attempt.feedback.source}\n`,
        });
        if (!sent.accepted?.length) throw new Error('SMTP did not accept the recipient.');
        await client.query("UPDATE notification_deliveries SET status='sent',sent_at=now() WHERE attempt_id=$1 AND recipient_id=$2", [attemptId, delivery.recipient_id]);
      } catch (error) {
        const code = (error as { code?: string }).code;
        // Known connection failures occur before delivery; other failures remain ambiguous.
        const state = ['ECONNECTION', 'ECONNREFUSED', 'EDNS'].includes(code || '') ? 'pending' : 'uncertain';
        await client.query('UPDATE notification_deliveries SET status=$3,error=$4 WHERE attempt_id=$1 AND recipient_id=$2', [attemptId, delivery.recipient_id, state, state === 'pending' ? 'Mail server unavailable; retry scheduled.' : 'SMTP outcome uncertain; check mailbox before retry.']);
        throw new Error('Score email delivery did not complete.');
      }
    }
  });
}
