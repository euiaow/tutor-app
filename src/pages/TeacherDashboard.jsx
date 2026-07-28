import { useEffect, useState } from "react"
import { LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StudentCard } from "@/components/teacher/student-card"
import { RegistrationLinkDialog } from "@/components/teacher/registration-link-dialog"
import { PendingRegistrations } from "@/components/teacher/pending-registrations"
import { ScheduleCalendar } from "@/components/teacher/schedule-calendar"
import { Spinner } from "@/components/ui/spinner"
import { subscribeToStudents } from "@/firebase/students"
import { signOutTeacher } from "@/firebase/auth"

export function TeacherDashboard() {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function handleSignOut() {
    try {
      await signOutTeacher()
    } catch (err) {
      console.error("Failed to sign out:", err)
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

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Панель преподавателя</p>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground text-balance">
              Мои ученики
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <RegistrationLinkDialog />
            <Button type="button" variant="outline" size="lg" onClick={handleSignOut}>
              <LogOut aria-hidden="true" />
              Выйти
            </Button>
          </div>
        </header>

        <ScheduleCalendar students={students} />

        <PendingRegistrations />

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
          <section
            aria-label="Список учеников"
            className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
          >
            {students.map((student) => (
              <StudentCard key={student.id} student={student} />
            ))}
          </section>
        )}
      </div>
    </main>
  )
}
