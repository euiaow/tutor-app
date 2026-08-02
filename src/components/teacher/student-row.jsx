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
  subscribeToCurriculumProgress,
  setCurriculumItemCovered,
  getCurriculumTemplates,
  assignCurriculumTemplate,
  addPersonalTopic,
  removePersonalTopic,
} from "@/firebase/curriculum"
import { DAY_OPTIONS, formatLessonDateTime } from "@/lib/schedule"
import { SUBJECT_OPTIONS, EXAM_TARGET_OPTIONS, formatExamTarget, formatSubjects } from "@/lib/student-profile"

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
// itemType is the literal "topic"/"prototype" string the backend expects;
// progressField is which key on the curriculumProgress doc this reads from.
function PersonalProgramSection({ label, itemType, items, studentId, removingId, onRemove }) {
  const [title, setTitle] = useState("")
  const [minScore, setMinScore] = useState(0)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState("")

  async function handleAdd() {
    if (adding || !title.trim()) return
    setAdding(true)
    setError("")
    try {
      await addPersonalTopic(studentId, { title: title.trim(), minScoreRequired: minScore, type: itemType })
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

// Direct editing of a student's own curriculumProgress — add/remove
// topics/prototypes independent of whatever template it was assigned
// from. Deliberately doesn't distinguish template-copied items from
// personally-added ones anywhere in this list: once copied, they're all
// just "this student's program," per explicit instruction not to split
// them into "native"/"personal" visually.
function PersonalProgramDialog({ studentId, open, onOpenChange }) {
  const [progress, setProgress] = useState(null)
  const [removingId, setRemovingId] = useState(null)

  useEffect(() => {
    if (!open) return
    const unsubscribe = subscribeToCurriculumProgress(studentId, setProgress, (error) =>
      console.error("Failed to load curriculum progress:", error),
    )
    return () => unsubscribe()
  }, [open, studentId])

  async function handleRemove(itemType, itemId) {
    if (removingId) return
    setRemovingId(itemId)
    try {
      await removePersonalTopic(studentId, { itemId, type: itemType })
    } catch (error) {
      console.error("Failed to remove personal topic:", error)
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <TeacherDialog open={open} onOpenChange={onOpenChange}>
      <TeacherDialogContent wide>
        <TeacherDialogTitle>Программа ученика</TeacherDialogTitle>
        <TeacherDialogDescription>
          Темы и прототипы, добавленные напрямую в программу — не меняет общий шаблон.
        </TeacherDialogDescription>

        <div className="mt-5 space-y-4">
          <PersonalProgramSection
            label="Темы"
            itemType="topic"
            items={progress?.topics ?? []}
            studentId={studentId}
            removingId={removingId}
            onRemove={handleRemove}
          />
          <PersonalProgramSection
            label="Прототипы"
            itemType="prototype"
            items={progress?.prototypes ?? []}
            studentId={studentId}
            removingId={removingId}
            onRemove={handleRemove}
          />
        </div>
      </TeacherDialogContent>
    </TeacherDialog>
  )
}

// The 13th modal — schedule editing moved here from the old inline
// ScheduleBlock per the requested layout change; profile fields (subject/
// exam target/rate/auto-remind/curriculum plan) live in the same modal,
// matching the mockup's own StudentEditModal which combines both.
function StudentEditModal({ student, open, onOpenChange }) {
  const [slots, setSlots] = useState([])
  const [subject, setSubject] = useState([])
  const [examTarget, setExamTarget] = useState("school")
  const [hourlyRate, setHourlyRate] = useState(0)
  const [autoRemindLowBalance, setAutoRemindLowBalance] = useState(false)
  const [templates, setTemplates] = useState([])
  const [templateId, setTemplateId] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [isProgramEditorOpen, setIsProgramEditorOpen] = useState(false)
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
    setExamTarget(student.examTarget ?? "school")
    setHourlyRate(student.hourlyRate ?? 0)
    setAutoRemindLowBalance(Boolean(student.autoRemindLowBalance))
    setTemplateId(student.curriculumSourceTemplateId ?? "")
    setError("")

    getCurriculumTemplates()
      .then(setTemplates)
      .catch((err) => console.error("Failed to load curriculum templates:", err))
  }, [open, student])

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
      const templateChanged = templateId && templateId !== (student.curriculumSourceTemplateId ?? "")

      await Promise.all([
        updateStudentSchedule(student.id, slots),
        updateStudentProfile(student.id, {
          subject,
          examTarget,
          hourlyRate: Number(hourlyRate) || 0,
          autoRemindLowBalance,
        }),
        templateChanged ? assignCurriculumTemplate(student.id, templateId) : Promise.resolve(),
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
              <div className="flex flex-wrap gap-2">
                {SUBJECT_OPTIONS.map((option) => {
                  const on = subject.includes(option.value)
                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={saving}
                      onClick={() => toggleSubject(option.value)}
                      className={
                        "rounded-full px-3.5 py-1.5 text-xs font-semibold transition disabled:opacity-50 " +
                        (on ? "text-primary-foreground" : "glass-tile text-foreground/80 hover:text-rose-deep")
                      }
                      style={on ? { background: "var(--gradient-orb)" } : undefined}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>
            </Field>

            <Field label="Цель">
              <select
                value={examTarget}
                onChange={(e) => setExamTarget(e.target.value)}
                disabled={saving}
                className={teacherInputCls}
              >
                {EXAM_TARGET_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
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

            <label className="block">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setIsProgramEditorOpen(true)}
                  className="flex items-center gap-1 text-xs font-semibold text-rose-deep"
                >
                  <Pencil className="size-3" aria-hidden="true" />
                  Редактировать программу ученика
                </button>
                <span className="text-xs font-semibold text-muted-foreground">Учебный план</span>
              </div>
              <div className="mt-1.5">
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  disabled={saving}
                  className={teacherInputCls}
                >
                  <option value="">Не назначен</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </div>
            </label>

            <PersonalProgramDialog
              studentId={student.id}
              open={isProgramEditorOpen}
              onOpenChange={setIsProgramEditorOpen}
            />
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
                        {formatLessonDateTime(lesson.rescheduledDate ?? lesson.date)}
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
function CurriculumTile({ label, icon: Icon, items, studentId, kind }) {
  const [updatingId, setUpdatingId] = useState(null)
  const covered = items.filter((item) => item.covered).length

  async function handleToggle(item) {
    if (updatingId) return
    setUpdatingId(item.id)
    try {
      await setCurriculumItemCovered(studentId, kind, item.id, !item.covered)
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
                  {formatLessonDateTime(item.coveredAt.toDate?.() ?? item.coveredAt)}
                </span>
              ) : null}
            </button>
          </li>
        )}
      />
    </div>
  )
}

export function StudentRow({ student, progressSummary, curriculumTemplates = [] }) {
  const [expanded, setExpanded] = useState(false)
  const [isUpcomingListOpen, setIsUpcomingListOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false)
  const [liveProgress, setLiveProgress] = useState(null)

  useEffect(() => {
    if (!expanded) {
      setLiveProgress(null)
      return
    }
    const unsubscribe = subscribeToCurriculumProgress(student.id, setLiveProgress, (error) =>
      console.error("Failed to subscribe to curriculum progress:", error),
    )
    return () => unsubscribe()
  }, [expanded, student.id])

  // Prefer the live subscription (active while this row is expanded) over
  // the one-time batch snapshot the parent loaded on mount — otherwise the
  // header percent stayed stuck at whatever it was when the page loaded,
  // even though the expanded tile below it (which already used
  // liveProgress) updated in real time via markTopicsCovered/
  // setCurriculumItemCovered.
  const progressForPercent = liveProgress ?? progressSummary
  const totalTopics = progressForPercent?.topics.length ?? 0
  const coveredTopics = progressForPercent?.topics.filter((topic) => topic.covered).length ?? 0
  const totalPrototypes = progressForPercent?.prototypes.length ?? 0
  const coveredPrototypes = progressForPercent?.prototypes.filter((prototype) => prototype.covered).length ?? 0
  const totalProgressItems = totalTopics + totalPrototypes
  const coveredProgressItems = coveredTopics + coveredPrototypes
  const percent = totalProgressItems > 0 ? Math.round((coveredProgressItems / totalProgressItems) * 100) : null

  function stop(e) {
    e.stopPropagation()
  }

  const templateName = curriculumTemplates.find(
    (template) => template.id === student.curriculumSourceTemplateId,
  )?.name

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
        className="flex flex-wrap cursor-pointer items-center gap-3 rounded-[1.5rem] px-1 py-2 transition hover:bg-glass-strong/40"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/student/${student.id}`}
              onClick={stop}
              className="flex min-w-0 items-center gap-2 truncate font-semibold text-ink transition hover:text-rose-deep"
            >
              <StudentDot />
              <span className="truncate">{student.name}</span>
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

        <div className="flex shrink-0 items-center gap-2" onClick={stop}>
          <GhostBtn onClick={() => setIsUpcomingListOpen(true)} className="px-4 py-2">
            <Plus className="size-3.5" aria-hidden="true" /> Следующие уроки
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
                <div className="mt-1 flex justify-between text-muted-foreground">
                  <span>Цель</span>
                  <span className="text-ink">{formatExamTarget(student.examTarget)}</span>
                </div>
              </div>
              <div className="mt-4 flex justify-between border-t border-glass-border pt-3 text-sm">
                <span className="text-muted-foreground">Учебный план</span>
                <span className="text-ink">{templateName ?? "Не назначен"}</span>
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

            <CurriculumTile
              label="Темы программы"
              icon={FileText}
              items={liveProgress?.topics ?? []}
              studentId={student.id}
              kind="topics"
            />
            <CurriculumTile
              label="Прототипы"
              icon={ListChecks}
              items={liveProgress?.prototypes ?? []}
              studentId={student.id}
              kind="prototypes"
            />
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

      <StudentEditModal student={student} open={isEditModalOpen} onOpenChange={setIsEditModalOpen} />

      <StudentLessonHistoryModal
        student={student}
        open={isHistoryModalOpen}
        onOpenChange={setIsHistoryModalOpen}
      />
    </div>
  )
}
