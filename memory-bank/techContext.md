# Tech Context

## Frontend

- React 19 + Vite 8, React Router 7.
- Tailwind CSS 4 (via `@tailwindcss/vite`), `tw-animate-css`, `shadcn` +
  `@base-ui/react` for primitives, `class-variance-authority` + `tailwind-
  merge` + `clsx` for variant styling.
- `lucide-react` for icons.
- Firebase JS SDK (`firebase` ^12) for Auth/Firestore/Callables from the
  client (`src/firebase/*.js`).
- `react-i18next` + `i18next` (session 16) — **student-page-only**, via a
  dedicated `studentI18n` instance (`src/lib/i18n.js`), never the global
  singleton. The teacher panel has zero i18n dependency and stays that
  way by deliberate scope — see [[systemPatterns]] for the isolation
  mechanism and the "fork or pass a prop, don't add `useTranslation()`
  into a shared component" rule this establishes.

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

- **Color-theme derivation (session 31) depends on CSS relative-color
  syntax** (`oklch(from var(--accent-color) L C h)`) — a 2023-era CSS
  feature (Chrome 119+/Safari 16.4+/Firefox 128+). No fallback path exists
  for a browser without it; this hasn't been an issue reported so far but
  is worth knowing if a theme's derived colors ever look wrong only for
  one specific user. See `systemPatterns.md`'s theme-registry entry for
  the mechanism and two related var()-cascade gotchas already hit once.
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
  Cloud Shell script exists (see `changelog/2026-08-august.md`'s session
  10 notes) that checks every `onCall`/`onRequest` export and fixes any
  missing bindings in one pass — `onSchedule`/`onDocumentWritten`
  functions must be excluded from it, they use a different (non-public)
  invoker by design and making them public would be a regression, not a
  fix.
- **A third, distinct deploy-failure class (session 11), easy to confuse
  with the two above: the function was simply never included in any
  `firebase deploy --only functions...` command at all.** Surfaces
  identically from the client's perspective — a generic `internal`
  error — but the diagnosis is different and much simpler: run `firebase
  functions:list` and check whether the function is even present. This
  happens when a function is written across turns that include an
  explicit "don't deploy yet" instruction, and a later turn only runs
  `--only hosting` for unrelated frontend work — the backend code sits in
  the working tree, fully correct, and just never gets uploaded. Fix is
  trivial (deploy the missing function), but **don't jump to the
  secrets-array or IAM-binding checklists for a fresh `internal` error
  without first confirming the function actually exists on the backend** —
  check `functions:list` membership before reading logs.
- **A `hosting`-side deploy-reliability gap (session 37, frontend not
  functions): `firebase deploy --only hosting` can succeed completely and
  still not be visible to a user for up to an hour.** Root cause:
  Firebase Hosting's platform default caches `index.html` at the CDN edge
  (`Cache-Control: max-age=3600` was observed on the live response, with
  `X-Cache: HIT` serving a copy that in this case was well past even that
  stale-by-design window) — every hashed JS/CSS asset under `/assets/**`
  gets a fresh URL per build (Vite content-hashing) so *those* are never
  the problem, but the *entry HTML* referencing them can keep pointing at
  an old build indefinitely from the user's perspective. Symptom: a user
  reports a just-deployed visual fix "isn't showing up," and it's very
  easy to misread that as "the code fix must be wrong" and start
  re-tuning values that were already correct (this happened — three
  rounds of it before the deploy pipeline itself was actually checked).
  **Diagnostic**: `curl -sI https://<project>.web.app/ | grep -i
  'cache-control\|x-cache\|last-modified'` — a stale `Last-Modified` and
  `X-Cache: HIT` confirm this before assuming the code is wrong. **Fixed
  for good** by adding a `headers` block to `firebase.json`:
  `Cache-Control: no-cache, max-age=0, must-revalidate` on `**`, overridden
  back to `public, max-age=31536000, immutable` on `/assets/**` so the
  hashed bundle still gets to cache aggressively (safe, since a changed
  file always gets a new URL). Verify a header-config change actually took
  effect the same way — `curl -I` against both a bare route and an actual
  asset URL — since an initial attempt that scoped the rule to
  `source: "/index.html"` literally didn't apply to requests for `/`, even
  though `/` is rewritten *to* `/index.html` (Firebase headers match the
  *original requested path*, not the rewrite's destination).
- **A separate Firebase CLI flake (session 11), distinct from the
  CPU-quota one below**: `firebase deploy --only functions:<name>` can
  fail on its very first attempt with `"Error: User code failed to load.
  Cannot determine backend specification. Timeout after 10000."` — a
  source-analysis timeout during the CLI's own "Loading and analyzing
  source code" step, not a real error in the function code (confirmed via
  `node -e "require('./index.js')"` loading cleanly beforehand). A plain
  retry of the identical command succeeded. Different symptom from the
  CPU-quota flake below (that one fails at the Cloud Run health-check
  stage, after upload has already started) — same remedy either way
  (retry), but worth telling the two apart by which stage of the deploy
  log they fail at.

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
  managed entirely outside this checkout (Firebase Console). **Status
  changed session 12: the Console rules, previously an unpublished draft
  (real ownership checks written but not yet live — "in progress" per
  earlier sessions' framing), were published for real this session.**
  This immediately surfaced a class of tenant-isolation bugs that had been
  latent the whole time multi-tenancy was being built: several list/
  collectionGroup queries had no explicit `teacherId` filter and had only
  ever "worked" because the old draft/permissive rules never actually
  enforced ownership — see [[systemPatterns]] for the fix pattern and
  [[activeContext]] session 12 for the full list of affected queries.
  **There is still no local source of truth for the rules text itself** —
  only their *effects* are now visible from query behavior, which is a
  meaningfully worse diagnostic position than before (a permission-denied
  now has to be reasoned about from symptoms, not read off a rules file).
  **Session 14: this bit again, this time as a missing `allow update` on
  `notifications/{notificationId}`** — a comment claimed the field was
  "still open," but no real `allow update` statement existed, so every
  mark-as-read write silently rolled back client-side. Confirmed only
  because the user checked their own browser DevTools console for a
  `permission-denied` and pasted back the actual current rule text on
  request — that combination (ask for the console error, then ask for the
  literal rule block) is the only reliable diagnostic path available in
  this environment; don't guess at rules content. See
  `systemPatterns.md`'s "comment describing a rule" entry.
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
  Firestore instead of a clear "bad project id" error. **Session 16
  addendum: the file also has CRLF line endings** — splitting on `"\n"`
  alone leaves every line but the last with a trailing `\r`, which broke
  the regex-based key/value parser silently (only the very last line
  parsed; produced the exact same generic `INVALID_ARGUMENT` symptom
  above, easy to misattribute to the quoting issue instead). Split on
  `/\r?\n/`, not `"\n"`, when hand-parsing this file. For read-only
  diagnosis of live data this same session, when a plain client-SDK
  script hit `permission-denied` on a collection a real user isn't
  authenticated for (e.g. `teachers/{uid}`, or a `lessons` subcollection
  under Rules that require ownership), the reliable fallback — already
  established for `migrateToPrograms`/gamification verification — is a
  **temporary guarded `onRequest` Cloud Function** (Admin SDK bypasses
  Rules entirely): write it, `firebase deploy --only
  functions:<name>`, `curl` it, then `firebase functions:delete <name>
  --region us-central1 --force` and remove the code from `index.js`
  immediately after use. Don't try to work around a `permission-denied`
  by loosening a read pattern — reach for this instead.
- **`firebase-admin`'s `db.recursiveDelete(ref)` (session 38, first use in
  this codebase) deletes a document/collection and every nested
  subcollection in one call** — used for `teachers/{uid}` (picks up
  `groups`/`integrations`/`examTypes`/`customSubjects`/
  `subscriptionPayments` in one shot) and per-student subcollections
  (`programs`/`balanceLedger`/`inventory`/`decoration`/`coinLedger`) in the
  new cascade-delete logic (`systemPatterns.md`). Reach for this instead of
  hand-rolling a query-then-batch-delete loop any time a subcollection has
  no other side effects (Storage files, Calendar events) to clean up
  alongside the doc deletes — `lessons` still needs the manual loop because
  it does have those side effects per-doc.
- **`firebase-admin/auth`'s `getAuth()` had never been used in this
  codebase before session 38** — every prior admin-panel feature only ever
  read/wrote Firestore, trusting `request.auth.uid` from the callable
  context rather than calling the Auth Admin API directly.
  `deleteTeacherAccount`'s cascade calls `getAuth().deleteUser(teacherId)`
  (best-effort, `auth/user-not-found` treated as a normal case, not an
  error) and the one-off orphan-cleanup diagnostic used
  `getAuth().listUsers(1000, pageToken)` (paginated) to build the set of
  live Auth uids for orphan detection. No secrets/config needed for either
  — the Admin SDK's default credentials already cover Auth, same as
  Firestore.
