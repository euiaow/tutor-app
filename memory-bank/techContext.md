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
- **As of session 8, the project has an actual git history again** — the
  user committed and pushed everything up through session 7 plus most of
  session 8 in one commit (`3e365a3`, 2026-07-30), ending a streak of
  eight-plus sessions of deploy-only uncommitted work. Don't assume
  `git status`/`git log` are still meaningless the way earlier memory
  entries describe — check them fresh each session; this may or may not
  continue as a habit.

## Technical constraints

- **Domain is finalized (session 10)** — `APP_URL` (`functions/index.js`)
  and the student registration-link domain (`telegram.js`/`vk.js`) both
  point at the real `https://princessschool-e678c.web.app`. No more
  hardcoded localhost/placeholder anywhere in `functions/`.
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
  batch." **Session 10: hit again, worse than ever (19 functions failed
  in one batch at one point) — the one-at-a-time retry loop still
  resolved every single one, no exceptions. Occasionally a solo retry
  itself fails once or twice more before succeeding (seen with
  `completeLesson` this session) — if that happens, wait ~60-90s
  (`ScheduleWakeup`/background sleep, not a blocking foreground sleep)
  and retry solo again rather than escalating to a full batch retry.**
- **A related but distinct deploy-reliability issue found session 10: a
  function's Cloud Run service can end up missing its
  `allUsers`/`roles/run.invoker` IAM binding**, most likely as a side
  effect of a deploy interrupted mid-way by the CPU-quota flake above —
  normally `firebase deploy` grants this automatically on a *successful*
  deploy, but it doesn't appear to get retroactively fixed by later
  successful deploys of *other* functions. Symptom is easy to mistake for
  a code bug: the client gets a generic `internal` error (or the action
  just silently no-ops), and `firebase functions:log --only <name>` shows
  **no real invocation trace at all** — the request is rejected at the
  Cloud Run IAM layer before the function's own code runs. Fix (gcloud,
  not available in this environment — hand the command to the user):
  `gcloud run services add-iam-policy-binding <service> --region=us-
  central1 --member=allUsers --role=roles/run.invoker`. **Cloud Run
  service names are always the function name lowercased** (no other
  transformation) — e.g. `cancelLessonDirectly` → `cancellessondirectly`;
  using the camelCase function name in the gcloud command 404s. A batch
  Cloud Shell script exists (see `activeContext.md`/`progress.md` session
  10 notes) that checks every `onCall`/`onRequest` export and fixes any
  missing bindings in one pass — `onSchedule`/`onDocumentWritten`
  functions must be excluded from it, they use a different (non-public)
  invoker by design and making them public would be a regression, not a
  fix.

## Dependencies worth knowing about

- **Two separate teacher-panel mockup source folders exist in the repo
  root**: `redesign teacher v1/rosy-reflections-main/` (the pink/rose
  teacher theme actually in use). **Three** separate student-page ones:
  `redesign v2` (session 7's migration, still the base of most of the
  current student page), and `redesign student v3/
  luminous-learn-dashboard-main/` (session 9's migration on top of it —
  new page background, `ExamRadar`, redesigned progress lists, redesigned
  lesson-history tags, login screen). When a task references "the mockup"
  for the student page, check *which* folder it means before assuming —
  v2 and v3 genuinely differ (e.g. v3's `--card`/`--border`/etc. are
  translucent where v2's port had deliberately kept them solid).
- No browser/DevTools automation tool exists in this environment — every
  visual bug diagnosis in this project has depended on the user manually
  running DevTools steps (Elements/Computed/Console) and pasting back the
  literal output. Don't guess or apply speculative CSS/JS fixes without
  that — see [[systemPatterns]]'s `@layer` and background-paint-order
  entries for a case where three guessed fixes were wrong before the real
  causes were found this way.
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
