# Active Context

_Last updated: 2026-08-19 (session 15)_

## Current work focus

Session 14's full narrative moved to `changelog/2026-08-august.md` this
update — this file now keeps only session 15 inline. Session 15 was a
string of separately-requested fixes/features, each committed and
deployed individually, turn-by-turn — culminating in a large new feature
(gamification) built out in full in the session's final stretch.

### Session 15 — dialog backdrop audit, custom dropdowns, video-call/schedule-timezone real root causes found, Google Calendar embed color, gamification MVP

**1. Student details "Программы" row.** `student-row.jsx`'s expanded
"Расписание" tile gained a row listing the student's assigned program(s)
— went through two revisions in the same session: first showed
`program.subject`, then corrected to show the assigned **template's
name** (resolved via `templateId` against a one-time
`getCurriculumTemplates` fetch on row expand — templates weren't loaded
in this component before), then refined again into a shared
`SummaryListRow` component (singular/plural label — "Предмет"/"Предметы",
"Программа"/"Программы" — based on count; 2+ values stack one-per-line
with top alignment instead of a comma-joined inline string with center
alignment). Used for both the subjects row and the programs row.

**2. Dialog backdrop/animation audit found a real, previously-unnoticed
Base UI bug.** Base UI's `Dialog.Backdrop` skips rendering entirely for
a dialog opened while an ancestor `Dialog.Root` is already open ("nested"
detection, automatic via context) **unless `forceRender` is passed** —
already known from session 14 for one case (`teacher-bot-connect.jsx`),
but this session found it *also* silently broke `RescheduleDialog`/
`CancelLessonDialog` (`upcoming-lesson-card.jsx`, nested inside
"Следующие уроки") and `HomeworkLessonDialog` (nested inside "Следующие
уроки" / "История уроков" / "Все прошедшие уроки" — hand-rolls its own
`Dialog.Backdrop`, no `elevated` support existed at all). Fixed by always
passing `elevated`/`forceRender` on these (harmless when not actually
nested). Separately found `TeacherPopoverContent` (`theme-ui.jsx`) had
**zero** transition/animation classes — not incomplete, entirely missing
— added the same fade+scale every dialog uses, and bumped its z-index to
`z-[120]` (above every dialog tier, including `elevated`'s `z-[111]`,
since a popover can now be nested inside an elevated dialog too — see
`ProgramTopicPicker` inside `HomeworkLessonDialog`).

**3. Custom "designed" dropdowns.** New reusable `TeacherSelect`
(`theme-ui.jsx`, `TeacherPopover`-based, same shape as the existing
`ProgramTopicPicker`) replaces native `<select>` for: `SubjectPicker`'s
subject picker and `curriculum-section.jsx`'s "Тип экзамена" picker.
**Reach for `TeacherSelect` before writing a new dropdown from scratch.**

**4. Video call button — real root cause found (not Rules alone).**
First hypothesis (and a real, separately-fixed gap) was a Firestore
Rules hole: `teachers/{teacherId}/integrations/{doc}` required teacher
auth, blocking the student's unauthenticated read of
`integrations/videoCall`. User published a fix for that — **button still
didn't appear.** Actual root cause: `src/firebase/lessons.js`'s
`mapLessonDoc` never exposed `teacherId` on the client lesson object —
the *third* occurrence of the "explicit field list is the real gate"
bug class in this project (after `mapStudentDoc`, and `slotIndex`/
`isExtraLesson` in this same function). `StudentDashboard.jsx`'s
video-call block is gated on `lesson?.teacherId`, always `undefined`, so
the Firestore read was never even attempted regardless of Rules. Fixed
by adding `teacherId` to `mapLessonDoc`. **Verified with a real
unauthenticated Firestore client-SDK read script** (confirmed the Rules
fix alone was sufficient for reads, then confirmed the actual blocker was
client-side) rather than guessing from code alone. **Lesson: when a
Rules fix doesn't resolve a symptom, re-verify with a real read/write
before assuming the Rules diagnosis was wrong — here it was right, just
not the whole story.**

**5. Schedule timezone bug — genuinely fixed and verified, after an
earlier attempt this same session that *looked* fixed but wasn't.** User
correctly called out that the first attempt changed nothing. Root cause:
every caller (frontend `getNextLessonDateForSlot` in
`student-row.jsx`/`upcoming-lessons-list-dialog.jsx`, backend
`ensureUpcomingLesson`/`syncUpcomingLessonToSchedule` in `lessons.js`,
`syncScheduleSlots` in `googleCalendar.js`) was passing the teacher's
*current* Settings timezone preference as **both** the anchor (what
timezone "16:00" means for a slot with no explicit timezone of its own)
**and** the display timezone — since both were the same value, converting
a legacy slot's time was always a no-op, regardless of which timezone the
teacher switched to. **Fix: schedule slots now carry their own
`timeZone` field**, stamped with the teacher's current timezone every
time `StudentEditModal` saves the schedule (`student-row.jsx`'s
`handleSave`) — added to `normalizeScheduleSlots` in both
`src/lib/schedule.js` and `functions/core/schedule.js` (kept in sync by
hand as always). `getNextLessonDateForSlot(slot, timeZone)` now prefers
`slot.timeZone` over the passed-in fallback; every caller that used to
pass "teacher's current preference" as that fallback now passes nothing
(falls through to the function's own `Europe/Moscow` default) — this
only matters for legacy slots saved before this fix, since a
freshly-saved slot always has its own real `timeZone` now. Removed the
now-dead `getTeacherTimeZone` helper from both `core/lessons.js` and
`core/googleCalendar.js`. **Verified with a real Node script** computing
`getNextLessonDateForSlot` output across three real timezones for both a
legacy (no `timeZone`) and a freshly-stamped slot — confirmed the legacy
slot's Moscow anchor now correctly converts to different local times per
viewer zone, and a stamped slot's own zone always wins over any passed
fallback. All 3 affected Cloud Functions redeployed. **General lesson
reinforced by this session: when a user says "nothing changed," actually
re-derive the fix with real numbers rather than re-explaining the same
(apparently insufficient) reasoning — the bug here was subtle enough that
code review alone missed it twice.**

**6. Google Calendar embed widget color.** `getCalendarEmbedInfo`
(`functions/index.js`) now reads the teacher's `colorTheme` and appends
`&color=` to the `calendar/embed` URL. Confirmed via user feedback that
this specific embed widget accepts **arbitrary hex** (not restricted to
a fixed Google palette as first assumed) — first pick (`#f691b2`/
`#ffad46`) was too dark/saturated, corrected to lighter pastels
(`#fce7f3`/`#fef3c7`). **Known, explicitly-deferred limitation**: the
embed widget can only show one flat color for the *whole* calendar, never
per-event/per-subject — a real custom-built calendar view would be
needed for that (a past attempt at one in this project used an
outdated-looking library and was abandoned); user may add "build a real
custom calendar view" to a future task list, not started this session.

**7. NEW FEATURE — gamification (sticker cases, CS:GO-style) MVP,
stub/placeholder art only.** Large, explicitly multi-part user spec.
Deliberately shipped as a working stubbed skeleton (`imageUrl: ""`
throughout, colored squares stand in for real pixel art) — real content
and case-catalog design arrive later via a "migration" the user will
drive, per their own explicit instruction. Clarified up front with the
user: **`stickerSets` is a single GLOBAL catalog**, not per-teacher
content (unlike `curriculumTemplates`) — one shared set of cases for
every student regardless of teacher.

- **Firestore shape**: `stickerSets/{setId}` (name/coverUrl/price/
  `stickers: [{id,name,rarity,weight,imageUrl}]`, top-level, no
  `teacherId`). `students/{id}.coinsBalance` (new field — added to
  `mapStudentDoc` *proactively* this time, learning from the video-call
  bug above rather than discovering the gap later). `students/{id}/
  inventory/{setId_stickerId}` (deterministic doc id — one per owned
  unique sticker, doubles as the atomic "already own this?" check).
  `students/{id}/decoration/main` (singleton, `zone1`/`zone2`/`zone3` →
  inventory doc id or `null`). `students/{id}/coinLedger/{entryId}`
  (append-only audit, same transactional shape as `balanceLedger`/
  `finance.js` — not yet exposed to any UI).
- **`functions/core/gamification.js`**: `openCase(studentId, setId)` —
  server-side weighted pick (`pickWeightedSticker`, verified via a real
  100k-sample distribution test matching configured weights), one
  `db.runTransaction` for the balance-check + inventory-write +
  ledger-write (mirrors `finance.js`'s `addPayment`/
  `deductLessonFromBalance` shape exactly). A duplicate pull converts to
  **+2 coins** instead of a second inventory doc — detected via the
  deterministic inventory doc id, never increments `quantity` past 1 (the
  schema keeps a `quantity` field per the task spec's literal wording,
  even though nothing increments it yet). `saveDecoration(studentId,
  zone, itemId)` validates the student actually owns `itemId` (a real
  inventory doc id, not a bare sticker id — this is *why* decoration
  zones store the composite id, avoiding any cross-set id collision)
  before writing. Both exported as no-`request.auth` callables (student-
  facing, `studentId` trusted from the request body, same pattern as
  `submitHomeworkFile`).
- **Verified end-to-end against the real deployed backend, not just
  code review** — same "no local Admin SDK credentials, temporarily
  deploy a guarded function, invoke once, delete it" workaround this
  project has used before (`migrateToPrograms`). Deployed
  `seedGamificationStub`/`grantTestCoins`/`dumpGamificationState`
  temporarily, ran a real test student through 8 case opens: confirmed
  correct weighted distribution, correct balance debits, 6-of-8 correctly
  detected as duplicates and converted to coins, correct inventory dedup
  (2 unique items from 8 opens), `saveDecoration` correctly accepted an
  owned item and rejected (`failed-precondition`) a fake one. All 3 temp
  functions deleted afterward (`firebase functions:delete`) — they had no
  auth checks and would have been a real coin-minting abuse vector if
  left live.
- **Frontend**: `src/firebase/gamification.js` (subscriptions + callable
  wrappers), `src/lib/gamification-context.jsx` (`GamificationProvider`/
  `useGamification` — shared inventory/decoration/sticker-sets/"armed
  item" state, same shape as `user-prefs-context.jsx`, needed because the
  3 decoration zones live in 3 physically separate spots on the page),
  `src/lib/stickerColors.js` (rarity → color class, a small **fixed**
  palette — not the free-form subject-hash approach `lib/subjects.js`
  uses, since rarity is a closed known set), `src/components/student/
  sticker-square.jsx` (the one shared "render a sticker" primitive —
  will render `imageUrl` directly once real art exists, zero other call
  site changes needed then), `case-opening-animation.jsx` (horizontal
  reel, fast→slow `cubic-bezier` deceleration; the real server-resolved
  sticker is placed at a fixed reel index **before** any animation frame
  runs — never a client-decided outcome, satisfying the task's own
  requirement), `gamification-section.jsx` (balance + case grid +
  inventory grid — tapping an inventory sticker "arms" it), `sticker-
  zone.jsx` (the reusable zone widget, dropped at 3 spots in
  `StudentDashboard.jsx`: overlapping the avatar circle in the header,
  overlapping the first program's progress/goal card, and a new
  "Витрина стикеров" banner at the very bottom — tap-then-tap placement,
  not drag-and-drop, per the task's own touch-gesture note).

## Loose ends / things to check next session

- **Gamification is NOT yet usable in production** — no Firestore Rules
  exist yet for `stickerSets`/`students/{id}/inventory`/`students/{id}/
  decoration` (public read, `allow write: if false` — only the Cloud
  Functions, which use the Admin SDK and bypass Rules, should ever
  write). Rule text was drafted and handed to the user this session; not
  yet confirmed published — check first thing next session, same as
  every other Rules-gap loose end this project has had.
- No coin-earning mechanic exists yet (out of scope per the task spec,
  which only described spending) — a teacher testing the feature has to
  grant `coinsBalance` by hand via the Firestore Console for now. Needs a
  product decision next session.
- No UI exists yet to create/edit `stickerSets` from either dashboard
  (also explicitly out of scope this session — real content arrives via
  a future "design migration"). Only one stub set (`stub-set-1`, 3
  stickers) exists in Firestore right now, left over from testing.
- Whether/how a teacher will eventually create sticker sets (a direct
  client Firestore write like `curriculumTemplates`, or something else,
  given the global-not-per-teacher decision) is undecided.
- **No live browser testing was possible this session either** — every
  UI piece (the dialog animation/backdrop fixes, the new dropdowns, the
  case-opening reel's actual timing/feel, decoration-zone touch
  placement) is unverified against a real render. Everything backend-side
  this session *was* verified against the real deployed backend (unlike
  some earlier sessions) — the gap is specifically the rendered UI.
- `progress.md` is at ~500 lines, well past the 300-line archive
  threshold flagged since session 14 — still not archived (three
  sessions running now); worth doing a dedicated pass soon instead of
  deferring again.
- Carried from session 14, still unconfirmed: `notifications/
  {notificationId}`'s `allow update` rule — the user's own message this
  session didn't mention it, so status is unknown; ask directly next
  session rather than assuming either way.
