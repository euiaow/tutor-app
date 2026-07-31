import { useEffect, useState } from "react"
import {
  Bell,
  CalendarClock,
  CalendarPlus,
  Check,
  CircleSlash,
  Clock,
  FileText,
  GraduationCap,
  Info,
  LogOut,
  Play,
  X,
} from "lucide-react"
import { StudentRow } from "@/components/teacher/student-row"
import { RegistrationLinkDialog } from "@/components/teacher/registration-link-dialog"
import { PendingRegistrations } from "@/components/teacher/pending-registrations"
import { HomeworkLessonDialog } from "@/components/teacher/homework-lesson-dialog"
import { ExtraLessonDialog } from "@/components/teacher/extra-lesson-dialog"
import { ContactButton } from "@/components/teacher/contact-button"
import { StudentTags } from "@/components/student-tags"
import { FinanceSection } from "@/components/teacher/finance-section"
import { CurriculumSection } from "@/components/teacher/curriculum-section"
import { getAllCurriculumProgressByStudent } from "@/firebase/curriculum"
import { VideoCallSettings } from "@/components/teacher/video-call-settings"
import { subscribeToVideoCallUrl } from "@/firebase/videoCall"
import { openExternalLink } from "@/lib/telegramWebApp"
import { Spinner } from "@/components/ui/spinner"
import {
  Avatar,
  GhostBtn,
  Panel,
  SolidBtn,
  TeacherCancelBtn,
  TeacherDialog,
  TeacherDialogContent,
  TeacherDialogDescription,
  TeacherDialogTitle,
  TeacherStatusBadge,
  Title,
  teacherInputCls,
} from "@/components/teacher/theme-ui"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { NotificationsList } from "@/components/notifications-list"
import { subscribeToStudents } from "@/firebase/students"
import {
  subscribeToTeacherNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/firebase/notifications"
import { signOutTeacher } from "@/firebase/auth"
import {
  subscribeToCompletedLessons,
  subscribeToUpcomingLessons,
  getAllCompletedLessons,
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
const MS_PER_DAY = 1000 * 60 * 60 * 24

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
    const gapDays = (lesson.date - previous.date) / MS_PER_DAY

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
    <TeacherDialog open={open} onOpenChange={handleOpenChange}>
      <TeacherDialogContent>
        <TeacherDialogTitle>Предложить перенос</TeacherDialogTitle>
        <TeacherDialogDescription>Выберите новую дату и время урока для ученика</TeacherDialogDescription>

        <form className="mt-5 flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={submitting}
              className={teacherInputCls}
            />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              disabled={submitting}
              className={`${teacherInputCls} max-w-36`}
            />
          </div>

          {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}

          <SolidBtn type="submit" className="w-full justify-center py-3 text-sm" disabled={!date || !time || submitting}>
            {submitting ? "Отправляем..." : "Отправить запрос ученику"}
          </SolidBtn>
        </form>
      </TeacherDialogContent>
    </TeacherDialog>
  )
}

function CancelLessonDialog({ studentId, lessonId, lessonDate, open, onOpenChange }) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  function handleOpenChange(nextOpen) {
    onOpenChange(nextOpen)
    if (!nextOpen) setError("")
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
    <TeacherDialog open={open} onOpenChange={handleOpenChange}>
      <TeacherDialogContent>
        <TeacherDialogTitle>Отменить урок</TeacherDialogTitle>
        <TeacherDialogDescription>
          Вы уверены, что хотите предложить отменить урок{lessonDate ? ` ${formatRescheduleDate(lessonDate)}` : ""}?
        </TeacherDialogDescription>

        {error ? <p className="mt-2 text-sm font-semibold text-destructive">{error}</p> : null}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <TeacherCancelBtn onClick={() => handleOpenChange(false)} disabled={submitting}>
            Назад
          </TeacherCancelBtn>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="rounded-full bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Отправляем..." : "Да, отменить"}
          </button>
        </div>
      </TeacherDialogContent>
    </TeacherDialog>
  )
}

function UpcomingLessonCard({ lesson, studentName, student, videoCallUrl }) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [rescheduleActionPending, setRescheduleActionPending] = useState(false)
  const [cancellationActionPending, setCancellationActionPending] = useState(false)

  const isCancelled = lesson.status === "cancelled"

  const hasAssignment =
    lesson.homework.assignment.text.trim() !== "" || lesson.homework.assignment.files.length > 0
  const hasSubmission = lesson.homework.submission.files.length > 0

  // Шаг 2, правило 1: когда инициатива по переносу/отмене исходит от
  // ученика (pending_teacher), обычные кнопки скрываются — остаются только
  // Подтвердить/Отклонить/Подробнее. Во всех остальных состояниях
  // (pending_student, confirmed, "доп.", без статуса) полный набор кнопок
  // сохраняется как раньше.
  const studentAsksReschedule = lesson.rescheduleStatus === "pending_teacher"
  const studentAsksCancel = lesson.cancellationStatus === "pending_teacher"
  const studentInitiated = studentAsksReschedule || studentAsksCancel

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
    <li className={`glass-tile rounded-[1.5rem] p-3 ${isCancelled ? "border-destructive/40" : ""}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="flex min-w-0 flex-1 basis-64 items-center gap-3 text-left"
        >
          <Avatar initials={studentName.slice(0, 2).toUpperCase()} />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-ink">{studentName}</span>
              {lesson.isExtraLesson ? <TeacherStatusBadge tone="rose">доп.</TeacherStatusBadge> : null}
              <StudentTags student={student} />
              {isCancelled ? <TeacherStatusBadge tone="red">Урок отменён</TeacherStatusBadge> : null}
              {lesson.rescheduleStatus === "pending_student" ? (
                <TeacherStatusBadge tone="amber">Ожидает подтверждения ученика</TeacherStatusBadge>
              ) : null}
              {studentAsksReschedule ? (
                <TeacherStatusBadge tone="amber">Ученик предлагает перенос</TeacherStatusBadge>
              ) : null}
              {lesson.rescheduleStatus === "confirmed" ? (
                <TeacherStatusBadge tone="green">Перенос подтверждён</TeacherStatusBadge>
              ) : null}
              {lesson.cancellationStatus === "pending_student" ? (
                <TeacherStatusBadge tone="red">Ожидает подтверждения отмены</TeacherStatusBadge>
              ) : null}
              {studentAsksCancel ? <TeacherStatusBadge tone="red">Ученик просит отменить</TeacherStatusBadge> : null}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="size-3" aria-hidden="true" />
                {formatLessonDateTime(lesson.rescheduledDate ?? lesson.date)}
                {lesson.rescheduled ? <span className="ml-1 font-semibold text-rose-deep">перенесён</span> : null}
              </span>
              <span className={hasAssignment ? "flex items-center gap-1 font-semibold text-rose-deep" : "flex items-center gap-1"}>
                <FileText className="size-3" aria-hidden="true" />
                {hasAssignment ? "Задание добавлено" : "Задание не добавлено"}
              </span>
              {hasSubmission ? (
                <span className="flex items-center gap-1 font-semibold text-rose-deep">
                  <Check className="size-3" aria-hidden="true" /> ДЗ получено
                </span>
              ) : null}
            </span>
          </span>
        </button>

        <div className="flex flex-wrap items-center gap-1.5">
          {studentAsksReschedule ? (
            <>
              <SolidBtn onClick={handleConfirmReschedule} disabled={rescheduleActionPending}>
                <Check className="size-3.5" aria-hidden="true" /> Подтвердить
              </SolidBtn>
              <GhostBtn onClick={handleCancelReschedule} disabled={rescheduleActionPending} className="px-3 py-1.5">
                <X className="size-3.5" aria-hidden="true" /> Отклонить
              </GhostBtn>
            </>
          ) : null}

          {studentAsksCancel ? (
            <>
              <SolidBtn onClick={handleConfirmCancellation} disabled={cancellationActionPending}>
                <Check className="size-3.5" aria-hidden="true" /> Подтвердить отмену
              </SolidBtn>
              <GhostBtn onClick={handleRejectCancellation} disabled={cancellationActionPending} className="px-3 py-1.5">
                <X className="size-3.5" aria-hidden="true" /> Отклонить
              </GhostBtn>
            </>
          ) : null}

          {studentInitiated ? <span className="mx-0.5 h-5 w-px bg-glass-border" /> : null}

          <GhostBtn onClick={() => setDialogOpen(true)} className="px-3 py-1.5">
            <Info className="size-3.5" aria-hidden="true" /> Подробнее
          </GhostBtn>

          {!studentInitiated && !isCancelled ? (
            <>
              <GhostBtn onClick={() => setRescheduleDialogOpen(true)} className="px-3 py-1.5">
                <CalendarClock className="size-3.5" aria-hidden="true" /> Перенести
              </GhostBtn>
              <GhostBtn onClick={() => setCancelDialogOpen(true)} className="px-3 py-1.5">
                <CircleSlash className="size-3.5" aria-hidden="true" /> Отменить
              </GhostBtn>
              {videoCallUrl ? (
                <SolidBtn onClick={() => openExternalLink(videoCallUrl)}>
                  <Play className="size-3.5" aria-hidden="true" /> Начать урок
                </SolidBtn>
              ) : null}
            </>
          ) : null}

          {student ? <ContactButton student={student} /> : null}
        </div>
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

function PastLessonCard({ lesson, studentName, student }) {
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <li className="flex items-center gap-3 py-3">
      <Avatar initials={studentName.slice(0, 2).toUpperCase()} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-semibold text-ink">{studentName}</span>
          <StudentTags student={student} />
        </div>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="size-3" aria-hidden="true" />
          {formatLessonDateTime(lesson.rescheduledDate ?? lesson.date)}
        </p>
        {lesson.topic ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{lesson.topic}</p> : null}
      </div>
      <GhostBtn onClick={() => setDialogOpen(true)} className="px-4 py-2">
        Открыть
      </GhostBtn>

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

// Loads on demand (one-time getDocs via getAllCompletedLessons) the moment
// it's opened, rather than subscribing up front — the teacher dashboard's
// own subscribeToCompletedLessons feed stays capped, this is only for the
// "show everything" modal.
function AllPastLessonsDialog({ open, onOpenChange, students }) {
  const [lessons, setLessons] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open) return

    let cancelled = false
    setLoading(true)
    setError("")

    getAllCompletedLessons()
      .then((data) => {
        if (cancelled) return
        setLessons(data)
      })
      .catch((fetchError) => {
        console.error("Failed to load all completed lessons:", fetchError)
        if (cancelled) return
        setError("Не удалось загрузить уроки")
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open])

  return (
    <TeacherDialog open={open} onOpenChange={onOpenChange}>
      <TeacherDialogContent wide>
        <TeacherDialogTitle>Все прошедшие уроки</TeacherDialogTitle>

        <div className="mt-4 max-h-[70vh] overflow-y-auto scrollbar-hidden pr-1">
          {loading ? (
            <Spinner label="Загрузка..." />
          ) : error ? (
            <p className="text-sm font-semibold text-destructive">{error}</p>
          ) : lessons.length === 0 ? (
            <p className="text-sm text-muted-foreground">Уроков пока нет</p>
          ) : (
            <ul className="divide-y divide-glass-border">
              {lessons.map((lesson) => (
                <PastLessonCard
                  key={lesson.id}
                  lesson={lesson}
                  studentName={students.find((s) => s.id === lesson.studentId)?.name ?? "Ученик"}
                  student={students.find((s) => s.id === lesson.studentId)}
                />
              ))}
            </ul>
          )}
        </div>
      </TeacherDialogContent>
    </TeacherDialog>
  )
}

function TeacherNotificationsBell() {
  const [notifications, setNotifications] = useState([])
  const [open, setOpen] = useState(false)
  const hasUnread = notifications.some((notification) => !notification.read)

  useEffect(() => {
    const unsubscribe = subscribeToTeacherNotifications(setNotifications, (firestoreError) => {
      console.error("Failed to load notifications:", firestoreError)
    })

    return unsubscribe
  }, [])

  async function handleNotificationClick(notification) {
    if (!notification.read) {
      try {
        await markNotificationRead(notification.id)
      } catch (err) {
        console.error("Failed to mark notification read:", err)
      }
    }
  }

  async function handleMarkAllRead() {
    try {
      await markAllNotificationsRead(notifications)
    } catch (err) {
      console.error("Failed to mark all notifications read:", err)
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Уведомления"
        className="glass-tile relative grid size-10 place-items-center rounded-full text-foreground/70"
      >
        <Bell className="size-4" aria-hidden="true" />
        {hasUnread ? <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-primary" /> : null}
      </button>

      <SheetContent className="teacher-theme glass-panel rounded-l-[2rem] border-l-0">
        <SheetTitle className="font-display text-ink">Уведомления</SheetTitle>

        <div className="mt-6 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto scrollbar-hidden">
          {notifications.some((notification) => !notification.read) ? (
            <GhostBtn onClick={handleMarkAllRead} className="self-start px-4 py-2">
              Отметить все прочитанными
            </GhostBtn>
          ) : null}

          <NotificationsList notifications={notifications} onNotificationClick={handleNotificationClick} />
        </div>
      </SheetContent>
    </Sheet>
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
  const [completedVisibleCount] = useState(2)
  const [isAllPastLessonsOpen, setIsAllPastLessonsOpen] = useState(false)
  const [videoCallUrl, setVideoCallUrl] = useState(null)
  const [curriculumProgressByStudent, setCurriculumProgressByStudent] = useState({})

  useEffect(() => {
    const unsub = subscribeToVideoCallUrl(setVideoCallUrl, (error) =>
      console.error("Failed to load video call url:", error),
    )
    return () => unsub()
  }, [])

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

  // One-time batch read (not a subscription) — powers every collapsed row's
  // progress bar at once, cheaper than a live listener per student; the
  // currently-expanded row layers its own live subscription on top (see
  // StudentRow). Re-fetched whenever the student count changes; doesn't
  // otherwise react to a progress assignment made while this list is
  // already loaded (that student's bar catches up next reload).
  useEffect(() => {
    if (students.length === 0) return

    getAllCurriculumProgressByStudent()
      .then(setCurriculumProgressByStudent)
      .catch((error) => console.error("Failed to load curriculum progress summaries:", error))
  }, [students.length])

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

  // Статы — новый блок из макета, без прямого аналога в текущем коде.
  // Считаются из данных, уже загруженных на этой странице (без
  // дополнительных подписок), чтобы не дублировать источники правды:
  // FinanceSection отдельно грузит балансы, но paidLessonsBalance уже есть
  // прямо в students[] (см. finance-section.jsx), поэтому четвёртый стат
  // читает то же поле напрямую, а не через отдельный запрос.
  const now = Date.now()
  const lessonsThisWeek = upcomingLessons.filter((lesson) => {
    const date = lesson.rescheduledDate ?? lesson.date
    return date && date.getTime() - now <= 7 * MS_PER_DAY
  }).length
  const homeworkToReview = upcomingLessons.filter(
    (lesson) => lesson.homework.submission.files.length > 0,
  ).length
  const paymentDue = students.filter((student) => (student.paidLessonsBalance ?? 0) <= 0).length

  const stats = [
    { value: String(lessonsThisWeek), label: "Уроков на неделе" },
    { value: String(students.length), label: "Учеников" },
    { value: String(homeworkToReview), label: "ДЗ на проверке" },
    { value: String(paymentDue), label: "Оплата ожидается" },
  ]

  return (
    <div className="teacher-theme relative min-h-screen px-4 py-6 md:px-8 md:py-10">
      <div aria-hidden className="bg-grain-blobs">
        <div className="blob-a" />
        <div className="blob-b" />
        <div className="grain-layer" />
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="glass-panel flex items-center justify-between gap-4 rounded-[2rem] px-5 py-4">
          <div className="flex items-center gap-3">
            <div
              className="flex size-10 shrink-0 items-center justify-center rounded-full text-primary-foreground"
              style={{ background: "var(--gradient-orb)", boxShadow: "var(--shadow-soft)" }}
            >
              <GraduationCap className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="font-display text-lg tracking-tight text-ink">Учебный портал</h1>
              <p className="text-xs text-muted-foreground">Кабинет преподавателя</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <VideoCallSettings />
            <TeacherNotificationsBell />
            <GhostBtn onClick={handleSignOut} className="px-4 py-2">
              <LogOut className="size-3.5" aria-hidden="true" /> Выйти
            </GhostBtn>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="glass-panel rounded-[1.75rem] px-5 py-4">
              <div className="font-display text-3xl text-ink">{s.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>

        <Panel>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Title>Расписание</Title>
              {googleCalendarConnected === true ? (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-primary" /> Google Calendar подключён
                </p>
              ) : googleCalendarConnected === false ? (
                <p className="mt-1 text-xs text-muted-foreground">Google Calendar не подключён</p>
              ) : null}
            </div>
            <ExtraLessonDialog students={students} />
          </div>

          {googleCalendarConnected === false ? (
            <div className="glass-tile mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] px-4 py-3">
              <p className="text-sm text-muted-foreground">Синхронизируйте расписание с Google Calendar</p>
              <GhostBtn onClick={handleConnectGoogleCalendar} disabled={connectingGoogleCalendar} className="px-4 py-2">
                <CalendarPlus className="size-3.5" aria-hidden="true" />
                {connectingGoogleCalendar ? "Переходим..." : "Подключить"}
              </GhostBtn>
            </div>
          ) : null}

          <div className="glass-tile mt-4 overflow-hidden rounded-[1.5rem]">
            {embedLoading ? (
              <div className="p-6">
                <Spinner label="Загрузка Google Calendar..." />
              </div>
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
            ) : (
              <div className="flex h-64 items-center justify-center p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Google Calendar появится здесь после подключения
                </p>
              </div>
            )}
          </div>
        </Panel>

        {clusteredUpcomingLessons.length > 0 ? (
          <Panel>
            <Title>Ближайшие уроки</Title>
            <ul className="mt-4 space-y-3">
              {clusteredUpcomingLessons.map((lesson) => (
                <UpcomingLessonCard
                  key={lesson.id}
                  lesson={lesson}
                  studentName={students.find((s) => s.id === lesson.studentId)?.name ?? "Ученик"}
                  student={students.find((s) => s.id === lesson.studentId)}
                  videoCallUrl={videoCallUrl}
                />
              ))}
            </ul>
          </Panel>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-2">
          {completedLessons.length > 0 ? (
            <Panel>
              <div className="flex items-center justify-between">
                <Title>Прошедшие уроки</Title>
              </div>
              <ul className="mt-4 divide-y divide-glass-border">
                {completedLessons.slice(0, completedVisibleCount).map((lesson) => (
                  <PastLessonCard
                    key={lesson.id}
                    lesson={lesson}
                    studentName={students.find((s) => s.id === lesson.studentId)?.name ?? "Ученик"}
                    student={students.find((s) => s.id === lesson.studentId)}
                  />
                ))}
              </ul>
              {completedLessons.length > completedVisibleCount ? (
                <GhostBtn onClick={() => setIsAllPastLessonsOpen(true)} className="mt-3 self-start px-4 py-2">
                  Показать все прошедшие уроки
                </GhostBtn>
              ) : null}
            </Panel>
          ) : null}

          {students.length > 0 ? <FinanceSection students={students} /> : null}
        </div>

        <AllPastLessonsDialog open={isAllPastLessonsOpen} onOpenChange={setIsAllPastLessonsOpen} students={students} />

        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Title>Ученики</Title>
            <RegistrationLinkDialog />
          </div>

          <div className="mt-4">
            {loading ? (
              <Spinner label="Загрузка списка учеников..." />
            ) : error ? (
              <p className="text-sm font-semibold text-destructive">{error}</p>
            ) : students.length === 0 ? (
              <p className="text-sm text-muted-foreground">Пока нет учеников в базе данных.</p>
            ) : (
              <div className="space-y-3">
                {students.map((student) => (
                  <StudentRow
                    key={student.id}
                    student={student}
                    progressSummary={curriculumProgressByStudent[student.id] ?? null}
                  />
                ))}
              </div>
            )}
          </div>
        </Panel>

        <CurriculumSection />

        <PendingRegistrations />
      </div>
    </div>
  )
}
