import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { Paperclip, CheckCircle2 } from "lucide-react"
import { LevelCard } from "@/components/level-card"
import { MaterialsLibrary } from "@/components/materials-library"
import { Achievements } from "@/components/achievements"
import { LessonHistory } from "@/components/lesson-history"
import { LessonStats } from "@/components/lesson-stats"
import { formatLessonDateTime } from "@/lib/schedule"
import { Spinner } from "@/components/ui/spinner"
import { LoginScreen } from "@/components/auth/login-screen"
import { subscribeToStudent } from "@/firebase/students"
import { getLessons, subscribeToUpcomingLesson } from "@/firebase/lessons"

// Reuses the gradient "plate" visual style that used to belong to
// NextLessonCard (src/components/next-lesson-card.jsx, now unused) so the
// homework-aware upcoming lesson stays visually the same top-of-page card.
function NextLessonPlate({ studentId, hasSchedule }) {
  const [lesson, setLesson] = useState(null)

  useEffect(() => {
    const unsubscribe = subscribeToUpcomingLesson(studentId, setLesson, (error) => {
      console.error("Failed to load upcoming lesson:", error)
    })

    return unsubscribe
  }, [studentId])

  const showPlaceholder = !hasSchedule || !lesson
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
            className={`mt-2 font-extrabold text-balance ${showPlaceholder ? "text-2xl sm:text-3xl" : "text-3xl sm:text-4xl"}`}
          >
            {showPlaceholder
              ? "Преподаватель ещё не добавил расписание"
              : formatLessonDateTime(lesson.rescheduledDate ?? lesson.date)}
          </h2>
        </div>

        {!showPlaceholder ? (
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
                <>
                  <p className="mt-1.5 text-sm">Вы ещё не отправили домашнее задание</p>
                  <p className="text-xs text-primary-foreground/70">
                    Отправьте фото через бота в Telegram или VK
                  </p>
                </>
              ) : (
                <p className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold">
                  <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
                  Домашнее задание получено ✓
                  {lastSubmission?.submittedAt ? (
                    <span className="font-normal text-primary-foreground/70">
                      ({formatLessonDateTime(lastSubmission.submittedAt)})
                    </span>
                  ) : null}
                </p>
              )}
            </div>
          </>
        ) : null}
      </div>
    </section>
  )
}

function NotificationsPlaceholder() {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
      <span className="text-sm font-semibold text-foreground">Уведомления</span>
      <span className="text-sm text-muted-foreground">Нет новых уведомлений</span>
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
    let cancelled = false

    getLessons(studentId)
      .then((data) => {
        if (cancelled) return
        setLessons(data)
        setLessonsLoading(false)
      })
      .catch((fetchError) => {
        console.error("Failed to load lessons:", fetchError)
        if (cancelled) return
        setLessonsError("Не удалось загрузить историю уроков")
        setLessonsLoading(false)
      })

    return () => {
      cancelled = true
    }
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

      <NextLessonPlate studentId={studentId} hasSchedule={Boolean(student.schedule)} />

      <NotificationsPlaceholder />

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
