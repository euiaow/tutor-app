import { useEffect, useState } from "react"
import { BookOpen, Pencil, Plus, Trash2 } from "lucide-react"
import { TAG_STYLES } from "@/components/student-tags"
import {
  Field,
  GhostBtn,
  Panel,
  SolidBtn,
  TeacherCancelBtn,
  TeacherDialog,
  TeacherDialogContent,
  TeacherDialogDescription,
  TeacherDialogTitle,
  TeacherModalFooter,
  TeacherSaveBtn,
  Title,
  teacherInputCls,
} from "@/components/teacher/theme-ui"
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

// Drives both the row layout (score field shown or not, its range) and the
// section subtitles for CurriculumEditorDialog — keyed by the same
// examTarget the "Тип" select already writes to state, so switching it
// mid-edit re-renders this immediately with no save/reopen needed.
const EXAM_TARGET_FIELD_CONFIG = {
  ege: {
    showScore: true,
    scoreMin: 0,
    scoreMax: 100,
    scoreStep: 10,
    scoreDefault: 70,
    scorePlaceholder: "0",
    scoreTitle: "Минимальный балл, с которого тема актуальна",
    topicsLabel: "Тема и целевое количество баллов, для которого актуальна",
    prototypesLabel: "Прототип и целевое количество баллов, для которого актуален",
  },
  oge: {
    showScore: true,
    scoreMin: 2,
    scoreMax: 5,
    scoreStep: 1,
    scoreDefault: 4,
    scorePlaceholder: "3",
    scoreTitle: "Минимальная оценка, с которой тема актуальна",
    topicsLabel: "Тема и минимальная оценка, для которой актуальна",
    prototypesLabel: "Прототип и минимальная оценка, для которой актуален",
  },
  school: {
    showScore: false,
    topicsLabel: "Темы",
    prototypesLabel: "Прототипы",
  },
}

// Short random id for a topic/prototype row — only needs to be unique within
// one template's own arrays, not globally, so no crypto/uuid dependency.
function shortId() {
  return Math.random().toString(36).slice(2, 10)
}

function emptyRow(defaultScore = 0) {
  return { id: shortId(), title: "", minScoreRequired: defaultScore }
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

function RowList({
  label,
  rows,
  onChange,
  addLabel,
  showScore,
  scoreMin,
  scoreMax,
  scoreStep,
  scoreDefault,
  scorePlaceholder,
  scoreTitle,
}) {
  function updateRow(index, field, value) {
    onChange(rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)))
  }

  function removeRow(index) {
    onChange(rows.filter((_, i) => i !== index))
  }

  function addRow() {
    onChange([...rows, emptyRow(scoreDefault)])
  }

  return (
    <Field label={label}>
      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={row.id} className="flex items-center gap-2">
            <input
              type="text"
              value={row.title}
              onChange={(e) => updateRow(index, "title", e.target.value)}
              className={`${teacherInputCls} min-w-0 flex-1`}
            />
            {showScore ? (
              <input
                type="number"
                min={scoreMin}
                max={scoreMax}
                step={scoreStep}
                value={row.minScoreRequired ?? 0}
                onChange={(e) => updateRow(index, "minScoreRequired", Number(e.target.value) || 0)}
                placeholder={scorePlaceholder}
                title={scoreTitle}
                className={`${teacherInputCls} spinner-visible w-16! shrink-0 px-2! text-center`}
              />
            ) : null}
            <button
              type="button"
              onClick={() => removeRow(index)}
              aria-label="Удалить строку"
              className="glass-tile grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:text-destructive"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={addRow}
          className="w-full rounded-full border border-dashed border-glass-border px-4 py-2.5 text-sm font-semibold text-muted-foreground transition hover:text-rose-deep"
        >
          + {addLabel}
        </button>
      </div>
    </Field>
  )
}

function CurriculumEditorDialog({ template, open, onOpenChange, onSaved }) {
  const [name, setName] = useState("")
  const [examTarget, setExamTarget] = useState("ege")
  const [topics, setTopics] = useState([])
  const [prototypes, setPrototypes] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const fieldConfig = EXAM_TARGET_FIELD_CONFIG[examTarget]

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
      // School templates show no score field at all, but every row still
      // needs minScoreRequired: 0 written so the document shape stays
      // uniform across template types — Exam Radar and the
      // curriculumProgress copy-on-assign both key off this field existing.
      const normalizeRow = (row) => ({
        ...row,
        minScoreRequired: examTarget === "school" ? 0 : row.minScoreRequired,
      })

      const payload = {
        name: name.trim(),
        examTarget,
        topics: topics.filter((row) => row.title.trim() !== "").map(normalizeRow),
        prototypes: prototypes.filter((row) => row.title.trim() !== "").map(normalizeRow),
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
    <TeacherDialog open={open} onOpenChange={handleOpenChange}>
      <TeacherDialogContent>
        <TeacherDialogTitle>{template ? "Редактировать план" : "Новый учебный план"}</TeacherDialogTitle>
        <TeacherDialogDescription>Темы и прототипы шаблона программы.</TeacherDialogDescription>

        <div className="mt-5 space-y-4">
          <Field label="Название">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              placeholder="Например, Русский ЕГЭ"
              className={teacherInputCls}
            />
          </Field>

          <Field label="Тип">
            <select
              value={examTarget}
              onChange={(e) => setExamTarget(e.target.value)}
              disabled={saving}
              className={teacherInputCls}
            >
              {EXAM_TARGET_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>

          <RowList
            label={fieldConfig.topicsLabel}
            rows={topics}
            onChange={setTopics}
            addLabel="Добавить тему"
            showScore={fieldConfig.showScore}
            scoreMin={fieldConfig.scoreMin}
            scoreMax={fieldConfig.scoreMax}
            scoreStep={fieldConfig.scoreStep}
            scoreDefault={fieldConfig.scoreDefault}
            scorePlaceholder={fieldConfig.scorePlaceholder}
            scoreTitle={fieldConfig.scoreTitle}
          />
          <RowList
            label={fieldConfig.prototypesLabel}
            rows={prototypes}
            onChange={setPrototypes}
            addLabel="Добавить прототип"
            showScore={fieldConfig.showScore}
            scoreMin={fieldConfig.scoreMin}
            scoreMax={fieldConfig.scoreMax}
            scoreStep={fieldConfig.scoreStep}
            scoreDefault={fieldConfig.scoreDefault}
            scorePlaceholder={fieldConfig.scorePlaceholder}
            scoreTitle={fieldConfig.scoreTitle}
          />

          {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}

          <TeacherModalFooter>
            <TeacherCancelBtn onClick={() => handleOpenChange(false)} disabled={saving} />
            <TeacherSaveBtn onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? "Сохраняем..." : "Сохранить"}
            </TeacherSaveBtn>
          </TeacherModalFooter>
        </div>
      </TeacherDialogContent>
    </TeacherDialog>
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
    <li className="glass-tile flex flex-wrap items-center gap-3 rounded-[1.5rem] px-4 py-3">
      <BookOpen className="size-4 shrink-0 text-rose-deep" aria-hidden="true" />
      <span className="truncate font-semibold text-ink">{template.name}</span>
      <ExamTargetTag examTarget={template.examTarget} />
      <span className="text-xs text-muted-foreground">{template.topics.length} тем</span>
      <span className="text-xs text-muted-foreground">{template.prototypes.length} прототипов</span>
      <div className="ml-auto flex items-center gap-2">
        <GhostBtn onClick={onEdit} className="px-3.5 py-2">
          <Pencil className="size-3.5" aria-hidden="true" />
          Редактировать
        </GhostBtn>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          aria-label={`Удалить план ${template.name}`}
          className="text-muted-foreground/70 transition hover:text-destructive disabled:opacity-50"
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
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Title>Учебные планы</Title>
        <SolidBtn onClick={handleCreate}>
          <Plus className="size-3.5" aria-hidden="true" />
          Создать план
        </SolidBtn>
      </div>

      <div className="mt-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Загрузка...</p>
        ) : error ? (
          <p className="text-sm font-semibold text-destructive">{error}</p>
        ) : templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">Планов пока нет</p>
        ) : (
          <ul className="space-y-3">
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
      </div>

      <CurriculumEditorDialog
        key={dialogOpen ? editingTemplate?.id ?? "new" : "closed"}
        template={editingTemplate}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={reload}
      />
    </Panel>
  )
}
