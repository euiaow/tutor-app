# Progress

## What works (per commit history + code present)

- **Placed decoration stickers now render on the live student dashboard
  (session 21)** — closes the gap open since session 17 (placement wrote
  real data via `saveDecoration` but nothing outside the sticker-workshop
  modal ever displayed it). Extended `DECORATION_ZONES` 3→5
  (`zone1`..`zone5`, backward-compatible with existing zone1-3 data) in
  both the Cloud Function's validation gate
  (`functions/core/gamification.js`) and the client
  (`src/firebase/gamification.js`), and the modal's own zone-picker
  (`ZONE_DEFS` in `sticker-workshop-modal.jsx`, a generic `.map()` so
  extending the array was the only change needed there). New
  `DecorationZone` component (`src/components/student/decoration-zone.jsx`)
  reads `decoration`/`inventory` off the existing `GamificationProvider`
  context and renders each zone's placed sticker (or nothing) as a
  `position:absolute` child of its own `position:relative` anchor card —
  zone1/2/3 anchor to the "Следующий урок" card, zone4/5 anchor to
  whichever card renders for the student's first program
  (`ExamRadar`/`CurriculumProgressCard`, gated by a new `showDecoration`
  prop). Because every zone anchors to its own card rather than the page,
  the pre-existing notifications banner between the lesson card and the
  goals section reflows the layout (and every zone with it) automatically,
  with no new banner-aware code. zone2/zone3 sit in the page's side
  margins on desktop, move to a card-corner overlap on mobile (≤640px,
  matching zone1/zone4's corner treatment) via Tailwind's `sm:` breakpoint
  — a `--sticker-max` CSS var (`src/index.css`) caps a sticker's longest
  edge at 130px desktop / 76px mobile while preserving its real aspect
  ratio. A new `stickerPlaceholderColor` (`src/lib/stickerColors.js`)
  gives the live dashboard its own deterministic per-sticker color,
  deliberately not reusing the modal's own unexported `hashColor`/`ink`
  (scoped to that component's separate arcade palette) — every real
  sticker still has an empty `imageUrl` today (no pixel art uploaded yet),
  so this placeholder path is what actually renders right now. **No live
  browser measurement was possible** (same standing environment gap as
  sessions 17-19) — offsets are reverse-engineered from a reference
  screenshot's proportions plus the real JSX structure, not pixel-measured
  against a running page; flagged for a real-DevTools check next session,
  particularly at desktop widths between ~640-810px where the page's side
  margins get tight. Full detail: `activeContext.md`.
- **Sticker Workshop's last missing case artwork closed (session 20)** —
  session 18 left MYTHIC (the 3rd seeded case) with a plain text-label
  fallback because no matching lettering asset existed in the project;
  the user corrected this — the design's 3rd case slot has always used a
  *photo-card* treatment (bordered, `object-fit:cover`), not the SLAY/
  LEGACY transparent-lettering style, specifically because its source
  asset (`reels-lettering.png`) isn't stylized text art. That treatment
  belongs to whichever case fills the 3rd slot, independent of the
  design's original demo name ("REELS"). Wired it in as
  `src/assets/gamification/mythic-lettering.png` for MYTHIC, using the
  design's exact photo-card positioning (distinct card-vs-detail
  dimensions). `CaseTitle` now supports a `type: "sticker" | "photo"` per
  `CASE_LETTERING` entry plus a `variant: "card" | "detail"` prop so both
  visual treatments coexist. All 3 seeded cases now show real art — no
  case names are missing artwork anymore. Deployed hosting only. Full
  detail: `activeContext.md`.
- **Group lessons — all 5 phases shipped and deployed in one session
  (session 19)**: data model (`teachers/{uid}/groups`+`.../lessons`),
  teacher CRUD/management UI ("Группы" panel under "Ученики"), per-slot
  draft generation + Google Calendar sync (one event per slot, not per
  member), completing a group lesson (loops every attendee through the
  same `deductLessonFromBalance`/`markTopicsCovered`/`createNotification`
  building blocks individual lessons use), student-side "next lesson"/
  materials/history merging (individual vs. group, whichever's sooner —
  no participant names shown, no reschedule/cancel buttons for a student),
  bot/website homework attach picks whichever lesson is nearer, group-
  aware reminders (always a separate notification from that student's own
  individual-lesson reminder), and weekly income summed per attendee.
  Reused rather than duplicated wherever the task asked: extracted a
  shared `schedule-slots-editor.jsx` out of the student edit form,
  extracted a shared Calendar event-diffing loop (`syncSlotEvents`) out of
  the student sync function, exported 3 previously-internal
  `googleCalendar.js` helpers instead of reimplementing them, reused
  `ATTENDANCE_OPTIONS`/`RATING_OPTIONS`/`ToggleGroup` from
  `HomeworkLessonDialog`. **Verified end-to-end against real deployed
  code** (not just built) via a temporary diagnostic Cloud Function using 2
  throwaway students — create→generate→reschedule→cancel→regenerate→
  complete-with-per-attendee-results→balance actually deducted per
  attendee→next draft regenerated, all green, then cleaned up. One new
  Firestore composite index deployed (`lessons` collectionGroup,
  `memberIds array-contains` + `status ==`). **Firestore Rules for the 2
  new subcollections still need to be added by the user** (same
  `permission-denied`-until-Rules-published gap session 17 hit for
  `stickerSets`) — exact rule text and the one known disclosed scope gap
  (`LessonHistoryDialog`'s full-history view isn't merged, only the
  3-item preview is) are in `activeContext.md`.
- **Sticker Workshop modal visual polish pass, checked against the design
  canvas element-by-element (session 18)** — full-width 3-column case
  grid (`repeat(3,minmax(0,1fr))`, was an `auto-fill` grid that packed 4-5
  narrow columns instead of 3 wide ones); case titles render as photo
  lettering (`slay-lettering.png`/`legacy-lettering.png`, copied from
  `roulette-design/` into `src/assets/gamification/`) for the 2 of 3 seed
  cases that have matching art, with an explicit text fallback (not a
  placeholder image) for MYTHIC, whose lettering doesn't exist yet
  anywhere in the project; header hero-cat/arcade-title enlarged and
  repositioned to the design's actual coordinates; a `preloadImages()` +
  `assetsReady` gate now blocks the modal's real content behind a
  pixel-art loading screen (`LoadingScreen`/`PixelCat`, hand-animated
  rainbow-hued running cat) until every shared image resolves (or a
  4s timeout fallback fires); the case-opening reel is now a genuine
  3-phase spin (accelerate → linear-speed plateau → decelerate to the
  exact server result) at double the previous duration (9s), replacing
  the old single-curve `cubic-bezier` ease-out. Verified only via `npx
  vite build` + `npx eslint` (clean, zero new violations) — no live
  browser render this session either. Full detail: `activeContext.md`.
- **Gamification's cases/collection/placement UI fully migrated to a
  designed arcade-cabinet fullscreen modal, real data end-to-end (session
  17)** — replaces the session-15 stub UI (plain grid + basic dialog) with
  a hand-ported React version of a Claude Design canvas export
  (`src/components/student/sticker-workshop-modal.jsx`, opened via
  `sticker-workshop-button.jsx`, rendered through `createPortal` at
  `z-index:1000`, deliberately outside the app's own `GlassDialog`
  system). Every screen reads real Firestore data (`stickerSets`/
  inventory/decoration via the existing `GamificationProvider`) and the
  case-opening reel only ever lands on the actual `openCase` Cloud
  Function result — the server call resolves *before* the reel/strip is
  even built, so there's no client-random value the animation could
  disagree with. The 3 old dashed "+" placeholder zones on the live
  dashboard (`sticker-zone.jsx`) were deleted outright per the task's
  instruction — placement now only happens inside the modal's own
  screenshot-based zone picker; nothing currently renders a placed sticker
  back onto the live dashboard page (known gap, not an oversight — see
  `activeContext.md`). Deliberately Russian-only (source design has no
  i18n), unlike the rest of the bilingual (session 16) student dashboard —
  an explicit, scoped exception, not a regression. Verified only via a
  clean `npx vite build`; no live browser click-through this session (no
  DevTools automation available in this environment). Full detail:
  `activeContext.md`.
- **Student dashboard English localization (session 16)** —
  react-i18next + a dedicated `studentI18n` instance, isolated from the
  teacher panel (no new dependency or wrapping there at all). Language
  read from `students/{id}.language` (default "ru"), now editable via a
  real Settings `<select>` (added mid-session — phase 1 deliberately
  shipped without one). Every student-page component translated;
  `formatLessonDateTime`/`formatRelativeTime` gained an optional
  `locale` param (default unchanged, so every teacher-side call site is
  byte-for-byte unaffected). Typical subjects (`STATIC_SUBJECTS`, 10
  entries) and the two seeded exam-type unit labels translate via small
  dictionaries (`src/locales/subjectTranslations.js`/
  `examUnitTranslations.js`); a teacher's free-form custom subject/unit
  is never auto-translated. Student notifications are now bilingual
  **site and bots both** — `notificationMessages.js` (CommonJS `core/` +
  ESM `lib/` mirror, same pairing shape as `schedule.js`/`subjects.js`)
  builds text from `type`+`params` at render/send time instead of a
  frozen string; `createNotification`'s `target: "teacher"` path is
  completely unchanged. See [[activeContext]] for the full breakdown
  (13+ call sites converted, the `material_added` dual-phrasing wrinkle,
  `mapNotificationDoc` missing the new `params` field — same recurring
  "mapper's explicit field list is the real gate" bug class again).
- **Real timezone/notification-delivery bug found and fixed (session
  16)** — `isSlotEqual` (`functions/index.js`, gates whether the
  `syncUpcomingLessonOnScheduleChange` trigger recomputes an existing
  upcoming lesson's `date`) never compared `timeZone`, only day/time/
  duration — so a schedule re-save that only corrected a slot's missing
  timezone anchor was judged "no change" and silently never recomputed
  the lesson date, even though the UI made it look like re-saving should
  fix it. Found via live Firestore data (a temporary guarded Cloud
  Function, deployed/invoked/deleted, not guesswork) and verified
  end-to-end on the actual affected student before cleanup. See
  [[activeContext]].
- **Gamification MVP — sticker cases (session 15), stub art only** —
  students open a case (6 coins default) for a server-weighted-random
  sticker (`openCase` Cloud Function, `functions/core/gamification.js`);
  duplicates convert to +2 coins instead of a second copy. Inventory grid
  + 3 fixed decoration zones on `StudentDashboard.jsx`. Verified
  end-to-end against the real deployed backend. **Not yet live for real
  students — Firestore Rules for the 3 new collections not yet
  published.** Full detail: `changelog/2026-08-august.md`.
- **Real fixes for two bugs that looked fixed in an earlier pass but
  weren't (session 15)** — video call button (`mapLessonDoc` dropping
  `teacherId`) and schedule-time-vs-timezone display (anchor and display
  timezone were accidentally the same value). Full detail:
  `changelog/2026-08-august.md`.
- Dialog backdrop/animation consistency pass, `TeacherSelect` designed
  dropdown (session 15) — full detail: `changelog/2026-08-august.md`.
- **Session 14** — per-schedule-slot subject binding (`scheduleSlots[]`
  elements can carry their own `subject`, falls back to the student's
  first subject when unset; drives Calendar colors, per-lesson subject
  tag, auto-selected homework program), language-level (A1–C2) topic
  progression (reuses the existing `minScoreRequired` mechanic, no radar/
  backend changes), designed `TeacherPopover` topic/prototype picker
  replacing a plain `<select>`. Full detail: `changelog/2026-08-august.md`.
- **Session 13** — multi-program support (a student can hold several
  curriculum programs at once, `students/{id}/programs/{programId}`;
  pre-session-13 students have no `programs/` docs yet, migration script
  prepared but not run), free-form exam types + subjects (replaced the
  hardcoded ЕГЭ/ОГЭ/Школа enum and 2-subject list with
  `teachers/{uid}/examTypes` + a hashed-color subject palette),
  transactional `confirmReschedule`/`confirmCancellation` (race fix via
  `db.runTransaction`), client-side video-call-availability window
  (replaced a server flag + scheduler with a plain time comparison). Full
  detail: `changelog/2026-08-august.md`.
- **Session 12** — multi-tenancy Phase 4a (per-user timezone/color-theme
  Settings; fixed a hardcoded-single-teacher login bug blocking every
  teacher but the first), **Firestore Rules published, no longer a
  permissive placeholder** (surfaced and fixed a tenant-isolation bug
  class — six list/collectionGroup queries had no explicit `teacherId`
  filter; see [[systemPatterns]] for the reusable pattern), full
  timezone-handling rewrite (every date interpreted/displayed in the
  relevant *person's* own saved timezone, `Europe/Moscow` only as a
  no-value fallback — see [[systemPatterns]] for the conversion helpers),
  plus an extra-lesson Calendar-sync bug fix, `ExamRadar`'s `no_data`
  status, and a curriculum topic picker. Full detail:
  `changelog/2026-08-august.md`; scope boundary in `projectbrief.md`
  updated to reflect multi-tenancy.
- Sessions 2-11 (teacher/student auth, weekly multi-slot schedules,
  homework/materials, reschedule/cancellation flows, Telegram+VK bots,
  reminders, Google Calendar sync, VK idempotency guard, unified
  notifications funnel, balance tracker, curriculum templates (4-phase
  feature), `/app` entry point + self-service signup, two student-page
  visual migrations, teacher-panel modal-breakage root causes, Google
  Calendar disconnect, mobile-layout pass, Telegram contact-link fixes) —
  full detail archived in `changelog/2026-07-july.md` (sessions 2-8) and
  `changelog/2026-08-august.md` (sessions 9-11). All still working per
  code present; nothing here superseded.

## Known issues / open items

- **`rescheduleStatus` never clears back to `null` after a confirm
  (found session 16, not fixed)** — `syncUpcomingLessonToSchedule`'s
  `if (existingLesson.rescheduleStatus)` skip-check treats any truthy
  value, including a long-resolved `"confirmed"`, as "has an active
  reschedule, don't touch the date" — permanently freezing that lesson's
  `date` against any future schedule-driven recompute (e.g. the timezone
  fix below). Needs a decision: clear `rescheduleStatus` back to `null`
  on confirm, or narrow the skip-check to only the two `pending_*`
  values. See [[activeContext]].
- **Any student whose schedule predates the session-16 `isSlotEqual` fix
  still has a stale, wrong `lesson.date` until the teacher re-opens and
  re-saves that student's schedule once** (a no-op save is enough — the
  fix is in the trigger's diff check, not the data itself). Not
  backfilled proactively for every student. See [[activeContext]].
- **Resolved session 21: placed decoration stickers now render on the live
  dashboard** (was open since session 17's modal migration deleted the old
  placeholder zones) — see "What works" above and `activeContext.md` for
  the 5-zone implementation. Not yet confirmed against a real browser
  render (no DevTools automation in this environment) — the exact zone
  offsets are the loose end to check next session, not the rendering
  mechanism itself.
- **Gamification's 3 collections (`stickerSets`, `students/{id}/inventory`,
  `students/{id}/decoration`) now have published Firestore Rules — plain
  `allow read: if true` on all three, confirmed session 17** (root cause
  of "cases don't show up in the modal" right after the session-17 UI
  migration shipped — the modal's `subscribeToStickerSets` was getting
  `permission-denied` silently swallowed into `console.error`, so it just
  looked like empty data). Verified fixed with the established unauthenticated
  client-SDK read pattern (`techContext.md`), not just by reading the rules
  text — `stickerSets` (4 docs), a real student's `inventory` (2 items) and
  `decoration` (1 doc) all read successfully with no auth session, matching
  exactly what the student dashboard's own browser session does. No write
  rule was needed for `inventory`/`decoration` — both are only ever
  mutated through `openCase`/`saveDecoration` Cloud Functions (Admin SDK),
  never a direct client write.
- **No coin-earning mechanic exists (session 15)** — gamification spec
  only covered spending; a teacher has to grant `coinsBalance` by hand
  via Firestore Console to test the feature for now.
- **Notifications mark-as-read broken by a Rules gap (found session 14,
  fix drafted, NOT confirmed published)** — the `notifications/
  {notificationId}` rule's `allow update` was never actually written (a
  comment claimed it was "unchanged, still open" but no real `allow`
  statement existed), so every mark-as-read write silently
  permission-denied and rolled back. Rule text handed to the user; check
  next session whether it's live and mark-as-read actually sticks now.
  See [[activeContext]].
- No automated test suite in the repo.
- **Git commit hygiene, checked session 16: currently clean** — only
  `memory-bank/` had uncommitted changes at session end (session 16's
  own code changes were already committed, e.g. `1c94118` "англ язык,
  бэкенд под стикеры"). The "work sits uncommitted for many sessions"
  risk flagged repeatedly through session 9 has not recurred since —
  worth a quick `git status` check at the start of future sessions
  rather than assuming either way.
- **Migration run (session 13)**: `migrateToPrograms.js` ran — 2
  programs migrated, 2 flagged for manual review (unresolved
  `examTypeId`, disposable test data, not fixed further per user
  instruction). Old `curriculumProgress/main` docs left in place as
  backup.
- `notifications/` collection has the same list-query tenant-isolation
  shape the session-12 Rules fix applied to six other queries, but was
  explicitly left alone per user instruction — a known,
  deliberately-deferred gap, not forgotten.
- **Three distinct Cloud Functions deploy-failure classes, all
  documented in [[techContext]] with their fixes** — a CPU-quota flake
  during batch deploys (fix: retry failed functions one at a time), a
  function silently missing its `allUsers`/`run.invoker` IAM binding
  after an interrupted deploy (fix: `gcloud run services
  add-iam-policy-binding`, service name = lowercased function name), and
  a function that was simply never included in a deploy command at all
  (fix: check `firebase functions:list` before assuming a code bug).
  Check there first for any `internal`-error deploy symptom.
- Curriculum templates feature (session 7) still has no dedicated
  end-to-end manual verification pass on record (create/edit/delete a
  template, assign/replace on a student, mark topics covered, row-list
  progress display).
- `functions/scripts/migrateSchedule.js` — still unconfirmed whether the
  backfill has ever actually been run against production Firestore.
- `vkProcessedMessages/` has no TTL/cleanup — grows unbounded, one doc
  per incoming VK message.
- **Student "Отменить урок" button — long-standing, never confirmed
  resolved.** Flagged unresolved since session 4 (log evidence ruled out
  the `unauthenticated` hypothesis at the time); possibly fixed as a side
  effect of session 10's Cloud Run IAM-invoker fix (same symptom shape:
  client action does nothing, no server trace), but never explicitly
  re-tested since. Confirm with a live click-through before removing this
  line either way.

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
- Per-flow direct `sendReminderToStudent`/`sendMessageToTeacher` calls were
  consolidated into one `createNotification()` funnel once an in-app
  notification UI was needed — logging and bot-dispatch used to be the
  same call, now they're deliberately decoupled (Firestore write always
  happens, bot send is best-effort) so the in-app feed can't silently miss
  events just because a student's bot link is stale.
- `addLessonMaterial` moved from a direct client Firestore write to a
  callable specifically to let the backend trigger a notification on
  attach — otherwise would have stayed a direct write like
  `updateLessonTopic`.
