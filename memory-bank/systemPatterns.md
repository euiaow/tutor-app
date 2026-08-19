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
  object to expose it.
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
  render behind the outer Dialog's Popup.
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
  practice.
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
