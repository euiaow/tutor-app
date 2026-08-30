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

## Older sessions archived

Sessions 16-27's full write-ups (i18n rollout, gamification MVP + Sticker
Workshop phases 1-2 and its visual-polish/positioning follow-ups through
session 27, group lessons v1 through the 11-item follow-up round) moved to
`changelog/2026-08-august.md` (sessions 16-23 archived 2026-08-23; sessions
24/26/27 archived 2026-08-24 — session 25 was already archived there
separately). Sessions 28-33 (group lessons follow-up round, color-theme
registry rearchitecture) archived there too, 2026-08-27, to keep this file
focused on current work (sessions 34-38 now kept inline) — durable patterns
from all of these already live in `systemPatterns.md`/`progress.md`/
`techContext.md`. See `progress.md`'s own session-by-session summary for
what shipped in each.
