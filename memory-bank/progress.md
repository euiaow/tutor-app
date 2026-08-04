# Progress

## What works (per commit history + code present)

- Teacher auth/login (`TeacherLogin.jsx`, `components/auth/*`).
- Student registration via token link (`core/registration.js`,
  `generateRegistrationLink`/`cancelRegistrationToken`).
- Weekly recurring multi-slot schedules per student, with upcoming-lesson
  drafts auto-maintained per slot.
- Homework assignment + submission flow, unified into one dialog
  (`homework-lesson-dialog.jsx` per commit `e07e9f3`).
- Lesson completion (`completeLesson`) with history.
- Reschedule and cancellation propose/confirm/reject flows, reachable from
  both Teacher and Student dashboards, plus VK bot notifications
  (`824ec3c`).
- Telegram + VK bot webhooks, message building (`botMessages.js`).
- Daily (9:00 Moscow) and hourly reminder schedulers.
- Google Calendar OAuth connect + two-way schedule sync (create/update/
  delete events), student deletion cleans up calendar events.
- Multi-slot schedules (`scheduleSlots[]`) — deployed to production this
  session (previously only a local diff).
- VK message-retry idempotency guard (`vkProcessedMessages/`) — fixes
  duplicate homework submissions from a single photo send.
- Unified notifications system: `notifications/` collection +
  `createNotification()` funnel, teacher bell/panel, student block/modal —
  built and deployed this session, see [[activeContext]] for the one
  deliberate spec deviation and the not-yet-manually-verified checklist.
- Homework completion's attendance/homeworkDone/rating fields — restored
  after being accidentally dropped in an earlier pass.
- Typed homework-assignment notifications (`assignment_added` /
  `assignment_updated` / `material_added` for files, deduped by diffing the
  previous lesson doc) — deployed this session, see [[activeContext]].
- Extra (unscheduled) lessons — `createExtraLesson` callable, one-off
  Google Calendar event, teacher UI ("+ Доп. урок" + "доп." badge) —
  deployed this session.
- Dark-theme notification-row click highlight fixed (was a hardcoded
  `bg-gray-50` with a manual `dark:` override; now one semantic
  `bg-muted/40` + `active:bg-accent`).
- Realtime `onSnapshot` subscriptions for student lesson history/materials
  (was one-time `getDocs`, required a page refresh to see new files).
- Student-side homework file upload from the web dashboard (previously
  bot-only) — shares the same `recordHomeworkSubmission` backend path and
  Storage bucket path as the bots. **Not yet verified against live Storage
  security rules — see [[activeContext]] loose ends.**
- Contact button (teacher → student, "Написать" + editable link override)
  in `student-card.jsx` and the teacher's "Ближайшие уроки" list.
- Student profile 2.0: subject(s)/exam target/hourly rate fields +
  editable form on the student card.
- Paid-lessons balance tracker: `balanceLedger/` subcollection per
  student, `addPayment`/`deductLessonFromBalance` in
  `functions/core/finance.js`, automatic 1-lesson deduction wired into
  `completeLesson` (covers both scheduled and extra lessons), low-balance
  notifications to teacher (always) and student (if
  `autoRemindLowBalance`). UI: balance + "Внести оплату" on the student
  card, and a new "Финансы" table/ledger section in `TeacherDashboard.jsx`.
- Extra-lesson notification (`extra_lesson_assigned`) to the student.
- `getNearestUpcomingLesson` — fixes "Подготовить урок" and bot photo
  uploads both ignoring extra (unscheduled) lessons in favor of the
  next scheduled slot; see [[systemPatterns]] for the read-vs-create
  distinction from `ensureUpcomingLesson`.
- Telegram contact link no longer silently builds a broken `t.me/<numeric
  id>` link — falls back to "не настроена" for bot-registered students
  until a real link is set manually. See [[systemPatterns]].
- Student tags (`src/components/student-tags.jsx`): subject(s) + exam
  target as small colored badges, one shared style map used by the
  student card, lesson-card badges, the Финансы table, and (thematically,
  not literally) Google Calendar event colors.
- Student card decluttered: balance/rate/payment button moved out
  entirely, now Финансы-only.
- Финансы table: "Предмет" column now shows tags instead of text; new
  "Оплата" column with an inline Popover payment form per row. Column
  renamed to "Теги" (session 5), now shows every tag (subjects + exam
  target), not a subset.
- Extra-lesson and low-balance bot notifications actually reach
  Telegram/VK now — both `createExtraLesson` and `completeLesson` were
  silently missing `TELEGRAM_BOT_TOKEN`/`VK_GROUP_TOKEN` in their secrets
  declaration, so `createNotification`'s bot-dispatch step failed with no
  visible error to the caller. Fixed in session 5, see [[systemPatterns]].
- Balance-popover ("+ Внести" in Финансы) no longer scrolls the page to
  top on submit — was HTML5 constraint validation intercepting the click
  before React's `onSubmit` handler ever ran; fixed by switching the
  submit button to `type="button"` with a plain `onClick`.
- `HomeworkLessonDialog`'s "Дополнительные материалы" block now correctly
  hidden while a lesson is still upcoming, shown only once "Урок прошёл"
  is clicked or the lesson is completed — each material now has a working
  delete button (`removeLessonMaterial`, direct `arrayRemove`).
- Telegram contact link now opens `tg://user?id=<id>` for bot-registered
  (numeric-id) students instead of giving up — opens the chat directly in
  the Telegram app; the "Написать" button is visually flagged amber when
  it's this auto-derived link rather than a manually confirmed one.
- Telegram Mini App groundwork: Web App SDK loaded, `ready()`/`expand()`
  called on mount, `openExternalLink` used for the one real external-link
  button that existed (`ContactButton`) plus the two new video-call
  buttons. Bot's post-registration message now hints at the menu button
  for Telegram students specifically. **Still needs a manual BotFather
  config step outside this repo before the menu button actually shows.**
- Video call button: one shared `integrations/videoCall` link the teacher
  sets once (Popover in the dashboard header), surfaced as "🎥 Начать
  урок"/"🎥 Подключиться" next to the reschedule/cancel buttons on both
  dashboards whenever a link is set — no per-lesson association, no time
  gating.
- Balance-popover scroll-to-top bug (session 6) — root cause confirmed
  via a real user-captured console trace: `autoFocus` on the payment
  form's number input raced ahead of Base UI's own position computation,
  focusing (and thus scrolling to) the element before the Popover was
  positioned. Fixed by removing `autoFocus`; temporary trace listener
  removed.
- Curriculum templates (session 7, Phases 1–2 of a 4-phase feature): new
  "Учебные планы" section in `TeacherDashboard.jsx` — create/edit/delete
  reusable program templates (`curriculumTemplates/` collection: name,
  examTarget, topics[], prototypes[]), admin content only, plain client
  Firestore CRUD, no Cloud Functions (Phase 1). A template can now be
  assigned to a student — `assignCurriculumTemplate` callable copies the
  template's topics/prototypes into a new singleton
  `students/{id}/curriculumProgress/main` doc (each item gets `covered:
  false`), records `curriculumSourceTemplateId` on the student, full
  overwrite (never merge) if replacing an existing assignment; UI lives in
  `student-profile-section.jsx`'s edit form (Phase 2). Completing a lesson
  can now mark specific topics/prototypes covered — `markTopicsCovered`
  callable + a "Пройденный материал" picker in `HomeworkLessonDialog`'s
  completing mode, read-only "Пройдено: ..." text once the lesson is
  completed (Phase 3). The student list is now a row list, not a card
  grid — each row shows a progress bar (topics covered / total, or
  "Программа не назначена"), expands in place to show the schedule block,
  profile form, and a two-column read/manually-toggleable Темы/Прототипы
  checklist; `student-card.jsx` is gone, replaced by `student-row.jsx`
  (Phase 4). Students themselves now see a "Прогресс подготовки" block on
  their own dashboard (percent + progress bars for topics and, if
  present, prototypes) that expands to a full Темы/Прототипы breakdown
  (pass/remaining, a "К повторению" flag on items covered during a
  poorly-rated lesson, a "на этой неделе" recent-activity nudge) — two
  unplanned addenda added after the 4 phases, since none of them had
  touched `StudentDashboard.jsx`. `markTopicsCovered` also now records
  `needsReview` per item based on the completing lesson's own rating.
  **The full teacher+student feature is now complete.** Two follow-up UI
  fixes: `HomeworkLessonDialog` no longer overflows the viewport
  uncontrollably (fixed header/scrollable middle/sticky footer, single
  merged primary action button); the curriculum progress lists on both
  dashboards now truncate to 3 items with a "Показать все (N)"/"Свернуть"
  toggle via a new reusable `TruncatedList` component instead of
  rendering unboundedly. See [[activeContext]] for the caveats (stale
  collapsed-row percentages on the teacher side, manual Console rules
  still pending, nothing manually verified yet).
- Single entry point `/app` for the Telegram menu button and public QR
  codes: routes to the student's own dashboard (skipping the PIN, but
  only after verifying the Telegram identity against Firestore, never
  trusting the URL param alone), a self-service signup screen, or a
  no-auth public landing page depending on context. Self-service signup
  (`/start signup` on Telegram, the exact text "регистрация" on VK) reuses
  the existing bot registration state machine end-to-end and notifies the
  teacher once complete. Deployed and live at that URL, but the
  Telegram-side Menu Button still needs to be configured manually in
  BotFather before it's actually reachable from inside the bot — see
  [[activeContext]].
- Student page fully migrated to the "redesign v2" warm-glass visual
  system (session 7), then unified further in session 8: all student-page
  modals (reschedule, cancel, "Все уведомления", "Все материалы") now
  share one `GlassDialog` wrapper instead of copy-pasted classes, the
  page background got a matching translucent glass overlay, and the
  notifications list scrollbar is hidden. See [[systemPatterns]] for the
  new `render`-prop pattern this uncovered and [[activeContext]] for the
  still-unconfirmed `window.open()`→`<a>` bug fix.
- Teacher panel's modals (homework dialog, reschedule, cancel, curriculum
  editor, notifications) were completely broken (no visible content, no
  backdrop) — fixed via three separate root causes (React duplicate-key
  collision, an unlayered `.teacher-theme` CSS rule beating every Tailwind
  utility, and a background-vs-fixed-decorative-layer paint-order bug).
  See [[systemPatterns]] for the technical detail — this is reusable CSS
  knowledge, not just a one-off fix.
- Homework dialog's "Пройденный материал" (completing mode) is checkboxes,
  not the old multi-row selects — multi-select, only uncovered items,
  prototypes hidden when none exist. Teacher's `StudentRow` curriculum
  tiles are now direct click-to-toggle (no separate edit modal).
- Reschedule proposals now show old time struck through → arrow → new time
  bold, on both the teacher's upcoming-lesson row and the student's
  next-lesson banners (both directions). Student's own notification panel
  can now confirm/reject `reschedule_proposed`/`cancellation_proposed`
  directly (duplicating what the bot already offers), reusing the
  backend's existing status-mismatch validation to detect if the bot
  already handled it.
- Student page migrated a second time to "redesign student v3"
  (`luminous-learn-dashboard-main`, a *different* mockup source folder
  than session 7's "redesign v2" — check which one before assuming a
  future v3-vs-v2 mismatch is a bug): near-white page background +
  translucent card/border/muted tokens (new `--card-opaque` fallback for
  screens with no decorative backdrop), new `StudentGrainBackground`
  component (replaces the old `bg-glass.jpg` photo), new static `ExamRadar`
  block (mock data only, no real logic), `CurriculumItemGroups` redesigned
  to the mockup's stacked Пройдено/Осталось layout, lesson-history tags
  redesigned to a local 3-tone glass `Badge` (deliberately not merged with
  the teacher's `StatusBadge`), login screen (`LoginScreen`/`PinInput`)
  fully migrated over two passes. See `changelog/2026-08-august.md` for
  the full detail.
- **Domain finalized (session 10)** — no more `PLACEHOLDER_DOMAIN`/
  localhost anywhere in `functions/`; everything points at
  `https://princessschool-e678c.web.app`.
- **Bot proposal-message cross-channel sync (session 10)** — when a
  reschedule/cancellation proposal's bot message (with buttons) is
  answered through a *different* channel (bot vs. website, or Telegram vs.
  VK for the teacher), the original message is deleted and replaced by a
  plain outcome text. Works both directions: student-facing messages
  (`lesson.proposalMessage`) and, new this session, teacher-facing ones
  too (`lesson.teacherProposalMessage`, an array — the teacher can have
  both channels connected). See [[systemPatterns]].
- **Teacher bot connect via one-time tokens (session 10)** — replaces the
  old manual-Firestore-doc setup. Teacher generates a Telegram deep link
  or a VK code from the notifications-bell dialog
  (`generateTeacherConnectToken` callable, `teacherConnectTokens/`
  collection, 10-min TTL); `integrations/teacherContact` now supports
  **both** Telegram and VK connected simultaneously
  (`{telegramChatId, vkPeerId}`, was single-channel before). Student-
  initiated proposals now send the teacher an interactive
  confirm/reject keyboard too (previously text-only) — see
  [[systemPatterns]] for the Telegram `callback_data` byte-limit
  constraint this ran into.
- **Video call availability window (session 10)** — `videoCallAvailable`
  flag maintained every 5 minutes (`updateVideoCallAvailability`), true
  only within 10 minutes before through 60 minutes after a lesson's
  effective start. Student's "Подключиться" button is always visible now
  but disabled outside that window (previously always-enabled once any
  global link was set — a real gap, since the link is shared across every
  student).
- **`UpcomingLessonsListDialog` (session 10)** — the student-row button
  ("Следующие уроки") now opens every upcoming lesson within 3 weeks, not
  just the single nearest one, relevant now that a student can have
  multiple weekly schedule slots. `UpcomingLessonCard`/`RescheduleDialog`/
  `CancelLessonDialog` extracted out of `TeacherDashboard.jsx` into shared
  `upcoming-lesson-card.jsx` so both this dialog and "Ближайшие уроки"
  reuse one implementation.
- **Cancelled lessons now appear in history (session 10)** —
  `confirmCancellation` (two-sided cancel) no longer deletes the lesson
  doc; sets `status: "cancelled"` exactly like the one-sided
  `cancelLessonDirectly` already did. Both now show an "Отменён" badge in
  lesson history (student's own view and the teacher's per-student view),
  with attendance/homework/rating badges hidden since the lesson never
  happened. Weekly income calc audited and confirmed already correctly
  excludes cancelled lessons (structural, via its `status in
  [upcoming,completed]` query) — no change needed there.
- Curriculum template score field, registration-invite copy text,
  `window.confirm`→custom dialog for registration deletion, Финансы
  "Оплачено" font size, and `TeacherLogin`'s visual redesign (matching the
  student `LoginScreen`'s grain background + glass card, rose accent
  instead of orange) — all session 10, see `activeContext.md`.

## Known issues / open items

- No automated test suite in the repo.
- **New infra-level failure class found session 10, distinct from the
  missing-secrets bug (session 5): a Cloud Function's Cloud Run service
  can silently lose its `allUsers`/`roles/run.invoker` IAM binding**,
  usually after a deploy interrupted mid-way by the CPU-quota flake (see
  [[techContext]]). Symptom: client gets a generic `internal` error (or,
  for a non-`onCall` case, the action just silently does nothing), and
  `firebase functions:log --only <name>` shows **zero real invocation
  traces** — the request is rejected at the Cloud Run IAM layer before the
  function's own code ever runs. Fix: `gcloud run services
  add-iam-policy-binding <lowercase-service-name> --region=us-central1
  --member=allUsers --role=roles/run.invoker` (Cloud Run service names are
  always the lowercased function name, e.g. `cancelLessonDirectly` →
  `cancellessondirectly` — a real gotcha, first attempt with the camelCase
  name 404s). A Cloud Shell script exists (given to the user, not run by
  Claude — see session 10 notes) that checks/fixes this across every
  `onCall`/`onRequest` export at once; ran once, fixed everything found at
  the time. **If this symptom recurs on a function added after session
  10, it hasn't been covered by that pass — check it manually.**
- **Student "Отменить урок" button — flagged unresolved since session 4,
  possibly fixed as a side effect of session 10's IAM-invoker fix above**
  (exact matching symptom: client action does nothing, no server trace),
  but not explicitly re-tested. Confirm before removing this line.
- **Resolved as of session 8, regressed again in session 9**: session 8's
  work was committed and pushed (`3e365a3`), plus one more commit
  (`e01c493`, "редизайн учителя без фикса багов") since. **Everything from
  session 9 (teacher freeze fix, curriculum checkboxes, student v3
  migration, login screen) is uncommitted working-tree changes only** —
  the "nothing is committed" risk is back. Confirm next session whether
  this gets committed or stays a running uncommitted pile.
- Curriculum templates feature (session 7) is fully implemented (all 4
  phases) but **not manually verified end-to-end** at all yet — create/
  edit/delete a template, assign/replace it on a student, mark topics
  covered during lesson completion, and the new row-list progress display
  all need a real click-through. Console Firestore rules for
  `curriculumTemplates`/`students/{id}/curriculumProgress` also still need
  manual setup (no local rules file exists in this repo, by deliberate
  decision — see [[systemPatterns]]).
- `functions/scripts/migrateSchedule.js` — still unconfirmed whether the
  backfill has ever actually been run against production Firestore.
- Student homework file upload from the web (new this session) is the
  first unauthenticated client-side Storage write in the app — untested
  against the deployed Storage security rules, see [[activeContext]].
- `vkProcessedMessages/` (new this session) has no TTL/cleanup — grows
  unbounded, one doc per incoming VK message.
- **Student "Отменить урок" button — still unresolved.** Log evidence
  (session 4) rules out the `unauthenticated` hypothesis (no student
  invocation ever reached `proposeCancellation` at all), and every
  student-reachable callable's auth logic is confirmed correct — but the
  actual reason the button doesn't visibly do anything is still unknown.
  Needs a live retest with logs tailed in real time, not another guess.

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
