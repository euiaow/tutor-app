# Active Context

_Last updated: 2026-07-29_

## Current work focus

Uncommitted working set (17 tracked files + `functions/scripts/` new) on top
of `824ec3c`. This is **not** a new feature — it's a coherent migration from
"one schedule per student" to **multi-slot schedules** (`scheduleSlots: []`
array instead of a single `schedule` object), plus several smaller riders
that piggyback on the same lessons/reminders code paths.

### 1. Multi-slot schedule migration (the core change)

- Firestore shape: `student.schedule` (single object) → `student.scheduleSlots`
  (array of `{ dayOfWeek, time, durationMinutes }`, up to 7).
- `normalizeScheduleSlots(data)` is the compatibility shim — duplicated
  verbatim in both `functions/core/schedule.js` and `src/lib/schedule.js`.
  It reads `scheduleSlots` if present, else wraps a legacy `schedule` object
  into a one-element array, else `[]`. **Every** read path (frontend and
  backend) now goes through this, so the two shapes never need separate
  handling downstream.
- `functions/scripts/migrateSchedule.js` — one-off manual backfill script
  (`node functions/scripts/migrateSchedule.js`, not wired into deploy) that
  wraps every student's legacy `schedule` into `scheduleSlots: [schedule]`.
  **Has this been run against production yet? Unknown — check before
  assuming prod data is migrated.**
- `functions/core/schedule.js` gained `getNextLessonDateForSlot` (per-slot,
  old `getNextLessonDate` logic renamed), `getNextLessonDate` (now takes
  `scheduleSlots[]`, returns earliest across all slots — signature changed,
  old callers passing a single `schedule` object will break), and
  `getUpcomingLessonDates(scheduleSlots, count)` (returns the next `count`
  occurrences merged/sorted across slots, each tagged `slotIndex`).
- Lesson docs gained a `slotIndex` field (legacy docs without it are treated
  as slot 0 via `bucketUpcomingBySlot`). A student can now have **multiple**
  simultaneous "upcoming" lesson docs (one per slot) — every place that used
  to assume "the one upcoming lesson" (`ensureUpcomingLesson`,
  `syncUpcomingLessonToSchedule`, reminders) was rewritten to loop over
  slots, though both still return a single "soonest" lesson id to preserve
  the old single-id contract for existing callers.
- Google Calendar sync (`functions/core/googleCalendar.js`): `googleEventId`
  (single) → `googleEventIds` (map keyed by slot index string, e.g. `{"0":
  eventId}`). New `syncScheduleSlots()` diffs current slots against the
  existing map and creates/updates/deletes events per slot. Old
  `createLessonEvent`/`updateLessonEvent`/`buildEventResource` exports are
  **gone**, replaced by `createEventFromResource`/`updateEventFromResource`/
  `buildEventResourceForSlot` + `syncScheduleSlots`. `functions/index.js`'s
  Firestore trigger and `deleteStudent`/`confirmReschedule`/
  `confirmCancellation` in `lessons.js` all updated to read/write the new
  map (with fallback to the legacy singular `googleEventId` for
  not-yet-migrated students).
- Frontend: `src/components/teacher/student-card.jsx` schedule editor
  rewritten to add/remove/edit an arbitrary list of slots (was a single
  day+time picker). `mapStudentDoc` in `src/firebase/students.js` now
  exposes `scheduleSlots` instead of `schedule`.

### 2. Reminders overhaul (rides on the slot work, but is its own change)

- `dailyReminderMidday` moved from 12:00 → **9:00** Moscow, and its window
  changed from "exactly tomorrow" to "now through end of tomorrow" — so a
  lesson later today also gets a midday reminder now, not just next-day
  ones.
- It now sends **one combined message per student** listing every lesson in
  that window (`REMINDER_MIDDAY_SUMMARY`, replacing the old singular
  `REMINDER_MIDDAY`), instead of one message per lesson. Sent-state moved
  from a per-lesson `remindersSent.middaySent` flag to a per-**student**
  `remindersSent.middaySentDate` timestamp (checked via `isSameMoscowDay`),
  since one message now covers multiple lessons.
- `dailyReminderPreLesson` (hourly) is still per-lesson
  (`remindersSent.preLessonSent`) but gained a cross-lesson throttle: won't
  send if any pre-lesson reminder already went to this student within the
  last 30 min (`remindersSent.lastPreLessonSentAt`), so two closely-spaced
  slots don't produce back-to-back texts.
- `getEffectiveLessonDate` (old single-lesson lookup in `core/lessons.js`)
  is **deleted** — reminders.js now calls `getUpcomingLessons(studentId)`
  (all upcoming docs, ordered) directly instead.

### 3. Riders bundled into this same diff (unrelated to slots)

- **Cancellation now deletes the lesson doc** instead of setting
  `status: "cancelled"` (`confirmCancellation` in `core/lessons.js`). The
  next occurrence of that slot is created lazily later, not eagerly.
  `src/pages/StudentDashboard.jsx`'s `NextLessonPlate` was updated to treat
  "doc no longer exists" as the cancellation signal instead of watching for
  `status === "cancelled"` (which can now never be observed).
- **`completeLesson` dropped `attendance`/`homeworkDone`/`rating` params
  entirely** — callable signature, `src/firebase/lessons.js`, and
  `homework-lesson-dialog.jsx` all stripped of the attendance/rating
  UI (`ToggleGroup`, `ATTENDANCE_OPTIONS`, `RATING_OPTIONS` all deleted).
  Completing a lesson now just flips status + materials. A lesson topic is
  now editable directly via the new `updateLessonTopic` (plain client
  `updateDoc`, no callable) while the lesson is still upcoming, rather than
  only being settable at completion time.
- **XP/level UI removed from `student-card.jsx`** (no more progress bar /
  "Уровень X · Y XP") — `addXpToStudent` etc. in `src/firebase/students.js`
  is untouched, so XP is still tracked, just not shown on the card anymore.
- `lesson-history.jsx` and `TeacherDashboard.jsx`'s past-lessons list both
  replaced "load 5 more" pagination with a "show all" button that opens a
  dialog doing a one-time full fetch (`getLessons` / new
  `getAllCompletedLessons` using a `collectionGroup` query across all
  students).

## Loose ends / things to check before continuing

- `src/pages/TeacherDashboard.jsx:568`ish —
  `const [completedVisibleCount] = useState(2)` has no setter now (the old
  "show more" incrementer was removed but the state itself wasn't cleaned
  up into a plain constant). Harmless but worth simplifying if touching
  this file again.
- Confirm whether `functions/scripts/migrateSchedule.js` has actually been
  run against the production Firestore — nothing in the diff proves it
  has, and `normalizeScheduleSlots`'s legacy-schedule fallback is the only
  thing keeping un-migrated students working in the meantime.
- `functions/core/lessons.js` `confirmReschedule`/`confirmCancellation` and
  `deleteStudent` in `students.js` all fall back to the legacy singular
  `googleEventId` — this fallback can likely be deleted once the migration
  script has definitely run everywhere.
- No test suite exists in this repo — verification is manual (dev server +
  Firebase emulator/deploy).

## Recent commit history

- `824ec3c` — reschedule + cancellation flows, VK bot.
- `da38da5` — reminders, bots, reschedules.
- `e07e9f3` — unified lesson dialog, `completeLesson`, reminders logging.

## Untracked additions

- `functions/scripts/migrateSchedule.js` — see above.
- `.claude/commands/`, `.claude/claude-memory-bank.md` — this project's
  Memory Bank / workflow slash commands.
