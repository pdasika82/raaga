import { UnrecoverableError, Worker } from 'bullmq';
import { config, redisConnection } from './config.ts';
import { pool } from './db.ts';
import { gradeAttempt, markGradeFailed } from './grading.ts';
import { sendNotifications } from './notifications.ts';
import { dispatchOutbox, gradeQueue, notificationQueue } from './queues.ts';

const gradeWorker = new Worker('raaga-grading', gradeAttempt, { connection: redisConnection(), concurrency: 2, lockDuration: 90000 });
const notificationWorker = new Worker('raaga-notifications', job => sendNotifications(job.data.attempt_id), { connection: redisConnection(), concurrency: 2 });
gradeWorker.on('failed', (job, error) => {
  console.error(JSON.stringify({ event: 'grade_failed', attempt_id: job?.data.attempt_id, error: error.message, attempts: job?.attemptsMade }));
  if (job && (error instanceof UnrecoverableError || job.attemptsMade >= (job.opts.attempts || 1))) void markGradeFailed(job.data.attempt_id).catch(() => console.error('Could not persist failed grade status.'));
});
notificationWorker.on('failed', job => console.error(JSON.stringify({ event: 'notification_failed', attempt_id: job?.data.attempt_id })));
for (const worker of [gradeWorker, notificationWorker]) worker.on('error', error => console.error('Worker connection error:', error.message));
let dispatching = false;
const dispatch = async () => {
  if (dispatching) return;
  dispatching = true;
  try { await dispatchOutbox(); }
  catch (error) { console.error('Outbox dispatch failed:', (error as Error).message); }
  finally { dispatching = false; }
};
const interval = setInterval(() => void dispatch(), 500);
void dispatch();
console.log(JSON.stringify({ event: 'worker_ready', feedback: config.feedbackMode, demo: config.demo, fault: config.fault }));
async function close() {
  clearInterval(interval);
  await Promise.all([gradeWorker.close(), notificationWorker.close()]);
  while (dispatching) await new Promise(resolve => setTimeout(resolve, 50));
  await Promise.all([gradeQueue.close(), notificationQueue.close()]);
  await pool.end();
}
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => void close().then(() => process.exit(0)));
