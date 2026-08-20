import { useEffect, useState } from "react"
import { CalendarDays, CheckCircle2, CircleDashed, ChevronRight } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Spinner } from "@/components/ui/spinner"
import { GlassDialog, GlassDialogContent, GlassDialogTitle } from "@/components/glass-dialog"
import { MaterialLink } from "@/components/material-link"
import { subscribeToLessons } from "@/firebase/lessons"
import { useTimeZone } from "@/lib/user-prefs-context"
import { useDateLocale } from "@/lib/i18n"

const VISIBLE_COUNT = 3
const ATTENDANCE_KEYS = ["on_time", "late", "absent"]
const RATING_KEYS = ["excellent", "good", "needs_work"]

function formatDate(date, timeZone, locale) {
  if (!date) {
    return "—"
  }

  return date.toLocaleDateString(locale, {
    timeZone,
    day: "2-digit",
    month: "long",
    year: "numeric",
  })
}

// 3-tone glass pill, local to lesson history only — ported from "redesign
// student v3"'s own Badge (LessonHistory.tsx). Deliberately not shared with
// StatusBadge: that one's multi-hue palette (green/amber/red) is a working
// tool for the teacher scanning many students at a glance, which is a
// different job than a student's own single-lesson history reading as calm
// glass. tone="warm" is the one highlighted/positive state (on-time
// attendance, a set grade); everything else is neutral or muted glass, no
// per-status hue.
function Badge({ children, tone = "neutral" }) {
  const tones = {
    neutral: "bg-white/60 text-secondary-foreground",
    warm: "text-primary-foreground",
    muted: "bg-white/45 text-muted-foreground",
    cancelled: "bg-destructive/10 text-destructive",
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${tones[tone]}`}
      style={tone === "warm" ? { background: "var(--gradient-warm)" } : undefined}
    >
      {children}
    </span>
  )
}

function LessonCard({ lesson }) {
  const { t } = useTranslation("student")
  const timeZone = useTimeZone()
  const dateLocale = useDateLocale()
  const isCancelled = lesson.status === "cancelled"

  return (
    <li className="glass-soft flex flex-col gap-3 rounded-4xl p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarDays className="size-3.5" aria-hidden="true" />
          {formatDate(lesson.date, timeZone, dateLocale)}
        </div>
        {isCancelled ? (
          <Badge tone="cancelled">{t("history.cancelled")}</Badge>
        ) : ATTENDANCE_KEYS.includes(lesson.attendance) ? (
          <Badge tone={lesson.attendance === "on_time" ? "warm" : "muted"}>
            {t(`history.attendance.${lesson.attendance}`)}
          </Badge>
        ) : null}
      </div>

      <p className="font-display text-base text-foreground text-balance">
        {lesson.topic || <span className="text-muted-foreground">{t("common.noTopic")}</span>}
      </p>

      {/* Attendance/homework/rating aren't meaningful for a lesson that
          never happened — a cancelled lesson only shows its "Отменён"
          badge above instead. */}
      {!isCancelled ? (
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={lesson.homeworkDone ? "neutral" : "muted"}>
            {lesson.homeworkDone ? (
              <CheckCircle2 className="size-3.5 text-primary" aria-hidden="true" />
            ) : (
              <CircleDashed className="size-3.5" aria-hidden="true" />
            )}
            {lesson.homeworkDone ? t("history.homeworkDone") : t("history.homeworkNotDone")}
          </Badge>
          {RATING_KEYS.includes(lesson.rating) ? <Badge tone="warm">{t(`history.rating.${lesson.rating}`)}</Badge> : null}
        </div>
      ) : null}

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
  const { t } = useTranslation("student")
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
        setError(t("history.loadError"))
        setLoading(false)
      },
    )

    return () => unsub()
  }, [open, studentId])

  return (
    <GlassDialog open={open} onOpenChange={onOpenChange}>
      <GlassDialogContent className="max-w-2xl">
        <GlassDialogTitle>{t("history.dialogTitle")}</GlassDialogTitle>

        <div className="scrollbar-hidden mt-4 max-h-[70vh] overflow-y-auto pr-1">
          {loading ? (
            <Spinner label={t("history.loading")} />
          ) : error ? (
            <p className="text-sm font-semibold text-destructive">{error}</p>
          ) : lessons.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("history.empty")}</p>
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
  const { t } = useTranslation("student")
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)

  return (
    <section aria-labelledby="lesson-history-title" className="flex flex-col gap-3">
      <h2 id="lesson-history-title" className="font-display px-1 text-lg text-foreground">
        {t("history.title")}
      </h2>

      {loading ? (
        <Spinner label={t("history.loading")} />
      ) : error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="font-semibold text-destructive">{error}</p>
        </div>
      ) : lessons.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <p className="text-muted-foreground">{t("history.empty")}</p>
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
              {t("history.showAll")}
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </>
      )}

      <LessonHistoryDialog studentId={studentId} open={isHistoryOpen} onOpenChange={setIsHistoryOpen} />
    </section>
  )
}
