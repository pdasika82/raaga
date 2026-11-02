# Saved Raaga practice demo

This adds a real backend to LMS for Arts: Firebase identity, uploaded audio,
deterministic pitch/timing scores, server-side OpenAI feedback, saved next
exercises, a transactional outbox, BullMQ and per-recipient Mailpit delivery.
The current saved rubric supports **First notes** and **Find Sa** at C4. Kuchipudi
and the original device-local reviews continue to work as before when the backend
URL is absent.

## Run locally

From the repository root:

```sh
npm ci --prefix server
npm run fixtures --prefix server
cp server/.env.example server/.env
# Set OPENAI_API_KEY in server/.env, or export it in your shell.
docker compose --env-file server/.env -f compose.demo.yml up -d --build
```

Open **http://127.0.0.1:5175/#/grade-raaga/first_notes**. Sign in as
`maya@example.test` / `Raaga-demo-2026!`. Mailpit is at
**http://127.0.0.1:58025**. All seeded passwords are the same local-only demo
password. The Firebase project is the isolated **demo-raaga** emulator, not
`certain-ellipse-316421`. Services bind only to loopback on the host.

For explicitly non-AI CI/offline feedback, set `FEEDBACK_MODE=rules`. The page,
stored review and email identify that mode. Live mode fails visibly if the API
key, model or provider response is unusable; it never silently substitutes a
fabricated AI grade. Live reviews incur provider usage.

The example WAVs are **synthetic harmonic tones, not human recordings**. The
off-key fixture shifts the whole phrase by one semitone against the fixed C4
reference. Use them to validate software behavior; collect teacher-reviewed human
recordings before claiming singing-assessment accuracy or filming human practice.

## What is saved

- `attempts`: authenticated student, exercise/reference snapshot, recording hash,
  rubric version, score, measurements, feedback, timestamps and lifecycle status.
- `practice_assignments`: the model's validated selection from the known catalog.
- `outbox`: one durable `grade_requested` and one `grade_ready` event per attempt.
- `notification_deliveries`: an authorized roster snapshot, stable message IDs,
  and each recipient's delivery state.
- Local Docker upload volume: recordings are retained for the demo. `run_id` and
  `attempt_id` correlate database rows, jobs, browser output and email headers.

Uploads require verified Firebase email, have an 80 MB limit, and are decoded on
the server using ffmpeg. Audio must last 1–120 seconds. Student identity is taken
from the verified token, never a form field. Student history and individual reads
are scoped by UID. Parent links are seeded by trusted setup; they cannot be added
through an upload. `Idempotency-Key` deduplicates an HTTP retry, rejecting reuse
with different content. Failed or insufficient-evidence attempts do not send a
score email.

## Grading scope

YIN measures solo pitch. Leading silence is aligned, but tempo and pitch mistakes
are not normalized away. Pitch is the fraction of expected stable-window frames
within 50 cents; timing is the fraction of detected note starts within 150 ms.
The overall score is 80% pitch + 20% timing. Missing pitch windows count against
the score; less than 45% usable voiced coverage produces `needs_review`.

OpenAI's Responses API uses `gpt-5.4-mini` by default (configurable with
`OPENAI_MODEL`), strict Structured Outputs and `store: false`.
The model cannot set scores or recipients. It explains measurements and selects
one existing next exercise; unknown exercise IDs or extra JSON fields fail
validation. The raw audio is not sent to OpenAI. Provider guidance:
[Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)
and [GPT-5.4 Mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini).

Deepgram is an optional adapter for a future catalog exercise with
`expectedLyrics`. It stores word timestamps/confidence and a word-error-derived
lyrics accuracy when confidence is sufficient. The swara exercises deliberately
report lyrics as **not assessed**. No Deepgram key is required or exercised by this
demo. Basic Pitch is not installed: the existing detector is retained; a comparison
on human recordings is still required before changing the detector or expanding
the musical claims.

## Retry and delivery semantics

The grade, assignment, recipient snapshot and outbox event commit atomically.
The dispatcher retries with stable BullMQ job IDs. Completed jobs are retained
for deduplication and inspection. Per-attempt PostgreSQL advisory locks prevent
concurrent stalled-job executions from duplicating the external effect.

Delivered recipients are skipped on retry. SMTP cannot guarantee exactly-once
delivery across a crash after acceptance but before the database update. Such a
delivery becomes `uncertain` and stops automatic resends; reconcile it with the
mailbox before intervention. A stable Message-ID is correlation, not an SMTP
deduplication guarantee. Redis uses AOF; this is a local demo, not a documented
production durability SLA.

## Verify and demonstrate the failure

The independent observer uses read-only database/Redis credentials and Mailpit's
captured messages, with expected recipients from `demo/acceptance.json`. It does
not accept the delivery ledger as proof of receipt. It writes JSON reports under
ignored `server/demo-evidence/`.

```sh
npm run demo:check --prefix server -- --run-id baseline-001
DEMO_MODE=true FIREBASE_PROJECT_ID=demo-raaga npm run demo:retry --prefix server -- baseline-001
npm run demo:check --prefix server -- --inspect-only --run-id baseline-001
```

The checker uploads both fixtures through the HTTP API, verifies upload retries
and access isolation, waits for grading, and checks rows, jobs, assignments,
per-recipient counts and the 60-second notification deadline. It does **not**
verify browser rendering; Testfold must perform the browser flow separately.

To inspect attempts uploaded through the browser, open the app with
`?run_id=browser-001#/grade-raaga/first_notes`, upload both fixture files, then run
the checker with `--inspect-only --run-id browser-001`.

The optional fault is local-only and guarded by demo mode:

```sh
DEMO_NOTIFICATION_FAULT=skip-parent docker compose --env-file server/.env -f compose.demo.yml up -d --no-deps worker
npm run demo:check --prefix server -- --run-id missing-parent-001
# Expected failure: Arun Rao received zero score emails for each attempt.
DEMO_NOTIFICATION_FAULT=none docker compose --env-file server/.env -f compose.demo.yml up -d --no-deps worker
DEMO_MODE=true FIREBASE_PROJECT_ID=demo-raaga npm run demo:retry --prefix server -- missing-parent-001
npm run demo:check --prefix server -- --run-id repaired-001
```

The old missing-parent run remains a deadline failure even after late delivery;
use a fresh repaired run for the original deadline criterion. Stop the stack with
`docker compose -f compose.demo.yml down`. Add `-v` **only** when intentionally
discarding this demo's saved attempts, uploads and queue history.

See [the Testfold runbook](../demo/TESTFOLD.md) for connections and filming steps.

## Validation and deployment boundary

`npm test` and `npm run build` run the server's rubric/response checks and type
check. The web app has its own tests/build; CI also runs a rules-mode integration
flow and notification retry against the actual local services.

The Docker configuration is a local demonstration. Production deployment needs
managed storage/retention, TLS, real Firebase Admin credentials, an authenticated
mail provider and parent-consent management. The existing GitHub Pages deployment
only serves the frontend; setting `VITE_GRADING_API_URL` requires a separately
deployed API. Do not connect real student accounts to the demo database or inbox.
