# Active Context

_Last updated: 2026-08-01 (session 9, teacher-panel modal-freeze root-cause
fix + student page "redesign v3" migration)_

## Current work focus

**Nothing from session 9 is committed.** `git log` still shows `e01c493`
("редизайн учителя без фикса багов") as the tip — the entire session below
(teacher freeze fix, curriculum checkboxes, student v3 migration, login
screen) is uncommitted working-tree changes only. Hosting was deployed
(`firebase deploy --only hosting`, build verified clean first) at the end
of the session; no Cloud Functions changed at all this session (confirmed
via `git diff --stat -- functions/` against the last commit — empty), so no
functions deploy was needed. **Next session: commit this, or confirm
whether the user intends to keep working uncommitted for a while longer.**

### Session 9 — teacher-panel modal freeze (real root cause, not the first three guesses), then student page "redesign v3" migration

**Part A — the teacher dashboard's modals (homework dialog, reschedule,
cancel, curriculum editor, notifications) were completely broken**: opened
with no visible content and no backdrop dimming, page felt "frozen" until
clicking elsewhere. No browser/DevTools tool exists in this environment, so
every round of diagnosis depended on the user manually running the
DevTools steps and pasting back the literal output — **three plausible-
sounding hypotheses from the user turned out wrong before the real causes
surfaced**, worth remembering as a pattern: don't apply speculative CSS/JS
fixes (`onOpenAutoFocus` overrides, fabricated `[data-open]` CSS rules,
`document.body.classList` theme hacks) just because they sound plausible —
verify each one against the actual library source / actual DOM before
touching code. The three real, confirmed causes, in the order they were
found:

1. **React duplicate-key collision breaking sibling dialog reconciliation.**
   Console showed `"Encountered two children with the same key, `closed`"`.
   Root cause: `UpcomingLessonCard` (`TeacherDashboard.jsx`) rendered
   `RescheduleDialog` and `CancelLessonDialog` as JSX siblings, each keyed
   `key={open ? "open" : "closed"}` — when both are closed (the default,
   true whenever *any* dialog in that row is interacted with), both
   resolve to the literal key `"closed"`. Duplicate keys among siblings
   break React's keyed reconciliation for the whole children array,
   corrupting the Portal-based dialog lifecycle for the group. Fixed by
   suffixing each dialog's key (`"open-reschedule"`/`"closed-reschedule"`,
   `"open-cancel"`/`"closed-cancel"`) — `StudentDashboard.jsx`'s equivalent
   pair already had this right (`"open-cancel"`/`"closed-cancel"`), only
   the teacher-side rewrite missed it. **If a future session sees dialogs
   keyed by open/closed state as siblings, always suffix with something
   identifying which dialog, never just `"open"`/`"closed"`.**
2. **`.teacher-theme` declared outside any `@layer`, so it silently beat
   every Tailwind utility regardless of source order.** Fixing #1 didn't
   fully fix the freeze — modals still rendered with no glass fill and no
   backdrop dimming. Root cause, confirmed by reading raw Computed-panel
   values the user pasted (backdrop `background-color` was literally
   `--background`'s value, not `--glass`'s): **CSS rules outside any
   `@layer` always out-prioritize every layered rule, regardless of layer
   order or source position** — a real, easy-to-forget CSS-cascade
   fact. Tailwind v4's `@utility` directive (used for `glass-panel`,
   `glass-tile`, and every core Tailwind class like `bg-ink/25`) puts its
   output inside `@layer utilities`; `.teacher-theme` in `index.css` was a
   plain, unlayered rule declaring its own `background`/`color` — so on any
   element carrying both `teacher-theme` and a utility touching
   `background`/`color` (exactly the pattern used on the portaled
   Backdrop/Popup, which need the `teacher-theme` class directly to resolve
   CSS variables since Portal content escapes the DOM tree), the unlayered
   `.teacher-theme` rule always won. Fixed by wrapping `.teacher-theme` in
   `@layer base` — same layer Tailwind's own base styles use, so utilities
   correctly out-prioritize it. **Any future `.teacher-theme`-style
   "apply a class directly to portaled elements to get CSS vars" pattern
   must live inside `@layer base` (or any named layer), never bare.**
3. **A `position:relative`/`z-index:auto` element's own background paints
   *after* its own negative-`z-index` descendants — so painting the page
   background on `.teacher-theme` dimmed the decorative blob layer sitting
   "beneath" it instead of showing it.** Once #1 and #2 were fixed, the
   modals worked but the user asked for a byte-for-byte background-gradient
   match against the "redesign teacher v1" mockup; a literal token diff
   found the gradient was on `.teacher-theme`, not real `<body>`. Moving it
   to `.teacher-theme` (the position:relative wrapper *and* direct parent
   of the `position:fixed, z-index:-10` blob layer) made the gradient paint
   over the blobs per CSS Appendix E's stacking order (positioned,
   z-index:auto content paints at "stack level 0", *after* negative-z
   descendants of the same context resolve). Fixed by moving the gradient
   to `body:has(.teacher-theme)` instead — matches the mockup's own
   mechanism exactly (gradient lives on real `<body>`, an ancestor outside
   the position:relative wrapper, never competing with the fixed blob layer
   for paint order) and doesn't touch the student page's shared `body {
   bg-background }` rule. **Lesson for any future "put a background behind
   a position:fixed decorative layer" task: the background must live on an
   ancestor that is NOT the fixed layer's own positioned parent, or it will
   paint over the decoration instead of under it.**

A later request asked to also make the teacher panel's decorative blobs
larger on tablet/desktop (`@media (min-width: 768px)` bumping `blob-a`/
`blob-b` from 62vw/56vw to 100vw/90vw) — **this was reverted in the same
session** (user's own mistake, meant it for the student page). `blob-a`/
`blob-b` are back to their original single fixed size (62vw/56vw, no media
query) — don't reapply this without a fresh explicit request.

**Part B — feature work done alongside the freeze fix, teacher side:**

- **`CoveredMaterialChecklist`** (`homework-lesson-dialog.jsx`, completing
  mode) — replaced the old multi-row `<select>` "Пройденный материал"
  picker (from session 7) with actual checkboxes: only `covered:false`
  items listed, multi-select, "Все темы/прототипы пройдены ✓" fallback,
  prototypes block hidden entirely when the student has none. Wiring into
  `markTopicsCovered`/`completeLesson` on save is unchanged. **Re-verified
  later in the same session (user suspected it wasn't actually done) — it
  was; read the literal code both times, no drift.**
- **`StudentRow`'s curriculum tiles are now directly click-to-toggle**
  (`setCurriculumItemCovered`) — removed the separate `CurriculumToggleModal`
  and "Редактировать" indirection entirely; each topic/prototype row is now
  its own button with a per-row spinner and `line-through` once covered.
- **Reschedule old→new time comparison** — `line-through` old time → arrow →
  bold new time, added to `UpcomingLessonCard` (teacher) and both
  `pending_student`/`pending_teacher` banners on the student page.
- **Confirm/reject buttons duplicated into the student's own notification
  panel** for `reschedule_proposed`/`cancellation_proposed` types
  (`notifications-list.jsx`'s new `ProposalActions`, gated by an
  `enableProposalActions` prop only `StudentDashboard.jsx`'s
  `AllNotificationsDialog` passes — teacher's bell untouched). Bot/site
  desync is handled by just letting the existing backend
  `failed-precondition` check (already present in `confirmReschedule`/
  `confirmCancellation`) fail and catching that as "already handled" —
  no separate live-status pre-check needed.
- **`StudentDot`** (`theme-ui.jsx`) replaces the old initials-circle
  `Avatar` everywhere a student row showed one (4 call sites) — `Avatar`
  itself deleted, zero remaining callers.
- Audited every large teacher panel block (Расписание/Ближайшие уроки/
  Ученики/Учебные планы/Прошедшие уроки/Финансы/Ожидают регистрации) for
  glass-panel consistency — **all of them already used it**, nothing to
  fix. Worth remembering: not every "check X" task has a bug to find.

**Part C — student page "redesign student v3" migration**
(`redesign student v3/luminous-learn-dashboard-main/`, a new mockup source
folder distinct from session 7's "redesign v2"):

- **Root tokens flipped to match v3**: `--background`
  (`oklch(0.69...)` → `oklch(0.955...)`, near-white), `--card`/
  `--secondary`/`--muted`/`--border`/`--input` all went from solid to
  translucent (`oklch(1 0 0 / N%)`) — reversing an earlier session's
  deliberate "keep opaque" decision, now safe because the teacher panel has
  its own `.teacher-theme` scope and doesn't read these root tokens at all
  (confirmed via `git diff` before touching anything — `.teacher-theme`'s
  own `--card`/etc. were untouched, always translucent on its own terms).
  Added `--status-good/warn/bad` (for `ExamRadar`) and a **new
  `--card-opaque` token** (`oklch(0.99 0.005 70)`, the old solid `--card`
  value) for the handful of screens that render straight on root tokens
  with no decorative backdrop of their own.
- **`--card-opaque` point-fix, 4 screens**: `LoginScreen`, `PublicLanding`,
  `TeacherLogin`, and `SelfServiceSignup` (found via a full-repo `bg-card`
  grep after fixing the first three — same unwrapped-`<main
  className="bg-background">` pattern in all four) swapped `bg-card` →
  `bg-[var(--card-opaque)]` rather than reverting the token migration
  globally. **This was later itself point-fixed again**: once
  `StudentGrainBackground` was added to `LoginScreen` too (see below), the
  original reason for `--card-opaque` (no decorative backdrop) stopped
  applying to that one screen, and the user asked to switch it back to the
  mockup's real translucent `glass` class — `PublicLanding`/`TeacherLogin`/
  `SelfServiceSignup` still use `--card-opaque` (they have no
  `StudentGrainBackground` of their own).
- **New `src/components/student-grain-background.jsx`** (`StudentGrainBackground`)
  — white base + two blurred orange radial-gradient circles + SVG grain
  texture (new `@utility grain` in `index.css`, distinct from the teacher's
  own `grain-layer`), replacing the old `bg-glass.jpg` photo + `bg-white/22
  backdrop-blur-2xl` overlay mechanism on `StudentDashboard.jsx`'s
  `StudentGate`. Also added to `LoginScreen` (was previously a flat
  `bg-background` page with no decorative layer at all).
- **New `src/components/student/exam-radar.jsx`** (`ExamRadar`) — static,
  mock-data-only port of v3's radar card (days-to-exam, target score,
  topics-done progress bar, pace-now-vs-needed comparison, colored status
  plate, "на этой неделе" plan list). Deliberately no real logic wired up
  (no `examDate`/`targetScore` Firestore fields exist yet) — hardcoded to
  the mockup's own "good" example data, inserted between
  `StudentNotifications` and `CurriculumProgressCard`.
- **`CurriculumItemGroups` (`StudentDashboard.jsx`) redesigned to match
  v3's `Column`/`TopicList`** — this was *missed* on the first migration
  pass and caught by the user on a follow-up ("проверь ещё раз, ты мог
  пропустить"): the real mockup layout stacks "Пройдено"/"Осталось"
  vertically (divider between) with a header icon+count row, not the
  side-by-side two-column grid the first pass shipped. Stayed read-only
  (no click-to-toggle) — matches both the mockup itself (plain `<li>`, no
  onClick) and the existing architecture (students have no write path to
  their own `curriculumProgress`; that's teacher-only via
  `setCurriculumItemCovered`/`markTopicsCovered`). **If a future request
  asks for student-side click-to-toggle here, that's a genuine
  product/permissions decision, not a visual port — flag it, don't
  silently add write access.**
- **`lesson-history.jsx` tags redesigned** — new local 3-tone `Badge`
  (`neutral`/`warm`/`muted`, glass-based) replacing `StatusBadge`'s 5-color
  pastel palette, **deliberately not shared with `StatusBadge`** — that
  component's multi-hue signal is a working tool for the teacher scanning
  many students, not appropriate to collapse for a student's own read-only
  history. Two components, two different jobs, correctly not unified.
- **Video-call button restyled + repositioned** to match v3's "Видеовстреча"
  card (label + subtitle + gradient-warm `Video`-icon button), moved from
  among the reschedule/cancel buttons to right before "Задание" —
  `videoCallUrl` conditional logic unchanged.
- **Decorative circle next to "Следующий урок"'s date removed** — the user
  asked for this regardless of whether v3 still drew it (it does; the
  removal was an explicit deviation from the mockup, called out and
  confirmed, not something silently invented).
- **Login screen (`LoginScreen`/`PinInput`) migration took two follow-up
  rounds** — first pass under-transferred it (kept the old plain `bg-card`
  page, no `StudentGrainBackground`, heading missing the `font-display`
  class every other heading in this codebase carries explicitly since
  there's no global `h1,h2,h3{font-family:var(--font-display)}` base rule
  here unlike the mockup, and an old `shadow-xl` instead of the
  `--shadow-glass` token). Second pass added all three plus removed the
  `placeholder="•"` gray dots from empty PIN cells and switched from
  `--card-opaque` to the real translucent `glass` class now that
  `StudentGrainBackground` sits behind it (see above). Digit cells
  (`autoFocus` on the first one, `glass-inset` styling) and the shorter
  card height (icon removed) were correct from the very first pass and
  never touched again. **Same missing-`font-display` bug found and fixed
  in `ExamRadar`'s own `<h3>` while investigating this** — worth grepping
  for `<h1`/`<h2`/`<h3` without `font-display` if more v3 components get
  ported later.

Deployed at the end via `firebase deploy --only hosting` only (confirmed no
`functions/` files changed all session). Nothing committed.

### Session 8 — student-page glass-dialog consistency + a real bug investigation

Continuation of session 7's "redesign v2" glass migration on the student
page (see that section below for the full migration). This session:

1. **Extracted `src/components/glass-dialog.jsx`** (`GlassDialog`/
   `GlassDialogContent`/`GlassDialogTitle`/`GlassDialogDescription`) — the
   shared "grey-glass" modal look (`rounded-4xl border-white/50
   bg-white/50 backdrop-blur-2xl shadow-[var(--shadow-glass)]`) that had
   been hand-copied into `CancelLessonDialog`, `RescheduleDialog`, "Все
   уведомления", and "Все материалы". All four now go through the shared
   wrapper. `NotificationsList` (`src/components/notifications-list.jsx`,
   shared with the teacher's own Sheet-based notification panel) gained
   an opt-in `glass` boolean prop for row styling, defaulting `false` —
   only the student-side dialog passes `glass`, so the teacher's panel
   keeps its original solid-card look untouched.
2. **Page background** (`StudentGate`'s `<main>`) got a
   `bg-white/22 backdrop-blur-2xl` full-viewport overlay between the
   existing `bg-glass.jpg` photo and the content — same translucency+blur
   mechanism as the dialogs, but deliberately *lower* opacity than the
   card surfaces (`glass`/`glass-soft`/`glass-inset` in `index.css`,
   currently 30/43/28%) so cards still read as the foreground layer
   rather than blending into an equally-opaque page. Matching the
   dialog's 50% literally would have inverted that hierarchy — a
   judgment call, not a literal token copy.
3. **Hid the native scrollbar** on "Все уведомления"'s scroll container —
   new `scrollbar-hidden` `@utility` in `index.css`
   (`scrollbar-width: none` + `::-webkit-scrollbar { display: none }`),
   touch/wheel scrolling unaffected.
4. **Investigated a real reported bug**: student PIN session appeared
   "lost" (back button didn't restore the dashboard) after typing `/app`
   manually in the address bar, then clicking "через Telegram" on
   `PublicLanding`. **Two rounds** — the first diagnosis was wrong and
   the user caught it: initially assumed Telegram Mini App's isolated
   WebView storage (a real, documented phenomenon — see `AppEntry.jsx`'s
   own comments), but the user clarified the repro was actually on
   **desktop**, in a **plain browser**, never inside Telegram at all,
   which invalidates that explanation outright. Lesson: don't commit to
   a plausible root cause before pinning down the *exact* repro steps —
   ask first. Round 2, code-only (no browser automation tool exists in
   this environment, so nothing here was independently observed running):
   grepped all of `src/` for every `localStorage` write and every
   `navigate()`/`replace()` call. Both of the user's own specific
   hypotheses came back concretely negative for this exact scenario — the
   only two `localStorage` writers are correctly keyed `auth_${studentId}`
   (never a shared key), and the only two `navigate()` calls in the whole
   app don't execute on this path at all (`telegramUserId` is `null`
   throughout a plain-browser visit, so `AppEntry`'s own redirect branch
   is dead code here). Landed on the last remaining explanation —
   `PublicLanding`'s buttons called `window.open(url, "_blank",
   "noopener,noreferrer")` (via `src/lib/telegramWebApp.js`'s
   `openExternalLink`) from a `Button onClick`, and scripted
   `window.open()` for a URL with OS-level protocol/app handoff (`t.me`)
   is known to behave unpredictably across browsers — but this was never
   independently confirmed, only inferred as the last standing
   possibility once the code-checkable hypotheses were ruled out.
   **Fix**: replaced both buttons' `window.open()` handlers with a real
   `<a>` via base-ui's `render` prop —
   `<Button render={<a href={url} target="_blank" rel="noopener
   noreferrer" />}>` — keeps the exact same visual styling while
   rendering a genuine anchor. Confirmed this polymorphic `render` prop
   is real by reading `node_modules/@base-ui/react`'s own type
   declarations before using it (`BaseUIComponentProps` exposes
   `render?: React.ReactElement | ComponentRenderFn<...>`) — **first use
   of this pattern anywhere in the codebase**; it's the correct way to
   make a shadcn `Button` render as something else when needed, instead
   of hand-duplicating its class list on a raw element (which is what
   every earlier "convert to a real button" pass in this project did
   before this was known). Also added a reassurance line under
   `PublicLanding`'s buttons regardless of root cause: "Если ты уже
   заходил(а) в личный кабинет — просто закрой эту вкладку и вернись в
   свой браузер, ссылка на кабинет останется рабочей."
   **Not yet confirmed fixed** — the user was about to test when this
   session may have ended abruptly. If they report back, this is the
   first thing to check next session.

All changes deployed via `firebase deploy --only hosting` (no functions
touched this session), each build verified clean before deploying.

### Session 7 (complete) — учебные планы (curriculum templates) feature, 4 phases

A new multi-phase feature, specified by the user up front as four separate
phases, each with its own deploy + manual verification checklist + a
`/workflow:update-memory` call at the end of that phase. **All 4 phases
are done as of this update** — the feature (templates, assignment, marking
covered during lesson completion, and progress display) is fully
implemented and deployed. See the loose-ends section below for what's
still unverified.

**Project-wide decision covering all 4 phases**: the repo has **no
`firestore.rules` file** (confirmed again this session — `firebase.json`
only declares `firestore.indexes.json`, no rules path at all) — this was
already known from session 2's Storage-rules caveat, now reconfirmed for
Firestore specifically. The spec for this feature assumed rules could be
"added by analogy" and deployed via `firestore:rules`; the user
explicitly overrode this: **no firestore.rules file will be created, no
deploy command in any of the 4 phases should include `firestore:rules`**,
and the user will configure Console rules for `curriculumTemplates` (Phase
1) and `students/{id}/curriculumProgress` (Phase 2) manually themselves,
outside this checkout. **If a future session is tempted to "finally" add a
firestore.rules file while continuing this feature, don't — that decision
was deliberate and explicit, not a stopgap.**

**Phase 1 — curriculum template CRUD (admin content, no student linkage
yet), DONE:**

- New collection `curriculumTemplates/{templateId}`: `name`, `examTarget`
  (`"ege"|"oge"|"school"`), `topics: Array<{id, title}>`,
  `prototypes: Array<{id, title}>`, `createdAt`/`updatedAt`.
- New `src/firebase/curriculum.js` — plain client Firestore CRUD
  (`addDoc`/`updateDoc`/`deleteDoc`/`getDocs`), **no Cloud Functions
  involved at all** — same "admin content, teacher-only, direct write"
  shape as `updateStudentSchedule` (see [[systemPatterns]]'s existing note
  on when something needs a callable vs. a plain write: only when
  server-side notification/validation is needed, and this has neither).
- New `src/components/teacher/curriculum-section.jsx` — "Учебные планы"
  section (same page-section shape as "Финансы": `<h2>` + content),
  wired into `TeacherDashboard.jsx` right after `FinanceSection`, before
  `PendingRegistrations`. Compact row list (name, `examTarget` tag reusing
  `student-tags.jsx`'s `TAG_STYLES` map directly — `ege`/`oge`/`school`
  already existed there since those are also exam-target values on
  students), topic/prototype counts, edit/delete buttons, "+ Создать
  план" button opening a `CurriculumEditorDialog` (name input + type
  select + two `RowList` sections for topics/prototypes — same
  row-with-delete-button + "+ Добавить" pattern already used for
  `scheduleSlots` in `student-card.jsx`). Save filters out empty-title
  rows before writing.
- **Deliberately not realtime**: list state is a local `getDocs` fetch,
  re-run after every create/update/delete, not an `onSnapshot`
  subscription — this is single-teacher admin content edited by the one
  person who'll ever see the list, so the realtime-by-default convention
  used elsewhere in this project (session 2's decision, ledger/lesson
  history) wasn't judged worth the extra listener here.
- Deployed via `firebase deploy --only hosting` only (no functions
  touched this phase). Build passes. **Not yet manually verified
  end-to-end** (create/edit/delete a template with real topics/
  prototypes) — same caveat as every other feature in this project.

**Phase 2 — assign a template to a student, copying it into personal
progress, DONE:**

- `students/{id}` gained `curriculumSourceTemplateId: string | null`
  (reference only — which template the current progress was copied
  from). New singleton subcollection doc
  `students/{id}/curriculumProgress/main` (not a set of per-topic docs) —
  `topics`/`prototypes` arrays copied from the template with `covered:
  false, coveredAt: null` added per item, plus `assignedAt`.
- New `functions/core/curriculum.js` — `assignCurriculumTemplate(studentId,
  templateId)`: reads the template, **fully overwrites**
  `curriculumProgress/main` (deliberate replace, never a merge — matches
  the spec's explicit "осознанная замена, не слияние"), writes
  `curriculumSourceTemplateId` onto the student doc. No Firestore
  transaction needed (unlike `finance.js`'s balance functions) since
  there's no counter arithmetic to race against, just a full
  read-then-overwrite. Exported as callable `assignCurriculumTemplate` in
  `index.js`, teacher-auth-gated, no secrets declared (doesn't touch
  bots/notifications, so the missing-secrets class of bug from session 5
  doesn't apply here).
- `src/components/teacher/student-profile-section.jsx` gained a
  `CurriculumAssignmentBlock` (defined in the same file, not a new one) in
  the profile edit form: templates are fetched fresh via one-time
  `getCurriculumTemplates()` inside `handleEnterEdit` (same place the
  existing subject/examTarget/etc. local state gets seeded), filtered to
  the student's `examTarget` when set. Shows "Назначена программа:
  {name}" once assigned, with a "Заменить" button gated behind a
  `confirm()` warning about progress being reset before it reopens the
  picker.
- Deployed via `firebase deploy --only functions:assignCurriculumTemplate,hosting`
  — confirmed "Successful create operation", no CPU-quota retry needed
  this time. **Not yet manually verified end-to-end** (assign a template,
  check `curriculumProgress/main` in Firestore has the right copy with
  `covered: false`, confirm the UI shows the assigned name, replace and
  confirm the reset).

**Phase 3 — mark topics/prototypes covered during lesson completion,
DONE:**

- New `markTopicsCovered(studentId, lessonId, {topicIds, prototypeIds})`
  in `functions/core/curriculum.js` — a Firestore transaction over
  `curriculumProgress/main` that flips `covered: true` +
  `coveredAt: Timestamp.now()` on the matching topics/prototypes, and
  mirrors the full `{id, title}` objects onto the lesson doc itself as
  `coveredTopics`/`coveredPrototypes` (for lesson-history display, no
  re-lookup needed later). **Reused `Timestamp.now()` instead of
  `FieldValue.serverTimestamp()`** for `coveredAt` — this project already
  established (via `recordHomeworkSubmission`'s
  `homework.submission.files` arrayUnion entry, `core/lessons.js`) that a
  server-timestamp sentinel doesn't resolve correctly when nested inside
  an array element, only at the top level of a document; the same
  constraint applies here since `covered`/`coveredAt` live inside
  `topics[]`/`prototypes[]` elements. **Silent no-op if
  `curriculumProgress/main` doesn't exist** (no program assigned) — by
  spec, so completing a lesson never fails just because a student has no
  program. Exported as callable `markTopicsCovered`, teacher-auth-gated,
  no secrets needed.
- `HomeworkLessonDialog` gained a `CoveredMaterialPicker` (one local
  component, used twice — topics and prototypes): a multi-row `<select>`
  picker where each row's own options exclude both already-covered items
  and items picked by a *different* row in the same session (a row's own
  current pick stays visible in its own dropdown). Falls back to "Все
  темы/прототипы программы пройдены" once nothing's left to pick.
  `curriculumProgress` is fetched via one `getCurriculumProgress` call
  whenever the dialog opens (cheap, mode-independent), reset to `null` on
  close; the picker itself only renders inside `mode === "completing"`,
  gated on that fetch being non-null (hidden entirely for students with
  no program). `handleCompleteLesson` calls `completeLesson` first, then
  `markTopicsCovered` only if at least one id was actually picked — never
  called with two empty arrays. Completed lessons show a read-only
  "Пройдено (темы): ..."/"Пройдено (прототипы): ..." line straight off
  `lesson.coveredTopics`/`coveredPrototypes` — no re-fetch needed for that
  view.
- Deployed via `firebase deploy --only functions:markTopicsCovered,hosting`
  — "Successful create operation", no CPU-quota retry needed. **Not yet
  manually verified end-to-end** (assign a program, complete a lesson
  picking topics/prototypes, confirm `covered`/`coveredAt` and the lesson
  doc's `coveredTopics`/`coveredPrototypes`, reopen completed lesson to
  see the read-only text, confirm picked items don't reappear on the next
  lesson).

**Phase 4 — student list rows with progress bar + expandable detail,
DONE (closes out the feature):**

- `student-card.jsx` **deleted outright** — its only consumer (the
  student grid in `TeacherDashboard.jsx`) is gone. Its schedule-editing
  logic and `DeleteStudentDialog` were moved (copied, not re-imported) into
  a new `src/components/teacher/student-row.jsx`, now scoped as
  sub-components of one row instead of a standalone card.
  `TeacherDashboard.jsx`'s "Зарегистрированные ученики" grid
  (`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`) is now a `<ul>` of
  `<StudentRow>` inside one bordered card, rows separated by `border-b`
  (matches the Финансы table's row convention).
- Collapsed row: avatar link / name / tags / progress bar (or "Программа
  не назначена" if unassigned) / three action buttons (Подготовить урок,
  `ContactButton`, delete) / chevron. The whole row is a keyboard-
  accessible clickable div toggling local `expanded` state; every
  actionable element inside stops propagation so clicking a button
  doesn't also toggle the row. Expanded state renders inline (**plain
  conditional render, not an animated height transition** — no
  `Collapsible` component exists anywhere in this repo, confirmed by
  search before implementing) with a left-border + tinted background
  reading as nested content: the moved schedule block, the unchanged
  `StudentProfileSection` (already had Phase 2's assignment block), and a
  new two-column (Темы/Прототипы) `CurriculumProgressDetail` checklist.
- **Key reconciliation of a real tension in the spec**: it said "don't
  subscribe to everyone's progress at once, only the expanded row" but
  the verification checklist requires every *collapsed* row to already
  show a correct percentage. Resolved as two separate mechanisms: (1) one
  **one-time** `collectionGroup` scan across every student's
  `curriculumProgress` at once — new `getAllCurriculumProgressByStudent()`
  in `src/firebase/curriculum.js`, called once in `TeacherDashboard.jsx`
  whenever `students.length` changes, populating a
  `{studentId: {topics, prototypes}}` map passed down as each row's
  `progressSummary` — a single bounded read, not a listener, satisfies
  "don't hold N listeners open" while still covering every row; (2) a
  **live** `onSnapshot` via `subscribeToCurriculumProgress(studentId,
  ...)`, opened only while that row is expanded (torn down on collapse)
  — the actual per-student *subscription* the spec meant. **Known gap**:
  the batch summary isn't re-fetched when a template is newly assigned
  while the list is already loaded — that student's collapsed-row percent
  stays stale until the next full reload/student-count change; only the
  currently-expanded row's live view reflects an assignment made in the
  same session immediately.
- New `setCurriculumItemCovered(studentId, kind, itemId, covered)` in
  `src/firebase/curriculum.js` — the spec's own "manual correction"
  option: Firestore doesn't support indexing into an array by element id
  via a dot-path in `updateDoc`, so this reads the whole topics/prototypes
  array via `getDoc`, maps in the toggle (`covered` +
  `coveredAt: Timestamp.now()`, same array-nested-timestamp constraint as
  Phase 3), writes the whole array back. UI labels this explicitly
  ("Ручная корректировка — обычно отмечается через завершение урока") so
  it doesn't read as the normal lesson-completion flow.
- Deployed via `firebase deploy --only hosting` (no backend changes this
  phase). **Not yet manually verified** (bars render with correct %,
  expand/collapse, nested blocks all functional, buttons don't trigger
  row toggle, manual checkbox toggle actually updates Firestore) — same
  caveat as everything else, now compounded across all 4 phases.

**Addendum — StudentDashboard.jsx progress display (unplanned 5th piece,
DONE):** none of the 4 phases above ever touched `StudentDashboard.jsx` —
a genuine gap, not a bug, since no phase's prompt asked for it. User
caught this and asked for a read-only "Прогресс подготовки" block on the
student side. New `CurriculumProgressCard`, defined inline inside
`src/pages/StudentDashboard.jsx` (matches this file's existing convention
of defining page-specific sub-components like `NextLessonPlate`/
`StudentNotifications` inline rather than extracting separate files) —
subscribes via the same `subscribeToCurriculumProgress(studentId, ...)`
Phase 4's expanded teacher row already uses, renders nothing at all if no
`curriculumProgress` doc exists (no "0%" flash for unprogrammed
students). Shows topics percent as a large number + "Тем пройдено: N из
M" + a thin primary-colored progress bar (same visual language as Phase
4's teacher-side bars, not a new pattern); an identical prototypes block
only renders when `prototypes.length > 0`. Placed directly after
`NextLessonPlate`, before `StudentNotifications` — no Bolt-migration
placeholder existed for this in the layout (checked, none did), so this
was the most natural "right after the next lesson" slot. Deployed via
`firebase deploy --only hosting` only, no backend changes (pure display
of data Phase 3 already writes). **Not yet manually verified** against a
real student with covered topics (should match the teacher's expanded-row
view by construction, same data source — not human-confirmed).

This closes the loop on the feature end-to-end: teacher-facing (templates,
assignment, marking covered, progress display) and student-facing
(read-only progress display) surfaces both exist now.

**Addendum 2 — needsReview flag + richer student progress display,
DONE:** `markTopicsCovered` (`functions/core/curriculum.js`) gained a
`rating` param (the same rating already collected in
`HomeworkLessonDialog`'s completing-mode form, just threaded through
`index.js` and the client wrapper) — every topic/prototype marked covered
in that call now also gets `needsReview: rating === "needs_work"`, tying
"needs review" to the actual lesson rating rather than separate teacher
input. `StudentDashboard.jsx`'s `CurriculumProgressCard` gained a
collapse/expand toggle (plain conditional render, same pattern as the
teacher's expandable student rows — no new visual pattern introduced).
Collapsed view adds: a "К повторению: ..." amber line (only when any
covered item has `needsReview`, capped at 3 names + "и ещё N"), and a
"На этой неделе пройдено N тем" line computed client-side from `coveredAt`
within the last 7 days — **explicitly omitted entirely, never "0 тем",**
when nothing was covered that week (an explicit anti-demotivation
instruction). Expanded view replaces this with full Темы/Прототипы
sections, each split into a dated "Пройдено (N)" list (items with
`needsReview` show a "↻ повторить" marker) and a plain "Осталось пройти
(M)" title list; the prototypes section is omitted entirely when the
program has none.

**Deploy flake finding worth remembering** (also in [[techContext]]):
deploying multiple failed functions together as one retry batch made
zero progress across two attempts — switching to one
`firebase deploy --only functions:<name>` per function, ~45s apart,
succeeded on every single one immediately. The flake is concurrency-
triggered, not a truly exhausted quota — future sessions should retry
failed functions one at a time, not as a batch. This session's deploy
also incidentally redeployed 6 functions with no logic changes of their
own this session (`updateHomeworkAssignment`, `createExtraLesson`,
`completeLesson`, `cancelReschedule`, `confirmCancellation`,
`startGoogleOAuth`) purely because they were bundled into the original
`--only functions` (unscoped) command alongside `markTopicsCovered`.

**Not yet manually verified** (complete a lesson rated "старайся лучше" +
mark a topic → `needsReview: true` and it appears in "К повторению";
"отлично" rating → no `needsReview`; expand/collapse; "на этой неделе"
phrase disappears with no recent coverage).

**Addendum 3 — two UI fixes, DONE:**

1. **`HomeworkLessonDialog` overflow fix.** The dialog's `DialogContent`
   was restructured into a fixed header / scrollable middle / sticky
   footer (`flex flex-col`, outer `max-h-[90vh] sm:max-h-[85vh]
   overflow-hidden`, padding moved from the shared `DialogContent`
   default onto each of the three inner sections instead, via
   `className="...p-0..."` overriding the shared component's `p-6 sm:p-8`
   through `cn()`/tailwind-merge — only for this one dialog's usage, the
   shared `ui/dialog.jsx` component itself is untouched). The header
   (title/date) never scrolls; the middle (topic, assignment, response,
   Итоги-урока card, curriculum picker, materials) is
   `flex-1 min-h-0 overflow-y-auto`; the footer is `sticky bottom-0
   border-t bg-card` and holds a single merged primary action button
   (label/handler/disabled branch on `mode`) — replacing what used to be
   two separate buttons ("Урок прошёл" / "Сохранить и завершить урок") in
   different spots. Footer is hidden when `isCompleted` (nothing to act
   on) or while preparing/erroring. The secondary "Сохранить" button for
   editing topic/assignment text stays in the scrollable middle — it's a
   contextual save tied to the Задание block, not the dialog's primary
   CTA, and wasn't meant to be sticky.
2. **New reusable `src/components/truncated-list.jsx`** —
   `<TruncatedList items limit=3 renderItem emptyLabel />`: shows the
   first `limit` items, then a "Показать все (N)"/"Свернуть" text link
   (style borrowed from `materials-library.jsx`'s existing "Показать
   все") that expands **in place**, not via a Dialog like that component
   does — appropriate here since every usage already lives inside an
   already-expanded block. Wired into `StudentDashboard.jsx`'s
   `CurriculumItemGroups` (all 4 lists: covered/remaining topics,
   covered/remaining prototypes) and `student-row.jsx`'s
   `CurriculumChecklistColumn` (2 lists: topics, prototypes — **not** 4,
   see note below).
   - **Structural note worth remembering**: the teacher's `StudentRow`
     curriculum checklist and the student's own progress card are *not*
     structured the same way, despite looking similar. The student view
     has a real covered/remaining split (`CurriculumItemGroups`,
     4 lists). The teacher's `StudentRow` checklist
     (`CurriculumChecklistColumn`) is one unified list per topics/
     prototypes showing every item with a covered/uncovered checkbox
     icon — never split into two lists. This task's phrasing assumed 4
     parallel lists existed in both places; only `TruncatedList` was
     applied to whatever actually exists in each place, no split
     structure was invented in `StudentRow` (out of scope — "не трогай
     остальную логику").

Deployed via `firebase deploy --only hosting`, no backend changes, build
passes. **Not yet manually verified** (dialog scroll/sticky-footer
behavior at mobile vs. desktop widths; expand/collapse of the truncated
lists in both locations).

**Addendum 4 — единая точка входа `/app` (Telegram menu button + public QR
landing + self-service signup), DONE:**

New `src/pages/AppEntry.jsx` at route `/app` resolves three scenarios at
load time, in this order: (1) inside a Telegram Mini App
(`window.Telegram.WebApp.initDataUnsafe.user.id` present) with a linked
student found via new `findStudentIdByTelegramUserId` — redirects to
`/student/{id}?skipPin=true`; (2) inside Telegram with no linked student —
shows `SelfServiceSignup`; (3) no Telegram context at all (plain browser,
QR code) — shows new `src/pages/PublicLanding.jsx` (static pitch + two
signup buttons via `openExternalLink` to the Telegram `?start=signup` deep
link and the VK community, reusing `TELEGRAM_BOT_USERNAME`/`VK_GROUP`
already exported from `src/lib/registration-links.js`).

**skipPin, the security-sensitive part**: `StudentDashboard.jsx`'s
`StudentGate` reads `?skipPin=true` but never trusts it alone — it only
bypasses `LoginScreen` after independently confirming (via new
`getStudentTelegramChatId`) that `window.Telegram.WebApp`'s own
`initDataUnsafe.user.id` (read fresh client-side, never taken from the
URL) genuinely equals *this* student's stored `telegramChatId`. Any
mismatch, or no Telegram context at all (e.g. someone hand-typing
`?skipPin=true` in a plain browser), silently falls through to the normal
PIN screen — the param is simply ignored, not flagged as a failed
attempt.

**Self-service signup, backend**: `functions/core/registration.js` gained
`createSelfServiceToken()` (token doc with `studentName: null,
isSelfService: true`, no upfront name unlike the teacher-initiated flow).
`completeRegistration()` now notifies the teacher
(`createNotification({target: "teacher", ...})`, lazily-required
`core/notifier` — same circular-require pattern already used by
`core/lessons.js`/`core/finance.js`) whenever the completed token was
self-service. `adapters/telegram.js`'s `handleStart` special-cases the
literal `/start signup` deep link — mints a token via
`createSelfServiceToken()` then reuses the *exact same*
`awaiting_name`/`awaiting_pin` session machine as normal registration, no
duplicated logic (had to rename the local var from `token` to `rawArg`
throughout `handleStart` to keep "the raw /start argument, possibly the
literal string `signup`" unambiguous from "an actual token"). VK has no
Mini App / deep-link equivalent, so `adapters/vk.js` instead recognizes
the exact-match text `"регистрация"` (new `isSignupRequestText`,
deliberately exact-match not substring, unlike
`isRescheduleRequestText`) as its self-service trigger in
`handleMessageNew`'s no-session branch — same
`createSelfServiceToken()` + session-start underneath. **Note**: VK users
never see `SelfServiceSignup` at all — that screen only renders from
`/app`'s Telegram branch; VK's self-service entry is a pure backend text
trigger with no UI counterpart in this app.

**Deploy hit the CPU-quota flake again, badly** — the full
`firebase deploy --only functions,hosting` failed 13 functions at once
(none of which had their own logic changed this session; they were just
incidentally bundled in because they share modules like
`core/registration.js`/`adapters/telegram.js`/`adapters/vk.js` that did
change). All 13 were redeployed successfully one at a time
(`firebase deploy --only functions:<name>`, ~45s apart) — 100% success
rate solo, reconfirming [[techContext]]'s existing guidance that this
flake is concurrency-triggered, not a real quota shortfall. Hosting then
deployed cleanly on its own right after.

**Known minor cosmetic gap, left as-is (out of scope for this task)**:
`PendingRegistrations.jsx` shows a blank name for self-service tokens in
the teacher's pending list (the token doc's `studentName` stays `null`
forever — the chat-entered name only ever lands on the student doc at
completion, same pre-existing quirk teacher-initiated tokens already have
too, not something self-service made worse).

**Manual step still needed — NOT something Claude can do** (no Telegram
BotFather API tool exists in this environment, and the task's own "сделай
сам" instruction was addressed to the human owner): configure the bot's
Menu Button in BotFather → `/mybots` → bot → Bot Settings → Menu Button →
Configure Menu Button → URL `https://princessschool-e678c.web.app/app`,
label "Личный кабинет". Until this is done, the code is fully deployed and
live at that URL, but there is no Telegram-side entry point to it yet.

**Not yet manually verified**: any of the 4 verification steps from the
task (plain-browser landing page, end-to-end Telegram signup + teacher
notification, existing student's menu button skipping PIN, a
hand-typed `?skipPin=true` on someone else's student URL still requiring
the PIN in a plain browser).

**Feature-wide reminder, now resolved as of session 8**: this section
originally flagged an eighth consecutive session of uncommitted work —
**that streak ended in session 8**, when the user committed and pushed
everything through this feature and the redesign work in one commit
(`3e365a3`, see the top of this file). The project-wide no-firestore.rules-
file decision (see its own note above) still stands — Console rules for
`curriculumTemplates` and `students/{id}/curriculumProgress` still need
manual configuration by the user, not yet confirmed done.

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

- **Учебные планы feature (session 7) — all 4 phases done**, see their
  own sections above for full detail. Remaining follow-ups:
  - Manual Console Firestore rules for `curriculumTemplates` and
    `students/{id}/curriculumProgress` — not yet done as far as this
    session knows (project-wide decision: no local rules file for this
    feature, see above).
  - Collapsed-row progress percentages don't refresh live when a program
    is newly assigned elsewhere in the same session — only a full
    reload/student-count change re-runs the batch summary fetch.
  - None of the 4 phases has been manually verified end-to-end yet.
- **Nothing across all seven sessions is committed to git.** Still the
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

## New files this session (session 7, all 4 phases)

- `src/firebase/curriculum.js`
- `src/components/teacher/curriculum-section.jsx`
- `functions/core/curriculum.js` (Phase 2, extended Phase 3)
- `src/components/teacher/student-row.jsx` (Phase 4, replaces student-card.jsx)
- `src/pages/AppEntry.jsx`, `src/pages/PublicLanding.jsx`,
  `src/components/self-service-signup.jsx` (Addendum 4, `/app` entry point)
- `src/components/truncated-list.jsx` (Addendum 3)

## Files removed this session (session 7, Phase 4)

- `src/components/teacher/student-card.jsx` — fully replaced by
  `student-row.jsx`; nothing else referenced it.

## Recent commit history (git — does not yet reflect any of the seven sessions' work)

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
