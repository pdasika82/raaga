# LMS for Arts authentication

The web app uses the modular Firebase Authentication SDK for Google sign-in,
email/password sign-up and sign-in, password reset, email verification, session
restoration, and sign-out. The arts home and both practice modules remain usable
without an account.

Raaga's Recorded sessions, individual session URLs, Advanced settings, and both AI recording-review pages require
a non-anonymous Firebase sign-in. The router waits for identity restoration before
loading these pages, returns to the requested page after sign-in, and clears the
view and stops session playback on sign-out. Practice, immediate pitch grades, and
YouTube example searches remain available to guests.

## Registered application

- Project: `certain-ellipse-316421`
- Web app: `LMS for Arts — Raaga & Kuchipudi`
- App ID: `1:254396385523:web:d7667c1f307e16139f0f86`
- Auth domain: `certain-ellipse-316421.firebaseapp.com`
- Public browser configuration: `web2/src/auth/firebase.public.json`

Google and Email/Password sign-in are enabled. Authorized domains include
`localhost`, `127.0.0.1`, `pdasika82.github.io`, and the project's default Firebase
domains. The public-facing project name is `LMS for Arts`.

Firebase web configuration is intentionally public and is bundled into the app.
It does not contain a service-account credential or an OAuth client secret. Do not
put Admin SDK keys or OAuth client secrets in frontend code or `VITE_*` variables.

## Use a different Firebase project

Copy `web2/.env.example` to `web2/.env.local` and set all four variables from the
web app configuration in Firebase Console → Project settings → Your apps:

```dotenv
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
```

Restart the dev server after changing environment variables. A partial override
disables account sign-in rather than mixing identifiers from two projects. With
no overrides, the checked-in public configuration is used.

In Firebase Authentication, enable Google and Email/Password. Authorize the
deployment hostname (`pdasika82.github.io`) and development hostnames (`localhost`
and `127.0.0.1`) under Authentication → Settings → Authorized domains. Domains do
not include a scheme, port, or `/raaga/` path.

The GitHub Pages workflow accepts optional repository variables with the same
four names. They are build-time values; setting only the project ID is insufficient.
The registered application's public configuration works without these overrides.

Google uses a popup so the app can remain hosted on GitHub Pages without a
cross-origin redirect-helper proxy. Popup blocking, dismissal, disabled providers,
network errors, and unauthorized domains produce actionable messages. Email sign-in
and guest access provide alternatives when popups cannot open.

## Data boundaries

- Firebase manages the account session; the app does not store passwords itself.
- Kuchipudi journals are local and separated by Firebase UID. Guest journals stay
  separate; signing in does not automatically import or upload them.
- Existing Raaga recordings and preferences remain browser-local and shared by
  people using that browser. They have not been migrated to account storage.
- The sign-in gate controls the app's UI, not access to browser storage by someone
  with access to the device or developer tools. It is not per-user authorization
  for recordings; future hosted recordings need backend rules and ownership.
- Camera takes stay in memory and are discarded when leaving the dance module or
  changing accounts. Learners can explicitly download a take before leaving.
- Teacher demonstration files are local object URLs, not cloud uploads.
- AI grading is a separate, explicit action: Raaga sends derived pitch measurements
  and lesson notes to Anthropic; Kuchipudi sends 16 timestamped JPEG frames and
  lesson notes. The original media file is not uploaded. Reviews can be downloaded
  and are otherwise discarded when leaving the review page. Cancelling or signing
  out aborts the request; it cannot retract evidence already sent to Anthropic.
- Firestore, cloud media storage, teacher roles, and cross-device progress are not
  part of this authentication integration. Client-side UI roles must not be treated
  as authorization for future backend resources.

## Development and verification

```sh
cd web2
npm ci
npm test
npm run build
npm run dev
```

An optional development-only `VITE_FIREBASE_AUTH_EMULATOR_URL` can point to a local
Firebase Auth emulator, for example `http://127.0.0.1:9099`. It is ignored by
production builds. Use a complete demo-project environment override when testing
against an emulator.

Tests cover auth state transitions, config overrides, Firebase delegation, error
messages, account isolation, corrupted journal data, storage failures, and camera
permission/cleanup races. They do not create production users or send emails.

References: [Firebase web setup](https://firebase.google.com/docs/web/setup),
[Google sign-in](https://firebase.google.com/docs/auth/web/google-signin),
[email/password authentication](https://firebase.google.com/docs/auth/web/password-auth).
