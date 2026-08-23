import { useEffect, useState } from "react"
import { Clock } from "lucide-react"
import { UpcomingLessonCard } from "@/components/teacher/upcoming-lesson-card"
import { TeacherDialog, TeacherDialogContent, TeacherDialogTitle } from "@/components/teacher/theme-ui"
import { Spinner } from "@/components/ui/spinner"
import { subscribeToAllUpcomingLessons } from "@/firebase/lessons"
import { getNextLessonDateForSlot, formatLessonDateTime } from "@/lib/schedule"
import { useTimeZone } from "@/lib/user-prefs-context"

const WINDOW_DAYS = 21
const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

// Firestore only ever stores ONE "upcoming" lesson doc per schedule slot at
// a time (see functions/core/lessons.js's ensureUpcomingLesson — a slot's
// next draft is only created once the current one is completed/rescheduled
// past). That means a student with weekly slots never actually has 3 weeks
// of real lesson docs to show, no matter how wide a date window this dialog
// filters to — there's only ever one real occurrence per slot, which lands
// within the current or next week. To genuinely show "the next 3 weeks",
// this projects the *further* recurring occurrences client-side (weekly,
// starting from each slot's real stored lesson's own date) — read-only
// placeholders, not Firestore docs, so they render as a plain informational
// row (no reschedule/cancel/homework actions, nothing to click) via
// VirtualLessonRow below instead of the real UpcomingLessonCard.
// No timeZone param passed through to getNextLessonDateForSlot on purpose —
// a slot's own stamped timeZone always wins there, and a legacy slot with
// none falls back to its own built-in Europe/Moscow default rather than the
// viewer's current pref (see the identical reasoning in student-row.jsx's
// "Расписание" block and core/lessons.js's ensureUpcomingLesson).
export function getVirtualOccurrences(scheduleSlots, realLessons, windowEnd) {
  const slots = Array.isArray(scheduleSlots) ? scheduleSlots : []
  const virtual = []

  slots.forEach((slot, slotIndex) => {
    const realForSlot = realLessons.find((lesson) => lesson.slotIndex === slotIndex && !lesson.isExtraLesson)
    const anchor = realForSlot
      ? (realForSlot.rescheduledDate ?? realForSlot.date)
      : getNextLessonDateForSlot(slot)
    if (!anchor) return

    let next = new Date(anchor.getTime() + WEEK_MS)
    while (next <= windowEnd) {
      virtual.push({
        key: `virtual-${slotIndex}-${next.getTime()}`,
        date: next,
        durationMinutes: slot.durationMinutes ?? 60,
      })
      next = new Date(next.getTime() + WEEK_MS)
    }
  })

  return virtual.sort((a, b) => a.date - b.date)
}

export function VirtualLessonRow({ date }) {
  const timeZone = useTimeZone()
  return (
    <li className="glass-tile rounded-[1.5rem] p-3 opacity-70">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Clock className="size-3.5 shrink-0" aria-hidden="true" />
        <span>{formatLessonDateTime(date, timeZone)}</span>
        <span className="ml-auto text-xs">Регулярное занятие</span>
      </div>
    </li>
  )
}

// Replaces the old "jump straight to the single nearest lesson" behavior —
// now that a student can have several weekly schedule slots, the nearest
// lesson alone hid the rest. Reuses subscribeToAllUpcomingLessons (already
// scoped to this one student, no collectionGroup) and its own past-due
// grace-period filter, adding only the 21-day upper bound on top, plus the
// virtual-occurrence projection above so the window actually has something
// to show beyond each slot's single real stored draft.
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

  const windowEnd = new Date(Date.now() + WINDOW_MS)
  const virtualOccurrences = getVirtualOccurrences(student.scheduleSlots, lessons, windowEnd)

  return (
    <TeacherDialog open={open} onOpenChange={onOpenChange}>
      <TeacherDialogContent>
        <TeacherDialogTitle>Следующие уроки — {student.name}</TeacherDialogTitle>

        <div className="mt-5 max-h-[65vh] overflow-y-auto scrollbar-hidden pr-1">
          {loading ? (
            <Spinner label="Загрузка уроков..." />
          ) : lessons.length === 0 && virtualOccurrences.length === 0 ? (
            <p className="text-sm text-muted-foreground">Нет запланированных уроков на ближайшие 3 недели</p>
          ) : (
            <ul className="space-y-3">
              {lessons.map((lesson) => (
                <UpcomingLessonCard key={lesson.id} lesson={lesson} studentName={student.name} student={student} />
              ))}
              {virtualOccurrences.map((occurrence) => (
                <VirtualLessonRow key={occurrence.key} date={occurrence.date} />
              ))}
            </ul>
          )}
        </div>
      </TeacherDialogContent>
    </TeacherDialog>
  )
}
