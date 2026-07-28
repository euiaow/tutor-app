import { useState } from "react"
import { Link } from "react-router-dom"
import { CalendarDays, Sparkles, Plus } from "lucide-react"
import { AddLessonDialog } from "@/components/teacher/add-lesson-dialog"
import { addXpToStudent, updateStudentSchedule } from "@/firebase/students"
import { DAY_OPTIONS, getNextLessonDate, formatNextLessonDate } from "@/lib/schedule"

export function StudentCard({ student }) {
  const [isAddingXp, setIsAddingXp] = useState(false)
  const [isSavingSchedule, setIsSavingSchedule] = useState(false)

  const initials = student.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

  async function handleAddXp() {
    if (isAddingXp) return

    setIsAddingXp(true)
    try {
      await addXpToStudent(student.id, 10)
    } catch (error) {
      console.error("Failed to add XP:", error)
    } finally {
      setIsAddingXp(false)
    }
  }

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
      <div style={{background: 'red', color: 'white', padding: '20px', fontSize: '24px'}}>ТЕСТ ИЗМЕНЕНИЯ 1</div>
      <header className="flex items-center gap-3">
        <Link
          to={`/student/${student.id}`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-sm font-bold text-secondary-foreground transition-colors hover:bg-secondary/80"
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
      </header>

      <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5 text-sm text-foreground">
        <CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" />
        <span className="text-muted-foreground">Следующее занятие:</span>
        <span className="ml-auto font-semibold">
          {formatNextLessonDate(getNextLessonDate(student.schedule))}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-muted-foreground">Расписание</span>
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

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={handleAddXp}
          disabled={isAddingXp}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Plus className="size-4" aria-hidden="true" />
          {isAddingXp ? "..." : "10 XP"}
        </button>
        <AddLessonDialog studentId={student.id} />
      </div>
    </article>
  )
}
