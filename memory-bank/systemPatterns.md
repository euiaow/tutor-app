# System Patterns

## Architecture

```
src/                      React (Vite) SPA
  pages/                  StudentDashboard, TeacherDashboard, TeacherLogin
  components/             shared UI; components/teacher/* teacher-only,
                           components/auth/* login, components/ui/* primitives
  firebase/                thin client wrappers around Firestore/Callables
  lib/schedule.js          client-side schedule slot helpers (mirrors
                           functions/core/schedule.js logic)

functions/                 Firebase Cloud Functions (Node, CommonJS)
  index.js                 all onCall/onRequest/onSchedule/onDocumentWritten
                           exports — thin: auth check, validate, delegate to core/
  core/                    domain logic, one module per concern
    firestore.js            db handle
    students.js              CRUD, deleteStudent (cleans up calendar+bots)
    lessons.js               upcoming-lesson lifecycle, homework, reschedule/
                              cancellation state machines, completeLesson
    schedule.js               normalizeScheduleSlots, getUpcomingLessonDates
    googleCalendar.js         sync schedule slots <-> calendar events
    googleAuth.js             OAuth client/token storage for the calendar
    botMessages.js            builds outbound bot message text (RU)
    registration.js           registration token issue/redeem
    reminderUtils.js          sendReminderToStudent (resolves student's bot)
    teacherNotifier.js        sendMessageToTeacher (resolves teacher's bot)
    notifier.js                createNotification — single funnel: logs to
                              notifications/ + dispatches via reminderUtils/
                              teacherNotifier (see Key technical decisions)
  adapters/
    telegram.js               Telegram webhook handling, sends
    vk.js                     VK Callback API webhook handling, sends;
                              vkProcessedMessages/ idempotency guard on
                              message_new (see Key technical decisions)
  reminders.js                dailyReminderMidday / dailyReminderPreLesson bodies

src/
  components/
    notifications-list.jsx    shared NotificationsList/NotificationIcon,
                              used by both dashboards
    ui/sheet.jsx               slide-in panel (Base UI Dialog anchored right),
                              powers the teacher's notification bell
  firebase/notifications.js    subscribeToTeacherNotifications/
                              subscribeToStudentNotifications, mark(All)Read
  lib/notifications.js         formatRelativeTime ("5 минут назад" etc.)
```

## Key technical decisions

- **Firestore trigger drives calendar/lesson sync, not the write path.**
  `students/{studentId}` writes fan out via `onDocumentWritten` to both
  `syncUpcomingLessonOnScheduleChange` and
  `syncStudentScheduleToGoogleCalendar`, rather than requiring every
  client-side schedule writer to remember to call sync functions. Both
  triggers diff before/after schedule slots and no-op if unchanged — this
  also guards `syncStudentScheduleToGoogleCalendar` against infinite
  recursion from its own `googleEventIds` write-back.
- **Dual-actor endpoints keyed by an explicit role param, not by
  `request.auth` alone.** `proposeReschedule`/`confirmReschedule`/
  `proposeCancellation`/`confirmCancellation` are reachable from both the
  authenticated Teacher Dashboard and the unauthenticated Student
  Dashboard. Each takes an `initiator`/`confirmedBy` string; only the
  branch where the role resolves to `"teacher"` is gated by
  `request.auth`. `cancelReschedule`/`rejectCancellation` take no role at
  all — either side may decline unconditionally.
- **Reschedule/cancellation as explicit status fields on the lesson doc**
  (`rescheduleStatus`, `rescheduleInitiator`, `rescheduleProposedDate`,
  `cancellationStatus`, `cancellationInitiator`), not a separate
  collection — keeps bot messages and dashboards reading one doc.
- **Multi-slot schedules**: a student can have several weekly slots;
  upcoming-lesson drafts are bucketed by `slotIndex` (legacy docs without
  it default to slot 0) so each slot gets exactly one upcoming draft.
- **Secrets declared per-function** via the `secrets:` option (Telegram/VK
  tokens, Google OAuth client id/secret) rather than loaded globally —
  Cloud Functions only mounts what a given function declares.
- **Redirect URI for Google OAuth is derived from `GCLOUD_PROJECT`**, not
  hardcoded, because the callable that builds the consent URL and the
  HTTP function that exchanges the code must send byte-identical URIs.
- **`createNotification({target, studentId, type, text, lessonId})` is the
  only path to notify a user** (`functions/core/notifier.js`). It writes a
  `notifications/` doc (source of truth for the bell/block UI) *and*
  best-effort dispatches the same text via `sendReminderToStudent`
  (target: "student") or `sendMessageToTeacher` (target: "teacher") —
  bot-send failures are caught and logged as warnings, never thrown, so a
  student with no linked platform still gets the in-app record. Every call
  site that used to call `sendReminderToStudent`/`sendMessageToTeacher`
  directly (reschedule/cancellation propose/confirm/reject, homework
  submission, `updateHomeworkAssignment`, `addLessonMaterial`, both daily
  reminders) now goes through this instead. Returns `{id, delivered}` —
  `delivered` lets reminders.js keep its old "only mark as sent if the bot
  actually got it" retry semantics even though the Firestore log always
  gets written regardless. Optional `telegramReplyMarkup`/`vkKeyboard`
  pass through to `sendReminderToStudent` for the reschedule/cancellation
  proposals that attach an interactive keyboard — those two fields are
  dispatch-only, never persisted on the notification doc. Requires the
  same lazy-require trick `core/lessons.js` already used
  (`require("./reminderUtils")` *inside* the function body, not at module
  top) to avoid a circular require, since reminderUtils/teacherNotifier
  pull in the bot adapters, which require `core/lessons.js`, which now
  requires `core/notifier.js` at the top.
- **Webhook idempotency via a reservation doc, not response speed.** VK
  retries a `message_new` event if `vkWebhook` doesn't answer "ok" fast
  enough (observed: normal processing already takes 3–12s downloading a
  photo + uploading to Storage, worse on a cold Cloud Run start) — this
  produced 2–3 duplicate homework submissions per photo in practice.
  Fixed with `functions/adapters/vk.js`'s `reserveMessageProcessing`:
  before handling a message, `db.collection("vkProcessedMessages")
  .doc(peerId_conversationMessageId).create(...)` — `.create()` throws
  `ALREADY_EXISTS` if a doc is already there, so this is atomic even
  against two near-simultaneous deliveries. A retried event just no-ops.
  Telegram's webhook has the same "process fully, then respond" shape
  (`telegramWebhook` in `index.js`) and is structurally exposed to the
  same failure mode, but has no equivalent guard yet — hasn't been
  observed to duplicate in practice, but if it ever does, mirror this
  pattern rather than trying to make the handler faster.

- **Extra (unscheduled) lessons are structurally invisible to the multi-slot
  machinery, by design.** `createExtraLesson` writes `isExtraLesson: true,
  slotIndex: null` and never calls `ensureUpcomingLesson`; every slot-based
  function (`bucketUpcomingBySlot`, the schedule-change triggers) either
  requires a real `slotIndex` or only ever touches docs it created itself,
  so an extra lesson simply never enters those code paths. Its own
  `googleEventId` lives directly on the lesson doc — the student's
  `googleEventIds` map is keyed by slot index and has no slot to key an
  extra lesson under.
- **`mapStudentDoc` (`src/firebase/students.js`) now exposes
  `platform`/`telegramChatId`/`vkPeerId`/`contactUrl`** — previously the
  client-side student object silently dropped these Firestore fields even
  though they exist on the doc (only used server-side for bot routing
  before). Added when building `getContactUrl` (`src/lib/contact.js`),
  since without them there was nothing to derive a contact link from
  client-side. Any future feature reading a student's bot-linkage should
  read it off the mapped object rather than re-querying Firestore directly.
- **No shadcn `DropdownMenu` existed before `ContactButton`** — built the
  smallest usable wrapper (`src/components/ui/dropdown-menu.jsx`) directly
  on `@base-ui/react`'s `Menu` primitive, the same library `dialog.jsx` and
  `sheet.jsx` already build on, rather than hand-rolling click-outside
  logic or adding a new dependency. Reuse this wrapper for any future
  dropdown instead of building another one-off.
- **`updateHomeworkAssignment`'s notification logic treats "text cleared to
  empty" as a no-op**, not an `assignment_updated` event — not covered by
  the original spec (which only defined added/changed/file-added/no-change
  cases), decided this way to avoid sending a notification with an empty
  "new text" tail, which would read as broken rather than intentional.

- **Balance/payment tracking (`functions/core/finance.js`) follows the same
  "backend function called from inside another domain function" shape as
  notifications** — `deductLessonFromBalance` is not a callable, it's
  invoked directly from `completeLesson` (`core/lessons.js`) the same way
  `createNotification` is invoked from many call sites, never exposed to
  the client directly. Both balance-mutating operations
  (`addPayment`/`deductLessonFromBalance`) run inside a Firestore
  transaction that writes a `balanceLedger/{entryId}` doc *and* updates
  `students/{id}.paidLessonsBalance` atomically — the ledger is an
  append-only audit log, the student doc's `paidLessonsBalance` is the
  fast-read cache of "ledger sum so far", intentionally duplicated data
  kept in sync by always writing both in the same transaction.
- **`subject` on `students/{id}` was silently unused as a string field
  before the balance-tracker feature** — repurposed in place to
  `subject: string[]` rather than adding a second field, since nothing
  read the old value. See [[activeContext]] for the full reasoning; flag
  this if any pre-existing student doc still has a string `subject` and
  something unexpected reads it as a string rather than treating it as
  data predating the array shape.

- **`getNearestUpcomingLesson` vs `ensureUpcomingLesson` — read vs
  find-or-create, never conflate the two.** `ensureUpcomingLesson` only
  ever considers `scheduleSlots` (bucketed by `slotIndex`) and will create
  a draft if one's missing; it is structurally blind to `isExtraLesson`
  docs (`slotIndex: null`). `getNearestUpcomingLesson` is the read-only
  counterpart — queries every `status == "upcoming"` doc regardless of
  slot, sorts by effective date in code (Firestore can't `orderBy` a
  computed `rescheduledDate ?? date`). Any code that means "what's this
  student's next lesson, for real" (opening the homework dialog, attaching
  a bot-submitted file) must use `getNearestUpcomingLesson`, falling back
  to `ensureUpcomingLesson` only when nothing exists yet. Confirmed via
  `firebase functions:log` real invocation traces (not just code reading)
  that this was the actual root cause of two reported bugs before fixing —
  see [[activeContext]] session 4.
- **`firebase functions:log` output is dominated by Cloud Audit Logs
  (deploy/admin events) unless filtered.** `grep -v "AuditLog"` on the
  output is necessary to see actual runtime invocation logs (the
  `"Callable request verification passed"` / your own `logger.info` lines)
  — otherwise a deploy from five minutes ago looks identical to "no logs
  at all" for a quick skim. Learned this diagnosing session 4's item 4.
- **A Telegram bot only ever has a numeric chat/user id for a student, not
  a public `@username`.** `t.me/<numeric id>` is not a valid Telegram deep
  link — Telegram's own servers 302-redirect it to telegram.org (verified
  live). `getContactUrl` (`src/lib/contact.js`) only builds a t.me link
  when `telegramChatId` doesn't look like a bare number; otherwise it's
  `null` and the UI shows "не настроена". There is currently no way to
  get a *working* auto-derived Telegram link for a bot-registered student
  — the manual `contactUrl` override is the only path, and that's by
  design, not a stopgap pending a future fix.
- **Google Calendar's `colorId` is a fixed 1–11 palette (Blueberry,
  Grape, Graphite, etc.), not arbitrary hex** — `core/googleCalendar.js`'s
  `colorIdForStudent` maps `student.subject[0]` to the closest-themed id
  rather than trying to compute a matching hex, since the API doesn't
  accept one. Keep this map's intent (not exact color) in sync with
  `src/components/student-tags.jsx`'s `TAG_STYLES` if either changes —
  they're two independent constants (frontend ESM vs. backend CommonJS,
  no shared module) that are supposed to agree conceptually, not
  literally import from each other.

- **Every Cloud Functions v2 `onCall` that reaches `createNotification`
  (even transitively) must declare `secrets: [TELEGRAM_BOT_TOKEN,
  VK_GROUP_TOKEN]`, or bot delivery silently no-ops.** v2 only mounts
  secrets a function explicitly lists; if it's missing, the bot adapter's
  outbound request goes out with no token, the platform (VK/Telegram)
  rejects it, and `createNotification` swallows that failure (by design —
  see its own doc comment) so the caller never sees an error. Found twice
  in one session (`createExtraLesson`, `completeLesson` — the latter via
  the balance tracker's low-balance notification, added in an earlier
  session without re-checking this) purely by reading real
  `firebase functions:log` output, not by inspecting code. When adding a
  new code path that (even indirectly) calls `createNotification`, check
  its `onCall`'s secrets array before assuming the notification "works
  because the code looks right" — it can look completely correct and
  still fail silently in production.
- **HTML5 form constraint validation runs *before* the `submit` event is
  dispatched — a JS `onSubmit` handler's `e.preventDefault()` never
  executes if the browser's own validation fails first.** A `<button
  type="submit">` inside a `<form>` with a constrained input (e.g.
  `min="1"` on a number field) will, on an invalid value, make the browser
  scroll/focus to the invalid field and stop right there — no `submit`
  event, no handler call, nothing to prevent. Any form meant to behave
  like a pure-JS async action (rather than a real HTML form submission)
  should use `type="button" onClick={handler}` instead of relying on
  `type="submit"` + `preventDefault()`, which only works once the input is
  already valid and doesn't help in the case that actually breaks
  ([[activeContext]] session 5, `add-payment-form.jsx`).

- **`openExternalLink(url)` (`src/lib/telegramWebApp.js`) is the only
  sanctioned way to open an external link/URL in a new context** — checks
  `window.Telegram?.WebApp?.openLink` first (Telegram Mini App context),
  falls back to plain `window.open(url, "_blank", "noopener,noreferrer")`
  otherwise. Any *new* external-link button should use this, not a raw
  `window.open` — but note in-app navigation (React Router routes,
  Dialog/Sheet open state) is a completely different thing and must never
  be routed through this; it's for leaving the app to an external URL
  only.
- **Never combine a native `autoFocus` attribute with a Popover/Dialog
  built on floating-ui/Base UI.** Confirmed root cause (session 6, via a
  real captured browser trace, not guesswork) of a scroll-to-page-top bug
  in the balance Popover's payment form: React's `autoFocus` fires a
  synchronous native `.focus()` during the initial commit, which happens
  *before* the Popover's `Positioner` has computed and applied its final
  on-screen position (that's async, driven by floating-ui's own rAF/
  layout-effect timing) — so the browser scrolls to wherever the element
  currently sits (effectively document top), then the Popover repositions
  a moment later, leaving the page scrolled to the wrong place. Base UI's
  *own* internal initial-focus mechanism
  (`floating-ui-react/components/FloatingFocusManager.js`, via
  `enqueueFocus`) has this same theoretical `preventScroll: false` gap for
  focus-on-open, but in this case the actual trigger was the redundant
  native `autoFocus` attribute layered on top of it, not Base UI's own
  code. If a Popover/Dialog needs its first field focused, don't reach
  for `autoFocus` — either rely on the library's built-in initial-focus
  behavior (already timed to run after positioning) or focus manually
  inside a layout effect that runs after the popup is confirmed
  positioned.

- **This repo has no local Firestore/Storage rules file, by deliberate,
  reconfirmed decision — not a gap to fill.** `firebase.json` only
  declares `firestore.indexes.json`; there is no `firestore.rules` or
  `storage.rules` anywhere in git. First noted session 2 (Storage), and
  reconfirmed session 7 when a new feature's spec assumed rules could be
  "added by analogy" for a new collection — the user explicitly said not
  to create a rules file and not to include `firestore:rules` in any
  deploy command; Console-side rules are configured manually by the user
  after each deploy instead. Treat this as standing policy for any future
  new collection, not something to "finally fix" without being asked.
- **Admin/config content the teacher alone edits (schedule slots,
  curriculum templates) is always a direct client Firestore write, never
  a callable** — a callable is reserved for cases needing server-side
  validation, a notification side-effect, or student-facing trust
  boundaries (see `createNotification`/`addLessonMaterial` above). New
  `curriculumTemplates/` collection (session 7) follows
  `updateStudentSchedule`'s shape exactly: `addDoc`/`updateDoc`/
  `deleteDoc` straight from `src/firebase/curriculum.js`, no Cloud
  Function involved at all.
- **One-time batch read for a summary shown on every list row + a live
  subscription only for whichever row is expanded, when both "show it
  everywhere" and "don't hold N listeners open" are required at once.**
  `TeacherDashboard.jsx`'s student list needs every row's curriculum
  progress percentage visible while collapsed, but the feature's own spec
  explicitly said not to subscribe to every student's progress
  simultaneously. Resolved with two separate reads:
  `getAllCurriculumProgressByStudent()` (one-time `collectionGroup` scan
  across every student's `curriculumProgress` at once, re-run only when
  `students.length` changes) feeds every row's percentage as a passed-down
  prop, while `subscribeToCurriculumProgress` (`onSnapshot`) is only ever
  opened for the currently-`expanded` row and torn down on collapse. If a
  future feature has this same "show a summary everywhere, but only go
  deep on the one thing open" shape, this is the established split — a
  single bounded read for breadth, one listener for depth, not a listener
  per item.
- **A URL query param is never itself a trust signal — only what it lets
  you cross-check against Firestore is.** `StudentDashboard.jsx`'s
  `?skipPin=true` (session 7 addendum) only bypasses the PIN screen after
  independently confirming, via a fresh Firestore read, that
  `window.Telegram.WebApp`'s own `initDataUnsafe.user.id` matches the
  target student's stored `telegramChatId` — the param alone (which
  anyone can type into a URL) does nothing on its own. Any future
  "trusted redirect" feature should follow the same shape: the URL can
  suggest a shortcut, but the actual authority has to come from
  server/Firestore state, checked at the moment of use.
- **Bot self-service entry points reuse the existing registration state
  machine rather than building a parallel one.** `createSelfServiceToken`
  (`functions/core/registration.js`) just mints a token with
  `isSelfService: true` and no upfront name; both
  `adapters/telegram.js`'s `/start signup` and `adapters/vk.js`'s exact-
  text `"регистрация"` trigger feed straight into the same
  `awaiting_name`/`awaiting_pin` session steps every other registration
  already uses. If a third entry point (another bot, another deep link)
  is ever added, follow this shape — mint a token, start the session,
  never fork the state machine itself.
- **A tall `Dialog` that needs its primary action always reachable uses a
  fixed-header / scrollable-middle / sticky-footer split, not one big
  scrolling blob.** `HomeworkLessonDialog` (session 7 addendum) is the
  first place this was needed: its `DialogContent` usage overrides the
  shared component's default `p-6 sm:p-8` to `p-0` (via `className` —
  `cn()`/tailwind-merge lets a specific usage's className win over
  `ui/dialog.jsx`'s own defaults without editing that shared file), adds
  `flex flex-col max-h-[90vh] sm:max-h-[85vh] overflow-hidden` on the
  outer content, then applies padding per-section instead: a `shrink-0`
  header (title/description, never scrolls), a
  `flex-1 min-h-0 overflow-y-auto` middle (everything else), and a
  `sticky bottom-0 border-t bg-card` footer holding the one primary
  action button. If another dialog in this project ever grows tall
  enough to need this, follow the same shape rather than inventing
  something new.
- **`TruncatedList` (`src/components/truncated-list.jsx`)** is the
  reusable "show first N, reveal the rest in place" component — takes
  `items`/`limit`/`renderItem`/`emptyLabel`, renders a "Показать все
  (N)"/"Свернуть" text-link toggle once `items.length > limit`. Expands
  **in place** (plain local state), unlike `materials-library.jsx`'s
  older "Показать все" pattern which opens a `Dialog` — use the in-place
  version whenever the list already lives inside content that's already
  expanded/scrollable (nesting a modal inside already-expanded content is
  the wrong shape), and the Dialog version only for a genuinely
  top-level, always-collapsed-by-default list. Currently used for the
  curriculum progress lists in both `StudentDashboard.jsx` and
  `student-row.jsx` — note those two callers have genuinely different
  underlying list shapes (see `productContext.md`/`activeContext.md` for
  the covered/remaining-split vs. unified-checklist distinction) even
  though both use the same `TruncatedList`.
- **`students/{id}/curriculumProgress/main` is a singleton doc, not a
  per-topic collection** — `assignCurriculumTemplate`
  (`functions/core/curriculum.js`) always fully overwrites it via `.set()`
  rather than merging, by explicit spec ("осознанная замена, не
  слияние"). Unlike `finance.js`'s balance functions, this needs no
  Firestore transaction — there's no counter arithmetic being raced, just
  a plain read-the-template-then-overwrite-the-progress-doc sequence.
  `markTopicsCovered` (same file) *does* use a transaction, since it
  mutates specific elements inside `topics[]`/`prototypes[]` based on
  current state and also writes the lesson doc in the same operation.
- **`FieldValue.serverTimestamp()` cannot be used for a timestamp field
  nested inside an array element — use `Timestamp.now()` there instead.**
  First established via `recordHomeworkSubmission`'s
  `homework.submission.files` `arrayUnion` entry (`core/lessons.js`), and
  reused for `curriculumProgress/main`'s per-item `coveredAt`
  (`markTopicsCovered`) for the same structural reason: both are
  timestamp fields living inside a map that's itself an array element,
  where the server-timestamp sentinel doesn't resolve. Only works as a
  top-level document field (e.g. `assignedAt`, `updatedAt`,
  `createdAt` elsewhere in this codebase all sit directly on the
  document, not inside an array).

## Component relationships

- `TeacherDashboard.jsx` composes `components/teacher/student-row.jsx`
  (session 7, Phase 4 — replaced the old `student-card.jsx` grid; that
  file is deleted) and `components/teacher/homework-lesson-dialog.jsx`
  per student. `StudentRow` itself composes the schedule-editing block
  and delete-confirmation dialog (moved in from the old card, not
  re-imported — they're private to this one file now) plus the existing
  `StudentProfileSection` and a new `CurriculumProgressDetail` checklist,
  all rendered inline when a row is expanded rather than in a separate
  modal.
- `StudentDashboard.jsx` is the unauthenticated student-facing view,
  reading/writing through `src/firebase/*` directly for calls that don't
  need teacher auth, and through callables (with `initiator`/`confirmedBy:
  "student"`) for reschedule/cancellation actions.
- `src/lib/schedule.js` duplicates slot-normalization logic client-side so
  the dashboard can render/validate schedules without a round trip;
  `functions/core/schedule.js` is the server-side source of truth.
- `homework-lesson-dialog.jsx`'s "completing" mode and the read-only
  "completed" summary both show attendance/homeworkDone/rating — restored
  after an earlier pass had accidentally dropped them; `completeLesson`
  (both `core/lessons.js` and the `index.js`/`src/firebase/lessons.js`
  callable signature) takes `{attendance, homeworkDone, rating}` again.
  `topic` stays deliberately separate — editable anytime via
  `updateLessonTopic` (plain client `updateDoc`) while a lesson is
  upcoming, not part of `completeLesson`'s payload.
- Teacher's notification bell (`TeacherNotificationsBell` in
  `TeacherDashboard.jsx`) and the student's notification block
  (`StudentNotifications` in `StudentDashboard.jsx`) both subscribe
  directly to `notifications/` via `src/firebase/notifications.js` and
  share `components/notifications-list.jsx` for rendering — no dashboard
  builds its own notification-row markup.
- `addLessonMaterial` moved from a direct client `updateDoc` to a callable
  (`functions/core/lessons.js` + `index.js` + `src/firebase/lessons.js`)
  *solely* so attaching a material can trigger a `material_added`
  notification server-side — the material write itself still needs no
  extra validation.

## Critical implementation paths

- Schedule edit → Firestore write on `students/{id}` → two triggers fire
  → upcoming lesson drafts reconciled + Google Calendar events
  created/updated/deleted.
- Lesson reschedule/cancel → `propose*` sets status+initiator on the
  lesson doc and notifies the other side's bot → `confirm*`/`reject*`/
  `cancel*` resolves the status, updates the calendar event (reschedule)
  or deletes it (cancellation).
- Reminder schedulers (`onSchedule`) → `functions/reminders.js` queries
  lessons in the relevant time window → `botMessages.js` builds text →
  `adapters/telegram.js` / `adapters/vk.js` deliver per student's
  registered platform.
