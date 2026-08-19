import { useEffect, useRef, useState } from "react"
import { useParams, useSearchParams } from "react-router-dom"
import {
  Paperclip,
  CheckCircle2,
  Loader2,
  CalendarClock,
  X,
  Bell,
  Clock,
  TrendingUp,
  BookOpen,
  Layers,
  Flame,
  ChevronUp,
  ChevronDown,
  ArrowRight,
  Video,
  ChevronRight,
  CalendarDays,
  Target,
  Pencil,
  Settings,
} from "lucide-react"
import { StudentGrainBackground } from "@/components/student-grain-background"
import { ExamRadar } from "@/components/student/exam-radar"
import { CurriculumItemGroups } from "@/components/student/curriculum-item-groups"
import { MaterialsLibrary } from "@/components/materials-library"
import { LessonHistory } from "@/components/lesson-history"
import { NotificationsList } from "@/components/notifications-list"
import { formatLessonDateTime } from "@/lib/schedule"
import { formatRelativeTime } from "@/lib/notifications"
import { Spinner } from "@/components/ui/spinner"
import {
  GlassDialog,
  GlassDialogContent,
  GlassDialogTitle,
  GlassDialogDescription,
} from "@/components/glass-dialog"
import { LoginScreen } from "@/components/auth/login-screen"
import { usePageTitle } from "@/lib/usePageTitle"
import { subscribeToStudent, getStudentTelegramChatId, setStudentGoal } from "@/firebase/students"
import {
  subscribeToStudentNotifications,
  markNotificationRead,
} from "@/firebase/notifications"
import {
  subscribeToLessons,
  subscribeToUpcomingLesson,
  subscribeToAllUpcomingLessons,
  subscribeToLesson,
  proposeReschedule,
  confirmReschedule,
  cancelReschedule,
  proposeCancellation,
  confirmCancellation,
  rejectCancellation,
  submitHomeworkFile,
} from "@/firebase/lessons"
import { uploadHomeworkSubmissionFile } from "@/firebase/materials"
import { subscribeToVideoCallUrl } from "@/firebase/videoCall"
import { subscribeToPrograms } from "@/firebase/curriculum"
import { subscribeToExamTypes } from "@/firebase/examTypes"
import { openExternalLink } from "@/lib/telegramWebApp"
import { computeRadarMetrics, requiredItems, daysSinceLastUpdate } from "@/lib/examRadar"
import { UserPrefsProvider, useTimeZone } from "@/lib/user-prefs-context"
import { resolveTimeZone, localInputsToUtcDate, utcDateToLocalInput } from "@/lib/timezone"
import { updateStudentSettings } from "@/firebase/students"
import { SettingsDialog } from "@/components/settings-dialog"

function ProposeRescheduleDialog({ studentId, lessonId, initialDate, open, onOpenChange }) {
  const timeZone = useTimeZone()
  const [date, setDate] = useState("")
  const [time, setTime] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  // Was a remount-via-key on the parent (key={open ? "open" : "closed"}) —
  // that reset the form fields on each open, but also meant Base UI's
  // Dialog.Root was born already-open instead of transitioning
  // closed→open, so the entrance animation (data-[starting-style], same
  // transition every other GlassDialog/TeacherDialog uses) never had a
  // state change to actually animate. A plain effect keyed on `open`
  // gets the same "fresh fields every time it opens" behavior without
  // remounting the dialog itself.
  useEffect(() => {
    if (!open) return
    const [initialDatePart, initialTimePart] = initialDate
      ? utcDateToLocalInput(initialDate, timeZone).split("T")
      : ["", ""]
    setDate(initialDatePart)
    setTime(initialTimePart)
    setError("")
  }, [open, initialDate, timeZone])

  function handleOpenChange(nextOpen) {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      setDate("")
      setTime("")
      setError("")
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!date || !time || submitting) return

    setSubmitting(true)
    setError("")
    try {
      const proposedDate = localInputsToUtcDate(date, time, timeZone)
      await proposeReschedule(studentId, lessonId, proposedDate, "student")
      handleOpenChange(false)
    } catch (err) {
      console.error("Failed to propose reschedule:", err)
      setError(err?.message || "Не удалось отправить запрос на перенос")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <GlassDialog open={open} onOpenChange={handleOpenChange}>
      <GlassDialogContent>
        <GlassDialogTitle>Предложить перенос</GlassDialogTitle>
        <GlassDialogDescription>Выберите новую дату и время урока</GlassDialogDescription>

        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={submitting}
              className="glass-inset h-11 flex-1 rounded-2xl px-3.5 text-sm font-medium text-foreground outline-none transition-all focus:ring-4 focus:ring-primary/15 disabled:opacity-50"
            />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              disabled={submitting}
              className="glass-inset h-11 rounded-2xl px-3.5 text-sm font-medium text-foreground outline-none transition-all focus:ring-4 focus:ring-primary/15 disabled:opacity-50"
            />
          </div>

          {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}

          <button
            type="submit"
            disabled={!date || !time || submitting}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/60 bg-white/45 px-5 text-sm font-medium text-secondary-foreground backdrop-blur-md transition-colors hover:bg-white/70 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Отправляем...
              </>
            ) : (
              "Предложить перенос"
            )}
          </button>
        </form>
      </GlassDialogContent>
    </GlassDialog>
  )
}

function ProposeCancelDialog({ studentId, lessonId, lessonDate, open, onOpenChange }) {
  const timeZone = useTimeZone()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  function handleOpenChange(nextOpen) {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      setError("")
    }
  }

  async function handleConfirm() {
    if (submitting) return

    setSubmitting(true)
    setError("")
    try {
      await proposeCancellation(studentId, lessonId, "student")
      handleOpenChange(false)
    } catch (err) {
      console.error("Failed to propose cancellation:", err)
      setError(err?.message || "Не удалось отправить запрос на отмену")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <GlassDialog open={open} onOpenChange={handleOpenChange}>
      <GlassDialogContent>
        <GlassDialogTitle>Отменить урок</GlassDialogTitle>
        <GlassDialogDescription>
          Вы уверены, что хотите запросить отмену урока{lessonDate ? ` ${formatLessonDateTime(lessonDate, timeZone)}` : ""}?
        </GlassDialogDescription>

        {error ? <p className="mt-2 text-sm font-semibold text-destructive">{error}</p> : null}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
            className="flex-1 rounded-full border border-white/60 bg-white/45 px-5 py-3 text-sm font-medium text-secondary-foreground backdrop-blur-md transition-colors hover:bg-white/70 disabled:opacity-50"
          >
            Назад
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="flex flex-1 items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium text-destructive-foreground transition-transform hover:scale-[1.02] disabled:opacity-50"
            style={{ background: "var(--gradient-warm)", boxShadow: "var(--shadow-soft)" }}
          >
            {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : "Да, отменить"}
          </button>
        </div>
      </GlassDialogContent>
    </GlassDialog>
  )
}

// Reschedule/cancellation status plates — same tinted-glass-card language
// as ExamRadar's own status plate (color-mix'd background/border off a
// semantic token, a solid dot with a soft ring, sm text). `tone` picks
// which of the --status-* tokens (index.css) to tint with: "warn" (amber)
// for a pending reschedule, "bad" (red) for a pending/confirmed
// cancellation, "good" (green) for a confirmed reschedule.
function StatusPlate({ tone, title, children }) {
  const color = `var(--status-${tone})`
  return (
    <div
      className="rounded-3xl border p-4"
      style={{
        background: `color-mix(in oklab, ${color} 12%, transparent)`,
        borderColor: `color-mix(in oklab, ${color} 32%, transparent)`,
      }}
    >
      <p className="flex items-center gap-2.5 text-sm font-semibold text-foreground">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: color, boxShadow: `0 0 0 4px color-mix(in oklab, ${color} 20%, transparent)` }}
        />
        {title}
      </p>
      {children}
    </div>
  )
}

// Same primary/neutral button pair already used everywhere else on this
// page (video-call "Подключиться", "Перенести урок"/"Отменить урок") —
// confirm always gets the project's one accent gradient regardless of
// tone, reject stays neutral glass; only the StatusPlate wrapper itself
// carries the reschedule-vs-cancellation color semantics.
function StatusPlateActions({ onConfirm, confirmLabel, onReject, rejectLabel, disabled }) {
  return (
    <div className="mt-3 flex gap-2">
      <button
        type="button"
        onClick={onConfirm}
        disabled={disabled}
        className="flex-1 inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-destructive-foreground transition-transform hover:scale-[1.01] disabled:opacity-55 disabled:hover:scale-100"
        style={{ background: "var(--gradient-warm)", boxShadow: "var(--shadow-soft)" }}
      >
        {confirmLabel}
      </button>
      <button
        type="button"
        onClick={onReject}
        disabled={disabled}
        className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-white/60 bg-white/45 px-4 py-2.5 text-sm font-medium text-secondary-foreground backdrop-blur-md transition-colors hover:bg-white/70 disabled:opacity-55"
      >
        {rejectLabel}
      </button>
    </div>
  )
}

// Compact, single-line version of StatusPlate's color language — used per
// row inside "Мои уроки" where a full tinted card per lesson would be too
// heavy for a scrollable list.
function CompactStatusBadge({ tone, children }) {
  const color = `var(--status-${tone})`
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ background: `color-mix(in oklab, ${color} 15%, transparent)`, color }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
      {children}
    </span>
  )
}

// Read-only — no confirm/reject/reschedule affordances here on purpose,
// those live on the main "Следующий урок" card; this is just an overview
// of every upcoming draft across all of a student's schedule slots.
function UpcomingLessonRow({ lesson }) {
  const timeZone = useTimeZone()
  return (
    <li className="glass-inset flex flex-col gap-1.5 rounded-2xl px-4 py-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <CalendarDays className="size-3.5" aria-hidden="true" />
        {formatLessonDateTime(lesson.rescheduledDate ?? lesson.date, timeZone)}
      </div>
      <p className="text-sm text-secondary-foreground">
        {lesson.topic || <span className="text-muted-foreground">Без темы</span>}
      </p>

      {lesson.rescheduleStatus === "pending_student" || lesson.rescheduleStatus === "pending_teacher" ? (
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          <CompactStatusBadge tone="warn">
            {lesson.rescheduleStatus === "pending_student" ? "Ожидает вашего ответа" : "Перенос предложен"}
          </CompactStatusBadge>
          <span className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground line-through">
              {formatLessonDateTime(lesson.rescheduledDate ?? lesson.date, timeZone)}
            </span>
            <ArrowRight className="size-3 text-muted-foreground" aria-hidden="true" />
            <span className="font-semibold text-foreground">
              {lesson.rescheduleProposedDate ? formatLessonDateTime(lesson.rescheduleProposedDate, timeZone) : "—"}
            </span>
          </span>
        </div>
      ) : lesson.rescheduleStatus === "confirmed" ? (
        <CompactStatusBadge tone="good">Перенос подтверждён</CompactStatusBadge>
      ) : null}

      {lesson.cancellationStatus === "pending_student" || lesson.cancellationStatus === "pending_teacher" ? (
        <CompactStatusBadge tone="bad">
          {lesson.cancellationStatus === "pending_student" ? "Ожидает вашего ответа (отмена)" : "Отмена предложена"}
        </CompactStatusBadge>
      ) : null}
    </li>
  )
}

function AllUpcomingLessonsDialog({ studentId, open, onOpenChange }) {
  const [lessons, setLessons] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return

    setLoading(true)
    const unsub = subscribeToAllUpcomingLessons(
      studentId,
      (data) => {
        setLessons(data)
        setLoading(false)
      },
      (error) => {
        console.error("Failed to load all upcoming lessons:", error)
        setLoading(false)
      },
    )
    return () => unsub()
  }, [open, studentId])

  return (
    <GlassDialog open={open} onOpenChange={onOpenChange}>
      <GlassDialogContent>
        <GlassDialogTitle>Мои уроки</GlassDialogTitle>
        <GlassDialogDescription>Все предстоящие занятия по расписанию</GlassDialogDescription>

        <div className="scrollbar-hidden mt-4 max-h-[65vh] overflow-y-auto pr-1">
          {loading ? (
            <Spinner label="Загрузка..." />
          ) : lessons.length === 0 ? (
            <p className="text-sm text-muted-foreground">Пока нет запланированных уроков</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {lessons.map((lesson) => (
                <UpcomingLessonRow key={lesson.id} lesson={lesson} />
              ))}
            </ul>
          )}
        </div>
      </GlassDialogContent>
    </GlassDialog>
  )
}

// Block 4 — a goal (targetScore/examDate) now belongs to one specific
// program, not to the student as a whole (a student can have several
// programs, each with its own exam target). `heading` lets the wrapper
// below decide "Моя цель" (only one qualifying program) vs. the program's
// own subject name (several) — see MyGoalsSection.
function GoalCard({ studentId, program, examType, heading }) {
  const timeZone = useTimeZone()
  const [editing, setEditing] = useState(false)
  const [targetScore, setTargetScore] = useState("")
  const [examDate, setExamDate] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const hasGoal = program.targetScore != null && program.examDate != null
  // A "grade" scale (e.g. ОГЭ's 2-5) shows a bare number ("Целевая
  // оценка"), any other scale (ЕГЭ, custom types) shows the value with its
  // unit label — same rule ExamRadar applies to the read-only display.
  const isGradeScale = examType?.scaleType === "grade"
  // Hardcoded language-level scale (A1-C2) — targetScore stores the index
  // into examType.scaleLabels, not the label itself, same reasoning as any
  // other numeric targetScore (pace math in computeRadarMetrics stays
  // number-based); the select below just resolves index<->label at the
  // UI boundary.
  const isLanguageLevel = examType?.scaleType === "language_level"
  const scaleMin = examType?.scaleMin ?? 0
  const scaleMax = examType?.scaleMax ?? 100
  const scaleStep = examType?.scaleStep ?? 1
  const unitLabel = examType?.scaleUnitLabel || "балл"
  const goalLabel = isLanguageLevel ? "Целевой уровень" : isGradeScale ? "Целевая оценка" : `Целевой ${unitLabel}`
  // examType.scaleDefault (e.g. ЕГЭ's 70) wins when set; otherwise falls
  // back to the old behavior — scaleMax-1 for a grade scale, the scale's
  // own minimum otherwise (custom types created via the inline form never
  // set scaleDefault, so they keep the pre-existing default).
  const defaultTargetScore = examType?.scaleDefault ?? (isGradeScale ? scaleMax - 1 : scaleMin)

  function startEditing() {
    setTargetScore(
      program.targetScore != null ? String(program.targetScore) : String(defaultTargetScore),
    )
    setExamDate(program.examDate ? toDateInputValue(program.examDate) : "")
    setError("")
    setEditing(true)
  }

  async function handleSave() {
    if (saving) return
    setSaving(true)
    setError("")
    try {
      const dateValue = examDate ? new Date(`${examDate}T12:00:00`) : null
      await setStudentGoal(studentId, program.id, targetScore, dateValue)
      setEditing(false)
    } catch (err) {
      console.error("Failed to save student goal:", err)
      setError(err?.message || "Не удалось сохранить цель")
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <section className="glass-soft rounded-4xl p-6">
        <h3 className="font-display text-lg text-foreground">{heading}</h3>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <label className="flex-1">
            <span className="text-xs text-muted-foreground">{goalLabel}</span>
            {isLanguageLevel ? (
              <select
                value={targetScore}
                onChange={(e) => setTargetScore(e.target.value)}
                disabled={saving}
                className="glass-inset mt-1 w-full rounded-2xl px-4 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/60 disabled:opacity-60"
              >
                {(examType?.scaleLabels ?? []).map((label, index) => (
                  <option key={label} value={index}>
                    {label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="number"
                min={String(scaleMin)}
                max={String(scaleMax)}
                step={String(scaleStep)}
                value={targetScore}
                onChange={(e) => setTargetScore(e.target.value)}
                disabled={saving}
                placeholder={String(scaleMin)}
                className="glass-inset mt-1 w-full rounded-2xl px-4 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/60 disabled:opacity-60"
              />
            )}
          </label>
          <label className="flex-1">
            <span className="text-xs text-muted-foreground">Дата экзамена</span>
            <input
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              disabled={saving}
              className="glass-inset mt-1 w-full rounded-2xl px-4 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/60 disabled:opacity-60"
            />
          </label>
        </div>

        {error ? <p className="mt-2 text-sm font-semibold text-destructive">{error}</p> : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={saving}
            className="rounded-full border border-white/60 bg-white/45 px-5 py-2.5 text-sm font-medium text-secondary-foreground backdrop-blur-md transition-colors hover:bg-white/70 disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !targetScore || !examDate}
            className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-destructive-foreground transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
            style={{ background: "var(--gradient-warm)", boxShadow: "var(--shadow-soft)" }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : "Сохранить"}
          </button>
        </div>
      </section>
    )
  }

  if (!hasGoal) {
    return (
      <section className="glass-soft flex flex-wrap items-center gap-4 rounded-4xl p-6">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-primary-foreground"
          style={{ background: "var(--gradient-warm)" }}
        >
          <Target className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-[14rem] flex-1">
          <h3 className="font-display text-lg text-foreground">{heading}</h3>
          <p className="mt-1 text-sm text-secondary-foreground">Укажи цель, чтобы видеть свой прогресс к экзамену</p>
        </div>
        <button
          type="button"
          onClick={startEditing}
          className="rounded-full px-5 py-2.5 text-sm font-medium text-primary-foreground"
          style={{ background: "var(--gradient-warm)", boxShadow: "var(--shadow-soft)" }}
        >
          Заполнить
        </button>
      </section>
    )
  }

  return (
    <section className="glass-soft rounded-4xl p-6">
      <div className="flex items-center gap-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-primary-foreground"
          style={{ background: "var(--gradient-warm)" }}
        >
          <Target className="h-5 w-5" aria-hidden="true" />
        </span>
        <h3 className="font-display text-lg text-foreground">{heading}</h3>
        <button
          type="button"
          onClick={startEditing}
          aria-label="Изменить цель"
          className="ml-auto text-muted-foreground transition hover:text-primary"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <div className="glass-inset flex-1 rounded-3xl p-4">
          <p className="text-xs text-muted-foreground">{goalLabel}</p>
          <p className="mt-1 font-display text-2xl text-primary">
            {isLanguageLevel ? (examType?.scaleLabels?.[program.targetScore] ?? program.targetScore) : program.targetScore}
          </p>
        </div>
        <div className="glass-inset flex-1 rounded-3xl p-4">
          <p className="text-xs text-muted-foreground">Дата экзамена</p>
          <p className="mt-1 font-display text-lg text-foreground">{formatShortDate(program.examDate, timeZone)}</p>
        </div>
      </div>
    </section>
  )
}

// Block 4 Phase 3 — replaces the old single-goal MyGoalCard. Filters to
// programs whose examType has a real scale (scaleType !== "none" — a
// "Школьная программа"-style program never participates in goals at all,
// same as the old examTarget === "school" exclusion). Singular "Моя цель"
// heading + the old rich single-card layout when there's exactly one such
// program (unchanged from before multi-program support); "Мои цели" +
// one full card per program, headed by its own subject name, when there
// are several.
function MyGoalsSection({ studentId, programs, examTypesById }) {
  const qualifying = programs.filter((program) => {
    const examType = examTypesById[program.examTypeId]
    return examType && examType.scaleType !== "none"
  })

  if (qualifying.length === 0) return null

  if (qualifying.length === 1) {
    const program = qualifying[0]
    return (
      <GoalCard
        studentId={studentId}
        program={program}
        examType={examTypesById[program.examTypeId]}
        heading="Моя цель"
      />
    )
  }

  return (
    <section>
      <h2 className="font-display text-lg text-foreground">Мои цели</h2>
      <div className="mt-3 space-y-3">
        {qualifying.map((program) => (
          <GoalCard
            key={program.id}
            studentId={studentId}
            program={program}
            examType={examTypesById[program.examTypeId]}
            heading={program.subject || "Без предмета"}
          />
        ))}
      </div>
    </section>
  )
}

function NextLessonPlate({ studentId, hasSchedule }) {
  const timeZone = useTimeZone()
  const [lesson, setLesson] = useState(null)
  const [cancelledLesson, setCancelledLesson] = useState(null)
  const [actionPending, setActionPending] = useState(false)
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [allLessonsOpen, setAllLessonsOpen] = useState(false)
  const [uploadingHomework, setUploadingHomework] = useState(false)
  const [uploadHomeworkError, setUploadHomeworkError] = useState("")
  const homeworkFileInputRef = useRef(null)
  const lastLessonIdRef = useRef(null)
  const [videoCallUrl, setVideoCallUrl] = useState(null)

  // Reads off lesson.teacherId (denormalized onto every lesson doc, multi-
  // tenancy Phase 1) rather than a separate student-doc field, since this
  // component only ever loads studentId/hasSchedule as props — the lesson
  // subscription below already has to run first regardless.
  useEffect(() => {
    if (!lesson?.teacherId) {
      setVideoCallUrl(null)
      return
    }

    const unsub = subscribeToVideoCallUrl(lesson.teacherId, setVideoCallUrl, (error) =>
      console.error("Failed to load video call url:", error),
    )
    return () => unsub()
  }, [lesson?.teacherId])

  // Client-only availability window (replaces the old server-maintained
  // lesson.videoCallAvailable flag + its every-5-minutes Cloud Function —
  // deliberately simplified: a plain time comparison against the lesson's
  // own effective date, ticking every 30s while mounted, no server round
  // trip). Active from 3 minutes before the lesson through 60 minutes after
  // its start, matching the window the old scheduler used.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(interval)
  }, [])

  const videoCallActive = (() => {
    const effectiveDate = lesson?.rescheduledDate ?? lesson?.date
    if (!effectiveDate) return false
    const msUntilStart = effectiveDate.getTime() - now.getTime()
    return msUntilStart <= 3 * 60 * 1000 && msUntilStart >= -60 * 60 * 1000
  })()

  async function handleHomeworkFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingHomework(true)
    setUploadHomeworkError("")

    try {
      const fileUrl = await uploadHomeworkSubmissionFile(file, studentId)
      await submitHomeworkFile(studentId, fileUrl)
    } catch (err) {
      console.error("Failed to submit homework file:", err)
      setUploadHomeworkError("Не удалось загрузить файл")
    } finally {
      setUploadingHomework(false)
      if (homeworkFileInputRef.current) {
        homeworkFileInputRef.current.value = ""
      }
    }
  }

  useEffect(() => {
    const unsubscribe = subscribeToUpcomingLesson(
      studentId,
      (nextLesson) => {
        setLesson(nextLesson)
        if (nextLesson) {
          lastLessonIdRef.current = nextLesson.id
          setCancelledLesson(null)
        }
      },
      (error) => {
        console.error("Failed to load upcoming lesson:", error)
      },
    )

    return unsubscribe
  }, [studentId])

  // subscribeToUpcomingLesson only matches status === "upcoming", so the
  // moment a lesson stops being upcoming it drops out of that query entirely
  // (onData(null)) — whether because it was completed (doc persists with
  // status "completed") or cancelled (confirmCancellation now deletes the
  // doc outright, see core/lessons.js). To actually show "Урок отменён" for
  // that brief window before the next draft lesson appears, the last known
  // lesson id is watched directly: the doc no longer existing is exactly the
  // cancellation case (completion never deletes the doc), until either that
  // resolves or a new upcoming lesson shows up above.
  useEffect(() => {
    if (lesson || !lastLessonIdRef.current) {
      return
    }

    const lessonId = lastLessonIdRef.current
    const unsubscribe = subscribeToLesson(
      studentId,
      lessonId,
      (doc) => {
        setCancelledLesson(doc === null || doc?.status === "cancelled" ? { id: lessonId } : null)
      },
      (error) => {
        console.error("Failed to check cancelled lesson:", error)
      },
    )

    return unsubscribe
  }, [lesson, studentId])

  async function handleConfirmCancellation() {
    if (actionPending || !lesson) return
    setActionPending(true)
    try {
      await confirmCancellation(studentId, lesson.id, "student")
    } catch (err) {
      console.error("Failed to confirm cancellation:", err)
    } finally {
      setActionPending(false)
    }
  }

  async function handleRejectCancellation() {
    if (actionPending || !lesson) return
    setActionPending(true)
    try {
      await rejectCancellation(studentId, lesson.id)
    } catch (err) {
      console.error("Failed to reject cancellation:", err)
    } finally {
      setActionPending(false)
    }
  }

  async function handleConfirmReschedule() {
    if (actionPending || !lesson) return
    setActionPending(true)
    try {
      await confirmReschedule(studentId, lesson.id, "student")
    } catch (err) {
      console.error("Failed to confirm reschedule:", err)
    } finally {
      setActionPending(false)
    }
  }

  async function handleRejectReschedule() {
    if (actionPending || !lesson) return
    setActionPending(true)
    try {
      await cancelReschedule(studentId, lesson.id)
    } catch (err) {
      console.error("Failed to reject reschedule:", err)
    } finally {
      setActionPending(false)
    }
  }

  const showPlaceholder = !hasSchedule || (!lesson && !cancelledLesson)
  const assignment = lesson?.homework.assignment
  const hasAssignment = Boolean(assignment) && (assignment.text.trim() !== "" || assignment.files.length > 0)
  const submissionFiles = lesson?.homework.submission.files ?? []
  const lastSubmission = submissionFiles[submissionFiles.length - 1]

  return (
    <section aria-labelledby="next-lesson-title" className="glass rounded-4xl p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-display text-[0.7rem] font-medium tracking-[0.02em] text-muted-foreground">
            Следующий урок
          </p>
          <h2
            id="next-lesson-title"
            className={`font-display mt-2 leading-tight text-balance ${
              showPlaceholder || cancelledLesson ? "text-2xl sm:text-3xl" : "text-3xl sm:text-[2.6rem]"
            } ${cancelledLesson ? "text-destructive" : "text-foreground"}`}
          >
            {cancelledLesson
              ? "Урок отменён"
              : showPlaceholder
                ? "Преподаватель ещё не добавил расписание"
                : formatLessonDateTime(lesson.rescheduledDate ?? lesson.date, timeZone)}
          </h2>
        </div>
        {hasSchedule ? (
          <button
            type="button"
            onClick={() => setAllLessonsOpen(true)}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground sm:text-sm"
          >
            <span className="sm:hidden">Все уроки</span>
            <span className="hidden sm:inline">Посмотреть все уроки</span>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <AllUpcomingLessonsDialog studentId={studentId} open={allLessonsOpen} onOpenChange={setAllLessonsOpen} />

      <div className="mt-5 flex flex-col gap-5">
        {lesson?.rescheduleStatus === "pending_student" ? (
          <StatusPlate tone="warn" title="Репетитор предлагает перенос">
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground line-through">
                {formatLessonDateTime(lesson.rescheduledDate ?? lesson.date, timeZone)}
              </span>
              <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="font-semibold text-foreground">
                {lesson.rescheduleProposedDate ? formatLessonDateTime(lesson.rescheduleProposedDate, timeZone) : "—"}
              </span>
            </p>
            <StatusPlateActions
              onConfirm={handleConfirmReschedule}
              confirmLabel="Подтвердить"
              onReject={handleRejectReschedule}
              rejectLabel="Отклонить"
              disabled={actionPending}
            />
          </StatusPlate>
        ) : null}

        {lesson?.rescheduleStatus === "pending_teacher" ? (
          <StatusPlate tone="warn" title="Запрос на перенос отправлен">
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground line-through">
                {formatLessonDateTime(lesson.rescheduledDate ?? lesson.date, timeZone)}
              </span>
              <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="font-semibold text-foreground">
                {lesson.rescheduleProposedDate ? formatLessonDateTime(lesson.rescheduleProposedDate, timeZone) : "—"}
              </span>
            </p>
          </StatusPlate>
        ) : null}

        {lesson?.rescheduleStatus === "confirmed" ? (
          <StatusPlate tone="good" title="Перенос подтверждён" />
        ) : null}

        {lesson?.cancellationStatus === "pending_student" ? (
          <StatusPlate tone="bad" title="Репетитор предлагает отменить этот урок">
            <StatusPlateActions
              onConfirm={handleConfirmCancellation}
              confirmLabel="Подтвердить отмену"
              onReject={handleRejectCancellation}
              rejectLabel="Отклонить"
              disabled={actionPending}
            />
          </StatusPlate>
        ) : null}

        {lesson?.cancellationStatus === "pending_teacher" ? (
          <StatusPlate tone="bad" title="Запрос на отмену отправлен" />
        ) : null}

        {lesson ? (
          <>
            {videoCallUrl ? (
              <div className="glass-inset grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-3xl p-5">
                <div className="min-w-0">
                  <p className="font-display text-[0.7rem] font-medium tracking-[0.02em] text-muted-foreground">
                    Видеовстреча
                  </p>
                  <p className="mt-1 truncate text-sm text-secondary-foreground">
                    {videoCallActive ? "Ссылка активна" : "Станет доступна за 3 минуты до начала"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openExternalLink(videoCallUrl)}
                  disabled={!videoCallActive}
                  className="inline-flex shrink-0 items-center gap-2 rounded-full px-5 py-3 text-sm font-medium text-destructive-foreground transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                  style={{ background: "var(--gradient-warm)", boxShadow: "var(--shadow-soft)" }}
                >
                  <Video className="h-4 w-4" aria-hidden="true" />
                  Подключиться
                </button>
              </div>
            ) : null}

            <div className="glass-inset rounded-3xl p-5">
              <span className="font-display text-[0.7rem] font-medium tracking-[0.02em] text-muted-foreground">
                Задание
              </span>
              {hasAssignment ? (
                <div className="mt-1.5 flex flex-col gap-1.5">
                  {assignment.text ? <p className="text-sm text-secondary-foreground">{assignment.text}</p> : null}
                  {assignment.files.length > 0 ? (
                    <ul className="flex flex-col gap-1">
                      {assignment.files.map((file, index) => (
                        <li key={`${file.url}-${index}`}>
                          <a
                            href={file.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1.5 text-sm font-semibold text-foreground underline underline-offset-2"
                          >
                            <Paperclip className="size-3.5 shrink-0" aria-hidden="true" />
                            <span className="truncate">{file.title}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : (
                <p className="mt-1.5 text-sm text-secondary-foreground">Задание пока не добавлено</p>
              )}
            </div>

            <div className="glass-inset rounded-3xl p-5">
              <span className="font-display text-[0.7rem] font-medium tracking-[0.02em] text-muted-foreground">
                Моя домашка
              </span>
              {submissionFiles.length === 0 ? (
                <p className="mt-1.5 text-sm text-secondary-foreground">Вы ещё не отправили домашнее задание</p>
              ) : (
                <>
                  <p className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-secondary-foreground">
                    <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
                    Домашнее задание получено ✓
                    {lastSubmission?.submittedAt ? (
                      <span className="font-normal text-muted-foreground">
                        ({formatLessonDateTime(lastSubmission.submittedAt, timeZone)})
                      </span>
                    ) : null}
                  </p>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {submissionFiles.map((file, index) => (
                      <li key={`${file.url}-${index}`}>
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 text-sm text-foreground underline underline-offset-2"
                        >
                          <Paperclip className="size-3.5 shrink-0" aria-hidden="true" />
                          <span className="truncate">
                            Файл {index + 1}
                            {file.submittedAt ? ` (${formatLessonDateTime(file.submittedAt, timeZone)})` : ""}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <input
                ref={homeworkFileInputRef}
                type="file"
                onChange={handleHomeworkFileChange}
                disabled={uploadingHomework}
                className="hidden"
              />
              <button
                type="button"
                disabled={uploadingHomework}
                onClick={() => homeworkFileInputRef.current?.click()}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm text-ink-foreground transition-transform hover:scale-[1.02] disabled:opacity-50"
              >
                {uploadingHomework ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    Загрузка...
                  </>
                ) : (
                  <>
                    <Paperclip className="size-4" aria-hidden="true" />
                    Прикрепить домашку
                  </>
                )}
              </button>
              {uploadHomeworkError ? (
                <p className="mt-1.5 text-xs font-semibold text-destructive">{uploadHomeworkError}</p>
              ) : null}
              <p className="mt-3 text-xs text-muted-foreground">Или отправить в бот в ТГ/ВК</p>
            </div>

            {lesson.rescheduleStatus !== "pending_teacher" || lesson.cancellationStatus !== "pending_teacher" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {lesson.rescheduleStatus !== "pending_teacher" ? (
                  <button
                    type="button"
                    onClick={() => setRescheduleDialogOpen(true)}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-white/60 bg-white/45 px-5 py-3 text-sm font-medium text-secondary-foreground backdrop-blur-md transition-colors hover:bg-white/70"
                  >
                    <CalendarClock className="h-4 w-4" />
                    Перенести урок
                  </button>
                ) : null}
                {lesson.cancellationStatus !== "pending_teacher" ? (
                  <button
                    type="button"
                    onClick={() => setCancelDialogOpen(true)}
                    className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium text-destructive-foreground transition-transform hover:scale-[1.02]"
                    style={{ background: "var(--gradient-warm)", boxShadow: "var(--shadow-soft)" }}
                  >
                    <X className="h-4 w-4" />
                    Отменить урок
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {lesson ? (
        <>
          <ProposeRescheduleDialog
            studentId={studentId}
            lessonId={lesson.id}
            initialDate={lesson.rescheduledDate ?? lesson.date}
            open={rescheduleDialogOpen}
            onOpenChange={setRescheduleDialogOpen}
          />

          <ProposeCancelDialog
            studentId={studentId}
            lessonId={lesson.id}
            lessonDate={lesson.rescheduledDate ?? lesson.date}
            open={cancelDialogOpen}
            onOpenChange={setCancelDialogOpen}
          />
        </>
      ) : null}
    </section>
  )
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

function toJsDate(value) {
  return value?.toDate?.() ?? value ?? null
}

function formatShortDate(value, timeZone) {
  const date = toJsDate(value)
  if (!date) return ""
  return date.toLocaleDateString("ru-RU", { timeZone, day: "numeric", month: "long" })
}

// Local (not UTC) YYYY-MM-DD for a controlled <input type="date"> value —
// toISOString() would shift the date by a day for some timezones since it
// normalizes to UTC first, which a plain calendar date (exam day, no
// meaningful time component) should never do.
function toDateInputValue(value) {
  const date = toJsDate(value)
  if (!date) return ""
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function pluralizeTopics(n) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return "тема"
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "темы"
  return "тем"
}

function CurriculumProgressBar({ icon: Icon, label, done, total }) {
  const percent = total > 0 ? (done / total) * 100 : 0
  return (
    <div className="glass-inset rounded-3xl p-4">
      <div className="flex items-center gap-2.5">
        <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
        <span className="text-sm text-secondary-foreground">{label}</span>
        <span className="ml-auto text-sm">
          <b className="font-display">{done}</b>
          <span className="text-muted-foreground"> / {total}</span>
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/55">
        <div className="h-full rounded-full" style={{ width: `${percent}%`, background: "var(--gradient-warm)" }} />
      </div>
    </div>
  )
}

// Pure display of already-accumulated progress — no write path here (that's
// the teacher marking topics covered during lesson completion). Hidden
// entirely for students with no program assigned (no curriculumProgress
// doc), never shown as "0%". Visual container migrated to the mockup's
// ProgressCard.tsx; the mockup's own motivational tile computes a
// "paceMultiplier" stat this app has no logic for, so per instruction that
// slot instead holds this app's own existing "на этой неделе" line/logic,
// unchanged.
// progress is now lifted to StudentDashboardContent (Phase 3) — ExamRadar
// needs the exact same curriculumProgress subscription to decide which of
// the two cards to render at all, so a second independent listener here
// would be redundant. `null` while the parent's own subscription hasn't
// resolved yet, same as before.
function CurriculumProgressCard({ progress, subjectLabel }) {
  const [expanded, setExpanded] = useState(false)

  if (!progress) return null

  const coveredTopics = progress.topics.filter((topic) => topic.covered)
  const remainingTopics = progress.topics.filter((topic) => !topic.covered)
  const totalTopics = progress.topics.length

  const coveredPrototypes = progress.prototypes.filter((prototype) => prototype.covered)
  const remainingPrototypes = progress.prototypes.filter((prototype) => !prototype.covered)
  const totalPrototypes = progress.prototypes.length

  const totalProgressItems = totalTopics + totalPrototypes
  const coveredProgressItems = coveredTopics.length + coveredPrototypes.length
  const overallPercent = totalProgressItems > 0 ? Math.round((coveredProgressItems / totalProgressItems) * 100) : 0

  const needsReviewItems = [...coveredTopics, ...coveredPrototypes].filter((item) => item.needsReview)

  const weekAgo = Date.now() - SEVEN_DAYS_MS
  const coveredThisWeek = coveredTopics.filter((topic) => {
    const date = toJsDate(topic.coveredAt)
    return date && date.getTime() >= weekAgo
  }).length

  return (
    <section className="glass-soft rounded-4xl p-6 sm:p-7">
      <div className="flex items-center gap-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-primary-foreground"
          style={{ background: "var(--gradient-warm)" }}
        >
          <TrendingUp className="h-5 w-5" aria-hidden="true" />
        </span>
        <h3 className="font-display text-lg text-foreground">
          Прогресс подготовки{subjectLabel ? ` — ${subjectLabel}` : ""}
        </h3>
        <span className="ml-auto font-display text-2xl text-primary">{overallPercent}%</span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <CurriculumProgressBar icon={BookOpen} label="Темы" done={coveredTopics.length} total={totalTopics} />
        {totalPrototypes > 0 ? (
          <CurriculumProgressBar
            icon={Layers}
            label="Типы задач"
            done={coveredPrototypes.length}
            total={totalPrototypes}
          />
        ) : null}
      </div>

      {needsReviewItems.length > 0 ? (
        <div className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-400">
          <span className="font-semibold">К повторению: </span>
          {needsReviewItems
            .slice(0, 3)
            .map((item) => item.title)
            .join(", ")}
          {needsReviewItems.length > 3 ? ` и ещё ${needsReviewItems.length - 3}` : ""}
        </div>
      ) : null}

      {coveredThisWeek > 0 ? (
        <div className="glass-inset mt-3 flex items-start gap-3 rounded-3xl p-4">
          <Flame className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-sm text-secondary-foreground">
            На этой неделе пройдено <b className="text-primary">{coveredThisWeek}</b>{" "}
            {pluralizeTopics(coveredThisWeek)}
          </p>
        </div>
      ) : null}

      {expanded ? (
        <div className={`mt-4 grid gap-6 ${totalPrototypes > 0 ? "sm:grid-cols-2" : "grid-cols-1"}`}>
          <CurriculumItemGroups icon={BookOpen} title="Темы" covered={coveredTopics} remaining={remainingTopics} />
          {totalPrototypes > 0 ? (
            <CurriculumItemGroups
              icon={Layers}
              title="Прототипы"
              covered={coveredPrototypes}
              remaining={remainingPrototypes}
            />
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary"
      >
        {expanded ? "Свернуть" : "Подробнее"}
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
    </section>
  )
}

function AllNotificationsDialog({ notifications, open, onOpenChange, onNotificationClick }) {
  return (
    <GlassDialog open={open} onOpenChange={onOpenChange}>
      <GlassDialogContent>
        <GlassDialogTitle>Все уведомления</GlassDialogTitle>
        <GlassDialogDescription>Последние {notifications.length} уведомлений</GlassDialogDescription>

        <div className="scrollbar-hidden mt-6 max-h-[60vh] overflow-y-auto">
          <NotificationsList
            notifications={notifications}
            onNotificationClick={onNotificationClick}
            glass
            enableProposalActions
          />
        </div>
      </GlassDialogContent>
    </GlassDialog>
  )
}

function StudentNotifications({ studentId }) {
  const timeZone = useTimeZone()
  const [notifications, setNotifications] = useState([])
  const [allOpen, setAllOpen] = useState(false)
  const hasUnread = notifications.some((notification) => !notification.read)
  const lastNotification = notifications[0] ?? null

  useEffect(() => {
    const unsubscribe = subscribeToStudentNotifications(studentId, setNotifications, (firestoreError) => {
      console.error("Failed to load notifications:", firestoreError)
    })

    return unsubscribe
  }, [studentId])

  async function handleNotificationClick(notification) {
    if (!notification.read) {
      try {
        await markNotificationRead(notification.id)
      } catch (err) {
        console.error("Failed to mark notification read:", err)
      }
    }
  }

  return (
    <section className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 rounded-4xl bg-ink px-6 py-5 text-ink-foreground shadow-[var(--shadow-soft)]">
      <Clock className="h-5 w-5 shrink-0 opacity-70" aria-hidden="true" />

      {lastNotification ? (
        <button
          type="button"
          onClick={() => handleNotificationClick(lastNotification)}
          className="flex min-w-0 flex-col gap-0.5 text-left"
        >
          <span className={`text-sm leading-relaxed ${lastNotification.read ? "opacity-90" : ""}`}>
            {lastNotification.text}
          </span>
          <span className="text-xs opacity-50">{formatRelativeTime(lastNotification.createdAt, timeZone)}</span>
        </button>
      ) : (
        <span className="min-w-0 text-sm text-ink-foreground/60">Нет новых уведомлений</span>
      )}

      <button
        type="button"
        onClick={() => setAllOpen(true)}
        className="relative inline-flex shrink-0 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs"
      >
        <Bell className="h-3.5 w-3.5" aria-hidden="true" />
        Все
        {hasUnread ? (
          <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-primary" />
        ) : null}
      </button>

      <AllNotificationsDialog
        notifications={notifications}
        open={allOpen}
        onOpenChange={setAllOpen}
        onNotificationClick={handleNotificationClick}
      />
    </section>
  )
}

const LOCKED_MATERIALS = [
  { id: "locked-1", title: "??????", isLocked: true, type: "secret" },
  { id: "locked-2", title: "??????", isLocked: true, type: "secret" },
]

function getAuthKey(studentId) {
  return `auth_${studentId}`
}

function getFirstName(fullName) {
  return fullName.trim().split(/\s+/)[0] || fullName
}

function getInitial(name) {
  return name.trim().charAt(0).toUpperCase() || "?"
}

function StudentDashboardContent({ studentId }) {
  usePageTitle("Моя панель")
  const [student, setStudent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lessons, setLessons] = useState([])
  const [lessonsLoading, setLessonsLoading] = useState(true)
  const [lessonsError, setLessonsError] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    const unsubscribe = subscribeToStudent(
      studentId,
      (data) => {
        setStudent(data)
        setLoading(false)
      },
      (firestoreError) => {
        console.error("Failed to load student:", firestoreError)
        setError("Не удалось загрузить данные ученика")
        setLoading(false)
      },
    )

    return unsubscribe
  }, [studentId])

  useEffect(() => {
    const unsub = subscribeToLessons(
      studentId,
      (data) => {
        setLessons(data)
        setLessonsLoading(false)
      },
      (fetchError) => {
        console.error("Failed to load lessons:", fetchError)
        setLessonsError("Не удалось загрузить историю уроков")
        setLessonsLoading(false)
      },
    )

    return () => unsub()
  }, [studentId])

  // Block 4 — a student can have several programs at once (one per
  // subject); each renders its own goal/radar/progress block independently
  // below (MyGoalsSection + the per-program map further down), replacing
  // the old single curriculumProgress/main subscription.
  const [programs, setPrograms] = useState([])

  useEffect(() => {
    const unsubscribe = subscribeToPrograms(studentId, setPrograms, (error) =>
      console.error("Failed to load programs:", error),
    )
    return () => unsubscribe()
  }, [studentId])

  // Resolves each program's examTypeId against the owning teacher's own
  // examTypes list (GoalCard/ExamRadar need scaleType/scaleMin/scaleMax/
  // scaleUnitLabel, not just a name). student.teacherId is the denormalized
  // field mapStudentDoc exposes for exactly this.
  const [examTypes, setExamTypes] = useState([])

  useEffect(() => {
    if (!student?.teacherId) {
      setExamTypes([])
      return
    }
    const unsubscribe = subscribeToExamTypes(student.teacherId, setExamTypes, (error) =>
      console.error("Failed to load exam types:", error),
    )
    return unsubscribe
  }, [student?.teacherId])

  if (loading) {
    return <Spinner label="Загрузка данных ученика..." />
  }

  if (error) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-3 py-16 text-center">
        <p className="text-lg font-semibold text-destructive">{error}</p>
      </div>
    )
  }

  if (!student) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-3 py-16 text-center">
        <p className="text-lg font-semibold text-foreground">Ученик не найден</p>
      </div>
    )
  }

  const firstName = getFirstName(student.name)

  const completedMaterials = lessons
    .filter((lesson) => lesson.status === "completed" || !lesson.status)
    .flatMap((lesson) => [
      ...(lesson.materials || []),
      ...(lesson.homework?.assignment?.files || []),
    ].map((material) => ({ ...material, lessonDate: lesson.date })))

  const seenMaterialUrls = new Set()
  const dedupedMaterials = completedMaterials.filter((material) => {
    if (seenMaterialUrls.has(material.url)) return false
    seenMaterialUrls.add(material.url)
    return true
  })

  const allMaterials = [...dedupedMaterials, ...LOCKED_MATERIALS]

  const examTypesById = Object.fromEntries(examTypes.map((type) => [type.id, type]))

  // Block 4 Phase 3 — per-program toggle: a program with both
  // targetScore/examDate filled gets its own independent ExamRadar block
  // (its own computeRadarMetrics call, its own topics/prototypes/
  // assignedAt); every other program (scaleType "none", or a real scale
  // but no goal filled in yet) gets the plain progress card instead. Both
  // kinds can be present at once for the same student.
  const programBlocks = programs.map((program) => {
    const hasGoal = program.targetScore != null && program.examDate != null
    const metrics = hasGoal
      ? computeRadarMetrics({
          examDate: program.examDate,
          targetScore: program.targetScore,
          topics: program.topics,
          prototypes: program.prototypes,
          assignedAt: program.assignedAt,
        })
      : null
    return {
      program,
      examType: examTypesById[program.examTypeId] ?? null,
      hasGoal,
      metrics,
      requiredTopics: requiredItems(program.topics, program.targetScore),
      requiredPrototypes: requiredItems(program.prototypes, program.targetScore),
      staleDays: daysSinceLastUpdate(program.topics, program.prototypes),
    }
  })

  // Multi-tenancy Phase 4a: "teacher-theme" (pink) if this student picked
  // it, "" (plain root/amber tokens, the pre-existing default) otherwise —
  // mirrors TeacherDashboard.jsx's own themeClass resolution but the other
  // direction (see index.css's .teacher-theme doc comment for why this
  // scope class works fine either way round).
  const themeClass = student.colorTheme === "pink" ? "teacher-theme" : ""
  const resolvedTimeZone = resolveTimeZone(student.timezone)

  return (
    <UserPrefsProvider timeZone={resolvedTimeZone} themeClass={themeClass}>
    <div className={`relative mx-auto flex w-full max-w-3xl flex-col gap-5 px-5 py-10 sm:py-14 ${themeClass}`}>
      <header className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">Добро пожаловать</p>
          <h1 className="font-display truncate text-2xl text-foreground sm:text-3xl">
            Привет, {firstName}! ✌️
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Настройки"
          className="glass-soft grid size-11 shrink-0 place-items-center rounded-full text-foreground/70 transition hover:text-foreground"
        >
          <Settings className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="glass-soft grid h-14 w-14 shrink-0 place-items-center rounded-full font-display text-lg text-foreground">
          {getInitial(firstName)}
        </div>
      </header>

      <SettingsDialog
        variant="student"
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        timezone={student.timezone ?? ""}
        colorTheme={student.colorTheme ?? "amber"}
        onSave={(values) => updateStudentSettings(studentId, values)}
      />

      <NextLessonPlate studentId={studentId} hasSchedule={Boolean(student.scheduleSlots?.length)} />

      <StudentNotifications studentId={studentId} />

      <MyGoalsSection studentId={studentId} programs={programs} examTypesById={examTypesById} />

      {programBlocks.map(({ program, examType, hasGoal, metrics, requiredTopics, requiredPrototypes, staleDays }) =>
        hasGoal && metrics ? (
          <ExamRadar
            key={program.id}
            subject={[program.subject].filter(Boolean)}
            examTypeName={examType?.name ?? "—"}
            scaleType={examType?.scaleType}
            scaleUnitLabel={examType?.scaleUnitLabel}
            scaleLabels={examType?.scaleLabels}
            targetScore={program.targetScore}
            metrics={metrics}
            requiredTopics={requiredTopics}
            requiredPrototypes={requiredPrototypes}
            staleDays={staleDays}
          />
        ) : (
          <CurriculumProgressCard key={program.id} progress={program} subjectLabel={program.subject} />
        ),
      )}

      <MaterialsLibrary materials={allMaterials} loading={lessonsLoading} error={lessonsError} />

      <LessonHistory
        studentId={studentId}
        lessons={lessons.filter((lesson) => lesson.status !== "upcoming")}
        loading={lessonsLoading}
        error={lessonsError}
      />
    </div>
    </UserPrefsProvider>
  )
}

function StudentGate({ studentId }) {
  const [searchParams] = useSearchParams()
  const skipPinRequested = searchParams.get("skipPin") === "true"

  const [authorized, setAuthorized] = useState(
    () => localStorage.getItem(getAuthKey(studentId)) != null,
  )
  const [checkingSkipPin, setCheckingSkipPin] = useState(skipPinRequested)

  // skipPin=true alone proves nothing — anyone can type it into a plain
  // browser URL. The actual trust signal is the Telegram WebApp's own
  // initDataUnsafe.user.id genuinely matching this student's stored
  // telegramChatId; only then is the PIN screen skipped, and even then
  // only after confirming it against Firestore, never trusting the URL by
  // itself.
  useEffect(() => {
    if (!skipPinRequested || authorized) {
      setCheckingSkipPin(false)
      return
    }

    const telegramUserId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id ?? null
    if (!telegramUserId) {
      setCheckingSkipPin(false)
      return
    }

    let cancelled = false

    getStudentTelegramChatId(studentId)
      .then((telegramChatId) => {
        if (cancelled) return
        if (telegramChatId && telegramChatId === String(telegramUserId)) {
          localStorage.setItem(getAuthKey(studentId), "true")
          setAuthorized(true)
        }
      })
      .catch((error) => console.error("Failed to verify Telegram identity for skipPin:", error))
      .finally(() => {
        if (!cancelled) setCheckingSkipPin(false)
      })

    return () => {
      cancelled = true
    }
  }, [studentId, skipPinRequested, authorized])

  if (checkingSkipPin) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-4">
        <Spinner label="Проверка входа..." />
      </main>
    )
  }

  if (!authorized) {
    return (
      <LoginScreen
        studentId={studentId}
        onSuccess={() => setAuthorized(true)}
      />
    )
  }

  return (
    <main className="relative min-h-screen overflow-hidden">
      <StudentGrainBackground />
      <StudentDashboardContent studentId={studentId} />
    </main>
  )
}

export function StudentDashboard() {
  const { studentId } = useParams()

  if (!studentId) {
    return (
      <main className="min-h-screen bg-background px-4 py-8 sm:px-6">
        <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-3 py-16 text-center">
          <p className="text-lg font-semibold text-foreground">Ученик не найден</p>
        </div>
      </main>
    )
  }

  return <StudentGate key={studentId} studentId={studentId} />
}
