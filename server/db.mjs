import pg from 'pg';

export const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export async function migrate() {
  await db.query(`CREATE TABLE IF NOT EXISTS reviews (
    id serial PRIMARY KEY,
    user_email text NOT NULL,
    lesson text NOT NULL,
    recording text,
    status text NOT NULL CHECK (status IN ('grading', 'graded', 'failed', 'emailed')),
    grade text,
    score integer,
    summary text,
    reply jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now())`);
}

export const queueConnection = { url: process.env.REDIS_URL };
export const QUEUE = 'review-ready';

/** Raaga's own scale (web2/src/core/grading.ts). */
export function letter(score) {
  if (score === null || score === undefined) return null;
  return score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'E';
}
