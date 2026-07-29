# Product Context

## Why this exists

A single tutor needs to run her whole practice — scheduling, homework,
reminders, rescheduling — without juggling separate chat threads, a paper
calendar, and manual reminders. The app centralizes that into one system
that meets students where they already are (Telegram/VK), while giving the
teacher a proper web dashboard.

## Problems it solves

- Manually remembering to remind each student before their lesson.
- Losing track of homework assigned vs. submitted per student.
- Renegotiating a lesson time over chat with no record of what was agreed
  (now modeled explicitly as reschedule/cancellation status machines).
- Keeping a Google Calendar in sync with an ever-changing weekly schedule
  by hand.

## How it should work

- The teacher sets a **weekly recurring schedule** (multiple slots per
  student supported) on the student's card in the Teacher Dashboard.
- The system auto-creates the next "upcoming" lesson draft per slot
  (`ensureUpcomingLesson`), keeps it synced to schedule edits via a
  Firestore trigger, and mirrors slots to Google Calendar.
- Either side (teacher via web, student via web or bot) can **propose** a
  reschedule or cancellation; the other side **confirms/rejects** it. Bots
  and reminders reflect these statuses in the messages they send.
- After a lesson happens, the teacher marks it complete
  (`completeLesson`), which records history and triggers creation of the
  next upcoming draft for that slot.
- Reminders fire automatically on a schedule (no manual "send reminder"
  action) — daily at 9:00 Moscow time for next-day lessons, hourly for
  lessons starting within 2 hours.

## User experience goals

- Teacher: one dashboard card per student showing schedule, next lesson,
  homework state, and reschedule/cancellation actions — minimal clicking
  to complete routine tasks.
- Student: no login required; either a simple web view or their existing
  Telegram/VK chat should be enough to see the next lesson and submit
  homework.
- All user-facing strings are in Russian; error messages should read as
  natural, specific Russian, not translated English.
