# Raaga (web / PWA)

The browser version of Raaga. Same features as the iOS app: live pitch against scales
and ragas, recordings with a pitch chart and score, and coaching feedback from Claude.
Installs to the iPhone home screen from Safari with no App Store and no Xcode.

New to singing? Start with [../docs/GETTING-STARTED.md](../docs/GETTING-STARTED.md).

## Run locally

```
cd web
npm install
npm run dev          # http://localhost:5173 (microphone works on localhost)
npm test             # vitest: pitch detector, scales, analyzer
npm run build        # type-checks and builds to dist/ with the service worker
```

## Try it on your iPhone from this Mac

The microphone needs HTTPS when the page is not on localhost, so serve the dev
build with a self-signed certificate on your LAN:

```
npm run dev:https
```

Open the `https://<your-mac-ip>:5173` URL it prints on the phone (same Wi-Fi).
Safari warns about the certificate once; tap Show Details -> visit this website.
Then tap Share -> Add to Home Screen.

## Deploy (free)

Any static host works. Examples:

- **Cloudflare Pages / Netlify / Vercel:** point at this folder, build command
  `npm run build`, output directory `dist`.
- **GitHub Pages:** already wired. `.github/workflows/pages.yml` builds this folder with
  `BASE_PATH=/raaga/steps/`, `web2/` with `/raaga/echo/`, and the `site/` home page, and
  publishes them together at https://pdasika82.github.io/raaga/ on every push to `main`.

The service worker caches the app shell so it opens offline; feedback requests still
need a connection.

## How it works

```
public/worklet.js       AudioWorklet that forwards 4096-sample blocks (hop 2048)
src/core/               ported from Packages/RaagaCore: YIN detector, scales, lessons,
                        analyzer, coaching prompt (vitest suite in core.test.ts)
src/audio/capture.ts    getUserMedia -> worklet -> YIN on the main thread; MediaRecorder
src/storage/db.ts       IndexedDB (idb): sessions, recording blobs, custom lessons
src/storage/prefs.ts    localStorage: notation, tonic, A4, lesson, API key
src/llm/claude.ts       @anthropic-ai/sdk in the browser (dangerouslyAllowBrowser),
                        claude-opus-5 with server-side refusal fallback
src/ui/                 framework-free views: practice, sessions, detail, settings
```

## iOS Safari notes

- Audio only starts from a tap ("Start listening"); that is a Safari rule.
- Nothing is captured while the screen is locked or Safari is in the background.
- Recordings are `audio/mp4` on Safari and `audio/webm` on Chrome; playback uses
  whatever was recorded.
- Add to Home Screen so Safari does not evict the data after 7 days of non-use.
- The API key is kept in this browser's localStorage. Clearing site data removes it.
