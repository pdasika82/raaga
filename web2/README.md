# LMS for Arts (Raaga web app)

An arts practice app in the browser. The home screen opens two modules: Raaga for
Carnatic swara practice and Kuchipudi for guided practice with teacher videos and
self-review. Installs to the iPhone home screen from Safari.

Routes: `#/practice`, `#/free`, and `#/sessions` retain Raaga's singing tools;
`#/kuchipudi` opens dance practice and `#/account` opens Firebase sign-in. The root
opens the arts home.

Kuchipudi includes six starter practice guides (pending a teacher-approved
syllabus), local demonstration playback with speed and segment looping, a practice
timer, optional private camera recording, and a local journal. Teacher recordings
must be selected locally. Both modules have an **Upload & grade with AI** flow and
editable, lesson-specific **Find examples on YouTube** searches.

AI review routes are `#/grade-raaga/<lesson-id>` and
`#/grade-kuchipudi/<lesson-id>`. Sign in, add your own Anthropic API key in Advanced
settings, choose a lesson, and upload a 1–120 second recording (up to 80 MB). Raaga
extracts pitch locally using YIN, aligns the swara sequence, and sends measurements
to Claude. Kuchipudi sends 16 resized, timestamped video frames for a limited review
of visible positions. It does not analyze continuous motion or audio, and does not
grade rhythm or transitions. The original media stays local. Starting an AI review
uses Anthropic API credits; no request is made when merely choosing a file.

The AI returns rubric scores, evidence, strengths, improvements, and limitations.
Missing criteria are unassessed and prevent an overall grade. Reports can be
downloaded as JSON; media and review state are cleared on navigation/sign-out. No
review is automatically added to recorded-session history. YouTube opens a live
search in another tab; the app does not invent or certify video recommendations.

AI grading uses `claude-sonnet-5-5` with the Messages API. The existing text coach
retains its configured model. References: [vision input](https://platform.claude.com/docs/en/build-with-claude/vision)
and [model IDs](https://platform.claude.com/docs/en/models/overview).

Authentication setup and data boundaries: [Firebase auth](../docs/FIREBASE-AUTH.md).

Published at https://pdasika82.github.io/raaga/ by `.github/workflows/pages.yml` on
every push to `main` that touches `web2/` or the shared modules in `web/src/`.

## Run locally

```
cd web2
npm install
npm run dev        # http://localhost:5174
npm test           # vitest: beat comparison, karvai parsing
npm run build      # type-check and build to dist/
```

Shared code lives in `../web/src` (core, audio, storage, llm) and is reached through the
`@core`, `@audio`, `@storage` and `@llm` aliases in `vite.config.ts` and `tsconfig.json`.

## Layout

```
src/core/practices.ts   practice catalogue: first steps, Sarali Swaralu 1–14, other ragas
src/core/repeat.ts      comparison of a take against the phrase (timed and your-pace)
src/ui/practice.ts      Listen → Your turn → Compare
src/ui/setup.ts         top bar, drone, Find a comfortable Sa modal
src/ui/sessions.ts      saved takes and the full review page
src/ui/reference.ts     pitch reference sheet
src/storage/prefs.ts    Sa, starting octave, pace and speed per practice, API key
```
