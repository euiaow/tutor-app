# Active Context

_Last updated: 2026-07-29 (session 6)_

## Current work focus

**Everything described below is deployed to production** (`firebase deploy
--only functions:<name>[,...]` per-function, plus `firebase deploy --only
hosting` once after building) but **nothing is committed to git**.
Production now runs off working-tree state from *six* uncommitted sessions
stacked on `824ec3c`. Still the single biggest risk, growing each session —
see the recurring note below.

### Session 6 — scroll-bug re-diagnosis (unresolved), Telegram Mini App, video call button

**Item 0 — balance-popover scroll jump, RESOLVED, confirmed by a real
user-captured trace, not guessed.** The type="button"/preventDefault fix
from session 5 didn't stop it (correctly — that wasn't the cause). Since
this environment has no browser-automation tool, the temporary
`console.trace("SCROLL EVENT", ...)` listener was deployed and the user
reproduced it live and pasted back the actual browser console output:

```
add-payment-form.jsx:15 SCROLL EVENT 0
(anonymous)    @    add-payment-form.jsx:15
<input>
(anonymous)    @    add-payment-form.jsx:45
<AddPaymentForm>
AddPaymentPopoverCell    @    finance-section.jsx:23
```

This pinpointed the exact element: the `<input>` at line 45 — the
"Сколько занятий оплачено" number input, which had `autoFocus` set —
mounting inside `AddPaymentForm` inside `AddPaymentPopoverCell`
(Финансы table's payment Popover). `scrollY: 0` at the moment of the
event confirms it's a jump-to-page-top, happening at mount time (i.e. the
moment the Popover *opens*), not on submit — the user's "при внесении
оплаты" description covered the whole open→fill→submit flow, and the
actual trigger was the open step.

**Root cause**: React's `autoFocus` on that input causes the browser to
call native `.focus()` synchronously during the initial commit — before
Base UI/floating-ui's own async position computation (rAF/layout-effect
driven) has placed the Popover's `Positioner` at its final screen
position. At the moment `.focus()` runs, the element is still sitting at
its default (near document-top) position, and since a bare `.focus()`
call scrolls the focused element into view by default, the browser jumps
the whole page to that (effectively top) position. This lines up exactly
with the `preventScroll: false` lead found last session in Base UI's own
`FloatingFocusManager` initial-focus path — but the actual trigger turned
out to be the *redundant* native `autoFocus` attribute racing ahead of
Base UI's own (better-guarded) focus management, not Base UI's own code.

**Fix**: removed the `autoFocus` attribute from the input in
`add-payment-form.jsx`. Also removed the temporary `console.trace`
listener now that the cause is confirmed and fixed. Deployed via
`firebase deploy --only hosting`.

**Items 1 & 2 — Telegram Mini App + video call button, both implemented
and deployed:**

- New `src/lib/telegramWebApp.js`: single `openExternalLink(url)` —
  `window.Telegram.WebApp.openLink(url)` when running inside Telegram,
  plain `window.open(url, "_blank", "noopener,noreferrer")` otherwise.
  Wired into exactly the one existing `window.open` call site found
  (`ContactButton`'s "Написать") plus the two new video-call buttons built
  in this same session (see below). **The third requested call site —
  "ссылки на файлы материалов/домашки, там где сейчас
  `window.open(fileUrl, "_blank")`" — doesn't exist in this shape
  anywhere**: every file/material link in this codebase is a plain
  `<a href=... target="_blank">`, not a `window.open()` call. Per the
  request's own "не ищи и не исправляй ничего сверх этого списка", left
  every anchor tag untouched rather than converting them to buttons that
  weren't asked for.
- `index.html` gained the Telegram Web App SDK `<script>` tag; `App.jsx`
  calls `window.Telegram.WebApp.ready()` + `.expand()` once on mount, only
  when `window.Telegram?.WebApp` exists.
- `botMessages.PIN_SAVED(url, showMenuButtonHint = false)` — added an
  optional second param rather than editing the shared message
  unconditionally, since `PIN_SAVED` is called from **both**
  `telegram.js` and `vk.js` and the "открой через кнопку меню" line is
  Telegram-specific (VK has no equivalent UI concept). Only
  `telegram.js`'s call site passes `true`.
  **Not done, and can't be from code alone**: the Telegram "menu button"
  itself only appears in a chat if the bot is configured for it via
  BotFather (`/setmenubutton` or the `setChatMenuButton` Bot API method)
  pointing at this app's URL — that's a one-time manual Telegram-side
  configuration step, not something any code change here can perform.
  **Flag this to the user as a manual step still needed** before item 2's
  own verification checklist ("кнопка меню внизу чата") can possibly pass.
- **Video call button** (`integrations/videoCall` doc, `{url}`): new
  `src/firebase/videoCall.js` (`subscribeToVideoCallUrl`/
  `updateVideoCallUrl`, plain `onSnapshot`/`setDoc`, no callable needed —
  no server-side validation or notification involved). New
  `VideoCallSettings` component (`src/components/teacher/
  video-call-settings.jsx`) — a small `Popover`-based settings control
  (reusing the `ui/popover.jsx` wrapper from the balance-tracker work)
  placed in `TeacherDashboard.jsx`'s header next to the notifications bell
  — **decision made here, not specified precisely by the request**: the
  request said "в шапке или в отдельной настройке — реши по месту";
  chose the header since it's a rarely-touched global setting, not
  something that belongs inside the per-student or per-lesson UI.
  "🎥 Начать урок" button added to `UpcomingLessonCard`
  (`TeacherDashboard.jsx`, next to "Открыть", only rendered when a url is
  set) and "🎥 Подключиться" to `NextLessonPlate`
  (`StudentDashboard.jsx`, above the reschedule/cancel buttons) — both use
  `openExternalLink`, not `window.open`, since the button is being built
  in the same session as the Mini App work (matches the request's own
  "если уже реализована в этом же заходе").

### Session 5 — five bugfixes (diagnose-first on items 3 and 5)

1. **ЕГЭ/ОГЭ tag missing in lesson cards** — `StudentTags`'s `compact` prop
   used to suppress the exam-target tag; per this session's instruction,
   dropped the `compact` distinction entirely rather than inventing a new
   thing for it to hide — `StudentTags` now always renders every
   subject tag + the exam-target tag, full stop. The `compact` prop is
   gone from the component's signature and every call site
   (`TeacherDashboard.jsx`'s upcoming/past lesson cards,
   `finance-section.jsx`'s tags column) — there was nothing left for it to
   control once exam-target hiding was removed, so keeping a no-op prop
   around would've been confusing.

2. **Balance-popover submit scrolled the page to top** — root cause
   confirmed to be exactly the predicted one: the number input's HTML5
   constraint validation (`min="1"`, no explicit `noValidate` on the
   `<form>`) runs *before* the browser even dispatches the `submit` event
   — if the field fails validation, the browser jumps/scrolls to it and
   the `submit` event (and therefore the React `onSubmit` handler's
   `e.preventDefault()`) never fires at all. Fixed by removing native
   submission from the equation entirely: the `<form>`'s `onSubmit` is now
   just `(e) => e.preventDefault()` (belt-and-suspenders, no logic), and
   the "Добавить" button changed from `type="submit"` to explicit
   `type="button" onClick={handleSubmit}` — clicking it now never goes
   through the browser's native form-submission/validation pipeline at
   all. `handleSubmit` (`add-payment-form.jsx`) no longer takes an event
   param. Also: Финансы table's "Предмет" column renamed to "Теги" and now
   renders `<StudentTags student={student} />` (all tags, colored) instead
   of a text label — same component change as item 1 made this trivial.

3. **Extra-lesson notification silently failing to reach the bot — root
   cause confirmed via real Cloud Functions logs, not guessed.** Fetched
   `firebase functions:log --only createExtraLesson` (filtering out
   `AuditLog` deploy noise): `createNotification` **was** being called and
   **did** log `"notification recorded"` with the right
   `type: "extra_lesson_assigned"` — so notification wiring itself (added
   two sessions ago) was correct. The failure was one step later: the
   bot-dispatch path logged `"No value found for secret parameter
   'VK_GROUP_TOKEN'. A function can only access a secret if you include
   the secret in the function's dependency array"`, immediately followed
   by VK's own API rejecting the send with `error_code: 15, "Access
   denied: token required"` — the outbound HTTP request to VK went out
   with no token attached at all, because it had none to attach.
   Root cause: `exports.createExtraLesson` in `index.js` only declared
   `secrets: [GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET]` (needed
   for the Calendar event) and never added `TELEGRAM_BOT_TOKEN`/
   `VK_GROUP_TOKEN` — Cloud Functions v2 only mounts secrets a function
   explicitly lists, so `sendReminderToStudent`'s bot adapters ran with
   the token env var simply absent. **Proactively audited every other
   `onCall` in `index.js` for the same class of bug** (a function calling
   anything that transitively reaches `createNotification` without
   declaring the bot secrets) and found a second, not-yet-reported
   instance: `exports.completeLesson` had **no secrets block at all**,
   despite `completeLesson` (since the balance-tracker session) now
   calling `deductLessonFromBalance` → low-balance `createNotification`
   calls. Fixed both: `createExtraLesson` gained
   `TELEGRAM_BOT_TOKEN`/`VK_GROUP_TOKEN` alongside its existing Google
   secrets; `completeLesson` gained a `{ secrets: [TELEGRAM_BOT_TOKEN,
   VK_GROUP_TOKEN] }` config block it never had. **Any future `onCall`
   that (even transitively) reaches `createNotification` must declare
   both bot secrets — there is no runtime warning for this beyond the
   logged warning line, and the failure is silent from the caller's
   perspective** (`createNotification` swallows bot-delivery errors, so
   `createExtraLesson`/`completeLesson` both still returned `{success:
   true}` to the client every time this was broken).

4. **Homework dialog materials logic — two clean modes, as specified.**
   `HomeworkLessonDialog`'s "Дополнительные материалы" block (upload input
   + material list) was always rendered regardless of lesson status.
   Wrapped it in `{mode === "completing" || isCompleted ? (...) : null}` —
   hidden entirely while `mode === "upcoming"`, visible once the teacher
   clicks "Урок прошёл" (`mode` flips to `"completing"`) or the lesson is
   already `"completed"`. The "Задание" block's own upload button was
   already correctly gated by the pre-existing `isEditableAssignment`
   (`mode === "upcoming" && !isCompleted`) — no change needed there, only
   the materials block was wrong. Added a per-file delete button (small
   `Trash2`, spinner while removing, disables all delete buttons during
   any single removal) using a new `removeLessonMaterial(studentId,
   lessonId, material)` in `src/firebase/lessons.js` — a **direct client
   `updateDoc({materials: arrayRemove(material)})`**, not a callable
   (same reasoning as `updateLessonTopic`: no server-side notification
   needed for removing a material, so no callable required — see
   [[systemPatterns]]'s existing note on when things go through a callable
   vs. a plain write). `arrayRemove` matches by deep equality, so the
   exact object read back from `lesson.materials` must be passed
   unmodified — works here since that's exactly what's passed.

5. **Telegram contact link — upgraded from "give up" to `tg://` deep
   link, per this session's explicit instruction.** Diagnosis re-confirmed
   the prior session's finding (`telegramChatId` is numeric, not a
   username) — this session's fix replaces the previous "fall through to
   null" behavior with `tg://user?id=<numeric id>` when the id is numeric,
   keeping `https://t.me/<value>` only for the (currently never-populated)
   non-numeric/username case. `tg://` is a real registered protocol
   handler in Telegram's own apps (opens that user's chat directly on
   iOS/Android/Desktop); in a plain browser with no Telegram app
   installed, it still falls through to Telegram's web fallback —
   explicitly expected per this session's instructions, not a bug to chase
   further. New `isDefaultTelegramContact(student)` in
   `src/lib/contact.js` (true when the link being used is the
   auto-derived Telegram one, not a teacher-set `contactUrl` override) —
   `ContactButton` uses it to swap the "Написать" button's styling to
   `bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100`
   (literal classes from the request) instead of the neutral
   `bg-secondary`, flagging "this is our best-guess link, not a confirmed
   one" for Telegram specifically. VK and any manually-overridden link
   keep the neutral style.

### Session 4 — diagnose-first bugfixes + tag system + card/finance cleanup

**Bugfix block (5 items, diagnose-before-fix as instructed):**

1. **Extra-lesson notification** — `createExtraLesson` (`core/lessons.js`)
   now sends a `createNotification({target:"student", type:
   "extra_lesson_assigned", ...})` right after creating the lesson doc +
   calendar event. New `botMessages.EXTRA_LESSON_ASSIGNED(date)`.

2/3. **Root-caused and confirmed by reading code before touching
   anything**: both "Подготовить урок" (`student-card.jsx` →
   `HomeworkLessonDialog`, no `lessonId` passed → called
   `ensureUpcomingLesson`) and the bots' incoming-photo handler
   (`recordHomeworkSubmission` in `core/lessons.js`, also called
   `ensureUpcomingLesson` internally) resolved "the student's current
   lesson" through `ensureUpcomingLesson`, which only ever looks at
   `scheduleSlots` and is structurally blind to `isExtraLesson` docs
   (`slotIndex: null`, never bucketed by `bucketUpcomingBySlot`). Fix: new
   `getNearestUpcomingLesson(studentId)` in `core/lessons.js` — queries
   *every* `status == "upcoming"` doc for the student (no slotIndex
   filter), sorts client-side (Firestore can't `orderBy` a computed field)
   by `rescheduledDate ?? date`, returns the soonest. Read-only, never
   creates a draft — kept deliberately separate from `ensureUpcomingLesson`
   (find-or-create), which is untouched and still used for its original
   purpose (schedule-driven draft creation) and as the fallback when
   `getNearestUpcomingLesson` finds nothing at all. New callable
   `getNearestUpcomingLesson` (teacher-auth-gated, only returns `lessonId`
   — not the raw lesson object, to avoid re-solving Firestore Timestamp
   serialization the client already handles via `subscribeToLesson`).
   Wired into both call sites: `HomeworkLessonDialog`'s no-`fixedLessonId`
   branch, and `recordHomeworkSubmission`.

4. **Student-side cancel button — hypothesis disproven by log evidence,
   no code changed.** Fetched real `proposeCancellation` runtime logs
   (`firebase functions:log`, not the deploy audit-log noise that command
   surfaces by default — had to filter `AuditLog` out to see actual
   invocations). Every logged invocation over the visible window has
   `initiator: "teacher"` and `"auth":"VALID"` — **zero** invocations with
   `initiator: "student"` exist at all, meaning the student-side request
   never reached the function; this is a different failure mode than the
   hypothesized `unauthenticated` rejection (which would still show up as
   a logged, rejected invocation). Code audit of every student-reachable
   callable in `index.js` (`proposeReschedule`, `confirmReschedule`,
   `proposeCancellation`, `confirmCancellation`, `cancelReschedule`,
   `rejectCancellation`) confirms they already correctly branch
   `request.auth` checks on the caller's role (`initiator`/`confirmedBy`),
   or skip the check entirely where either side may act unconditionally —
   `updateHomeworkAssignment` is the only unconditionally-auth-gated one
   and is confirmed teacher-only (grepped `StudentDashboard.jsx`, zero
   references). **No auth check needed loosening — none of them are
   actually blocking a student today.** If this resurfaces, the next
   debugging step is a hard-refreshed test while tailing
   `firebase functions:log --only proposeCancellation` live, to see
   whether `initiator: "student"` shows up at all.

5. **Telegram contact link — hardcode hypothesis (a) disproven, root
   cause is (b) as the task anticipated.** No literal `"https://
   telegram.org"` string exists anywhere in `contact-button.jsx` or
   `contact.js`. Read real Firestore data for the one Telegram-registered
   test student (`mark-kuzmin-8a3b`): `telegramChatId: "1492402969"` — a
   raw numeric Telegram chat/user id, not a public `@username`. Live-tested
   `curl -I https://t.me/1492402969` → **HTTP 302 → `//telegram.org/`**,
   confirming Telegram's own servers redirect any t.me path that isn't a
   resolvable public username straight to the general landing page — this
   is exactly the observed symptom, and it's not fixable by reformatting
   the URL string, since a bot-obtained numeric chat id fundamentally
   cannot address a public deep link (Telegram has no public "message this
   user by internal id" URL format). **Decision**: `getContactUrl`
   (`src/lib/contact.js`) now only builds a `t.me/` link when
   `telegramChatId` doesn't look like a bare number (`/^-?\d+$/` test) —
   otherwise falls through to `null`, so the UI honestly shows "Связь не
   настроена" instead of a link that silently 302s away. The manual
   `contactUrl` override remains the only way to get a working Telegram
   link for a bot-only-registered student. VK's `vk.com/im?sel=<peerId>`
   was spot-checked too (not flagged as broken in the task) — VK's numeric
   peer-id deep link format is a real, documented one, left untouched.

**Tag system + card/finance cleanup:**

- New `src/components/student-tags.jsx` — single source of truth
  `TAG_STYLES` (russian/literature/ege/oge/school → label + Tailwind
  classes) and `<StudentTags student compact?>`. Used pastel `bg-{color}-
  500/15 text-{color}-700 dark:bg-{color}-500/20 dark:text-{color}-400`
  styling (the same convention `lesson-history.jsx`'s attendance/rating
  badges already use) rather than the plain `bg-{color}-100 text-{color}-
  800` (no dark variant) pattern several *other* existing badges in this
  codebase use (the "доп." badge, reschedule/cancellation status badges) —
  deliberately chosen for correctness given this session already fixed one
  real dark-mode hardcoded-color bug (session 2, task 3); didn't want to
  introduce a fresh instance of the same class of bug in new code.
- **Google Calendar event color by subject — the task's premise that this
  "is currently a hash of student.id" doesn't match the code**: grepped
  the whole repo for `colorId`/hash-style coloring and found none — events
  were being created with no `colorId` at all (default calendar color for
  everyone). Implemented what was actually asked for as new functionality
  rather than a replacement: `googleCalendar.js` now sets `colorId` (`"9"`
  Blueberry for `russian`, `"3"` Grape for `literature`, `"8"` Graphite
  default) on both `buildEventResourceForSlot` and
  `createExtraLessonEvent`, picked to loosely match `student-tags.jsx`'s
  blue/purple hues since Calendar's `colorId` is a fixed 1–11 palette, not
  arbitrary hex — can't be pixel-matched to the CSS tag colors, only
  themed similarly. **Caveat**: this only affects newly-created or
  schedule-edited-and-resynced events — a student's *existing* untouched
  recurring calendar event keeps whatever color (none) it already has
  until their schedule is next edited (which re-runs
  `syncStudentScheduleToGoogleCalendar` and rebuilds the event resource).
- `student-card.jsx`: `<StudentTags student />` added under the student's
  name (next to the initials circle). Balance display, "+ Внести оплату",
  and hourly-rate display **removed** from the card — `StudentBalanceRow`
  component deleted outright (no other usages found). `StudentProfileSection`
  itself (the edit form: subject/exam target/rate/auto-remind toggle) is
  untouched — only its own collapsed-summary line dropped the `₽/час`
  fragment, since that's a *display* of the rate, not the settings form.
- `TeacherDashboard.jsx`: `<StudentTags student compact />` added to both
  `UpcomingLessonCard` (right after the name, before the "доп." badge) and
  `PastLessonCard` (new `student` prop threaded through both of its call
  sites — the main "Прошедшие уроки" list and `AllPastLessonsDialog`).
- **Финансы table**: "Предмет" column now renders `<StudentTags compact />`
  instead of a text label (`formatSubjects` import dropped from
  `finance-section.jsx`, though it's still exported from
  `lib/student-profile.js` for `student-profile-section.jsx`'s own use).
  New rightmost "Оплата" column: a compact "+ Внести" button opening a
  **Popover** (new `src/components/ui/popover.jsx`, first Popover wrapper
  in the repo, built on `@base-ui/react`'s `Popover` primitive — same
  library/pattern as `dropdown-menu.jsx`) anchored to that row, containing
  the existing `AddPaymentForm`. Both the trigger and the popup content
  stop click-event propagation explicitly — Base UI portals popover
  content out to `document.body` in the DOM, but React's synthetic events
  still bubble through the *component* tree, so an unguarded click inside
  the popover would otherwise also fire the row's `onClick` (which opens
  the ledger dialog). Row click (outside the button) still opens the
  ledger dialog, unchanged.

### Session 3 — "Карточка ученика 2.0" + payment/balance tracker

**Part 1 — new student-profile fields** (`subject`, `examTarget`,
`hourlyRate`, `paidLessonsBalance`, `lowBalanceThreshold`,
`autoRemindLowBalance` on `students/{id}`):

- **Decision not spelled out in the request, made here**: `students/{id}`
  already had a `subject` field — a single string, default `"Английский
  язык"`, exposed in `mapStudentDoc` but **never actually read anywhere in
  the UI or backend** (confirmed via grep before touching it). The new spec
  wants `subject: string[]`. Repurposed the same field name to the new
  array shape rather than inventing `subjects`/a second field, since the
  old string value was dead weight nobody depended on. If any student doc
  in Firestore still has the old string value, `mapStudentDoc` now does
  `Array.isArray(data.subject) ? data.subject : []` — old docs read back as
  an empty subject list rather than crashing, but the old string is
  effectively discarded on first re-save from the new profile form.
- `mapStudentDoc` (`src/firebase/students.js`) extended with all six new
  fields, each falling back to the documented default
  (`paidLessonsBalance: 0`, `lowBalanceThreshold: 1`,
  `autoRemindLowBalance: true`, etc.) so pre-existing student docs that
  predate this feature read as fully-formed objects rather than
  `undefined`-sprinkled ones.
- New `updateStudentProfile(studentId, {subject, examTarget, hourlyRate,
  autoRemindLowBalance})` in `src/firebase/students.js` (plain `updateDoc`,
  same pattern as `updateStudentContactUrl`/`updateStudentSchedule` — no
  backend validation needed, mirrors those).
- New `src/lib/student-profile.js`: `SUBJECT_OPTIONS`
  (`russian`→"Русский язык", `literature`→"Литература"),
  `EXAM_TARGET_OPTIONS` (`ege`/`oge`/`school`), `formatSubjects`,
  `formatExamTarget`, `pluralizeLessons` (proper Russian 1/2-4/5+ noun
  pluralization for "занятие", including the 11–14 exception), and
  `getBalanceColorClass(balance, lowBalanceThreshold)` — shared between the
  student card and the Финансы table so the color rule is defined exactly
  once. **Balance color decision**: the spec only literally defined green
  (`> threshold`), yellow (`=== threshold`), red (`<= 0`), leaving the gap
  `0 < balance < threshold` undefined when `threshold > 1`. Resolved as
  yellow for that whole `0 < balance <= threshold` range — reads as "getting
  low", consistent with the spec's intent, no case falls through undefined.
- New `StudentProfileSection` component
  (`src/components/teacher/student-profile-section.jsx`): same
  collapsed-summary/click-to-edit pattern the schedule block already used
  in `student-card.jsx`, reused rather than inventing a new interaction
  style. Checkboxes for subject, `<select>` for exam target (no shadcn
  Select in the repo — same as `ExtraLessonDialog`'s student picker, plain
  `<select>` styled to match), number input + "₽" suffix for hourly rate,
  native checkbox for the auto-remind toggle (no shadcn Switch in the repo
  either — didn't add one for a single boolean).

**Part 2 — balance backend** (`functions/core/finance.js`, new file):

- `addPayment(studentId, lessonsCount, note)` — Firestore transaction,
  writes a `balanceLedger/{entryId}` doc (`type: "payment"`) and bumps
  `paidLessonsBalance` by `lessonsCount` in the same transaction. Exposed
  as callable `addPayment` in `index.js`, teacher-auth-gated (mirrors
  `createExtraLesson`'s auth check).
- `deductLessonFromBalance(studentId, lessonId)` — **not** a callable,
  called only from `completeLesson` (`core/lessons.js`, right after the
  lesson doc flips to `status: "completed"`, before
  `ensureUpcomingLesson`). Same transaction shape: ledger doc
  (`type: "lesson_deduction", amount: -1`) + balance decrement. Applies
  uniformly to both slot-based and extra (`isExtraLesson`) lessons, since
  `completeLesson` itself doesn't distinguish — exactly as the request
  asked ("касается и обычных, и внеплановых уроков").
- Low-balance notifications fire from inside `deductLessonFromBalance`
  once, right after the transaction, gated on `newBalance <=
  lowBalanceThreshold`: always a `target: "teacher"` notification, plus a
  `target: "student"` one only when `autoRemindLowBalance === true` (two
  different message bodies depending on whether `newBalance <= 0`, per
  spec). Both go through the existing `createNotification` funnel
  (`core/notifier.js`) — same bell/bot-dispatch guarantee every other
  notification type gets, nothing new invented here.
- **Wiring note**: `core/lessons.js` now does a top-level `require("./finance")`
  and `core/finance.js` does a top-level `require("./notifier")` — checked
  this doesn't reintroduce the circular-require problem `notifier.js`'s own
  comment warns about, since neither `finance.js` nor `notifier.js`
  requires `core/lessons.js` back (notifier's own requires into
  reminderUtils/teacherNotifier stay lazy, as before).
- Ledger entries do **not** store the lesson's date, only `lessonId` — the
  Финансы UI's ledger feed (see Part 3) displays the ledger entry's own
  `createdAt` as the effective date for both payment and deduction rows,
  rather than doing a per-entry lesson-doc lookup. This is an approximation
  for `lesson_deduction` rows specifically (`createdAt` is *when the
  teacher clicked "complete"*, which is usually the same day as the lesson
  but not guaranteed identical) — flagged here rather than silently
  assumed equivalent.

**Part 3 — balance UI in `student-card.jsx`**:

- New `StudentBalanceRow` (`src/components/teacher/student-balance-row.jsx`)
  — balance display with `getBalanceColorClass` coloring +
  `pluralizeLessons`, and a "Внести оплату" toggle button that reveals the
  new shared `AddPaymentForm`
  (`src/components/teacher/add-payment-form.jsx`) inline below. Placed
  directly under the new `StudentProfileSection`, above the existing
  "Подготовить урок"/`ContactButton` row.
- `AddPaymentForm` is intentionally its own component (not inlined twice)
  since Part 3 (student card) and the Финансы section (below) both need
  the exact same "count + note → addPayment()" form.

**Финансы section** (`src/components/teacher/finance-section.jsx`, wired
into `TeacherDashboard.jsx` right before `PendingRegistrations`, only
rendered when `students.length > 0`):

- A plain `<table>` (no existing table component in the repo to reuse),
  sorted client-side by `paidLessonsBalance` ascending. Columns exactly as
  specified: Имя / Предмет / Баланс / Ставка·час, balance colored via the
  same `getBalanceColorClass`.
- Row click opens a `Dialog` (not an inline expand) showing that student's
  `balanceLedger` via a new `subscribeToBalanceLedger(studentId, onData,
  onError)` (`onSnapshot`, `src/firebase/finance.js`) — realtime by
  default, consistent with this project's established preference (see
  session 2's task 4) rather than a one-time fetch. Includes the same
  "+ Внести оплату" → `AddPaymentForm` inline, so a payment can be added
  without leaving the ledger view.

### Carried over from previous sessions (still true, unchanged)

Multi-slot schedules, homework dialog attendance/rating, VK dedup fix,
unified notifications, extra lessons, dark-theme notification fix, realtime
lesson history, student-side homework upload, and the contact button are
all still live — see [[systemPatterns]] and [[progress]] for mechanics, not
repeated here.

## Loose ends / things to check before continuing

- **Nothing across all six sessions is committed to git.** Still the
  single biggest risk, and it keeps compounding.
- **Telegram bot menu-button config is a manual step, not done**: the
  code (Mini App `openLink`/`ready`/`expand`, `PIN_SAVED`'s hint text) is
  deployed, but the chat's actual "menu button" only appears once the
  teacher (or whoever has BotFather access) configures it via
  `/setmenubutton` (or the `setChatMenuButton` Bot API method) pointing at
  this app's URL. Session 6's own verification checklist item 2 can't
  pass without this being done outside the codebase first.
- **Item 4 from session 4 (student cancel button) is still unresolved,
  not fixed** — logs prove the failure isn't `unauthenticated` at the
  server (no student-initiated call was ever logged at all), and every
  student-reachable callable was audited and is already correctly
  auth-branched. If the user hits this again, the next step is watching
  `firebase functions:log --only proposeCancellation` live during a fresh
  (hard-refreshed) click — don't re-guess at auth without that.
- **`StudentTags` no longer accepts a `compact` prop** (session 5) — if a
  future session adds a new tight-space usage that genuinely needs fewer
  tags, that's new logic to design, not a prop to resurrect as a no-op.
- **The missing-secrets class of bug (session 5, item 3) may have other
  instances not yet found** — only audited `onCall` functions in
  `index.js` for this pass; didn't audit `onSchedule`/`onDocumentWritten`
  triggers (`reminders.js`, the Firestore sync triggers) for the same
  "calls something that reaches `createNotification` without declaring
  bot secrets" pattern. Worth a pass if another notification silently
  fails to reach a bot again.
- Google Calendar `colorId`-by-subject (session 4) only takes effect for
  events created or resynced after that session's deploy — existing
  students' already-created recurring events keep their current (no)
  color until their schedule is next edited.
- `formatSubjects` (`lib/student-profile.js`) is now only used by
  `student-profile-section.jsx`'s collapsed summary — the Финансы table
  and lesson-card badges use plain `<StudentTags student={student} />`
  (no `compact` anymore, see above) instead. Not dead code, just narrower
  usage than before.
- Session 5's fixes are deployed and build clean, but **none have been
  manually re-verified end-to-end by a human click-through** (extra-lesson
  bot notification actually landing in a real chat, balance popover not
  scrolling, materials block toggling on "Урок прошёл", tg:// link opening
  the Telegram app) — same caveat as every other session's work in this
  file.
- **No `firestore.rules` file exists in this repo** (same situation as
  `storage.rules`, noted in session 2) — rules are managed somewhere
  outside this checkout (Console, presumably). `balanceLedger` is a brand
  new subcollection under `students/{id}`; it almost certainly inherits
  whatever wildcard rule already lets the authenticated teacher read/write
  everything under `students/{id}/**` (the way `lessons` already works),
  but this was **not verified against the live rules** — same caveat as
  session 2's Storage-rules risk, just for Firestore this time.
- Session 2's Storage-rules risk (student homework upload) — still not
  confirmed tested live, per the last update.
- `functions/scripts/migrateSchedule.js` — still unconfirmed whether it's
  ever been run against prod.
- `vkProcessedMessages/` — still no TTL/cleanup.
- None of this session's balance/payment flow has been manually verified
  end-to-end (add payment → balance changes → complete lesson → balance
  drops → low-balance notification fires to both teacher bell and student
  bot) — implemented + deployed + builds clean only.
- Cloud Run CPU-quota deploy flakiness (see [[techContext]]) hit hard this
  session — `addLessonMaterial`/`confirmReschedule`/`proposeCancellation`/
  `rejectCancellation`/`googleOAuthCallback` all needed multiple retries
  (up to 6 attempts for `proposeCancellation`), but **all five eventually
  deployed successfully**, confirmed by explicit "Successful update
  operation" for each. `hosting` deployed cleanly after, once all functions
  were confirmed up. Nothing left pending from this deploy.
- `src/pages/TeacherDashboard.jsx` — `const [completedVisibleCount] =
  useState(2)` still has no setter (harmless, pre-existing).
- No test suite exists in this repo — verification is manual.

## Recent commit history (git — does not yet reflect any of the six sessions' work)

- `dfc7cc6` — уведомления, фикс вк, фикс отмены, слоты в расписании.
- `824ec3c` — reschedule + cancellation flows, VK bot.
- `da38da5` — reminders, bots, reschedules.
- `e07e9f3` — unified lesson dialog, `completeLesson`, reminders logging.

## New files this session (session 6)

- `src/lib/telegramWebApp.js`
- `src/firebase/videoCall.js`
- `src/components/teacher/video-call-settings.jsx`

## New files from session 4 (for reference, unchanged this session)

- `src/components/student-tags.jsx`
- `src/components/ui/popover.jsx`

## Files removed this session (session 4)

- `src/components/teacher/student-balance-row.jsx` — balance display moved
  out of the student card entirely (now Финансы-only); nothing else
  referenced this component.

## New files from session 3 (for reference, unchanged this session)

- `functions/core/finance.js`
- `src/components/teacher/student-profile-section.jsx`
- `src/components/teacher/add-payment-form.jsx`
- `src/components/teacher/finance-section.jsx`
- `src/firebase/finance.js`
- `src/lib/student-profile.js`

## New files from session 2 (for reference, unchanged this session)

- `src/components/teacher/extra-lesson-dialog.jsx`
- `src/components/teacher/contact-button.jsx`
- `src/components/ui/dropdown-menu.jsx`
- `src/lib/contact.js`
