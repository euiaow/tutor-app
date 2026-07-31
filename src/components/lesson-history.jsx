import { useEffect, useState } from "react"
import { CalendarDays, CheckCircle2, ChevronRight, XCircle } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { GlassDialog, GlassDialogContent, GlassDialogTitle } from "@/components/glass-dialog"
import { MaterialLink } from "@/components/material-link"
import { StatusBadge } from "@/components/status-badge"
import { subscribeToLessons } from "@/firebase/lessons"

const VISIBLE_COUNT = 3

const ATTENDANCE_BADGES = {
  on_time: { label: "Вовремя", variant: "success" },
  late: { label: "Опоздал", variant: "warning" },
  absent: { label: "Не пришёл", variant: "danger" },
}

const RATING_BADGES = {
  excellent: { label: "Отлично", variant: "success" },
  good: { label: "Хорошо", variant: "primary" },
  needs_work: { label: "Старайся лучше", variant: "warning" },
}

function formatDate(date) {
  if (!date) {
    return "—"
  }

  return date.toLocaleDateString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "long",
    year: "numeric",
  })
}

// Distinct from StatusBadge's pastel pills on purpose — a light "surface"
// plate (bg-card + shadow) for the positive state, a flat muted plate for
// the negative one, so the two read as clearly different at a glance
// rather than two similarly-weighted pastel tones.
function HomeworkStatus({ done }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        done ? "bg-card text-foreground shadow-sm" : "bg-muted text-muted-foreground"
      }`}
    >
      {done ? (
        <CheckCircle2 className="size-3.5 text-primary" aria-hidden="true" />
      ) : (
        <XCircle className="size-3.5" aria-hidden="true" />
      )}
      {done ? "Домашка сделана" : "Домашка не сделана"}
    </span>
  )
}

function LessonCard({ lesson }) {
  const attendance = ATTENDANCE_BADGES[lesson.attendance]
  const rating = RATING_BADGES[lesson.rating]

  return (
    <li className="glass-soft flex flex-col gap-3 rounded-4xl p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarDays className="size-3.5" aria-hidden="true" />
          {formatDate(lesson.date)}
        </div>
        {attendance ? <StatusBadge variant={attendance.variant}>{attendance.label}</StatusBadge> : null}
      </div>

      <p className="font-display text-base text-foreground text-balance">
        {lesson.topic || <span className="text-muted-foreground">Без темы</span>}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <HomeworkStatus done={lesson.homeworkDone} />
        {rating ? <StatusBadge variant={rating.variant}>{rating.label}</StatusBadge> : null}
      </div>

      {lesson.materials && lesson.materials.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {lesson.materials.map((material, index) => (
            <li key={material.id ?? material.url ?? index}>
              <MaterialLink material={material} />
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  )
}

// Subscribes on demand the moment it's opened, rather than reusing the
// page-load fetch — decoupled from whatever the small preview list above
// already has in memory.
function LessonHistoryDialog({ studentId, open, onOpenChange }) {
  const [lessons, setLessons] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open) return

    setLoading(true)
    setError("")

    const unsub = subscribeToLessons(
      studentId,
      (data) => {
        setLessons(data.filter((lesson) => lesson.status !== "upcoming"))
        setLoading(false)
      },
      (fetchError) => {
        console.error("Failed to load full lesson history:", fetchError)
        setError("Не удалось загрузить историю уроков")
        setLoading(false)
      },
    )

    return () => unsub()
  }, [open, studentId])

  return (
    <GlassDialog open={open} onOpenChange={onOpenChange}>
      <GlassDialogContent className="max-w-2xl">
        <GlassDialogTitle>История уроков</GlassDialogTitle>

        <div className="scrollbar-hidden mt-4 max-h-[70vh] overflow-y-auto pr-1">
          {loading ? (
            <Spinner label="Загрузка уроков..." />
          ) : error ? (
            <p className="text-sm font-semibold text-destructive">{error}</p>
          ) : lessons.length === 0 ? (
            <p className="text-sm text-muted-foreground">Уроки пока не добавлены</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {lessons.map((lesson) => (
                <LessonCard key={lesson.id} lesson={lesson} />
              ))}
            </ul>
          )}
        </div>
      </GlassDialogContent>
    </GlassDialog>
  )
}

export function LessonHistory({ studentId, lessons, loading, error }) {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)

  return (
    <section aria-labelledby="lesson-history-title" className="flex flex-col gap-3">
      <h2 id="lesson-history-title" className="font-display px-1 text-lg text-foreground">
        История уроков
      </h2>

      {loading ? (
        <Spinner label="Загрузка уроков..." />
      ) : error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="font-semibold text-destructive">{error}</p>
        </div>
      ) : lessons.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <p className="text-muted-foreground">Уроки пока не добавлены</p>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {lessons.slice(0, VISIBLE_COUNT).map((lesson) => (
              <LessonCard key={lesson.id} lesson={lesson} />
            ))}
          </ul>
          {lessons.length > VISIBLE_COUNT ? (
            <button
              type="button"
              onClick={() => setIsHistoryOpen(true)}
              className="inline-flex items-center gap-1 self-start text-sm font-medium text-primary"
            >
              Показать всю историю
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </>
      )}

      <LessonHistoryDialog studentId={studentId} open={isHistoryOpen} onOpenChange={setIsHistoryOpen} />
    </section>
  )
}
