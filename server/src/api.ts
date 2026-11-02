import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { basename, join } from 'node:path';
import { z } from 'zod';
import { authenticate, HttpError, type Identity } from './auth.ts';
import { config } from './config.ts';
import { pool, transaction } from './db.ts';
import { EXERCISES, exerciseById } from './exercises.ts';
import type { SavedAttempt } from '../../shared/attempts.ts';

declare module 'fastify' { interface FastifyRequest { identity: Identity | null } }
const uploadFields = z.object({ exerciseId: z.string().min(1), runId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/), teacherNote: z.string().max(1000).default('') }).strict();

async function savedAttempt(row: any): Promise<SavedAttempt> {
  const { rows: deliveries } = await pool.query('SELECT recipient_name AS name,recipient_role AS role,status FROM notification_deliveries WHERE attempt_id=$1 ORDER BY recipient_role DESC,recipient_name', [row.id]);
  const notification = row.status !== 'graded' ? 'not_applicable' : deliveries.some(d => d.status === 'uncertain') ? 'attention' : deliveries.length && deliveries.every(d => d.status === 'sent') ? 'complete' : 'pending';
  return { id: row.id, studentId: row.student_id, exerciseId: row.exercise_id, exerciseTitle: row.exercise.title, runId: row.run_id,
    status: row.status, filename: row.filename, createdAt: row.created_at.toISOString(), gradedAt: row.graded_at?.toISOString() || null,
    score: row.score, measurements: row.measurements, feedback: row.feedback, error: row.error, notification, deliveries };
}

export async function createApi(verify = authenticate) {
  const app = Fastify({ logger: { redact: ['req.headers.authorization'] }, bodyLimit: 1024 * 1024, requestTimeout: 120000 });
  await app.register(cors, { origin: config.corsOrigins, methods: ['GET', 'POST'], allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'] });
  await app.register(multipart, { limits: { fileSize: 80 * 1024 * 1024, files: 1, fields: 3, fieldSize: 4096, parts: 4 } });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  app.decorateRequest('identity', null);
  app.setErrorHandler((error, request, reply) => {
    const problem = error as { statusCode?: number; message?: string };
    const status = error instanceof z.ZodError ? 400 : Number(problem.statusCode) || 500;
    if (status >= 500) request.log.error({ message: problem.message }, 'API request failed');
    reply.code(status).send({ error: status >= 500 ? 'The server could not complete this request. Try again shortly.' : error instanceof z.ZodError ? 'Invalid request fields.' : problem.message });
  });
  app.get('/health', async () => { await pool.query('SELECT 1'); return { status: 'ok' }; });
  app.register(async api => {
    api.addHook('onRequest', async request => { request.identity = await verify(request); });
    api.get('/exercises', async () => ({ exercises: EXERCISES, feedbackMode: config.feedbackMode, demo: config.demo }));
    api.get('/attempts', async request => {
      const { rows } = await pool.query('SELECT * FROM attempts WHERE student_id=$1 ORDER BY created_at DESC LIMIT 30', [request.identity!.uid]);
      return { attempts: await Promise.all(rows.map(savedAttempt)) };
    });
    api.get<{ Params: { id: string } }>('/attempts/:id', async request => {
      const id = z.uuid().parse(request.params.id);
      const { rows: [row] } = await pool.query('SELECT * FROM attempts WHERE id=$1 AND student_id=$2', [id, request.identity!.uid]);
      if (!row) throw new HttpError(404, 'Attempt not found.');
      return { attempt: await savedAttempt(row) };
    });
    api.post('/attempts', { config: { rateLimit: { max: 10, timeWindow: '1 minute', keyGenerator: request => request.identity?.uid || request.ip } } }, async (request, reply) => {
      const identity = request.identity!;
      const key = z.uuid().parse(request.headers['idempotency-key']);
      const id = randomUUID();
      await mkdir(config.uploadDir, { recursive: true });
      const path = join(config.uploadDir, `${id}.upload`);
      let persisted = false, filename = '', sawFile = false;
      const fields: Record<string, unknown> = {};
      const hash = createHash('sha256');
      try {
        for await (const part of request.parts()) {
          if (part.type === 'file') {
            if (part.fieldname !== 'recording' || sawFile) throw new HttpError(400, 'Upload exactly one recording.');
            sawFile = true; filename = basename(part.filename).slice(0, 200);
            if (!/^(audio|video)\//.test(part.mimetype)) throw new HttpError(415, 'Choose an audio or video file.');
            const tap = new Transform({ transform(chunk, _encoding, callback) { hash.update(chunk); callback(null, chunk); } });
            await pipeline(part.file, tap, createWriteStream(path, { flags: 'wx', mode: 0o600 }));
            if (part.file.truncated) throw new HttpError(413, 'The recording must be no larger than 80 MB.');
          } else {
            if (Object.hasOwn(fields, part.fieldname)) throw new HttpError(400, 'Duplicate upload field.');
            fields[part.fieldname] = part.value;
          }
        }
        if (!sawFile) throw new HttpError(400, 'Choose a recording to upload.');
        const input = uploadFields.parse(fields);
        const exercise = exerciseById(input.exerciseId);
        if (!exercise) throw new HttpError(400, 'This exercise is not available for saved grading yet.');
        const fileHash = hash.digest('hex');
        const requestHash = createHash('sha256').update(JSON.stringify({ ...input, fileHash })).digest('hex');
        const row = await transaction(async tx => {
          await tx.query(`INSERT INTO people(id,name,email,role) VALUES($1,$2,$3,'student') ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,email=EXCLUDED.email WHERE people.role='student'`, [identity.uid, identity.name, identity.email]);
          const { rows: [person] } = await tx.query('SELECT role FROM people WHERE id=$1', [identity.uid]);
          if (person?.role !== 'student') throw new HttpError(403, 'Only a student account may submit practice.');
          const { rows: [inserted] } = await tx.query(`INSERT INTO attempts(id,student_id,exercise_id,exercise,run_id,idempotency_key,request_hash,file_hash,filename,storage_path,teacher_note)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (student_id,idempotency_key) DO NOTHING RETURNING *`,
            [id, identity.uid, exercise.id, JSON.stringify(exercise), input.runId, key, requestHash, fileHash, filename, path, input.teacherNote]);
          if (!inserted) {
            const { rows: [existing] } = await tx.query('SELECT * FROM attempts WHERE student_id=$1 AND idempotency_key=$2', [identity.uid, key]);
            if (existing.request_hash !== requestHash) throw new HttpError(409, 'This upload key was already used for another recording.');
            return existing;
          }
          await tx.query("INSERT INTO outbox(id,attempt_id,event_type,payload) VALUES($1,$2,'grade_requested',$3)", [`grade-requested-${id}`, id, JSON.stringify({ attempt_id: id, student_id: identity.uid, run_id: input.runId })]);
          return inserted;
        });
        persisted = row.id === id;
        reply.code(persisted ? 202 : 200);
        return { attempt: await savedAttempt(row) };
      } finally { if (!persisted) await unlink(path).catch(() => {}); }
    });
  }, { prefix: '/api' });
  return app;
}
