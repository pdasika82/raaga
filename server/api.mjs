// Raaga grading service (local demo): the browser's Anthropic SDK points here instead of api.anthropic.com.
// Each request becomes a review row (grading → graded/failed), is forwarded to Claude with the server's
// key, and queues a review-ready job that emails the student.
import http from 'node:http';
import { Queue } from 'bullmq';
import { db, migrate, queueConnection, QUEUE, letter } from './db.mjs';
import { gradeWithOpenAI } from './openai.mjs';

const queue = new Queue(QUEUE, { connection: queueConnection });
const PORT = Number(process.env.PORT || 8787);

// Demo only: emulator ID tokens are unsigned, so the email is read from the payload, not verified.
function userEmail(req) {
  const token = (req.headers['x-raaga-user'] || '').toString();
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).email || null; } catch { return null; }
}

function lessonOf(body) {
  try { return JSON.parse(body.messages[0].content[0].text).context.lesson || 'unknown'; } catch { return 'unknown'; }
}

/** Average of the rubric scores the model returned, or null when any criterion was not assessed. */
function scoreOf(reply) {
  try {
    const text = reply.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    const data = JSON.parse(text.replace(/^\s*```(?:json)?\s*/, '').replace(/\s*```\s*$/, ''));
    const scores = data.criteria.map(c => c.score);
    const score = scores.some(s => s === null) ? null : Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    return { score, summary: data.summary || null };
  } catch { return { score: null, summary: null }; }
}

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };

http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (req.method !== 'POST' || !req.url.endsWith('/v1/messages')) { res.writeHead(404, cors); return res.end(); }
  const email = userEmail(req);
  if (!email) { res.writeHead(401, { ...cors, 'content-type': 'application/json' }); return res.end('{"type":"error","error":{"type":"authentication_error","message":"sign in first"}}'); }
  const body = JSON.parse(await new Promise(r => { let s = ''; req.on('data', c => s += c); req.on('end', () => r(s)); }));
  const { rows: [review] } = await db.query(`INSERT INTO reviews (user_email, lesson, status) VALUES ($1, $2, 'grading') RETURNING id`, [email, lessonOf(body)]);
  let status = 502, reply = { type: 'error', error: { type: 'api_error', message: 'grading is not configured on this server' } };
  if (process.env.ANTHROPIC_API_KEY) {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': process.env.ANTHROPIC_API_KEY },
    });
    status = upstream.status; reply = await upstream.json();
  } else if (process.env.OPENAI_API_KEY) {
    ({ status, reply } = await gradeWithOpenAI(body));
  }
  const graded = status === 200 ? scoreOf(reply) : null;
  await db.query(`UPDATE reviews SET status = $2, score = $3, grade = $4, summary = $5, reply = $6, updated_at = now() WHERE id = $1`,
    [review.id, graded ? 'graded' : 'failed', graded?.score ?? null, letter(graded?.score), graded?.summary ?? reply.error?.message ?? null, reply]);
  await queue.add('review-ready', { reviewId: review.id, email }, { removeOnComplete: false });
  res.writeHead(status, { ...cors, 'content-type': 'application/json', 'x-raaga-review': String(review.id) });
  res.end(JSON.stringify(reply));
}).listen(PORT, async () => { await migrate(); console.log(`raaga-api on ${PORT}`); });
