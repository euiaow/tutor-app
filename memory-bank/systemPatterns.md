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
    groups.js                group lessons + group curriculum programs — a
                              group lesson is real per-member students/{id}/
                              lessons mirror docs, NOT its own doc type (see
                              "Group lessons: mirror-doc fan-out" below)
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

- **To make a shadcn `Button` (or other `@base-ui/react` primitive) render
  as a different element (e.g. a real `<a>` instead of a `<button>`), use
  the `render` prop, not a hand-copied duplicate of `buttonVariants`'
  class list on a raw element.** `@base-ui/react`'s components all support
  `render?: React.ReactElement | ComponentRenderFn<...>` (confirmed by
  reading `node_modules/@base-ui/react`'s own `.d.ts` files before first
  using this — `BaseUIComponentProps` exposes it) — e.g. `<Button
  render={<a href={url} target="_blank" rel="noopener noreferrer" />}>`
  keeps the exact visual styling while genuinely rendering an `<a>`.
  First used in `PublicLanding.jsx` (session 8) to fix unreliable
  desktop back-navigation after a scripted `window.open()` call for an
  external `t.me` link — a native anchor click is the browser's own
  trusted mechanism for opening/handing off a link and doesn't carry
  `window.open()`'s cross-browser popup/tab-reuse unpredictability. Reach
  for `render` any time a "make this styled control open a real link"
  need comes up again, instead of duplicating `buttonVariants`.
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
- **A recurring slot's Calendar event is one real `RRULE:FREQ=WEEKLY`
  master event (`buildEventResourceForSlot`/`buildGroupEventResourceForSlot`,
  `core/googleCalendar.js`) — `student.googleEventIds[slotIndex]`/
  `group.googleEventIds[slotIndex]` always point at that one master id,
  never a specific occurrence.** Calling `deleteLessonEvent` (a plain
  `calendar.events.delete` on the master id) removes the *entire* series —
  every past and future occurrence — correct only when the whole
  student/group/slot is genuinely going away (`deleteStudent`, `deleteGroup`,
  a schedule slot actually removed, `syncStudentScheduleToGoogleCalendar`'s
  own "slots cleared" branch). **Cancelling a single occurrence of an
  ongoing recurring lesson must never call `deleteLessonEvent` on this id**
  — use `deleteLessonEventInstance` instead (same
  `calendar.events.instances()` lookup `rescheduleLessonEvent` already uses
  to find the one instance nearest a given date, then deletes just that
  instance). `cancelLessonDirectly`/`confirmCancellation`/`cancelGroupLesson`
  all branch on `lesson.isExtraLesson`: true → `deleteLessonEvent` (an extra
  lesson's own event has no series to preserve), false →
  `deleteLessonEventInstance`. This was a real, live bug (session 39,
  confirmed via production `410 "Resource has been deleted"` errors) before
  this branch existed — every cancel call site touching a recurring slot's
  `googleEventId` needs this same branch; a new one added later that
  doesn't will silently kill that slot's calendar series on its first use.
- **Google Calendar's `events.get()` on a deleted event does not reliably
  throw 404/410 — it can return successfully with a "tombstone" body,
  `status: "cancelled"`** (confirmed empirically in session 39: a first
  existence-check implementation that only caught thrown errors reported
  zero missing events against two ids already proven dead via `410`s in the
  logs). Any code that checks "does this Calendar event still exist" must
  check `response.data.status !== "cancelled"` in the success path, not just
  catch a not-found error — see `ensureSlotEventsExist`. Also, Calendar
  returns `410`, not `404`, for a resource that already used to exist and
  was deleted (a second delete/get against the same id) — `isNotFoundError`
  treats both the same way.
- **Self-healing exists for a missing Firestore "upcoming" draft
  (`ensureUpcomingLesson`, called from `dailyReminderMidday` once a day —
  see `getUpcomingLessonDates`) but, before session 39, nothing analogous
  existed for a missing Calendar event** — `syncStudentScheduleToGoogleCalendar`/
  `syncGroupScheduleToGoogleCalendar` only ever fire on a genuine
  `scheduleSlots` diff, so a Calendar event lost for any reason (a bug, a
  manual delete in Google Calendar's own UI, Calendar not connected yet at
  the moment a slot was first created) stayed lost forever unless the
  teacher happened to make a real schedule edit afterward. New
  `ensureStudentCalendarEvents`/`ensureGroupCalendarEvents`
  (`core/googleCalendar.js`) are the Calendar-side counterpart, wired into
  the same daily cron: for every current slot, verify its recorded event id
  still resolves to a live (non-tombstoned) event and recreate whatever's
  missing, without touching or refreshing an event that's still there. Any
  future "X can go missing but nothing brings it back" report in this
  codebase should look for whether a matching self-heal exists in
  `dailyReminderMidday` before assuming a one-off manual fix is enough.
- **`mapStudentDoc` (`src/firebase/students.js`) now exposes
  `platform`/`telegramChatId`/`vkPeerId`/`contactUrl`/`accessCode`** —
  previously the client-side student object silently dropped these
  Firestore fields even though they exist on the doc. `platform`/
  `telegramChatId`/`vkPeerId`/`contactUrl` were added when building
  `getContactUrl` (`src/lib/contact.js`); `accessCode` (the student's
  no-auth login PIN) was added in session 11 to power a "Пароль" display
  on the teacher's student card, hitting the exact same gap a second time.
  **`mapStudentDoc`'s explicit field list, not Firestore itself, is the
  actual gate on whether a field reaches the UI** — any future feature
  reading a new student field must check this function first, since a
  field existing on the Firestore doc is not sufficient for the client
  object to expose it. **Confirmed as a recurring bug class, not a
  one-off**: `src/firebase/lessons.js`'s `mapLessonDoc` hit the exact
  same gap twice more — first for `slotIndex`/`isExtraLesson` (session
  14), then for `teacherId` (session 15, root cause of the video-call
  button silently never working — see [[activeContext]]). **Any new
  mapper function in this codebase (`mapStudentDoc`, `mapLessonDoc`,
  `mapTemplateDoc`, etc.) should be treated as a standing suspect the
  moment a field "exists in Firestore but isn't showing up" — check the
  mapper's explicit field list before looking anywhere else, and when
  adding a genuinely new field to a Firestore doc, add it to the mapper
  proactively in the same change, not after discovering the gap later.**
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
- **CSS rules declared outside any `@layer` always beat every layered rule,
  regardless of layer order or source position — this is real CSS cascade
  behavior, not a Tailwind quirk, and it silently broke the teacher panel's
  modals for a whole session (2026-08-01) before being found.**
  `.teacher-theme` (`index.css`) declares its own `background`/`color`
  directly on itself so portaled dialog elements (which need the class
  applied straight to them, since Base UI's `Portal` moves them out of the
  `.teacher-theme` DOM subtree entirely) can resolve its CSS variables. It
  was written as a bare, unlayered rule; Tailwind v4's `@utility` directive
  (used for `glass-panel`, `glass-tile`, and every core Tailwind class)
  puts its output inside `@layer utilities` — so on any element carrying
  both `teacher-theme` and a utility touching the same property (`bg-ink/25`
  on the dialog Backdrop, `glass-panel`'s own `background` on the Popup),
  the unlayered rule always won regardless of which class came later in the
  `className` string. Fixed by wrapping `.teacher-theme` in `@layer base`.
  **Any future "apply a theme-scoping class directly onto portaled/escaped
  elements to carry CSS variables past the Portal boundary" pattern must
  live inside a named `@layer`, never bare** — otherwise it'll silently
  fight (and always beat) every Tailwind utility applied alongside it.
- **A `position:relative`, `z-index:auto` element's own background paints
  *after* its own negative-`z-index` descendants resolve — painting a page
  background on the same element that's the direct parent of a
  `position:fixed`/`z-index:-N` decorative layer will dim or hide that
  layer, not sit behind it.** Per CSS2.1 Appendix E's painting order,
  negative-z-index descendants of a stacking context paint before that
  context's own "stack level 0" content — and a positioned element with
  `z-index:auto` (like `.teacher-theme`, `position:relative` with no
  explicit z-index) counts as stack-level-0 content of whatever ancestor
  context it's actually resolved in, painted *after* negative-z siblings/
  descendants of that same context. Confirmed by moving the teacher panel's
  background gradient off `.teacher-theme` (direct parent of its
  `bg-grain-blobs`/`blob-a`/`blob-b` decorative layer, `z-index:-10`) onto
  `body:has(.teacher-theme)` instead — matching the "redesign teacher v1"
  mockup's own mechanism, where the equivalent gradient lives on real
  `<body>`, an ancestor *outside* the position:relative wrapper, never
  competing with the fixed layer for paint order. **Rule of thumb for any
  future "background behind a fixed decorative layer" work: the background
  must live on an ancestor that is not that layer's own positioned parent.**
- **`--card-opaque`** (`index.css`, root `:root`) exists for screens that
  render straight on root design tokens with no decorative background
  layer of their own — `PublicLanding.jsx`, `SelfServiceSignup.jsx` swap
  `bg-card` → `bg-[var(--card-opaque)]` rather than using the (as of the
  "redesign student v3" migration) translucent `--card`, which would blend
  into a flat page with nothing behind it. `LoginScreen.jsx` used this too
  until `StudentGrainBackground` was added directly to it, at which point
  it switched to the real translucent `glass` utility class instead —
  **the moment a screen gains its own decorative background, revisit
  whether `--card-opaque` is still needed for it**, don't assume the
  point-fix must stay forever once applied. `TeacherLogin.jsx` followed
  the same trajectory in session 10: redesigned around `.teacher-theme`'s
  own grain/blob background (`bg-grain-blobs`/`blob-a`/`blob-b`/
  `grain-layer`, the same decorative layer `TeacherDashboard.jsx` uses) and
  `glass-panel`/`glass-tile`, so it no longer needs `--card-opaque` either.
- **Base UI's `Dialog.Backdrop` skips rendering entirely for a "nested"
  dialog** (a `Dialog.Root` opened while an ancestor `Dialog.Root` is
  already open, detected automatically via React context, not something
  opted into) **unless `forceRender` is explicitly passed** — confirmed by
  reading `node_modules/@base-ui/react/dialog/backdrop/DialogBackdrop.js`
  directly: `enabled: forceRender || !nested`. Found when the teacher
  bot-connect "Сбросить подключение" confirmation dialog (opened from a
  Popover trigger living inside the already-open notifications-bell
  dialog) rendered with zero dimming/blur behind it — not a z-index bug,
  the `<div>` simply wasn't in the DOM at all. Fixed via a new `elevated`
  boolean prop on `TeacherDialogContent` (`theme-ui.jsx`): bumps
  Backdrop/Popup from `z-[100]`/`z-[101]` to `z-[110]`/`z-[111]` *and*
  passes `forceRender={elevated}` to the Backdrop — both parts are
  required, the z-index bump alone does nothing if the element never
  renders. **Any future confirmation dialog opened from inside an
  already-open `TeacherDialog` must pass `elevated`.** `TeacherPopoverContent`
  needed the same z-index bump (`z-[100]` → `z-[110]`) for the same
  reason — a Popover has no backdrop to worry about, but its own Popup
  was still tied for z-index with the outer Dialog's Backdrop, so it could
  render behind the outer Dialog's Popup. **Session 15: this same gap
  bit 3 more dialogs** (`RescheduleDialog`/`CancelLessonDialog` in
  `upcoming-lesson-card.jsx`, nested inside "Следующие уроки"; and
  `HomeworkLessonDialog`, which hand-rolls its own `Dialog.Backdrop`
  outside `TeacherDialogContent` and had no `elevated`-equivalent support
  at all until fixed) — **any dialog that is EVER opened from inside
  another already-open dialog anywhere in the app needs this treatment,
  and it's cheap to apply unconditionally** (bumping z-index/forcing
  render is harmless even when a given usage happens not to be nested).
  Also found `TeacherPopoverContent` had **zero** transition/animation
  classes at all (not incomplete — entirely absent, so it popped open
  instantly with no fade), and its z-index (`z-[110]`) needed a further
  bump to `z-[120]` — above `elevated`'s own `z-[111]` — once a Popover
  (`ProgramTopicPicker`) started living inside an `elevated`
  `HomeworkLessonDialog`. **Rule of thumb going forward: any popup
  primitive in this app (Dialog, Popover, and any future one) needs both
  a `data-[starting-style]`/`data-[ending-style]` transition AND a
  z-index high enough to clear every dialog tier it could ever be nested
  inside — check both whenever adding a new popup-shaped component, don't
  assume either one "just works" by copying an existing className.**
- **Telegram's `callback_data` has a real 64-byte limit that this project
  bumped into for the first time in session 10.** Every existing
  student-facing reschedule/cancellation callback encoded at most one
  Firestore auto-id (20 chars) plus a short prefix comfortably under the
  limit. The new teacher-facing keyboards need **both** `lessonId` and
  `studentId` in the callback data (the teacher's chat has no student doc
  to resolve identity through, unlike a student's own chat) — a verbose
  prefix like `teacher_confirm_reschedule_` pushed the total past 64 bytes
  once both ids were appended. Fixed by using short prefixes instead
  (`t_confirm_resch_`, `t_cancel_resch_`, `t_confirm_cxl_`,
  `t_reject_cxl_`) — VK's equivalent JSON `payload` field has no such
  constraint, so its action names stay descriptive
  (`teacher_confirm_reschedule` etc.). **Any future Telegram inline
  keyboard that needs to encode more than one Firestore id in
  `callback_data` should budget for this limit up front, not discover it
  after building the keyboard.**

- **An unexpectedly large or feature-*regressing* uncommitted diff should
  be diffed against recent commit history before being treated as new
  work.** Session 11 opened with one uncommitted file
  (`homework-lesson-dialog.jsx`) whose diff, read at face value, looked
  like a plausible-if-ugly rewrite (generic shadcn `Dialog` instead of the
  themed one, missing curriculum checklist, missing cancelled-lesson
  block). `git diff <candidate-commit> -- <file>` against a few recent
  commits found an exact match to a commit from ~8 commits back — it was
  a silent revert, not new work. **Any time a working-tree diff looks like
  it's *removing* already-shipped functionality, check
  `git log --oneline -- <file>` and diff against a few candidates before
  assuming the diff is intentional** — this project's git history (see
  [[techContext]]) makes that check cheap and it caught real lost work
  here.
- **A real `<a href>` (not a programmatic `window.open()`) is required for
  reliable native-app handoff on mobile.** `ContactButton`/
  `ContactIconButton` (`contact-button.jsx`) originally routed "Написать"
  through `openExternalLink` (`src/lib/telegramWebApp.js`), whose
  non-Mini-App fallback is `window.open(url, "_blank", ...)` — mobile
  browsers don't reliably hand a *scripted* `window.open()` call off to an
  installed app via a custom scheme (`tg://user?id=...`) or App/Universal
  Link, only a genuine user click on a real anchor element does. Fixed
  with a new `ContactLink` component: renders a real `<a href={url}
  target="_blank" rel="noopener noreferrer">`, but still intercepts the
  click (`e.preventDefault()` + `window.Telegram.WebApp.openLink(url)`)
  specifically inside the Telegram Mini App, since that's the SDK's own
  sanctioned navigation path, not the bug. **Any future "open this
  contact/external link" button must render as (or programmatically click)
  a real `<a href>`, never call `window.open()` directly from an
  `onClick`** — `openExternalLink` itself is unchanged and still used
  elsewhere (video-call buttons, `PublicLanding.jsx`); this fix only
  applies to the two contact-button call sites so far.
- **Mobile row-squeeze fix: `flex-col` + `sm:flex-row`, `sm:truncate`
  instead of unconditional `truncate`, `sm:contents` for mobile-only inline
  labels.** Established across three list rows this session
  (`finance-section.jsx`, `pending-registrations.jsx`,
  `student-row.jsx`'s collapsed row) that used to be a single
  `flex-wrap items-center` row with a `flex-1 min-w-0` name/label column
  next to a `shrink-0` button/value group — that combination never
  actually wraps on a narrow screen (the flex-1 side just shrinks/
  truncates instead), which reads as "the row squeezed instead of
  stacking." Fix: the row container becomes `flex flex-col gap-*
  sm:flex-row sm:flex-wrap sm:items-center sm:gap-*`; the identifying
  name/label keeps `truncate` only via `sm:truncate` (full text on
  mobile, truncated again once the desktop single-line layout kicks in);
  secondary content (progress bar, buttons, values) lands in a second
  block that's naturally full-width on mobile and rejoins the row at
  `sm:`+. For adding an inline label next to a value that should only
  show on mobile (Финансы's "Оплачено:"/"Ставка:"), wrap `<label
  span>+<value span>` in an outer `<span className="flex items-center
  gap-1.5 sm:contents">` — `sm:contents` makes the wrapper disappear from
  layout at `sm:`+ so the value span rejoins the desktop row exactly as
  before (same fixed width/alignment classes), while the label
  (`sm:hidden`) only ever shows below that breakpoint. **Reach for this
  exact shape (not a fresh one-off) the next time a list row squeezes
  instead of stacking on mobile.**

- **A `students/{id}`-style Rule that's intentionally `allow read: if true`
  (for an unauthenticated actor to read their own doc) means Rules can
  *never* scope a `list` query on that collection down by owner — the
  `teacherId` filter has to live explicitly in the client query itself,
  every time, not be assumed to come free from the security rule.**
  Confirmed twice this session (session 12): `subscribeToStudents()` and
  `subscribeToPendingRegistrationTokens()` were both plain unfiltered list
  queries. Fixed by adding `.where("teacherId", "==", teacherId)`
  explicitly and making `teacherId` a required first param on both. Any
  future list query against a collection whose Rule has to stay open for
  an unauthenticated read must follow this same shape.
- **A `collectionGroup`/list query whose security rule checks
  `resource.data.teacherId` is rejected outright (the whole query, not a
  silent per-document filter) unless the query itself is provably scoped
  on that same field via an explicit `where`.** Confirmed via real
  `permission-denied` browser-console errors (session 12, right after
  Firestore Rules were published for the first time — see
  [[techContext]]): `getCurriculumTemplates`, `subscribeToUpcomingLessons`,
  `subscribeToCompletedLessons`, `subscribeToIncomeLessons`,
  `getAllCompletedLessons`, `getAllCurriculumProgressByStudent`
  (collectionGroup `curriculumProgress`) all had this shape and all threw
  identically. Fixed uniformly: every one of these now takes `teacherId`
  as an explicit param and adds `where("teacherId", "==", teacherId)`
  alongside its existing filters — a lesson's own `teacherId` field
  (denormalized onto every lesson doc since multi-tenancy Phase 1) makes
  this possible without an extra join. **Any new list/collectionGroup
  query added to this app must include this filter from the start**, not
  discover the gap only after Rules enforcement catches it.
- **Firestore composite indexes and single-field indexes are configured in
  two different places in `firestore.indexes.json` — mixing them up 400s.**
  Adding `teacherId` as a query field alongside `status`/`date` on the
  `lessons` collectionGroup needed a real composite index entry under
  `"indexes"`. But `curriculumProgress`'s query (`teacherId ==` alone, no
  `orderBy`) is a *single-field* equality filter — submitting it as an
  `"indexes"` entry got a real `HTTP 400: this index is not necessary,
  configure using single field index controls` from the Firestore API.
  Single-field collectionGroup index config belongs under
  `"fieldOverrides"` instead (`{collectionGroup, fieldPath, indexes: [{order,
  queryScope: "COLLECTION_GROUP"}]}`). Rule of thumb: a query filter on
  exactly one field with no `orderBy`/second field never needs a composite
  index entry.
  **Confirmed again, the hard way, session 28**: this applies even to a
  *bare* single-field equality filter with no other field at all (e.g.
  `where("groupLessonKey", "==", key)` alone) — Firestore auto-indexes a
  field per-*collection*, but a collectionGroup query over that same field
  still needs an explicit `fieldOverrides` entry with `queryScope:
  "COLLECTION_GROUP"`, or it 400s with "requires an index... not ready yet"
  even under the Admin SDK (bypasses Rules, not index requirements). Caught
  via a live diagnostic that failed until the fieldOverride was deployed
  and had time to finish building (a few minutes, unlike composite indexes
  which can take longer) — don't assume a freshly-deployed index is
  query-ready immediately, poll/retry rather than treating the first
  failure as a real bug.
- **Group lessons: mirror-doc fan-out, not a separate doc type (session
  28-30 rearchitecture — replaced an earlier, session-17/22 design that had
  group lessons as their own docs under `teachers/{uid}/groups/{groupId}/
  lessons`).** A group lesson is now one real `students/{studentId}/
  lessons/{id}` doc per member — the *exact same* shape
  `createUpcomingDraft` produces for an individual lesson — tagged
  `isGroupLesson: true`, `groupId`, `groupLessonKey` (a fresh `randomUUID()`
  tying one occurrence's N mirrors together; nothing else about it is a
  real doc id, since there's no longer a single canonical "the" lesson).
  Because a mirror is a completely ordinary lesson doc, every existing
  per-student mechanism sees it for free with zero new code: the teacher's
  "Ближайшие уроки" feed, all 3 reminder tiers, weekly income, the
  student's own next-lesson/history/materials. Group-level teacher actions
  (reschedule/cancel/complete/create-extra) are fan-out orchestration in
  `core/groups.js`, keyed by `groupLessonKey` (`db.collectionGroup("lessons")
  .where("groupLessonKey", "==", key)`), each updating every mirror plus
  one shared Calendar event (all mirrors carry an identical copy of the
  same `googleEventId`). Reschedule/cancel are teacher-only and immediate
  (no propose/confirm handshake — a shared class time isn't something one
  member can unilaterally renegotiate); the individual-lesson entry points
  that *do* have a confirm handshake (`proposeReschedule`/
  `proposeCancellation`/`cancelLessonDirectly`) refuse to touch a doc with
  `isGroupLesson: true` (`assertNotGroupMirror`), so a student's own bot
  "перенести"/"отменить" flow can never desync their mirror from the rest
  of the group — this guard lives in `core/lessons.js` itself, protecting
  every caller (bot included) at once rather than needing every UI entry
  point individually audited. `slotIndex` on a mirror is always `null` (the
  group's own recurring slot lives in a separate `groupSlotIndex` field) —
  this was a real, previously-latent bug fix too:
  `bucketUpcomingBySlot` used to default any non-numeric `slotIndex` into
  bucket 0, which a single rare extra lesson could get away with but a
  *weekly, guaranteed* group mirror could not — fixed to skip non-numeric
  `slotIndex` entirely rather than default it.
- **Group curriculum programs: tag-and-reuse, not a separate stored copy
  (session 28-30, same rearchitecture wave).** A group's program used to be
  its own doc under `teachers/{uid}/groups/{groupId}/programs` — a second,
  independently-tracked copy that silently diverged from a member's own
  individual assignment of the same subject, and whose "covered" toggles
  never reached the student's real progress at all. Deleted entirely. A
  group now just remembers `programTemplateId`; assigning it
  (`assignGroupProgram`) reuses a member's existing program if they already
  have one for that subject (tags it `sourceGroupId`, `createdByGroup:
  false` — it's still fundamentally *their* data, survives the group being
  deleted) or creates a fresh one via `assignCurriculumTemplate` (tagged
  `createdByGroup: true` — exists *because of* the group, deleted with it).
  The group's displayed progress is computed at *read* time
  (`getGroupProgramView`, `firebase/groups.js`) by intersecting every
  linked member's own real program — a topic reads "covered by the group"
  only once every member's own program has it checked, and a student's own
  extra progress beyond that naturally shows higher on their own page.
  Marking a topic covered from the group view fans out to every linked
  member's own program via the ordinary `setCurriculumItemCovered` — same
  "reuse the individual-student function, just called N times" shape the
  lesson mirror fan-out above uses. **General pattern worth remembering for
  any future "group-of-X shares Y" feature**: don't give the group its own
  independent copy of member data — tag the member's own doc instead
  (`sourceGroupId`/`createdByGroup`-style fields) and compute any
  group-level aggregate view at read time.
- **A shared-component circular import can hide behind two files that look
  unrelated (session 30).** `upcoming-lesson-card.jsx` needed
  `GroupRescheduleDialog`/`GroupCancelDialog` (defined in
  `groups-section.jsx`); `groups-section.jsx` later needed
  `UpcomingLessonCard` itself (to reuse the exact same lesson-card
  rendering for the group's own "Следующие занятия" list) — a genuine
  A→B→A cycle that Vite's build didn't error on (ESM circular deps are
  technically legal, just risky: one side's export can be `undefined` at
  the point the other module evaluates, depending on load order) and would
  only have surfaced as a confusing runtime bug. Fixed by relocating the
  two dialog components into a third file (`group-lesson-dialog.jsx`) that
  neither original file imports, keeping the dependency graph strictly
  one-directional. **When two files start importing from each other, move
  the piece one of them only needs incidentally into a third, lower file
  instead of leaving the cycle in place "because the build didn't
  complain."**
- **Timezone conversion for user-entered date/time input is centralized in
  `src/lib/timezone.js`** (`localInputsToUtcDate`/`datetimeLocalToUtcDate`/
  `utcDateToLocalInput`), reusing the project's existing hand-rolled
  `zonedTimeToUtc`/`getZonedParts` math from `src/lib/schedule.js` (now
  exported) rather than adding `date-fns-tz` as a dependency — the
  existing code already implements the identical algorithm the library
  would (re-measure the zone's offset at a guessed instant, correct for
  it). Every form where a user types a date/time (reschedule proposal on
  either dashboard, the extra-lesson dialog) converts through these,
  interpreting the input as wall-clock time in *that user's own* saved
  timezone (`teachers/{uid}.timezone`/`students/{id}.timezone`, via
  `useTimeZone()` — see below), never the device's timezone. Established
  session 12, reversing an earlier same-session decision that schedule
  slots were permanently Moscow wall-clock time.
- **`src/lib/user-prefs-context.jsx`'s `UserPrefsProvider`/`useTimeZone`/
  `useThemeClass`** is the shared per-viewer-preference context both
  dashboards mount near their root (resolved from the signed-in user's own
  `timezone`/`colorTheme` profile fields, with `Europe/Moscow`/no-theme-
  class fallbacks for a profile that's never opened Settings) — every
  component that formats a date for display or needs the current color
  theme's scope class reads these hooks instead of receiving props
  threaded down manually. Falls back safely (device timezone / no theme
  class) if called outside a Provider, though that should never happen in
  practice. **Any component portaled straight to `document.body`
  (`DialogPrimitive.Portal`, a Popover, etc.) MUST call `useThemeClass()`
  itself and apply the result directly to its own backdrop/popup** — it's
  outside the themed root's DOM subtree, so CSS custom properties can't
  reach it by inheritance. Two dialogs (`GroupLessonDialog`,
  `HomeworkLessonDialog`) were found session 31 with a *literal hardcoded*
  `className="teacher-theme themed"` instead — always rendered pink no
  matter what theme the teacher actually picked, because they were written
  before `useThemeClass()` existed and simply never updated. Grep for a
  bare `"teacher-theme"`/`"amber-scope"` string literal in any portaled
  dialog before assuming an existing one is fine.
- **Color-theme registry (session 31 rearchitecture — `src/lib/themes.js`'s
  `THEME_REGISTRY` + `src/lib/apply-theme-styles.js`'s `applyThemeRegistry()`
  + `index.css`'s shared `.themed` block)**: a theme is exactly 5
  author-facing fields — `backgroundImage` (a `/bg/...` public path or
  `null`), `accent`, `heading`, `subheading`, `text`, `radius`. Adding a
  theme is a pure data change here (plus a matching id in
  `functions/core/themes.js`'s `VALID_THEME_IDS`, hand-kept in sync since
  Functions/CommonJS can't import the frontend's ESM registry) — no CSS or
  component edits needed, confirmed live when a third theme ("blue") was
  added with none. `applyThemeRegistry()` runs once in `main.jsx` before
  React mounts, injecting one tiny runtime `<style>` rule per theme
  (`.{cssClassName} { --accent-color; --heading-color; --subheading-color;
  --text-color; --theme-bg-image; --radius; }`) — everything else any
  component actually reads (`--card`, `--border`, `--shadow-*`,
  `--gradient-*`, decorative blob gradients, `--rose-deep`, etc., ~20
  tokens total) is derived from just those 4 colors in `index.css`'s
  `.themed` rule using CSS relative-color syntax
  (`oklch(from var(--accent-color) L C h)`, reuses the accent's own hue at
  a fresh lightness/chroma per surface) — this one shared derivation block
  is what replaced two independently hand-tuned ~30-variable palettes
  (`.teacher-theme`/`.amber-scope`) that used to drift out of sync with
  each other by construction. An element must carry BOTH the theme's own
  `cssClassName` AND the literal `themed` class for the derivation to
  apply (`useThemeClass()` always returns both together as one string;
  never hand-write just one half). Two sharp edges found the hard way this
  session, both now guarded against directly in `.themed`:
  - A bare `var()` reference with **no fallback**, used *outside* an
    `oklch(from ...)` context, referencing a channel keyword like `h`
    (hue) that's only meaningful *inside* that context, silently
    invalidates the whole declaration (`--primary-foreground: oklch(0.99
    0.005 h)` — bare `h` there is nonsense — broke white button text to
    black on every accent surface). Never reference `l`/`c`/`h` outside an
    `oklch(from ...)` expression.
  - A custom property whose value can't resolve (e.g. its own `var()`
    reference is missing) becomes "guaranteed-invalid," and that
    invalidity **propagates through every token derived from it** —
    critically, a *non-inherited* CSS property (like `background-color`)
    that ends up reading a guaranteed-invalid custom property collapses to
    its own **initial value** (transparent), not to any visible fallback
    or the ancestor's value. `.themed` now declares safe literal defaults
    for `--accent-color`/`--heading-color`/`--subheading-color`/
    `--text-color` *before* deriving anything from them — the real
    per-theme values still win (an unlayered runtime-injected rule always
    beats a rule inside a named `@layer`, like `.themed`'s own `@layer
    base`, regardless of source order or specificity), so this only ever
    matters as a last-resort safety net if the per-theme rule somehow
    fails to apply.
- **`functions/core/notifier.js`'s `createNotification` resolves the
  *recipient's* timezone itself and accepts `text` as either a plain
  string or a `(timeZone) => string` builder function** — added session 12
  so the ~15 message-builders in `botMessages.js` that format a lesson
  date/time can render in each recipient's own saved timezone, including
  the common case where the *same event* fires one notification to the
  student and a separate one to the teacher and the two are in different
  zones (previously one shared pre-built string was reused for both).
  Resolution: `target: "student"` reads `studentData.timezone` (the same
  student-doc read this funnel already did for teacherId resolution, now
  reused rather than doubled), `target: "teacher"` reads
  `teachers/{teacherId}.timezone`. Falls back to `Europe/Moscow` only as a
  no-value-saved-yet default, same as the frontend's identical fallback in
  `lib/timezone.js`.
- **`resolveLessonEventId(lesson, student)`** (`functions/core/lessons.js`)
  is the one place that decides which Google Calendar event id a given
  lesson doc's reschedule/cancellation should touch — added session 12
  after confirming `confirmReschedule`/`confirmCancellation`/
  `cancelLessonDirectly` were all independently defaulting `slotIndex` to
  `0` and reading `student.googleEventIds[0]` for any lesson lacking a
  real slot index, which for an extra (unscheduled) lesson either found
  nothing or silently touched **slot 0's own recurring event** instead of
  the extra lesson's. Returns `lesson.googleEventId` directly when
  `lesson.isExtraLesson`, the slot-indexed lookup otherwise. Any future
  code resolving a lesson's calendar event id must use this, not
  re-derive the slot-index lookup inline.
- **A recurring wall-clock value (schedule `dayOfWeek`+`time`) needs its
  own stamped anchor timezone, separate from whatever timezone it's being
  displayed in — conflating the two makes a timezone conversion a silent
  no-op (session 15).** `getNextLessonDateForSlot` used to take a single
  `timeZone` param used for both "what timezone does '16:00' mean" and
  (implicitly, since callers passed the *same* value for both purposes)
  the eventual display zone — so converting a legacy slot's time always
  round-tripped back to itself regardless of which zone the teacher
  switched their Settings preference to, exactly reproducing "nothing
  changed" from the user's perspective. Fixed by giving each slot its own
  `timeZone` field (stamped with the teacher's current preference at
  save time, `student-row.jsx`'s `StudentEditModal.handleSave`) that
  `getNextLessonDateForSlot` prefers over any passed-in fallback — the
  fallback is now only ever `Europe/Moscow` (the function's own built-in
  default), never "whatever timezone the viewer currently has selected."
  **Any future "recurring local time, viewed by someone whose timezone
  preference can change" feature must keep the anchor timezone and the
  display timezone as two genuinely separate values — never let a
  "current preference" fallback serve as the anchor for data that should
  stay pinned to whenever it was actually set.**
- **Gamification (sticker cases, session 15) reuses the finance.js
  transactional shape exactly** — `openCase`
  (`functions/core/gamification.js`) does one `db.runTransaction` for the
  balance-check + inventory-write + ledger-write, same as `addPayment`/
  `deductLessonFromBalance`. New wrinkle this reuse didn't have before:
  the "already own this?" check is a deterministic Firestore doc id
  (`${setId}_${stickerId}`, not an auto-id) on the inventory subcollection
  — doubles as both the dedup key and the transaction's ownership read, no
  separate query needed. **`stickerSets` is a deliberate GLOBAL catalog
  (no `teacherId`), the first top-level collection in this app that
  isn't per-teacher scoped** — confirmed explicitly with the user before
  building, since every other admin-authored collection so far
  (`curriculumTemplates`, `examTypes`) followed the per-teacher pattern
  by default. If a future feature needs a genuinely shared, non-teacher-
  scoped catalog again, this is the precedent: no `teacherId` field, no
  `where("teacherId", ...)` filter, and Rules for it are a plain
  `allow read: if true` with no ownership check at all.

- **A Claude Design canvas export (`.dc.html`, its own `DCLogic`-class
  component with a `state`/`renderVals()` shape) ports to a real React
  component by a direct mechanical translation, not a rewrite from
  scratch: `state = {...}` → one `useState` per field (or a few grouped),
  `renderVals()`'s computed style strings → inline `style` objects computed
  during render, `setState({...})` calls → the matching setter calls
  (session 17, `sticker-workshop-modal.jsx` from `roulette-design/Sticker
  Modal v2.dc.html`).** Any hardcoded demo content the canvas used to make
  its mockup concrete (in this case: 3 named cases "SLAY/CLEAN/REELS" with
  bespoke per-case artwork and hand-picked hex colors per demo sticker)
  needs a real data-driven replacement, not a literal port — done here via
  `set.coverUrl` (falls back to a deterministic name-hash color, same
  `getSubjectColorClass`-style approach as `lib/subjects.js`) and a
  per-sticker color hash instead of the design's bespoke per-item hex
  values. A visual takeover meant to look nothing like the rest of the
  app's own dialog system (an arcade cabinet vs. the app's glass aesthetic)
  should render via `createPortal(..., document.body)` directly at a high
  `z-index`, not through the shared `GlassDialog`/`ui/dialog.jsx`
  primitives, which would fight it for both styling and z-index tier.
  **When a canvas's client-side "spin the wheel" logic must actually be
  backed by a server-authoritative result (a case-opening gamble, not a
  cosmetic animation), gate the animation's start on the server response,
  not the button click** — build the reel/strip only after the
  Cloud Function call resolves, with the *real* returned item pinned at the
  fixed landing index, and show a plain loading state in between; this is
  the only way to guarantee the visual outcome can never disagree with
  what was actually granted server-side. **Correction from session 20:
  when a canvas branches per-item art by matching a hardcoded demo name
  (`isSlay`/`isClean`/`isReels` keyed on `s.name === 'SLAY'` etc.), the
  branch that actually matters is the *slot/index* the art was designed
  for, not the literal name string** — session 18 initially treated
  `reels-lettering.png` as irrelevant because the real 3rd case is named
  "MYTHIC", not "REELS", and left it with a plain-text fallback; the
  right read (confirmed by the user) was that the design's 3rd slot has
  its own distinct visual treatment (a bordered photo card, since that
  asset isn't lettering art like the other two) that belongs to whichever
  case fills that slot. When porting a canvas with per-item demo
  branches, check whether each branch represents a *content-specific*
  choice (skip it if the real data has no equivalent) or a *positional/
  stylistic* one (port it regardless of what the real item is named).
- **Decorative overlays that must track a specific card, not the page
  (session 21, `DecorationZone`/placed stickers on the student dashboard):
  anchor each overlay with `position:absolute` inside that *specific*
  card's own `position:relative` wrapper, never inside the page's outer
  container.** The student dashboard already has a banner
  (`StudentNotifications`) that can appear/disappear between two cards and
  push everything below it down — an overlay positioned against the page
  (fixed pixel offset from the top of the whole layout) would misalign the
  instant that banner's visibility changed, while one anchored to its own
  card's relative box moves automatically with normal document flow, with
  zero banner-aware code needed. The tradeoff: an overlay can only overlap
  its *own* anchor card's borders (via negative offsets), not some other
  card's — if the desired visual position spans two cards, pick whichever
  one is closer and let it overlap outward from there (see `activeContext.md`
  session 21 for zone1-5's exact anchor choices).
- **Sizing a corner-overlap decoration against real named neighbors
  (session 25 correction to the pattern above): compute the negative
  offset from the actual `gap`/`padding` values in the surrounding layout,
  not a guessed round number.** Session 21's zone1/zone2 offsets were
  picked without reference to anything concrete and landed directly on the
  header's settings-gear/avatar icons. The general check: for a top-corner
  overlap, the negative `top` offset must stay ≥ -(the flex `gap` to the
  previous sibling) or it starts sitting on that sibling's own content —
  the current card's own padding is a safe buffer beyond that (an
  element's `p-6`/`p-7` is real empty space before its first child
  renders, so a shallow overlap that stays within that padding width lands
  on nothing). The same logic applies in reverse for a bottom-corner
  overlap against the card's own bottom padding, which is why bottom
  corners are generally the safer default when either edge would satisfy
  the design brief, and why two zones sharing one anchor card should split
  across a top and a bottom corner rather than doubling up on one side.
- **A decoration that overlaps *downward* into a later sibling needs
  `z-index` on its anchor card, not just on itself (session 26, zone5 on
  `ExamRadar`).** A `position:relative` card with no `z-index` of its own
  does not win a stacking comparison against a later DOM sibling, no
  matter what `z-index` its own overflowing child carries — the child's
  `z-10` only out-ranks other elements *inside that same stacking
  context* (i.e. other children of the same card), not a wholly separate
  sibling section. In practice: a decoration overlapping *upward* into an
  *earlier* sibling needs no fix (it already wins by plain DOM paint
  order — later elements paint over earlier ones by default), but one
  overlapping *downward* into a *later* sibling needs the anchor card
  itself promoted with a real `z-index` (e.g. `relative z-10`, not just
  `relative`) or it silently renders underneath whatever comes next,
  looking like the decoration vanished rather than like a CSS bug.

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
  lesson doc, notifies the other side's bot (with an interactive keyboard
  if the recipient is the student *or*, as of session 10, the teacher —
  both sides now get buttons, not just the student) → `confirm*`/
  `reject*`/`cancel*` resolves the status, updates the calendar event
  (reschedule) or deletes it (cancellation). **Cancellation, as of session
  10, never deletes the lesson doc either way** — `confirmCancellation`
  (two-sided) and `cancelLessonDirectly` (one-sided) both set
  `status: "cancelled"` and leave the doc in place, so it still shows up
  in lesson history with an "Отменён" badge; history queries already
  filtered `status !== "upcoming"` so needed no change, only the two
  cancellation functions themselves and the badge display did.
- **Proposal-message cross-channel deletion** (session 10): a propose*
  call that sends a keyboard records where it went —
  `lesson.proposalMessage: {platform, chatId, messageId}` for the student
  side (at most one, a student only has one linked platform),
  `lesson.teacherProposalMessage: Array<{platform, chatId, messageId}>`
  for the teacher side (0–2, since the teacher can have both Telegram and
  VK connected at once via `core/teacherConnect.js`). Every resolution
  path (`confirmReschedule`/`cancelReschedule`/`confirmCancellation`/
  `rejectCancellation`) calls `deleteProposalMessages(lesson, ...)`
  (`core/lessons.js`) before/alongside its own Firestore update — one
  shared deletion path regardless of whether the resolution came from a
  bot button press or a website click, so the message never sits there
  looking unanswered when it was actually resolved through a different
  channel. `sendReminderToStudent`/`sendMessageToTeacher` had to change
  their return shape (from plain `boolean` to an object/array carrying the
  sent message's platform+chatId+messageId) to make this possible;
  `createNotification` surfaces this as `sentMessage`/`sentMessages`.
- Reminder schedulers (`onSchedule`) → `functions/reminders.js` queries
  lessons in the relevant time window → `botMessages.js` builds text →
  `adapters/telegram.js` / `adapters/vk.js` deliver per student's
  registered platform. A fourth scheduler, `updateVideoCallAvailability`
  (session 10, every 5 min), used to maintain a `lesson.videoCallAvailable`
  flag for the student dashboard's video-call button — **removed entirely
  in session 13** in favor of a pure client-side time comparison (see
  below); if you see this flag referenced anywhere, it's dead.

- **Video call button availability is computed client-side, not server-
  maintained (session 13, replacing the session-10 design).** The button
  in `StudentDashboard.jsx` shows whenever the teacher has a video call
  link configured (`teachers/{teacherId}/integrations/videoCall`), and its
  enabled/disabled state is a plain `effectiveDate.getTime() - now.getTime()`
  comparison against a 30-second `setInterval` tick — active from 3
  minutes before the lesson through 60 minutes after. No server round
  trip, no Cloud Function, no Firestore field. Deliberately simpler than
  the old design (a scheduler that wrote `lesson.videoCallAvailable` every
  5 minutes) for a case that never needed server authority — the window
  check is the same on client and server, and the student's own device
  clock is good enough for "is it roughly lesson time."

- **`confirmReschedule`/`confirmCancellation` use `db.runTransaction` for
  their read-check-write, not three separate calls (session 13).** Two
  near-simultaneous confirms of the same pending proposal (e.g. answered
  from both the lesson banner and the notification panel at once — a real
  race `notifications-list.jsx` already documented as theoretically
  possible) used to both read `rescheduleStatus`/`cancellationStatus` as
  still-pending before either committed its write, so both would proceed
  to send duplicate notifications and make duplicate/conflicting Calendar
  API calls. Wrapping the read+status-check+write in a transaction makes
  it atomic — Firestore forces a losing concurrent transaction to retry,
  see the now-updated status, and throw `failed-precondition` correctly
  instead of duplicating the whole confirm flow. The transaction returns
  the *pre-update* snapshot data (same shape every downstream step in the
  function already expected), and only the Firestore read+write is inside
  the transaction — Calendar calls and notification sends stay outside it
  (external API calls don't belong inside a Firestore transaction, which
  may retry). Any future dual-surface "confirm this pending thing" action
  should use the same pattern, not read-then-check-then-write as three
  separate awaits.

- **Multi-program data model (session 13): `students/{id}/programs/
  {programId}`, not a singleton `curriculumProgress/main`.** A student can
  have several curriculum programs assigned at once (e.g. one per
  subject). Each program doc carries its own `subject`/`templateId`/
  `examTypeId`/`teacherId` (denormalized, same pattern as
  `lessons`/`balanceLedger`)/`topics`/`prototypes`/`targetScore`/
  `examDate` — the goal (`targetScore`/`examDate`) now belongs to the
  *program*, not the student as a whole, since a student with two
  programs can be prepping for two different exams with two different
  targets. `assignCurriculumTemplate` **adds** a new program (never
  overwrites); replacing one already-assigned program's template-derived
  content in place is the separate `reassignProgram(studentId, programId,
  templateId)` — it resets that program's topics/prototypes but
  deliberately leaves `targetScore`/`examDate` untouched (a goal isn't
  "which template populates the topic list," so replacing the template
  shouldn't silently wipe a goal the student already set). Every
  program-scoped backend function (`markTopicsCovered`,
  `addPersonalTopic`, `removePersonalTopic`, `setStudentGoal`) now takes a
  required `programId` parameter — there is no implicit "the student's
  one program" anymore. The old `curriculumProgress/main` docs are left
  in place as an unread backup after migration (see
  `functions/scripts/migrateToPrograms.js`), confirmed via a full-repo
  grep that no code path reads that collection name anymore.

- **Subject color is a deterministic hash of the subject's own display
  name, not a hardcoded lookup table (session 13).** `getSubjectColorClass`/
  `getSubjectColorIndex` (`src/lib/subjects.js`, backend twin
  `functions/core/subjectColor.js`, kept in sync by hand — same ESM/
  CommonJS split as `schedule.js`) hash the subject name (djb2-style) into
  an index over a fixed palette (11 CSS-class entries on the frontend, 11
  Google Calendar `colorId`s on the backend) — replaces the old
  `TAG_STYLES` map (student-tags.jsx) and `SUBJECT_CALENDAR_COLOR_ID` map
  (googleCalendar.js), both of which only covered 2 hardcoded subjects.
  Subjects themselves are now free-form (`STATIC_SUBJECTS` (10) +
  `teachers/{uid}/customSubjects`, deduped by name, + `teachers/{uid}.
  recentSubjects` top-3), not a closed enum — the hash is what makes an
  arbitrary future subject name still get a consistent, collision-tolerant
  color without anyone having to register it anywhere.

- **Exam types are a teacher-owned Firestore collection
  (`teachers/{uid}/examTypes`), not a hardcoded "ege"/"oge"/"school" enum
  (session 13).** Each type carries `name`/`scaleType`
  (`"score"|"grade"|"none"`)/`scaleMin`/`scaleMax`/`scaleStep`/
  `scaleUnitLabel`. 3 starting types are seeded client-side in `App.jsx`'s
  `ensureTeacherProfile` (the same place the `teachers/{uid}` doc itself
  gets bootstrapped — there's no Cloud Function trigger on teacher
  creation in this project, see that function's own comment) the moment a
  new teacher doc is created. `scaleType: "grade"` is the generalization
  of the old ОГЭ-specific "show a bare number, no unit word" formatting
  rule (`isGradeScale` in both `MyGoalCard`/`GoalCard` and `ExamRadar`) —
  any future exam type with a grade-like scale gets the same treatment
  automatically, not just one literally named "ОГЭ". `curriculumTemplates`
  and `students/{id}` (now `students/{id}/programs/{programId}`, see
  above) both store `examTypeId` (a reference), not the old enum string —
  every display site needs the teacher's examTypes list loaded to resolve
  a name/scale from the id, there's no longer a pure `formatExamTarget(id)`
  function that works without that list.

- **An ordinal/index-based target scale reuses the same
  `requiredItems()`/threshold mechanic a numeric scale uses, with zero
  radar/backend changes (session 14).** `language_level` exam types store
  `targetScore` as an index into `LANGUAGE_LEVELS` (0-5), and
  `requiredItems()` (`src/lib/examRadar.js`) only ever does
  `item.minScoreRequired <= targetScore` — a plain number comparison that
  doesn't care whether the number represents points or a level index. So
  giving language-level topics their own "actual from level X" mechanic
  needed **no changes to `examRadar.js` or any backend function at all** —
  only the curriculum template editor's input widget changed
  (`curriculum-section.jsx`'s `RowList` gained a `levelMode` prop that
  swaps the numeric `<input>` for a `LevelStepper` arrow control over the
  same `minScoreRequired` field). **When adding a new ordinal scale type
  in the future, check whether the existing score-comparison plumbing
  already works before writing new comparison logic — it very often
  does, since `minScoreRequired`/`targetScore` were never typed as
  "points," just numbers.**

- **Per-slot subject binding follows the same "store null, resolve a
  fallback at read time, no backfill" shape multi-tenancy's `teacherId`
  and Block 3's exam-type seeding both used (session 14).**
  `scheduleSlots[]` elements can carry an optional `subject`;
  `normalizeScheduleSlots` (both `functions/core/schedule.js` and
  `src/lib/schedule.js`, kept in sync by hand as always) passes it through
  as `null` when absent rather than writing a migration. Every consumer
  resolves the effective subject the same way: `slot?.subject ||
  student.subject?.[0] || null` — duplicated by hand in exactly two
  places (`resolveSlotSubject` in `functions/core/googleCalendar.js` for
  the backend, `resolveLessonSubject` in `src/lib/subjects.js` for the
  frontend, the latter additionally keyed off `lesson.slotIndex` since
  the UI resolves *from a lesson*, not a raw slot). **This pattern — new
  optional field, null on old docs, fallback resolved identically at every
  read site, no backfill script — is now the established default for
  adding a new per-item property to an existing collection in this app;
  reach for a migration script only when the fallback genuinely can't be
  computed from sibling data.**

- **`TeacherPopover`/`TeacherPopoverTrigger`/`TeacherPopoverContent`
  (`theme-ui.jsx`) is the reusable primitive for any "designed dropdown"
  that isn't a native `<select>` (session 14).** Already existed (used by
  the contact-link inline editor); reused as-is for
  `HomeworkLessonDialog`'s `ProgramTopicPicker` (grouped "Темы"/
  "Прототипы" subheadings) rather than building a bespoke popup —
  z-[110]/[111] stacking already handles opening from inside an
  already-open `TeacherDialogContent`. **Reach for this before writing a
  new dropdown-shaped component from scratch.**

- **`TeacherDialogContent`'s own outer `Popup` needs `scrollbar-hidden`
  too, not just whatever scrollable `<div>` a caller nests inside it
  (session 14 finding, corrects an incomplete session-12 fix).** The
  Popup itself is `overflow-y-auto` (so any dialog's content can exceed
  `max-h-[90vh]` and still be reachable) — session 12 added
  `scrollbar-hidden` to the notification bell's own inner list `<div>`,
  which fixed that specific list's scrollbar but left the *outer* Popup's
  native scrollbar visible whenever the dialog's total content (list +
  something below it, e.g. `TeacherBotConnectStatus`) overflowed the
  outer container too. Fixed once on the shared `TeacherDialogContent`
  Popup itself, which covers every teacher dialog, not just this one —
  **a scrollbar bug report should always be checked against every
  `overflow-y-auto` ancestor, not just the innermost one that looks
  responsible.**

- **A comment describing a Firestore rule is not the same as the rule
  existing — read the literal `allow` statements when diagnosing
  `permission-denied` (session 14).** The `notifications/{notificationId}`
  rule had `allow read`/`allow create` written out, followed by a comment
  `// update — unchanged, still open for both sides to mark read` with
  **no actual `allow update` statement beneath it** — so every
  mark-as-read write hit Firestore's default-deny. Symptom looked like a
  client bug (a notification flips to "read" for an instant, then
  reverts) because the Firestore SDK applies writes optimistically to
  local listeners and rolls them back only once the server's rejection
  comes back — easy to mistake for "the UI state is wrong" instead of "the
  write never actually happened." Confirmed via the user's own DevTools
  console (`permission-denied`), not guessed. No local rules file exists
  in this repo (by deliberate policy — see `techContext.md`), so this
  class of bug can only be diagnosed by asking the user to paste the
  actual current rule text or a console error; don't assume a described/
  commented rule is live.

- **A dedicated, per-feature i18next instance (`i18next.createInstance()`),
  not the global singleton, is how student-page localization (session 16)
  stays fully isolated from the teacher panel, which has zero i18n by
  deliberate scope.** `studentI18n` (`src/lib/i18n.js`) loads
  `src/locales/{ru,en}/student.json` and is wired via `I18nextProvider`
  only inside `StudentDashboard.jsx`'s own tree (`StudentI18nGate`, a
  wrapper that resolves `students/{id}.language` once via a plain
  `getStudentLanguage` read — mirroring `getStudentTelegramChatId` —
  *before* rendering the pre-auth PIN screen, then re-syncs
  authoritatively once the live `student` doc loads). Because
  `i18next.createInstance()` is used instead of the module-level
  `i18next` singleton (which `initReactI18next.init()` would otherwise
  register as react-i18next's global fallback for every `useTranslation()`
  call with no explicit Provider in scope), a teacher-side component can
  never accidentally pick this instance up. **Whenever a shared component
  is also rendered by the teacher panel (`notifications-list.jsx`,
  `settings-dialog.jsx`, `truncated-list.jsx`), do NOT add
  `useTranslation()`/i18next imports into that file at all** — either
  precompute the display value in a student-only wrapper before passing
  it down as a prop (`StudentNotifications` resolves
  `buildNotificationText` into a `text` field before handing notifications
  to the shared `NotificationsList`), fork a dedicated student-only
  sibling component (`student-settings-dialog.jsx` instead of touching
  `settings-dialog.jsx`'s `variant === "student"` branch), or add an
  optional prop with a default matching the exact original hardcoded
  string (`TruncatedList`'s `collapseLabel`/`showAllLabel`). This is the
  established pattern for "translate one side of a shared component
  without touching the other side" going forward.
- **Locale-aware helper functions in this codebase take the new locale/
  language as a trailing optional parameter, default value = the exact
  pre-existing hardcoded behavior — never a new required param, never a
  changed default.** Established for `formatLessonDateTime`
  (`lib/schedule.js`)/`formatRelativeTime` (`lib/notifications.js`)
  (`locale = "ru-RU"`), `stickerRarityLabel` (`lib/stickerColors.js`,
  `lang = "ru"`), and `formatSubjects` (`lib/student-profile.js`,
  `noneLabel` defaulting to the original Russian fallback string) —
  session 16. This is what lets a shared lib function serve both the
  untouched teacher panel and the newly-bilingual student page from one
  implementation without a parallel "translated" copy. Reach for this
  shape (not a new function, not a required param) the next time a
  shared formatter needs a language-dependent variant.
- **Typical/seeded content (the fixed `STATIC_SUBJECTS` list, the two
  seeded exam types' `scaleUnitLabel`) gets a small translation
  dictionary; free-form teacher-authored content never does (session
  16).** `src/locales/subjectTranslations.js`/`examUnitTranslations.js`
  — `translateSubject(name, language)`/`translateUnitLabel(label,
  language)` look the value up in a dictionary keyed by the exact known
  Russian string and return it unchanged if there's no entry (a custom
  subject, a custom exam type's own unit label) — there is no reliable
  way to auto-translate arbitrary teacher-authored text, and showing it
  untranslated reads as more correct than a garbled machine translation
  would. Any future "translate some but not all instances of a field"
  need should follow this same dictionary-with-pass-through shape rather
  than trying to detect "is this a typical value" some other way.
- **Student-facing notifications persist `type`+`params` (raw values), not
  a pre-built string — resolved into text at render/send time via a
  shared bilingual builder, `buildNotificationText(type, params,
  language)` (session 16).** `functions/core/notificationMessages.js`
  (CommonJS) mirrored by hand at `src/lib/notificationMessages.js` (ESM)
  — same duplication shape this project already uses for
  `schedule.js`/`subjects.js`. `core/notifier.js`'s `createNotification`
  only does this for `target === "student"`; `target === "teacher"` is
  completely unchanged (still a pre-built `text`/`(timeZone) => string`
  builder), since the teacher panel has no i18n. `params.timeZone` is
  filled in automatically by `createNotification` (it already resolves
  the recipient's timezone for the old text-builder path) — call sites
  never set it themselves. A notification whose underlying event is
  inherently a point-in-time snapshot (the three reminder types'
  "today"/"tomorrow" day label, a countdown's `diffMinutes`) has that
  *computed* value frozen into `params` at send time, not a raw date the
  display function would need to recompute relative to "now" — otherwise
  a reminder re-opened later would silently relabel itself. Old
  notifications (pre-session-16, `text` only, no `params`) are rendered
  as-is with no migration — the student-side renderer
  (`StudentNotifications`/`AllNotificationsDialog` in
  `StudentDashboard.jsx`) checks `notification.params` and falls back to
  `notification.text` when absent. **`mapNotificationDoc`
  (`src/firebase/notifications.js`) needed `params` added to its explicit
  field list — the "mapper's explicit field list is the real gate" bug
  class (see `mapStudentDoc`/`mapLessonDoc` entries above) hit a fourth
  time.**
- **A Firestore trigger's before/after diff-check must compare every field
  that actually affects the recomputation it gates, not just the fields
  that look user-facing — confirmed as a real production bug, not a
  hypothetical (session 16).** `isSlotEqual`
  (`functions/index.js`, used by `syncUpcomingLessonOnScheduleChange` to
  decide whether a schedule edit is "real" and should recompute an
  already-created upcoming lesson's `date`) compared only
  `dayOfWeek`/`time`/`durationMinutes` — not `timeZone`. A legacy schedule
  slot saved with no `timeZone` stamp (falls back to
  `getNextLessonDateForSlot`'s `Europe/Moscow` default, see the session-15
  entry above) could NOT be fixed by a teacher simply re-opening and
  re-saving the exact same schedule (same day/time/duration, now with a
  real `timeZone`) — the trigger judged the slots "unchanged" and silently
  skipped the recompute, so the wrong `lesson.date` (and every reminder
  built from it) persisted regardless of how many times the teacher
  re-saved. Fixed by adding `(a.timeZone ?? null) === (b.timeZone ??
  null)` to the comparison. **Root-cause diagnosis used live production
  data, not arithmetic guessing** — a temporary guarded `onRequest` Cloud
  Function (same "deploy, invoke, delete" pattern as `migrateToPrograms`/
  gamification verification, see `techContext.md`) read the actual
  student doc and lesson doc, confirmed the exact 3-hour Moscow-vs-Omsk
  offset in the stored instant, then confirmed the fix by re-stamping the
  slot and watching the trigger correctly recompute the date. **Any
  future trigger that diffs "before" vs "after" to decide whether to act
  should be audited for every field the downstream computation actually
  reads, not just the fields a human would call "the schedule."**

- **Cascade-delete now exists at every tenancy level (session 38) — before
  this session, `deleteTeacher` didn't exist at all, and `deleteStudent`
  itself was incomplete.** This is the direct fix for "deleting an
  account leaves its data behind," confirmed as a real, already-happened
  production problem (23 orphaned students plus their lessons/programs/
  balance ledger/gamification data/notifications/tokens from one deleted
  test teacher, found and cleaned this session — see `activeContext.md`).
  - `deleteStudent` (`functions/core/students.js`) used to delete only the
    `lessons` subcollection + registration tokens + bot sessions + Storage
    files + Calendar events, then the student doc — leaving `programs`,
    `balanceLedger`, `inventory`, `decoration`, `coinLedger` permanently
    orphaned under a doc path that no longer resolves (Firestore doesn't
    cascade-delete subcollections when a parent doc is deleted; a
    `collectionGroup` query can still find them forever). Now also deletes
    those 5 subcollections (`db.recursiveDelete()` per subcollection — no
    Storage/Calendar side effects to special-case, unlike `lessons`),
    every `notifications/` doc keyed by that `studentId`, and removes the
    student from any group's `memberStudentIds` (otherwise a deleted
    student left in a group would get silently "recreated" —
    `ensureUpcomingGroupLessons` would happily write a fresh
    `students/{deletedId}/lessons/{id}` under a nonexistent parent on the
    next occurrence).
  - `deleteStudentLessons` gained a `keepGroupLessons` option (default
    `true`): a group-lesson mirror doc (`isGroupLesson: true`) is left
    untouched when one student alone is deleted — deleting one member's
    copy of a shared occurrence would desync it from the rest of the group
    for no reason, per explicit product decision (a group's mirrors are
    only ever meant to be deleted together, via `deleteGroup`). A full
    teacher-account cascade passes `keepGroupLessons: false` since by that
    point every group the teacher owns is already being deleted anyway —
    this is just a safety net there, not the primary mechanism.
  - New `functions/core/teacherDeletion.js`'s `deleteTeacherData(teacherId,
    {deleteAuthUser})` is the one real cascade for "this teacher account is
    gone": every group (via the existing `deleteGroup`, which already
    cascades lesson mirrors/Calendar events/program unlink-or-delete),
    every student (via `deleteStudent`, `keepGroupLessons: false`),
    `curriculumTemplates`/`registrationTokens`/`teacherConnectTokens`/
    `notifications`/`oauthStates` filtered by `teacherId`, then
    `db.recursiveDelete(teachers/{teacherId})` (picks up anything left
    under the doc — `integrations`, `examTypes`, `customSubjects`,
    `subscriptionPayments`, any group that failed above), then optionally
    `getAuth().deleteUser(teacherId)`. Reused by two callers: the new
    admin-only `deleteTeacherAccount` callable (`deleteAuthUser: true` —
    exposed as a type-to-confirm "Удалить учителя" button in
    `AdminDashboard.jsx`'s per-teacher "Опасная зона" section) and the
    one-off orphan-cleanup pass below (`deleteAuthUser: false`). **This is
    the only correct way to remove a teacher going forward** — deleting
    just the Firebase Auth account by hand (Console or otherwise) does NOT
    cascade and reproduces the exact orphaned-data problem this session
    fixed.
  - **"Orphan" detection needs Firestore ∩ Auth, not either alone** — a
    `teachers/{uid}` Firestore doc can outlive its own Firebase Auth
    account (that's exactly how the pre-existing orphaned data was
    created: the Auth account was deleted with no cascade, but nothing
    ever touched the Firestore doc or its descendants). The one-off
    cleanup script (temporary guarded `onRequest`, same "deploy, curl,
    delete" pattern as `migrateToPrograms`/`isSlotEqual` diagnostics —
    already removed from the codebase after use) computed `validTeacherIds
    = firestoreTeacherIds ∩ authUids`, then scanned every top-level
    teacherId-bearing collection plus every `teachers/{id}/<name>`
    subcollection via `collectionGroup` (reaches orphaned subcollections
    even when the parent doc is long gone) for any teacherId not in that
    valid set — a `mode=report` (read-only) pass was reviewed before a
    separate `mode=execute` pass, which just called `deleteTeacherData`
    per orphan teacherId found, reusing the exact same cascade rather than
    a parallel one-off deletion routine. **Any future "clean up orphaned
    tenant data" pass should follow this same shape**: define validity as
    an intersection of two independent sources of truth, dry-run first,
    execute by calling the real production cascade function, never a
    bespoke delete-everything-that-matches script.
