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
  addPersonalTopic,
  removePersonalTopic,
} from "@/firebase/curriculum"
import { DAY_OPTIONS, formatLessonDateTime } from "@/lib/schedule"
import { formatSubjects } from "@/lib/student-profile"
import { useTimeZone } from "@/lib/user-prefs-context"
import { auth } from "@/firebase/firebase"
import { SubjectPicker } from "@/components/teacher/subject-picker"

const MAX_SCHEDULE_SLOTS = 7
const DAYS = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"]

function defaultSlot() {
  return { dayOfWeek: 1, time: "16:00", durationMinutes: 60 }
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

// One list + its own add-row form, for either topics or prototypes.
// itemType is the literal "topic"/"prototype" string the backend expects.
function PersonalProgramSection({ label, itemType, items, studentId, programId, removingId, onRemove }) {
  const [title, setTitle] = useState("")
  const [minScore, setMinScore] = useState(0)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState("")

  async function handleAdd() {
    if (adding || !title.trim()) return
    setAdding(true)
    setError("")
    try {
      await addPersonalTopic(studentId, programId, { title: title.trim(), minScoreRequired: minScore, type: itemType })
      setTitle("")
      setMinScore(0)
    } catch (err) {
      console.error("Failed to add personal topic:", err)
      setError(err?.message || "Не удалось добавить тему")
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="glass-tile rounded-[1.25rem] p-4">
      <p className="text-sm font-semibold text-ink">{label}</p>

      {items.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-2 rounded-[0.75rem] px-2 py-1.5 text-sm text-ink"
            >
              <span className="min-w-0 flex-1 truncate">{item.title}</span>
              <button
                type="button"
                onClick={() => onRemove(itemType, item.id)}
                disabled={removingId === item.id}
                aria-label={`Удалить ${item.title}`}
                className="shrink-0 text-muted-foreground transition hover:text-destructive disabled:opacity-50"
              >
                {removingId === item.id ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="size-3.5" aria-hidden="true" />
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Пусто</p>
      )}

      <div className="mt-3 flex items-center gap-2 border-t border-glass-border pt-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={adding}
          placeholder="Название темы"
          className={teacherInputCls}
        />
        <input
          type="number"
          min="0"
          max="100"
          value={minScore}
          onChange={(e) => setMinScore(Number(e.target.value) || 0)}
          disabled={adding}
          placeholder="0"
          title="Минимальный балл, с которого тема актуальна"
          className={`${teacherInputCls} w-16 shrink-0 px-2 text-center`}
        />
        <GhostBtn onClick={handleAdd} disabled={adding || !title.trim()} className="shrink-0 px-4 py-2.5">
          {adding ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : "Добавить"}
        </GhostBtn>
      </div>
      {error ? <p className="mt-2 text-xs font-semibold text-destructive">{error}</p> : null}
    </div>
  )
}

// Direct editing of one specific program's topics/prototypes — independent
// of whatever template it was assigned from. Deliberately doesn't
// distinguish template-copied items from personally-added ones anywhere in
// this list: once copied, they're all just "this program's material," per
// explicit instruction not to split them into "native"/"personal" visually.
// Block 4 — scoped to one programId now, not the student's single (former)
// curriculumProgress/main.
function PersonalProgramDialog({ studentId, programId, programLabel, open, onOpenChange }) {
  const [program, setProgram] = useState(null)
  const [removingId, setRemovingId] = useState(null)

  useEffect(() => {
    if (!open || !programId) return
    const unsubscribe = subscribeToPrograms(
      studentId,
      (programs) => setProgram(programs.find((p) => p.id === programId) ?? null),
      (error) => console.error("Failed to load program:", error),
    )
    return () => unsubscribe()
  }, [open, studentId, programId])

  async function handleRemove(itemType, itemId) {
    if (removingId) return
    setRemovingId(itemId)
    try {
      await removePersonalTopic(studentId, programId, { itemId, type: itemType })
    } catch (error) {
      console.error("Failed to remove personal topic:", error)
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <TeacherDialog open={open} onOpenChange={onOpenChange}>
      <TeacherDialogContent wide elevated>
        <TeacherDialogTitle>Программа{programLabel ? ` — ${programLabel}` : ""}</TeacherDialogTitle>
        <TeacherDialogDescription>
          Темы и прототипы, добавленные напрямую в программу — не меняет общий шаблон.
        </TeacherDialogDescription>

        <div className="mt-5 space-y-4">
          <PersonalProgramSection
            label="Темы"
            itemType="topic"
            items={program?.topics ?? []}
            studentId={studentId}
            programId={programId}
            removingId={removingId}
            onRemove={handleRemove}
          />
          <PersonalProgramSection
            label="Прототипы"
            itemType="prototype"
            items={program?.prototypes ?? []}
            studentId={studentId}
            programId={programId}
            removingId={removingId}
            onRemove={handleRemove}
          />
        </div>
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
function ReassignProgramDialog({ studentId, programId, templates, open, onOpenChange }) {
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
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            disabled={saving}
            className={teacherInputCls}
          >
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

// One row per already-assigned program (Block 4 Phase 2) — subject +
// template name + mini progress + "Заменить"/delete/edit-personal-topics.
function ProgramRow({ studentId, program, templates, disabled }) {
  const [reassignOpen, setReassignOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const templateName = templates.find((t) => t.id === program.templateId)?.name ?? "Без шаблона"
  const percent = programPercent(program)
  const label = program.subject || "Без предмета"

  return (
    <div className="glass-tile flex flex-wrap items-center gap-3 rounded-[1.25rem] px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{label}</p>
        <p className="truncate text-xs text-muted-foreground">{templateName}</p>
      </div>
      {percent != null ? (
        <span className="shrink-0 text-xs font-semibold text-muted-foreground">{percent}%</span>
      ) : null}
      <button
        type="button"
        onClick={() => setEditOpen(true)}
        disabled={disabled}
        title="Редактировать темы/прототипы"
        className="shrink-0 text-muted-foreground transition hover:text-rose-deep disabled:opacity-50"
      >
        <Pencil className="size-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => setReassignOpen(true)}
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

      <PersonalProgramDialog
        studentId={studentId}
        programId={program.id}
        programLabel={label}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <ReassignProgramDialog
        studentId={studentId}
        programId={program.id}
        templates={templates}
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
    </div>
  )
}

// Muted (not accent-colored, per spec) "+ Добавить программу" text link —
// reveals a template select + "Назначить" on click, collapses back after a
// successful assign.
function AddProgramControl({ studentId, templates, disabled }) {
  const [expanded, setExpanded] = useState(false)
  const [templateId, setTemplateId] = useState("")
  const [assigning, setAssigning] = useState(false)
  const [error, setError] = useState("")

  async function handleAssign() {
    if (assigning || !templateId) return
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
      <select
        value={templateId}
        onChange={(e) => setTemplateId(e.target.value)}
        disabled={assigning || disabled}
        className={`${teacherInputCls} min-w-0 flex-1`}
      >
        <option value="">Выбрать шаблон...</option>
        {templates.map((template) => (
          <option key={template.id} value={template.id}>
            {template.name}
          </option>
        ))}
      </select>
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
function StudentEditModal({ student, open, onOpenChange }) {
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

  function updateSlot(index, field, value) {
    setSlots((prev) => prev.map((slot, i) => (i === index ? { ...slot, [field]: value } : slot)))
  }

  function addSlot() {
    setSlots((prev) => (prev.length >= MAX_SCHEDULE_SLOTS ? prev : [...prev, defaultSlot()]))
  }

  function removeSlot(index) {
    setSlots((prev) => prev.filter((_, i) => i !== index))
  }

  function toggleSubject(value) {
    setSubject((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]))
  }

  async function handleSave() {
    if (saving) return
    setSaving(true)
    setError("")
    try {
      await Promise.all([
        updateStudentSchedule(student.id, slots),
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
            <div className="mt-3 space-y-2">
              {slots.map((slot, index) => (
                <div key={index} className="flex items-center gap-2">
                  <select
                    value={slot.dayOfWeek}
                    onChange={(e) => updateSlot(index, "dayOfWeek", Number(e.target.value))}
                    disabled={saving}
                    className={teacherInputCls}
                  >
                    {DAY_OPTIONS.map((day) => (
                      <option key={day.value} value={day.value}>
                        {day.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="time"
                    value={slot.time}
                    onChange={(e) => updateSlot(index, "time", e.target.value)}
                    disabled={saving}
                    className={`${teacherInputCls} max-w-36`}
                  />
                  <button
                    type="button"
                    onClick={() => removeSlot(index)}
                    disabled={saving}
                    aria-label="Удалить слот"
                    className="glass-tile grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addSlot}
                disabled={saving || slots.length >= MAX_SCHEDULE_SLOTS}
                className="w-full rounded-full border border-dashed border-glass-border px-4 py-2.5 text-sm font-semibold text-muted-foreground transition hover:text-rose-deep disabled:opacity-50"
              >
                + Добавить слот
              </button>
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
                    program={program}
                    templates={templates}
                    disabled={saving}
                  />
                ))}
                <AddProgramControl studentId={student.id} templates={templates} disabled={saving} />
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
function CurriculumTile({ label, icon: Icon, items, studentId, programId, kind, limit = 5 }) {
  const timeZone = useTimeZone()
  const [updatingId, setUpdatingId] = useState(null)
  const covered = items.filter((item) => item.covered).length

  async function handleToggle(item) {
    if (updatingId) return
    setUpdatingId(item.id)
    try {
      await setCurriculumItemCovered(studentId, programId, kind, item.id, !item.covered)
    } catch (error) {
      console.error("Failed to update curriculum item:", error)
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

export function StudentRow({ student, progressSummary }) {
  const [expanded, setExpanded] = useState(false)
  const [isUpcomingListOpen, setIsUpcomingListOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false)
  const [livePrograms, setLivePrograms] = useState(null)

  useEffect(() => {
    if (!expanded) {
      setLivePrograms(null)
      return
    }
    const unsubscribe = subscribeToPrograms(student.id, setLivePrograms, (error) =>
      console.error("Failed to subscribe to programs:", error),
    )
    return () => unsubscribe()
  }, [expanded, student.id])

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
            <div className="glass-tile rounded-[1.25rem] p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <CalendarIcon className="size-4 text-rose-deep" aria-hidden="true" />
                Расписание
              </p>
              <ul className="mt-3 space-y-1.5 text-sm">
                {student.scheduleSlots?.length > 0 ? (
                  student.scheduleSlots.map((slot, index) => (
                    <li key={index} className="flex justify-between text-muted-foreground">
                      <span>{DAYS[slot.dayOfWeek]}</span>
                      <span className="font-semibold text-ink">{slot.time}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-muted-foreground">Расписание не задано</li>
                )}
              </ul>
              <div className="mt-3 space-y-1.5 border-t border-glass-border pt-3 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Предмет</span>
                  <span className="text-ink">{formatSubjects(student.subject)}</span>
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
              // truncating.
              <>
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
                    {program.subject || "Без предмета"}
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
