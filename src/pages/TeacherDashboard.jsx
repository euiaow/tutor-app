import { useEffect, useState } from "react"
import {
  Bell,
  CalendarPlus,
  ChevronRight,
  Clock,
  GraduationCap,
  LogOut,
  Play,
} from "lucide-react"
import { StudentRow } from "@/components/teacher/student-row"
import { UpcomingLessonCard } from "@/components/teacher/upcoming-lesson-card"
import { RegistrationLinkDialog } from "@/components/teacher/registration-link-dialog"
import { PendingRegistrations } from "@/components/teacher/pending-registrations"
import { HomeworkLessonDialog } from "@/components/teacher/homework-lesson-dialog"
import { ExtraLessonDialog } from "@/components/teacher/extra-lesson-dialog"
import { TeacherBotConnectStatus } from "@/components/teacher/teacher-bot-connect"
import { StudentTags } from "@/components/student-tags"
import { FinanceSection } from "@/components/teacher/finance-section"
import { CurriculumSection } from "@/components/teacher/curriculum-section"
import { getAllCurriculumProgressByStudent, getCurriculumTemplates } from "@/firebase/curriculum"
import { VideoCallSettings } from "@/components/teacher/video-call-settings"
import { subscribeToVideoCallUrl } from "@/firebase/videoCall"
import { openExternalLink } from "@/lib/telegramWebApp"
import { Spinner } from "@/components/ui/spinner"
import {
  GhostBtn,
  Panel,
  SolidBtn,
  StudentDot,
  TeacherDialog,
  TeacherDialogContent,
  TeacherDialogTitle,
  Title,
} from "@/components/teacher/theme-ui"
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

function PastLessonCard({ lesson, studentName, student }) {
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <li className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <StudentDot />
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
    <TeacherDialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Уведомления"
        className="glass-tile relative grid size-10 place-items-center rounded-full text-foreground/70"
      >
        <Bell className="size-4" aria-hidden="true" />
        {hasUnread ? <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-primary" /> : null}
      </button>

      <TeacherDialogContent>
        <TeacherDialogTitle>Уведомления</TeacherDialogTitle>

        <div className="mt-5 flex max-h-[65vh] flex-col gap-3 overflow-y-auto">
          {notifications.some((notification) => !notification.read) ? (
            <GhostBtn onClick={handleMarkAllRead} className="self-start px-4 py-2">
              Отметить все прочитанными
            </GhostBtn>
          ) : null}

          <NotificationsList notifications={notifications} onNotificationClick={handleNotificationClick} />
        </div>

        <TeacherBotConnectStatus />
      </TeacherDialogContent>
    </TeacherDialog>
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
  const [completedVisibleCount] = useState(5)
  const [isAllPastLessonsOpen, setIsAllPastLessonsOpen] = useState(false)
  const [videoCallUrl, setVideoCallUrl] = useState(null)
  const [curriculumProgressByStudent, setCurriculumProgressByStudent] = useState({})
  const [curriculumTemplates, setCurriculumTemplates] = useState([])

  useEffect(() => {
    const unsub = subscribeToVideoCallUrl(setVideoCallUrl, (error) =>
      console.error("Failed to load video call url:", error),
    )
    return () => unsub()
  }, [])

  // Fetched once here (not per-row) so every student row's "Учебный план"
  // display can look up its template name without N separate reads.
  useEffect(() => {
    getCurriculumTemplates()
      .then(setCurriculumTemplates)
      .catch((err) => console.error("Failed to load curriculum templates:", err))
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Title>Ближайшие уроки</Title>
              <SolidBtn
                onClick={() => videoCallUrl && openExternalLink(videoCallUrl)}
                disabled={!videoCallUrl}
                title={videoCallUrl ? "Начать видеозвонок" : "Ссылка на видеозвонок не настроена"}
              >
                <Play className="size-3.5" aria-hidden="true" /> Начать урок
              </SolidBtn>
            </div>
            <ul className="mt-4 space-y-3">
              {clusteredUpcomingLessons.map((lesson) => (
                <UpcomingLessonCard
                  key={lesson.id}
                  lesson={lesson}
                  studentName={students.find((s) => s.id === lesson.studentId)?.name ?? "Ученик"}
                  student={students.find((s) => s.id === lesson.studentId)}
                />
              ))}
            </ul>
          </Panel>
        ) : null}

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
                    curriculumTemplates={curriculumTemplates}
                  />
                ))}
              </div>
            )}
          </div>
        </Panel>

        <div className="grid gap-5 lg:grid-cols-[2fr_3fr]">
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
                <button
                  type="button"
                  onClick={() => setIsAllPastLessonsOpen(true)}
                  className="mt-3 inline-flex shrink-0 items-center gap-1 self-start text-sm font-medium text-muted-foreground"
                >
                  Показать все прошедшие уроки
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
            </Panel>
          ) : null}

          {students.length > 0 ? <FinanceSection students={students} /> : null}
        </div>

        <AllPastLessonsDialog open={isAllPastLessonsOpen} onOpenChange={setIsAllPastLessonsOpen} students={students} />

        <CurriculumSection />

        <PendingRegistrations />
      </div>
    </div>
  )
}
