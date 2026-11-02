import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import pg from 'pg';

// Independent observer: reads Postgres, BullMQ and Mailpit directly, not the app's verdict.
const manifest = JSON.parse(await readFile(new URL('../../demo/acceptance.json', import.meta.url), 'utf8'));
const args = process.argv.slice(2);
const runId = args.includes('--run-id') ? args[args.indexOf('--run-id') + 1] : `check-${randomUUID()}`;
if (!/^[a-zA-Z0-9_-]{1,80}$/.test(runId || '')) throw new Error('Invalid run ID.');
const inspectOnly = args.includes('--inspect-only');
const api = process.env.DEMO_API_URL || 'http://127.0.0.1:8787';
const mailbox = process.env.MAILPIT_URL || 'http://127.0.0.1:58025';
for (const url of [api, mailbox]) if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('The demo checker only drives a loopback demo stack.');
const pool = new pg.Pool({ connectionString: process.env.TESTFOLD_DATABASE_URL || 'postgres://testfold_reader:testfold-read-local-only@127.0.0.1:55432/raaga' });
const redis = new Redis({ host: '127.0.0.1', port: 56379, username: 'testfold', password: 'testfold-read-local-only', maxRetriesPerRequest: 1 });
const checks: { criterion: string; pass: boolean; evidence: unknown }[] = [];
const check = (criterion: string, pass: boolean, evidence: unknown) => { checks.push({ criterion, pass, evidence }); console.log(`${pass ? 'PASS' : 'FAIL'} ${criterion}: ${JSON.stringify(evidence)}`); };
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function json(url: string, options?: RequestInit) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).pathname}`);
  return response.json() as Promise<any>;
}

try {
  const fixtureData: { name: string; bytes: Buffer; hash: string }[] = [];
  for (const [name, path] of [['good', manifest.fixtures.good], ['offKey', manifest.fixtures.offKey]]) {
    const bytes = await readFile(new URL(`../../${path}`, import.meta.url));
    fixtureData.push({ name, bytes, hash: createHash('sha256').update(bytes).digest('hex') });
  }
  if (!inspectOnly) {
    const signedIn = await json('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: manifest.student.email, password: 'Raaga-demo-2026!', returnSecureToken: true }),
    });
    const headers = { Authorization: `Bearer ${signedIn.idToken}` };
    for (const fixture of fixtureData) {
      const body = new FormData(); body.set('exerciseId', manifest.exerciseId); body.set('runId', runId); body.set('teacherNote', 'Keep the supplied reference pitch.');
      body.set('recording', new Blob([new Uint8Array(fixture.bytes)], { type: 'audio/wav' }), `${fixture.name}.wav`);
      const key = randomUUID();
      const first = await json(`${api}/api/attempts`, { method: 'POST', headers: { ...headers, 'Idempotency-Key': key }, body });
      const replay = await json(`${api}/api/attempts`, { method: 'POST', headers: { ...headers, 'Idempotency-Key': key }, body });
      check(`Upload retry preserves one ${fixture.name} attempt`, first.attempt.id === replay.attempt.id, { attempt_id: first.attempt.id, replay_id: replay.attempt.id });
    }
    const noor = await json('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'noor@example.test', password: 'Raaga-demo-2026!', returnSecureToken: true }),
    });
    const { rows: [first] } = await pool.query('SELECT id FROM attempts WHERE run_id=$1 ORDER BY created_at LIMIT 1', [runId]);
    const denied = await fetch(`${api}/api/attempts/${first.id}`, { headers: { Authorization: `Bearer ${noor.idToken}` } });
    check('Another student cannot read Maya’s attempt', denied.status === 404, { status: denied.status });
    const signedOut = await fetch(`${api}/api/attempts/${first.id}`);
    check('Signed-out access is rejected', signedOut.status === 401, { status: signedOut.status });
  }
  let rows: any[] = [];
  const gradeDeadline = Date.now() + 180000;
  do {
    rows = (await pool.query('SELECT * FROM attempts WHERE run_id=$1 ORDER BY created_at', [runId])).rows;
    if (rows.length >= 2 && rows.every(r => !['queued', 'analyzing'].includes(r.status))) break;
    if (Date.now() >= gradeDeadline) break;
    await pause(1500);
  } while (true);
  check('Exactly two persisted attempts belong to Maya and the reference exercise', rows.length === 2 && rows.every(r => r.student_id === manifest.student.id && r.exercise_id === manifest.exerciseId), rows.map(r => ({ id: r.id, student_id: r.student_id, exercise_id: r.exercise_id, status: r.status })));
  check('Both grades include persisted feedback and a next assignment', rows.length === 2 && rows.every(r => r.status === 'graded' && r.feedback?.feedback?.length && r.feedback?.practiceNext), rows.map(r => ({ id: r.id, status: r.status, score: r.score, source: r.feedback?.source, error: r.error })));
  const good = rows.find(r => r.file_hash === fixtureData[0].hash), offKey = rows.find(r => r.file_hash === fixtureData[1].hash);
  check('The off-key take scores lower than the good take', good?.score >= manifest.scores.goodMinimum && offKey?.score !== null && offKey?.score <= manifest.scores.offKeyMaximum && good.score - offKey.score >= manifest.scores.minimumGap,
    { good: good?.score, offKey: offKey?.score, required: manifest.scores });
  // Wait for the logical jobs (including an explicit retry) to reach a terminal state.
  const queueDeadline = Date.now() + 60000;
  while (rows.some(r => r.status === 'graded') && Date.now() < queueDeadline) {
    const states = await Promise.all(rows.filter(r => r.status === 'graded').map(async row => {
      const id = `grade-ready-${row.id}`;
      return (await redis.zscore('bull:raaga-notifications:completed', id)) !== null || (await redis.zscore('bull:raaga-notifications:failed', id)) !== null;
    }));
    if (states.every(Boolean)) break;
    await pause(500);
  }
  for (const row of rows) {
    const { rows: events } = await pool.query("SELECT id,payload,dispatched_at FROM outbox WHERE attempt_id=$1 AND event_type='grade_ready'", [row.id]);
    const jobs = [];
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', 'bull:raaga-notifications:*', 'COUNT', 200);
      cursor = next;
      for (const key of keys) {
        if (await redis.type(key) !== 'hash') continue;
        const job = await redis.hgetall(key);
        if (job.name !== 'grade_ready' || !job.data) continue;
        const data = JSON.parse(job.data);
        if (data.attempt_id === row.id) jobs.push({ key, data, name: job.name, attemptsMade: job.atm || '0' });
      }
    } while (cursor !== '0');
    check(`One grade_ready event and retained job for ${row.id}`, events.length === 1 && !!events[0].dispatched_at && jobs.length === 1 && jobs[0].data.student_id === row.student_id && jobs[0].key === `bull:raaga-notifications:grade-ready-${row.id}`,
      { events, jobs });
    const { rows: assignments } = await pool.query('SELECT student_id,exercise_id FROM practice_assignments WHERE attempt_id=$1', [row.id]);
    check(`Next exercise saved for ${row.id}`, assignments.length === 1 && assignments[0].student_id === row.student_id && assignments[0].exercise_id === row.feedback?.practiceNext?.exerciseId, assignments);
  }
  // Read actual captured messages, including Bcc. Never infer receipt from the app's ledger.
  async function messagesForRun() {
    const messages: any[] = [];
    let start = 0, total = 0;
    do {
      const page = await json(`${mailbox}/api/v1/messages?start=${start}&limit=200`);
      total = page.total;
      for (const entry of page.messages || []) {
        const message = await json(`${mailbox}/api/v1/message/${entry.ID}`);
        if (message.Text?.split(/\r?\n/).includes(`Run: ${runId}`)) messages.push({ ...message, CapturedAt: entry.Created });
      }
      start += 200;
    } while (start < total);
    return messages;
  }
  let messages: any[] = [];
  // Observe after terminal jobs, so an asynchronous retry cannot pass before it sends.
  await pause(1000);
  const notificationDeadline = Math.max(...rows.map(r => r.graded_at ? new Date(r.graded_at).getTime() : Date.now())) + manifest.notificationDeadlineSeconds * 1000;
  while (true) {
    messages = await messagesForRun();
    if (messages.length >= rows.length * manifest.expectedRecipientsPerAttempt.length || Date.now() >= notificationDeadline || rows.some(r => r.status !== 'graded')) break;
    await pause(1500);
  }
  const allAddresses = new Set<string>([...manifest.expectedRecipientsPerAttempt, ...manifest.excludedRecipients].map((p: any) => p.email));
  for (const row of rows) {
    const related = messages.filter(m => m.Text?.includes(`Attempt: ${row.id}`));
    check(`Emails captured within ${manifest.notificationDeadlineSeconds}s of grade ${row.id}`,
      related.length === manifest.expectedRecipientsPerAttempt.length && related.every(m => Number.isFinite(Date.parse(m.CapturedAt)) && Date.parse(m.CapturedAt) <= new Date(row.graded_at).getTime() + manifest.notificationDeadlineSeconds * 1000),
      related.map(m => ({ messageId: m.ID, capturedAt: m.CapturedAt, gradedAt: row.graded_at })));
    const recipients: string[] = related.flatMap(m => [...(m.To || []), ...(m.Cc || []), ...(m.Bcc || [])].map((p: any) => p.Address.toLowerCase()));
    recipients.forEach(email => allAddresses.add(email));
    for (const email of allAddresses) {
      const person = [...manifest.expectedRecipientsPerAttempt, ...manifest.excludedRecipients].find((p: any) => p.email === email);
      const expected = manifest.expectedRecipientsPerAttempt.some((p: any) => p.email === email) ? 1 : 0;
      const actual = recipients.filter(value => value === email).length;
      check(`${person?.name || email} receives ${expected} email(s) for ${row.id}`, actual === expected, { recipient: email, expected, actual, messageIds: related.filter(m => [...(m.To || []), ...(m.Cc || []), ...(m.Bcc || [])].some((p: any) => p.Address.toLowerCase() === email)).map(m => m.ID) });
    }
  }
  const report = { runId, inspectedAt: new Date().toISOString(), fixtureType: manifest.fixtures.type, pass: checks.every(c => c.pass), checks };
  const directory = new URL('../demo-evidence/', import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL(`${runId}.json`, directory), JSON.stringify(report, null, 2));
  console.log(`Evidence: server/demo-evidence/${runId}.json`);
  process.exitCode = report.pass ? 0 : 1;
} finally { redis.disconnect(); await pool.end(); }
