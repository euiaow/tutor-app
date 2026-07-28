import { useEffect, useState } from "react"
import { CalendarPlus, CheckCircle2, GraduationCap, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StudentCard } from "@/components/teacher/student-card"
import { RegistrationLinkDialog } from "@/components/teacher/registration-link-dialog"
import { PendingRegistrations } from "@/components/teacher/pending-registrations"
import { HomeworkLessonDialog } from "@/components/teacher/homework-lesson-dialog"
import { Spinner } from "@/components/ui/spinner"
import { subscribeToStudents } from "@/firebase/students"
import { signOutTeacher } from "@/firebase/auth"
import { subscribeToUpcomingLessons } from "@/firebase/lessons"
import { formatLessonDateTime } from "@/lib/schedule"
import {
  getCalendarEmbedInfo,
  getGoogleCalendarStatus,
  startGoogleOAuth,
} from "@/firebase/google-calendar"

function UpcomingLessonCard({ lesson, studentName }) {
  const [dialogOpen, setDialogOpen] = useState(false)

  const hasAssignment =
    lesson.homework.assignment.text.trim() !== "" || lesson.homework.assignment.files.length > 0
  const hasSubmission = lesson.homework.submission.files.length > 0

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate font-semibold text-card-foreground">{studentName}</p>
        <p className="text-xs text-muted-foreground">{formatLessonDateTime(lesson.date)}</p>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <span className={hasAssignment ? "font-semibold text-primary" : "text-muted-foreground"}>
            {hasAssignment ? "Задание добавлено ✓" : "Задание не добавлено"}
          </span>
          <span className={hasSubmission ? "font-semibold text-primary" : "text-muted-foreground"}>
            {hasSubmission ? "ДЗ получено ✓" : "ДЗ не прислано"}
          </span>
        </div>
      </div>

      <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
        Открыть
      </Button>

      <HomeworkLessonDialog
        studentId={lesson.studentId}
        studentName={studentName}
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
    const unsubscribe = subscribeToUpcomingLessons(setUpcomingLessons, (firestoreError) => {
      console.error("Failed to load upcoming lessons:", firestoreError)
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

        {upcomingLessons.length > 0 ? (
          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-extrabold tracking-tight text-foreground">Ближайшие уроки</h2>
            <ul className="flex flex-col gap-3">
              {upcomingLessons.map((lesson) => (
                <UpcomingLessonCard
                  key={lesson.id}
                  lesson={lesson}
                  studentName={students.find((s) => s.id === lesson.studentId)?.name ?? "Ученик"}
                />
              ))}
            </ul>
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
