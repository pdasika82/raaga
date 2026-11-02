import { Queue } from 'bullmq';
import { redisConnection } from './config.ts';
import { transaction } from './db.ts';

export const gradeQueue = new Queue('raaga-grading', { connection: redisConnection() });
export const notificationQueue = new Queue('raaga-notifications', { connection: redisConnection() });
// Retain jobs for evidence and stable-ID deduplication. Demo reset is explicit.
export const jobOptions = { attempts: 3, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: false, removeOnFail: false };

export async function dispatchOutbox() {
  return transaction(async client => {
    const { rows } = await client.query('SELECT * FROM outbox WHERE dispatched_at IS NULL ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED');
    for (const event of rows) {
      const queue = event.event_type === 'grade_requested' ? gradeQueue : notificationQueue;
      await queue.add(event.event_type, event.payload, { ...jobOptions, jobId: event.id });
      await client.query('UPDATE outbox SET dispatched_at=now() WHERE id=$1', [event.id]);
    }
    return rows.length;
  });
}
