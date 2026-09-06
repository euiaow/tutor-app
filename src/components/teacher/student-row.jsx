import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import {
  BookOpen,
  Calendar as CalendarIcon,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  ListChecks,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react"
import { HomeworkLessonDialog } from "@/components/teacher/homework-lesson-dialog"
import { UpcomingLessonsListDialog } from "@/components/teacher/upcoming-lessons-list-dialog"
import { ContactButton } from "@/components/teacher/contact-button"
import { StudentTags } from "@/components/student-tags"
import { TruncatedList } from "@/components/truncated-list"
import { Spinner } from "@/components/ui/spinner"
import {
  Field,
  GhostBtn,
  ProgressBar,
  StudentDot,
  TeacherCancelBtn,
  TeacherDialog,
  TeacherDialogContent,
  TeacherDialogDescription,
  TeacherDialogTitle,
  TeacherModalFooter,
  TeacherSaveBtn,
  TeacherSelect,
  TeacherStatusBadge,
  teacherInputCls,
} from "@/components/teacher/theme-ui"
import { updateStudentSchedule, updateStudentProfile, deleteStudent } from "@/firebase/students"
import { ensureUpcomingLesson, subscribeToLessons } from "@/firebase/lessons"
import {
  subscribeToPrograms,
  setCurriculumItemCovered,
  getCurriculumTemplates,
  assignCurriculumTemplate,
  reassignProgram,
  deleteProgram,
  updateProgramHourlyRate,
} from "@/firebase/curriculum"
import { updateGroup } from "@/firebase/groups"
import { formatLessonDateTime, formatNextLessonDate, getNextLessonDateForSlot } from "@/lib/schedule"
import { useTimeZone } from "@/lib/user-prefs-context"
import { auth } from "@/firebase/firebase"
import { SubjectPicker } from "@/components/teacher/subject-picker"
import { getSubjectColorClass } from "@/lib/subjects"
import { ScheduleSlotsEditor } from "@/components/teacher/schedule-slots-editor"

function defaultSlot(subjects) {
  return { dayOfWeek: 1, time: "16:00", durationMinutes: 60, subject: subjects?.[0] ?? null }
}

// Only shown when the student has 2+ subjects — with exactly one, the slot
// just inherits it via the read-time fallback (resolveSlotSubject on the
// backend, same rule on the frontend), no picker needed. Single-select per
// slot (unlike the profile's own multi-select Предметы picker above), same
// visual language as StudentTags' subject chips.
function SlotSubjectTags({ subjects, value, onChange, disabled }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {subjects.map((name) => {
        const selected = name === value
        return (
          <button
            key={name}
            type="button"
            disabled={disabled}
            onClick={() => onChange(name)}
            className={`rounded-full px-2.5 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
              selected ? getSubjectColorClass(name) : "bg-glass-strong text-muted-foreground hover:text-ink"
            }`}
          >
            {name}
          </button>
        )
      })}
    </div>
  )
}

// Only shown (see StudentEditModal's renderExtra below) when the slot's
// resolved subject matches 2+ of the student's own programs —
// resolveProgramIdForSlot (functions/core/curriculum.js) already auto-
// resolves an unambiguous single match on its own at draft-creation time, so
// this picker only needs to exist for the genuinely ambiguous case (e.g. two
// programs for the same subject — ЕГЭ prep vs. olympiad prep, different
// rates). Sets the slot's own programId, which resolveProgramIdForSlot then
// prefers over its own subject-based guess.
function SlotProgramPicker({ programs, value, onChange, disabled }) {
  return (
    <TeacherSelect
      value={value ?? ""}
      onChange={(next) => onChange(next || null)}
      disabled={disabled}
      placeholder="Программа для оплаты..."
      options={programs.map((program) => ({ value: program.id, label: program.name }))}
    />
  )
}

// Self-drawn (Шаг 5) in the same language as the mockup's own 3 modals —
// confirmation dialogs aren't drawn in the mockup, so this reuses the
// LessonModal/PlanModal footer button pair (glass-tile Отмена + solid
// destructive-tinted confirm) rather than the mockup's generic Modal, since
// a plain "Сохранить" gradient button would read as a positive action here.
function DeleteStudentDialog({ studentId, studentName, open, onOpenChange }) {
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
      await deleteStudent(studentId)
    } catch (err) {
      console.error("Failed to delete student:", err)
      setError(err?.message || "Не удалось удалить ученика")
      setDeleting(false)
    }
  }

  return (
    <TeacherDialog open={open} onOpenChange={handleOpenChange}>
      <TeacherDialogContent>
        <TeacherDialogTitle>Удалить ученика {studentName}?</TeacherDialogTitle>
        <TeacherDialogDescription>
          Это действие необратимо — все уроки, материалы и данные будут удалены.
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

function programPercent(program) {
  const total = program.topics.length + program.prototypes.length
  if (total === 0) return null
  const covered = program.topics.filter((t) => t.covered).length + program.prototypes.filter((p) => p.covered).length
  return Math.round((covered / total) * 100)
}

// Confirms replacing one program's template-derived content — same shape
// as DeleteStudentDialog's confirm-dialog pattern in this file, adapted for
// a select instead of a delete button.
function ReassignProgramDialog({ studentId, programId, templates, otherTemplateIds, studentSubjects, open, onOpenChange }) {
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
    if ((otherTemplateIds ?? []).includes(templateId)) return
    setSaving(true)
    setError("")
    try {
      await reassignProgram(studentId, programId, templateId)
      handleOpenChange(false)
    } catch (err) {
      console.error("Failed to reassign program:", err)
      setError(err?.message || "Не удалось заменить программу")
      setSaving(false)
    }
  }

  return (
    <TeacherDialog open={open} onOpenChange={handleOpenChange}>
      <TeacherDialogContent elevated>
        <TeacherDialogTitle>Заменить программу?</TeacherDialogTitle>
        <TeacherDialogDescription>
          Прогресс по текущему шаблону этой программы будет сброшен. Цель (баллы/оценка, дата экзамена) сохранится.
        </TeacherDialogDescription>

        <div className="mt-4">
          <TeacherSelect
            value={templateId}
            onChange={setTemplateId}
            disabled={saving}
            placeholder="Выбрать шаблон..."
            options={templates.map((template) => {
              const alreadyAssigned = (otherTemplateIds ?? []).includes(template.id)
              const subjectMismatch = !alreadyAssigned && !(studentSubjects ?? []).includes(template.subject)
              let label = template.name
              if (alreadyAssigned) label += " (уже назначена)"
              else if (subjectMismatch) label += ` (нет предмета «${template.subject}» в профиле)`
              return { value: template.id, label, disabled: alreadyAssigned || subjectMismatch }
            })}
          />
        </div>

        {error ? <p className="mt-2 text-sm font-semibold text-destructive">{error}</p> : null}

        <TeacherModalFooter className="mt-5">
          <TeacherCancelBtn onClick={() => handleOpenChange(false)} disabled={saving} />
          <TeacherSaveBtn
            onClick={handleConfirm}
            disabled={saving || !templateId || (otherTemplateIds ?? []).includes(templateId)}
          >
            {saving ? "Заменяем..." : "Заменить"}
          </TeacherSaveBtn>
        </TeacherModalFooter>
      </TeacherDialogContent>
    </TeacherDialog>
  )
}

function DeleteProgramDialog({ studentId, programId, programLabel, open, onOpenChange }) {
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
      await deleteProgram(studentId, programId)
      handleOpenChange(false)
    } catch (err) {
      console.error("Failed to delete program:", err)
      setError(err?.message || "Не удалось удалить программу")
      setDeleting(false)
    }
  }

  return (
    <TeacherDialog open={open} onOpenChange={handleOpenChange}>
      <TeacherDialogContent elevated>
        <TeacherDialogTitle>Удалить программу «{programLabel}»?</TeacherDialogTitle>
        <TeacherDialogDescription>Весь прогресс по этой программе будет удалён безвозвратно.</TeacherDialogDescription>

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

// Per-program hourly rate — only rendered (see ProgramRow below) once a
// student has 2+ programs, since with 0-1 the profile's own single "Оплата в
// час" field (bound to student.hourlyRate) is still the one source of truth.
// Saves on blur, direct client write — same "acts immediately, no separate
// Save button" convention the rest of this Программы section already uses
// (assign/reassign/delete all act immediately too, not gated behind the
// modal's overall Save).
function ProgramRateInput({ studentId, program }) {
  const [value, setValue] = useState(program.hourlyRate ?? "")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setValue(program.hourlyRate ?? "")
  }, [program.hourlyRate])

  async function handleBlur() {
    const next = value === "" ? null : Number(value) || 0
    if (next === (program.hourlyRate ?? null)) return
    setSaving(true)
    try {
      await updateProgramHourlyRate(studentId, program.id, next)
    } catch (error) {
      console.error("Failed to update program hourly rate:", error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <span className="flex shrink-0 items-center gap-1">
      <input
        type="number"
        min="0"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
        disabled={saving}
        placeholder="—"
        className="glass-tile w-16 rounded-full border border-glass-border px-2 py-1 text-right text-xs text-ink disabled:opacity-50"
      />
      {saving ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
      ) : (
        <span className="shrink-0 text-[11px] text-muted-foreground">₽/ч</span>
      )}
    </span>
  )
}

// One row per already-assigned program (Block 4 Phase 2) — subject +
// template name + mini progress + "Заменить"/delete. Also the per-program
// rate input once the student has 2+ programs — see ProgramRateInput above.
// Shown instead of ReassignProgramDialog/DeleteProgramDialog when the
// program is group-linked (program.sourceGroupId set) — reassignProgram/
// deleteProgram already reject this server-side too (core/curriculum.js), so
// this isn't just a UI nicety, it's explaining a real restriction and
// offering the one actual way out: leaving the group. Removing the student
// from the group's own memberStudentIds is enough — deleteGroupProgram's own
// unlinkGroupPrograms logic doesn't run here (that's only for the group's
// own "Удалить программу" action), but assignGroupProgram/updateGroup won't
// re-link a program for a student who isn't a member any more, and the
// program itself is left alone (still fully usable individually) rather than
// deleted, matching "unlink, don't destroy" — the same rule the group side's
// own removal already follows for a member who had the program before
// joining.
function GroupLinkedProgramDialog({ studentId, studentName, group, open, onOpenChange }) {
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState("")

  function handleOpenChange(nextOpen) {
    if (removing) return
    onOpenChange(nextOpen)
    if (!nextOpen) setError("")
  }

  async function handleRemoveFromGroup() {
    if (removing || !group) return
    setRemoving(true)
    setError("")
    try {
      await updateGroup(group.id, {
        name: group.name,
        subject: group.subject,
        memberStudentIds: group.memberStudentIds.filter((id) => id !== studentId),
        scheduleSlots: group.scheduleSlots,
      })
      handleOpenChange(false)
    } catch (err) {
      console.error("Failed to remove student from group:", err)
      setError(err?.message || "Не удалось удалить ученика из группы")
      setRemoving(false)
    }
  }

  return (
    <TeacherDialog open={open} onOpenChange={handleOpenChange}>
      <TeacherDialogContent elevated>
        <TeacherDialogTitle>Программа закреплена за группой</TeacherDialogTitle>
        <TeacherDialogDescription>
          {group ? `«${group.name}»` : "Эта группа"} использует программу совместно со всеми участниками — заменить
          или удалить её здесь нельзя. Чтобы отвязать программу, удалите {studentName} из группы — сама программа
          при этом останется у {studentName}, просто перестанет быть групповой.
        </TeacherDialogDescription>

        {error ? <p className="mt-2 text-sm font-semibold text-destructive">{error}</p> : null}

        <TeacherModalFooter className="mt-5">
          <TeacherCancelBtn onClick={() => handleOpenChange(false)} disabled={removing} />
          <button
            type="button"
            onClick={handleRemoveFromGroup}
            disabled={removing || !group}
            className="rounded-full bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {removing ? "Удаляем..." : "Удалить из группы"}
          </button>
        </TeacherModalFooter>
      </TeacherDialogContent>
    </TeacherDialog>
  )
}

function ProgramRow({ studentId, studentName, studentSubjects, program, templates, programs, groups, disabled }) {
  const [reassignOpen, setReassignOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const templateName = templates.find((t) => t.id === program.templateId)?.name ?? "Без шаблона"
  const percent = programPercent(program)
  const label = program.subject || "Без предмета"
  const linkedGroup = program.sourceGroupId ? (groups ?? []).find((g) => g.id === program.sourceGroupId) : null
  const isGroupLinked = Boolean(program.sourceGroupId)

  return (
    <div className="glass-tile flex flex-wrap items-center gap-3 rounded-[1.25rem] px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">
          {label}
          {linkedGroup ? (
            <span className="ml-1.5 rounded-full bg-glass-strong px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              {linkedGroup.name}
            </span>
          ) : null}
        </p>
        <p className="truncate text-xs text-muted-foreground">{templateName}</p>
      </div>
      {percent != null ? (
        <span className="shrink-0 text-xs font-semibold text-muted-foreground">{percent}%</span>
      ) : null}
      {(programs ?? []).length >= 2 ? <ProgramRateInput studentId={studentId} program={program} /> : null}
      <button
        type="button"
        onClick={() => (isGroupLinked ? setDeleteOpen(true) : setReassignOpen(true))}
        disabled={disabled}
        className="shrink-0 rounded-full glass-tile px-3 py-1.5 text-xs font-semibold text-foreground/80 transition hover:text-rose-deep disabled:opacity-50"
      >
        Заменить
      </button>
      <button
        type="button"
        onClick={() => setDeleteOpen(true)}
        disabled={disabled}
        aria-label={`Удалить программу ${label}`}
        className="shrink-0 text-muted-foreground/70 transition hover:text-destructive disabled:opacity-50"
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </button>

      {isGroupLinked ? (
        <GroupLinkedProgramDialog
          studentId={studentId}
          studentName={studentName}
          group={linkedGroup}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
        />
      ) : (
        <>
          <ReassignProgramDialog
            studentId={studentId}
            programId={program.id}
            templates={templates}
            otherTemplateIds={(programs ?? [])
              .filter((p) => p.id !== program.id)
              .map((p) => p.templateId)}
            studentSubjects={studentSubjects}
            open={reassignOpen}
            onOpenChange={setReassignOpen}
          />
          <DeleteProgramDialog
            studentId={studentId}
            programId={program.id}
            programLabel={label}
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
          />
        </>
      )}
    </div>
  )
}

// Muted (not accent-colored, per spec) "+ Добавить программу" text link —
// reveals a template select + "Назначить" on click, collapses back after a
// successful assign.
function AddProgramControl({ studentId, studentSubjects, templates, programs, disabled }) {
  const [expanded, setExpanded] = useState(false)
  const [templateId, setTemplateId] = useState("")
  const [assigning, setAssigning] = useState(false)
  const [error, setError] = useState("")

  async function handleAssign() {
    if (assigning || !templateId) return
    if ((programs ?? []).some((program) => program.templateId === templateId)) return
    setAssigning(true)
    setError("")
    try {
      await assignCurriculumTemplate(studentId, templateId)
      setTemplateId("")
      setExpanded(false)
    } catch (err) {
      console.error("Failed to assign program:", err)
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
        disabled={disabled}
        className="text-sm text-muted-foreground transition hover:text-foreground disabled:opacity-50"
      >
        + Добавить программу
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <TeacherSelect
        value={templateId}
        onChange={setTemplateId}
        disabled={assigning || disabled}
        placeholder="Выбрать шаблон..."
        options={templates.map((template) => {
          const alreadyAssigned = (programs ?? []).some((program) => program.templateId === template.id)
          const subjectMismatch = !alreadyAssigned && !(studentSubjects ?? []).includes(template.subject)
          let label = template.name
          if (alreadyAssigned) label += " (уже назначена)"
          else if (subjectMismatch) label += ` (нет предмета «${template.subject}» в профиле)`
          return { value: template.id, label, disabled: alreadyAssigned || subjectMismatch }
        })}
        className="min-w-0 flex-1"
      />
      <GhostBtn onClick={handleAssign} disabled={assigning || disabled || !templateId} className="shrink-0 px-4 py-2.5">
        {assigning ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : "Назначить"}
      </GhostBtn>
      <button
        type="button"
        onClick={() => setExpanded(false)}
        disabled={assigning || disabled}
        className="shrink-0 text-xs font-semibold text-muted-foreground"
      >
        Отмена
      </button>
      {error ? <p className="mt-2 w-full text-xs font-semibold text-destructive">{error}</p> : null}
    </div>
  )
}

// The 13th modal — schedule editing moved here from the old inline
// ScheduleBlock per the requested layout change; profile fields (subject/
// exam target/rate/auto-remind/curriculum plan) live in the same modal,
// matching the mockup's own StudentEditModal which combines both.
function StudentEditModal({ student, groups, open, onOpenChange }) {
  const teacherTimeZone = useTimeZone()
  const [slots, setSlots] = useState([])
  const [subject, setSubject] = useState([])
  const [hourlyRate, setHourlyRate] = useState(0)
  const [autoRemindLowBalance, setAutoRemindLowBalance] = useState(false)
  const [templates, setTemplates] = useState([])
  const [programs, setPrograms] = useState([])
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

    setSlots(student.scheduleSlots ?? [])
    setSubject(student.subject ?? [])
    setHourlyRate(student.hourlyRate ?? 0)
    setAutoRemindLowBalance(Boolean(student.autoRemindLowBalance))
    setError("")

    const uid = auth.currentUser?.uid
    if (uid) {
      getCurriculumTemplates(uid)
        .then(setTemplates)
        .catch((err) => console.error("Failed to load curriculum templates:", err))
    }
  }, [open, student])

  // Block 4 — live, not one-time: assign/reassign/delete below all act
  // immediately (their own callable, not gated behind this modal's overall
  // Save button), so the list needs to reflect that without re-opening.
  useEffect(() => {
    if (!open) {
      setPrograms([])
      return
    }
    const unsubscribe = subscribeToPrograms(student.id, setPrograms, (err) =>
      console.error("Failed to load programs:", err),
    )
    return unsubscribe
  }, [open, student.id])

  function toggleSubject(value) {
    setSubject((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]))
  }

  async function handleSave() {
    if (saving) return
    setSaving(true)
    setError("")
    try {
      // Stamped fresh on every save — a schedule slot's day/time is wall-
      // clock in whatever timezone was active when it was last saved, and
      // stays pinned to that instant afterward even if the teacher later
      // changes their own timezone preference in Settings (see
      // getNextLessonDateForSlot in lib/schedule.js).
      const slotsToSave = slots.map((slot) => ({ ...slot, timeZone: teacherTimeZone }))
      await Promise.all([
        updateStudentSchedule(student.id, slotsToSave),
        updateStudentProfile(student.id, {
          subject,
          hourlyRate: Number(hourlyRate) || 0,
          autoRemindLowBalance,
        }),
      ])
      await ensureUpcomingLesson(student.id)
      onOpenChange(false)
    } catch (err) {
      console.error("Failed to save student edits:", err)
      setError(err?.message || "Не удалось сохранить изменения")
    } finally {
      setSaving(false)
    }
  }

  return (
    <TeacherDialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <TeacherDialogContent wide>
        <TeacherDialogTitle>Редактирование ученика</TeacherDialogTitle>
        <TeacherDialogDescription>{student.name} · расписание и профиль</TeacherDialogDescription>

        <div className="mt-5 space-y-4">
          <div className="glass-tile rounded-[1.25rem] p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <CalendarIcon className="size-4 text-rose-deep" aria-hidden="true" />
              Расписание
            </p>
            <div className="mt-3">
              <ScheduleSlotsEditor
                slots={slots}
                onChange={setSlots}
                disabled={saving}
                makeDefaultSlot={() => defaultSlot(subject)}
                renderExtra={(slot, index, updateSlot) => {
                  const effectiveSubject = slot.subject ?? subject[0] ?? null
                  const matchingPrograms = programs.filter((program) => program.subject === effectiveSubject)
                  return (
                    <>
                      {subject.length >= 2 ? (
                        <SlotSubjectTags
                          subjects={subject}
                          value={effectiveSubject}
                          onChange={(name) => updateSlot(index, "subject", name)}
                          disabled={saving}
                        />
                      ) : null}
                      {matchingPrograms.length >= 2 ? (
                        <SlotProgramPicker
                          programs={matchingPrograms}
                          value={slot.programId}
                          onChange={(id) => updateSlot(index, "programId", id)}
                          disabled={saving}
                        />
                      ) : null}
                    </>
                  )
                }}
              />
            </div>
          </div>

          <div className="glass-tile space-y-4 rounded-[1.25rem] p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <BookOpen className="size-4 text-rose-deep" aria-hidden="true" />
              Профиль ученика
            </p>

            <Field label="Предмет (можно несколько)">
              <SubjectPicker
                teacherId={auth.currentUser?.uid ?? null}
                selected={subject}
                onToggle={toggleSubject}
                disabled={saving}
              />
            </Field>

            <Field label="Оплата в час">
              <input
                type="number"
                min="0"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                disabled={saving}
                className={teacherInputCls}
              />
            </Field>

            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-ink">Автоматически напоминать об оплате</span>
              <button
                type="button"
                role="switch"
                aria-checked={autoRemindLowBalance}
                onClick={() => setAutoRemindLowBalance((v) => !v)}
                disabled={saving}
                className="relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50"
                style={{ background: autoRemindLowBalance ? "var(--gradient-orb)" : "var(--glass-strong)" }}
              >
                <span
                  className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${
                    autoRemindLowBalance ? "right-0.5" : "left-0.5"
                  }`}
                />
              </button>
            </div>

            <div>
              <span className="text-xs font-semibold text-muted-foreground">Программы</span>
              <div className="mt-1.5 space-y-2">
                {programs.map((program) => (
                  <ProgramRow
                    key={program.id}
                    studentId={student.id}
                    studentName={student.name}
                    studentSubjects={subject}
                    program={program}
                    templates={templates}
                    programs={programs}
                    groups={groups}
                    disabled={saving}
                  />
                ))}
                <AddProgramControl
                  studentId={student.id}
                  studentSubjects={subject}
                  templates={templates}
                  programs={programs}
                  disabled={saving}
                />
              </div>
            </div>
          </div>

          {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}

          <TeacherModalFooter>
            <TeacherCancelBtn onClick={() => onOpenChange(false)} disabled={saving} />
            <TeacherSaveBtn onClick={handleSave} disabled={saving}>
              {saving ? "Сохраняем..." : "Сохранить"}
            </TeacherSaveBtn>
          </TeacherModalFooter>
        </div>
      </TeacherDialogContent>
    </TeacherDialog>
  )
}

// "История уроков" per student — no current-code equivalent (the existing
// AllPastLessonsDialog is all-students, not per-student), added to fill the
// bottom-row button the requested layout asks for. Reuses the same
// subscribeToLessons feed the student-facing history view uses, filtered to
// non-upcoming, opening HomeworkLessonDialog per lesson like PastLessonCard.
function StudentLessonHistoryModal({ student, open, onOpenChange }) {
  const timeZone = useTimeZone()
  const [lessons, setLessons] = useState([])
  const [loading, setLoading] = useState(false)
  const [openLessonId, setOpenLessonId] = useState(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    const unsub = subscribeToLessons(
      student.id,
      (data) => {
        setLessons(data.filter((lesson) => lesson.status !== "upcoming"))
        setLoading(false)
      },
      (error) => {
        console.error("Failed to load student lesson history:", error)
        setLoading(false)
      },
    )
    return () => unsub()
  }, [open, student.id])

  return (
    <>
      <TeacherDialog open={open} onOpenChange={onOpenChange}>
        <TeacherDialogContent>
          <TeacherDialogTitle>История уроков</TeacherDialogTitle>
          <TeacherDialogDescription>{student.name}</TeacherDialogDescription>

          <div className="mt-4 max-h-[65vh] overflow-y-auto scrollbar-hidden pr-1">
            {loading ? (
              <Spinner label="Загрузка..." />
            ) : lessons.length === 0 ? (
              <p className="text-sm text-muted-foreground">Уроков пока нет</p>
            ) : (
              <ul className="space-y-2">
                {lessons.map((lesson) => (
                  <li
                    key={lesson.id}
                    className="glass-tile flex flex-wrap items-center gap-3 rounded-[1.25rem] px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="size-3" aria-hidden="true" />
                        {formatLessonDateTime(lesson.rescheduledDate ?? lesson.date, timeZone)}
                        {lesson.status === "cancelled" ? (
                          <TeacherStatusBadge tone="red" className="ml-1">
                            Отменён
                          </TeacherStatusBadge>
                        ) : null}
                      </p>
                      {lesson.topic ? <p className="mt-0.5 text-sm text-ink">{lesson.topic}</p> : null}
                    </div>
                    <GhostBtn onClick={() => setOpenLessonId(lesson.id)}>Открыть</GhostBtn>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TeacherDialogContent>
      </TeacherDialog>

      <HomeworkLessonDialog
        studentId={student.id}
        studentName={student.name}
        student={student}
        lessonId={openLessonId}
        open={Boolean(openLessonId)}
        onOpenChange={(next) => !next && setOpenLessonId(null)}
      />
    </>
  )
}

// Every row is directly clickable — toggles covered:true/false right away
// via setCurriculumItemCovered (read-modify-write on the array, see
// firebase/curriculum.js), no separate edit modal. `updatingId` is scoped
// to this one tile so a click only shows a spinner on the row that was
// actually clicked, not the whole list.
// onToggle overrides the default per-student write — groups-section.jsx
// reuses this exact component for the group's aggregated program view,
// passing a fan-out toggle (writes to every linked member's own program at
// once) instead of studentId/programId targeting a single student.
export function CurriculumTile({ label, icon: Icon, items, studentId, programId, kind, limit = 5, onToggle, className = "" }) {
  const timeZone = useTimeZone()
  const [updatingId, setUpdatingId] = useState(null)
  const covered = items.filter((item) => item.covered).length

  async function handleToggle(item) {
    if (updatingId) return
    setUpdatingId(item.id)
    try {
      if (onToggle) {
        await onToggle(item)
      } else {
        await setCurriculumItemCovered(studentId, programId, kind, item.id, !item.covered)
      }
    } catch (error) {
      console.error("Failed to update curriculum item:", error)
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div className={`glass-tile rounded-[1.25rem] p-4 ${className}`}>
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
        limit={limit}
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
              {item.covered && item.needsReview ? (
                <RotateCcw className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
              ) : null}
              <span className={item.covered ? "text-ink line-through" : "text-muted-foreground"}>{item.title}</span>
              {item.covered && item.coveredAt ? (
                <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                  {formatLessonDateTime(item.coveredAt.toDate?.() ?? item.coveredAt, timeZone)}
                </span>
              ) : null}
            </button>
          </li>
        )}
      />
    </div>
  )
}

export function StudentRow({ student, progressSummary, groups = [] }) {
  const timeZone = useTimeZone()
  const [expanded, setExpanded] = useState(false)
  const [isUpcomingListOpen, setIsUpcomingListOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false)
  const [livePrograms, setLivePrograms] = useState(null)
  const [templates, setTemplates] = useState([])

  // Deliberately does NOT reset livePrograms to null on collapse — only
  // unsubscribes. Resetting used to throw away the just-synced live data the
  // instant the row collapsed, falling back to progressSummary (the parent's
  // one-time batch fetch from page load), so the collapsed percent reverted
  // to whatever it was before any topics were marked covered in this
  // session — visibly wrong (e.g. "0%") right after marking something
  // covered and collapsing. Keeping the last known livePrograms value means
  // the collapsed percent stays accurate for the rest of the session; it can
  // only go stale the same way progressSummary itself already can (an update
  // from elsewhere, e.g. completing a lesson without ever expanding this row).
  useEffect(() => {
    if (!expanded) return
    const unsubscribe = subscribeToPrograms(student.id, setLivePrograms, (error) =>
      console.error("Failed to subscribe to programs:", error),
    )
    return () => unsubscribe()
  }, [expanded, student.id])

  // One-time fetch, not a subscription — only needed to resolve each
  // program's templateId into a display name for the "Программы" summary
  // line below (same call StudentEditModal already makes for the identical
  // reason, ProgramRow's own templateName lookup).
  useEffect(() => {
    if (!expanded) return
    getCurriculumTemplates(student.teacherId)
      .then(setTemplates)
      .catch((error) => console.error("Failed to load curriculum templates:", error))
  }, [expanded, student.teacherId])

  // Prefer the live subscription (active while this row is expanded) over
  // the one-time batch snapshot the parent loaded on mount — otherwise the
  // header percent stayed stuck at whatever it was when the page loaded,
  // even though the expanded tile below it (which already used
  // livePrograms) updated in real time via markTopicsCovered/
  // setCurriculumItemCovered.
  //
  // Block 4 Phase 4 — a student can have several programs now, so the
  // collapsed-row percent is the AVERAGE across all of them (sum covered /
  // sum total, not any single program's own percent) — chosen over "just
  // the first program" as the more honest reflection of total work done.
  const programsForPercent = livePrograms ?? progressSummary ?? []
  const totalProgressItems = programsForPercent.reduce(
    (sum, program) => sum + program.topics.length + program.prototypes.length,
    0,
  )
  const coveredProgressItems = programsForPercent.reduce(
    (sum, program) =>
      sum +
      program.topics.filter((topic) => topic.covered).length +
      program.prototypes.filter((prototype) => prototype.covered).length,
    0,
  )
  const percent = totalProgressItems > 0 ? Math.round((coveredProgressItems / totalProgressItems) * 100) : null

  // A group's own scheduleSlots (teachers/{uid}/groups/{groupId}.scheduleSlots)
  // never lived on the student doc — this student's card used to only ever
  // show their individual scheduleSlots, so a student who only (or also)
  // attends a group's lessons looked like they had no schedule, or an
  // incomplete one. Merged here at read time (not copied into the student
  // doc — that would create a second, driftable copy of the group's own
  // schedule and risk double-booking against ensureUpcomingGroupLessons'
  // own lesson-mirror creation) so it also stays correct live: `groups` is
  // the same subscribed list TeacherDashboard already passes everywhere
  // else, so editing a group's schedule re-renders this the same way any
  // other group-driven display already updates.
  const studentGroups = groups.filter((group) => group.memberStudentIds?.includes(student.id))
  const scheduleEntries = [
    ...(student.scheduleSlots ?? []).map((slot, index) => ({
      key: `slot-${index}`,
      date: getNextLessonDateForSlot(slot),
      groupName: null,
    })),
    ...studentGroups.flatMap((group) =>
      (group.scheduleSlots ?? []).map((slot, index) => ({
        key: `group-${group.id}-${index}`,
        date: getNextLessonDateForSlot(slot),
        groupName: group.name,
      })),
    ),
  ].sort((a, b) => (a.date && b.date ? a.date - b.date : a.date ? -1 : 1))

  function stop(e) {
    e.stopPropagation()
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            setExpanded((v) => !v)
          }
        }}
        className="flex flex-col cursor-pointer gap-2 rounded-[1.5rem] px-1 py-2 transition hover:bg-glass-strong/40 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3"
      >
        <div className="min-w-0 w-full sm:flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/student/${student.id}`}
              onClick={stop}
              className="flex min-w-0 items-center gap-2 font-semibold text-ink transition hover:text-rose-deep sm:truncate"
            >
              <StudentDot />
              <span className="sm:truncate">{student.name}</span>
            </Link>
            <StudentTags student={student} />
          </div>
          <div className="mt-1.5">
            {percent !== null ? (
              <ProgressBar value={percent} />
            ) : (
              <span className="text-xs text-muted-foreground">Программа не назначена</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:shrink-0" onClick={stop}>
          <GhostBtn onClick={() => setIsUpcomingListOpen(true)} className="px-4 py-2">
            <Plus className="size-3.5" aria-hidden="true" />
            <span className="sm:hidden">След. уроки</span>
            <span className="hidden sm:inline">Следующие уроки</span>
          </GhostBtn>
          <ContactButton student={student} />
          <button type="button" onClick={() => setExpanded((v) => !v)} className="text-muted-foreground/70">
            {expanded ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="glass-tile mt-2 rounded-[1.75rem] p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className={`glass-tile rounded-[1.25rem] p-4 ${(livePrograms ?? []).length === 1 ? "md:row-span-2" : ""}`}>
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <CalendarIcon className="size-4 text-rose-deep" aria-hidden="true" />
                Расписание
              </p>
              <ul className="mt-3 space-y-1.5 text-sm">
                {scheduleEntries.length > 0 ? (
                  scheduleEntries.map((entry) => (
                    // Recomputed via getNextLessonDateForSlot, not the raw
                    // slot.time string — anchored on the slot's own stamped
                    // timeZone (or Europe/Moscow, getNextLessonDateForSlot's
                    // own built-in default, for a legacy slot saved before
                    // per-slot anchoring existed — deliberately NOT the
                    // viewer's current pref here, or a legacy "16:00" would
                    // silently mean a different real instant every time the
                    // teacher changes their own timezone), then displayed in
                    // the viewer's current pref — so a slot set for "16:00
                    // Europe/Moscow" reads correctly converted once the
                    // teacher switches their own timezone preference.
                    <li key={entry.key} className="flex flex-wrap items-center gap-1.5 font-semibold text-ink">
                      {formatNextLessonDate(entry.date, timeZone)}
                      {entry.groupName ? (
                        <span className="rounded-full bg-glass-strong px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                          {entry.groupName}
                        </span>
                      ) : null}
                    </li>
                  ))
                ) : (
                  <li className="text-muted-foreground">Расписание не задано</li>
                )}
              </ul>
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-glass-border pt-3 text-sm">
                <span className="shrink-0 text-muted-foreground">
                  {(student.subject ?? []).length > 1 ? "Предметы" : "Предмет"}
                </span>
                {(student.subject ?? []).length === 0 ? (
                  <span className="text-right text-ink">Предмет не указан</span>
                ) : (
                  <span className="flex flex-wrap justify-end gap-1.5">
                    {student.subject.map((name) => (
                      <span key={name} className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${getSubjectColorClass(name)}`}>
                        {name}
                      </span>
                    ))}
                  </span>
                )}
              </div>
              <div className="mt-1 text-sm">
                <p className="text-muted-foreground">Программы и ставки</p>
                <div className="mt-1 space-y-1">
                  {(livePrograms ?? []).length === 0 ? (
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-ink">Не назначены</span>
                      <span className="shrink-0 text-right text-ink">
                        {typeof student.hourlyRate === "number" && student.hourlyRate > 0
                          ? `${student.hourlyRate} ₽/ч`
                          : "Не указана"}
                      </span>
                    </div>
                  ) : livePrograms.length === 1 ? (
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0 flex-1 break-words text-ink">
                        {templates.find((template) => template.id === livePrograms[0].templateId)?.name ?? "Без шаблона"}
                      </span>
                      <span className="shrink-0 text-right text-ink">
                        {typeof student.hourlyRate === "number" && student.hourlyRate > 0
                          ? `${student.hourlyRate} ₽/ч`
                          : "Не указана"}
                      </span>
                    </div>
                  ) : (
                    // Once a student has 2+ programs, the single student-level
                    // hourlyRate no longer means "the" rate — each program
                    // carries its own (set via FinanceSection's per-program
                    // field). See src/firebase/curriculum.js's
                    // updateProgramHourlyRate comment for why.
                    livePrograms.map((program) => (
                      <div key={program.id} className="flex items-start justify-between gap-3">
                        <span className="min-w-0 flex-1 break-words text-ink">
                          {templates.find((template) => template.id === program.templateId)?.name ?? "Без шаблона"}
                        </span>
                        <span className="shrink-0 text-right text-ink">
                          {typeof program.hourlyRate === "number" && program.hourlyRate > 0
                            ? `${program.hourlyRate} ₽/ч`
                            : "Не указана"}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="mt-1 flex justify-between text-sm">
                <span className="text-muted-foreground">Пароль</span>
                <span className="text-ink">{student.accessCode}</span>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(true)}
                className="mt-3 flex items-center gap-1 text-xs font-semibold text-rose-deep"
              >
                <Pencil className="size-3" aria-hidden="true" />
                Редактировать
              </button>
            </div>

            {(livePrograms ?? []).length === 1 ? (
              // Single program: same layout this had before multi-program
              // support — Темы and Прототипы as their own top-level grid
              // cells (2/3 of the row width combined, 1/3 each), not
              // stacked inside one cell, with room for 5 rows before
              // truncating. Header shows the program's own template name
              // (e.g. "Русский ЕГЭ"), not the subject ("Русский язык") —
              // groups-section.jsx's own program header mirrors this exact
              // position/style.
              <>
                <p className="text-xs font-semibold text-muted-foreground md:col-span-2">
                  {templates.find((template) => template.id === livePrograms[0].templateId)?.name ?? "Без шаблона"}
                </p>
                <CurriculumTile
                  label="Темы программы"
                  icon={FileText}
                  items={livePrograms[0].topics}
                  studentId={student.id}
                  programId={livePrograms[0].id}
                  kind="topics"
                  limit={5}
                />
                <CurriculumTile
                  label="Прототипы"
                  icon={ListChecks}
                  items={livePrograms[0].prototypes}
                  studentId={student.id}
                  programId={livePrograms[0].id}
                  kind="prototypes"
                  limit={5}
                />
              </>
            ) : (
              (livePrograms ?? []).map((program) => (
                <div key={program.id} className="space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground">
                    {templates.find((template) => template.id === program.templateId)?.name ?? "Без шаблона"}
                  </p>
                  <CurriculumTile
                    label="Темы программы"
                    icon={FileText}
                    items={program.topics}
                    studentId={student.id}
                    programId={program.id}
                    kind="topics"
                    limit={3}
                  />
                  <CurriculumTile
                    label="Прототипы"
                    icon={ListChecks}
                    items={program.prototypes}
                    studentId={student.id}
                    programId={program.id}
                    kind="prototypes"
                    limit={3}
                  />
                </div>
              ))
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap items-center gap-3 pl-1">
              <GhostBtn onClick={() => setIsHistoryModalOpen(true)} className="px-4 py-2">
                <Clock className="size-3.5" aria-hidden="true" /> История уроков
              </GhostBtn>
            </div>
            <button
              type="button"
              onClick={() => setIsDeleteDialogOpen(true)}
              className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground/70 transition hover:text-destructive"
            >
              <Trash2 className="size-4" aria-hidden="true" /> Удалить ученика
            </button>
          </div>
        </div>
      ) : null}

      <UpcomingLessonsListDialog student={student} open={isUpcomingListOpen} onOpenChange={setIsUpcomingListOpen} />

      <DeleteStudentDialog
        studentId={student.id}
        studentName={student.name}
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      />

      <StudentEditModal
        student={student}
        groups={groups}
        open={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
      />

      <StudentLessonHistoryModal
        student={student}
        open={isHistoryModalOpen}
        onOpenChange={setIsHistoryModalOpen}
      />
    </div>
  )
}
