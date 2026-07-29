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
    reminderUtils.js          shared helpers for reminders.js
    teacherNotifier.js        pushes notifications to the teacher's bot(s)
  adapters/
    telegram.js               Telegram webhook handling, sends
    vk.js                     VK Callback API webhook handling, sends
  reminders.js                dailyReminderMidday / dailyReminderPreLesson bodies
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

## Component relationships

- `TeacherDashboard.jsx` composes `components/teacher/student-card.jsx`
  and `components/teacher/homework-lesson-dialog.jsx` per student.
- `StudentDashboard.jsx` is the unauthenticated student-facing view,
  reading/writing through `src/firebase/*` directly for calls that don't
  need teacher auth, and through callables (with `initiator`/`confirmedBy:
  "student"`) for reschedule/cancellation actions.
- `src/lib/schedule.js` duplicates slot-normalization logic client-side so
  the dashboard can render/validate schedules without a round trip;
  `functions/core/schedule.js` is the server-side source of truth.

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
