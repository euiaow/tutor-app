import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { Paperclip, CheckCircle2 } from "lucide-react"
import { NextLessonCard } from "@/components/next-lesson-card"
import { LevelCard } from "@/components/level-card"
import { MaterialsLibrary } from "@/components/materials-library"
import { SubmitHomeworkButton } from "@/components/submit-homework-button"
import { Achievements } from "@/components/achievements"
import { LessonHistory } from "@/components/lesson-history"
import { LessonStats } from "@/components/lesson-stats"
import { getNextLessonDate, formatNextLessonDate, formatLessonDateTime } from "@/lib/schedule"
import { Spinner } from "@/components/ui/spinner"
import { LoginScreen } from "@/components/auth/login-screen"
import { subscribeToStudent } from "@/firebase/students"
import { getLessons, subscribeToUpcomingLesson } from "@/firebase/lessons"

function UpcomingLessonHomework({ studentId }) {
  const [lesson, setLesson] = useState(null)

  useEffect(() => {
    const unsubscribe = subscribeToUpcomingLesson(studentId, setLesson, (error) => {
      console.error("Failed to load upcoming lesson:", error)
    })

    return unsubscribe
  }, [studentId])

  if (!lesson) {
    return null
  }

  const assignment = lesson.homework.assignment
  const hasAssignment = assignment.text.trim() !== "" || assignment.files.length > 0
  const submissionFiles = lesson.homework.submission.files

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Следующий урок</p>
        <p className="text-lg font-bold text-card-foreground">{formatLessonDateTime(lesson.date)}</p>
      </div>

      <div className="flex flex-col gap-2 rounded-xl bg-muted p-4">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Задание
        </span>
        {hasAssignment ? (
          <>
            {assignment.text ? (
              <p className="text-sm text-foreground">{assignment.text}</p>
            ) : null}
            {assignment.files.length > 0 ? (
              <ul className="flex flex-col gap-1.5">
                {assignment.files.map((file, index) => (
                  <li key={`${file.url}-${index}`}>
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                    >
                      <Paperclip className="size-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{file.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Задание пока не добавлено</p>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-xl bg-muted p-4">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Моя домашка
        </span>
        {submissionFiles.length === 0 ? (
          <>
            <p className="text-sm text-foreground">Вы ещё не отправили домашнее задание</p>
            <p className="text-xs text-muted-foreground">
              Отправьте фото через бота в Telegram или VK
            </p>
          </>
        ) : (
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
            Домашнее задание получено ✓
            {submissionFiles[submissionFiles.length - 1]?.submittedAt ? (
              <span className="font-normal text-muted-foreground">
                ({formatLessonDateTime(submissionFiles[submissionFiles.length - 1].submittedAt)})
              </span>
            ) : null}
          </p>
        )}
      </div>
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
  const allMaterials = [
    ...lessons.flatMap((lesson) => lesson.materials || []),
    ...LOCKED_MATERIALS,
  ]

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

      <NextLessonCard
        subject={student.subject}
        nextLessonDate={formatNextLessonDate(getNextLessonDate(student.schedule))}
        reviewTopic={student.reviewTopic}
      />

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

      <SubmitHomeworkButton />

      <Achievements />

      <LessonStats lessons={lessons} />

      <UpcomingLessonHomework studentId={studentId} />

      <LessonHistory lessons={lessons} loading={lessonsLoading} error={lessonsError} />
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
