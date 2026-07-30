import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Loader2,
  NotebookText,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react"
import { HomeworkLessonDialog } from "@/components/teacher/homework-lesson-dialog"
import { ContactButton } from "@/components/teacher/contact-button"
import { StudentProfileSection } from "@/components/teacher/student-profile-section"
import { StudentTags } from "@/components/student-tags"
import { TruncatedList } from "@/components/truncated-list"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { updateStudentSchedule, deleteStudent } from "@/firebase/students"
import { ensureUpcomingLesson } from "@/firebase/lessons"
import { subscribeToCurriculumProgress, setCurriculumItemCovered } from "@/firebase/curriculum"
import { DAY_OPTIONS, formatLessonDateTime } from "@/lib/schedule"

const MAX_SCHEDULE_SLOTS = 7
const DAYS = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"]

function defaultSlot() {
  return { dayOfWeek: 1, time: "16:00", durationMinutes: 60 }
}

function DeleteStudentDialog({ studentId, studentName, open, onOpenChange }) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState("")

  function handleOpenChange(nextOpen) {
    if (deleting) return
    onOpenChange(nextOpen)
    if (!nextOpen) {
      setError("")
    }
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogTitle>Удалить ученика {studentName}?</DialogTitle>
        <DialogDescription>
          Это действие необратимо — все уроки, материалы и данные будут удалены.
        </DialogDescription>

        {error ? <p className="mt-2 text-sm font-semibold text-destructive">{error}</p> : null}

        <div className="mt-6 flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => handleOpenChange(false)}
            disabled={deleting}
          >
            Отмена
          </Button>
          <Button
            type="button"
            className="flex-1 bg-red-600 text-white hover:bg-red-700"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Удаляем...
              </>
            ) : (
              "Удалить"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ScheduleBlock({ student }) {
  const [isSavingSchedule, setIsSavingSchedule] = useState(false)
  const [isEditingSchedule, setIsEditingSchedule] = useState(false)
  const [localSlots, setLocalSlots] = useState([])

  function handleEnterScheduleEdit() {
    setLocalSlots(student.scheduleSlots)
    setIsEditingSchedule(true)
  }

  function updateSlot(index, field, value) {
    setLocalSlots((slots) => slots.map((slot, i) => (i === index ? { ...slot, [field]: value } : slot)))
  }

  function addSlot() {
    setLocalSlots((slots) => (slots.length >= MAX_SCHEDULE_SLOTS ? slots : [...slots, defaultSlot()]))
  }

  function removeSlot(index) {
    setLocalSlots((slots) => slots.filter((_, i) => i !== index))
  }

  async function handleSaveSchedule() {
    setIsSavingSchedule(true)
    try {
      await updateStudentSchedule(student.id, localSlots)
      await ensureUpcomingLesson(student.id)
      setIsEditingSchedule(false)
    } catch (error) {
      console.error("Failed to update schedule:", error)
    } finally {
      setIsSavingSchedule(false)
    }
  }

  if (isEditingSchedule) {
    return (
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-muted-foreground">Расписание</span>

        {localSlots.map((slot, index) => (
          <div key={index} className="flex items-center gap-2">
            <select
              value={slot.dayOfWeek}
              onChange={(e) => updateSlot(index, "dayOfWeek", Number(e.target.value))}
              disabled={isSavingSchedule}
              className="h-9 flex-1 rounded-lg border border-border bg-background px-2 text-sm text-foreground outline-none disabled:opacity-50"
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
              disabled={isSavingSchedule}
              className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground outline-none disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => removeSlot(index)}
              disabled={isSavingSchedule}
              aria-label="Удалить слот"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={addSlot}
          disabled={isSavingSchedule || localSlots.length >= MAX_SCHEDULE_SLOTS}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          <Plus className="size-4" aria-hidden="true" />
          Добавить слот
        </button>

        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => setIsEditingSchedule(false)}
            disabled={isSavingSchedule}
          >
            Отмена
          </Button>
          <Button type="button" className="flex-1" onClick={handleSaveSchedule} disabled={isSavingSchedule}>
            {isSavingSchedule ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Сохраняем...
              </>
            ) : (
              "Сохранить расписание"
            )}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={handleEnterScheduleEdit}
      className="flex items-start gap-2 rounded-xl border border-border p-3 text-left text-sm text-foreground"
    >
      <div className="flex-1">
        <p className="text-xs text-muted-foreground">Расписание</p>
        {student.scheduleSlots?.length > 0 ? (
          student.scheduleSlots.map((slot, index) => (
            <div key={index} className="text-sm font-semibold">
              {DAYS[slot.dayOfWeek]} · {slot.time}
            </div>
          ))
        ) : (
          <span className="text-sm text-muted-foreground">Расписание не задано</span>
        )}
      </div>
      <Pencil className="ml-auto size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  )
}

function CurriculumChecklistColumn({ studentId, kind, label, items, updatingId, onToggle }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{label}</p>
      <TruncatedList
        items={items}
        emptyLabel="Пусто"
        renderItem={(item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onToggle(studentId, kind, item)}
              disabled={updatingId === item.id}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted disabled:opacity-50"
            >
              {updatingId === item.id ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
              ) : item.covered ? (
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              ) : (
                <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
              <span className={item.covered ? "text-foreground" : "text-muted-foreground"}>{item.title}</span>
              {item.covered && item.coveredAt ? (
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
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

function CurriculumProgressDetail({ studentId, progress }) {
  const [updatingId, setUpdatingId] = useState(null)

  async function handleToggle(sid, kind, item) {
    if (updatingId) return
    setUpdatingId(item.id)
    try {
      await setCurriculumItemCovered(sid, kind, item.id, !item.covered)
    } catch (error) {
      console.error("Failed to update curriculum item:", error)
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground">Прогресс по программе</span>
        <span className="text-xs text-muted-foreground">
          Ручная корректировка — обычно отмечается через завершение урока
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CurriculumChecklistColumn
          studentId={studentId}
          kind="topics"
          label="Темы"
          items={progress.topics}
          updatingId={updatingId}
          onToggle={handleToggle}
        />
        <CurriculumChecklistColumn
          studentId={studentId}
          kind="prototypes"
          label="Прототипы"
          items={progress.prototypes}
          updatingId={updatingId}
          onToggle={handleToggle}
        />
      </div>
    </div>
  )
}

export function StudentRow({ student, progressSummary }) {
  const [expanded, setExpanded] = useState(false)
  const [isHomeworkDialogOpen, setIsHomeworkDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
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

  const initials = student.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

  const totalTopics = progressSummary?.topics.length ?? 0
  const coveredTopics = progressSummary?.topics.filter((topic) => topic.covered).length ?? 0
  const percent = totalTopics > 0 ? Math.round((coveredTopics / totalTopics) * 100) : null

  function stop(e) {
    e.stopPropagation()
  }

  return (
    <li className="border-b border-border last:border-0">
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
        className="flex cursor-pointer items-center gap-3 px-1 py-3 transition-colors hover:bg-muted/40"
      >
        <Link
          to={`/student/${student.id}`}
          onClick={stop}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground transition-colors hover:bg-secondary/80"
          aria-label={`Открыть дашборд ученика ${student.name}`}
        >
          {initials}
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-card-foreground">{student.name}</span>
            <StudentTags student={student} />
          </div>
        </div>

        {percent !== null ? (
          <div className="hidden shrink-0 items-center gap-2 sm:flex" style={{ width: "150px" }}>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
            </div>
            <span className="w-9 shrink-0 text-right text-xs text-muted-foreground">{percent}%</span>
          </div>
        ) : (
          <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">Программа не назначена</span>
        )}

        <div className="flex shrink-0 items-center gap-1" onClick={stop}>
          <button
            type="button"
            onClick={() => setIsHomeworkDialogOpen(true)}
            aria-label="Подготовить урок"
            title="Подготовить урок"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted"
          >
            <NotebookText className="size-4" aria-hidden="true" />
          </button>
          <ContactButton student={student} />
          <button
            type="button"
            onClick={() => setIsDeleteDialogOpen(true)}
            aria-label={`Удалить ученика ${student.name}`}
            title="Удалить ученика"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-red-600 transition-colors hover:bg-red-50"
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
          {expanded ? (
            <ChevronUp className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
        </div>
      </div>

      {expanded ? (
        <div className="ml-4 flex flex-col gap-4 border-l-2 border-border bg-muted/20 px-4 py-4 sm:ml-9">
          <ScheduleBlock student={student} />
          <StudentProfileSection student={student} />
          {liveProgress ? <CurriculumProgressDetail studentId={student.id} progress={liveProgress} /> : null}
        </div>
      ) : null}

      <HomeworkLessonDialog
        studentId={student.id}
        studentName={student.name}
        open={isHomeworkDialogOpen}
        onOpenChange={setIsHomeworkDialogOpen}
      />

      <DeleteStudentDialog
        studentId={student.id}
        studentName={student.name}
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      />
    </li>
  )
}
