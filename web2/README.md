# Raaga (web app)

Carnatic swara practice in the browser. Installs to the iPhone home screen from Safari.

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
