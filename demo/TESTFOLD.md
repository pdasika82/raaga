# Testfold environment and demo runbook

The app under test is **LMS for Arts / Raaga**. Expected behavior comes from the
agreed feature: grade recordings, save each attempt and email the student and
their opted-in parent exactly once. Use the same criteria for baseline, fault and
repaired scenarios. Do not change expected recipients to match the app's ledger.

## Local connections

| Surface | Connection |
| --- | --- |
| Browser | `http://127.0.0.1:5175/?run_id=<unique-run>#/grade-raaga/first_notes` |
| Student sign-in | `maya@example.test` / `Raaga-demo-2026!` (synthetic emulator account) |
| Unrelated student | `noor@example.test` / `Raaga-demo-2026!` |
| API | `http://127.0.0.1:8787` |
| Read-only Postgres | `postgres://testfold_reader:testfold-read-local-only@127.0.0.1:55432/raaga` |
| Read-only Redis | `redis://testfold:testfold-read-local-only@127.0.0.1:56379` |
| Mailpit | `http://127.0.0.1:58025`, API `/api/v1/messages`, `/api/v1/message/<ID>` |
| Recordings | `web2/public/demo/good.wav`, `web2/public/demo/off-key.wav` |

Redis ACL permits read commands for `bull:raaga-*`; it does not permit EVAL or
mutations. BullMQ jobs are hashes, not just stream entries. Inspect retained job
hashes and outbox rows. The Mailpit API is unauthenticated only on local loopback;
use GET for evidence and leave messages intact. It has no outbound relay.

## Plain-language acceptance criteria

1. Maya signs in and uploads each attached recording using the browser. Each
   completed attempt shows a score, feedback and a next exercise; returning to the
   page restores the saved attempts.
2. The off-key recording scores below the good recording. The synthetic-fixture
   reference expects good >=90, off-key <=35, and a gap >=50; these are engineering
   fixtures, not teacher calibration.
3. Exactly two attempts for this run belong to Maya and `first_notes`; their scores
   match the UI, and their next exercises are persisted for Maya.
4. Exactly one durable `grade_ready` event and one retained BullMQ job exist per
   graded attempt, carrying its attempt, student and run IDs.
5. Within 60 seconds after each grade is saved, Maya Rao and opted-in parent Arun
   Rao each receive exactly one score email for that attempt. Opted-out parent
   Asha Rao, unrelated student Noor Shah, unrelated parent Leela Shah and all other
   recipients receive zero. Check actual Mailpit messages, including To/Cc/Bcc.
6. Retrying the same completed notification jobs causes no additional emails.
7. Signed-out users cannot access attempts; Noor cannot read Maya's attempt.

Use `server/scripts/check-demo.ts --inspect-only --run-id <run>` to collect direct
cross-surface observations after browser uploads. Its expected roster lives in
`demo/acceptance.json`, independently of the notification implementation. The
observer's pass/fail output is supporting evidence, not a substitute for Testfold's
own per-criterion findings or browser proof. API-based upload mode is available for
CI; explicitly distinguish it from a browser run.

If Testfold cannot reach a surface or lacks a connector, mark the associated
criterion unverified and state the missing evidence. Do not call a screenshot-only
run end-to-end verification.

## Deliberate defect

The operator enables `DEMO_NOTIFICATION_FAULT=skip-parent` on the local worker,
then starts a new run with unchanged criteria. The UI score and saved grade remain
valid, but the worker omits Arun. The report must name **Arun Rao**, the attempt ID,
expected count 1 and actual count 0. Restore `DEMO_NOTIFICATION_FAULT=none` before
the repaired run. Never leave the fault enabled after filming.

See `server/README.md` for exact commands. A late recovery does not erase a missed
60-second deadline on the original run.

## Product video (about 85 seconds)

- 0–8: feature request: grade a recording, save the review, notify student + parent.
- 8–20: real upload, result and next-practice action in the app.
- 20–35: Testfold receives the criteria and runs; label any time acceleration.
- 35–50: show browser, database, queue and email proof for the passing run.
- 50–65: planted skip-parent defect; Testfold names Arun and the missing message.
- 65–85: restore/fix the behavior and show unchanged criteria passing on a new run.

Record actual elapsed time, commit/build identity, model and rubric version. Do
not present rules-mode feedback as an AI call, synthetic tones as human singing,
or the fault switch as an agent-written code fix. To film an actual agent fix,
make a separate defect commit and show the real corrective diff and rerun.
