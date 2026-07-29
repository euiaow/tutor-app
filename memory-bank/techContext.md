# Tech Context

## Frontend

- React 19 + Vite 8, React Router 7.
- Tailwind CSS 4 (via `@tailwindcss/vite`), `tw-animate-css`, `shadcn` +
  `@base-ui/react` for primitives, `class-variance-authority` + `tailwind-
  merge` + `clsx` for variant styling.
- `lucide-react` for icons.
- Firebase JS SDK (`firebase` ^12) for Auth/Firestore/Callables from the
  client (`src/firebase/*.js`).

## Backend

- Firebase Cloud Functions v2 (`firebase-functions`), Node/CommonJS
  (`require`, not ESM) — note this differs from the frontend's ESM/Vite
  setup.
- `firebase-admin` (Firestore, Storage, FieldValue/Timestamp).
- `googleapis` for Google Calendar + OAuth2 + userinfo.
- Custom Telegram and VK Bot API adapters (no bot framework library) in
  `functions/adapters/`.
- Firestore as the only datastore; Storage for homework file uploads.

## Development setup

- `npm run dev` — Vite dev server for the frontend (root `package.json`).
- Functions have their own `functions/package.json` / `node_modules`
  (separate dependency tree, deployed independently via `firebase deploy
  --only functions` or similar).
- `firebase.json` / `firestore.indexes.json` configure Hosting/Firestore.
- `eslint.config.js` (flat config) + `npm run lint` for the frontend.
- `.firebase/hosting.*.cache` is a Firebase CLI artifact that shows as
  modified in git — not meaningful source, ignore when reviewing diffs.

## Technical constraints

- **App URL is hardcoded** in `functions/index.js`
  (`APP_URL = "http://localhost:5173/teacher"`, marked `// pending: заменить
  на боевой домен...`) — must be updated before/at production deploy.
- Students have no Firebase Auth identity — any function reachable from
  the Student Dashboard must not require `request.auth` and must trust
  `studentId`/role params from the request body (already a deliberate
  trade-off, not an oversight — see [[systemPatterns]]).
- Google OAuth is single-account (the teacher's one connected Google
  Calendar) — tokens stored centrally, not per-user.
- Reminders rely on Cloud Scheduler cron (`onSchedule`) with explicit
  `timeZone: "Europe/Moscow"` for the day-ahead reminder; the hourly one
  intentionally omits timeZone since top-of-hour is zone-invariant.

## Dependencies worth knowing about

- `functions/scripts/` — untracked at present (`?? functions/scripts/` in
  git status); check contents before assuming it's throwaway.
- `.claude/commands/` and `.claude/claude-memory-bank.md` define this
  project's own Memory Bank workflow commands
  (`workflow:understand/plan/execute/update-memory`) — this memory bank
  was initialized to support those.
