import { useEffect, useRef, useState } from "react"
import { Calendar as CalendarIcon, ChevronDown, ChevronUp, FileText, ListChecks, Loader2, Pencil, Plus, Trash2, Users } from "lucide-react"
import {
  Field,
  GhostBtn,
  Panel,
  ProgressBar,
  SolidBtn,
  TeacherCancelBtn,
  TeacherDialog,
  TeacherDialogContent,
  TeacherDialogDescription,
  TeacherDialogTitle,
  TeacherModalFooter,
  TeacherSaveBtn,
  TeacherSelect,
  Title,
  teacherInputCls,
} from "@/components/teacher/theme-ui"
import { SubjectPicker } from "@/components/teacher/subject-picker"
import { ScheduleSlotsEditor } from "@/components/teacher/schedule-slots-editor"
import { CurriculumTile } from "@/components/teacher/student-row"
import { UpcomingLessonCard } from "@/components/teacher/upcoming-lesson-card"
import { getVirtualOccurrences, VirtualLessonRow } from "@/components/teacher/upcoming-lessons-list-dialog"
import { getSubjectColorClass } from "@/lib/subjects"
import { auth } from "@/firebase/firebase"
import {
  createGroup,
  updateGroup,
  deleteGroup,
  subscribeToUpcomingGroupLessonOccurrences,
  assignGroupProgram,
  reassignGroupProgram,
  deleteGroupProgram,
  getGroupProgramView,
  setGroupCurriculumItemCovered,
} from "@/firebase/groups"
import { getCurriculumTemplates } from "@/firebase/curriculum"
import { formatNextLessonDate, getNextLessonDateForSlot } from "@/lib/schedule"
import { useTimeZone } from "@/lib/user-prefs-context"

// Group lessons Phase 1-3 — CRUD + management UI (Phase 1), the generated
// per-slot lesson list with one-sided reschedule/cancel (Phase 2), and
// completing a group lesson via GroupLessonDialog (Phase 3). No
// student-facing surface yet (see functions/core/groups.js's
// own doc comment). Deliberately a flat row list, not a card grid, matching
// the "Ученики" section's own post-redesign shape (student-row.jsx).

const SHORT_DAY_NAMES = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"]

// Standard Russian plural-form selection (1/2-4/5-20 exceptions) — no
// shared helper for this exists elsewhere in the codebase yet (every other
// spot either uses SummaryListRow's singular/plural-label pair or hand-
// writes a single case); kept local to this file rather than promoted to
// lib/ for a single new use.
function pluralizeRu(n, [one, few, many]) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return few
  return many
}

function memberCountLabel(count) {
  return `${count} ${pluralizeRu(count, ["ученик", "ученика", "учеников"])}`
}

function scheduleSummary(scheduleSlots) {
  if (!scheduleSlots || scheduleSlots.length === 0) return "Расписание не задано"
  if (scheduleSlots.length === 1) {
    const [slot] = scheduleSlots
    return `${SHORT_DAY_NAMES[slot.dayOfWeek] ?? "?"}, ${slot.time}`
  }
  return `${scheduleSlots.length} ${pluralizeRu(scheduleSlots.length, ["занятие", "занятия", "занятий"])} в неделю`
}

function emptyGroupForm() {
  return { name: "", subject: "", memberStudentIds: [], scheduleSlots: [] }
}

// Create/edit form — `group` null means create mode, otherwise prefilled
// from the existing group for editing (same "one dialog, two modes via a
// nullable prop" shape as ReassignProgramDialog/StudentEditModal elsewhere
// in this file's sibling student-row.jsx).
export function GroupFormDialog({ open, onOpenChange, students, group }) {
  const [name, setName] = useState("")
  const [subject, setSubject] = useState("")
  const [memberStudentIds, setMemberStudentIds] = useState([])
  const [scheduleSlots, setScheduleSlots] = useState([])
  const [search, setSearch] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const initializedRef = useRef(false)

  useEffect(() => {
    if (!open) {
      initializedRef.current = false
      return
    }
    if (initializedRef.current) return
    initializedRef.current = true

    const initial = group
      ? {
          name: group.name,
          subject: group.subject,
          memberStudentIds: group.memberStudentIds,
          scheduleSlots: group.scheduleSlots,
        }
      : emptyGroupForm()

    setName(initial.name)
    setSubject(initial.subject)
    setMemberStudentIds(initial.memberStudentIds)
    setScheduleSlots(initial.scheduleSlots)
    setSearch("")
    setError("")
  }, [open, group])

  function handleOpenChange(nextOpen) {
    if (saving) return
    onOpenChange(nextOpen)
  }

  function toggleMember(studentId) {
    setMemberStudentIds((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId],
    )
  }

  async function handleSubmit() {
    if (saving) return
    if (!name.trim()) {
      setError("Укажите название группы")
      return
    }
    if (!subject) {
      setError("Выберите предмет группы")
      return
    }
    setSaving(true)
    setError("")
    try {
      if (group) {
        await updateGroup(group.id, { name: name.trim(), subject, memberStudentIds, scheduleSlots })
      } else {
        await createGroup(name.trim(), subject, memberStudentIds, scheduleSlots)
      }
      onOpenChange(false)
    } catch (err) {
      console.error("Failed to save group:", err)
      setError(err?.message || "Не удалось сохранить группу")
    } finally {
      setSaving(false)
    }
  }

  const filteredStudents = search.trim()
    ? students.filter((student) => student.name.toLowerCase().includes(search.trim().toLowerCase()))
    : students

  return (
    <TeacherDialog open={open} onOpenChange={handleOpenChange}>
      <TeacherDialogContent wide>
        <TeacherDialogTitle>{group ? "Редактирование группы" : "Новая группа"}</TeacherDialogTitle>
        <TeacherDialogDescription>Состав, предмет и расписание группового занятия</TeacherDialogDescription>

        <div className="mt-5 space-y-4">
          <Field label="Название группы">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              placeholder="Например, «ЕГЭ по субботам»"
              className={teacherInputCls}
            />
          </Field>

          <Field label="Предмет">
            <SubjectPicker
              teacherId={auth.currentUser?.uid ?? null}
              selected={subject}
              onToggle={setSubject}
              disabled={saving}
              single
            />
          </Field>

          <div className="glass-tile rounded-[1.25rem] p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Users className="size-4 text-rose-deep" aria-hidden="true" />
              Участники
              <span className="font-normal text-muted-foreground">({memberStudentIds.length})</span>
            </p>

            {students.length > 5 ? (
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                disabled={saving}
                placeholder="Поиск по имени..."
                className={`${teacherInputCls} mt-3`}
              />
            ) : null}

            <div className="mt-3 max-h-64 space-y-1 overflow-y-auto scrollbar-hidden">
              {filteredStudents.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ученики не найдены</p>
              ) : (
                filteredStudents.map((student) => (
                  <label
                    key={student.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-[0.75rem] px-2 py-1.5 text-sm transition hover:bg-glass-strong/50"
                  >
                    <input
                      type="checkbox"
                      checked={memberStudentIds.includes(student.id)}
                      onChange={() => toggleMember(student.id)}
                      disabled={saving}
                      className="size-4 accent-primary"
                    />
                    <span className="truncate text-ink">{student.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="glass-tile rounded-[1.25rem] p-4">
            <p className="text-sm font-semibold text-ink">Расписание</p>
            <div className="mt-3">
              <ScheduleSlotsEditor slots={scheduleSlots} onChange={setScheduleSlots} disabled={saving} />
            </div>
          </div>

          {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}

          <TeacherModalFooter>
            <TeacherCancelBtn onClick={() => handleOpenChange(false)} disabled={saving} />
            <TeacherSaveBtn onClick={handleSubmit} disabled={saving}>
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Сохраняем...
                </span>
              ) : group ? (
                "Сохранить"
              ) : (
                "Создать"
              )}
            </TeacherSaveBtn>
          </TeacherModalFooter>
        </div>
      </TeacherDialogContent>
    </TeacherDialog>
  )
}

// Same shape as DeleteStudentDialog/DeleteProgramDialog (student-row.jsx) —
// no single shared generic confirm-dialog component exists in this
// codebase yet, every delete confirmation is its own small dialog
// following the same hand-written pattern, so this follows suit rather
// than introducing a new abstraction for one more usage.
function DeleteGroupDialog({ group, open, onOpenChange }) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState("")

  function handleOpenChange(nextOpen) {
    if (deleting) return
    onOpenChange(nextOpen)
    if (!nextOpen) setError("")
  }

  async function handleDelete() {
    if (deleting) return
    setDeleting(true)
    setError("")
    try {
      await deleteGroup(group.id)
      handleOpenChange(false)
    } catch (err) {
      console.error("Failed to delete group:", err)
      setError(err?.message || "Не удалось удалить группу")
      setDeleting(false)
    }
  }

  return (
    <TeacherDialog open={open} onOpenChange={handleOpenChange}>
      <TeacherDialogContent>
        <TeacherDialogTitle>Удалить группу «{group?.name}»?</TeacherDialogTitle>
        <TeacherDialogDescription>
          Участники группы останутся обычными учениками — удаляется только сама группа.
        </TeacherDialogDescription>

        {error ? <p className="mt-2 text-sm font-semibold text-destructive">{error}</p> : null}

        <TeacherModalFooter className="mt-5">
          <TeacherCancelBtn onClick={() => handleOpenChange(false)} disabled={deleting} />
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-full bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Удаляем...
              </span>
            ) : (
              "Удалить"
            )}
          </button>
        </TeacherModalFooter>
      </TeacherDialogContent>
    </TeacherDialog>
  )
}


const GROUP_UPCOMING_WINDOW_MS = 21 * 24 * 60 * 60 * 1000

// Same shape as the individual student's UpcomingLessonsListDialog: the
// real, already-loaded occurrence (one per schedule slot -- Firestore only
// ever keeps one "upcoming" draft per slot at a time, see
// ensureUpcomingGroupLessons) rendered as a full UpcomingLessonCard --
// name, tags, date, reschedule/cancel/open-dialog buttons, exactly like an
// individual lesson card, just group-flavored (UpcomingLessonCard already
// knows how via lesson.isGroupLesson) -- followed by read-only placeholder
// rows (VirtualLessonRow, upcoming-lessons-list-dialog.jsx) projecting the
// slot's further weekly occurrences that don't have a real draft yet.
// groupSlotIndex is aliased to slotIndex before handing off to
// getVirtualOccurrences, which only knows the individual-lesson field name.
function GroupLessonsList({ teacherId, group, students }) {
  const [lessons, setLessons] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = subscribeToUpcomingGroupLessonOccurrences(
      teacherId,
      group.id,
      (data) => {
        setLessons(data)
        setLoading(false)
      },
      (error) => {
        console.error("Failed to load group lessons:", error)
        setLoading(false)
      },
    )
    return unsubscribe
  }, [teacherId, group.id])

  const windowEnd = new Date(Date.now() + GROUP_UPCOMING_WINDOW_MS)
  const aliasedLessons = lessons.map((lesson) => ({ ...lesson, slotIndex: lesson.groupSlotIndex }))
  const virtualOccurrences = getVirtualOccurrences(group.scheduleSlots, aliasedLessons, windowEnd)

  if (loading) return <p className="px-2 text-sm text-muted-foreground">Загрузка занятий...</p>
  if (lessons.length === 0 && virtualOccurrences.length === 0) {
    return <p className="px-2 text-sm text-muted-foreground">Ближайших занятий пока нет</p>
  }

  return (
    <ul className="space-y-3">
      {lessons.map((lesson) => (
        <UpcomingLessonCard
          key={lesson.groupLessonKey}
          lesson={lesson}
          studentName={lesson.groupName}
          student={null}
          students={students}
        />
      ))}
      {virtualOccurrences.map((occurrence) => (
        <VirtualLessonRow key={occurrence.key} date={occurrence.date} />
      ))}
    </ul>
  )
}

// Same "button opens a dialog listing upcoming occurrences" shape as the
// individual student's UpcomingLessonsListDialog -- replaces the inline
// "Ближайшие занятия" block that used to always render inside the expanded
// group row (per explicit correction: keep the row's own expand for
// members/program only, move the lesson list behind its own button+dialog,
// matching the student row's pattern exactly).
function GroupUpcomingLessonsDialog({ teacherId, group, students, open, onOpenChange }) {
  return (
    <TeacherDialog open={open} onOpenChange={onOpenChange}>
      <TeacherDialogContent wide elevated>
        <TeacherDialogTitle>Следующие занятия — {group.name}</TeacherDialogTitle>
        <div className="mt-4 max-h-[65vh] overflow-y-auto scrollbar-hidden pr-1">
          <GroupLessonsList teacherId={teacherId} group={group} students={students} />
        </div>
      </TeacherDialogContent>
    </TeacherDialog>
  )
}

function groupProgramPercent(program) {
  const total = program.topics.length + program.prototypes.length
  if (total === 0) return null
  const covered = program.topics.filter((t) => t.covered).length + program.prototypes.filter((p) => p.covered).length
  return Math.round((covered / total) * 100)
}

// Same shape as ReassignProgramDialog (student-row.jsx) — a group has at
// most one currently-assigned program (matching its own single subject), so
// there's no programId to target any more, just "replace whatever's
// assigned now".
function ReassignGroupProgramDialog({ groupId, templates, open, onOpenChange }) {
  const [templateId, setTemplateId] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  function handleOpenChange(nextOpen) {
    if (saving) return
    onOpenChange(nextOpen)
    if (!nextOpen) setError("")
  }

  async function handleConfirm() {
    if (saving || !templateId) return
    setSaving(true)
    setError("")
    try {
      await reassignGroupProgram(groupId, templateId)
      handleOpenChange(false)
    } catch (err) {
      console.error("Failed to reassign group program:", err)
      setError(err?.message || "Не удалось заменить программу")
      setSaving(false)
    }
  }

  return (
    <TeacherDialog open={open} onOpenChange={handleOpenChange}>
      <TeacherDialogContent elevated>
        <TeacherDialogTitle>Заменить программу группы?</TeacherDialogTitle>
        <TeacherDialogDescription>
          Каждый участник получит новый шаблон вместо текущего. Уже отмеченный прогресс по старому шаблону не переносится.
        </TeacherDialogDescription>

        <div className="mt-4">
          <TeacherSelect
            value={templateId}
            onChange={setTemplateId}
            disabled={saving}
            placeholder="Выбрать шаблон..."
            options={templates.map((template) => ({ value: template.id, label: template.name }))}
          />
        </div>

        {error ? <p className="mt-2 text-sm font-semibold text-destructive">{error}</p> : null}

        <TeacherModalFooter className="mt-5">
          <TeacherCancelBtn onClick={() => handleOpenChange(false)} disabled={saving} />
          <TeacherSaveBtn onClick={handleConfirm} disabled={saving || !templateId}>
            {saving ? "Заменяем..." : "Заменить"}
          </TeacherSaveBtn>
        </TeacherModalFooter>
      </TeacherDialogContent>
    </TeacherDialog>
  )
}

function DeleteGroupProgramDialog({ groupId, programLabel, open, onOpenChange }) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState("")

  function handleOpenChange(nextOpen) {
    if (deleting) return
    onOpenChange(nextOpen)
    if (!nextOpen) setError("")
  }

  async function handleDelete() {
    if (deleting) return
    setDeleting(true)
    setError("")
    try {
      await deleteGroupProgram(groupId)
      handleOpenChange(false)
    } catch (err) {
      console.error("Failed to delete group program:", err)
      setError(err?.message || "Не удалось удалить программу")
      setDeleting(false)
    }
  }

  return (
    <TeacherDialog open={open} onOpenChange={handleOpenChange}>
      <TeacherDialogContent elevated>
        <TeacherDialogTitle>Удалить программу «{programLabel}»?</TeacherDialogTitle>
        <TeacherDialogDescription>
          У каждого участника, кому эта программа существует только благодаря группе, она будет удалена. Если у
          участника такая же программа была назначена индивидуально ещё до группы — она останется, просто перестанет
          считаться групповой.
        </TeacherDialogDescription>

        {error ? <p className="mt-2 text-sm font-semibold text-destructive">{error}</p> : null}

        <TeacherModalFooter className="mt-5">
          <TeacherCancelBtn onClick={() => handleOpenChange(false)} disabled={deleting} />
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-full bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? "Удаляем..." : "Удалить"}
          </button>
        </TeacherModalFooter>
      </TeacherDialogContent>
    </TeacherDialog>
  )
}

// Muted "+ Добавить программу" text link (same shape as AddProgramControl,
// student-row.jsx) — assigning fans out to every current member, reusing
// (not duplicating) a member's already-matching program where one exists —
// see functions/core/groups.js's assignGroupProgram comment.
function AddGroupProgramControl({ groupId, templates }) {
  const [expanded, setExpanded] = useState(false)
  const [templateId, setTemplateId] = useState("")
  const [assigning, setAssigning] = useState(false)
  const [error, setError] = useState("")

  async function handleAssign() {
    if (assigning || !templateId) return
    setAssigning(true)
    setError("")
    try {
      await assignGroupProgram(groupId, templateId)
      setTemplateId("")
      setExpanded(false)
    } catch (err) {
      console.error("Failed to assign group program:", err)
      setError(err?.message || "Не удалось назначить программу")
    } finally {
      setAssigning(false)
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="self-start text-left text-sm text-muted-foreground transition hover:text-foreground"
      >
        + Добавить программу
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <TeacherSelect
          value={templateId}
          onChange={setTemplateId}
          disabled={assigning}
          placeholder="Выбрать шаблон..."
          options={templates.map((template) => ({ value: template.id, label: template.name }))}
          className="min-w-0 flex-1"
        />
        <GhostBtn onClick={handleAssign} disabled={assigning || !templateId} className="shrink-0 px-4 py-2.5">
          {assigning ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : "Назначить"}
        </GhostBtn>
        <button type="button" onClick={() => setExpanded(false)} disabled={assigning} className="shrink-0 text-xs font-semibold text-muted-foreground">
          Отмена
        </button>
      </div>
      {error ? <p className="text-xs font-semibold text-destructive">{error}</p> : null}
    </div>
  )
}

// The group's program — rearchitected (session 28): not a separate stored
// copy any more, computed at read time from each linked member's own
// program (getGroupProgramView, firebase/groups.js) so a student
// individually assigned the same subject never ends up with two silently-
// diverging copies, and marking a topic covered here actually reaches every
// member's own progress instead of a group-only shadow copy nobody else
// sees. Reuses CurriculumTile (student-row.jsx) verbatim for the topics/
// prototypes display, just with a fan-out onToggle instead of one targeting
// a single student.
// Presentational — groupProgram/loading/templates are all fetched once by
// the parent GroupRow (not here) since the collapsed row's own progress bar
// (see GroupRow) needs the same data whether or not this expanded section
// is ever rendered; fetching it twice would be wasteful and could race.
// Header (template name, top, right of the info panel) then the two
// CurriculumTile cells sit in the same grid as GroupInfoPanel — see
// GroupRow's own comment on the row-span layout trick.
function GroupProgramsSection({ group, groupProgram, loading, templates, onToggled }) {
  const [reassignOpen, setReassignOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  async function handleToggle(kind, item) {
    await setGroupCurriculumItemCovered(groupProgram.memberPrograms, kind, item.id, !item.covered)
    onToggled(kind, item.id, !item.covered)
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground sm:col-span-2">Загрузка программы...</p>
  }

  if (!group.programTemplateId || !groupProgram) {
    return <AddGroupProgramControl groupId={group.id} templates={templates} />
  }

  const templateName = templates.find((t) => t.id === groupProgram.templateId)?.name ?? "Без шаблона"

  return (
    <>
      {/* Same position AND style as a student's own program-name header
          (student-row.jsx) — top of the section, right of the schedule
          block, directly above the topics/prototypes tiles. Percent lives
          in the collapsed row's own progress bar now (GroupRow), not
          repeated here. */}
      <div className="flex flex-wrap items-start justify-between gap-2 sm:col-span-2">
        <p className="text-xs font-semibold text-muted-foreground">{templateName}</p>
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setReassignOpen(true)}
            className="text-xs font-semibold text-foreground/80 transition hover:text-rose-deep"
          >
            Заменить
          </button>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="text-xs font-semibold text-muted-foreground/70 transition hover:text-destructive"
          >
            Удалить
          </button>
        </div>
      </div>

      <CurriculumTile
        label="Темы программы"
        icon={FileText}
        items={groupProgram.topics}
        kind="topics"
        limit={5}
        onToggle={(item) => handleToggle("topics", item)}
        className="border border-glass-border"
      />
      <CurriculumTile
        label="Прототипы"
        icon={ListChecks}
        items={groupProgram.prototypes}
        kind="prototypes"
        limit={5}
        onToggle={(item) => handleToggle("prototypes", item)}
        className="border border-glass-border"
      />

      <ReassignGroupProgramDialog groupId={group.id} templates={templates} open={reassignOpen} onOpenChange={setReassignOpen} />
      <DeleteGroupProgramDialog groupId={group.id} programLabel={templateName} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </>
  )
}

// A group lesson bills every member their own hourlyRate for the same
// session (see finance-section.jsx's computeWeeklyIncome, which already
// sums per-attendee), so the group's own "hourly rate" for display purposes
// is that same per-session total — the sum of every member's own rate, not
// a single shared number.
function rateSummary(group, students) {
  const rates = group.memberStudentIds
    .map((id) => students.find((s) => s.id === id)?.hourlyRate)
    .filter((rate) => typeof rate === "number" && rate > 0)
  if (rates.length === 0) return "Не указана"
  const total = rates.reduce((sum, rate) => sum + rate, 0)
  return `${total} ₽`
}

// 1/3 info column — same shape as the student row's own expanded info cell
// (student-row.jsx): schedule, subject, roster, program, rate, with the
// group's own edit action.
function GroupInfoPanel({ group, students, onEdit }) {
  const timeZone = useTimeZone()
  const memberNames = group.memberStudentIds.map((id) => students.find((s) => s.id === id)?.name ?? "Ученик")

  return (
    <div className="glass-tile rounded-[1.25rem] border border-glass-border p-4 md:w-1/3 md:shrink-0">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
        <CalendarIcon className="size-4 text-rose-deep" aria-hidden="true" />
        Расписание
      </p>
      <ul className="mt-3 space-y-1.5 text-sm">
        {group.scheduleSlots?.length > 0 ? (
          group.scheduleSlots.map((slot, index) => (
            <li key={index} className="font-semibold text-ink">
              {formatNextLessonDate(getNextLessonDateForSlot(slot), timeZone)}
            </li>
          ))
        ) : (
          <li className="text-muted-foreground">Расписание не задано</li>
        )}
      </ul>

      <div className="mt-3 flex justify-between border-t border-glass-border pt-3 text-sm">
        <span className="text-muted-foreground">Предмет</span>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${getSubjectColorClass(group.subject)}`}>
          {group.subject}
        </span>
      </div>

      <div className="mt-3 border-t border-glass-border pt-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Users className="size-4 text-rose-deep" aria-hidden="true" />
          Участники ({memberNames.length})
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {memberNames.map((name, index) => (
            <span key={index} className="glass-tile rounded-full border border-glass-border px-3 py-1 text-sm text-ink">
              {name}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3 flex justify-between border-t border-glass-border pt-3 text-sm">
        <span className="text-muted-foreground">Ставка (в час)</span>
        <span className="text-ink">{rateSummary(group, students)}</span>
      </div>

      <button type="button" onClick={onEdit} className="mt-3 flex items-center gap-1 text-xs font-semibold text-rose-deep">
        <Pencil className="size-3" aria-hidden="true" />
        Редактировать
      </button>
    </div>
  )
}

function GroupRow({ group, students, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const [upcomingOpen, setUpcomingOpen] = useState(false)
  const teacherId = auth.currentUser?.uid ?? null

  // Fetched here (not inside GroupProgramsSection) — the collapsed row's
  // own progress bar below needs the same program data whether or not the
  // row has ever been expanded, same "percent shows even collapsed" shape
  // the student row's own header already has.
  const [groupProgram, setGroupProgram] = useState(null)
  const [programLoading, setProgramLoading] = useState(true)
  const [templates, setTemplates] = useState([])

  useEffect(() => {
    let cancelled = false
    setProgramLoading(true)
    getGroupProgramView(group.subject, group.memberStudentIds)
      .then((data) => {
        if (!cancelled) setGroupProgram(data)
      })
      .catch((error) => console.error("Failed to load group program:", error))
      .finally(() => {
        if (!cancelled) setProgramLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [group.subject, group.memberStudentIds, group.programTemplateId])

  useEffect(() => {
    getCurriculumTemplates(teacherId)
      .then(setTemplates)
      .catch((error) => console.error("Failed to load curriculum templates:", error))
  }, [teacherId])

  function handleProgramToggled(kind, itemId, covered) {
    setGroupProgram((current) =>
      current
        ? { ...current, [kind]: current[kind].map((i) => (i.id === itemId ? { ...i, covered } : i)) }
        : current,
    )
  }

  const percent = groupProgram ? groupProgramPercent(groupProgram) : null

  return (
    <div>
      <div className="flex flex-col gap-2 rounded-[1.5rem] px-1 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="min-w-0 w-full text-left sm:flex-1"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 truncate font-semibold text-ink">{group.name}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${getSubjectColorClass(group.subject)}`}>
              {group.subject}
            </span>
            <span className="text-sm text-muted-foreground">
              {memberCountLabel(group.memberStudentIds.length)} · {scheduleSummary(group.scheduleSlots)}
            </span>
          </div>
          <div className="mt-1.5">
            {programLoading ? null : percent !== null ? (
              <ProgressBar value={percent} />
            ) : (
              <span className="text-xs text-muted-foreground">Программа не назначена</span>
            )}
          </div>
        </button>

        <div className="flex items-center gap-2 sm:shrink-0">
          <GhostBtn onClick={() => setUpcomingOpen(true)} className="px-3.5 py-2">
            <Plus className="size-3.5" aria-hidden="true" />
            <span className="sm:hidden">След. уроки</span>
            <span className="hidden sm:inline">Следующие уроки</span>
          </GhostBtn>
          <GhostBtn onClick={onEdit} className="px-3.5 py-2">
            <Pencil className="size-3.5" aria-hidden="true" />
            Ред.
          </GhostBtn>
          <button
            type="button"
            onClick={onDelete}
            aria-label="Удалить группу"
            className="glass-tile grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:text-destructive"
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Свернуть" : "Показать участников и программу"}
            className="text-muted-foreground/70"
          >
            {expanded ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {teacherId ? (
        <GroupUpcomingLessonsDialog
          teacherId={teacherId}
          group={group}
          students={students}
          open={upcomingOpen}
          onOpenChange={setUpcomingOpen}
        />
      ) : null}

      {expanded && teacherId ? (
        <div className="glass-tile mt-2 rounded-[1.5rem] border border-glass-border p-4">
          {/* Info panel and the program area are separate flex siblings, NOT
              cells of one shared grid — a CSS-grid row-span trick was tried
              first and didn't isolate them (a tall info panel still fed
              into the shared row-sizing algorithm). `md:items-start` here
              is required, not cosmetic: flex's default `align-items:
              stretch` would otherwise stretch the (shorter) program area
              to match the (taller, many-member-pills) info panel's height,
              and CSS Grid's own default `align-content: normal` on the
              inner program grid resolves to `stretch` too — silently
              re-introducing the exact same header→tiles gap inflation the
              flex split was meant to avoid. Without `items-start`, "two
              separate flex children" and "one grid with row-span" produce
              the same bug by a different mechanism. */}
          <div className="flex flex-col gap-3 md:flex-row md:items-start">
            <GroupInfoPanel group={group} students={students} onEdit={onEdit} />
            <div className="grid gap-3 sm:grid-cols-2 md:flex-1">
              <GroupProgramsSection
                group={{ ...group, teacherId }}
                groupProgram={groupProgram}
                loading={programLoading}
                templates={templates}
                onToggled={handleProgramToggled}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// `groups` is loaded by the parent (TeacherDashboard.jsx) rather than
// subscribed to in here — the parent also needs the count to decide
// whether this whole section (and its own "+ Создать группу" button) or a
// button inside the "Ученики" panel is what's shown, so lifting the
// subscription up avoids running it twice.
export function GroupsSection({ students, groups }) {
  const [formOpen, setFormOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState(null)
  const [deletingGroup, setDeletingGroup] = useState(null)

  function openCreate() {
    setEditingGroup(null)
    setFormOpen(true)
  }

  function openEdit(group) {
    setEditingGroup(group)
    setFormOpen(true)
  }

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Title>Группы</Title>
        <SolidBtn onClick={openCreate}>
          <Plus className="size-3.5" aria-hidden="true" />
          Создать группу
        </SolidBtn>
      </div>

      <div className="mt-4">
        <div className="divide-y divide-glass-border">
          {groups.map((group) => (
            <GroupRow
              key={group.id}
              group={group}
              students={students}
              onEdit={() => openEdit(group)}
              onDelete={() => setDeletingGroup(group)}
            />
          ))}
        </div>
      </div>

      <GroupFormDialog open={formOpen} onOpenChange={setFormOpen} students={students} group={editingGroup} />
      <DeleteGroupDialog
        group={deletingGroup}
        open={Boolean(deletingGroup)}
        onOpenChange={(open) => !open && setDeletingGroup(null)}
      />
    </Panel>
  )
}
