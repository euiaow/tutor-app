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

## Known issues / open items

- `APP_URL` in `functions/index.js` is hardcoded to
  `http://localhost:5173/teacher` with an explicit `pending` comment to
  replace it before production.
- No automated test suite in the repo.
- A substantial uncommitted diff is currently sitting on top of the last
  commit (see [[activeContext]]) — not yet committed or reviewed line by
  line this session.
- `functions/scripts/` is untracked with unknown contents/purpose.

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
