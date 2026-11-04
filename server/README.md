# Raaga grading service (local demo)

A small backend for AI recording reviews, so a review leaves a trail beyond the browser: a row in
Postgres, a job on a queue, and an email to the student.

When `VITE_RAAGA_API` is set in `web2/.env.local`, the browser's Anthropic SDK sends Raaga's grading
request here instead of to Anthropic. The prompt and the answer parsing stay in the web app.

| File | What it does |
|---|---|
| `api.mjs` | `POST /v1/messages`: records the review as `grading`, forwards it to Claude (or OpenAI), sets `graded` with grade/score or `failed`, queues `review-ready` |
| `worker.mjs` | Takes `review-ready`, emails the student through Mailpit, marks the review `emailed` |
| `openai.mjs` | Used when there is no Anthropic key: converts the request to an OpenAI chat completion (`gpt-4.1`; `OPENAI_MODEL` to change) and back |
| `db.mjs` | Postgres pool, the `reviews` table, Raaga's grade letters |
| `compose.yml` | `raaga-db` (5546), `raaga-redis` (6390), `raaga-mailpit` (UI 8026, SMTP 1026), `raaga-api` (8787), `raaga-worker` |

## Run

```sh
cd server
cp .env.example .env          # set RAAGA_DB_PASSWORD and OPENAI_API_KEY (or ANTHROPIC_API_KEY)
npm install
docker compose up -d
```

In `web2/.env.local` add `VITE_RAAGA_API=http://127.0.0.1:8787`, then `npm run dev` in `web2/`.
Sign in (the Firebase auth emulator works: `VITE_FIREBASE_AUTH_EMULATOR_URL`), grade a recording, and
see the email at http://127.0.0.1:8026.

Demo only: the API reads the student's email from the ID token without verifying it (emulator tokens
are unsigned). No keys live in this folder; `.env` is git-ignored.
