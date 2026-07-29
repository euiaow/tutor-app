# PrincessSchool tutor-app

Scheduling + communication app for a solo private tutor. React/Vite frontend,
Firebase backend (Firestore/Auth/Functions/Hosting), Telegram + VK bots, Google Calendar sync.

## Memory Bank

Full context in `memory-bank/` — read it via `/workflow:understand` at session start.
Do NOT re-scan source files to understand the project; use the memory bank instead.

## Architecture in one paragraph

Teacher is the only authenticated user (Firebase Auth). Students have NO Auth identity —
they are Firestore documents, student-facing Cloud Functions must NOT require `request.auth`
and must trust `studentId`/role from request body (deliberate, not an oversight).
Google OAuth is single-account (teacher's calendar). Bots (TG + VK) are custom adapters
in `functions/adapters/` — no framework library.

## Key locations

| What | Where |
|---|---|
| Cloud Functions entry | `functions/index.js` |
| Bot adapters | `functions/adapters/` |
| Firebase client | `src/firebase/*.js` |
| Frontend pages | `src/pages/` |
| Reminder logic | `functions/core/` |

## Critical constraints

- `APP_URL` hardcoded as `localhost:5173` in `functions/index.js` — must change before prod deploy
- Functions: CommonJS (`require`), Node — NOT ESM (frontend is ESM/Vite)
- `.firebase/hosting.*.cache` always shows as modified in git — ignore, not source
- `functions/scripts/` untracked — check before assuming throwaway

## Stack

Frontend: React 19 + Vite 8, React Router 7, Tailwind CSS 4, shadcn, lucide-react
Backend: Firebase Functions v2, firebase-admin, googleapis
