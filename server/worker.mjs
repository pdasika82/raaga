// Emails the student when their review is ready, then marks the review emailed.
import { Worker } from 'bullmq';
import nodemailer from 'nodemailer';
import { db, queueConnection, QUEUE } from './db.mjs';

const mail = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 1025) });

new Worker(QUEUE, async job => {
  const { rows: [review] } = await db.query('SELECT * FROM reviews WHERE id = $1', [job.data.reviewId]);
  const subject = review.status === 'graded'
    ? `Your Raaga review: ${review.grade ?? 'not graded'}${review.score === null ? '' : ` (${review.score}/100)`}`
    : 'Your Raaga review could not be completed';
  await mail.sendMail({
    from: 'Raaga <reviews@raaga.local>', to: review.user_email, subject,
    text: `${review.lesson}\n\n${review.summary ?? ''}\n\nOpen Raaga to see the full review.`,
  });
  await db.query(`UPDATE reviews SET status = 'emailed', updated_at = now() WHERE id = $1 AND status = 'graded'`, [review.id]);
  return { emailed: review.user_email, subject };
}, { connection: queueConnection });
console.log('raaga-worker ready');
