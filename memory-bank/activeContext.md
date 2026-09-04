# Active Context

_Last updated: 2026-09-04 (session 39)_

## Current work focus

### Session 39 — new-device migration audit, a leaked-secrets/PII scare that turned out mostly benign except one real leftover diagnostic, and a real Google Calendar recurring-series deletion bug root-caused via production logs

**Part 1 — new-device migration.** User's first session on a new machine.
`npm run dev` initially failed with `ERR_CONNECTION_REFUSED` — root-caused to
two independent things, not one: (1) `node_modules` was a stale partial copy
from the old device, missing Rolldown's native Windows binary (Vite 8 replaced
esbuild with Rolldown as its dependency-bundler — this session's own first
guess that it was esbuild was wrong and had to be corrected once
`node_modules/vite/package.json`'s actual `dependencies` were checked), fixed
by `rm -rf node_modules && npm install` (441 → 644 packages); (2) even after
that, Vite 8 was binding its dev server only to `[::1]` (IPv6 loopback), not
`127.0.0.1` — confirmed via `netstat`/`curl` from the user's own terminal
(this session's own sandboxed shell tools could not reach the user's real
localhost, a real environment gap worth remembering), fixed with an explicit
`server: { host: "127.0.0.1" }` in `vite.config.js`.

**Part 2 — secrets/GitHub audit.** User had found and deleted `.env` and
`secrets-backup.zip` from the public `euiaow/tutor-app` repo's git history,
worried real secrets had leaked. Checked the actual history rather than
guessing: `.env` only ever held the public Firebase client config (not a
real secret by Google's own model); `secrets-backup.zip` (extracted from
history) contained only `scheduled_tasks.lock`, a harmless local lock file.
Real secrets (bot tokens, OAuth secret) never touched git — always via
`defineSecret()`/Secret Manager. User chose not to rewrite history
(`filter-repo`/force-push) since nothing sensitive was actually exposed.
**Found one real issue while checking**: `.gitignore` had literal unresolved
git-merge-conflict markers committed into it since `e07e9f3` (worked by
accident — the `*.env` rule survived in the second half) — cleaned up.
**Found a second, more serious real issue**: a temporary diagnostic function
(`inspectUnresolvedProgramsTmp`, added in the Aug 30 commit `185f828`) had
never been deleted after use, contrary to this project's own standing
convention — it was still live in production, unauthenticated beyond a
trivial query-param key now sitting in the public repo's history, and
returned student names + teacher emails. Deleted from both the codebase and
the live deployment, confirmed both ways. **Lesson for future sessions**:
after any git-history/security audit, explicitly grep for `TEMPORARY
diagnostic` in `functions/index.js` and cross-check against
`firebase functions:list` — this class of leftover is easy to introduce
(the pattern is used often, per `techContext.md`) and easy to miss if only
skimming the latest commit's diff stat.

**Part 3 — the actual bug report: old unattended lessons piling up, then a
mass-cancel leaving "Ближайшие уроки" empty and Google Calendar blank for a
long time.** Root-caused via **real production `firebase functions:log`
evidence** (2026-09-03 ~19:28 incident), not synthetic tests — this turned
out to be more revealing and less risky than spinning up throwaway live
data would have been:

- `cancelLessonDirectly`/`confirmCancellation`/`cancelGroupLesson` resolved
  a recurring slot's *shared* per-slot `googleEventIds[slotIndex]` (the one
  master `RRULE:FREQ=WEEKLY` Calendar event standing in for every future
  occurrence of that slot — see `systemPatterns.md`) and called
  `deleteLessonEvent` directly on it — deleting the **entire recurring
  series**, not just the occurrence being cancelled. Confirmed from real
  logs: a first cancel per slot succeeded (series gone), a second cancel
  later referencing the same now-gone event got Calendar's `410 "Resource
  has been deleted"`. This is a general bug (reproducible on any single
  cancellation of a recurring lesson), not something specific to a long
  absence — the long-absence scenario is just what surfaced it, since it's
  the first time several slots got cancelled in one sitting.
- Fixed with a new `deleteLessonEventInstance` (`core/googleCalendar.js`,
  same `calendar.events.instances()` lookup `rescheduleLessonEvent` already
  used) — removes only the one matched instance, leaves the master series
  and every other occurrence alone. Wired into all three cancel paths,
  branching on `isExtraLesson` (a genuine one-off event still gets deleted
  outright via `deleteLessonEvent` — no series to preserve there).
- **Separate bug found in the same area**: `cancelGroupLesson`/
  `rescheduleGroupLesson`/`createExtraGroupLesson` were missing
  `GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET` in their `onCall`
  `secrets` config — `getAuthorizedClient()`'s `.value()` calls need those
  declared per-function (the exact secrets-array gotcha class
  `techContext.md` already documents), so Calendar sync for these three
  group actions was silently a no-op the whole time, swallowed by
  `getCalendarOrNull`'s own try/catch. Added the two secrets to all three.
- **Systemic gap this incident exposed**: `ensureUpcomingLesson` already
  lazily self-heals a missing Firestore "upcoming" draft (called daily from
  `dailyReminderMidday` — this is why the drafts eventually reappeared on
  their own, up to ~24h later), but nothing analogous existed for a missing
  Calendar event — `syncStudentScheduleToGoogleCalendar`/
  `syncGroupScheduleToGoogleCalendar` only fire on a genuine `scheduleSlots`
  diff, so once an event was gone (this bug, or any other cause) it stayed
  gone forever unless the teacher happened to make a real schedule edit.
  New `ensureStudentCalendarEvents`/`ensureGroupCalendarEvents`
  (`core/googleCalendar.js`) verify every slot's recorded event id still
  resolves to a live (non-tombstoned) event and recreate whatever's
  missing; wired into the same `dailyReminderMidday` cron next to the
  existing draft self-heal. **Non-obvious API behavior found while testing
  this**: a deleted Calendar event doesn't necessarily 404/410 on `get()` —
  it can come back successfully with `status: "cancelled"` (a tombstone),
  confirmed empirically (a first version of the repair diagnostic saw zero
  changes against two events already confirmed dead via the 410 logs,
  because it only checked for a thrown error) — `ensureSlotEventsExist` now
  checks the response body's `status` too, not just catch blocks.
  `isNotFoundError` also extended to treat `410` the same as `404`
  (previously a second delete attempt logged as a scary unhandled error
  instead of a graceful no-op).
- **One-off repair, done and verified**: the two real students
  (`maks-gru-07dc`, `kirill-ko-3a88`) already broken by the pre-fix bug were
  repaired via a temporary scoped diagnostic (deploy → curl → delete
  immediately after, per project convention — and actually deleted this
  time) — both got fresh recurring events, confirmed via before/after
  `googleEventIds` in the response. The one real group checked
  (`UCZUHZLAoUn16Cj4u7sT`) turned out never to have lost its event at all —
  ironically protected by the missing-secrets bug above (its delete call
  never actually fired).
- **Also confirmed non-obvious but correct**: `functions:shell` runs
  locally against production data but its output never reaches
  `firebase functions:log` (it's not a real Cloud Function invocation) and
  the shell can exit before an async handler like `dailyReminderMidday`
  actually finishes if you pipe input and close stdin immediately — not a
  reliable way to trigger-and-verify a production repair. The
  deploy-a-scoped-diagnostic-then-curl-then-delete pattern remains the
  right tool for anything that needs guaranteed-awaited completion plus a
  visible result.

Deployed: `functions:cancelLessonDirectly`, `confirmCancellation`,
`cancelGroupLesson`, `rescheduleGroupLesson`, `createExtraGroupLesson`,
`dailyReminderMidday`. Committed (`fe400cb` and the earlier migration-fix
commit `3211610`), not yet pushed.

---

### Session 38 — cascade-delete built for every tenancy level (teacher/student/group), plus a real production cleanup of 23 orphaned students left by a deleted test teacher account

The user reported the actual root cause behind "the database isn't cleaning
up": test teacher accounts had been deleted (Firebase Auth accounts removed)
at some point in the past, but **no `deleteTeacher` function ever existed at
all** — deleting the Auth account did nothing to Firestore, so every student,
lesson, program, template, token, and notification the test teacher ever
created just sat there permanently, invisible from the app (no `teachers/{uid}`
doc left to surface them anywhere) but still live in the database.

**Part 1 — cascade-delete logic, now the standing mechanism, not a one-off
fix:**
- `deleteStudent` (`functions/core/students.js`) was itself incomplete before
  this session — it only ever cleaned up `lessons`, registration tokens, bot
  sessions, Storage files, and Calendar events. Now also deletes `programs`,
  `balanceLedger`, `inventory`, `decoration`, `coinLedger` (all previously
  orphaned forever on student delete) and the student's own `notifications`,
  and removes the student from any group's `memberStudentIds` (otherwise a
  deleted student left in a group gets silently "recreated" the next time
  `ensureUpcomingGroupLessons` runs). New `keepGroupLessons` option (default
  true) leaves group-lesson mirror docs alone on a single-student delete, per
  explicit product decision — see `systemPatterns.md`'s new cascade-delete
  entry for the full mechanism and reasoning.
- Brand new `deleteTeacherAccount` (admin-only callable,
  `functions/core/admin.js` + `functions/core/teacherDeletion.js`) — the
  first-ever teacher-level cascade delete. Deletes every group, every
  student (full cascade above), curriculum templates, registration/connect
  tokens, notifications, oauth states, then `teachers/{uid}` itself
  (`db.recursiveDelete`) and the Firebase Auth account. Exposed as a
  type-to-confirm "Удалить учителя" button in a new "Опасная зона" section
  on each teacher's row in `AdminDashboard.jsx`. **This is now the only
  correct way to remove a teacher** — deleting the Auth account by hand
  (Console) still won't cascade to Firestore, reproducing the exact bug this
  session fixed.

**Part 2 — one-time production cleanup, already run and verified:** a
temporary guarded `onRequest` diagnostic (same "deploy, curl, delete"
pattern as prior sessions' `migrateToPrograms`/`isSlotEqual` diagnostics)
computed valid teacherIds as the intersection of the `teachers` Firestore
collection and live Firebase Auth users, found exactly 2 orphan teacherIds
(zero orphaned `teachers` docs themselves — the app's teacher list was
already clean), ran a `mode=report` dry-run first (reviewed with the user:
23 students + their lessons/programs/balance/gamification data, 3 curriculum
templates, tokens, ~50 notifications under one orphan teacherId; 1 stray
curriculum template under a second), got explicit confirmation, then ran
`mode=execute` — which just called the same `deleteTeacherData` cascade
`deleteTeacherAccount` uses, `deleteAuthUser: false` since an orphan by
definition has none. Verified via a second dry-run showing 0 orphans
remaining; the 2 real current teachers' data was untouched throughout. The
diagnostic function was deleted from both the deployed backend and the
codebase immediately after use, per this project's standing convention for
these temporary scripts.

**Deployed**: `functions:deleteTeacherAccount`, `functions:deleteStudent`
(updated cascade), hosting (admin panel UI). Code is not yet committed to
git — the user hasn't asked for a commit this session.

---

## Older sessions archived

Sessions 16-27's full write-ups (i18n rollout, gamification MVP + Sticker
Workshop phases 1-2 and its visual-polish/positioning follow-ups through
session 27, group lessons v1 through the 11-item follow-up round) moved to
`changelog/2026-08-august.md` (sessions 16-23 archived 2026-08-23; sessions
24/26/27 archived 2026-08-24 — session 25 was already archived there
separately). Sessions 28-33 (group lessons follow-up round, color-theme
registry rearchitecture) archived there too, 2026-08-27; sessions 34-37
(sticker/case-reel visual-polish rounds, the stale-CDN-cache infrastructure
bug) archived there too, 2026-09-04, to keep this file
focused on current work (sessions 38-39 now kept inline) — durable patterns
from all of these already live in `systemPatterns.md`/`progress.md`/
`techContext.md`. See `progress.md`'s own session-by-session summary for
what shipped in each.
