import { useEffect, useRef, useState } from "react"
import { BookOpen, Check, ChevronDown, ChevronUp, ListChecks, Loader2, Pencil, Trash2, Users, X } from "lucide-react"
import {
  Field,
  GhostBtn,
  Panel,
  SolidBtn,
  TeacherCancelBtn,
  TeacherDialog,
  TeacherDialogContent,
  TeacherDialogDescription,
  TeacherDialogTitle,
  TeacherModalFooter,
  TeacherSaveBtn,
  Title,
  teacherInputCls,
} from "@/components/teacher/theme-ui"
import { SubjectPicker } from "@/components/teacher/subject-picker"
import { ScheduleSlotsEditor } from "@/components/teacher/schedule-slots-editor"
import { GroupLessonDialog } from "@/components/teacher/group-lesson-dialog"
import { TruncatedList } from "@/components/truncated-list"
import { getSubjectColorClass } from "@/lib/subjects"
import { auth } from "@/firebase/firebase"
import {
  createGroup,
  updateGroup,
  deleteGroup,
  subscribeToGroupLessons,
  proposeGroupReschedule,
  cancelGroupLesson,
  subscribeToGroupPrograms,
  assignGroupProgram,
  reassignGroupProgram,
  deleteGroupProgram,
  setGroupCurriculumItemCovered,
} from "@/firebase/groups"
import { getCurriculumTemplates } from "@/firebase/curriculum"
import { formatLessonDateTime } from "@/lib/schedule"
import { localInputsToUtcDate, utcDateToLocalInput } from "@/lib/timezone"
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

// Same "immediate apply, no confirm step" shape as the individual lesson's
// RescheduleDialog/CancelLessonDialog (upcoming-lesson-card.jsx), minus the
// "propose to the other side" framing those use — a group reschedule/
// cancellation is a decision the teacher is recording, not negotiating
// (see functions/core/groups.js's own comment on this).
function GroupRescheduleDialog({ groupId, lessonId, initialDate, open, onOpenChange }) {
  const timeZone = useTimeZone()
  const [date, setDate] = useState("")
  const [time, setTime] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open) return
    const [initialDatePart, initialTimePart] = initialDate ? utcDateToLocalInput(initialDate, timeZone).split("T") : ["", ""]
    setDate(initialDatePart)
    setTime(initialTimePart)
    setError("")
  }, [open, initialDate, timeZone])

  function handleOpenChange(nextOpen) {
    if (submitting) return
    onOpenChange(nextOpen)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!date || !time || submitting) return
    setSubmitting(true)
    setError("")
    try {
      const newDate = localInputsToUtcDate(date, time, timeZone)
      await proposeGroupReschedule(groupId, lessonId, newDate)
      handleOpenChange(false)
    } catch (err) {
      console.error("Failed to reschedule group lesson:", err)
      setError(err?.message || "Не удалось перенести занятие")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <TeacherDialog open={open} onOpenChange={handleOpenChange}>
      <TeacherDialogContent elevated>
        <TeacherDialogTitle>Перенести занятие</TeacherDialogTitle>
        <TeacherDialogDescription>Новая дата и время применятся сразу, без подтверждения от участников</TeacherDialogDescription>

        <form className="mt-5 flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex gap-2">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={submitting} className={teacherInputCls} />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              disabled={submitting}
              className={`${teacherInputCls} max-w-36`}
            />
          </div>
          {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
          <SolidBtn type="submit" className="w-full justify-center py-3 text-sm" disabled={!date || !time || submitting}>
            {submitting ? "Переносим..." : "Перенести"}
          </SolidBtn>
        </form>
      </TeacherDialogContent>
    </TeacherDialog>
  )
}

function GroupCancelDialog({ groupId, lessonId, lessonDate, open, onOpenChange }) {
  const timeZone = useTimeZone()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  function handleOpenChange(nextOpen) {
    if (submitting) return
    onOpenChange(nextOpen)
    if (!nextOpen) setError("")
  }

  async function handleConfirm() {
    if (submitting) return
    setSubmitting(true)
    setError("")
    try {
      await cancelGroupLesson(groupId, lessonId)
      handleOpenChange(false)
    } catch (err) {
      console.error("Failed to cancel group lesson:", err)
      setError(err?.message || "Не удалось отменить занятие")
      setSubmitting(false)
    }
  }

  return (
    <TeacherDialog open={open} onOpenChange={handleOpenChange}>
      <TeacherDialogContent elevated>
        <TeacherDialogTitle>Отменить занятие?</TeacherDialogTitle>
        <TeacherDialogDescription>
          Занятие{lessonDate ? ` ${formatLessonDateTime(lessonDate, timeZone)}` : ""} будет отменено сразу, участники получат уведомление.
        </TeacherDialogDescription>

        {error ? <p className="mt-2 text-sm font-semibold text-destructive">{error}</p> : null}

        <TeacherModalFooter className="mt-5">
          <TeacherCancelBtn onClick={() => handleOpenChange(false)} disabled={submitting} />
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="rounded-full bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Отменяем..." : "Отменить занятие"}
          </button>
        </TeacherModalFooter>
      </TeacherDialogContent>
    </TeacherDialog>
  )
}

function GroupLessonRow({ teacherId, group, students, lesson }) {
  const timeZone = useTimeZone()
  const [rescheduling, setRescheduling] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const effectiveDate = lesson.rescheduledDate ?? lesson.date

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[1rem] px-2 py-2 text-sm transition hover:bg-glass-strong/40">
      <button type="button" onClick={() => setDialogOpen(true)} className="min-w-0 flex-1 text-left font-semibold text-ink hover:text-rose-deep">
        {effectiveDate ? formatLessonDateTime(effectiveDate, timeZone) : "—"}
      </button>
      <div className="flex shrink-0 items-center gap-2">
        <GhostBtn onClick={() => setRescheduling(true)} className="px-3 py-1.5 text-xs">
          Перенести
        </GhostBtn>
        <GhostBtn onClick={() => setCancelling(true)} className="px-3 py-1.5 text-xs">
          Отменить
        </GhostBtn>
      </div>

      <GroupRescheduleDialog
        groupId={group.id}
        lessonId={lesson.id}
        initialDate={effectiveDate}
        open={rescheduling}
        onOpenChange={setRescheduling}
      />
      <GroupCancelDialog groupId={group.id} lessonId={lesson.id} lessonDate={effectiveDate} open={cancelling} onOpenChange={setCancelling} />
      <GroupLessonDialog
        teacherId={teacherId}
        group={group}
        students={students}
        lessonId={dialogOpen ? lesson.id : null}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  )
}

function GroupLessonsList({ teacherId, group, students }) {
  const [lessons, setLessons] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = subscribeToGroupLessons(
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

  if (loading) return <p className="px-2 text-sm text-muted-foreground">Загрузка занятий...</p>
  if (lessons.length === 0) return <p className="px-2 text-sm text-muted-foreground">Ближайших занятий пока нет</p>

  return (
    <div className="divide-y divide-glass-border">
      {lessons.map((lesson) => (
        <GroupLessonRow key={lesson.id} teacherId={teacherId} group={group} students={students} lesson={lesson} />
      ))}
    </div>
  )
}

function groupProgramPercent(program) {
  const total = program.topics.length + program.prototypes.length
  if (total === 0) return null
  const covered = program.topics.filter((t) => t.covered).length + program.prototypes.filter((p) => p.covered).length
  return Math.round((covered / total) * 100)
}

// Same shape as ReassignProgramDialog (student-row.jsx), just targeting the
// group's own shared program doc instead of one student's.
function ReassignGroupProgramDialog({ groupId, programId, templates, open, onOpenChange }) {
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
      await reassignGroupProgram(groupId, programId, templateId)
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
          Общий прогресс группы по текущему шаблону будет сброшен. Индивидуальный прогресс каждого ученика не затрагивается.
        </TeacherDialogDescription>

        <div className="mt-4">
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} disabled={saving} className={teacherInputCls}>
            <option value="">Выбрать шаблон...</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
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

function DeleteGroupProgramDialog({ groupId, programId, programLabel, open, onOpenChange }) {
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
      await deleteGroupProgram(groupId, programId)
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
          Общий прогресс группы по этой программе будет удалён. Индивидуальные программы участников не затрагиваются.
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

// Same toggle-on-click shape as CurriculumTile (student-row.jsx), just
// against the group's own shared checklist via setGroupCurriculumItemCovered
// instead of a student's setCurriculumItemCovered.
function GroupCurriculumTile({ label, icon: Icon, items, teacherId, groupId, programId, kind }) {
  const [updatingId, setUpdatingId] = useState(null)
  const covered = items.filter((item) => item.covered).length

  async function handleToggle(item) {
    if (updatingId) return
    setUpdatingId(item.id)
    try {
      await setGroupCurriculumItemCovered(teacherId, groupId, programId, kind, item.id, !item.covered)
    } catch (error) {
      console.error("Failed to update group curriculum item:", error)
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div className="glass-tile rounded-[1.25rem] p-4">
      <p className="flex items-center justify-between text-sm font-semibold text-ink">
        <span className="flex items-center gap-2">
          <Icon className="size-4 text-rose-deep" aria-hidden="true" />
          {label}
        </span>
        <span className="text-xs text-muted-foreground">
          {covered}/{items.length}
        </span>
      </p>
      <TruncatedList
        items={items}
        limit={5}
        emptyLabel="Пусто"
        className="mt-3 space-y-1.5 text-sm"
        renderItem={(item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => handleToggle(item)}
              disabled={updatingId === item.id}
              className="flex w-full items-center gap-2 rounded-[0.75rem] px-2 py-1.5 text-left transition hover:bg-glass-strong/50 disabled:cursor-not-allowed"
            >
              {updatingId === item.id ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
              ) : (
                <span
                  className={
                    "grid size-4 shrink-0 place-items-center rounded-full " +
                    (item.covered ? "bg-primary/20 text-rose-deep" : "bg-glass-strong")
                  }
                >
                  {item.covered ? <Check className="size-3" /> : <X className="size-2.5" />}
                </span>
              )}
              <span className={item.covered ? "text-ink line-through" : "text-muted-foreground"}>{item.title}</span>
            </button>
          </li>
        )}
      />
    </div>
  )
}

function GroupProgramRow({ teacherId, groupId, program, templates }) {
  const [reassignOpen, setReassignOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const templateName = templates.find((t) => t.id === program.templateId)?.name ?? "Без шаблона"
  const percent = groupProgramPercent(program)
  const label = program.subject || "Без предмета"

  return (
    <div className="flex flex-col gap-3">
      <div className="glass-tile flex flex-wrap items-center gap-3 rounded-[1.25rem] px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{label}</p>
          <p className="truncate text-xs text-muted-foreground">{templateName}</p>
        </div>
        {percent != null ? <span className="shrink-0 text-xs font-semibold text-muted-foreground">{percent}%</span> : null}
        <button
          type="button"
          onClick={() => setReassignOpen(true)}
          className="shrink-0 rounded-full glass-tile px-3 py-1.5 text-xs font-semibold text-foreground/80 transition hover:text-rose-deep"
        >
          Заменить
        </button>
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          aria-label={`Удалить программу ${label}`}
          className="shrink-0 text-muted-foreground/70 transition hover:text-destructive"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <GroupCurriculumTile label="Темы" icon={BookOpen} items={program.topics} teacherId={teacherId} groupId={groupId} programId={program.id} kind="topics" />
        <GroupCurriculumTile label="Прототипы" icon={ListChecks} items={program.prototypes} teacherId={teacherId} groupId={groupId} programId={program.id} kind="prototypes" />
      </div>

      <ReassignGroupProgramDialog groupId={groupId} programId={program.id} templates={templates} open={reassignOpen} onOpenChange={setReassignOpen} />
      <DeleteGroupProgramDialog groupId={groupId} programId={program.id} programLabel={label} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </div>
  )
}

// Muted "+ Добавить программу" text link (same shape as AddProgramControl,
// student-row.jsx) — assigning fans out to every current member, see
// functions/core/groups.js's assignGroupProgram comment.
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
      <button type="button" onClick={() => setExpanded(true)} className="text-sm text-muted-foreground transition hover:text-foreground">
        + Добавить программу
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} disabled={assigning} className={`${teacherInputCls} min-w-0 flex-1`}>
          <option value="">Выбрать шаблон...</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
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

// Programs assigned to the group — a SHARED, common progress checklist
// (see functions/core/groups.js's assignGroupProgram comment), distinct
// from each member's own independent progress on their own dashboard.
// Assigning here also fans out a real per-student assignment automatically.
function GroupProgramsSection({ teacherId, groupId }) {
  const [programs, setPrograms] = useState([])
  const [templates, setTemplates] = useState([])

  useEffect(() => {
    const unsubscribe = subscribeToGroupPrograms(teacherId, groupId, setPrograms, (error) =>
      console.error("Failed to load group programs:", error),
    )
    return unsubscribe
  }, [teacherId, groupId])

  useEffect(() => {
    getCurriculumTemplates(teacherId)
      .then(setTemplates)
      .catch((error) => console.error("Failed to load curriculum templates:", error))
  }, [teacherId])

  return (
    <div className="glass-tile rounded-[1.25rem] p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
        <BookOpen className="size-4 text-rose-deep" aria-hidden="true" />
        Программа группы
      </p>
      <div className="mt-3 flex flex-col gap-3">
        {programs.map((program) => (
          <GroupProgramRow key={program.id} teacherId={teacherId} groupId={groupId} program={program} templates={templates} />
        ))}
        <AddGroupProgramControl groupId={groupId} templates={templates} />
      </div>
    </div>
  )
}

function GroupMembersList({ group, students }) {
  const memberNames = group.memberStudentIds.map((id) => students.find((s) => s.id === id)?.name ?? "Ученик")
  return (
    <div className="glass-tile rounded-[1.25rem] p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Users className="size-4 text-rose-deep" aria-hidden="true" />
        Участники ({memberNames.length})
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {memberNames.map((name, index) => (
          <span key={index} className="glass-tile rounded-full px-3 py-1 text-sm text-ink">
            {name}
          </span>
        ))}
      </div>
    </div>
  )
}

function GroupRow({ group, students, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const teacherId = auth.currentUser?.uid ?? null

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
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {memberCountLabel(group.memberStudentIds.length)} · {scheduleSummary(group.scheduleSlots)}
          </p>
        </button>

        <div className="flex items-center gap-2 sm:shrink-0">
          <GhostBtn onClick={onEdit} className="px-3.5 py-2">
            <Pencil className="size-3.5" aria-hidden="true" />
            Редактировать
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
            aria-label={expanded ? "Свернуть" : "Показать ближайшие занятия"}
            className="text-muted-foreground/70"
          >
            {expanded ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {expanded && teacherId ? (
        <div className="glass-tile mt-2 flex flex-col gap-3 rounded-[1.5rem] p-3">
          <GroupMembersList group={group} students={students} />
          <GroupProgramsSection teacherId={teacherId} groupId={group.id} />
          <div>
            <p className="px-1 pb-2 text-sm font-semibold text-ink">Ближайшие занятия</p>
            <GroupLessonsList teacherId={teacherId} group={group} students={students} />
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
        <SolidBtn onClick={openCreate}>+ Создать группу</SolidBtn>
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
