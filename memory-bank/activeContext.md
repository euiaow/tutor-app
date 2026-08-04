# Active Context

_Last updated: 2026-08-02 (session 10)_

## Current work focus

**Still nothing committed to git.** Same long-running pattern as every
prior session — deploys go straight from the working tree via `firebase
deploy`, git history lags behind. Not re-flagging this as newly alarming
each session going forward unless the user asks about it; just a standing
fact to remember.

`activeContext.md` was trimmed this session: everything through session 9
was already duplicated in `changelog/2026-07-july.md`
(sessions 2–8) and has now also been fully moved out — session 9 lives in
the new `changelog/2026-08-august.md`. This file now keeps only the most
recent session inline; see `changelog/index.md` for the archive index.

### Session 10 — domain finalization, teacher↔student bot notification parity, cancellation-history fix, several UI polish requests

A long, many-part session. Grouped by theme, not strictly chronological.

**1. Domain finalized everywhere.** `PLACEHOLDER_DOMAIN` (telegram.js/
vk.js, student registration-completion link) and `APP_URL`
(`functions/index.js`, Google OAuth callback redirect) both replaced with
the real `https://princessschool-e678c.web.app`. No more localhost/
placeholder strings anywhere in `functions/`.

**2. Bot proposal-message deletion sync — now bidirectional (student side
this session, teacher side added later same session).** Problem: when a
reschedule/cancellation proposal's bot message (with Подтвердить/Отклонить
buttons) gets answered through a *different* channel than it was sent on
(e.g. proposed via Telegram bot, answered on the website), the bot message
was left dangling with live-looking buttons.
- `lesson.proposalMessage: {platform, chatId, messageId}` — set when
  `proposeReschedule`/`proposeCancellation` sends a **student**-facing
  keyboard (`core/lessons.js`). New `deleteMessage(chatId, messageId)` in
  both `adapters/telegram.js` (Bot API `deleteMessage`) and `adapters/
  vk.js` (`messages.delete` with `delete_for_all: 1`) — wrapped in
  try/catch, logged as `warn` on failure (message too old, already
  deleted), never throws. `deleteProposalMessages` (`core/lessons.js`,
  originally singular, generalized later this session — see #5) is called
  from **all four** resolution paths (`confirmReschedule`,
  `cancelReschedule`, `confirmCancellation`, `rejectCancellation`) — same
  code runs whether the resolution came from a bot button press or a
  website click, so there's exactly one deletion code path, not two to
  keep in sync.
- `sendReminderToStudent` (`core/reminderUtils.js`) changed its return
  shape from `boolean` to `{platform, chatId, messageId} | false` so the
  message id could be captured; `createNotification` (`core/notifier.js`)
  surfaces it as `sentMessage` in its return value, only populated for
  the reschedule/cancellation-proposal call sites that pass
  `telegramReplyMarkup`/`vkKeyboard`.

**3. Teacher bot connect via one-time tokens — replaces the old
manual-Firestore-doc setup entirely.** Audited first (per explicit
instruction): no `TEACHER_SECRET`/`/teacher {code}` mechanism existed in
code at all — nothing to remove, built fresh.
- New `functions/core/teacherConnect.js`: `teacherConnectTokens/{token}`
  (`platform`, `status: "pending"|"used"`, `createdAt`, 10-min TTL checked
  inline, no cron needed), `createTeacherConnectToken(platform)` (called
  from new callable `generateTeacherConnectToken`, `request.auth`-gated —
  the only step here that needs to be a callable, since anyone with the
  client SDK could otherwise mint tokens directly),
  `resolveTeacherConnectToken(token, platform, chatIdentity)` (called from
  inside the bot adapters, marks the token used, writes onto
  `integrations/teacherContact`).
- **`integrations/teacherContact` schema changed** from the old
  `{platform, chatId}` (one channel only) to `{telegramChatId, vkPeerId}`
  — the teacher can now have **both** channels connected simultaneously.
  `teacherNotifier.js`'s `sendMessageToTeacher` sends to every connected
  channel, not just one.
- `telegram.js`: `/start teacher_{token}` branch, checked first in
  `handleStart` (unambiguous prefix). `vk.js`: no deep-link equivalent, so
  a free-text code is checked in `handleNoSessionMessage` **after** the
  student-registration-token check and self-service-signup check fail —
  explicit `teacherConnectTokens` lookup, not a guess by format (both
  token kinds come from the same random-string generator).
- Frontend: new `src/components/teacher/teacher-bot-connect.jsx`
  (`TeacherBotConnectStatus`), wired into the notifications-bell dialog,
  under the notification list. Two independent rows (Telegram/ВК). **Not
  connected**: whole row is a Popover trigger ("не подключён" +
  "Подключить →"), Popover shows connect instructions (Telegram: button
  opens the deep link; VK: code fetched immediately on open, shown large
  with a copy button, plus a clickable link to the VK community chat).
  **Connected**: status text + a separate always-visible "Сбросить
  подключение" text link **directly in the row** (not hidden behind
  another click) that opens a confirmation Dialog (see #6) —
  `disconnectTeacherPlatform(platform)` is a direct client `setDoc` merge
  (admin-only config, no server validation needed, matches the project's
  existing "direct write unless a callable is specifically needed"
  convention).

**4. Major infra discovery: Cloud Run IAM invoker binding can silently go
missing, independent of the known missing-secrets bug class (session 5).**
Two unrelated-looking bugs (`cancelLessonDirectly` "internal" error,
`cancelRegistrationToken` deletion silently doing nothing) turned out to
be the **same root cause**: `firebase functions:log` showed zero real
invocation traces for either — only deploy/startup noise — meaning the
client's call never reached the function's own code at all. One instance's
log eventually showed the real signal: `"The request was not
authenticated... Empty Authorization header value"` — a Cloud Run
IAM-layer rejection, happening *before* the Cloud Functions runtime (let
alone the exported handler) ever runs. Normally `firebase deploy` grants
`allUsers`+`roles/run.invoker` automatically on every successful deploy;
the working theory is that a deploy interrupted mid-way by the CPU-quota
flake (see [[techContext]]) can leave a function's Cloud Run service
without ever getting that binding applied, and it doesn't self-heal on a
later *successful* deploy of a *different* function.
- **Fix, and a real gotcha**: `gcloud run services
  add-iam-policy-binding <service> --region=us-central1
  --member=allUsers --role=roles/run.invoker`. **Cloud Run service names
  are always the lowercased Cloud Function name** (`cancelLessonDirectly`
  → `cancellessondirectly`) — the user's first attempt used the camelCase
  function name and got `NOT_FOUND`. Confirmed by checking real log
  resource labels, which are always already-lowercased.
- Wrote a Cloud Shell batch script (given directly to the user, not run by
  Claude — no gcloud in this environment) enumerating every `onCall`/
  `onRequest` export from `index.js` (30 at the time), checking
  `get-iam-policy` for `allUsers`, fixing any missing ones in one pass.
  **`onSchedule`/`onDocumentWritten` functions must NOT get this binding**
  — they're invoked by Cloud Scheduler/Eventarc via a dedicated service
  account, not publicly, and making them public would be a real (if minor)
  security regression, not a fix. User ran the script, confirmed working.
- **If a function is confirmed deployed (`firebase functions:list` shows
  it) but a client call fails generically with `internal` and
  `firebase functions:log --only <name>` shows no real invocation trace at
  all** — check this class of bug first, before assuming a code bug. Same
  diagnostic signature both times it was found this session.

**5. Teacher notification buttons for propose-to-teacher — parity with the
student side (#2).** Previously, when a *student* proposed a reschedule/
cancellation, the teacher got a plain-text bot notification with no
buttons at all — had to go to the website to respond. Now sends an
interactive keyboard too, to every connected channel at once (#3 made this
possible — 0, 1, or 2 messages per proposal).
- New `botMessages.RESCHEDULE_KEYBOARDS_FOR_TEACHER`/
  `CANCELLATION_KEYBOARDS_FOR_TEACHER(lessonId, studentId)` — unlike the
  student-facing keyboards, Telegram's `callback_data` must carry **both**
  ids explicitly (`t_confirm_resch_<lessonId>_<studentId>`, kept to a
  short prefix to stay under Telegram's 64-byte `callback_data` limit once
  both Firestore auto-ids are appended — a real constraint hit here for
  the first time in this codebase) since the teacher's chat has no student
  doc to resolve identity through the way a student's own chat does.
- `sendMessageToTeacher` (`teacherNotifier.js`) now takes
  `{telegramReplyMarkup, vkKeyboard}` options and returns an **array** of
  `{platform, chatId, messageId}` (0–2 entries), not a single object like
  the student-facing `sendReminderToStudent` — the teacher can have both
  channels connected. `createNotification` surfaces this as
  `sentMessages` (plural) alongside the existing singular `sentMessage`.
- `lesson.teacherProposalMessage: Array<{platform, chatId, messageId}>` —
  sibling field to `proposalMessage`, same deletion lifecycle.
  `deleteProposalMessages` (renamed from `deleteProposalMessage`, #2) now
  handles both the single student message and the teacher array in one
  pass.
- `telegram.js`'s `handleCallbackQuery` and `vk.js`'s `handleCallbackEvent`
  gained matching `teacher_*` branches, checked before the student-side
  ones, calling `confirmReschedule(...， "teacher")` etc. directly (no
  chat-identity lookup needed, ids come from the callback payload).

**6. Base UI `Dialog.Backdrop` discovery: a "nested" dialog skips its own
backdrop by default.** The bot-disconnect confirmation dialog (#3), opened
from inside the already-open notifications-bell dialog, rendered with no
dimming/blur behind it at all. Root cause, found by reading
`node_modules/@base-ui/react/dialog/backdrop/DialogBackdrop.js` directly:
`enabled: forceRender || !nested` — Base UI auto-detects "this Dialog.Root
has an ancestor Dialog.Root already open" via React context (not something
opted into) and skips rendering `Backdrop` at all unless `forceRender` is
explicitly passed, on the assumption the outer dialog's own backdrop is
enough. **Fix**: new `elevated` boolean prop on `TeacherDialogContent`
(`theme-ui.jsx`) — bumps Backdrop/Popup from `z-[100]`/`z-[101]` to
`z-[110]`/`z-[111]` *and* passes `forceRender={elevated}` to the Backdrop.
**Any future "confirmation dialog opened from inside another already-open
TeacherDialog" needs `elevated` — without it, Base UI silently produces no
backdrop at all, not just a z-index problem.**

**7. Popover z-index fix, same underlying class of bug as #6.**
`TeacherPopoverContent`'s Positioner was `z-[100]` — same level as
`TeacherDialogContent`'s Backdrop, so a Popover opened from a trigger
living inside an open Dialog rendered *behind* the Dialog's own Popup
(`z-[101]`). Bumped to `z-[110]` (Popovers should always be topmost
regardless of what they're opened from).

**8. `UpcomingLessonsListDialog` — student-row's lesson button now shows
every upcoming lesson, not just the nearest one.** Button renamed
"Следующий урок" → "Следующие уроки" (`student-row.jsx`). Now that a
student can have multiple weekly schedule slots, jumping straight to the
single soonest lesson hid the rest. New
`src/components/teacher/upcoming-lessons-list-dialog.jsx`: queries
`subscribeToAllUpcomingLessons(studentId)` (already scoped to one student,
no `collectionGroup`), filters client-side to a 21-day window on top of
that function's own existing 45-min past-due grace period, renders each
lesson via `UpcomingLessonCard`.
- **Extraction**: `UpcomingLessonCard`, `RescheduleDialog`,
  `CancelLessonDialog` (plus their two small helpers) moved out of
  `TeacherDashboard.jsx` into new `src/components/teacher/
  upcoming-lesson-card.jsx`, so "Ближайшие уроки" (all students) and the
  new per-student dialog share one implementation instead of duplicating
  ~350 lines of row/dialog logic. `TeacherDashboard.jsx` now just imports
  `UpcomingLessonCard`.

**9. Cancellation-history fix — the two cancellation paths now behave
identically.** `confirmCancellation` (two-sided, student-confirmed) used
to `lessonRef.delete()` the doc outright; `cancelLessonDirectly` (teacher
one-sided) already set `status: "cancelled"` and kept the doc. Changed
`confirmCancellation` to match `cancelLessonDirectly`'s shape exactly —
only the "how the lesson gets closed out" line changed, Calendar-event
deletion and both-sides notifications untouched.
- **History queries needed zero changes** — audited every history view
  (`LessonHistoryDialog`/`LessonHistory` preview on the student page,
  `StudentLessonHistoryModal` on the teacher's per-student view) and all
  three already filtered `status !== "upcoming"`, which is inclusive of
  `"cancelled"` by construction. Only the *display* needed updating:
  `lesson-history.jsx`'s local `Badge` gained a `cancelled` tone
  (`bg-destructive/10 text-destructive`) shown instead of attendance/
  homework/rating badges (hidden entirely for a cancelled lesson — not
  meaningful, the lesson never happened); `StudentLessonHistoryModal`'s row
  gained the same signal via `TeacherStatusBadge tone="red"` (the
  *teacher*-realm badge component, deliberately not the student-realm
  local `Badge` — these two badge systems are intentionally separate per
  session 9's own note, kept that way here too).
- `HomeworkLessonDialog` also gained an `isCancelled` guard
  (`lesson?.status === "cancelled"`) — opening a cancelled lesson (now
  reachable via "Открыть" in the teacher's history modal, previously
  impossible since cancelled docs never existed) shows a compact read-only
  "Отменён" block instead of the normal editable-upcoming-lesson form; the
  "Урок прошёл" footer button is hidden for it too.
- Deployed just `confirmCancellation` (the only backend change) — first
  deploy attempt of the whole session that succeeded on the very first
  try, no CPU-quota retry needed.

**10. Weekly income audit — confirmed correct, no fix needed.**
`subscribeToIncomeLessons` (`src/firebase/lessons.js`) queries
`where("status", "in", ["upcoming", "completed"])` — structurally excludes
`"cancelled"` by omission (stronger than an explicit `!== "cancelled"`
check: cancelled lessons are never even fetched). Already correctly
included both this-week `upcoming` and already-`completed` lessons before
this session's `confirmCancellation` fix (#9) — that fix didn't require
any change here, just confirmed the existing filter still holds.

**11. Smaller UI-only requests, all deployed via hosting:**
- **Video call availability window**: new `updateVideoCallAvailability`
  (`functions/reminders.js` + `index.js`, `onSchedule("*/5 * * * *")`, no
  secrets — never sends a bot message) sets
  `lesson.videoCallAvailable: boolean` true within `[now-10min,
  now+60min]` of the lesson's effective date. Student's "Подключиться"
  button is now always visible (was previously always-enabled if a global
  URL was set, a real security/UX gap since the same link is shared across
  every student) but `disabled` until this flag is true, caption switches
  between "Ссылка активна" / "Станет доступна ближе к началу урока".
- **Curriculum template score field**: `ege` default 70/step 10 (was 0,
  no step), `oge` default 4/step 1 — native number-input spinner arrows
  restored just for this one field via a new scoped `.spinner-visible`
  CSS class (`index.css`), not by removing the app-wide arrow-hiding rule
  (which stays in effect for every other number input).
- **`window.confirm`/`window.alert` replaced** in
  `pending-registrations.jsx` with the same custom-dialog pattern as
  `DeleteStudentDialog` (`student-row.jsx`) — root cause of "delete
  doesn't work" here was the same IAM-invoker bug as #4, not the dialog
  mechanism itself, but the dialog was still worth replacing on its own
  merits (matches the rest of the app's confirm-dialog convention).
- **Финансы "Оплачено" number**: `text-sm` → `text-lg` for faster
  at-a-glance reading.
- **Registration invite dialog** ("Добавить ученика"): now copies the same
  ready-made invite text already used in "Ожидают регистрации" (two
  buttons, VK/Telegram) instead of showing a raw link to copy. New shared
  `buildRegistrationMessages(token)` in `src/lib/registration-links.js`
  used by both places. Deleted now-dead `copyable-link.jsx`.
- **`TeacherLogin` redesigned** to match the student `LoginScreen`'s
  visual system (grain/blob decorative background, `glass-panel` card,
  same layout/copy structure) with the teacher's rose `--gradient-orb`
  accent instead of the student page's orange `--gradient-warm`. Kept the
  actual input as a single password field, not `PinInput`'s 4-digit grid —
  teacher auth is real Firebase email+password (`signInTeacher`), porting
  a 4-box PIN UI would break on any real password longer than 4
  characters; this is a functional constraint, not a visual-parity gap.

**Deploy notes**: the CPU-quota flake (see [[techContext]]) hit hard and
repeatedly this session — one batch failed **19 functions at once**. Every
single failure was eventually resolved via the established one-at-a-time
`firebase deploy --only functions:<name>` retry loop; zero functions were
left stuck. Several `firebase deploy --only hosting` runs for the
UI-only items, all clean first try.

## Loose ends / things to check next session

- **The Cloud Shell IAM-fix script (#4) was run once, covering the 30
  `onCall`/`onRequest` functions that existed at that point.** Any new
  `onCall`/`onRequest` function added later needs the same check if it
  ever shows the "internal error, zero real invocation logs" symptom —
  don't assume a fresh deploy always self-heals the invoker binding.
- **Student "Отменить урок" button (flagged unresolved since session 4)**
  — never explicitly re-tested this session, but the IAM-invoker bug class
  found in #4 is exactly the kind of failure that would produce this
  symptom (client call apparently does nothing, no server-side trace).
  Plausibly already fixed as a side effect of the Cloud Shell script; needs
  an explicit re-test before removing this from known issues for real.
- None of this session's teacher-notification-button flow (#5) has been
  manually verified end-to-end by a real bot conversation (student
  proposes → teacher sees buttons in both connected channels → pressing
  one resolves it → the other channel's message also disappears).
- `UpcomingLessonsListDialog` (#8) not yet manually verified against a
  real multi-slot student (two lessons/week, confirm both show up within
  the 3-week window).
- Cancelled-lesson display (#9) not yet manually verified against a real
  cancelled lesson in both the student's own history and the teacher's
  per-student history modal.
