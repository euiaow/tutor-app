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
- Tracking who's paid for how many lessons and remembering to chase
  payments before a student's paid package quietly runs out.

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
- Every notable event (homework submitted/assigned, material added,
  reschedule/cancellation proposed/confirmed/rejected, reminders) goes
  through one funnel (`createNotification`) that both logs it to Firestore
  (`notifications/`) and sends the same text to the recipient's bot — the
  in-app bell/block and the bot message are always the same event, never
  two things that can drift apart.
- Each student has a **paid-lessons balance** (a prepaid package size, not
  a currency amount) that decrements by one automatically whenever the
  teacher completes a lesson for them — scheduled or extra/unscheduled,
  no distinction. The teacher logs a payment as "N lessons paid for"
  (`addPayment`); when the balance drops to or below the student's
  low-balance threshold, both the teacher (bell) and — if the student has
  opted in — the student (bot) get nudged automatically.

## User experience goals

- Teacher: one dashboard card per student showing schedule, next lesson,
  homework state, and reschedule/cancellation actions — minimal clicking
  to complete routine tasks.
- Student: no login required; either a simple web view or their existing
  Telegram/VK chat should be enough to see the next lesson and submit
  homework.
- All user-facing strings are in Russian; error messages should read as
  natural, specific Russian, not translated English.
