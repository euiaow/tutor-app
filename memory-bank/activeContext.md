# Active Context

_Last updated: 2026-08-18 (session 12)_

## Current work focus

**Still nothing committed to git.** Same standing fact as every prior
session — 67 files uncommitted after this session's work, all deployed
straight from source via `firebase deploy`. This is now a very large pile
(all of multi-tenancy Phase 4a + the full timezone rewrite below); worth
raising with the user again next session.

Session 11's full narrative moved to `changelog/2026-08-august.md` this
session — this file now keeps only session 12 inline.

### Session 12 — multi-tenancy Phase 4a (settings/timezone/theme), second-teacher login bug, full timezone-handling rewrite, Firestore Rules published (tenant-isolation fallout)

The session opened with a post-crash diagnosis (computer crashed mid-Phase-3
last session) — confirmed Phases 1–3 of multi-tenancy (teacher slugs,
`/app/:slug`, per-teacher bot signup, `teacherConnectTokens`) were intact
and undamaged, then moved on to new work.

**1. Multi-tenancy Phase 4a — per-user settings (timezone + color theme).**
New `SettingsDialog` component (`src/components/settings-dialog.jsx`,
`variant="teacher"|"student"`) — gear icon in both dashboard headers opens
it. Teacher settings write directly to `teachers/{uid}` (`updateDoc`, same
teacher-owns-their-own-doc trust as the rest of the app); student settings
go through a new `updateStudentSettings` callable (no `request.auth`,
same trust model as every other student-facing callable — see
`functions/core/students.js`). New shared context
(`src/lib/user-prefs-context.jsx`, `UserPrefsProvider`/`useTimeZone`/
`useThemeClass`) threads the resolved timezone/theme class down through
both dashboards without prop-drilling. Color theme: teacher can pick
"pink" (`.teacher-theme`, original) or "amber" — a new `.amber-scope` CSS
block in `index.css` mirroring `.teacher-theme`'s exact variable shape but
with the student page's amber hues (values lifted from the existing
`:root` tokens, not new colors); student can do the reverse. Portaled
dialogs (`theme-ui.jsx`'s `TeacherDialogContent`/`TeacherPopoverContent`,
`ui/dialog.jsx`'s `DialogContent`) all read the resolved theme class via
`useThemeClass()` instead of hardcoding `"teacher-theme"`, since Base UI's
`Portal` moves them outside the themed DOM subtree.

**2. Second-teacher login bug — real, not cosmetic.** `TeacherLogin.jsx`
had a hardcoded `TEACHER_EMAIL` constant left over from the single-teacher
era — the login form only ever took a password, always calling
`signInTeacher(TEACHER_EMAIL, password)` regardless of whose password was
typed. A second teacher's real password against the wrong fixed email
always failed as "неверный пароль", never as a wrong-email problem.
Removed the constant, added an email `<input>` to the form (same
`glass-tile` visual style as the password field — the two used to differ
in font size, `text-lg` vs `text-2xl`, fixed as part of the same pass).

**3. Tenant-isolation bug class found and fixed across the app — list
queries with no explicit `teacherId` filter.** `students/{id}`'s Firestore
Rule is intentionally `allow read: if true` (an unauthenticated student
needs to read their own card by id) — this means Rules can **never**
scope down a `students` list query on their own, no matter what the rule
for a single-doc read says. `subscribeToStudents()` and
`subscribeToPendingRegistrationTokens()` were both plain unfiltered list
queries relying on this non-existent Rules protection. Fixed by adding
`.where("teacherId", "==", uid)` explicitly to both queries (now take
`teacherId` as a required first param) — this class of fix is now the
standing pattern (see `systemPatterns.md`).

**4. Firestore Rules got published this session** (previously a draft/
permissive state — see `techContext.md`'s updated framing) and immediately
surfaced **five more instances of the exact same missing-filter bug**,
this time as real `permission-denied` errors in the browser console
(diagnosed from the actual console text, not guessed): `getCurriculumTemplates`,
`subscribeToUpcomingLessons`, `subscribeToCompletedLessons`,
`subscribeToIncomeLessons` (Финансы), `getAllCompletedLessons`, and
`getAllCurriculumProgressByStudent` (collectionGroup `curriculumProgress`).
**Root-cause mechanism, confirmed via the actual error text**: a
`collectionGroup`/list query whose security rule checks
`resource.data.teacherId` is rejected **outright** — the whole query, not
a silent per-document filter — unless the query itself is provably scoped
on that same field via an explicit `where`. All six fixed the same way;
every call site across `TeacherDashboard.jsx`, `curriculum-section.jsx`,
`student-row.jsx`, `finance-section.jsx` updated to pass
`auth.currentUser.uid`. `notifications/` was explicitly left alone per
user instruction — a known, deliberately-deferred gap, not forgotten.
- Adding `teacherId` to the `lessons` collectionGroup queries needed new
  composite indexes (`teacherId ASC, status ASC, date ASC/DESC`) — added
  to `firestore.indexes.json` and deployed via
  `firebase deploy --only firestore:indexes`.
- **Gotcha**: the `curriculumProgress` collectionGroup query only filters
  on one field (`teacherId ==`) with no `orderBy` — Firestore's API
  rejected a plain `indexes: [...]` entry for this with `HTTP 400: this
  index is not necessary, configure using single field index controls`.
  Single-field-only collectionGroup filters must go under
  `fieldOverrides`, not `indexes`, in `firestore.indexes.json` — a
  composite-index entry with exactly one field is invalid.

**5. Full timezone-handling rewrite** — explicit reversal of a prior
architectural decision (Phase 4a's first pass had kept "schedule slots are
always Moscow wall-clock time" as a fixed invariant; the user later called
this a mistake and asked for a full pass). New principle, applied
everywhere: **a user always enters and always sees time in their own
saved timezone** (`teachers/{uid}.timezone` / `students/{id}.timezone`),
falling back to `Europe/Moscow` only as a technical default for a profile
with no timezone saved yet — never as a data-type-specific special case.
- Schedule slots (`functions/core/schedule.js`): `getNextLessonDateForSlot`/
  `getNextLessonDate`/`getUpcomingLessonDates` now take the *teacher's*
  timezone as a parameter (resolved from `teachers/{teacherId}.timezone`
  in `core/lessons.js`/`core/googleCalendar.js`) instead of a hardcoded
  `SCHEDULE_TIME_ZONE` constant (renamed `DEFAULT_TIME_ZONE`, now purely a
  fallback).
- Reschedule proposals (teacher: `upcoming-lesson-card.jsx`; student:
  `StudentDashboard.jsx`'s `ProposeRescheduleDialog`) and the extra-lesson
  form (`extra-lesson-dialog.jsx`) all convert form input through the
  *actor's* own timezone now, via three new helpers in `src/lib/timezone.js`
  (`localInputsToUtcDate`/`datetimeLocalToUtcDate`/`utcDateToLocalInput`) —
  these reuse the project's existing hand-rolled `zonedTimeToUtc`/
  `getZonedParts` math (already in `src/lib/schedule.js`, now exported)
  rather than adding `date-fns-tz` as a new dependency, since the existing
  code is algorithmically the same technique.
- Bot messages: all ~15 message-builder functions in
  `functions/core/botMessages.js` (`formatMoscowDateTime` and every
  `RESCHEDULE_*`/`CANCELLATION_*`/`ASSIGNMENT_*`/`MATERIAL_ADDED`/
  `EXTRA_LESSON_ASSIGNED`/`HOMEWORK_SUBMITTED_TO_TEACHER`) now take an
  explicit `timeZone` param. Central resolution point:
  `createNotification` (`functions/core/notifier.js`) now resolves the
  *recipient's* timezone itself (`teachers/{teacherId}.timezone` for
  `target:"teacher"`, `studentData.timezone` for `target:"student"`) and
  accepts `text` as either a plain string or a `(timeZone) => string`
  builder — every call site in `core/lessons.js` that used to build one
  shared message string for both a student- and teacher-facing
  notification of the same event now passes a builder, so each recipient's
  copy renders in *their own* timezone even when the two differ.
  `parseRescheduleDateInput` (student typing "ДД.ММ ЧЧ:ММ" to a bot) now
  interprets that text in the student's own saved timezone too.
- Exam date (`MyGoalCard`) deliberately left untouched — date-only field,
  fixed noon, not a timezone concern.

**6. VK bot "not connected" indicator investigated (not conclusively
fixed).** Diagnosis showed the read path (`subscribeToTeacherContact`,
`src/firebase/teacherConnect.js`) and the write path (bot connect token
redemption, `resolveTeacherConnectToken`) already agree on the same
correct path — `teachers/{teacherId}/integrations/teacherContact` — so
the original "two migrated-at-different-times paths" hypothesis was
wrong. Most likely explanation given the Rules-publish timing (see #4
above): a `permission-denied` on this one-doc read, previously swallowed
silently by `subscribeToTeacherContact`'s `onError` (just `console.error`).
Fixed the swallowing — `TeacherBotConnectStatus` now surfaces the error
code visibly instead of defaulting to "не подключён" — but whether the
underlying Rules gap is actually the cause is **still unconfirmed**, since
this doc's Rule (unlike the six list queries above) isn't obviously tied
to a missing query filter. Needs the user to actually see what error code
now shows up.

**7. Video call link save/read — path confirmed correct, not yet
retested against published Rules.** `VideoCallSettings.jsx` writes and
`StudentDashboard.jsx` reads both use the same
`teachers/{teacherId}/integrations/videoCall` path
(`src/firebase/videoCall.js`) — no path mismatch found. Given the Rules
publish, this may turn out to have the same silent-permission-denied
symptom as #6; not yet independently retested this session.

**8. Google Calendar per-subject event colors — already implemented,
no fix needed.** Diagnosed rather than assumed: `colorIdForStudent`
(`core/googleCalendar.js`) already maps subject → Google's fixed 1–11
`colorId` palette and is already passed into both `buildEventResourceForSlot`
and `createExtraLessonEvent`'s API calls.

**9. Extra-lesson Google Calendar sync bug — confirmed and fixed.**
`confirmReschedule`/`confirmCancellation`/`cancelLessonDirectly`
(`core/lessons.js`) all defaulted `slotIndex` to `0` and looked up
`student.googleEventIds[slotIndex]` unconditionally — for an extra
(unscheduled) lesson (`isExtraLesson: true, slotIndex: null`), this
either found nothing or, worse, silently touched **slot 0's recurring
event** instead. Fixed with one shared helper, `resolveLessonEventId(lesson,
student)`, used in all three places — returns `lesson.googleEventId`
directly for an extra lesson, the slot-indexed lookup otherwise. Also
fixed `confirmReschedule`'s `durationMinutes` calc for the same reason
(was reading `scheduleSlots[0]`, now reads `lesson.durationMinutes` for
an extra lesson).

**10. ExamRadar "no history yet" status/color desync — confirmed and
fixed.** `computeRadarMetrics` (`src/lib/examRadar.js`) used to fall
through to `status: "red"` for the zero-pace-history case (a goal just
set, nothing completed yet), with `buildRadarComment` patching in
different, calmer text for that case — the status/color itself stayed
red/"Критическое отставание" regardless. Added a dedicated `"no_data"`
status. In `exam-radar.jsx`, `STATUS_COLOR["no_data"]` was previously
absent entirely, resolving to `null` and producing invalid CSS
(`color-mix(in oklab, null 12%, transparent)`) — added an explicit
`var(--muted-foreground)` token and a "Пока нет данных" label.

**11. Smaller fixes bundled in the same pass**: curriculum topic/prototype
`TruncatedList` limit in the teacher's expanded student row raised from 3
to 5; `HomeworkLessonDialog`'s "Сохранить"/"Сохранить и завершить урок"
recolored to the accent `SolidBtn`, "Урок прошёл" recolored to neutral
`GhostBtn` (previously all three shared one ambiguous styling); settings
gear icon in the teacher header restyled to match the circular
`glass-tile` shape already used by the notification bell and video-call
icon; a topic picker (uncovered `curriculumProgress` items, shown only if
a program is assigned) added above the free-text "Тема урока" field in
`HomeworkLessonDialog`'s upcoming mode, selecting fills the text field as
an editable default rather than locking it; `MyGoalCard` branches on
`examTarget === "oge"` — "Целевая оценка" label, 2–5 range, step 1,
default 4, vs. ЕГЭ's unchanged "Целевой балл" 0–100 (`setStudentGoal`'s
existing `Math.max(0, Math.min(100, ...))` clamp already accommodates
2–5 without any backend change).

**Deploy notes**: functions + hosting deployed together twice this
session (`firebase deploy --only functions,hosting`), both clean on the
attempted run (one earlier attempt in a related sub-session hit the
already-documented CLI source-load timeout flake, succeeded on retry).
Firestore indexes deployed separately (`--only firestore:indexes`), one
redeploy needed after the single-field `fieldOverrides` correction above.

## Loose ends / things to check next session

- **VK bot connect status (#6) and video-call link save (#7) — still not
  conclusively confirmed fixed.** Both are plausible casualties of the
  same Rules-publish event that broke the six list queries in #4, but
  neither has been independently verified against the *actual* error code
  now surfacing (VkBotConnectStatus at least now shows one instead of
  silently defaulting to "не подключён" — read what it says next time).
- **Firestore index build status not independently confirmable from this
  environment** — `gcloud` isn't installed, and `firebase firestore:indexes`
  only echoes the *configured* indexes, not their Building/Enabled state.
  User needs to check Firebase Console → Firestore → Indexes directly if
  a `failed-precondition` recurs shortly after an index deploy.
- **The uncommitted pile is now very large** (67 files) — all of Phase 4a
  plus the full timezone rewrite plus the tenant-isolation fixes are
  sitting only in the working tree / deployed-from-source, same standing
  risk flagged every session since session 9's regression scare. Worth
  raising explicitly.
- Session 11's still-open items carried forward unresolved (see
  `changelog/2026-08-august.md` for detail): `ContactButton` native-app
  handoff not verified on a real phone, mobile-layout pass not visually
  confirmed at ~375px, Telegram username contact-editing UX not manually
  walked through, `disconnectGoogleCalendar`'s actual disconnect→reconnect
  flow not manually verified, curriculum templates feature never verified
  end-to-end, student "Отменить урок" button long-flagged-unresolved
  (possibly fixed as a side effect of the session 10 IAM fix, never
  re-tested).
- `notifications/` collection's list-query tenant isolation is a known,
  deliberately-deferred gap (explicit user instruction this session) —
  don't fix it opportunistically without being asked.
