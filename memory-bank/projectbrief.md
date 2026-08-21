# Project Brief

**PrincessSchool tutor-app** — a scheduling and communication app for a solo
private tutor ("Princess School") and her students. React + Vite frontend,
Firebase (Firestore/Auth/Functions/Hosting) backend, with Telegram and VK bot
integrations and Google Calendar sync.

## Core requirements

- **Teacher dashboard**: manage students, set weekly recurring lesson
  schedules, assign/review homework, complete lessons, propose/confirm
  reschedules and cancellations, connect Google Calendar.
- **Student dashboard**: view upcoming lesson, submit homework, propose
  reschedule/cancellation of their own lesson — no Firebase Auth session,
  students are not authenticated users.
- **Bots (Telegram + VK)**: students interact with their schedule/homework
  through chat as an alternative to the web dashboard; teacher gets
  notifications through the bots too.
- **Reminders**: scheduled Cloud Functions notify students at 9:00
  Europe/Moscow (day-ahead) and hourly (2-hour-ahead) via whichever bot
  platform the student registered through.
- **Google Calendar sync**: lesson schedule slots are mirrored to a Google
  Calendar as events; reschedule/cancel/delete keep the calendar in sync.
- **Paid-lessons balance tracking**: teacher logs payments as a lesson
  count per student; completing a lesson auto-decrements it; low balance
  notifies the teacher and (optionally) the student.
- **Unified notifications**: every event a user should know about (homework
  submitted/assigned, material added, reschedule/cancellation
  proposed/confirmed/rejected, lesson reminders) is logged as a
  `notifications/` doc and best-effort mirrored to the recipient's bot —
  the teacher sees them via a bell/panel, the student via a dashboard block.

## Scope boundaries

- **Multi-tenant as of session 12** (was single-teacher-only through
  session 11) — any number of teacher accounts can use the app
  independently, each with their own students, schedule, curriculum
  templates, bot connections, and now (Phase 4a) their own timezone/color-
  theme preference. Every teacher-owned collection/subcollection carries a
  `teacherId` field; every list/collectionGroup query must filter on it
  explicitly (Firestore Rules alone cannot enforce this for collections
  that also need an open, unauthenticated student-side read — see
  `systemPatterns.md`). A public per-teacher landing page
  (`/app/:slug`) and per-teacher bot self-service signup exist so a
  prospective student can find and register with the *right* teacher.
- Students are identified by Firestore document, not Firebase Auth —
  student-facing actions are unauthenticated by design (see
  `functions/index.js` initiator/role params).
- **Multi-program as of session 13** — a student can be enrolled in
  several curriculum programs at once (e.g. separate ЕГЭ prep for two
  subjects), each with its own topics/prototypes/exam type/goal
  (`students/{id}/programs/{programId}`, was a single
  `curriculumProgress/main` through session 12). Exam types and subjects
  are both free-form per-teacher config now (`teachers/{uid}/examTypes`,
  `teachers/{uid}/customSubjects`), not a fixed enum/list — see
  `systemPatterns.md`.
- **Student dashboard is bilingual (ru/en) as of session 16 — the
  teacher panel is not and has no i18n dependency at all, by deliberate
  scope.** A student's own `students/{id}.language` (editable via their
  own Settings, default "ru") drives the whole page — UI text, dates,
  typical subject/exam-unit names, and both the in-app notification feed
  and the same event's Telegram/VK bot message. A teacher's own free-form
  text (a custom subject, an assignment body, a material title) is never
  auto-translated. See `systemPatterns.md` for the isolation mechanism.
- Russian-language UI and error strings throughout the **teacher** panel;
  the student dashboard is Russian-or-English per the point above.

## Source of truth

This document anchors [[productContext]], [[systemPatterns]], [[techContext]].
