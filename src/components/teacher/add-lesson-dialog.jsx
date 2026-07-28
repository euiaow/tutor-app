import { useRef, useState } from "react"
import { NotebookPen, Loader2, AlertCircle, Paperclip } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { addLesson } from "@/firebase/lessons"
import { uploadMaterial } from "@/firebase/materials"

const ATTENDANCE_OPTIONS = [
  { value: "on_time", label: "Вовремя" },
  { value: "late", label: "Опоздал" },
  { value: "absent", label: "Не пришёл" },
]

const RATING_OPTIONS = [
  { value: "excellent", label: "Отлично" },
  { value: "good", label: "Хорошо" },
  { value: "needs_work", label: "Старайся лучше" },
]

function todayInputValue() {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, "0")
  const dd = String(now.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function parseDateInputValue(value) {
  const [year, month, day] = value.split("-").map(Number)
  return new Date(year, month - 1, day)
}

function ToggleGroup({ options, value, onChange, disabled }) {
  return (
    <div className="flex gap-2">
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`flex-1 rounded-xl border-2 px-3 py-2.5 text-sm font-semibold transition-all disabled:opacity-50 ${
              selected
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border bg-secondary/40 text-foreground hover:bg-secondary/60"
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export function AddLessonDialog({ studentId }) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(todayInputValue)
  const [topic, setTopic] = useState("")
  const [attendance, setAttendance] = useState("on_time")
  const [homeworkDone, setHomeworkDone] = useState(false)
  const [rating, setRating] = useState(null)
  const [materials, setMaterials] = useState([])
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState("idle")
  const [error, setError] = useState("")
  const fileInputRef = useRef(null)

  const loading = status === "loading"
  const canSubmit = date && topic.trim() && rating && !loading && !uploading

  function reset() {
    setDate(todayInputValue())
    setTopic("")
    setAttendance("on_time")
    setHomeworkDone(false)
    setRating(null)
    setMaterials([])
    setUploading(false)
    setStatus("idle")
    setError("")
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError("")

    try {
      const material = await uploadMaterial(file, studentId)
      setMaterials((prev) => [...prev, material])
    } catch (err) {
      console.error("Failed to upload material:", err)
      setError(err?.message || "Не удалось загрузить файл")
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  function handleRemoveMaterial(index) {
    setMaterials((prev) => prev.filter((_, i) => i !== index))
  }

  function handleOpenChange(nextOpen) {
    setOpen(nextOpen)
    if (!nextOpen) {
      reset()
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return

    setStatus("loading")
    setError("")

    try {
      await addLesson(studentId, {
        date: parseDateInputValue(date),
        topic: topic.trim(),
        attendance,
        homeworkDone,
        rating,
        materials,
      })
      handleOpenChange(false)
    } catch (err) {
      console.error("Failed to add lesson:", err)
      setError(err?.message || "Не удалось сохранить урок")
      setStatus("error")
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="lg" className="flex-1" onClick={() => setOpen(true)}>
        <NotebookPen aria-hidden="true" />
        Добавить урок
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogTitle>Новый урок</DialogTitle>
          <DialogDescription>Запишите, как прошло занятие с учеником.</DialogDescription>

          <form className="mt-6 flex flex-col gap-5" onSubmit={handleSubmit}>
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-foreground">
              Дата
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={loading}
                className="h-11 rounded-xl border-2 border-border bg-secondary/40 px-3.5 text-base font-medium text-foreground outline-none transition-all focus:border-primary focus:bg-card focus:ring-4 focus:ring-primary/15 disabled:opacity-50"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm font-semibold text-foreground">
              Тема
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                disabled={loading}
                placeholder="Present Simple"
                className="h-11 rounded-xl border-2 border-border bg-secondary/40 px-3.5 text-base font-medium text-foreground outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary focus:bg-card focus:ring-4 focus:ring-primary/15 disabled:opacity-50"
              />
            </label>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-foreground">Посещение</span>
              <ToggleGroup
                options={ATTENDANCE_OPTIONS}
                value={attendance}
                onChange={setAttendance}
                disabled={loading}
              />
            </div>

            <label className="flex items-center gap-2.5 text-sm font-semibold text-foreground">
              <input
                type="checkbox"
                checked={homeworkDone}
                onChange={(e) => setHomeworkDone(e.target.checked)}
                disabled={loading}
                className="size-5 rounded-md border-2 border-border accent-primary disabled:opacity-50"
              />
              Домашка сделана
            </label>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-foreground">Оценка</span>
              <ToggleGroup
                options={RATING_OPTIONS}
                value={rating}
                onChange={setRating}
                disabled={loading}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-foreground">Материалы к уроку</span>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileChange}
                disabled={loading || uploading}
                className="text-sm text-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-semibold file:text-secondary-foreground file:transition-colors hover:file:bg-secondary/80 disabled:opacity-50"
              />

              {uploading ? (
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Загрузка файла...
                </span>
              ) : null}

              {materials.length > 0 ? (
                <ul className="mt-1 flex flex-col gap-1.5">
                  {materials.map((material, index) => (
                    <li
                      key={`${material.url}-${index}`}
                      className="flex items-center gap-2 rounded-xl border border-border bg-muted px-3 py-2 text-sm"
                    >
                      <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-foreground">{material.title}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveMaterial(index)}
                        disabled={loading}
                        className="shrink-0 text-xs font-semibold text-destructive hover:underline disabled:opacity-50"
                      >
                        Удалить
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div
              aria-live="polite"
              className={`flex items-center gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive transition-all ${
                error ? "opacity-100" : "pointer-events-none h-0 overflow-hidden py-0 opacity-0"
              }`}
            >
              <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>

            <Button type="submit" size="lg" disabled={!canSubmit} className="h-12">
              {loading ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  Сохраняем...
                </>
              ) : (
                "Сохранить урок"
              )}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
