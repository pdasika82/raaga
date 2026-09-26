# Raaga

An iPhone app for singing practice. It listens to your voice, shows in real time
which note you are on and how far it is from the nearest note of a chosen scale or
raga, records each exercise, and can send the pitch analysis to Claude for coaching
feedback on that lesson.

## What it does

- **Live tuner against a scale.** Pick a lesson (each has a scale/raga) and your Sa
  (tonic). The meter shows the sung note as a swara or Western name, cents sharp or
  flat, and colours it green/yellow/orange, or red when the note is not in the scale.
- **Scales and ragas built in.** Western modes and pentatonics, common Carnatic
  melakartas and janyas (Shankarabharanam, Kalyani, Mayamalavagowla, Mohanam, ...),
  and Hindustani thaats/ragas (Yaman, Bhairav, Bhoop, Malkauns, ...). Add your own
  lessons in Settings.
- **Recording.** Tap record, sing, tap stop. The audio (AAC) and the pitch trace are
  saved on the phone. Sessions show a pitch-over-time chart, accuracy stats, a score
  and the sequence of notes the detector heard.
- **Coach feedback.** From a session, "Get feedback from Claude" sends the lesson text
  and the pitch analysis (not the audio) to the Anthropic Messages API and stores the
  reply with the session. You need your own API key from
  https://console.anthropic.com/settings/keys, entered once in Settings.

## Two builds

- `Raaga/` + `Packages/RaagaCore/`: native SwiftUI iOS app (needs Xcode).
- `web/`: the same app as a Progressive Web App you can open in Safari and add to the
  home screen with no Xcode or Apple account. See `web/README.md`.

## Layout

```
project.yml                  XcodeGen spec -> Raaga.xcodeproj
Raaga/                       iOS app (SwiftUI)
  Audio/AudioCapture.swift   AVAudioEngine tap -> YIN pitch detector, AAC recording
  Audio/PlaybackController   plays saved sessions
  Storage/                   sessions on disk, custom lessons, keychain for the API key
  Views/                     Practice (tuner + record), Sessions, Session detail, Settings
web/                         PWA version (Vite + TypeScript), see web/README.md
Packages/RaagaCore/          platform-independent Swift package with unit tests
  PitchDetector.swift        YIN pitch detection
  Scale.swift                scales/ragas as semitone sets, nearest-note/cents maths
  Lesson.swift               built-in lessons
  PerformanceAnalyzer.swift  in-tune %, per-degree stats, note events, text report
  ClaudeClient.swift         raw HTTP client for POST /v1/messages
  FeedbackPrompt.swift       the coaching prompt
```

## Getting it onto your iPhone

1. **Install Xcode** (free) from the Mac App Store, open it once, and let it install
   the iOS platform when asked. Then point the command line tools at it:
   `sudo xcode-select -s /Applications/Xcode.app`
2. **Open the project:** `open Raaga.xcodeproj` (already generated; regenerate any
   time with `xcodegen generate` after editing `project.yml` or adding files).
3. **Sign it.** Select the `Raaga` target -> Signing & Capabilities -> tick
   "Automatically manage signing" and choose your Team. A free Apple ID works
   (Xcode -> Settings -> Accounts -> add your Apple ID). If the bundle ID clashes,
   change `bundleIdPrefix` in `project.yml` and regenerate.
4. **Run on the phone.** Plug the iPhone in (or pair over Wi-Fi), enable Developer
   Mode on the phone (Settings -> Privacy & Security -> Developer Mode), pick the
   phone as the run destination and press Run. The first time, trust the developer
   certificate on the phone: Settings -> General -> VPN & Device Management.
5. With a free Apple ID the app expires after 7 days; just press Run again to
   reinstall. A paid developer account ($99/yr) removes that limit and lets you use
   TestFlight.

New to singing? Start with [docs/GETTING-STARTED.md](docs/GETTING-STARTED.md). Scores are explained in [docs/SCORE-GUIDE.md](docs/SCORE-GUIDE.md).

## Using it

1. Settings: paste your Anthropic API key, choose note names (swaras or C D E) and
   your Sa. Common Sa values: men around C to D♯, women around G to A♯.
2. Practice: pick a lesson, read the instructions, sing. Record when ready.
3. Sessions: open a recording to play it back, see the chart and stats, add a note
   about how it felt, and request feedback.

## Tests

`Packages/RaagaCore/Tests` has XCTest coverage for the pitch detector, scale maths,
analyzer and API client. Run them from Xcode (Product -> Test) or, with full Xcode
installed, `cd Packages/RaagaCore && swift test`.

## Notes and limits

- Pitch detection is monophonic: sing without a tanpura/drone playing loudly through
  the same mic, or keep the drone quiet.
- The model never hears the audio; feedback is based on the measured pitch trace,
  so it can judge tuning, scale adherence and steadiness, not tone or diction.
- Feedback uses `claude-opus-5` with server-side refusal fallback enabled. Each
  request costs a few cents.
