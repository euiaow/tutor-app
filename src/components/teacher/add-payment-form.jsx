import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
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
    <form
      className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-sm"
      onSubmit={(e) => e.preventDefault()}
    >
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Сколько занятий оплачено
        <input
          type="number"
          min="1"
          value={count}
          onChange={(e) => setCount(e.target.value)}
          disabled={saving}
          className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground outline-none disabled:opacity-50"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Заметка (необязательно)
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={saving}
          placeholder="оплата за август"
          className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground outline-none disabled:opacity-50"
        />
      </label>

      {error ? <p className="text-xs font-semibold text-destructive">{error}</p> : null}

      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" className="flex-1" onClick={onDone} disabled={saving}>
          Отмена
        </Button>
        <Button
          type="button"
          size="sm"
          className="flex-1"
          onClick={handleSubmit}
          disabled={!count || Number(count) <= 0 || saving}
        >
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : "Добавить"}
        </Button>
      </div>
    </form>
  )
}
