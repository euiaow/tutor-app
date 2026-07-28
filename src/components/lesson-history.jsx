import { CalendarDays, CheckCircle2, XCircle } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { MaterialLink } from "@/components/material-link"

const ATTENDANCE_BADGES = {
  on_time: {
    label: "Вовремя",
    className: "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",
  },
  late: {
    label: "Опоздал",
    className: "bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400",
  },
  absent: {
    label: "Не пришёл",
    className: "bg-destructive/10 text-destructive dark:bg-destructive/20",
  },
}

const RATING_BADGES = {
  excellent: {
    label: "Отлично",
    className: "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",
  },
  good: {
    label: "Хорошо",
    className: "bg-sky-500/15 text-sky-700 dark:bg-sky-500/20 dark:text-sky-400",
  },
  needs_work: {
    label: "Старайся лучше",
    className: "bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400",
  },
}

function formatDate(date) {
  if (!date) {
    return "—"
  }

  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" })
}

function Badge({ label, className }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
      {label}
    </span>
  )
}

function LessonCard({ lesson }) {
  const attendance = ATTENDANCE_BADGES[lesson.attendance]
  const rating = RATING_BADGES[lesson.rating]

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-card-foreground">
          <CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" />
          {formatDate(lesson.date)}
        </div>
        {attendance ? <Badge {...attendance} /> : null}
      </div>

      <p className="text-base font-bold text-card-foreground text-balance">
        {lesson.topic || "Без темы"}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={`flex items-center gap-1.5 text-sm font-medium ${
            lesson.homeworkDone ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
          }`}
        >
          {lesson.homeworkDone ? (
            <CheckCircle2 className="size-4" aria-hidden="true" />
          ) : (
            <XCircle className="size-4" aria-hidden="true" />
          )}
          {lesson.homeworkDone ? "Домашка сделана" : "Домашка не сделана"}
        </span>
        {rating ? <Badge {...rating} /> : null}
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

export function LessonHistory({ lessons, loading, error }) {
  return (
    <section aria-labelledby="lesson-history-title" className="flex flex-col gap-3">
      <h2 id="lesson-history-title" className="text-lg font-extrabold text-foreground">
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
        <ul className="flex flex-col gap-3">
          {lessons.map((lesson) => (
            <LessonCard key={lesson.id} lesson={lesson} />
          ))}
        </ul>
      )}
    </section>
  )
}
