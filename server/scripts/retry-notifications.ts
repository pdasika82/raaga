import { config } from '../src/config.ts';
import { pool } from '../src/db.ts';
import { gradeQueue, notificationQueue } from '../src/queues.ts';
if (!config.demo || config.projectId !== 'demo-raaga') throw new Error('This retry tool is restricted to the local demo.');
const runId = process.argv[2];
if (!runId || !/^[a-zA-Z0-9_-]{1,80}$/.test(runId)) throw new Error('Usage: npm run demo:retry -- <run-id>');
try {
  const { rows } = await pool.query("SELECT id FROM attempts WHERE run_id=$1 AND status='graded'", [runId]);
  for (const row of rows) {
    const job = await notificationQueue.getJob(`grade-ready-${row.id}`);
    if (!job) throw new Error(`No notification job for ${row.id}`);
    const state = await job.getState();
    if (state === 'completed' || state === 'failed') await job.retry(state);
    else throw new Error(`Job ${job.id} is ${state}; wait until it finishes.`);
    console.log(`Retried the same logical notification job ${job.id}`);
  }
} finally { await Promise.all([gradeQueue.close(), notificationQueue.close()]); await pool.end(); }
