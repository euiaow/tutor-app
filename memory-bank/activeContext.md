# Active Context

_Last updated: 2026-08-27 (session 38)_

## Current work focus

### Session 38 — cascade-delete built for every tenancy level (teacher/student/group), plus a real production cleanup of 23 orphaned students left by a deleted test teacher account

The user reported the actual root cause behind "the database isn't cleaning
up": test teacher accounts had been deleted (Firebase Auth accounts removed)
at some point in the past, but **no `deleteTeacher` function ever existed at
all** — deleting the Auth account did nothing to Firestore, so every student,
lesson, program, template, token, and notification the test teacher ever
created just sat there permanently, invisible from the app (no `teachers/{uid}`
doc left to surface them anywhere) but still live in the database.

**Part 1 — cascade-delete logic, now the standing mechanism, not a one-off
fix:**
- `deleteStudent` (`functions/core/students.js`) was itself incomplete before
  this session — it only ever cleaned up `lessons`, registration tokens, bot
  sessions, Storage files, and Calendar events. Now also deletes `programs`,
  `balanceLedger`, `inventory`, `decoration`, `coinLedger` (all previously
  orphaned forever on student delete) and the student's own `notifications`,
  and removes the student from any group's `memberStudentIds` (otherwise a
  deleted student left in a group gets silently "recreated" the next time
  `ensureUpcomingGroupLessons` runs). New `keepGroupLessons` option (default
  true) leaves group-lesson mirror docs alone on a single-student delete, per
  explicit product decision — see `systemPatterns.md`'s new cascade-delete
  entry for the full mechanism and reasoning.
- Brand new `deleteTeacherAccount` (admin-only callable,
  `functions/core/admin.js` + `functions/core/teacherDeletion.js`) — the
  first-ever teacher-level cascade delete. Deletes every group, every
  student (full cascade above), curriculum templates, registration/connect
  tokens, notifications, oauth states, then `teachers/{uid}` itself
  (`db.recursiveDelete`) and the Firebase Auth account. Exposed as a
  type-to-confirm "Удалить учителя" button in a new "Опасная зона" section
  on each teacher's row in `AdminDashboard.jsx`. **This is now the only
  correct way to remove a teacher** — deleting the Auth account by hand
  (Console) still won't cascade to Firestore, reproducing the exact bug this
  session fixed.

**Part 2 — one-time production cleanup, already run and verified:** a
temporary guarded `onRequest` diagnostic (same "deploy, curl, delete"
pattern as prior sessions' `migrateToPrograms`/`isSlotEqual` diagnostics)
computed valid teacherIds as the intersection of the `teachers` Firestore
collection and live Firebase Auth users, found exactly 2 orphan teacherIds
(zero orphaned `teachers` docs themselves — the app's teacher list was
already clean), ran a `mode=report` dry-run first (reviewed with the user:
23 students + their lessons/programs/balance/gamification data, 3 curriculum
templates, tokens, ~50 notifications under one orphan teacherId; 1 stray
curriculum template under a second), got explicit confirmation, then ran
`mode=execute` — which just called the same `deleteTeacherData` cascade
`deleteTeacherAccount` uses, `deleteAuthUser: false` since an orphan by
definition has none. Verified via a second dry-run showing 0 orphans
remaining; the 2 real current teachers' data was untouched throughout. The
diagnostic function was deleted from both the deployed backend and the
codebase immediately after use, per this project's standing convention for
these temporary scripts.

**Deployed**: `functions:deleteTeacherAccount`, `functions:deleteStudent`
(updated cascade), hosting (admin panel UI). Code is not yet committed to
git — the user hasn't asked for a commit this session.

---

### Session 37 — real infrastructure bug found: `index.html` was being served from an hours-stale CDN cache, explaining why sessions 34-36's fixes "weren't visible" even after successful deploys

The user reported (across 3 separate messages) that the zone5 offset,
zone2's placement-picker fix, and the button image nudges all "weren't
showing up" despite session 36 having deployed them. Before touching any
more offsets, verified the actual deployed code first: `curl`-ed the live
site and found it was serving `index-Ed0mk9t-.css` (a session-33-era
bundle hash) while the local `dist/index.html` correctly referenced the
latest `index-Bi8jW42_.css` — the deploys were genuinely landing on
Firebase's origin, they just weren't reaching users.

**Root cause, confirmed via response headers, not guessed**:
`Cache-Control: max-age=3600` plus `X-Cache: HIT` on `index.html`, with a
`Last-Modified` over 7 hours stale — Firebase Hosting's platform default
caches HTML at the CDN edge for up to an hour, and in this case the edge
node was serving a copy well past even that stated max-age. Every code
fix since roughly session 33 had been correctly built and deployed; none
of it could reach a browser loading the page fresh until that cache
happened to expire or get evicted.

**Fix**: added an explicit `headers` block to `firebase.json` —
`Cache-Control: no-cache, max-age=0, must-revalidate` on `**` (forces
revalidation on every load, so a new deploy is visible immediately), with
`/assets/**` overridden back to `public, max-age=31536000, immutable`
(Vite's own content-hashed filenames make this genuinely safe to cache
forever — a changed file always gets a new hash/URL, so nothing stale can
ever be served from this specific path). First attempt at the header rule
only targeted `source: "/index.html"` literally and didn't apply to `/`
itself (Firebase matches headers against the *original requested path*,
and the SPA rewrite `"**" → "/index.html"` doesn't carry the header rule
through to the path being rewritten *from*) — broadened to `source: "**"`
plus the asset override, then verified both cases directly with `curl -I`
(root `/` → `no-cache`, an actual `/assets/*.css` file → the immutable
long-cache header) before declaring it fixed, not just assuming the
config was right.

**This should mean every deploy from now on is visible immediately** —
worth remembering if a future report ever again says "I deployed this,
why doesn't it show up," since this exact class of bug produces that
precise symptom and is very easy to misattribute to "the code fix must be
wrong" (which happened here — 3 rounds of user reports treated as
"still-wrong offsets" before checking whether the deploy was even
reaching browsers at all).

---

## Current work focus

### Session 36 — placement-picker zone2 was rendering off the mockup's own edge (real bug, not an offset tweak), zone5/button offsets nudged again, case-opening reel simplified to one continuous deceleration

**Real bug found and fixed: the placement picker's zone2 marker
rendered outside `MiniDashboard`'s own bounding box.** `ZONE_DEFS`' zone2
entry was `{ x: 222→was 250, w: 34 }` against a `MINI_DASHBOARD_WIDTH` of
260 — `250 + 34 = 284`, 24px past the mockup's own right edge, so the
marker visibly hung off the edge of the interactive preview (worse once
session 27's `MINI_DASHBOARD_SCALE` 1.6× made the whole thing bigger,
scaling that overflow right along with everything else). Every other
zone's `x + w` already fit inside 260 — this was the one arithmetic slip.
Moved to `x: 222` (`222 + 34 = 256`, fits with a small margin).

**zone5 (`ExamRadar`) desktop offset**: `sm:right-[68px]` →
`sm:right-[88px]` (another 20px left).

**Sticker-workshop button**: `Group 70` (mobile) shrunk another 1px
(`GROUP_70_HEIGHT_DELTA` -9→-10) and its own right offset moved 1px right
(`GROUP_70_RIGHT_OFFSET` -3→-4, independent from desktop's `Group 69`
offset since session 35).

**Case-opening reel simplified to a single continuous deceleration —
dropped the medium-speed plateau entirely, per an explicit new spec.**
Three straight sessions (29, 34, 35) each tried a fast→medium→stop shape
and each attempt introduced a fresh timing or curve bug — the user's
corrected spec this time has no plateau at all: start fast, decelerate
smoothly straight down to a stop, over (at least) 12 seconds. Rebuilt
`confirmOpen`'s spin logic from a 3-phase chained-`setTimeout`
choreography (3 different `setSpinTransition` calls, one per phase) down
to **one** `setSpinTransition` call and **one** CSS transition covering
the entire `SPIN_DURATION_MS` (still 12000) with a single easing curve,
`SPIN_EASE` = easeOutQuint (`cubic-bezier(0.22,1,0.36,1)`, a strong,
continuous fast-start deceleration across the whole duration, not just a
short final snap). No more phase ratios, no more per-phase curves, no
seam between phases for a bad curve to hide inside — genuinely simpler
code, not just a different set of numbers. The "must not come in under
12s" requirement was already handled correctly (the `setPhase("result")`
timer already padded `SPIN_DURATION_MS + 250` to land after the CSS
transition visually finishes, accounting for the double
`requestAnimationFrame` delay before the transition even starts) — kept
as `SPIN_DONE_DELAY_MS`, now a named constant instead of an inline
`+ 250`, specifically so this doesn't need re-deriving if it's ever
questioned again.

**No live browser/animation-frame verification possible in this
environment** — same standing gap. If the reel still looks wrong after
this, the *shape* is now trivial to eyeball from the single curve
(`SPIN_EASE`) alone, since there's no multi-phase math left to hide a bug
in.

---

## Current work focus

### Session 35 — zone5/button offsets diverged further, case-opening reel rebuilt from scratch to an explicit 12s timing spec

**zone5 (green square, `ExamRadar`) desktop offset**: `sm:right-[53px]` →
`sm:right-[68px]` (15px further left, mobile's `right-12` untouched).

**Sticker-workshop button image offsets diverged into two independent
constants** (`GROUP_69_RIGHT_OFFSET`/`GROUP_70_RIGHT_OFFSET`, were one
shared constant since session 32) — desktop's `Group 69` moved 2px right
(-2→-4), mobile's `Group 70` moved 1px right (-2→-3, its own new
constant) and shrunk another 3px (`GROUP_70_HEIGHT_DELTA` -6→-9 total
against the Group 69 baseline height — the user reported the session 34
shrink hadn't visibly landed, so this stacks a further reduction on top
rather than assuming the prior change was wrong and reverting it).

**Case-opening reel rebuilt from scratch, not patched again — the user
gave an explicit new timing spec after sessions 29/34's fixes still
didn't land right.** New spec: **12000ms total** (was 9000ms): starts at
fast speed; over the first 3s, speed falls smoothly fast→medium; holds
medium (constant) for the next 3s; over the final 6s, speed falls
smoothly medium→0, landing on the server result. Time ratios are exact
from that spec (0.25/0.25/0.5). Distance ratios (0.42/0.29/~0.29) are
**derived, not guessed**: phase 2's rate defines "medium" (its own
distance÷time, since it's linear); phase 1's average rate is approximated
as the mean of fast-and-medium (a smooth deceleration's average sits
roughly halfway between its endpoints); phase 3's average rate is
approximated as half of medium (decelerating from medium to a dead stop).
Converting those three average rates × each phase's own duration into a
proportion gives the distance split — a documented derivation this time,
specifically so a future correction can see *why* these numbers were
chosen instead of re-guessing from scratch again. Phase 1 keeps
`SPIN_PHASE1_EASE` (easeOutQuad) from session 34 — that curve wasn't the
problem. Phase 3 switched from easeOutQuart to **easeOutCubic**
(`cubic-bezier(0.215,0.61,0.355,1)`) — gentler/more gradual, chosen
because phase 3 is now a much longer single span (6s, half the total
spin) than before, and a "final snap" curve like easeOutQuart is tuned for
a short decisive stop, not a long, evenly-paced decline across 6 full
seconds.

**No live browser/animation-frame verification possible in this
environment** for any of these three fixes — particularly the reel, which
has now been tuned twice on reasoning alone without ever being watched
render. If the next report still says the motion looks wrong, the
distance-ratio *derivation* above (not just the numbers) is the first
thing to re-examine, since it rests on approximations ("average rate ≈
mean of endpoints") that a real easing curve won't match exactly.

---

## Current work focus

### Session 34 — button art nudged again, zone5 split desktop-only, and the real root cause of the spin's wrong motion found (bad easing curves, not bad ratios)

Three small, independent follow-ups.

**Sticker-workshop button**: `Group 70` (mobile) shrunk another 3px
(`GROUP_70_HEIGHT_DELTA` -3→-6 total against the Group 69 baseline
height), and `GROUP_69_RIGHT_OFFSET` -1→-2 (both images share this one
constant, so both desktop's `Group 69` and mobile's `Group 70` shifted
right together, as asked).

**zone5 (green square, `ExamRadar`) split desktop/mobile again** — the
first time any zone has needed a breakpoint split since session 26
unified everything. `right-12` (48px) stayed the mobile value untouched
per explicit instruction; desktop gets `sm:right-[53px]` (5px further
left) on top of it.

**Case-opening reel: root-caused for real this time — the phase
time/distance ratios from session 32 were already correct, the two
*easing curves* were badly chosen.** The user's report ("fast → decelerates
almost to zero → medium → sudden fast burst → stop") was a precise
description of what `cubic-bezier(0.16,0.84,0.36,1)` (phase 1) and the
original `cubic-bezier(.12,.85,.18,1)` (phase 3, unchanged since session
18) actually do: both have a control point with y very close to 1 reached
very early in x — e.g. phase 1 hits 84% of its own distance within just
16% of its own time. That's not "smoothly decelerate to a medium/zero
speed," it's "sprint almost to the finish line immediately, then crawl
through what's left" — which for phase 1 reads as "decelerates almost to
a dead stop" (matching the report exactly) and for phase 3 reads as a
late speed burst once its own crawl phase catches up to the visually
larger remaining distance. **Fix: swapped both bespoke curves for
well-known, much gentler named easing functions from easings.net**
instead of guessing another bespoke one — `SPIN_PHASE1_EASE` = easeOutQuad
(`cubic-bezier(0.25,0.46,0.45,0.94)`, mild/roughly-proportional
deceleration) and `SPIN_PHASE3_EASE` = easeOutQuart
(`cubic-bezier(0.165,0.84,0.44,1)`, a confident final snap to a stop but
nowhere near as front-loaded as the original). Phase 2 stays linear,
untouched. The lesson for next time a spin/motion complaint comes in:
check the actual *shape* of any bezier curve in use (where does it cross
50%/80%/90% of x) before assuming the phase time/distance split is what's
wrong — a curve can make a perfectly reasonable ratio *look* completely
different from what it should.

**No live browser/animation-frame verification possible in this
environment** for any of the three fixes.

---

## Current work focus

### Session 33 — greeting emoji dropped on mobile, sticker-workshop button's desktop art reverted (session 32 shouldn't have touched it), mobile button layout fixed properly

Direct correction of 2 of session 32's changes, per the user's real-device
follow-up.

**Greeting emoji (✌️) hidden on mobile only.** It was baked directly into
the `header.greeting` translation string in both locales (`"Привет,
{{name}}! ✌️"` / `"Hi, {{name}}! ✌️"`) — taking real line-height on a
narrow phone for no benefit. Moved it out of the translated string
entirely (both `src/locales/{ru,en}/student.json` now end at the
exclamation mark) and into its own `<span aria-hidden="true" className="hidden sm:inline">`
right after the heading text in `DashboardHeader` — desktop is unaffected
byte-for-byte, mobile just never renders it. Cleaner than trying to strip
a fixed suffix out of translated text at render time, and doesn't need a
second translation key.

**Sticker-workshop button: desktop art reverted to Group 69 — session 32
was wrong to touch it at all.** The original ask (session 29) was
specifically about the *mobile* overlap; session 32 swapped desktop's art
too, which the user explicitly did not want. `sticker-workshop-button.jsx`
now renders **two** `<img>` elements — `group69` (`hidden sm:block`,
exactly the original height/offset constants, byte-for-byte the pre-
session-29 desktop behavior) and `group70` (`block sm:hidden`, mobile-
only) — instead of one image swapped globally.

**Mobile button layout, corrected (session 32's mobile version was "right
idea, wrong execution," per the user):**
- Title shortened to "Стикеры"/"Stickers" on mobile only — new
  `gamification.portalTitleShort` key in both locales, desktop keeps the
  full "Стикеры и кейсы"/"Cases and stickers" via the existing
  `portalTitle` key unchanged.
- The coin-balance badge moved to its own line under the (now shorter)
  title on mobile, instead of squeezed onto the same line — two separate
  title-row `<div>`s now exist (`hidden sm:flex` for the desktop
  title+badge-inline layout, `sm:hidden` for the mobile stacked one),
  rather than one row trying to serve both layouts.
- `Group 70`'s mobile height nudged down another 3px
  (`GROUP_70_HEIGHT_DELTA = -3`, added to the existing
  `buttonHeight + GROUP_69_HEIGHT_OFFSET` calculation), same top alignment
  and right offset as before — a pure size tweak, no positioning logic
  changed.

**No live browser verification possible in this environment** — same
standing gap as every prior gamification session.

---

## Current work focus

### Session 32 — mobile-only zone1 restructure (real device testing again), zone5 nudged, sticker-workshop button art swapped + text shortened on mobile, case-opening reel timing corrected for real this time

Three independent follow-ups, all frontend-only, deployed hosting each
round (no backend changes).

**zone1 needed a genuinely different mobile treatment, not just a
different offset.** Real-device testing (screenshots) showed the kitten
sticker still partially covering the greeting name on a narrow phone —
confirmed the standing risk flagged since session 26 (zone1 uses a fixed-
px offset that doesn't scale down against a narrower header). Rather than
chase another guessed offset, restructured the mobile case entirely: new
`DashboardHeader` component (`StudentDashboard.jsx`) — pulled out of the
inline header JSX specifically because `useGamification()` can't see a
`<GamificationProvider>`'s value from within the *same* render call that
creates that provider element; it needs a real descendant component. When
`decoration.zone1` is occupied, `DashboardHeader` **hides "Добро
пожаловать" and drops `truncate` on the greeting heading** on mobile only
(both revert via `sm:` at ≥640px) — freeing vertical space and letting a
long name wrap onto a second line instead of being physically covered,
which needed no i18n changes since it's the browser's own natural word-
wrap, not a hardcoded line split. zone1 itself now renders **twice**:
unchanged inside `NextLessonPlate` but `hidden sm:block` (desktop-only,
exactly as sessions 25/26 left it — the user confirmed desktop already
looks right), and a new second instance directly inside `DashboardHeader`
(`sm:hidden`, mobile-only), anchored to the header itself and positioned
to clear the gear+avatar cluster (`right-[136px]`, the same 132px-cluster
clearance math session 25 originally derived, reused here because the
header — unlike the lesson card — has no wider link below it to also
clear).

**zone5 (on `ExamRadar`) nudged left and slightly up** per direct
feedback that it was the one sticker still slightly out of place on both
breakpoints (`bottom-[-56px] right-12`, was `bottom-[-68px] right-6`).

**Sticker-workshop button: art swapped, text shortened on mobile.** The
button's own art (`Group 69.png`, pinned to its right edge sized off the
button's real rendered height with no width cap) could stretch to ~2/3 of
the button's width on some renders and run into the title/balance text.
Rather than algorithmically cap the image's width, the user supplied a
pre-cropped narrower asset (`Group 70.png`, ~20-30% narrower at the same
height) — swapped in directly (`sticker-workshop-button.jsx`), same
height/offset constants reused since only the crop changed, not the
vertical fit. Paired with the user's own explicit priority ("shrink text
first, only on mobile"): the hint line ("Открой кейс и собери
коллекцию") is now `hidden sm:block`, and the title+badge row gained
`min-w-0`/`truncate`/`shrink-0` in the right places so a still-tight fit
truncates the title gracefully instead of overflowing, rather than a
second asset-side fix.

**Case-opening reel timing corrected for real — the previous "3-phase
spin" (session 18) had the wrong shape entirely.** The user's own
description of the bug: it looked like half the spin ran at a flat medium
speed, then accelerated and decelerated near the end — because phase 1
used an *ease-in* curve (`cubic-bezier(.55,0,.85,.35)`, accelerating up
*from rest*) but was so short (8% of total time) that the rev-up was
barely visible, making the following medium-speed linear plateau look
like the spin's actual starting state. Corrected per explicit spec: the
reel must already be at full/fast speed the instant it starts (no rev-up
from rest at all), decelerate down to a steady medium plateau, hold that
medium speed for roughly half the total spin time, then decelerate a
second time down to an exact stop on the server result. Implementation:
phase 1's easing curve flipped from ease-in to ease-out
(`cubic-bezier(0.16,0.84,0.36,1)`) so it *starts* fast and *ends* at the
plateau's speed instead of the reverse; `SPIN_PHASE1_TIME_RATIO`
0.08→0.15, `SPIN_PHASE2_TIME_RATIO` 0.6→0.5 (the explicit "half the total
time" requirement), `SPIN_PHASE1_DIST_RATIO` 0.06→0.32,
`SPIN_PHASE2_DIST_RATIO` 0.62→0.45 (phase 1 needs to cover proportionally
more distance per unit time than before, since it's now the *fastest*
phase rather than the slowest one ramping up). Phase 2 stays linear,
phase 3 keeps its existing ease-out-to-a-hard-stop curve unchanged — only
phase 1's curve direction and all three phases' time/distance shares
changed.

**No live browser verification possible in this environment** for any of
the three fixes — the zone1 restructure's real behavior on a narrow
phone, the button's actual fit with the new asset, and the reel's real
perceived timing are all reasoned from the report/spec, not measured
against a running page or a real animation frame trace.

---

### Session 30 — quick follow-up polish on session 29's group work

Small, frontend-only (no backend redeploy needed):
1. Group's hourly rate now **sums** every member's own rate (was min–max range) — matches how group income is actually billed (each attendee their own rate, per finance-section.jsx's computeWeeklyIncome).
2. Student's own info panel "Предмет" row (student-row.jsx) now renders as colored tag pill(s), matching the group info panel's own subject tag — was plain text via `SummaryListRow`.
3. The group program's template-name/percent/Заменить/Удалить row moved to sit **above** the Темы/Прототипы tiles (was below), now bold with a real `ProgressBar` under it instead of just inline percent text.
4. Group's "Следующие занятия" list rebuilt to match the student's own `UpcomingLessonsListDialog` exactly: the real loaded occurrence renders as a full `UpcomingLessonCard` (name/tags/date/reschedule/cancel — group-aware since session 29 already taught it `lesson.isGroupLesson`), and further not-yet-created weekly occurrences render as read-only `VirtualLessonRow` placeholders (`getVirtualOccurrences`, exported from `upcoming-lessons-list-dialog.jsx` for reuse) — was a much plainer one-line-per-occurrence `GroupLessonRow` (now deleted).

**Real bug caught and fixed while doing this**: reusing `UpcomingLessonCard` from `groups-section.jsx` would have created a circular import (`upcoming-lesson-card.jsx` already imported `GroupRescheduleDialog`/`GroupCancelDialog` FROM `groups-section.jsx`). Fixed by relocating those two dialogs into `group-lesson-dialog.jsx` (which neither of the other two files imports), so the dependency graph stays one-directional: `groups-section.jsx` → `upcoming-lesson-card.jsx` → `group-lesson-dialog.jsx`.

`mapGroupLessonMirror` (`firebase/groups.js`) extended with the fields `UpcomingLessonCard` reads unconditionally but a group mirror never actually has (`homework.submission`, `rescheduleStatus`, `cancellationStatus`, `rescheduleProposedDate`, `rescheduled`) — present as empty/null rather than omitted, plus real ones it was missing (`teacherId`, `groupName`, `groupSlotIndex`, `isGroupLesson: true`).

Deployed: hosting only (no backend logic changed this round).

### Session 29 — Group lessons collapsed to one card (not N per-member duplicates), group program deduplication against individual assignments, group detail page redesigned to match the student page, group deletion now cascades program cleanup

Direct follow-up to session 28's group-lesson rearchitecture, closing 5 gaps the user found in real use.

1. **"+ Создать группу"/"+ Добавить ученика" now both use the `Plus` icon component**, not a literal "+" text character — trivial but requested explicitly for visual consistency between the two buttons (`TeacherDashboard.jsx`, `groups-section.jsx`).

2. **"Ближайшие уроки" was showing N duplicate cards for one group session (one per member)** — session 28 made group lessons real per-student mirror docs so they'd flow through the same feed as individual lessons "for free", but never collapsed them back into one card for display, so a 3-person group session showed as 3 near-identical rows. Fixed with `collapseGroupLessons()` (`TeacherDashboard.jsx`) — groups the raw `upcomingLessons` array by `groupLessonKey` into one synthetic entry before clustering, same "one card per session, not per attendee" shape the group row's own "Следующие уроки" list (`subscribeToUpcomingGroupLessonOccurrences`) already had. `UpcomingLessonCard` now shows the group name as the card's title (not a member's name) plus a member-count badge when `lesson.isGroupLesson`, and hides the single-student `ContactIconButton` for it (contacting "the group" isn't a thing).

3. **Group detail page redesigned to match the student row's own expanded layout** (`groups-section.jsx`): `grid md:grid-cols-3` — `GroupInfoPanel` (1/3: schedule, subject, participants, program name, hourly rate summary, "Редактировать") + the program's topics/prototypes tiles (2/3, reusing `CurriculumTile` — see point 4). Every sub-block now has `border border-glass-border` (previously `glass-tile` alone with no border, which the user said "all blends together white-on-white") — applies to the info panel and both curriculum tiles.

4. **Real architecture fix — a student individually assigned a subject AND in a group teaching that same subject no longer gets two silently-diverging program docs.** The group's program was a separate stored copy under `teachers/{uid}/groups/{groupId}/programs` (session 22/24) — deleted entirely. A group now just remembers `programTemplateId`; assigning it (`functions/core/groups.js`'s rewritten `assignGroupProgram`) reuses a member's existing program if they already have one for that subject (tags it `sourceGroupId`, `createdByGroup: false` — it's still fundamentally *their* data), or creates a fresh one via `assignCurriculumTemplate` (tagged `createdByGroup: true` — this copy exists *because of* the group). The group's own "progress" is computed at read time (`getGroupProgramView`, `firebase/groups.js`) by intersecting every linked member's own program — a topic reads "covered by the group" only once every member's own program has it checked, and a student's own extra progress beyond that naturally shows as higher on their own page, exactly the "групповой прогресс = минимум, у ученика может быть больше" the user asked for. Marking a topic covered from the group view (`setGroupCurriculumItemCovered`, new signature: fans out to every linked member's own program via the existing `setCurriculumItemCovered`) now genuinely reaches each student's real progress — it never did before (the group-shared copy was a dead end nothing else read).

5. **Deleting a group now cleans up the programs it assigned — it never did before** (only the narrower "delete just the program" path did). `deleteGroup` runs the same unlink-or-delete rule `deleteGroupProgram` uses: a member's own pre-existing program is unlinked (survives, keeps all progress), one that only exists because of the group is deleted with it.

**Backend signature changes** (both call sites updated, not backward-compatible — fine, single-teacher app, no migration needed): `reassignGroupProgram(groupId, templateId)` and `deleteGroupProgram(groupId)` both dropped their now-meaningless `programId` parameter (a group has at most one program at a time now, matching its own single subject — no list to pick from).

**Verified for real** (deployed-and-deleted diagnostics, both against live throwaway data): the lesson-mirror pipeline (create/reschedule/complete/extra/cancel, all correct) and the program dedup/propagation pipeline specifically — student1 pre-assigned individually, student2 fresh via the group: after `assignGroupProgram`, student1's program count stayed at 1 (reused, not duplicated) while student2 got a real new one; student1's own prior progress survived untouched; marking a topic via the group flow propagated to both members' real programs; deleting the group left student1's program alive and unlinked (progress intact) while deleting student2's group-only copy entirely.

Deployed: functions, hosting (no new Firestore indexes needed this round — `getGroupProgramView` is pure client-side aggregation over each member's own already-indexed `programs` subcollection, no new query shape).


### Session 28 — Group-program cascade-delete: root-caused (not a bug) + Group lessons rearchitected as real per-student mirror docs

**Part 1 — investigation, no code change needed.** User reported deleting a group's program still left it on each member. Root-caused via production logs: the `sourceGroupProgramId`-stamping fix (session 24) genuinely works — but the specific real programs the user tested were assigned at 04:36/05:28, and the fix's revision didn't deploy until 05:58 that same session. Those 4 already-existing student program docs simply predate the fix and have no way to be traced back to a group program retroactively. New assignments (post-05:58) cascade-delete correctly — confirmed by a live diagnostic. No code changed for this part.

**Part 2 — real architecture change, per explicit user request.** User asked why group lessons "sit obscure" from the rest of the app (separate reschedule/cancel model with no confirm handshake, own dashboard row type instead of appearing inline in "Ближайшие уроки", own Calendar/reminder/notification code paths) and asked for group lessons to literally duplicate into each member's own schedule. Agreed direction after 3 clarifying answers: reschedule/cancel is teacher-only and applies to the whole group at once (no per-student override); one shared Calendar event per occurrence (unchanged); notifications reuse the *existing* individual-lesson delivery functions so language/timezone always resolve correctly, with no separate/duplicate reminder sent for the same window.

**What changed**: A group lesson is no longer its own doc under `teachers/{uid}/groups/{groupId}/lessons` — creating one now fans out one real `students/{studentId}/lessons/{id}` "mirror" doc per member (`functions/core/groups.js`, reusing `createUpcomingDraft` from `core/lessons.js`), tagged `isGroupLesson`, `groupId`, `groupLessonKey` (a fresh `randomUUID()` tying one occurrence's N mirrors together — no single doc is "the" lesson anymore), `groupSlotIndex`, `subject`, `groupName`. `slotIndex` on every mirror is always `null` so it can never collide with that same student's own personal schedule-slot bucketing — closed via a real fix to `bucketUpcomingBySlot` (`core/lessons.js`) which used to default a non-numeric `slotIndex` into bucket 0 (a latent bug for extra lessons too, not just new for groups).

Because mirrors are real `students/{id}/lessons` docs, they now show up **for free** everywhere an individual lesson already does: the teacher's "Ближайшие уроки" feed (`subscribeToUpcomingLessons`), all 3 reminder tiers (`dailyReminderMidday/PreLesson/TenMin` — the old parallel `sendGroupReminder`/`forEachUpcomingGroupLesson` machinery in `functions/reminders.js` is gone, ~150 lines), weekly income (`subscribeToIncomeLessons` — `subscribeToIncomeGroupLessons`/`computeWeeklyGroupIncome` in finance-section.jsx deleted, would have double-counted otherwise), the student's own "next lesson"/history/materials (`StudentDashboard.jsx`'s old `subscribeToNearestGroupLesson`/`getGroupLessonsForStudent` dual-source merge deleted — one query now, not two), and `recordHomeworkSubmission`'s "attach to nearest lesson" logic (the `findNearestUpcomingGroupLessonForStudent` branch deleted — `getNearestUpcomingLesson` alone already sees mirrors).

Topic/assignment/material edits on a group lesson are **not** special any more — `GroupLessonDialog` fans the exact same `updateLessonTopic`/`updateHomeworkAssignment`/`addLessonMaterial`/`removeLessonMaterial` (`firebase/lessons.js`) out to every member's mirror, once each, instead of writing to one shared doc — each member gets their own properly-localized notification for free. Reschedule/cancel/complete/create-extra remain group-level orchestration (`rescheduleGroupLesson` — renamed from `proposeGroupReschedule` since it's immediate, not a proposal; `cancelGroupLesson`; `completeGroupLesson` — reuses `completeLesson` per attendee verbatim, not a reimplementation; `createExtraGroupLesson`), all keyed by `groupLessonKey`, all fanning a Firestore write out to every mirror + resolving the one shared Calendar event off any single mirror (they all carry an identical copy of the same `googleEventId`).

**Safety guard**: `proposeReschedule`/`proposeCancellation`/`cancelLessonDirectly` (`core/lessons.js`) now throw `failed-precondition` (`assertNotGroupMirror`) if called on a doc with `isGroupLesson: true` — protects every entry point (bot included) from one student's individual "перенести"/"отменить" action desyncing their mirror from the rest of the group, without needing to audit/patch every bot menu individually.

**Notifications**: `reschedule_confirmed`, `lesson_cancelled_by_teacher`, and `extra_lesson_assigned` (`functions/core/notificationMessages.js` + hand-mirrored `src/lib/notificationMessages.js`) now accept an optional `groupName` param and switch to group-flavored wording when present — the 4 dedicated `group_lesson_rescheduled`/`group_lesson_cancelled`/`group_lesson_completed`/`group_extra_lesson_assigned` builders were deleted as redundant. `lesson_reminder_midday/preLesson/lesson_soon` already had `groupName`-aware wording from session 17, unchanged.

**Frontend**: `UpcomingLessonCard` (shared by the teacher dashboard and the student-row "Следующие уроки" dialog) now detects `lesson.isGroupLesson` and routes its click/reschedule/cancel actions to `GroupLessonDialog`/`GroupRescheduleDialog`/`GroupCancelDialog` (the latter two newly exported from `groups-section.jsx`) instead of the individual ones, and shows a "Группа: {name}" badge — a group lesson now renders as a normal-looking lesson card inline in the same list, sorted by date alongside individual ones, not as a separate obscure block at the end (this was the user's core visual complaint). `GroupLessonDialog` itself was rewritten to operate on the array of mirrors (one-time load via new `getGroupLessonMirrors(teacherId, groupLessonKey)`) instead of one doc with an `attendees` map. `groups-section.jsx`'s `GroupLessonsList`/`GroupUpcomingLessonsDialog` now source from `subscribeToUpcomingGroupLessonOccurrences` (collapses N mirrors per occurrence down to one row via `groupLessonKey`) instead of the old lessons subcollection.

**Indexes**: two new composite indexes (`{teacherId,groupId,status}`, `{teacherId,groupLessonKey}`) plus two field-overrides (`lessons`/`groupId` and `lessons`/`groupLessonKey`, both `COLLECTION_GROUP` ascending) — collectionGroup queries need an explicit index even for a single equality field, confirmed the hard way when the live diagnostic below failed until the override finished building. The old dead `memberIds array-contains + status` index was removed from `firestore.indexes.json` (not force-deleted remotely, harmless leftover).

**Verified for real**: a temporary diagnostic (deployed, invoked, deleted) created 2 throwaway students + a group with a real weekly schedule slot, called `ensureUpcomingGroupLessons` (confirmed 2 mirrors created, `slotIndex: null`, correct `groupSlotIndex`/`subject`), `rescheduleGroupLesson` (confirmed both mirrors' `rescheduled` flipped true), `completeGroupLesson` with different per-student attendance (confirmed both mirrors independently completed with their own attendance/homeworkDone), confirmed the next occurrence auto-created, `createExtraGroupLesson` (confirmed 2 mirrors, `isExtraLesson: true`), and `cancelGroupLesson` on it (confirmed both cancelled) — all real, all correct, no data left behind afterward. Migration of pre-existing old-shape group lesson data was explicitly declined by the user ("не важны"); a one-off cleanup deleted 0 leftover docs (this teacher's group had none).

Deployed: functions, firestore indexes, hosting.

---

### Session 31 — Color-theme system rearchitected as a real registry (background image + accent + 3 text colors), plus 5 real bugs found and fixed along the way

User asked to check the existing pink/amber color-theme feature against a
new target architecture: a theme should be defined by a background image +
accent color (+ fixed heading/subheading/text colors), addable without
touching CSS by hand. The existing system was the opposite — two color
palettes fully hand-tuned as ~30 hardcoded CSS variables each
(`.teacher-theme`/`.amber-scope` in `index.css`), the theme id list
duplicated across CSS/frontend/backend, and the teacher's own theme picker
literally `disabled` (never wired up despite the CSS already existing).

**New architecture**: `src/lib/themes.js`'s `THEME_REGISTRY` is the single
source of truth — each theme is exactly 5 author-facing fields: `id`,
`label`, `radius`, `backgroundImage` (a `/bg/...` public path or `null`),
`accent`, `heading`, `subheading`, `text`. `src/lib/apply-theme-styles.js`
(`applyThemeRegistry()`, called once in `main.jsx` before React mounts)
turns each entry into a tiny runtime-injected `<style>` rule —
`.{cssClassName} { --accent-color; --heading-color; --subheading-color;
--text-color; --theme-bg-image; --radius; }` — nothing more. **All** the
~20 other tokens any component actually reads (`--card`, `--border`,
`--shadow-*`, `--gradient-*`, decorative blob gradients, `--rose-deep`,
etc.) are derived from just those 4 colors in ONE shared block in
`index.css` (`.themed`, replacing the old `.teacher-theme`/`.amber-scope`
duplication) via CSS relative-color syntax — `oklch(from var(--accent-color)
L C h)` reuses the accent's own hue while choosing a fresh lightness/chroma
per surface. Adding a theme is now a pure data change in `themes.js` (plus
a matching id in `functions/core/themes.js`'s `VALID_THEME_IDS`, since the
backend validates `colorTheme` server-side in `updateStudentSettings` and
can't import the frontend's ESM registry directly) — confirmed for real
this session when the user added a third theme ("blue") with zero CSS/
component edits needed. Teacher and student now share the exact same
registry/mechanism (one theme system for both roles, per explicit
decision) — the teacher's picker (`settings-dialog.jsx`) was un-disabled
as part of this.

**Real bugs found and fixed** (all via user testing after each deploy —
this environment has no browser to catch these directly):
1. `--primary-foreground: oklch(0.99 0.005 h)` referenced the bare `h`
   (hue) channel *outside* an `oklch(from ...)` context, where it's not a
   valid value at all — this silently invalidated the whole declaration,
   so button/icon text meant to be white fell back to default black on
   every accent-colored surface. Fixed to a literal `oklch(0.99 0.005 90)`.
2. `--gradient-warm` was declared ONLY at `:root`, never per-theme — every
   student-page accent button/icon/progress-bar/tag that reads it
   (`exam-radar.jsx`, `lesson-history.jsx`'s "warm" badge, several
   `StudentDashboard.jsx` buttons) stayed hardcoded orange regardless of
   the chosen theme. Added a derived `--gradient-warm` to `.themed`.
3. `StudentGrainBackground` (`src/components/student-grain-background.jsx`)
   unconditionally hardcoded `url('/bg/gr21.jpg')`, painting over the
   theme's own `--theme-bg-image` entirely — background never changed with
   the theme no matter what. Fixed to read
   `var(--theme-bg-image, url('/bg/gr21.jpg'))` (the literal URL is now
   only a fallback for `LoginScreen`, rendered before the student's own
   theme is even loaded) and mounted a second instance *inside* the
   `.themed` root in `StudentDashboardContent` (CSS custom properties only
   resolve for descendants of the class that sets them — the original
   instance lives in an outer wrapper that isn't one). Amber's own
   registry entry was given `backgroundImage: "/bg/gr21.jpg"` explicitly to
   preserve the pre-existing default look.
4. `GroupLessonDialog` and `HomeworkLessonDialog` (`components/teacher/`) —
   both portaled straight to `document.body` via `DialogPrimitive.Portal`
   — had a **literal hardcoded** `className="teacher-theme themed"` on
   their backdrop/popup, forcing the pink theme regardless of what the
   teacher actually picked in Settings. Every other portaled
   dialog/popover in the codebase already called `useThemeClass()` for
   exactly this reason (`TeacherDialogContent`/`TeacherPopoverContent` in
   `theme-ui.jsx`) — these two were simply missed when `useThemeClass()`
   was introduced. Fixed to match the established pattern. This is why a
   lesson card's own icons/buttons looked "unchanged" after a theme
   switch — the card itself was already correctly themed, but the dialog
   it opens on click wasn't.
5. `ru`/`en` `student.json`'s `settings.colorThemeOptions.pink`/`.amber`
   keys held stale hand-written labels ("Янтарная (ученическая)" etc.) that
   shadowed the registry's own (more current) `label` field via i18n's key
   lookup — teacher (no i18n layer) showed the fresh registry label,
   student (reads through `t(..., {defaultValue: theme.label})`) showed
   the stale one, so the same theme displayed two different names on the
   two dashboards. Removed the stale keys entirely — `theme.label` is now
   the single source of truth on both sides (a theme need never touch
   locale files at all, only gets one if someone deliberately wants an
   English-specific name later).

**Defensive fix, not a confirmed-live bug**: added a same-value fallback
for `--accent-color`/`--heading-color`/`--subheading-color`/`--text-color`
directly inside `.themed` itself, guarding against the specific CSS
failure mode where an unresolvable `var()` reference makes a custom
property "guaranteed-invalid" — that invalidity silently propagates through
every token derived from it, collapsing a non-inherited property like
`background-color` down to its own initial value (**transparent**, not any
visible fallback color) rather than erroring visibly. Real unlayered
per-theme rules always win over these safety-net values regardless of
source order (an unlayered rule always beats one inside `@layer base`,
where `.themed` lives) — see `systemPatterns.md`'s new theme-registry entry
for the full mechanism.

**Also this session**: added a `TeacherSelect` for "Тип шкалы" when
creating a new exam type (`curriculum-section.jsx`) — was still a native
`<select>`, the last one in that file.

**Deploy discipline reminder, surfaced directly by user confusion this
session**: editing a local file (even `themes.js`) never updates the live
site by itself — `npm run build`/`vite build` only writes to the local
`dist/` folder. Seeing changes on the real site requires an explicit
`firebase deploy --only hosting` afterward, and if a Cloud Function's own
validation set changed too (e.g. `VALID_THEME_IDS` for a new theme id),
also `--only functions:<name>` for whichever callable enforces it (here,
`updateStudentSettings` — the teacher's own `colorTheme` write is a direct
client Firestore update via `firebase/teachers.js`, so it never needs a
function redeploy for a new theme id, only the student-facing callable
does).

Deployed across 3 rounds this session: hosting + `functions:updateStudentSettings`
(registry rollout + blue theme), then hosting again (the 5 bug fixes
above).

---

## Older sessions archived

Sessions 16-27's full write-ups (i18n rollout, gamification MVP + Sticker
Workshop phases 1-2 and its visual-polish/positioning follow-ups through
session 27, group lessons v1 through the 11-item follow-up round) moved to
`changelog/2026-08-august.md` (sessions 16-23 archived 2026-08-23; sessions
24/26/27 archived 2026-08-24 — session 25 was already archived there
separately) to keep this file focused on current work — durable patterns
from them already live in `systemPatterns.md`/`progress.md`/
`techContext.md`. See `progress.md`'s own session-by-session summary for
what shipped in each.
