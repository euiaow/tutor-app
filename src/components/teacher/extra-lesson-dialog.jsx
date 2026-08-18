import { useState } from "react"
import { AlertCircle, Plus } from "lucide-react"
import {
  Field,
  SolidBtn,
  TeacherCancelBtn,
  TeacherDialog,
  TeacherDialogContent,
  TeacherDialogDescription,
  TeacherDialogTitle,
  TeacherModalFooter,
  TeacherSaveBtn,
  teacherInputCls,
} from "@/components/teacher/theme-ui"
import { createExtraLesson } from "@/firebase/lessons"
import { useTimeZone } from "@/lib/user-prefs-context"
import { datetimeLocalToUtcDate, utcDateToLocalInput } from "@/lib/timezone"
import { getZonedParts, zonedTimeToUtc } from "@/lib/schedule"

// "Top of the next hour" in the teacher's own timezone, not the device's —
// e.g. 14:35 Novosibirsk should default to 15:00 Novosibirsk regardless of
// what zone the teacher's browser happens to be running in.
function defaultDatetimeLocal(timeZone) {
  const parts = getZonedParts(new Date(), timeZone)
  const rounded = zonedTimeToUtc(parts.year, parts.month, parts.day, parts.hour + 1, 0, timeZone)
  return utcDateToLocalInput(rounded, timeZone)
}

export function ExtraLessonDialog({ students }) {
  const timeZone = useTimeZone()
  const [open, setOpen] = useState(false)
  const [studentId, setStudentId] = useState("")
  const [dateInput, setDateInput] = useState(() => defaultDatetimeLocal(timeZone))
  const [status, setStatus] = useState("idle")
  const [error, setError] = useState("")

  const loading = status === "loading"

  function reset() {
    setStudentId("")
    setDateInput(defaultDatetimeLocal(timeZone))
    setStatus("idle")
    setError("")
  }

  function handleOpenChange(nextOpen) {
    setOpen(nextOpen)
    if (!nextOpen) reset()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!studentId || !dateInput || loading) return

    setStatus("loading")
    setError("")

    try {
      await createExtraLesson(studentId, datetimeLocalToUtcDate(dateInput, timeZone))
      setOpen(false)
      reset()
    } catch (err) {
      console.error("Failed to create extra lesson:", err)
      setError(err?.message || "Не удалось создать внеплановый урок")
      setStatus("error")
    }
  }

  return (
    <>
      <SolidBtn onClick={() => setOpen(true)}>
        <Plus className="size-3.5" aria-hidden="true" />
        Доп. урок
      </SolidBtn>

      <TeacherDialog open={open} onOpenChange={handleOpenChange}>
        <TeacherDialogContent>
          <TeacherDialogTitle>Добавить внеплановый урок</TeacherDialogTitle>
          <TeacherDialogDescription>
            Урок будет создан вне расписания и добавлен в Google Calendar.
          </TeacherDialogDescription>

          <form className="mt-5 flex flex-col gap-4" onSubmit={handleSubmit}>
            <Field label="Ученик">
              <select
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                disabled={loading}
                className={teacherInputCls}
              >
                <option value="" disabled>
                  Выберите ученика
                </option>
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Дата и время">
              <input
                type="datetime-local"
                value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
                disabled={loading}
                className={teacherInputCls}
              />
            </Field>

            {error ? (
              <div className="flex items-center gap-2 rounded-[1rem] bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
                <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            ) : null}

            <TeacherModalFooter>
              <TeacherCancelBtn type="button" onClick={() => handleOpenChange(false)} disabled={loading} />
              <TeacherSaveBtn type="submit" disabled={!studentId || !dateInput || loading}>
                {loading ? "Создаём..." : "Создать урок"}
              </TeacherSaveBtn>
            </TeacherModalFooter>
          </form>
        </TeacherDialogContent>
      </TeacherDialog>
    </>
  )
}
