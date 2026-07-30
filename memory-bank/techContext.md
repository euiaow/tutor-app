# Tech Context

## Frontend

- React 19 + Vite 8, React Router 7.
- Tailwind CSS 4 (via `@tailwindcss/vite`), `tw-animate-css`, `shadcn` +
  `@base-ui/react` for primitives, `class-variance-authority` + `tailwind-
  merge` + `clsx` for variant styling.
- `lucide-react` for icons.
- Firebase JS SDK (`firebase` ^12) for Auth/Firestore/Callables from the
  client (`src/firebase/*.js`).

## Backend

- Firebase Cloud Functions v2 (`firebase-functions`), Node/CommonJS
  (`require`, not ESM) — note this differs from the frontend's ESM/Vite
  setup.
- `firebase-admin` (Firestore, Storage, FieldValue/Timestamp).
- `googleapis` for Google Calendar + OAuth2 + userinfo.
- Custom Telegram and VK Bot API adapters (no bot framework library) in
  `functions/adapters/`.
- Firestore as the only datastore; Storage for homework file uploads.

## Development setup

- `npm run dev` — Vite dev server for the frontend (root `package.json`).
- Functions have their own `functions/package.json` / `node_modules`
  (separate dependency tree, deployed independently via `firebase deploy
  --only functions` or similar).
- `firebase.json` / `firestore.indexes.json` configure Hosting/Firestore.
- `eslint.config.js` (flat config) + `npm run lint` for the frontend.
- `.firebase/hosting.*.cache` is a Firebase CLI artifact that shows as
  modified in git — not meaningful source, ignore when reviewing diffs.

## Technical constraints

- **App URL is hardcoded** in `functions/index.js`
  (`APP_URL = "http://localhost:5173/teacher"`, marked `// pending: заменить
  на боевой домен...`) — must be updated before/at production deploy.
- Students have no Firebase Auth identity — any function reachable from
  the Student Dashboard must not require `request.auth` and must trust
  `studentId`/role params from the request body (already a deliberate
  trade-off, not an oversight — see [[systemPatterns]]).
- Google OAuth is single-account (the teacher's one connected Google
  Calendar) — tokens stored centrally, not per-user.
- Reminders rely on Cloud Scheduler cron (`onSchedule`) with explicit
  `timeZone: "Europe/Moscow"` for the day-ahead reminder; the hourly one
  intentionally omits timeZone since top-of-hour is zone-invariant.
- **`firebase deploy --only functions` routinely fails a subset of
  functions with "Quota exceeded for total allowable CPU per project per
  region"** (Cloud Run health-check failure, us-central1) when deploying
  many functions at once — this is a project-level Cloud Run CPU quota,
  not a code problem. Don't try to "fix" this by changing function
  code/config. **Updated guidance (session 7, curriculum-progress
  session)**: retrying the *same failed batch together* did not help at
  all — two consecutive re-attempts of the identical 6-7 failed functions
  as one command failed the same way both times, zero progress. What
  actually worked: deploying the failed functions **one at a time**
  (`firebase deploy --only functions:<single-name>`, one command per
  function) with a ~45s pause between each — every single one succeeded
  on its first solo attempt, no further failures. This strongly suggests
  the flake is triggered by *concurrent* deploys competing for the
  region's CPU quota at the exact health-check moment, not a genuinely
  exhausted quota — so the fix is sequential, single-function retries,
  not "just retry the batch again" or "wait longer before retrying the
  batch."

## Dependencies worth knowing about

- `functions/scripts/migrateSchedule.js` is tracked in git (confirmed via
  `git ls-files` — no longer untracked, unlike earlier session notes) but
  still a manual one-off (`node functions/scripts/migrateSchedule.js`),
  not wired into deploy. Whether it's ever been *run* against prod
  Firestore is still unconfirmed — see [[activeContext]].
- `.claude/commands/` and `.claude/claude-memory-bank.md` define this
  project's own Memory Bank workflow commands
  (`workflow:understand/plan/execute/update-memory`) — this memory bank
  was initialized to support those.
- No `firestore.rules` or `storage.rules` file exists in this repo/git —
  neither is declared in `firebase.json` either. Security rules are
  managed entirely outside this checkout (Firebase Console, presumably).
  Confirmed this session: a plain unauthenticated Firebase client SDK
  script (no admin credentials) could read the whole `students` collection
  successfully — rules currently allow this, consistent with the
  students-have-no-auth architecture, but it means **there is no local
  source of truth for security rules to review before changing
  student-facing data access**.
- `gcloud` CLI is **not installed** in this environment — for Cloud
  Functions log/data diagnostics, use `firebase functions:log --only
  <name> -n <count>` instead (filter out `AuditLog` noise, see
  [[systemPatterns]]). For one-off Firestore reads without admin
  credentials, a small script using the client `firebase/app` +
  `firebase/firestore` SDK with the public config from `.env` works, but
  **must be run from the project root** (or anywhere with `node_modules`
  in scope) — Node ESM resolves bare imports relative to the script's own
  location, not `cwd`, so a script placed outside the project (e.g. a
  scratchpad dir) fails with `ERR_MODULE_NOT_FOUND` even after `cd`.
  Also note `.env` values in this repo are wrapped in literal double
  quotes (e.g. `VITE_FIREBASE_PROJECT_ID="princessschool-e678c"`) — a
  naive parser that doesn't strip them will pass the quote characters
  into the Firebase config and get a cryptic `INVALID_ARGUMENT` from
  Firestore instead of a clear "bad project id" error.
