# Active Context

_Last updated: 2026-08-23 (session 30)_

## Current work focus

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



Small, fast follow-up to session 26. Two independent asks.

**zone1 further left.** `right-[190px]` → `right-[230px]`
(`NextLessonPlate`, `StudentDashboard.jsx`) — a plain further nudge in the
same direction session 26 already established was correct, no new
reasoning needed.

**Placement picker enlarged to be the tab's main visual focus
(`sticker-workshop-modal.jsx`).** The user's framing: an average student
will place close to all 5 zones, so the "ГДЕ РАЗМЕСТИТЬ" panel — until now
a small 318px-wide side panel next to the sticker inventory grid, with its
`MiniDashboard` preview capped at `maxHeight:300` and force-scrolling —
should dominate the tab's space instead of playing second fiddle to the
inventory list. New `MINI_DASHBOARD_SCALE = 1.6` constant scales the whole
mockup+zone-marker subtree via a CSS `transform: scale()` wrapper, rather
than hand-multiplying every one of `MiniDashboard`'s and `ZONE_DEFS`' hand-
authored pixel values — everything inside (the mockup's rects/lines, each
zone's absolute-positioned marker, the `StickerFrame` thumbnails, the
label text) stays authored at the original 260×470 base size and scales
uniformly as a unit; click hit-testing works correctly through a CSS
transform so `onClick={() => setSelectedZone(z.id)}` needed no changes.
Panel width now derives from the scaled mockup size
(`MINI_DASHBOARD_WIDTH * MINI_DASHBOARD_SCALE + 38`) instead of a hardcoded
`318`; the inventory grid to its left changed from a growing
`flex:"1 1 320px"` to a fixed, non-growing `flex:"0 1 240px"` so it stops
competing with the picker for leftover row space. The old `maxHeight:300`
scroll cap (sized for the small pre-scale mockup, would have clipped most
of a 1.6×-scaled one) became `maxHeight:"72vh"` — generous enough that the
now-larger mockup should rarely need its own internal scrollbar, with a
viewport-relative cap still there as a safety net rather than removed
outright.

**No live browser verification possible in this environment** — the
panel's real proportions at the modal's actual 1040px-wide container, and
whether `72vh` is the right cap on a real device, are unconfirmed against
a running page.

---

## Current work focus

### Session 26 — Sticker positions corrected again after real user testing (root-caused stacking-order bug), one-sticker-one-slot enforced, Sticker Workshop modal made responsive

Direct follow-up to session 25 — the user tested the actual deployed page
(not just reviewed screenshots) and reported specific remaining overlaps,
then mid-session added an unrelated but adjacent request: the case-picker
modal itself had no mobile layout at all.

**Anchor/position corrections, desktop (screenshots showed real overlaps):**
- `zone1` ("kitten"): was landing on the "Посмотреть все уроки" link,
  which turned out to be *wider* than the header's own gear+avatar cluster
  session 25 sized the clearance against — the link's text extends further
  left than the icons above it, so clearing only the icons wasn't enough.
  Moved further left and higher (`top-[-104px] right-[190px]`, was
  `top-[-72px] right-[140px]`).
- `zone2` ("pretty soul"): user's own correction — "почти целиком в блоке"
  (should sit almost entirely *inside* the card, not mostly hanging past
  its right edge as session 25 had it). Changed from a `right:-70px`
  outside-the-border offset to `right:8px`, a small *inset*.
- `zone3` ("МГУ", on `GoalCard`): user's correction — should overlap the
  notifications banner above *more*, but must never touch the "Русский
  язык" title or the "Заполнить" button, both of which span nearly this
  card's entire height in its no-goal state (title left, button far
  right — there's no safe vertical band to dip into at all). Pushing the
  offset more negative (`top-[-84px]`, was `-54px`) fixes both at once:
  less of the sticker reaches down into the card in the first place.
  Shifted right too (`left-[52%]`, was `28%`) to clear both the title and
  stay left of the button.
- **`zone4`/`zone5` no longer ever render on `CurriculumProgressCard`** —
  the user was explicit: only the `ExamRadar` card should ever carry a
  sticker, never the plain no-goal progress card. Session 25's
  `showDecoration={index === 0}` was wrong for this — for a student whose
  *first* program has no goal (this test student's "Русский язык"), index
  0 renders `CurriculumProgressCard`, not `ExamRadar`, so the sticker was
  landing on the wrong card by construction, not just a wrong offset.
  Fixed by computing `firstExamRadarIndex = programBlocks.findIndex(b =>
  b.hasGoal && b.metrics)` in `StudentDashboard.jsx` and gating `ExamRadar`
  on `index === firstExamRadarIndex` instead — `CurriculumProgressCard`
  lost its `showDecoration` prop entirely, by design, not an oversight.
- **Root-caused a real stacking-order bug, not just an offset**: zone5 (on
  `ExamRadar`) was rendering *behind* the next card down (`MaterialsLibrary`
  or whatever program block follows). A `position:relative` ancestor with
  no `z-index` of its own doesn't win a stacking comparison against a
  later DOM sibling, no matter what z-index its own overflowing child
  carries — the child's `z-10` only out-ranks other elements *inside that
  same stacking context*, not a separate sibling section entirely. Fixed
  by adding `z-10` to `ExamRadar`'s own `<section>` (`relative z-10`), not
  just to the `DecorationZone` inside it. This only matters for
  *bottom*-overlapping zones reaching into a *later* sibling — top
  overlaps into an *earlier* sibling already win by plain DOM order, no
  fix needed there (confirmed this is why zone1/zone3/zone4's top overlaps
  never showed this symptom). Also nudged zone5 further down per the
  user's request (`bottom-[-68px]`, was `-56px`).
- **Unified every position to one value for all breakpoints** (dropped
  every `sm:` split introduced in session 25), per the user's own explicit
  direction after testing on a real phone — confirmed zone4/zone5's
  existing *mobile*-specific offsets already looked correct there, and
  said a single set of offsets plus the existing `--sticker-max` responsive
  size (unchanged, still 130px/70px) would be enough. Not fully
  width-safe in principle for a very narrow phone (zone1/zone2 use fixed
  px offsets that don't scale down with a narrower header, unlike zone3/
  zone4's percentage-based ones) — accepted deliberately on the user's own
  real-device confirmation rather than re-litigated with more untestable
  guesses.
- Fixed rotation angles (`decoration-zone.jsx`) were already correct from
  session 25 (+3/-5/+2/-4/+5) — untouched this session.

**One-sticker-one-slot enforced (`sticker-workshop-modal.jsx`).** Nothing
previously stopped the same inventory item from being written into
multiple zones — `placeArmed(zoneId)` now looks up every other zone
(`DECORATION_ZONES`, imported from `firebase/gamification.js`) that
already holds `placingItemId` and clears them (`saveDecorationApi(...,
null)`) before writing the new placement, so placing a sticker somewhere
new always *moves* it rather than cloning it onto a second spot.
Client-side only, matching this app's existing trust model for other
student-facing writes — not pushed into the `saveDecoration` Cloud
Function itself this session.

**Sticker Workshop modal — mobile layout added where none existed
(new request, arrived mid-session, not part of the positioning fixes
above).** The "коллекция" (collection) tab was already responsive and
untouched, per the user's own instruction. The cases grid (`tab ===
"cases"`) and the case-detail view (`tab === "detail"`) had a fixed
3-column / two-column-side-by-side layout with no mobile variant at all.
New `useIsMobile(breakpoint = 640)` hook (genuinely reactive — a resize
listener, not a one-time check) added alongside the file's existing
`useModalFonts`/`useBodyScrollLock` hooks; deliberately *not* reusing the
file's two pre-existing `window.innerWidth < 760` one-off checks (those
only apply at initial paint, sizing decorative header art where a stale
value after rotation/resize is a minor cosmetic mismatch — a whole page
layout staying stuck in the wrong column count after rotating the phone
would be a much more visible bug). Cases grid: `repeat(3,minmax(0,1fr))`
→ `1fr` on mobile (single column, cases stack vertically). Detail view:
`minmax(0,268px) minmax(0,1fr)` two-column grid → `1fr` single column on
mobile, with the left "cover card" (fan-preview art, title, description,
price, "ОТКРЫТЬ КЕЙС" button) switching from a fixed `width:259` to
`width:"100%"` — description card stays first in source order either way,
so going single-column naturally puts description on top and the "ЧТО
МОЖЕТ ВЫПАСТЬ" sticker-pool grid below it, matching the request directly
without needing to reorder any JSX.

**No live browser verification possible in this environment** for the new
mobile-modal-layout piece specifically (the position fixes above *were*
verified by the user on a real device this session, per their own
message) — flagged for a check next session, particularly the `resize`
listener's actual behavior on an orientation change.

---

## Current work focus

### Session 25 — Sticker positioning corrected against a real reference screenshot: new anchor scheme, an explicit forbidden-zone list, mobile fixes, and a real mini-mockup placement picker

Follow-up to session 21's first pass, which the user reported was visibly
wrong on both desktop and mobile (screenshots showed a sticker sitting
directly on top of the settings gear, another covering the student's name,
and truncated text). Backend intentionally untouched this session (user's
own instruction) — this was purely a positioning/UI correction using the
same 5-zone data model session 21 already shipped.

**Задача 1 — new anchor scheme, 5 zones repositioned against the reference screenshot.**
The zone→anchor mapping changed from session 21's guess:
- `zone1` ("kitten") stays on `NextLessonPlate` but now sits beside the
  greeting on desktop (`sm:top-[-72px] sm:right-[140px]` — the right
  offset is sized to clear the header's gear(44px)+gap(16px)+avatar(56px)
  cluster with margin, not guessed) and drops to a shallow top-right corner
  overlap on mobile (`top-[-16px] right-2`, capped at -16px specifically
  because the header/card gap is only 20px — anything more negative starts
  sitting on top of the avatar).
- `zone2` ("pretty soul") stays on `NextLessonPlate`'s right edge at
  "Задание"'s height on desktop (`sm:top-[42%] sm:right-[-70px]` — ~60% of
  its own width outside the border, per the user's explicit spec, not
  fully in the margin like session 21's version), moves to a **bottom**-right
  corner on mobile (`bottom-[-14px] right-[-21px]`, not top, specifically
  so it can't collide with zone1's new mobile corner).
- `zone3` ("МГУ") is a **new anchor** — moved off `NextLessonPlate` onto
  `GoalCard` ("Моя цель")'s own top border, ~28% from the left on desktop /
  ~48% on mobile (not the spec's literal "~30%" on both — the narrower
  mobile card would put 30% directly on top of the "Моя цель" title text
  at that width, so it was nudged right specifically to clear that title,
  per Задача 2's "sticker moves, not the element" rule).
- `zone4`/`zone5` stay on the exam-radar card (`ExamRadar`/
  `CurriculumProgressCard`, whichever renders for the student's first
  program) but zone4 switched from a `right`-based offset to a `left`-based
  one (`sm:left-[75%]`, matching the spec's explicit horizontal percentage
  directly) and zone5's mobile overlap was shrunk to `-16px` (was `-40px`)
  to land inside that card's own bottom padding rather than reaching up
  into visible content.
- Fixed per-zone rotation angles updated to the new spec's values
  (`decoration-zone.jsx`'s `ZONE_ROTATION_DEG`): zone1 +3°, zone2 -5°,
  zone3 +2°, zone4 -4°, zone5 +5° (was an arbitrary -7/6/-9/8/-5 set in
  session 21 with no reference to match against).
- Border-radius (10px) and the "cap the longest edge, keep real aspect
  ratio" sizing rule were already correct from session 21 — untouched.

**Задача 2 — explicit forbidden-zone list, addressed by moving stickers, not elements.**
No literal "forbidden zone registry" data structure was built (there's no
runtime collision detection in this codebase, and the user's own bug
reports were all specific, named elements) — instead every offset above
was hand-checked against the exact named list (settings gear, avatar,
greeting name, the 7 named buttons, the numeric readouts, card titles) via
the *page's own real layout math*, not guessed:
- The header→card gap is exactly 20px (`gap-5` on the page's flex column),
  which is why -20px is the hard ceiling for any zone1-style top-overlap
  on mobile — go past it and you're on the gear/avatar, confirmed by
  computing the header's own height (56px, the avatar) against that gap.
- zone3's horizontal position was widened specifically because the "Моя
  цель" title sits immediately after a 40px icon badge — at the mobile
  card's narrower width, the spec's literal 30% mark lands inside that
  title's own text span.
- zone2's mobile move to the *bottom*-right corner (not top) was chosen
  because a bottom-edge overlap lands in that card's own bottom padding
  (`p-6`/`p-8`, real empty space before the border) — verified against the
  actual JSX, where the "Перенести/Отменить урок" buttons are the last
  content row before that padding starts, not flush against the border.
- `DecorationZone`'s wrapper already carries `pointer-events-none`
  (session 21) — stickers were never able to *block clicks* through to a
  button underneath; this session's fixes are about visual occlusion
  specifically, which pointer-events can't help with.
- z-index: no change needed — `DecorationZone` uses `z-10`, and every
  modal/dropdown/select in this app (`ui/dialog.jsx`, `glass-select.jsx`,
  `theme-ui.jsx`'s `TeacherPopover`) renders at `z-50` or higher through a
  portal, confirmed via a repo-wide grep before deciding this was already
  correct rather than assuming.

**Задача 3 — mobile fixes.**
- `--sticker-max`'s mobile tier (`src/index.css`) dropped from 76px to the
  spec's 70px.
- **Real word-wrap bug fixed, matching the exact screenshot ("Станет
  доступна за 3 мину…")**: the video-call status line
  (`NextLessonPlate`, both the individual- and group-lesson variants,
  `StudentDashboard.jsx`) had a stray `truncate` class forcing single-line
  ellipsis inside a `grid-cols-[minmax(0,1fr)_auto]` row — swapped for
  `break-words`, unrelated to the sticker-positioning work but the exact
  bug the user's screenshot 4 showed. Not a sticker overlap at all, a
  pre-existing className bug this task's screenshots happened to surface.
- zone1's forced move off the greeting entirely on mobile, and zone2's
  move to a bottom (not top) corner, are also part of this task (see
  Задача 1 above — the mobile-specific offsets are what satisfy this).

**Задача 4 — replaced the abstract zone-picker with a real mini-mockup.**
`sticker-workshop-modal.jsx`'s "ГДЕ РАЗМЕСТИТЬ" panel no longer loads
`dashboard-screen.png` (deleted from the import list and `CRITICAL_IMAGES`
preload array — no longer referenced anywhere, confirmed via grep before
removing, and the built bundle no longer includes it, confirmed via a
clean `vite build` diff). New `MiniDashboard` component hand-draws a
simplified, recognizable redraw of the real page at a fixed 260×470px
scale (header row, lesson card with its two buttons, notification banner,
goal card, exam-radar card, materials card — flat rects/lines, not a
screenshot) so the picker can show all 5 zones at their real relative
positions instead of the old abstract "КАРТОЧКА УРОКА"/"НИЗ СТРАНИЦЫ"
labels. `ZONE_DEFS` switched from percentage-based to fixed-pixel
coordinates over this new mockup (the `zones` builder in the modal
dropped its `${z.x}%` string interpolation for plain numeric `left`/`top`/
`width`/`minHeight`). An occupied zone now renders the student's actual
placed sticker via the existing `StickerFrame` component (same one the
inventory grid already uses) at a small size, instead of the old flat
9×9 color-dot swatch; an empty zone still shows a dashed border with a
short label. Clicking/hover behavior (`onClick={() => setSelectedZone(...)`,
the `selected`/`occupied` style branches) is unchanged — only what's
rendered underneath and what an occupied slot looks like changed.

**No live browser measurement was possible this session either** (same
standing environment gap noted in every prior gamification session) —
every offset above was derived from the reference screenshot's visual
proportions plus the *real* JSX/layout math (header height, gap sizes,
padding, which elements are left- vs. right-aligned in each row), not
measured against a running page. Verified via `npx vite build` (clean,
`dashboard-screen.png` confirmed dropped from the bundle) and `npx eslint`
scoped to every touched file (zero new violations — only the same
pre-existing `react-hooks/set-state-in-effect`/`react-hooks/purity`
findings already present throughout this codebase). Deployed hosting only
(no functions changes, per the user's own "не меняем бэкенд" instruction —
the 5-zone `saveDecoration` validation from session 21 already covers
zone1-5, nothing new needed there).

**Loose end for next session**: a real DevTools pass against the actual
rendered page, at both breakpoints, particularly to confirm zone3's
horizontal offset genuinely clears the "Моя цель" title at real font
metrics (computed from an estimated title width, not a measured one) and
that zone1's mobile `-16px` ceiling doesn't still graze the avatar circle's
own rounded edge at real pixel sizes.

---

### Session 24 — Group lessons: 11 follow-up corrections in one pass (visual polish, custom dropdowns everywhere, cascade-delete, merged lesson-card layout, program progress in the group lesson dialog, moved "ближайшие занятия" to its own dialog, extra lessons for groups, group visibility in the top upcoming-lessons panel)

All 11 items deployed (functions, one new query already covered by an existing index, hosting) and the 2 new backend mechanisms (cascade-delete, extra group lesson) verified against real Admin-SDK-created throwaway data via a temporary diagnostic, same "deploy, invoke, delete" discipline as every other one-off diagnostic in this project.

1. **Member pills now have a visible border** (`border border-glass-border` added to `GroupMembersList`'s pills, groups-section.jsx) — were white-on-white glass with no separation.
2. **"+ Добавить программу" text was centered, not left-aligned** — root cause: a plain `<button>` as a flex child of a `flex-col` container stretches to full width by default (align-items: stretch), and a bare `<button>`'s own UA-stylesheet text-align is `center` — so it read as centered even though no CSS said so explicitly. Fixed with `self-start text-left`.
3. **Every remaining native `<select>` for picking a curriculum template (or program) is now the custom `TeacherSelect`** — `ReassignGroupProgramDialog`/`AddGroupProgramControl` (groups-section.jsx), `ReassignProgramDialog`/`AddProgramControl` (student-row.jsx, per the explicit "также в разделе учеников" instruction), and the program-switcher inside `HomeworkLessonDialog`'s completing-mode progress section (found while already in that file for item 5, same pattern, fixed for consistency).
4. **`deleteGroupProgram` now cascades to every member's individual copy** — corrected from session 22's original design (which deliberately left member copies untouched, mirroring `reassignProgram`'s own "don't reach into a student's independent data" reasoning). Real behavior change: `assignGroupProgram`'s per-member fan-out now stamps `sourceGroupProgramId` onto each created student program doc (a follow-up field write after `assignCurriculumTemplate` returns, that function itself stays completely unmodified); `deleteGroupProgram` queries `students/{id}/programs where sourceGroupProgramId == programId` for every member and deletes those too, before deleting the group's own doc. `reassignGroupProgram` was NOT changed the same way (not mentioned, left touching only the group's own shared copy) — worth revisiting if the user wants full symmetry later.
5. **`HomeworkLessonDialog`'s "Тема урока" and "Задание" are now one `Section` with one save button** — turned out the save action was *already* unified (`handleSaveAssignment` already called both `updateHomeworkAssignment` and `updateLessonTopic` together, there was only ever one button) — the actual complaint was purely visual (two separate `glass-tile` cards reading as unrelated). Pure JSX restructure, no behavior change.
6. **`GroupLessonDialog` got the same topic+assignment merge, PLUS 3 new pieces it didn't have before**: (a) `ProgramTopicPicker` (exported from homework-lesson-dialog.jsx, previously private) now sources from the group's own shared program via a new one-time-read `getProgramsForGroup(teacherId, groupId)` (firebase/groups.js, mirrors `getProgramsForStudent`); (b) a new "Прогресс по программе группы" section in completing mode — `CoveredMaterialChecklist` (also newly exported) lets the teacher pick which topics/prototypes this session covered, applied via a loop of `setGroupCurriculumItemCovered` calls right after `completeGroupLesson` succeeds (not part of that callable itself — a plain client-side follow-up, matching the "manual toggle" shape that function already had); (c) a real `ProgressBar` (theme-ui.jsx) showing the group program's overall percent, also added to `GroupProgramRow` in groups-section.jsx (was flat `{percent}%` text before).
7. **"Ближайшие занятия" no longer sits inertly inside the expanded group row** — moved behind its own "Следующие уроки"/"След. уроки" button (new `GroupUpcomingLessonsDialog`, exact same "button opens a dialog with the list" shape the individual student row already uses), reusing the existing `GroupLessonsList`/`GroupLessonRow` pair unchanged inside it. The expanded row (chevron toggle) now shows only Участники + Программа. "Редактировать" shortened to "Ред." per explicit instruction.
8. **Schedule slot's day-of-week `<select>` (`schedule-slots-editor.jsx`, shared by both the student edit form and the group form) is now `TeacherSelect`** — one shared component, one fix covers both callers.
9. **`ExtraLessonDialog`'s student `<select>` is now `TeacherSelect`.**
10. **`ExtraLessonDialog` can now target a group, not just a student** — a segmented "Ученик/Группа" toggle (only rendered when `groups.length > 0`, so nothing changes visually for a teacher with no groups yet) switches which `TeacherSelect` + submit path is used. New backend `createExtraGroupLesson` (functions/core/groups.js) mirrors `createExtraLesson` (core/lessons.js): `slotIndex: null, isExtraLesson: true`, one Calendar event via a new `createExtraGroupLessonEvent` (googleCalendar.js, mirrors `createExtraLessonEvent` but `colorIdForSubject(group.subject)` instead of `colorIdForStudent`), and a new notification type `group_extra_lesson_assigned` (both notificationMessages.js mirrors) sent to every member independently.
11. **Group lessons weren't showing up in the top "Ближайшие уроки" panel at all** — that panel only ever queried individual lessons (`subscribeToUpcomingLessons`). Added a parallel `subscribeToUpcomingGroupLessonsForTeacher` (firebase/groups.js, same `teacherId==`/`status==` query shape `subscribeToIncomeGroupLessons` already uses, a strict prefix of the existing `{teacherId,status,date}` composite index — confirmed no new index needed, unlike session 22's `subscribeToIncomeGroupLessons` itself which genuinely did) and rendered the results via the newly-exported `GroupLessonRow` (groups-section.jsx) inline in the same `<ul>`, right after the individual `UpcomingLessonCard`s — not interleaved by date, appended after, a acceptable simplification given how few groups a solo tutor is likely to run at once.

**Verified for real, not just built**: a temporary diagnostic (`diagnoseGroupFixesOnce`, deployed/invoked/deleted) created 2 throwaway students + a group, assigned a program, confirmed both members got a `sourceGroupProgramId`-stamped individual copy, called `deleteGroupProgram`, confirmed both individual copies were actually gone afterward — then separately called `createExtraGroupLesson` and confirmed the resulting doc has `isExtraLesson: true` and the right `memberIds`. Both real, both correct.

**Still not independently re-verified by a live UI click-through** (same standing environment gap as every prior session — no browser automation here) — the `TeacherSelect` swaps, the merged dialog layouts, the "Следующие уроки" dialog, and the extra-group-lesson toggle are all confirmed by build+lint only, not a real render. Told the user to check via their own session as usual.



## Older sessions archived

Sessions 16-23's full write-ups (i18n rollout, gamification MVP + Sticker
Workshop phases 1-2, group lessons v1, and the six-item follow-up round)
moved to `changelog/2026-08-august.md` on 2026-08-23 to keep this file
focused on current work — durable patterns from them already live in
`systemPatterns.md`/`progress.md`/`techContext.md`. See `progress.md`'s own
session-by-session summary for what shipped in each.
