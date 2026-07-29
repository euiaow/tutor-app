import { useState } from "react"
import { Link } from "react-router-dom"
import { NotebookText, Pencil, Plus, Trash2, Loader2 } from "lucide-react"
import { HomeworkLessonDialog } from "@/components/teacher/homework-lesson-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { updateStudentSchedule, deleteStudent } from "@/firebase/students"
import { ensureUpcomingLesson } from "@/firebase/lessons"
import { DAY_OPTIONS } from "@/lib/schedule"

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
      // No need to close/reset here — the card this dialog belongs to
      // unmounts once the students onSnapshot listener drops the deleted
      // student, taking the dialog with it.
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

export function StudentCard({ student }) {
  const [isSavingSchedule, setIsSavingSchedule] = useState(false)
  const [isEditingSchedule, setIsEditingSchedule] = useState(false)
  const [localSlots, setLocalSlots] = useState([])
  const [isHomeworkDialogOpen, setIsHomeworkDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  const initials = student.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

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

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      <header className="flex items-center gap-3">
        <Link
          to={`/student/${student.id}`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground transition-colors hover:bg-secondary/80"
          aria-label={`Открыть дашборд ученика ${student.name}`}
        >
          {initials}
        </Link>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-bold text-card-foreground">
            <Link to={`/student/${student.id}`} className="hover:text-primary">
              {student.name}
            </Link>
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setIsDeleteDialogOpen(true)}
          className="group flex h-8 shrink-0 items-center gap-1.5 overflow-hidden rounded-lg bg-red-50 px-2 text-red-600 transition-colors hover:bg-red-100"
          aria-label={`Удалить ученика ${student.name}`}
          title="Удалить ученика"
        >
          <Trash2 className="size-4 shrink-0" aria-hidden="true" />
          <span className="max-w-0 overflow-hidden text-xs font-semibold whitespace-nowrap transition-all group-hover:max-w-24">
            Удалить
          </span>
        </button>
      </header>

      {isEditingSchedule ? (
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
      ) : (
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
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => setIsHomeworkDialogOpen(true)}
          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-background text-sm font-semibold text-foreground transition-colors hover:bg-muted"
        >
          <NotebookText className="size-4" aria-hidden="true" />
          Подготовить урок
        </button>
      </div>

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
    </article>
  )
}
