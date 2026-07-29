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

## Known issues / open items

- `APP_URL` in `functions/index.js` is hardcoded to
  `http://localhost:5173/teacher` with an explicit `pending` comment to
  replace it before production.
- No automated test suite in the repo.
- **Nothing described above is committed to git** — production runs off
  uncommitted working-tree state; see [[activeContext]] for why this is
  now flagged as the top risk.
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
