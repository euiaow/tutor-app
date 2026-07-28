import { useEffect, useState } from "react"
import { CalendarPlus, CheckCircle2, GraduationCap, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StudentCard } from "@/components/teacher/student-card"
import { RegistrationLinkDialog } from "@/components/teacher/registration-link-dialog"
import { PendingRegistrations } from "@/components/teacher/pending-registrations"
import { HomeworkLessonDialog } from "@/components/teacher/homework-lesson-dialog"
import { Spinner } from "@/components/ui/spinner"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { subscribeToStudents } from "@/firebase/students"
import { signOutTeacher } from "@/firebase/auth"
import {
  subscribeToCompletedLessons,
  subscribeToUpcomingLessons,
  proposeReschedule,
  confirmReschedule,
  cancelReschedule,
  proposeCancellation,
  confirmCancellation,
  rejectCancellation,
} from "@/firebase/lessons"
import { formatLessonDateTime } from "@/lib/schedule"
import {
  getCalendarEmbedInfo,
  getGoogleCalendarStatus,
  startGoogleOAuth,
} from "@/firebase/google-calendar"

const MAX_CLUSTERED_LESSONS = 3
const MAX_LESSON_GAP_DAYS = 6

// If a student's lessons are weekly, showing 3 of them a week apart isn't
// useful — only the first one is actually "coming up soon". Take lessons
// sorted by date, always keep the first, and keep adding the next one only
// while the gap from the last kept lesson stays within MAX_LESSON_GAP_DAYS;
// stop at the first gap that's too big, capped at MAX_CLUSTERED_LESSONS.
function selectClusteredUpcomingLessons(lessons) {
  const sorted = [...lessons].sort((a, b) => a.date - b.date)
  const selected = []

  for (const lesson of sorted) {
    if (selected.length >= MAX_CLUSTERED_LESSONS) break

    if (selected.length === 0) {
      selected.push(lesson)
      continue
    }

    const previous = selected[selected.length - 1]
    const gapDays = (lesson.date - previous.date) / (1000 * 60 * 60 * 24)

    if (gapDays > MAX_LESSON_GAP_DAYS) break

    selected.push(lesson)
  }

  return selected
}

// datetime-local inputs want "YYYY-MM-DDTHH:mm" in the device's local
// timezone, not UTC — offsetting by getTimezoneOffset() before calling
// toISOString() (which is always UTC) gets that local wall-clock string.
function toDatetimeLocal(date) {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

// The dialog is remounted (via a `key` on its usage below) every time it
// opens, so these lazy initial values — computed once per mount — pick up
// the lesson's current date fresh each time, without needing an effect to
// resync state that React already owns.
function RescheduleDialog({ studentId, lessonId, initialDate, open, onOpenChange }) {
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
      await proposeReschedule(studentId, lessonId, proposedDate)
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
        <DialogDescription>Выберите новую дату и время урока для ученика</DialogDescription>

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
            {submitting ? "Отправляем..." : "Отправить запрос ученику"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CancelLessonDialog({ studentId, lessonId, lessonDate, open, onOpenChange }) {
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
      await proposeCancellation(studentId, lessonId)
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
          Вы уверены, что хотите предложить отменить урок{lessonDate ? ` ${formatRescheduleDate(lessonDate)}` : ""}?
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
            {submitting ? "Отправляем..." : "Да, отменить"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function formatRescheduleDate(date) {
  if (!date) return ""
  return date.toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function UpcomingLessonCard({ lesson, studentName }) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [rescheduleActionPending, setRescheduleActionPending] = useState(false)
  const [cancellationActionPending, setCancellationActionPending] = useState(false)

  const isCancelled = lesson.status === "cancelled"

  const hasAssignment =
    lesson.homework.assignment.text.trim() !== "" || lesson.homework.assignment.files.length > 0
  const hasSubmission = lesson.homework.submission.files.length > 0

  async function handleConfirmReschedule() {
    if (rescheduleActionPending) return
    setRescheduleActionPending(true)
    try {
      await confirmReschedule(lesson.studentId, lesson.id)
    } catch (err) {
      console.error("Failed to confirm reschedule:", err)
    } finally {
      setRescheduleActionPending(false)
    }
  }

  async function handleCancelReschedule() {
    if (rescheduleActionPending) return
    setRescheduleActionPending(true)
    try {
      await cancelReschedule(lesson.studentId, lesson.id)
    } catch (err) {
      console.error("Failed to cancel reschedule:", err)
    } finally {
      setRescheduleActionPending(false)
    }
  }

  async function handleConfirmCancellation() {
    if (cancellationActionPending) return
    setCancellationActionPending(true)
    try {
      await confirmCancellation(lesson.studentId, lesson.id, "teacher")
    } catch (err) {
      console.error("Failed to confirm cancellation:", err)
    } finally {
      setCancellationActionPending(false)
    }
  }

  async function handleRejectCancellation() {
    if (cancellationActionPending) return
    setCancellationActionPending(true)
    try {
      await rejectCancellation(lesson.studentId, lesson.id)
    } catch (err) {
      console.error("Failed to reject cancellation:", err)
    } finally {
      setCancellationActionPending(false)
    }
  }

  return (
    <li
      className={`flex flex-col gap-3 rounded-xl border p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between ${
        isCancelled ? "border-red-200 bg-red-50" : "border-border bg-card"
      }`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-semibold text-card-foreground">{studentName}</p>
          {isCancelled ? (
            <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800">
              ❌ Урок отменён
            </span>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          {formatLessonDateTime(lesson.rescheduledDate ?? lesson.date)}
          {lesson.rescheduled ? <span className="ml-1.5 font-semibold text-primary">Перенесён</span> : null}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <span className={hasAssignment ? "font-semibold text-primary" : "text-muted-foreground"}>
            {hasAssignment ? "Задание добавлено ✓" : "Задание не добавлено"}
          </span>
          <span className={hasSubmission ? "font-semibold text-primary" : "text-muted-foreground"}>
            {hasSubmission ? "ДЗ получено ✓" : "ДЗ не прислано"}
          </span>
        </div>

        {lesson.rescheduleStatus === "pending_student" ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-semibold text-yellow-800">
              🕐 Ожидает подтверждения ученика
            </span>
            {lesson.rescheduleProposedDate ? (
              <span className="text-xs text-muted-foreground">
                → {formatRescheduleDate(lesson.rescheduleProposedDate)}
              </span>
            ) : null}
          </div>
        ) : null}

        {lesson.rescheduleStatus === "pending_teacher" ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-semibold text-yellow-800">
              🕐 Ученик предлагает перенос
            </span>
            {lesson.rescheduleProposedDate ? (
              <span className="text-xs text-muted-foreground">
                → {formatRescheduleDate(lesson.rescheduleProposedDate)}
              </span>
            ) : null}
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmReschedule}
              disabled={rescheduleActionPending}
            >
              Подтвердить
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCancelReschedule}
              disabled={rescheduleActionPending}
            >
              Отклонить
            </Button>
          </div>
        ) : null}

        {lesson.rescheduleStatus === "confirmed" ? (
          <span className="mt-2 inline-flex w-fit items-center rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800">
            ✅ Перенос подтверждён
          </span>
        ) : null}

        {lesson.cancellationStatus === "pending_student" ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800">
              🔴 Ожидает подтверждения отмены учеником
            </span>
          </div>
        ) : null}

        {lesson.cancellationStatus === "pending_teacher" ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800">
              🔴 Ученик просит отменить урок
            </span>
            <Button
              type="button"
              size="sm"
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={handleConfirmCancellation}
              disabled={cancellationActionPending}
            >
              Подтвердить отмену
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRejectCancellation}
              disabled={cancellationActionPending}
            >
              Отклонить
            </Button>
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 gap-2">
        {!isCancelled ? (
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => setRescheduleDialogOpen(true)}>
              Перенести
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-red-100 text-red-700 hover:bg-red-200"
              onClick={() => setCancelDialogOpen(true)}
            >
              Отменить урок
            </Button>
          </>
        ) : null}
        <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
          Открыть
        </Button>
      </div>

      <HomeworkLessonDialog
        studentId={lesson.studentId}
        studentName={studentName}
        lessonId={lesson.id}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      <RescheduleDialog
        key={rescheduleDialogOpen ? "open" : "closed"}
        studentId={lesson.studentId}
        lessonId={lesson.id}
        initialDate={lesson.rescheduledDate ?? lesson.date}
        open={rescheduleDialogOpen}
        onOpenChange={setRescheduleDialogOpen}
      />

      <CancelLessonDialog
        key={cancelDialogOpen ? "open" : "closed"}
        studentId={lesson.studentId}
        lessonId={lesson.id}
        lessonDate={lesson.rescheduledDate ?? lesson.date}
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
      />
    </li>
  )
}

function PastLessonCard({ lesson, studentName }) {
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate font-semibold text-card-foreground">{studentName}</p>
        <p className="text-xs text-muted-foreground">
          {formatLessonDateTime(lesson.rescheduledDate ?? lesson.date)}
        </p>
        {lesson.topic ? <p className="mt-1.5 text-xs text-muted-foreground">{lesson.topic}</p> : null}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
        Открыть
      </Button>

      <HomeworkLessonDialog
        studentId={lesson.studentId}
        studentName={studentName}
        lessonId={lesson.id}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </li>
  )
}

export function TeacherDashboard() {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [googleCalendarConnected, setGoogleCalendarConnected] = useState(null)
  const [connectingGoogleCalendar, setConnectingGoogleCalendar] = useState(false)
  const [embedUrl, setEmbedUrl] = useState(null)
  const [embedError, setEmbedError] = useState(null)
  const embedLoading = googleCalendarConnected === true && !embedUrl && !embedError
  const [upcomingLessons, setUpcomingLessons] = useState([])
  const [completedLessons, setCompletedLessons] = useState([])
  const [completedVisibleCount, setCompletedVisibleCount] = useState(3)

  async function handleSignOut() {
    try {
      await signOutTeacher()
    } catch (err) {
      console.error("Failed to sign out:", err)
    }
  }

  async function handleConnectGoogleCalendar() {
    if (connectingGoogleCalendar) return

    setConnectingGoogleCalendar(true)
    try {
      const authUrl = await startGoogleOAuth()
      window.location.href = authUrl
    } catch (err) {
      console.error("Failed to start Google Calendar connection:", err)
      setConnectingGoogleCalendar(false)
    }
  }

  useEffect(() => {
    const unsubscribe = subscribeToStudents(
      (data) => {
        setStudents(data)
        setLoading(false)
      },
      (firestoreError) => {
        console.error("Failed to load students:", firestoreError)
        setError("Не удалось загрузить список учеников")
        setLoading(false)
      },
    )

    return unsubscribe
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeToUpcomingLessons(
      setUpcomingLessons,
      (firestoreError) => {
        console.error("Failed to load upcoming lessons:", firestoreError)
      },
      10,
    )

    return unsubscribe
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeToCompletedLessons(setCompletedLessons, (firestoreError) => {
      console.error("Failed to load completed lessons:", firestoreError)
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    getGoogleCalendarStatus()
      .then(setGoogleCalendarConnected)
      .catch((err) => {
        console.error("Failed to load Google Calendar status:", err)
        setGoogleCalendarConnected(false)
      })
  }, [])

  useEffect(() => {
    if (googleCalendarConnected !== true) return

    let cancelled = false

    getCalendarEmbedInfo()
      .then((url) => {
        if (!cancelled) setEmbedUrl(url)
      })
      .catch((err) => {
        console.error("Failed to load Google Calendar embed URL:", err)
        if (!cancelled) {
          setEmbedError(`Не удалось загрузить Google Calendar: ${err.message || err.code}`)
        }
      })

    return () => {
      cancelled = true
    }
  }, [googleCalendarConnected])

  const clusteredUpcomingLessons = selectClusteredUpcomingLessons(upcomingLessons)

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <GraduationCap className="size-5" aria-hidden="true" />
            </span>
            <span className="text-lg font-extrabold tracking-tight text-foreground">Учебный портал</span>
          </div>
          <Button type="button" variant="outline" size="lg" onClick={handleSignOut}>
            <LogOut aria-hidden="true" />
            Выйти
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        {googleCalendarConnected === false ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
            <p className="text-sm text-muted-foreground">
              Синхронизируйте расписание занятий с Google Calendar
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleConnectGoogleCalendar}
              disabled={connectingGoogleCalendar}
            >
              <CalendarPlus aria-hidden="true" />
              {connectingGoogleCalendar ? "Переходим..." : "Подключить Google Calendar"}
            </Button>
          </div>
        ) : googleCalendarConnected === true ? (
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <CheckCircle2 className="size-3.5 text-primary" aria-hidden="true" />
            Google Calendar подключён
          </p>
        ) : null}

        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-extrabold tracking-tight text-foreground">Расписание</h2>
          {googleCalendarConnected === true ? (
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              {embedLoading ? (
                <Spinner label="Загрузка Google Calendar..." />
              ) : embedError ? (
                <div className="flex h-64 items-center justify-center p-6 text-center">
                  <p className="text-sm text-destructive">{embedError}</p>
                </div>
              ) : embedUrl ? (
                <iframe
                  title="Google Calendar"
                  src={`${embedUrl}&mode=WEEK`}
                  style={{ border: 0, width: "100%", height: "600px" }}
                  frameBorder="0"
                  scrolling="no"
                />
              ) : null}
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-border bg-card text-center shadow-sm">
              <p className="text-sm text-muted-foreground">
                Google Calendar появится здесь после подключения
              </p>
            </div>
          )}
        </section>

        {clusteredUpcomingLessons.length > 0 ? (
          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-extrabold tracking-tight text-foreground">Ближайшие уроки</h2>
            <ul className="flex flex-col gap-3">
              {clusteredUpcomingLessons.map((lesson) => (
                <UpcomingLessonCard
                  key={lesson.id}
                  lesson={lesson}
                  studentName={students.find((s) => s.id === lesson.studentId)?.name ?? "Ученик"}
                />
              ))}
            </ul>
          </section>
        ) : null}

        {completedLessons.length > 0 ? (
          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-extrabold tracking-tight text-foreground">Прошедшие уроки</h2>
            <ul className="flex flex-col gap-3">
              {completedLessons.slice(0, completedVisibleCount).map((lesson) => (
                <PastLessonCard
                  key={lesson.id}
                  lesson={lesson}
                  studentName={students.find((s) => s.id === lesson.studentId)?.name ?? "Ученик"}
                />
              ))}
            </ul>
            {completedLessons.length > completedVisibleCount ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => setCompletedVisibleCount((prev) => prev + 5)}
              >
                Показать ещё
              </Button>
            ) : null}
          </section>
        ) : null}

        <section className="flex flex-col gap-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-extrabold tracking-tight text-foreground">Ученики</h2>
            <RegistrationLinkDialog />
          </div>

          <div className="flex flex-col gap-4">
            <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Зарегистрированные ученики
            </h3>

            {loading ? (
              <Spinner label="Загрузка списка учеников..." />
            ) : error ? (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
                <p className="font-semibold text-destructive">{error}</p>
              </div>
            ) : students.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
                <p className="text-muted-foreground">Пока нет учеников в базе данных.</p>
              </div>
            ) : (
              <div
                aria-label="Список учеников"
                className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
              >
                {students.map((student) => (
                  <StudentCard key={student.id} student={student} />
                ))}
              </div>
            )}
          </div>
        </section>

        <PendingRegistrations />
      </main>
    </div>
  )
}
