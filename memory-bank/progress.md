# Progress

## What works (per commit history + code present)

- **Session 39 — fixed a real Google Calendar bug: cancelling one recurring
  lesson deleted the entire weekly series, not just that occurrence** —
  root-caused via real production logs (2026-09-03 incident: a `410
  "Resource has been deleted"` on a second cancel of the same slot), not
  synthetic tests. `cancelLessonDirectly`/`confirmCancellation`/
  `cancelGroupLesson` were calling `deleteLessonEvent` on a recurring slot's
  shared master `RRULE` event id — new `deleteLessonEventInstance`
  (`core/googleCalendar.js`, reusing `rescheduleLessonEvent`'s
  `calendar.events.instances()` lookup) now removes only the cancelled
  occurrence. Also fixed: `cancelGroupLesson`/`rescheduleGroupLesson`/
  `createExtraGroupLesson` were missing `GOOGLE_OAUTH_CLIENT_ID/SECRET` in
  their `onCall` secrets, silently no-opping every Calendar call they made.
  Added the systemic fix — new `ensureStudentCalendarEvents`/
  `ensureGroupCalendarEvents`, a Calendar-side self-heal analogous to the
  existing `ensureUpcomingLesson` Firestore self-heal, wired into the same
  daily `dailyReminderMidday` cron — since previously a lost Calendar event
  stayed lost forever unless the teacher happened to edit the schedule.
  Repaired the two real students already broken by the pre-fix bug via a
  temporary scoped diagnostic (deployed, invoked, deleted immediately after).
  Also this session: fixed a real new-device `npm run dev` failure (stale
  `node_modules` missing Rolldown's native binary, then Vite 8 binding only
  to IPv6 loopback), audited a public-repo secrets scare (nothing sensitive
  had actually leaked, but found and removed one genuinely leftover
  diagnostic function that was live and PII-exposed), and fixed `.gitignore`'s
  literal unresolved merge-conflict markers. Deployed (6 functions);
  committed (`3211610`, `fe400cb`). **Same session, parts 4-6 (2026-09-05)**:
  fixed a group-lesson dialog bug (materials section showing before the
  lesson was ever opened for completion — just needed the same gate the
  individual dialog already had); gave group-lesson completion a real
  `needsReview` mastery-flag (reused the field that already existed for
  individual lessons but was invisible to the teacher and disconnected from
  group completion — now derived per-attendee from their own rating in
  "Участники," surfaced as the same `RotateCcw` icon on both student-row's
  individual and group progress views, verified 7/7 via a temporary
  Admin-SDK diagnostic); found and fixed a real ordering bug in
  `collapseGroupLessons` (`TeacherDashboard.jsx`) that always sorted every
  individual lesson before every group lesson, discarding Firestore's own
  date order — invisible on "Ближайшие уроки" only because a downstream
  function happens to re-sort, fully exposed on "Прошедшие уроки"; and
  reworked the blue theme's student-side background (dropped the leftover
  photo, reused the teacher panel's blob-glow look, fixed a z-index bug
  between two simultaneously-mounted background instances, settled on an
  opaque white base per the user's own final spec after three iterations).
  Deployed to hosting twice; not yet committed. Full detail:
  `activeContext.md`.
- **Session 39, part 7 (concurrent with parts 1-6 above, in the same
  working tree) — new teacher Settings toggle "Не уведомлять о финансах"**
  (`muteFinanceNotifications` on `teachers/{uid}`) mutes only the teacher's
  own low-balance notification (bell + bot, not just the bot mirror) —
  first-ever per-teacher-preference gate in `functions/core/notifier.js`'s
  shared `createNotification` funnel (`FINANCE_NOTIFICATION_TYPES`),
  separate from the pre-existing per-student `autoRemindLowBalance`.
  Deployed (hosting + all Cloud Functions, clean first attempt). Two other
  topics discussed the same session produced a plan but no code: a
  "positive framing" redesign for the student dashboard's stats (parent
  psychology — make effort visible even when outcomes plateau; flagged the
  existing binary `covered` topic flag as the actual cause of a stalled-
  topic red flag), and a full Firestore/Storage/Auth reset + teacher-clone
  plan for building 10 demo accounts (`functions/scripts/wipeDatabase.js`
  written, dry-run only, not run). Full detail: `activeContext.md` (Part 7).
- **Session 38 — full cascade-delete built for teacher/student/group
  tenancy levels (none existed for teachers before), plus a real production
  cleanup of 23 orphaned students** — `deleteTeacher` didn't exist at all
  before this session, so deleting a teacher's Firebase Auth account (the
  only removal path that existed) left 100% of their Firestore data behind
  forever; this is confirmed as the actual cause of "the database doesn't
  clean up," not a hypothetical. `deleteStudent` itself was also
  incomplete — it never cleaned up `programs`/`balanceLedger`/`inventory`/
  `decoration`/`coinLedger` or the student's own `notifications`, and never
  removed a deleted student from group `memberStudentIds`. New
  `deleteTeacherAccount` (admin-only, `AdminDashboard.jsx`'s type-to-confirm
  "Удалить учителя") cascades through every group/student/template/token/
  notification a teacher owns, then the teacher doc and Auth account itself
  — this is now the only correct way to remove a teacher. Ran the real
  cleanup against production: found and removed 2 orphan teacherIds' worth
  of already-orphaned data (23 students plus all their nested data, 3
  templates, tokens, ~50 notifications) via a dry-run-then-execute temporary
  diagnostic, verified 0 orphans remain, current teachers' data untouched.
  Deployed (`functions:deleteTeacherAccount`, `functions:deleteStudent`,
  hosting); code not yet committed. Full detail: `activeContext.md`,
  `systemPatterns.md`'s new cascade-delete entry.
- Sessions 31-37 (color-theme system rearchitected as a real registry with
  5 real bugs found along the way; sticker-workshop button/zone-offset
  nudges and case-opening reel timing corrected across several rounds,
  ending in one continuous easeOutQuint deceleration; a real stale-CDN-cache
  infrastructure bug found and fixed in `firebase.json`, explaining why
  several of those visual fixes "weren't showing up" for the user) — full
  detail archived in `changelog/2026-08-august.md` (2026-09-04 batch).
- **Session 30 — quick polish on session 29's group work** — group hourly
  rate now sums member rates (was a min–max range); student's own subject
  row is now a tag pill matching the group's; group program's name/percent/
  actions row moved above the topic tiles with a real progress bar, bold;
  group's "Следующие занятия" rebuilt to match the student page exactly
  (real occurrence as a full `UpcomingLessonCard`, further ones as
  `VirtualLessonRow` placeholders) — a real circular-import risk between
  `upcoming-lesson-card.jsx` and `groups-section.jsx` was caught and fixed
  by relocating `GroupRescheduleDialog`/`GroupCancelDialog` into
  `group-lesson-dialog.jsx`. Frontend-only, hosting redeployed. Full
  detail: `activeContext.md`.
- **Session 29 — group lessons collapsed to one card in "Ближайшие уроки"
  (was N per-member duplicates), group programs deduplicated against
  individual assignments, group detail page redesigned to match the
  student page, group deletion now cascades program cleanup** — direct
  follow-up closing gaps in session 28's rearchitecture. `TeacherDashboard.jsx`
  now collapses group lesson mirrors by `groupLessonKey` into one synthetic
  card before rendering (was showing one row per attendee). A student
  individually assigned a subject AND in a group teaching it no longer gets
  two diverging program docs — the group's program is no longer a separate
  stored copy, just a `programTemplateId` pointer; assigning it reuses a
  member's existing program (tagged, not duplicated) or creates one fresh,
  and the group's displayed progress is computed by intersecting every
  linked member's own real program at read time — marking a topic covered
  from the group view now genuinely reaches each student's own progress
  (it never did before). Deleting a group now unlinks/deletes the programs
  it assigned (only the narrower "delete program" path did this before).
  Group detail page: `grid md:grid-cols-3` info-panel-plus-program layout
  matching the student row's own, every sub-block now bordered (was
  blending into a plain white background). Both the lesson-mirror pipeline
  and the program dedup/propagation pipeline verified via deployed-and-
  deleted diagnostics against live throwaway data. Deployed (functions,
  hosting). Full detail: `activeContext.md`.
- **Session 28 — group-program delete root-caused (stale pre-fix data, not
  a bug) + group lessons rearchitected onto real per-student lesson mirrors**
  — the group-program cascade-delete fix from session 24 was confirmed
  correct via production logs; the 4 programs the user saw not detaching
  simply predated that fix's deploy time by ~20 minutes in the same
  session, nothing to fix. The bigger change: a group lesson is no longer
  its own doc under `teachers/{uid}/groups/{groupId}/lessons` — it's now
  one real `students/{id}/lessons` mirror doc per member (tagged
  `isGroupLesson`/`groupId`/`groupLessonKey`), so it shows up for free in
  every existing per-student mechanism (teacher's "Ближайшие уроки" feed,
  all 3 reminder tiers, weekly income, the student's own next-lesson/
  history/materials) instead of a parallel group-specific implementation of
  each. Reschedule/cancel are teacher-only, immediate, whole-group actions
  (no propose/confirm dance) — individual-lesson entry points now refuse to
  touch a group mirror (`assertNotGroupMirror`) so a student's own bot
  commands can never desync it. Topic/assignment/material edits reuse the
  exact same individual-lesson functions, fanned out once per member.
  Removed as redundant: `functions/reminders.js`'s parallel group-reminder
  loop (~150 lines), `subscribeToIncomeGroupLessons`/
  `computeWeeklyGroupIncome` (finance-section.jsx), `StudentDashboard.jsx`'s
  dual "individual vs group nearest lesson" merge, and 4 of 7 group-specific
  notification message builders. Verified for real via a deployed-and-
  deleted diagnostic exercising create/reschedule/complete/extra/cancel
  against live throwaway data — all correct. Deployed (functions, firestore
  indexes, hosting). Full detail: `activeContext.md`.
- Sessions 24-27 (group lessons 11-item follow-up pass with a real
  cascade-delete bug fix; sticker positioning corrected twice more against
  real reference/device testing with a real stacking-order bug root-caused
  and one-sticker-one-slot enforced; Sticker Workshop modal gained a real
  mobile layout; small zone1/placement-picker polish) — full detail
  archived in `changelog/2026-08-august.md` (2026-08-24 batch, plus session
  25 archived there separately earlier). All still working per code
  present; sticker positions should be considered accurate as of session
  26, not "unconfirmed."
- **Six independent follow-ups: student Finance section, custom Settings
  dropdowns + a root-caused autofocus-glow fix, Group 69 art pinned to the
  sticker button, auto-pin the registration-link message on both bots
  (session 23)** — plus analysis-only groundwork (no code) for a future VK
  multi-tenancy split and a Google Calendar OAuth-warning fix, both
  explicitly deferred per the user's own instruction. New bilingual
  `StudentFinanceSection` (paid-lesson count + the same `balanceLedger`
  history the teacher sees, read-only) — **needs a new Firestore rule
  published before it'll show data**, see `activeContext.md`. New
  `GlassSelect` (student-side parallel of the existing `TeacherSelect`)
  wired into both Settings dialogs' timezone/language fields; the
  "orange glow on open" complaint was root-caused to a missing
  `initialFocus` on the student `GlassDialog`'s Popup (same bug/fix
  `TeacherDialogContent` already had) rather than just stripping ring
  classes. `Group 69.png` now pinned to the sticker-workshop button's
  right edge, height-scaled (not fixed-width) so it shrinks/stretches with
  the button. Telegram + VK now pin their own `PIN_SAVED` registration
  message right after sending it (`pinChatMessage`/`messages.pin`,
  best-effort, never affects registration success). Deployed
  (`telegramWebhook`, `vkWebhook`, hosting). Full detail:
  `changelog/2026-08-august.md`.
- **Group lessons follow-up: button placement, a real missing index, group-
  level curriculum programs (session 22)** — "+ Создать группу" now lives
  in "Ученики" until the first group exists, then moves to "Группы"
  (`groups` list lifted from `GroupsSection` into `TeacherDashboard.jsx`).
  Found and fixed 2 real bugs via a live diagnostic (not guessed): a
  missing composite index for the finance income query (`status ASC,
  teacherId ASC` — reversed field order from the existing individual-lesson
  index), and a completely missing Firestore Rule for the new
  `teachers/{uid}/groups/{groupId}/programs` subcollection (**still needs
  the user to add it — text in `activeContext.md`**). New: group-level
  curriculum programs (`assignGroupProgram`/`reassignGroupProgram`/
  `deleteGroupProgram`) — a shared/common progress checklist on the group
  itself, plus a real fan-out that assigns the same template to every
  member individually (reuses `assignCurriculumTemplate` unmodified, so
  each student's own dashboard keeps working exactly as before). Verified
  end-to-end via a real deployed diagnostic against actual Firestore data,
  not just a clean build. Full detail: `changelog/2026-08-august.md`.
- **Placed decoration stickers now render on the live student dashboard
  (session 21)** — closes the gap open since session 17 (placement wrote
  real data via `saveDecoration` but nothing outside the sticker-workshop
  modal ever displayed it). Extended `DECORATION_ZONES` 3→5
  (`zone1`..`zone5`, backward-compatible with existing zone1-3 data) in
  both the Cloud Function's validation gate
  (`functions/core/gamification.js`) and the client
  (`src/firebase/gamification.js`), and the modal's own zone-picker
  (`ZONE_DEFS` in `sticker-workshop-modal.jsx`, a generic `.map()` so
  extending the array was the only change needed there). New
  `DecorationZone` component (`src/components/student/decoration-zone.jsx`)
  reads `decoration`/`inventory` off the existing `GamificationProvider`
  context and renders each zone's placed sticker (or nothing) as a
  `position:absolute` child of its own `position:relative` anchor card —
  zone1/2/3 anchor to the "Следующий урок" card, zone4/5 anchor to
  whichever card renders for the student's first program
  (`ExamRadar`/`CurriculumProgressCard`, gated by a new `showDecoration`
  prop). Because every zone anchors to its own card rather than the page,
  the pre-existing notifications banner between the lesson card and the
  goals section reflows the layout (and every zone with it) automatically,
  with no new banner-aware code. zone2/zone3 sit in the page's side
  margins on desktop, move to a card-corner overlap on mobile (≤640px,
  matching zone1/zone4's corner treatment) via Tailwind's `sm:` breakpoint
  — a `--sticker-max` CSS var (`src/index.css`) caps a sticker's longest
  edge at 130px desktop / 76px mobile while preserving its real aspect
  ratio. A new `stickerPlaceholderColor` (`src/lib/stickerColors.js`)
  gives the live dashboard its own deterministic per-sticker color,
  deliberately not reusing the modal's own unexported `hashColor`/`ink`
  (scoped to that component's separate arcade palette) — every real
  sticker still has an empty `imageUrl` today (no pixel art uploaded yet),
  so this placeholder path is what actually renders right now. **No live
  browser measurement was possible** (same standing environment gap as
  sessions 17-19) — offsets are reverse-engineered from a reference
  screenshot's proportions plus the real JSX structure, not pixel-measured
  against a running page; flagged for a real-DevTools check next session,
  particularly at desktop widths between ~640-810px where the page's side
  margins get tight. Full detail: `changelog/2026-08-august.md`.
- Sessions 12-20 (multi-tenancy Phase 4a + Firestore Rules published,
  fixing a real tenant-isolation bug class along the way — see
  [[systemPatterns]]; full timezone-handling rewrite, same reasoning;
  multi-program support + migration run; free-form exam types/subjects;
  per-slot subject binding + language-level topic progression; student-page
  i18n with bilingual site+bot notifications, plus a real `isSlotEqual`/
  timezone bug found via live diagnosis; gamification MVP through Sticker
  Workshop's full arcade-cabinet UI, visual polish pass, and MYTHIC case
  art; group lessons v1, all 5 phases in one pass) — full detail archived
  in `changelog/2026-08-august.md`. All still working per code present;
  superseded specifics (group lessons v1 → sessions 22-30's rearchitecture,
  Sticker Workshop → session 21's live-dashboard rendering) noted where
  relevant above.
- Sessions 2-11 (teacher/student auth, weekly multi-slot schedules,
  homework/materials, reschedule/cancellation flows, Telegram+VK bots,
  reminders, Google Calendar sync, VK idempotency guard, unified
  notifications funnel, balance tracker, curriculum templates (4-phase
  feature), `/app` entry point + self-service signup, two student-page
  visual migrations, teacher-panel modal-breakage root causes, Google
  Calendar disconnect, mobile-layout pass, Telegram contact-link fixes) —
  full detail archived in `changelog/2026-07-july.md` (sessions 2-8) and
  `changelog/2026-08-august.md` (sessions 9-11). All still working per
  code present; nothing here superseded.

## Known issues / open items

- **`rescheduleStatus` never clears back to `null` after a confirm
  (found session 16, not fixed)** — `syncUpcomingLessonToSchedule`'s
  `if (existingLesson.rescheduleStatus)` skip-check treats any truthy
  value, including a long-resolved `"confirmed"`, as "has an active
  reschedule, don't touch the date" — permanently freezing that lesson's
  `date` against any future schedule-driven recompute (e.g. the timezone
  fix below). Needs a decision: clear `rescheduleStatus` back to `null`
  on confirm, or narrow the skip-check to only the two `pending_*`
  values. See [[activeContext]].
- **Any student whose schedule predates the session-16 `isSlotEqual` fix
  still has a stale, wrong `lesson.date` until the teacher re-opens and
  re-saves that student's schedule once** (a no-op save is enough — the
  fix is in the trigger's diff check, not the data itself). Not
  backfilled proactively for every student. See [[activeContext]].
- **Resolved session 21**: placed decoration stickers now render live on
  the dashboard (5 zones); positions were later corrected twice more
  against real user testing (sessions 25-26) and should now be considered
  accurate, not just "unconfirmed" — see `changelog/2026-08-august.md`
  (session 21) and `activeContext.md` (sessions 25-26).
- **From session 23, action required (status unconfirmed)**:
  `students/{id}/balanceLedger` has no public read rule — the student
  Finance section will `permission-denied` until one is published. Exact
  rule text in `changelog/2026-08-august.md` (session 23 entry).
- **Gamification's 3 collections (`stickerSets`, `students/{id}/inventory`,
  `students/{id}/decoration`) now have published Firestore Rules — plain
  `allow read: if true` on all three, confirmed session 17** (root cause
  of "cases don't show up in the modal" right after the session-17 UI
  migration shipped — the modal's `subscribeToStickerSets` was getting
  `permission-denied` silently swallowed into `console.error`, so it just
  looked like empty data). Verified fixed with the established unauthenticated
  client-SDK read pattern (`techContext.md`), not just by reading the rules
  text — `stickerSets` (4 docs), a real student's `inventory` (2 items) and
  `decoration` (1 doc) all read successfully with no auth session, matching
  exactly what the student dashboard's own browser session does. No write
  rule was needed for `inventory`/`decoration` — both are only ever
  mutated through `openCase`/`saveDecoration` Cloud Functions (Admin SDK),
  never a direct client write.
- **No coin-earning mechanic exists (session 15)** — gamification spec
  only covered spending; a teacher has to grant `coinsBalance` by hand
  via Firestore Console to test the feature for now.
- **Notifications mark-as-read broken by a Rules gap (found session 14,
  fix drafted, NOT confirmed published)** — the `notifications/
  {notificationId}` rule's `allow update` was never actually written (a
  comment claimed it was "unchanged, still open" but no real `allow`
  statement existed), so every mark-as-read write silently
  permission-denied and rolled back. Rule text handed to the user; check
  next session whether it's live and mark-as-read actually sticks now.
  See [[activeContext]].
- No automated test suite in the repo.
- **Git commit hygiene — clean again as of session 39, then diverged again
  by session 39's own parts 4-6.** Session 38's work (admin panel,
  cascade-delete) did get committed after all (`3f7be21`, `185f828`),
  reversing the "recurred" note from an earlier draft of this file; session
  39's parts 1-3 committed too (`3211610`, `fe400cb`). **Parts 4-6 (group
  dialog fix, needsReview, collapseGroupLessons fix, blue theme background)
  are deployed to hosting but not committed as of this writing** — mixed in
  the same working tree with the user's own separate, also-uncommitted
  `muteFinanceNotifications` feature (`functions/core/notifier.js`/
  `settings-dialog.jsx`/`firebase/teachers.js`, already documented in
  `systemPatterns.md`) and an untracked `functions/scripts/wipeDatabase.js`
  — both explicitly hands-off this session, not reviewed. **New session-39
  finding, unrelated
  to hygiene**: the repo (`euiaow/tutor-app`) is public on GitHub — `.env`
  and `secrets-backup.zip` were briefly in its history (deleted by the user
  in `9b45b7e`/`cb75b51`) but contained nothing actually sensitive (public
  Firebase client config; a harmless lock file) — see `activeContext.md`
  session 39 for the full audit. Don't assume "public repo" was already
  known/flagged before this session; it wasn't documented here previously.
- **Student-dashboard stats "positive framing" — design discussed session
  39 part 7, no decision made, nothing coded.** The only existing "result"
  signal on the student dashboard is a binary `covered` flag per curriculum
  topic (`functions/core/curriculum.js`) — a student stuck on one topic for
  several lessons makes the displayed percentage stall visibly, reading as
  a red flag rather than "needs more attention." 5 options were discussed
  (effort counters, multi-state topic status with partial credit, recency
  framing, narrative status text, gamification badges) — see
  `activeContext.md` Part 7 for the full breakdown and recommendation.
  Needs the user to pick a direction before any code changes here.
- **Full Firestore/Storage/Auth reset planned, not executed (session 39
  part 7)** — `functions/scripts/wipeDatabase.js` written (dry-run
  `--mode=report` by default, real deletion needs `--mode=execute
  --confirm=WIPE_EVERYTHING`), covers every Firestore collection except the
  global `stickerSets` catalog, `materials/**` in Storage, and every Auth
  user. Purpose: reset to 2 real teacher accounts + 10 cloned demo accounts
  (3 students + 1 group + curriculum templates each, no schedule/calendar/
  bot data). Next step is the user running `--mode=report` and sharing the
  counts — this sandbox has no ADC to run it. The teacher-clone script
  (showcase account → 10 accounts) isn't written yet.
- **Migration run (session 13)**: `migrateToPrograms.js` ran — 2
  programs migrated, 2 flagged for manual review (unresolved
  `examTypeId`, disposable test data, not fixed further per user
  instruction). Old `curriculumProgress/main` docs left in place as
  backup.
- `notifications/` collection has the same list-query tenant-isolation
  shape the session-12 Rules fix applied to six other queries, but was
  explicitly left alone per user instruction — a known,
  deliberately-deferred gap, not forgotten.
- **Three distinct Cloud Functions deploy-failure classes, all
  documented in [[techContext]] with their fixes** — a CPU-quota flake
  during batch deploys (fix: retry failed functions one at a time), a
  function silently missing its `allUsers`/`run.invoker` IAM binding
  after an interrupted deploy (fix: `gcloud run services
  add-iam-policy-binding`, service name = lowercased function name), and
  a function that was simply never included in a deploy command at all
  (fix: check `firebase functions:list` before assuming a code bug).
  Check there first for any `internal`-error deploy symptom.
- Curriculum templates feature (session 7) still has no dedicated
  end-to-end manual verification pass on record (create/edit/delete a
  template, assign/replace on a student, mark topics covered, row-list
  progress display).
- `functions/scripts/migrateSchedule.js` — still unconfirmed whether the
  backfill has ever actually been run against production Firestore.
- `vkProcessedMessages/` has no TTL/cleanup — grows unbounded, one doc
  per incoming VK message.
- **Student "Отменить урок" button — long-standing, never confirmed
  resolved.** Flagged unresolved since session 4 (log evidence ruled out
  the `unauthenticated` hypothesis at the time); possibly fixed as a side
  effect of session 10's Cloud Run IAM-invoker fix (same symptom shape:
  client action does nothing, no server trace), but never explicitly
  re-tested since. Confirm with a live click-through before removing this
  line either way.

## Evolution of decisions

- Reschedule/cancellation started as teacher-only actions and were
  extended to be dual-actor (student-initiated too) — reflected in the
  `initiator`/`confirmedBy` role params added across `proposeReschedule`,
  `confirmReschedule`, `proposeCancellation`, `confirmCancellation`, with
  backward-compatible defaults to `"teacher"` for existing callers.
- Homework dialogs were unified into a single component (`e07e9f3`)
  rather than separate assign/review dialogs.
- VK support was added after Telegram was already working, following the
  same webhook-adapter pattern (`functions/adapters/vk.js` mirrors
  `telegram.js`).
- Per-flow direct `sendReminderToStudent`/`sendMessageToTeacher` calls were
  consolidated into one `createNotification()` funnel once an in-app
  notification UI was needed — logging and bot-dispatch used to be the
  same call, now they're deliberately decoupled (Firestore write always
  happens, bot send is best-effort) so the in-app feed can't silently miss
  events just because a student's bot link is stale.
- `addLessonMaterial` moved from a direct client Firestore write to a
  callable specifically to let the backend trigger a notification on
  attach — otherwise would have stayed a direct write like
  `updateLessonTopic`.
