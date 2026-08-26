# Progress

## What works (per commit history + code present)

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
- **Session 37 — real infrastructure bug found: `firebase deploy --only
  hosting` was succeeding but not reaching users for hours** — the user
  reported 3 separate rounds of "your fix isn't showing up" for changes
  that were, in fact, correctly deployed; `curl`-ing the live site's
  response headers confirmed `index.html` was being served from a stale
  CDN cache (`Cache-Control: max-age=3600`, `X-Cache: HIT`, `Last-Modified`
  hours old) — Firebase Hosting's platform default for HTML. Fixed with an
  explicit `headers` block in `firebase.json` (`no-cache` on `**`,
  `immutable` long-cache kept only on the content-hashed `/assets/**`
  bundle, which is genuinely safe to cache forever). Verified with `curl
  -I` against both a bare route and an actual asset URL, not just assumed
  from the config. **Every deploy from now on should be visible
  immediately** — see `techContext.md` for the general diagnostic
  (`curl -sI .../ | grep cache-control`) if a future "I deployed this, why
  doesn't it show up" report ever recurs. Full detail: `activeContext.md`.
- **Session 36 — placement-picker zone2 was rendering off the mockup's
  own edge (real bug), zone5/button offsets nudged again, case-opening
  reel simplified to one continuous deceleration** — **real bug found**:
  `ZONE_DEFS`' zone2 marker (`x:250,w:34`) extended 24px past
  `MiniDashboard`'s own 260px width, hanging off the interactive preview's
  edge (worse once session 27's 1.6× scale enlarged everything) — moved to
  `x:222`, now fits. zone5 nudged another 20px left (desktop only);
  sticker-workshop button's `Group 70` (mobile) shrunk 1px more and moved
  1px right. **Case-opening reel simplified to a single continuous
  deceleration** — dropped the medium-speed plateau entirely per an
  explicit new spec (three straight sessions had each introduced a fresh
  bug trying to get a fast→medium→stop shape right); now one CSS
  transition, one easing curve (easeOutQuint) for the whole 12s spin, no
  phase seams left for a bug to hide in. Full detail: `activeContext.md`.
- **Session 35 — zone5/button offsets diverged further, case-opening reel
  rebuilt from scratch to an explicit 12s spec** — zone5 desktop offset
  moved another 15px left; the sticker-workshop button's two image offsets
  (desktop `Group 69`, mobile `Group 70`) split into independent constants
  and nudged 2px/1px right respectively, `Group 70` shrunk a further 3px.
  **Case-opening reel rebuilt from scratch** (not patched again) to a new
  explicit spec: 12s total (was 9s) — fast start, smooth fast→medium over
  the first 3s, constant medium for the next 3s, smooth medium→0 over the
  final 6s. Distance ratios (0.42/0.29/~0.29) are derived from that speed
  story (documented in the code, not another guess) rather than picked to
  "look about right." Full detail: `activeContext.md`.
- **Session 34 — sticker-workshop button art nudged again, zone5 split
  desktop-only, and the case-opening reel's wrong motion root-caused for
  real (bad easing curves, not bad ratios)** — `Group 70` (mobile button
  art) shrunk another 3px, both button images shifted 1px further right
  together. `zone5` (`ExamRadar`) is the first zone to need a breakpoint
  split since session 26 unified everything — desktop moved 5px further
  left, mobile untouched. **Real bug found**: the case-opening reel's
  reported motion ("fast → decelerates almost to zero → medium → sudden
  fast burst → stop") traced to the two bespoke bezier curves themselves,
  not the phase time/distance ratios (already correct since session 32) —
  both curves had a control point reaching ~85% of their own distance
  within ~15% of their own time, which reads as "sprint to the finish
  immediately, then crawl," not smooth deceleration. Replaced with named,
  well-known easing curves (easeOutQuad / easeOutQuart) instead of another
  hand-picked guess. Full detail: `activeContext.md`.
- **Session 33 — corrections to 2 of session 32's changes** — greeting
  emoji (✌️) moved out of the `header.greeting` translation string
  entirely (both locales) and into its own `hidden sm:inline` span, so it
  no longer costs line-height on mobile while staying byte-identical on
  desktop. Sticker-workshop button's desktop art reverted to `Group 69`
  (session 32 shouldn't have touched desktop at all — the user only ever
  wanted a mobile fix) — the button now renders both `Group 69`
  (`hidden sm:block`) and `Group 70` (`block sm:hidden`) instead of one
  globally-swapped image. Mobile-only layout fixes: title shortened to
  "Стикеры" (new `portalTitleShort` key, desktop keeps the full title),
  balance badge moved to its own line under the title instead of squeezed
  onto it, `Group 70` nudged another 3px shorter. Full detail:
  `activeContext.md`.
- **Session 32 — sticker zone1 restructured for mobile (real-device
  feedback), zone5 nudged, workshop button art swapped + mobile text
  shortened, case-opening reel timing corrected** — zone1 needed a real
  mobile-specific layout, not just a different offset: new
  `DashboardHeader` component (`useGamification()` can't see its own
  `<GamificationProvider>`'s value from the same render call, needs a real
  descendant) hides "Добро пожаловать" and lets the greeting wrap onto 2
  lines (natural word-wrap, no i18n changes) when zone1 is occupied, on
  mobile only; zone1 now renders twice — desktop-only inside
  `NextLessonPlate` (unchanged since session 26) and a new mobile-only
  instance anchored to the header itself, clearing the gear+avatar
  cluster. zone5 nudged left/up. `StickerWorkshopButton`'s art swapped
  from `Group 69.png` to a user-supplied ~20-30%-narrower `Group 70.png`
  (same height/offset fit) instead of algorithmically capping width, paired
  with hiding the hint line on mobile and `truncate`-protecting the title.
  **Real animation-shape bug fixed**: the case-opening reel's "3-phase
  spin" (session 18) had phase 1 as an *accelerating* curve so brief it
  read as "starts at a flat medium speed" instead of the intended
  fast-start — flipped to a genuine ease-out (fast→medium) and rebalanced
  all 3 phases' time/distance shares to match the explicit spec (fast
  start → medium plateau for ~half the total time → decelerate to a hard
  stop). All frontend-only, hosting redeployed each round. Full detail:
  `activeContext.md`.
- **Session 31 — color-theme system rearchitected as a real registry
  (background image + accent + 3 fixed text colors), 5 real bugs found and
  fixed** — replaced two fully hand-tuned ~30-variable CSS palettes
  (`.teacher-theme`/`.amber-scope`) with `src/lib/themes.js`'s
  `THEME_REGISTRY`: each theme is just 5 fields (`backgroundImage`,
  `accent`, `heading`, `subheading`, `text`, `radius`); everything else
  (`--card`, `--border`, `--shadow-*`, `--gradient-*`, decorative blobs) is
  derived from those via CSS relative-color syntax in one shared
  `index.css` block (`.themed`) — adding a theme is now a pure data change
  (confirmed live: user added a third theme, "blue", with zero CSS edits).
  Teacher's theme picker (previously `disabled`, dead code) is now live;
  teacher and student share one registry. Found and fixed 5 real bugs
  along the way: an invalid `oklch(... h)` reference outside `oklch(from
  ...)` silently broke white button text to black; `--gradient-warm` was
  never per-theme (student accent buttons/icons/tags stayed orange under
  any theme); `StudentGrainBackground` hardcoded one background image
  regardless of theme; `GroupLessonDialog`/`HomeworkLessonDialog` (both
  portaled to `document.body`) had a literal hardcoded pink theme class
  instead of `useThemeClass()` like every other portaled dialog; stale
  locale entries shadowed the registry's own theme labels, causing a
  name mismatch between the teacher and student pickers. Also added a
  `TeacherSelect` for "Тип шкалы" (was a native `<select>`). Deployed
  hosting + `functions:updateStudentSettings` (new theme id needs
  server-side validation too). Full detail: `activeContext.md`.
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
- **Git commit hygiene — recurred as of session 38, reversing session 16's
  "clean" note.** A large uncommitted diff has accumulated again: most of
  `functions/`, most of `src/`, and 3 fully untracked files
  (`functions/core/admin.js`, `src/firebase/admin.js`,
  `src/pages/AdminDashboard.jsx` — the admin panel built across sessions
  not yet captured in this changelog, plus session 38's cascade-delete
  work on top). Last real commit on record is `1be152b` ("отов бэкенд под
  темы, осталось задизайнить добавить"). Not committed per this project's
  standing rule (only commit when the user explicitly asks) — flagging
  this so a future session doesn't assume recent work is safely saved
  just because it's deployed; deployed and committed are independent here.
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
