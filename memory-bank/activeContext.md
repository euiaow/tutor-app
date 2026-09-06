# Active Context

_Last updated: 2026-09-06 (session 40)_

## Current work focus

### Session 40 — personal bot/VK fields don't survive teacher delete+recreate, blue-theme Calendar events hardcoded blue, and a real multi-program payment bug (`addPayment` silently dropping `programId`)

**Part 1 — "personal" Telegram bot/VK community fields disappear after deleting and recreating a teacher account.** User reported that setting `teachers/{uid}.telegramBotKey: "personal"` / `vkGroupId: "240507222"` by hand in Firestore Console didn't switch registration links off the shared bot/community. Root-caused via a temporary scoped diagnostic (deploy → curl → delete, per project convention) rather than guessing: the two live teacher docs (`admin@g.com`, `ask@love.ru`, both created 2026-09-05) had **neither field at all** (`typeof === "undefined"`, not a wrong type). Cause: the user had been iterating by deleting a teacher account (`deleteTeacherAccount`'s cascade wipes `teachers/{uid}` entirely) and creating a new one — a new Firebase Auth uid means a brand-new, blank `teachers/{uid}` doc (`ensureTeacherProfile`, `App.jsx`), so fields set on a since-deleted account can never carry over. Fixed for `ask@love.ru` via a second temporary write-diagnostic (before/after read confirmed `null/null` → `"personal"/"240507222"`, both strings). Both diagnostics deployed, curled, and deleted immediately after use, code removed from `index.js` — no leftover, unlike session 39's `inspectUnresolvedProgramsTmp` miss.

**Part 2 — blue dashboard theme now gets a hardcoded Calendar event color.** User's ask: for a teacher on the "blue" `colorTheme`, every Calendar event should render in a fixed blue instead of the existing per-subject hash color (`colorIdForSubject`/`colorIdForStudent`, `core/googleCalendar.js`). Added `getTeacherColorOverride(teacherId)` (reads `teachers/{uid}.colorTheme`, returns Calendar's own colorId `"9"` — Blueberry — only for `"blue"`, else `null`) and threaded an optional `colorOverride` param through every event-resource builder (`buildEventResourceForSlot`, `buildGroupEventResourceForSlot`) and every creation entry point (`syncScheduleSlots`, `syncGroupScheduleSlots`, `ensureStudentCalendarEvents`, `ensureGroupCalendarEvents`, `createExtraLessonEvent`, `createExtraGroupLessonEvent`) — `colorOverride ?? <existing per-subject calc>`, so every other theme is byte-for-byte unchanged. Deployed the 4 functions that don't depend on the concurrent session's own in-flight `programId` work (see Part 4): `syncStudentScheduleToGoogleCalendar`, `syncGroupScheduleToGoogleCalendar`, `dailyReminderMidday`, `resyncGoogleCalendar`. `createExtraLessonEvent`/`createExtraGroupLessonEvent` have the override in code but weren't deployed this session (see Part 4's reasoning) — will take effect whenever `createExtraLesson`/`createExtraGroupLesson` next deploy.

**Part 3 — the real bug behind "финансы у ученика — оплаты как будто не учитываются."** Root-caused, not guessed: `exports.addPayment` (`functions/index.js`) never destructured `programId` from `request.data` at all, always calling `core/finance.js`'s `addPayment(studentId, lessonsCount, note)` with no 4th argument — even though the frontend (`AddPaymentForm`) already lets the teacher pick which program a payment is for, once a student has 2+ programs, and already sent it. With `programId` missing, `resolveBalanceTarget` (`core/finance.js`) treats a 2+-program student's payment as "genuinely ambiguous" and credits `student.paidLessonsBalance` instead of the chosen program's own balance — but `student.paidLessonsBalance` is permanently frozen at 0 for any 2+-program student (`assignCurriculumTemplate`'s 1-to-2 transfer, `core/curriculum.js`, by original design) and **nothing in the UI displays that field once a student has 2+ programs** — every payment the teacher recorded for a specific program was landing in a bucket nobody ever looks at, reading exactly like "the payment wasn't counted." Two-part fix: (1) the `addPayment` callable fix itself — already present uncommitted in the working tree (see Part 4, this turned out to be the concurrent session's own in-progress work, verified correct by inspection and deployed as-is); (2) `src/components/student/finance-section.jsx` had the identical blind spot on the student-facing side — `StudentFinanceSection` was passed only the single `student.paidLessonsBalance` and never `programs`, so even a *correctly* per-program-credited payment would still show as "0" on the student's own dashboard. Added a `BalanceBadges` component (mirrors the teacher-side `SingleProgramBalance`/`MultiProgramBalanceRow` split already in `finance-section.jsx`, teacher) — one badge per program once `programs.length >= 2`, single badge otherwise — and wired `programs` (already loaded in `StudentDashboard.jsx` via `subscribeToPrograms`) through as a new prop. Also added the missing `entry.programName` label to the student-side ledger row (teacher's own `LedgerEntryRow` already showed it; student's didn't, even though `subscribeToBalanceLedger` already exposed the field). Deployed: `functions:addPayment`, hosting.

**Part 4 — a much bigger concurrent-session collision than session 39's.** `git status` was clean at this session's start; by the time of Part 3's git operations it showed **26 modified/untracked files** (+1284/-280 lines) — a large, actively-written feature spanning `core/finance.js`, `core/curriculum.js`, `core/groups.js`, `core/lessons.js`, most of the teacher/student finance and program UI, a new `resyncGoogleCalendar` callable + on-demand "Синхронизировать данные" button, a new `functions/core/teacherCloning.js` (teacher-account cloning, referenced by a since-self-deleted `testCloneTeacherAccountTmp` diagnostic this session found and grep-confirmed gone before committing — the other session cleaned up after itself correctly this time), and unrelated video-call-settings work. This session's own edits to files also touched by the other session (`googleCalendar.js`, `finance-section.jsx` student) applied cleanly with no Edit-tool conflicts. Per explicit user instruction (asked directly, given the scope and that this is a public repo), **committed and pushed everything as one commit**, not just this session's own 3 files — the user made that call knowingly after being shown the file list and line counts, not a default choice. See `techContext.md` for the standing "two sessions, one working tree" gotcha this reconfirms at larger scale.

---

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

**Part 4 — group-lesson dialog materials gate, and a real `needsReview`
mastery-flag architecture for group curriculum completion.** Two more user
reports.

- **Bug**: `group-lesson-dialog.jsx`'s "Дополнительные материалы" section
  rendered unconditionally, even before the lesson was ever opened for
  completion — the individual-lesson dialog (`homework-lesson-dialog.jsx`)
  already gated the identical section on `mode === "completing" ||
  isCompleted || isCancelled`; the group dialog just never inherited that
  condition when it was built. Fixed by adding the same gate, and un-gating
  the add/remove-material controls from a stale `isEditable` check
  (`status === "upcoming" && mode === "upcoming"`) that would otherwise
  never be true anymore inside the now-gated block — matches the individual
  dialog's own unrestricted-once-visible behavior exactly.
- **Feature, explicitly reused rather than reinvented**: the user wanted a
  way to flag "this student didn't fully grasp this topic" without
  permanently dragging the *group's* own displayed progress backwards
  (`getGroupProgramView`'s `covered` is computed as an intersection across
  members — see `systemPatterns.md`). Turned out `needsReview` already
  existed end-to-end for **individual** lessons
  (`markTopicsCovered`/`core/curriculum.js`: `needsReview = rating ===
  "needs_work"`, rendered as a `RotateCcw` icon on the **student's own**
  dashboard, `curriculum-item-groups.jsx`) — but two real gaps: (1) the
  teacher never saw this flag anywhere, on either an individual student or
  a group; (2) group-lesson completion went through the "manual toggle"
  path (`setCurriculumItemCovered`, `coveredVia: "manual"`, no rating
  concept at all), completely disconnected from each attendee's own
  rating already collected in "Участники". Fixed by threading `needsReview`
  (optional 6th param, backward-compatible) through
  `setCurriculumItemCovered`/`setGroupCurriculumItemCovered`, wiring
  `group-lesson-dialog.jsx`'s `handleComplete` to derive a per-student
  `needsReviewByStudentId` map straight from each attendee's own rating
  (`rating === "needs_work"`) instead of a new UI control, extending
  `getGroupProgramView`'s aggregate with `needsReview: some(...)` (`covered`
  stays `every(...)`, unchanged — the two are now genuinely orthogonal), and
  adding the same `RotateCcw`/`text-primary` icon to `CurriculumTile`
  (`student-row.jsx`, shared by both the individual-student and group
  progress views in the teacher panel) — first time a teacher can see this
  flag at all. **Tested via a temporary Admin-SDK diagnostic** (7 checks:
  default-args backward-compat, explicit needsReview/coveredVia, uncover
  resets both, per-student fan-out split, aggregate some/every, aggregate
  orthogonality, real Firestore round-trip) — 7/7 passed, one test-script
  mistake caught along the way (Firestore rejects `__wrapped__` doc ids as
  reserved, unrelated to the feature code).

**Part 5 — a real ordering bug in `collapseGroupLessons`, found while
chasing a "completed group lesson doesn't show in history" report that
turned out not to be a data/Rules/query problem at all.** The user
completed a group lesson dated for the next day (deliberately testing
early completion — confirmed there's no date guard anywhere, individual or
group, by design/absence, not a bug) and reported it vanishing from
"Ближайшие уроки" being falsely still-populated and "Прошедшие уроки"
showing nothing. Diagnosed via direct Admin-SDK inspection (temporary
diagnostic, deployed/curled/deleted) rather than guessing: **the backend
was 100% correct** — both completions in the logs succeeded fully (status
flipped, balance deducted, `ensureUpcomingGroupLessons` correctly
provisioned the next occurrence immediately, matching individual lessons'
own `ensureUpcomingLesson`-on-complete behavior), and the exact
`teacherId`+`status`+`orderBy(date desc)` query the app uses found all 8
completed group mirrors via Admin SDK. The "still shows a group lesson
tomorrow" complaint was correct, expected behavior (next occurrence
auto-provisioned) — but the real, actual bug: `collapseGroupLessons`
(`TeacherDashboard.jsx`) built its result as `[...individual,
...groupLessons.values()]` — **every individual lesson always sorted before
every group lesson, completely discarding Firestore's own `date`-ordered
result**, regardless of actual chronology. Invisible on "Ближайшие уроки"
only because `selectClusteredUpcomingLessons` happens to re-sort its own
input afterward (`a.date - b.date`) — "Прошедшие уроки" renders the
collapsed result directly, so the bug was fully exposed there. Fixed by
rewriting the function to build the result in one pass, inserting each
lesson (individual, or a group's first-seen mirror) at its actual
first-encountered position instead of partitioning into two lists — now
correct for both call sites, no defensive re-sort needed. **User's own
diagnostic step that cracked this**: asked them to open "Показать все
прошедшие уроки" (the full, unpaginated list) rather than the small
dashboard panel — confirmed the lesson wasn't dropped, just badly
mis-ordered ("in the middle, below lessons that happened earlier, should
be on top") — that one observation pointed straight at a sort-order bug
over a visibility/query bug.

**Part 6 — blue theme's student-side background: three iterations before
landing on the actual fix, a good example of how much a live browser would
have shortened this.** User's ask: the blue theme showed a background photo
for the student (`backgroundImage: "/bg/gr13.png"`) while the teacher's own
blue theme just showed the accent-tinted glow/blob look
(`TeacherDashboard.jsx`'s `bg-grain-blobs`/`blob-a`/`blob-b`/`grain-layer` —
**student-only** `StudentGrainBackground` has no equivalent, ever, for any
theme) — wanted the student's blue background replaced with that same blob
look, pink/amber left untouched.
1. First attempt: set `blue.backgroundImage: null` in `themes.js`, matching
   pink/amber. Wrong — revealed the plain pale gradient wash (same one
   pink/amber already show), not the blob glow the user actually meant by
   "the teacher's background."
2. Second attempt: made `StudentGrainBackground` accept a `themeId` prop
   and render the teacher's own blob markup when `themeId === "blue"`.
   Still didn't visually take effect — **root cause: two instances of this
   component are always mounted simultaneously** (an outer
   pre-theme-knowledge placeholder in `StudentDashboard()` itself, before
   `student.colorTheme` is known, plus the real themed instance once it
   is — the outer one is supposed to get "painted over" once the real one
   mounts, per its own existing comment). The outer instance had no
   explicit `z-index` while `.bg-grain-blobs` carries `z-index: -10` — the
   untamed (effectively 0) outer photo placeholder sat *above* the correctly
   -rendering inner blob layer and hid it completely. This had always been
   latently true for every theme, just never visible before because both
   instances used to render the identical photo-or-nothing treatment.
   Fixed by giving the plain-photo branch an explicit matching `-z-10` too,
   so equal z-index + DOM/mount order (inner mounts later) makes the
   correct, theme-aware instance consistently win.
3. User still reported a photo showing even after the z-index fix — rather
   than keep reasoning through `body:has(.themed)`'s own layered
   `background-image: var(--theme-bg-image), linear-gradient(...)` (whose
   exact custom-property-inheritance behavior across the body/nested-div
   boundary couldn't be verified without a live browser — **no
   browser/DevTools automation exists in this environment**, a standing gap
   this project has hit repeatedly per `techContext.md`), settled for a
   robust, environment-independent fix instead: gave the blue-theme blob
   wrapper an explicit opaque `bg-white`, so it physically occludes anything
   that might still be painting behind it regardless of the exact CSS
   mechanism. Matches the user's own final explicit spec verbatim ("2 блоба
   на белом фоне"). **Lesson**: for a pure CSS/visual bug in this
   environment, don't keep escalating into deeper inheritance/cascade theory
   when a request has already been restated twice — reach for a
   self-contained, opaque, "can't possibly be covered" layer sooner.

Deployed: `functions:cancelLessonDirectly`, `confirmCancellation`,
`cancelGroupLesson`, `rescheduleGroupLesson`, `createExtraGroupLesson`,
`dailyReminderMidday` (Part 3); hosting, twice (Parts 4-6). Committed
through `fe400cb`/`3211610` (Parts 1-3) — **Parts 4-6's code is deployed to
hosting but not yet committed**, alongside the user's own separate
in-progress work (`functions/core/notifier.js`/`settings-dialog.jsx`/
`firebase/teachers.js` — a `muteFinanceNotifications` teacher setting,
already documented in `systemPatterns.md` — explicitly hands-off, not
reviewed or touched this session) and an untracked `functions/scripts/
wipeDatabase.js` (also the user's own, also untouched). The frontend deploy
therefore already includes the user's own unfinished settings-dialog.jsx
UI (a switch with no backend effect yet, since `notifier.js` isn't
deployed) — done at the user's explicit instruction, not a default choice.

**Part 7 — the `muteFinanceNotifications` work referenced above, from its
own session, plus two design discussions that didn't produce code.** This
was a separate, concurrent Claude Code session running in the same working
tree at the same time as Parts 1-6 above — confirmed live, not assumed,
when an edit to this very file hit a stale-file error mid-session because
Parts 4-6 were being written concurrently. Two sessions editing the same
tree simultaneously is unusual enough to flag explicitly for any future
session that finds `git status` non-empty at start: **check file mtimes
against the last build/deploy time before assuming a deploy only shipped
its own diff** — this session's `npm run build` (10:10 AM) ran *after*
Parts 4-6's uncommitted edits (9:18-9:57 AM) landed on disk, so its hosting
deploy shipped both sessions' frontend work together, and its later
`firebase deploy --only functions` (after Part 7's own `notifier.js` change
was written) means **`muteFinanceNotifications` is now fully live,
backend included** — Part 3/6's note above that "`notifier.js` isn't
deployed" is now stale.

The shipped feature itself: a new teacher-only Settings toggle, "Не
уведомлять о финансах" (`muteFinanceNotifications` on `teachers/{uid}`) —
mutes only the teacher's own low-balance notification (in-app bell *and*
bot, not just the bot mirror) via a new `FINANCE_NOTIFICATION_TYPES` gate
in `functions/core/notifier.js`'s shared `createNotification` funnel (its
first-ever per-teacher-preference gate — previously unconditional for
every `target: "teacher"` call). Deliberately separate from the
pre-existing per-student `autoRemindLowBalance` (only ever gated the
*student's* own bot nudge on the same event). See `systemPatterns.md` for
the exact gating mechanism.

Two other topics from the same session produced a plan, not code, and
remain open for a future session:
- **Student-stats "positive framing"** — user wants the student dashboard
  (parent/student-facing only, teacher panel explicitly out of scope) to
  read as "the tutor is doing the work" even when outcomes (school grades)
  show no improvement, reasoned from parent psychology. Root problem: the
  only "result" signal today is `covered/total` topics (binary `covered`
  flag, `functions/core/curriculum.js`) — a student stuck on one topic for
  several lessons makes this stall visibly, reading as a red flag rather
  than "needs more attention." No grades/exam-score module exists at all.
  5 options discussed (cumulative effort counters; multi-state topic status
  with partial credit, replacing the binary flag; recency-windowed "this
  week" framing; narrative status text for stuck topics; gamification
  badges) — recommended combining the cheap frontend-only counters+recency
  now, with the multi-state-topic change as the real structural fix.
  **Nothing coded — next session should ask which option(s) to build.**
- **Financial-record privacy** — declined a request to design around
  hiding payment records from tax authorities (a firm boundary, not a
  judgment call — don't revisit if reworded). Confirmed as fact, though:
  `balanceLedger.amount` is a lesson count not currency
  (`functions/core/finance.js:36`), but `student.hourlyRate` (₽) plus
  lesson dates/durations still reconstruct a real revenue history, so
  "there's no financial trail" isn't true today. Offered, not built: an
  opt-out finance module per teacher, versioning Firestore Rules into the
  repo (currently Console-only).

**Also planned, not executed**: a full Firestore/Storage/Auth reset ahead
of rebuilding 2 real teacher accounts + 10 cloned demo accounts (3 students
+ 1 group + curriculum templates only, no schedule/calendar/bot data).
Decided order: wipe everything first, then build the showcase account from
scratch, then clone it into 10 accounts using the user's own list of email
addresses (each needs a real Firebase Auth user — this app keys
`teachers/{uid}` directly to the Auth uid, no impersonation path exists).
Wrote `functions/scripts/wipeDatabase.js` (dry-run `--mode=report` by
default; real deletion needs both `--mode=execute` and
`--confirm=WIPE_EVERYTHING`; excludes the global `stickerSets` catalog) —
**not run yet**, next step is the user running `--mode=report` and sharing
the counts. The teacher-clone script itself isn't written yet.

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
