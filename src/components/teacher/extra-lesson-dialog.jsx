import { useState } from "react"
import { Plus, Loader2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
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
    if (!nextOpen) {
      reset()
    }
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
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" />
        Доп. урок
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogTitle>Добавить внеплановый урок</DialogTitle>
          <DialogDescription>
            Урок будет создан вне расписания и добавлен в Google Calendar.
          </DialogDescription>

          <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-foreground">
              Ученик
              <select
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                disabled={loading}
                className="h-11 rounded-xl border-2 border-border bg-secondary/40 px-3.5 text-base font-medium text-foreground outline-none transition-all focus:border-primary focus:bg-card focus:ring-4 focus:ring-primary/15 disabled:opacity-50"
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
            </label>

            <label className="flex flex-col gap-1.5 text-sm font-semibold text-foreground">
              Дата и время
              <input
                type="datetime-local"
                value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
                disabled={loading}
                className="h-11 rounded-xl border-2 border-border bg-secondary/40 px-3.5 text-base font-medium text-foreground outline-none transition-all focus:border-primary focus:bg-card focus:ring-4 focus:ring-primary/15 disabled:opacity-50"
              />
            </label>

            <div
              aria-live="polite"
              className={`flex items-center gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive transition-all ${
                error ? "opacity-100" : "pointer-events-none h-0 overflow-hidden py-0 opacity-0"
              }`}
            >
              <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={loading}
                onClick={() => handleOpenChange(false)}
              >
                Отмена
              </Button>
              <Button type="submit" className="flex-1" disabled={!studentId || !dateInput || loading}>
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" aria-hidden="true" />
                    Создаём...
                  </>
                ) : (
                  "Создать урок"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
