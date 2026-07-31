import { useState } from "react"
import { Field, TeacherCancelBtn, TeacherModalFooter, TeacherSaveBtn, teacherInputCls } from "@/components/teacher/theme-ui"
import { addPayment } from "@/firebase/finance"

export function AddPaymentForm({ studentId, onDone }) {
  const [count, setCount] = useState("")
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit() {
    const parsed = Number(count)
    if (!parsed || parsed <= 0 || saving) return

    setSaving(true)
    setError("")
    try {
      await addPayment(studentId, parsed, note.trim())
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
      </Field>

      {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}

      <TeacherModalFooter>
        <TeacherCancelBtn type="button" onClick={onDone} disabled={saving} />
        <TeacherSaveBtn
          type="button"
          onClick={handleSubmit}
          disabled={!count || Number(count) <= 0 || saving}
        >
          {saving ? "Добавляем..." : "Добавить"}
        </TeacherSaveBtn>
      </TeacherModalFooter>
    </form>
  )
}
