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
  RotateCcw,
  ChevronUp,
  ChevronDown,
} from "lucide-react"
import bgGlass from "@/assets/bg-glass.jpg"
import { MaterialsLibrary } from "@/components/materials-library"
import { LessonHistory } from "@/components/lesson-history"
import { NotificationsList } from "@/components/notifications-list"
import { formatLessonDateTime } from "@/lib/schedule"
import { formatRelativeTime } from "@/lib/notifications"
import { Spinner } from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"
import {
  GlassDialog,
  GlassDialogContent,
  GlassDialogTitle,
  GlassDialogDescription,
} from "@/components/glass-dialog"
import { LoginScreen } from "@/components/auth/login-screen"
import { subscribeToStudent, getStudentTelegramChatId } from "@/firebase/students"
import {
  subscribeToStudentNotifications,
  markNotificationRead,
} from "@/firebase/notifications"
import {
  subscribeToLessons,
  subscribeToUpcomingLesson,
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
import { subscribeToCurriculumProgress } from "@/firebase/curriculum"
import { TruncatedList } from "@/components/truncated-list"
import { openExternalLink } from "@/lib/telegramWebApp"

// datetime-local inputs want "YYYY-MM-DDTHH:mm" in the device's local
// timezone, not UTC — offsetting by getTimezoneOffset() before calling
// toISOString() (which is always UTC) gets that local wall-clock string.
// Mirrors TeacherDashboard's identical helper.
function toDatetimeLocal(date) {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function ProposeRescheduleDialog({ studentId, lessonId, initialDate, open, onOpenChange }) {
  const [initialDatePart, initialTimePart] = initialDate
    ? toDatetimeLocal(initialDate).split("T")
    : ["", ""]
  const [date, setDate] = useState(initialDatePart)
  const [time, setTime] = useState(initialTimePart)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

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
      const proposedDate = new Date(`${date}T${time}:00`)
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
          Вы уверены, что хотите запросить отмену урока{lessonDate ? ` ${formatLessonDateTime(lessonDate)}` : ""}?
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

// Visual container migrated to the "redesign v2" mockup's glass card
// (glass/glass-inset utilities, see index.css) — every state below keeps
// its exact original logic/handlers. States the mockup didn't draw at all
// (reschedule/cancellation banners, cancelled/no-schedule headings, the
// video-call button, upload errors) previously relied on
// text-primary-foreground/bg-primary-foreground assuming a solid
// bg-primary backdrop; now that the plate itself is a light glass card
// (per the mockup), those were mechanically remapped to their light-glass
// equivalents (border-border/text-foreground/bg-muted, text-destructive
// instead of text-red-200, etc.) purely so they stay legible — not
// redrawn or restyled beyond that. See the migration report for the full
// list of these remaps.
function NextLessonPlate({ studentId, hasSchedule }) {
  const [lesson, setLesson] = useState(null)
  const [cancelledLesson, setCancelledLesson] = useState(null)
  const [actionPending, setActionPending] = useState(false)
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [uploadingHomework, setUploadingHomework] = useState(false)
  const [uploadHomeworkError, setUploadHomeworkError] = useState("")
  const homeworkFileInputRef = useRef(null)
  const lastLessonIdRef = useRef(null)
  const [videoCallUrl, setVideoCallUrl] = useState(null)

  useEffect(() => {
    const unsub = subscribeToVideoCallUrl(setVideoCallUrl, (error) =>
      console.error("Failed to load video call url:", error),
    )
    return () => unsub()
  }, [])

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
      <div className="flex items-end justify-between gap-4">
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
                : formatLessonDateTime(lesson.rescheduledDate ?? lesson.date)}
          </h2>
        </div>
        <span
          aria-hidden="true"
          className="hidden h-16 w-16 shrink-0 rounded-full sm:block"
          style={{ background: "var(--gradient-warm)", boxShadow: "var(--shadow-soft)" }}
        />
      </div>

      <div className="mt-5 flex flex-col gap-5">
        {lesson?.rescheduleStatus === "pending_student" ? (
          <div className="glass-inset rounded-3xl p-4">
            <p className="text-sm font-semibold text-secondary-foreground">
              📅 Репетитор предлагает перенос на{" "}
              {lesson.rescheduleProposedDate ? formatLessonDateTime(lesson.rescheduleProposedDate) : "—"}
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                size="sm"
                className="flex-1 bg-yellow-500 text-yellow-950 hover:bg-yellow-400"
                onClick={handleConfirmReschedule}
                disabled={actionPending}
              >
                ✅ Подтвердить
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1 border-border bg-transparent text-foreground hover:bg-muted"
                onClick={handleRejectReschedule}
                disabled={actionPending}
              >
                ❌ Отклонить
              </Button>
            </div>
          </div>
        ) : null}

        {lesson?.rescheduleStatus === "pending_teacher" ? (
          <div className="rounded-3xl bg-yellow-500/20 p-4">
            <p className="text-sm font-semibold text-foreground">🕐 Запрос на перенос отправлен</p>
          </div>
        ) : null}

        {lesson?.rescheduleStatus === "confirmed" ? (
          <div className="rounded-3xl bg-green-500/20 p-4">
            <p className="text-sm font-semibold text-foreground">✅ Перенос подтверждён</p>
          </div>
        ) : null}

        {lesson?.cancellationStatus === "pending_student" ? (
          <div className="rounded-3xl bg-red-500/20 p-4">
            <p className="text-sm font-semibold text-foreground">Репетитор предлагает отменить этот урок.</p>
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                size="sm"
                className="flex-1 bg-red-600 text-white hover:bg-red-700"
                onClick={handleConfirmCancellation}
                disabled={actionPending}
              >
                Подтвердить отмену
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1 border-border bg-transparent text-foreground hover:bg-muted"
                onClick={handleRejectCancellation}
                disabled={actionPending}
              >
                Отклонить
              </Button>
            </div>
          </div>
        ) : null}

        {lesson?.cancellationStatus === "pending_teacher" ? (
          <div className="rounded-3xl bg-red-500/20 p-4">
            <p className="text-sm font-semibold text-foreground">🔴 Запрос на отмену отправлен</p>
          </div>
        ) : null}

        {lesson ? (
          <>
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
                        ({formatLessonDateTime(lastSubmission.submittedAt)})
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
                            {file.submittedAt ? ` (${formatLessonDateTime(file.submittedAt)})` : ""}
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

            {videoCallUrl ? (
              <button
                type="button"
                onClick={() => openExternalLink(videoCallUrl)}
                className="inline-flex items-center justify-center gap-2 self-start rounded-full border border-white/60 bg-white/45 px-5 py-3 text-sm font-medium text-secondary-foreground backdrop-blur-md transition-colors hover:bg-white/70"
              >
                🎥 Подключиться
              </button>
            ) : null}

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
            key={rescheduleDialogOpen ? "open" : "closed"}
            studentId={studentId}
            lessonId={lesson.id}
            initialDate={lesson.rescheduledDate ?? lesson.date}
            open={rescheduleDialogOpen}
            onOpenChange={setRescheduleDialogOpen}
          />

          <ProposeCancelDialog
            key={cancelDialogOpen ? "open-cancel" : "closed-cancel"}
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

function formatShortDate(value) {
  const date = toJsDate(value)
  if (!date) return ""
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })
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

function CurriculumItemGroups({ title, covered, remaining }) {
  return (
    <section className="glass-inset rounded-3xl p-5">
      <p className="font-display text-[0.7rem] font-medium text-muted-foreground">{title}</p>
      <div className="mt-4 grid gap-8 sm:grid-cols-2">
        <div>
          <p className="mb-2.5 text-xs text-muted-foreground">Пройдено · {covered.length}</p>
          <TruncatedList
            items={covered}
            emptyLabel={null}
            className="space-y-1.5"
            renderItem={(item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 text-sm text-secondary-foreground"
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  {item.needsReview ? (
                    <RotateCcw className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                  ) : null}
                  <span className={`truncate ${item.needsReview ? "text-primary" : ""}`}>{item.title}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatShortDate(item.coveredAt)}</span>
              </li>
            )}
          />
        </div>

        <div>
          <p className="mb-2.5 text-xs text-muted-foreground">Осталось · {remaining.length}</p>
          <TruncatedList
            items={remaining}
            emptyLabel={null}
            className="space-y-1.5"
            renderItem={(item) => (
              <li key={item.id} className="truncate text-sm text-secondary-foreground">
                {item.title}
              </li>
            )}
          />
        </div>
      </div>
    </section>
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
function CurriculumProgressCard({ studentId }) {
  const [progress, setProgress] = useState(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const unsubscribe = subscribeToCurriculumProgress(studentId, setProgress, (error) =>
      console.error("Failed to load curriculum progress:", error),
    )
    return () => unsubscribe()
  }, [studentId])

  if (!progress) return null

  const coveredTopics = progress.topics.filter((topic) => topic.covered)
  const remainingTopics = progress.topics.filter((topic) => !topic.covered)
  const totalTopics = progress.topics.length
  const topicsPercent = totalTopics > 0 ? Math.round((coveredTopics.length / totalTopics) * 100) : 0

  const coveredPrototypes = progress.prototypes.filter((prototype) => prototype.covered)
  const remainingPrototypes = progress.prototypes.filter((prototype) => !prototype.covered)
  const totalPrototypes = progress.prototypes.length

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
        <h3 className="font-display text-lg text-foreground">Прогресс подготовки</h3>
        <span className="ml-auto font-display text-2xl text-primary">{topicsPercent}%</span>
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
        <div className="mt-4 space-y-3">
          <CurriculumItemGroups title="Темы" covered={coveredTopics} remaining={remainingTopics} />
          {totalPrototypes > 0 ? (
            <CurriculumItemGroups title="Прототипы" covered={coveredPrototypes} remaining={remainingPrototypes} />
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
          <NotificationsList notifications={notifications} onNotificationClick={onNotificationClick} glass />
        </div>
      </GlassDialogContent>
    </GlassDialog>
  )
}

function StudentNotifications({ studentId }) {
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
          <span className="text-xs opacity-50">{formatRelativeTime(lastNotification.createdAt)}</span>
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
  const [student, setStudent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lessons, setLessons] = useState([])
  const [lessonsLoading, setLessonsLoading] = useState(true)
  const [lessonsError, setLessonsError] = useState(null)

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

  return (
    <div className="relative mx-auto flex w-full max-w-3xl flex-col gap-5 px-5 py-10 sm:py-14">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">Добро пожаловать</p>
          <h1 className="font-display truncate text-2xl text-foreground sm:text-3xl">
            Привет, {firstName}! ✌️
          </h1>
        </div>
        <div className="glass-soft grid h-14 w-14 shrink-0 place-items-center rounded-full font-display text-lg text-foreground">
          {getInitial(firstName)}
        </div>
      </header>

      <NextLessonPlate studentId={studentId} hasSchedule={Boolean(student.scheduleSlots?.length)} />

      <StudentNotifications studentId={studentId} />

      <CurriculumProgressCard studentId={studentId} />

      <MaterialsLibrary materials={allMaterials} loading={lessonsLoading} error={lessonsError} />

      <LessonHistory
        studentId={studentId}
        lessons={lessons.filter((lesson) => lesson.status !== "upcoming")}
        loading={lessonsLoading}
        error={lessonsError}
      />
    </div>
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
      <img
        src={bgGlass}
        alt=""
        aria-hidden="true"
        width={1920}
        height={1280}
        className="pointer-events-none fixed inset-0 h-full w-full object-cover"
      />
      {/* Same grey-glass mechanism as GlassDialogContent (white translucency
          + backdrop-blur), applied to the page itself instead of a popup —
          kept a step more transparent than the glass/glass-soft/glass-inset
          card surfaces (30/43/28%) so cards still read as the foreground
          layer rather than blending into the page. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 bg-white/22 backdrop-blur-2xl" />
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
