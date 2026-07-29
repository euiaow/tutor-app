import { useEffect, useRef, useState } from "react"
import { useParams } from "react-router-dom"
import { Paperclip, CheckCircle2, Loader2 } from "lucide-react"
import { LevelCard } from "@/components/level-card"
import { MaterialsLibrary } from "@/components/materials-library"
import { Achievements } from "@/components/achievements"
import { LessonHistory } from "@/components/lesson-history"
import { LessonStats } from "@/components/lesson-stats"
import { NotificationIcon, NotificationsList } from "@/components/notifications-list"
import { formatLessonDateTime } from "@/lib/schedule"
import { formatRelativeTime } from "@/lib/notifications"
import { Spinner } from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { LoginScreen } from "@/components/auth/login-screen"
import { subscribeToStudent } from "@/firebase/students"
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogTitle>Предложить перенос</DialogTitle>
        <DialogDescription>Выберите новую дату и время урока</DialogDescription>

        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={submitting}
              className="h-11 flex-1 rounded-xl border-2 border-border bg-secondary/40 px-3.5 text-sm font-medium text-foreground outline-none transition-all focus:border-primary focus:bg-card focus:ring-4 focus:ring-primary/15 disabled:opacity-50"
            />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              disabled={submitting}
              className="h-11 rounded-xl border-2 border-border bg-secondary/40 px-3.5 text-sm font-medium text-foreground outline-none transition-all focus:border-primary focus:bg-card focus:ring-4 focus:ring-primary/15 disabled:opacity-50"
            />
          </div>

          {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}

          <Button type="submit" size="lg" disabled={!date || !time || submitting} className="h-12">
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Отправляем...
              </>
            ) : (
              "Предложить перенос"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogTitle>Отменить урок</DialogTitle>
        <DialogDescription>
          Вы уверены, что хотите запросить отмену урока{lessonDate ? ` ${formatLessonDateTime(lessonDate)}` : ""}?
        </DialogDescription>

        {error ? <p className="mt-2 text-sm font-semibold text-destructive">{error}</p> : null}

        <div className="mt-6 flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            Назад
          </Button>
          <Button
            type="button"
            className="flex-1 bg-red-600 text-white hover:bg-red-700"
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : "Да, отменить"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Reuses the gradient "plate" visual style that used to belong to
// NextLessonCard (src/components/next-lesson-card.jsx, now unused) so the
// homework-aware upcoming lesson stays visually the same top-of-page card.
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
    <section
      aria-labelledby="next-lesson-title"
      className="relative overflow-hidden rounded-3xl bg-primary p-6 text-primary-foreground shadow-lg shadow-primary/25 sm:p-8"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary-foreground/10"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-16 right-16 h-32 w-32 rounded-full bg-primary-foreground/10"
      />

      <div className="relative flex flex-col gap-5">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-primary-foreground/70">
            Следующий урок
          </p>
          <h2
            id="next-lesson-title"
            className={`mt-2 font-extrabold text-balance ${
              showPlaceholder || cancelledLesson ? "text-2xl sm:text-3xl" : "text-3xl sm:text-4xl"
            } ${cancelledLesson ? "text-red-200" : ""}`}
          >
            {cancelledLesson
              ? "Урок отменён"
              : showPlaceholder
                ? "Преподаватель ещё не добавил расписание"
                : formatLessonDateTime(lesson.rescheduledDate ?? lesson.date)}
          </h2>
        </div>

        {lesson?.rescheduleStatus === "pending_student" ? (
          <div className="rounded-2xl bg-primary-foreground/15 p-4 backdrop-blur-sm">
            <p className="text-sm font-semibold">
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
                className="flex-1 border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
                onClick={handleRejectReschedule}
                disabled={actionPending}
              >
                ❌ Отклонить
              </Button>
            </div>
          </div>
        ) : null}

        {lesson?.rescheduleStatus === "pending_teacher" ? (
          <div className="rounded-2xl bg-yellow-500/20 p-4">
            <p className="text-sm font-semibold">🕐 Запрос на перенос отправлен</p>
          </div>
        ) : null}

        {lesson?.rescheduleStatus === "confirmed" ? (
          <div className="rounded-2xl bg-green-500/20 p-4">
            <p className="text-sm font-semibold">✅ Перенос подтверждён</p>
          </div>
        ) : null}

        {lesson?.cancellationStatus === "pending_student" ? (
          <div className="rounded-2xl bg-red-500/20 p-4">
            <p className="text-sm font-semibold">Репетитор предлагает отменить этот урок.</p>
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
                className="flex-1 border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
                onClick={handleRejectCancellation}
                disabled={actionPending}
              >
                Отклонить
              </Button>
            </div>
          </div>
        ) : null}

        {lesson?.cancellationStatus === "pending_teacher" ? (
          <div className="rounded-2xl bg-red-500/20 p-4">
            <p className="text-sm font-semibold">🔴 Запрос на отмену отправлен</p>
          </div>
        ) : null}

        {lesson ? (
          <>
            <div className="rounded-2xl bg-primary-foreground/15 p-4 backdrop-blur-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-primary-foreground/70">
                Задание
              </span>
              {hasAssignment ? (
                <div className="mt-1.5 flex flex-col gap-1.5">
                  {assignment.text ? <p className="text-sm">{assignment.text}</p> : null}
                  {assignment.files.length > 0 ? (
                    <ul className="flex flex-col gap-1">
                      {assignment.files.map((file, index) => (
                        <li key={`${file.url}-${index}`}>
                          <a
                            href={file.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1.5 text-sm font-semibold underline underline-offset-2"
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
                <p className="mt-1.5 text-sm text-primary-foreground/80">Задание пока не добавлено</p>
              )}
            </div>

            <div className="rounded-2xl bg-primary-foreground/15 p-4 backdrop-blur-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-primary-foreground/70">
                Моя домашка
              </span>
              {submissionFiles.length === 0 ? (
                <p className="mt-1.5 text-sm">Вы ещё не отправили домашнее задание</p>
              ) : (
                <>
                  <p className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold">
                    <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
                    Домашнее задание получено ✓
                    {lastSubmission?.submittedAt ? (
                      <span className="font-normal text-primary-foreground/70">
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
                          className="flex items-center gap-1.5 text-sm underline underline-offset-2"
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
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-3 border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
                disabled={uploadingHomework}
                onClick={() => homeworkFileInputRef.current?.click()}
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
              </Button>
              {uploadHomeworkError ? (
                <p className="mt-1.5 text-xs font-semibold text-red-200">{uploadHomeworkError}</p>
              ) : null}
              <p className="mt-1.5 text-xs text-primary-foreground/70">Или отправить в бот в ТГ/ВК</p>
            </div>

            {videoCallUrl ? (
              <Button
                type="button"
                size="sm"
                className="bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/25"
                onClick={() => openExternalLink(videoCallUrl)}
              >
                🎥 Подключиться
              </Button>
            ) : null}

            {lesson.rescheduleStatus !== "pending_teacher" || lesson.cancellationStatus !== "pending_teacher" ? (
              <div className="flex flex-wrap gap-2">
                {lesson.rescheduleStatus !== "pending_teacher" ? (
                  <Button
                    type="button"
                    size="sm"
                    className="flex-1 bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
                    onClick={() => setRescheduleDialogOpen(true)}
                  >
                    Перенести урок
                  </Button>
                ) : null}
                {lesson.cancellationStatus !== "pending_teacher" ? (
                  <Button
                    type="button"
                    size="sm"
                    className="flex-1 bg-red-100 text-red-700 hover:bg-red-200"
                    onClick={() => setCancelDialogOpen(true)}
                  >
                    Отменить урок
                  </Button>
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

function AllNotificationsDialog({ notifications, open, onOpenChange, onNotificationClick }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Все уведомления</DialogTitle>
        <DialogDescription>Последние {notifications.length} уведомлений</DialogDescription>

        <div className="mt-6 max-h-[60vh] overflow-y-auto">
          <NotificationsList notifications={notifications} onNotificationClick={onNotificationClick} />
        </div>
      </DialogContent>
    </Dialog>
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
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
      {lastNotification ? (
        <button
          type="button"
          onClick={() => handleNotificationClick(lastNotification)}
          className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
        >
          <NotificationIcon type={lastNotification.type} />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className={`text-sm text-foreground ${lastNotification.read ? "" : "font-semibold"}`}>
              {lastNotification.text}
            </span>
            <span className="text-xs text-muted-foreground">{formatRelativeTime(lastNotification.createdAt)}</span>
          </span>
        </button>
      ) : (
        <span className="text-sm text-muted-foreground">Нет новых уведомлений</span>
      )}

      <Button type="button" variant="outline" size="sm" className="relative shrink-0" onClick={() => setAllOpen(true)}>
        {hasUnread ? (
          <span
            aria-hidden="true"
            className="absolute right-1 top-1 size-2 rounded-full bg-red-500 ring-2 ring-card"
          />
        ) : null}
        Все уведомления
      </Button>

      <AllNotificationsDialog
        notifications={notifications}
        open={allOpen}
        onOpenChange={setAllOpen}
        onNotificationClick={handleNotificationClick}
      />
    </div>
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
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Добро пожаловать</p>
          <h1 className="text-3xl font-extrabold text-foreground text-balance">
            Привет, {firstName}! ✌️
          </h1>
        </div>
        <span
          aria-hidden="true"
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-lg font-extrabold text-primary-foreground shadow-md shadow-primary/25"
        >
          {getInitial(firstName)}
        </span>
      </header>

      <NextLessonPlate studentId={studentId} hasSchedule={Boolean(student.scheduleSlots?.length)} />

      <StudentNotifications studentId={studentId} />

      <div className="flex flex-col gap-4 md:flex-row">
        <div className="w-full md:w-1/3">
          <LevelCard level={student.level} xp={student.xp} compact />
        </div>
        <div className="w-full md:w-2/3">
          <MaterialsLibrary
            materials={allMaterials}
            loading={lessonsLoading}
            error={lessonsError}
          />
        </div>
      </div>

      <Achievements />

      <LessonStats lessons={lessons} />

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
  const [authorized, setAuthorized] = useState(
    () => localStorage.getItem(getAuthKey(studentId)) != null,
  )

  if (!authorized) {
    return (
      <LoginScreen
        studentId={studentId}
        onSuccess={() => setAuthorized(true)}
      />
    )
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6">
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
