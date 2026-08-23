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
  TeacherSelect,
  teacherInputCls,
} from "@/components/teacher/theme-ui"
import { createExtraLesson } from "@/firebase/lessons"
import { createExtraGroupLesson } from "@/firebase/groups"
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

// `groups` is optional (defaults to none) so any caller that hasn't been
// updated to pass it yet still works exactly as before — the "Ученик/
// Группа" toggle simply doesn't appear when there's nothing to switch to.
export function ExtraLessonDialog({ students, groups = [] }) {
  const timeZone = useTimeZone()
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState("student") // "student" | "group"
  const [studentId, setStudentId] = useState("")
  const [groupId, setGroupId] = useState("")
  const [dateInput, setDateInput] = useState(() => defaultDatetimeLocal(timeZone))
  const [status, setStatus] = useState("idle")
  const [error, setError] = useState("")

  const loading = status === "loading"
  const targetId = target === "student" ? studentId : groupId

  function reset() {
    setTarget("student")
    setStudentId("")
    setGroupId("")
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
    if (!targetId || !dateInput || loading) return

    setStatus("loading")
    setError("")

    try {
      if (target === "group") {
        await createExtraGroupLesson(groupId, datetimeLocalToUtcDate(dateInput, timeZone))
      } else {
        await createExtraLesson(studentId, datetimeLocalToUtcDate(dateInput, timeZone))
      }
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
            {groups.length > 0 ? (
              <Field label="Кому">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTarget("student")}
                    disabled={loading}
                    className={`flex-1 rounded-full px-3.5 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      target === "student" ? "text-primary-foreground" : "glass-tile text-foreground/80 hover:text-rose-deep"
                    }`}
                    style={target === "student" ? { background: "var(--gradient-orb)", boxShadow: "var(--shadow-soft)" } : undefined}
                  >
                    Ученик
                  </button>
                  <button
                    type="button"
                    onClick={() => setTarget("group")}
                    disabled={loading}
                    className={`flex-1 rounded-full px-3.5 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      target === "group" ? "text-primary-foreground" : "glass-tile text-foreground/80 hover:text-rose-deep"
                    }`}
                    style={target === "group" ? { background: "var(--gradient-orb)", boxShadow: "var(--shadow-soft)" } : undefined}
                  >
                    Группа
                  </button>
                </div>
              </Field>
            ) : null}

            {target === "group" ? (
              <Field label="Группа">
                <TeacherSelect
                  value={groupId}
                  onChange={setGroupId}
                  disabled={loading}
                  placeholder="Выберите группу"
                  options={groups.map((group) => ({ value: group.id, label: group.name }))}
                />
              </Field>
            ) : (
              <Field label="Ученик">
                <TeacherSelect
                  value={studentId}
                  onChange={setStudentId}
                  disabled={loading}
                  placeholder="Выберите ученика"
                  options={students.map((student) => ({ value: student.id, label: student.name }))}
                />
              </Field>
            )}

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
              <TeacherSaveBtn type="submit" disabled={!targetId || !dateInput || loading}>
                {loading ? "Создаём..." : "Создать урок"}
              </TeacherSaveBtn>
            </TeacherModalFooter>
          </form>
        </TeacherDialogContent>
      </TeacherDialog>
    </>
  )
}
