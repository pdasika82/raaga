# Raaga Steps (deprecated)

This is the earlier note-by-note web app. It is no longer built or published; the
listen-and-repeat app in `../web2/` replaced it on 2026-09-27.

The folder stays because `web2/` imports these modules directly:

- `src/core/` pitch maths, YIN detector, scales and ragas, swara names, analyzer,
  coaching prompt (vitest suite runs in CI)
- `src/audio/` microphone capture, tanpura, reference tones
- `src/storage/` IndexedDB sessions and preferences
- `src/llm/` Anthropic client

To run it locally anyway: `npm install && npm run dev` in this folder.
