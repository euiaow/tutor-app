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

function toDatetimeLocal(d) {
  const offset = d.getTimezoneOffset() * 60000
  return new Date(d - offset).toISOString().slice(0, 16)
}

function defaultDatetimeLocal() {
  const d = new Date()
  d.setHours(d.getHours() + 1, 0, 0, 0)
  return toDatetimeLocal(d)
}

export function ExtraLessonDialog({ students }) {
  const [open, setOpen] = useState(false)
  const [studentId, setStudentId] = useState("")
  const [dateInput, setDateInput] = useState(defaultDatetimeLocal)
  const [status, setStatus] = useState("idle")
  const [error, setError] = useState("")

  const loading = status === "loading"

  function reset() {
    setStudentId("")
    setDateInput(defaultDatetimeLocal())
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
      await createExtraLesson(studentId, new Date(dateInput))
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
