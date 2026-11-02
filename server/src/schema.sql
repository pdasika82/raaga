CREATE TABLE IF NOT EXISTS people (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('student', 'parent'))
);
CREATE TABLE IF NOT EXISTS student_parents (
  student_id text NOT NULL REFERENCES people(id),
  parent_id text NOT NULL REFERENCES people(id),
  opted_in boolean NOT NULL DEFAULT false,
  PRIMARY KEY (student_id, parent_id)
);
CREATE TABLE IF NOT EXISTS attempts (
  id uuid PRIMARY KEY,
  student_id text NOT NULL REFERENCES people(id),
  exercise_id text NOT NULL,
  exercise jsonb NOT NULL,
  run_id text NOT NULL,
  idempotency_key uuid NOT NULL,
  request_hash text NOT NULL,
  file_hash text NOT NULL,
  filename text NOT NULL,
  storage_path text NOT NULL,
  teacher_note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','analyzing','graded','needs_review','failed')),
  score integer CHECK (score BETWEEN 0 AND 100),
  measurements jsonb,
  feedback jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  graded_at timestamptz,
  UNIQUE (student_id, idempotency_key),
  CHECK ((status = 'graded') = (score IS NOT NULL AND feedback IS NOT NULL AND graded_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS attempts_student_created ON attempts(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS attempts_run ON attempts(run_id);
CREATE TABLE IF NOT EXISTS outbox (
  id text PRIMARY KEY,
  attempt_id uuid NOT NULL REFERENCES attempts(id),
  event_type text NOT NULL CHECK (event_type IN ('grade_requested','grade_ready')),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at timestamptz,
  UNIQUE (attempt_id, event_type)
);
CREATE TABLE IF NOT EXISTS notification_deliveries (
  attempt_id uuid NOT NULL REFERENCES attempts(id),
  recipient_id text NOT NULL REFERENCES people(id),
  recipient_name text NOT NULL,
  recipient_email text NOT NULL,
  recipient_role text NOT NULL CHECK (recipient_role IN ('student','parent')),
  kind text NOT NULL DEFAULT 'grade_ready',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','uncertain')),
  message_id text NOT NULL UNIQUE,
  sent_at timestamptz,
  error text,
  PRIMARY KEY (attempt_id, recipient_id, kind)
);
CREATE TABLE IF NOT EXISTS practice_assignments (
  attempt_id uuid PRIMARY KEY REFERENCES attempts(id),
  student_id text NOT NULL REFERENCES people(id),
  exercise_id text NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
