import { useState } from "react"
import { Field, TeacherCancelBtn, TeacherModalFooter, TeacherSaveBtn, TeacherSelect, teacherInputCls } from "@/components/teacher/theme-ui"
import { addPayment } from "@/firebase/finance"

// `programs` is optional (defaults to none) — the program picker only shows
// once a student has 2+ programs (each can bill/be paid for independently,
// see core/finance.js's resolveBalanceTarget); with 0-1 the payment still
// credits the student's own single paidLessonsBalance, same as before
// per-program balances existed.
export function AddPaymentForm({ studentId, programs = [], onDone }) {
  const [count, setCount] = useState("")
  const [note, setNote] = useState("")
  const [programId, setProgramId] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const needsProgramChoice = programs.length >= 2

  async function handleSubmit() {
    const parsed = Number(count)
    if (!parsed || parsed <= 0 || saving) return
    if (needsProgramChoice && !programId) {
      setError("Выберите программу")
      return
    }

    setSaving(true)
    setError("")
    try {
      await addPayment(studentId, parsed, note.trim(), needsProgramChoice ? programId : null)
      onDone?.()
    } catch (err) {
      console.error("Failed to add payment:", err)
      setError(err?.message || "Не удалось добавить оплату")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
      {needsProgramChoice ? (
        <Field label="За какую программу">
          <TeacherSelect
            value={programId}
            onChange={setProgramId}
            disabled={saving}
            placeholder="Выбрать программу..."
            options={programs.map((program) => ({ value: program.id, label: program.name }))}
          />
        </Field>
      ) : null}
      <Field label="Сколько занятий оплачено">
        <input
          type="number"
          min="1"
          value={count}
          onChange={(e) => setCount(e.target.value)}
          disabled={saving}
          className={teacherInputCls}
        />
      </Field>
      <Field label="Заметка (необязательно)">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={saving}
          placeholder="оплата за август"
          className={teacherInputCls}
        />
        <p className="mt-1.5 text-xs text-muted-foreground">Заметка видна ученику в его личном кабинете</p>
      </Field>

      {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}

      <TeacherModalFooter>
        <TeacherCancelBtn type="button" onClick={onDone} disabled={saving} />
        <TeacherSaveBtn
          type="button"
          onClick={handleSubmit}
          disabled={!count || Number(count) <= 0 || saving || (needsProgramChoice && !programId)}
        >
          {saving ? "Добавляем..." : "Добавить"}
        </TeacherSaveBtn>
      </TeacherModalFooter>
    </form>
  )
}
