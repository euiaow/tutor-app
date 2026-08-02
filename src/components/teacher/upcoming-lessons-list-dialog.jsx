import { useEffect, useState } from "react"
import { UpcomingLessonCard } from "@/components/teacher/upcoming-lesson-card"
import { TeacherDialog, TeacherDialogContent, TeacherDialogTitle } from "@/components/teacher/theme-ui"
import { Spinner } from "@/components/ui/spinner"
import { subscribeToAllUpcomingLessons } from "@/firebase/lessons"

const WINDOW_DAYS = 21
const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000

// Replaces the old "jump straight to the single nearest lesson" behavior —
// now that a student can have several weekly schedule slots, the nearest
// lesson alone hid the rest. Reuses subscribeToAllUpcomingLessons (already
// scoped to this one student, no collectionGroup) and its own past-due
// grace-period filter, adding only the 21-day upper bound on top — rather
// than a second near-duplicate Firestore listener.
export function UpcomingLessonsListDialog({ student, open, onOpenChange }) {
  const [lessons, setLessons] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!open) return

    setLoading(true)
    const unsubscribe = subscribeToAllUpcomingLessons(
      student.id,
      (data) => {
        const windowEnd = new Date(Date.now() + WINDOW_MS)
        const inWindow = data.filter((lesson) => {
          const effectiveDate = lesson.rescheduledDate ?? lesson.date
          return effectiveDate && effectiveDate <= windowEnd
        })
        setLessons(inWindow)
        setLoading(false)
      },
      (error) => {
        console.error("Failed to load upcoming lessons:", error)
        setLoading(false)
      },
    )

    return () => unsubscribe()
  }, [open, student.id])

  return (
    <TeacherDialog open={open} onOpenChange={onOpenChange}>
      <TeacherDialogContent>
        <TeacherDialogTitle>Следующие уроки — {student.name}</TeacherDialogTitle>

        <div className="mt-5 max-h-[65vh] overflow-y-auto scrollbar-hidden pr-1">
          {loading ? (
            <Spinner label="Загрузка уроков..." />
          ) : lessons.length === 0 ? (
            <p className="text-sm text-muted-foreground">Нет запланированных уроков на ближайшие 3 недели</p>
          ) : (
            <ul className="space-y-3">
              {lessons.map((lesson) => (
                <UpcomingLessonCard key={lesson.id} lesson={lesson} studentName={student.name} student={student} />
              ))}
            </ul>
          )}
        </div>
      </TeacherDialogContent>
    </TeacherDialog>
  )
}
