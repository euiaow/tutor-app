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
  by hand. The teacher can also cleanly disconnect and reconnect the
  calendar (e.g. to switch Google accounts) without leaving stale event
  ids behind that would break the next sync.
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

- **Group lessons** work the same way from the student's side as an
  individual lesson — it shows up as their next lesson, with homework and
  reminders exactly like any other, just tagged as a group session. The
  difference is entirely on the teacher's side: a group lesson's reschedule/
  cancellation is the teacher's call alone, applied to the whole group at
  once immediately (no propose/confirm negotiation the way an individual
  lesson has) — a shared class time isn't something one student can
  renegotiate on everyone else's behalf. A group can also share a
  curriculum program; a student who's individually working through the
  same subject keeps one unified program, not a second copy — the group
  view's progress reflects what's been covered by everyone, while a
  student can still be individually ahead.
- Each user (teacher or student) has their own **timezone and color-theme
  preference**, set once via a Settings dialog on their own dashboard. The
  guiding principle (session 12, after an earlier same-session attempt to
  keep schedule times fixed to Moscow was explicitly reversed): a person
  always enters and always sees lesson times in *their own* timezone —
  never a shared assumption, never the tutor's timezone imposed on a
  student elsewhere, never the device's timezone silently substituted.
  Color theme is purely cosmetic (pink or amber, the two palettes that
  already existed for teacher/student respectively) — either side can
  pick either one.
- **A student also has a language preference (session 16)** —
  `students/{id}.language` ("ru"/"en", own Settings `<select>`), applied
  the same "always read/see in *their own* setting" way the timezone
  principle above already established: the site, every notification in
  the in-app feed, and the same event's bot message all read in whichever
  language that specific student picked, resolved independently per
  student. This does not extend to the teacher panel, which stays
  Russian-only by deliberate scope.

## User experience goals

- Teacher: one dashboard card per student showing schedule, next lesson,
  homework state, and reschedule/cancellation actions — minimal clicking
  to complete routine tasks.
- Student: no login required; either a simple web view or their existing
  Telegram/VK chat should be enough to see the next lesson and submit
  homework.
- All teacher-panel strings are in Russian; error messages should read as
  natural, specific Russian, not translated English. The student
  dashboard is Russian-or-English per that student's own language
  preference (session 16) — English copy should read as natural English,
  not a literal translation either.
