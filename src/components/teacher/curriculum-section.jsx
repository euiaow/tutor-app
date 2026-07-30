import { useEffect, useState } from "react"
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { TAG_STYLES } from "@/components/student-tags"
import {
  createCurriculumTemplate,
  deleteCurriculumTemplate,
  getCurriculumTemplates,
  updateCurriculumTemplate,
} from "@/firebase/curriculum"

const EXAM_TARGET_OPTIONS = [
  { value: "ege", label: "ЕГЭ" },
  { value: "oge", label: "ОГЭ" },
  { value: "school", label: "Школьная программа" },
]

// Short random id for a topic/prototype row — only needs to be unique within
// one template's own arrays, not globally, so no crypto/uuid dependency.
function shortId() {
  return Math.random().toString(36).slice(2, 10)
}

function emptyRow() {
  return { id: shortId(), title: "" }
}

function ExamTargetTag({ examTarget }) {
  const style = TAG_STYLES[examTarget]
  if (!style) return null

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${style.className}`}>
      {style.label}
    </span>
  )
}

function RowList({ label, rows, onChange, addLabel }) {
  function updateRow(index, title) {
    onChange(rows.map((row, i) => (i === index ? { ...row, title } : row)))
  }

  function removeRow(index) {
    onChange(rows.filter((_, i) => i !== index))
  }

  function addRow() {
    onChange([...rows, emptyRow()])
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>

      {rows.map((row, index) => (
        <div key={row.id} className="flex items-center gap-2">
          <input
            type="text"
            value={row.title}
            onChange={(e) => updateRow(index, e.target.value)}
            className="h-9 flex-1 rounded-lg border border-border bg-background px-2 text-sm text-foreground outline-none"
          />
          <button
            type="button"
            onClick={() => removeRow(index)}
            aria-label="Удалить строку"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-red-600 transition-colors hover:bg-red-50"
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addRow}
        className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted"
      >
        <Plus className="size-4" aria-hidden="true" />
        {addLabel}
      </button>
    </div>
  )
}

function CurriculumEditorDialog({ template, open, onOpenChange, onSaved }) {
  const [name, setName] = useState("")
  const [examTarget, setExamTarget] = useState("ege")
  const [topics, setTopics] = useState([])
  const [prototypes, setPrototypes] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open) return
    setName(template?.name ?? "")
    setExamTarget(template?.examTarget ?? "ege")
    setTopics(template?.topics?.length ? template.topics : [])
    setPrototypes(template?.prototypes?.length ? template.prototypes : [])
    setError("")
  }, [open, template])

  function handleOpenChange(nextOpen) {
    if (saving) return
    onOpenChange(nextOpen)
  }

  async function handleSave() {
    if (saving) return

    setSaving(true)
    setError("")
    try {
      const payload = {
        name: name.trim(),
        examTarget,
        topics: topics.filter((row) => row.title.trim() !== ""),
        prototypes: prototypes.filter((row) => row.title.trim() !== ""),
      }

      if (template) {
        await updateCurriculumTemplate(template.id, payload)
      } else {
        await createCurriculumTemplate(payload)
      }

      onSaved()
      handleOpenChange(false)
    } catch (err) {
      console.error("Failed to save curriculum template:", err)
      setError(err?.message || "Не удалось сохранить план")
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogTitle>{template ? "Редактировать план" : "Новый учебный план"}</DialogTitle>
        <DialogDescription>Темы и прототипы шаблона программы.</DialogDescription>

        <div className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            Название
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground outline-none disabled:opacity-50"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            Тип
            <select
              value={examTarget}
              onChange={(e) => setExamTarget(e.target.value)}
              disabled={saving}
              className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground outline-none disabled:opacity-50"
            >
              {EXAM_TARGET_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <RowList label="Темы" rows={topics} onChange={setTopics} addLabel="Добавить тему" />
          <RowList label="Прототипы" rows={prototypes} onChange={setPrototypes} addLabel="Добавить прототип" />

          {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}

          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => handleOpenChange(false)}
              disabled={saving}
            >
              Отмена
            </Button>
            <Button type="button" className="flex-1" onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Сохраняем...
                </>
              ) : (
                "Сохранить"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function TemplateRow({ template, onEdit, onDeleted }) {
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (deleting) return
    if (!confirm(`Удалить план «${template.name}»?`)) return

    setDeleting(true)
    try {
      await deleteCurriculumTemplate(template.id)
      onDeleted()
    } catch (err) {
      console.error("Failed to delete curriculum template:", err)
      setDeleting(false)
    }
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="truncate text-sm font-semibold text-card-foreground">{template.name}</span>
        <ExamTargetTag examTarget={template.examTarget} />
        <span className="shrink-0 text-xs text-muted-foreground">{template.topics.length} тем</span>
        <span className="shrink-0 text-xs text-muted-foreground">{template.prototypes.length} прототипов</span>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <Button type="button" variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="size-3.5" aria-hidden="true" />
          Редактировать
        </Button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          aria-label={`Удалить план ${template.name}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
      </div>
    </li>
  )
}

export function CurriculumSection() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  function reload() {
    setLoading(true)
    getCurriculumTemplates()
      .then((data) => {
        setTemplates(data)
        setError("")
      })
      .catch((err) => {
        console.error("Failed to load curriculum templates:", err)
        setError("Не удалось загрузить учебные планы")
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    reload()
  }, [])

  function handleCreate() {
    setEditingTemplate(null)
    setDialogOpen(true)
  }

  function handleEdit(template) {
    setEditingTemplate(template)
    setDialogOpen(true)
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-extrabold tracking-tight text-foreground">Учебные планы</h2>
        <Button type="button" size="sm" onClick={handleCreate}>
          <Plus className="size-4" aria-hidden="true" />
          Создать план
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Загрузка...</p>
      ) : error ? (
        <p className="text-sm font-semibold text-destructive">{error}</p>
      ) : templates.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <p className="text-muted-foreground">Планов пока нет</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {templates.map((template) => (
            <TemplateRow
              key={template.id}
              template={template}
              onEdit={() => handleEdit(template)}
              onDeleted={reload}
            />
          ))}
        </ul>
      )}

      <CurriculumEditorDialog
        key={dialogOpen ? editingTemplate?.id ?? "new" : "closed"}
        template={editingTemplate}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={reload}
      />
    </section>
  )
}
