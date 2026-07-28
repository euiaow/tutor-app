import { useState } from "react"
import { Link } from "react-router-dom"
import { CalendarDays, Sparkles, NotebookText, Pencil, Trash2, Loader2 } from "lucide-react"
import { HomeworkLessonDialog } from "@/components/teacher/homework-lesson-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { updateStudentSchedule, deleteStudent } from "@/firebase/students"
import { DAY_OPTIONS, getNextLessonDate, formatNextLessonDate } from "@/lib/schedule"

const XP_PER_LEVEL = 100

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
  const [isHomeworkDialogOpen, setIsHomeworkDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  const initials = student.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

  const xpPercent = Math.min(100, Math.round((student.xp / XP_PER_LEVEL) * 100))
  const xpToNextLevel = XP_PER_LEVEL - student.xp

  async function handleScheduleChange(field, value) {
    const nextSchedule = {
      dayOfWeek: student.schedule?.dayOfWeek ?? 1,
      time: student.schedule?.time ?? "16:00",
      durationMinutes: student.schedule?.durationMinutes ?? 60,
      [field]: value,
    }

    setIsSavingSchedule(true)
    try {
      await updateStudentSchedule(student.id, nextSchedule)
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
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold text-card-foreground">
            <Link to={`/student/${student.id}`} className="hover:text-primary">
              {student.name}
            </Link>
          </h2>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
            Уровень {student.level} · {student.xp} XP
          </p>
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

      <div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${xpPercent}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {xpToNextLevel} XP до {student.level + 1} уровня
        </p>
      </div>

      {isEditingSchedule ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Расписание</span>
            <button
              type="button"
              onClick={() => setIsEditingSchedule(false)}
              className="text-xs font-semibold text-primary hover:underline"
            >
              Готово
            </button>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={student.schedule?.dayOfWeek ?? ""}
              onChange={(e) => handleScheduleChange("dayOfWeek", Number(e.target.value))}
              disabled={isSavingSchedule}
              className="h-9 flex-1 rounded-lg border border-border bg-background px-2 text-sm text-foreground outline-none disabled:opacity-50"
            >
              <option value="" disabled>
                День недели
              </option>
              {DAY_OPTIONS.map((day) => (
                <option key={day.value} value={day.value}>
                  {day.label}
                </option>
              ))}
            </select>
            <input
              type="time"
              value={student.schedule?.time ?? ""}
              onChange={(e) => handleScheduleChange("time", e.target.value)}
              disabled={isSavingSchedule}
              className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground outline-none disabled:opacity-50"
            />
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsEditingSchedule(true)}
          className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted/70"
        >
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="text-muted-foreground">Следующее занятие:</span>
          <span className="font-semibold">
            {formatNextLessonDate(getNextLessonDate(student.schedule))}
          </span>
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
