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

## Scope boundaries

- Single-teacher product (no multi-tenant teacher accounts today).
- Students are identified by Firestore document, not Firebase Auth —
  student-facing actions are unauthenticated by design (see
  `functions/index.js` initiator/role params).
- Russian-language UI and error strings throughout.

## Source of truth

This document anchors [[productContext]], [[systemPatterns]], [[techContext]].
