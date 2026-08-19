import { useEffect, useState } from "react"
import { BookOpen, ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-react"
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
import { createExamType, subscribeToExamTypes, LANGUAGE_LEVELS } from "@/firebase/examTypes"
import { auth } from "@/firebase/firebase"
import { SubjectPicker } from "@/components/teacher/subject-picker"

const NEW_EXAM_TYPE_VALUE = "__new__"
const DEFAULT_LANGUAGE_LEVEL_INDEX = LANGUAGE_LEVELS.indexOf("B1")

// Reasonable Russian default for a freshly created type's scaleUnitLabel —
// the inline "+ Создать новый тип экзамена" form (per spec) only asks for
// Название/Тип шкалы/Мин/Макс, not a unit label, so this fills it in rather
// than leaving every custom score-type goal reading as a bare number.
function defaultUnitLabel(scaleType) {
  if (scaleType === "score") return "баллов"
  if (scaleType === "grade") return "оценка"
  return ""
}

// Short random id for a topic/prototype row — only needs to be unique within
// one template's own arrays, not globally, so no crypto/uuid dependency.
function shortId() {
  return Math.random().toString(36).slice(2, 10)
}

function emptyRow(defaultScore = 0) {
  return { id: shortId(), title: "", minScoreRequired: defaultScore }
}

function ExamTypeTag({ examType }) {
  if (!examType) return null

  return (
    <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
      {examType.name}
    </span>
  )
}

// A1-C2 progression for language_level topics/prototypes — same idea as
// ЕГЭ's minScoreRequired (a topic only counts toward the radar once the
// target reaches this threshold), just stepped through a fixed 6-level
// scale with arrows instead of typed into a number input, since there's no
// natural "type a level" input and the range is tiny/ordinal.
function LevelStepper({ value, min, max, onChange, title }) {
  const index = value ?? DEFAULT_LANGUAGE_LEVEL_INDEX
  return (
    <div className="flex shrink-0 items-center gap-1" title={title}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, index - 1))}
        disabled={index <= min}
        aria-label="Понизить уровень"
        className="glass-tile grid size-7 place-items-center rounded-full text-muted-foreground transition hover:text-rose-deep disabled:opacity-40"
      >
        <ChevronDown className="size-3.5" aria-hidden="true" />
      </button>
      <span className="w-9 text-center text-sm font-semibold text-ink">{LANGUAGE_LEVELS[index]}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, index + 1))}
        disabled={index >= max}
        aria-label="Повысить уровень"
        className="glass-tile grid size-7 place-items-center rounded-full text-muted-foreground transition hover:text-rose-deep disabled:opacity-40"
      >
        <ChevronUp className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}

function RowList({
  label,
  rows,
  onChange,
  addLabel,
  showScore,
  levelMode,
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
              levelMode ? (
                <LevelStepper
                  value={row.minScoreRequired ?? scoreDefault}
                  min={scoreMin}
                  max={scoreMax}
                  onChange={(next) => updateRow(index, "minScoreRequired", next)}
                  title={scoreTitle}
                />
              ) : (
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
              )
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

// Derives the same shape the old hardcoded EXAM_TARGET_FIELD_CONFIG used to
// provide (showScore/scoreMin/scoreMax/scoreStep/scoreDefault/labels) from
// whichever examType is actually selected — "none" scaleType behaves like
// the old "school" case (no score field at all).
function fieldConfigForExamType(examType) {
  if (!examType || examType.scaleType === "none") {
    return { showScore: false, topicsLabel: "Темы", prototypesLabel: "Прототипы" }
  }

  // Same requiredItems() mechanic Exam Radar already uses for score/grade
  // scales (topic counts once minScoreRequired <= targetScore) — reused
  // as-is here since targetScore for "language_level" is already stored as
  // an index into LANGUAGE_LEVELS (see firebase/examTypes.js), so a
  // 0-5 minScoreRequired compares against it exactly the same way a
  // numeric score would.
  if (examType.scaleType === "language_level") {
    return {
      showScore: true,
      levelMode: true,
      scoreMin: 0,
      scoreMax: LANGUAGE_LEVELS.length - 1,
      scoreStep: 1,
      scoreDefault: DEFAULT_LANGUAGE_LEVEL_INDEX,
      topicsLabel: "Тема и минимальный уровень, с которого актуальна",
      prototypesLabel: "Прототип и минимальный уровень, с которого актуален",
    }
  }

  const unit = examType.scaleUnitLabel || ""
  return {
    showScore: true,
    scoreMin: examType.scaleMin ?? 0,
    scoreMax: examType.scaleMax ?? 100,
    scoreStep: examType.scaleStep ?? 1,
    scoreDefault: examType.scaleMin ?? 0,
    scorePlaceholder: String(examType.scaleMin ?? 0),
    scoreTitle: `Минимальный(ая) ${unit || "показатель"}, с которого(ой) тема актуальна`,
    topicsLabel: `Тема и целевой(ая) ${unit || "показатель"}, для которого(ой) актуальна`,
    prototypesLabel: `Прототип и целевой(ая) ${unit || "показатель"}, для которого(ой) актуален`,
  }
}

function CurriculumEditorDialog({ template, examTypes, teacherId, open, onOpenChange, onSaved }) {
  const [name, setName] = useState("")
  const [examTypeId, setExamTypeId] = useState("")
  const [subject, setSubject] = useState("")
  const [newTypeName, setNewTypeName] = useState("")
  const [newTypeScale, setNewTypeScale] = useState("score")
  const [newTypeMin, setNewTypeMin] = useState(0)
  const [newTypeMax, setNewTypeMax] = useState(100)
  const [topics, setTopics] = useState([])
  const [prototypes, setPrototypes] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const isCreatingNewType = examTypeId === NEW_EXAM_TYPE_VALUE
  const selectedExamType = examTypes.find((t) => t.id === examTypeId) ?? null
  const fieldConfig = isCreatingNewType
    ? fieldConfigForExamType(
        newTypeScale === "none"
          ? { scaleType: "none" }
          : { scaleType: newTypeScale, scaleMin: Number(newTypeMin), scaleMax: Number(newTypeMax), scaleStep: 1 },
      )
    : fieldConfigForExamType(selectedExamType)

  useEffect(() => {
    if (!open) return
    setName(template?.name ?? "")
    setSubject(template?.subject ?? "")
    setExamTypeId(template?.examTypeId ?? examTypes[0]?.id ?? "")
    setNewTypeName("")
    setNewTypeScale("score")
    setNewTypeMin(0)
    setNewTypeMax(100)
    setTopics(template?.topics?.length ? template.topics : [])
    setPrototypes(template?.prototypes?.length ? template.prototypes : [])
    setError("")
  }, [open, template, examTypes])

  function handleOpenChange(nextOpen) {
    if (saving) return
    onOpenChange(nextOpen)
  }

  async function handleSave() {
    if (saving) return

    setSaving(true)
    setError("")
    try {
      if (!subject) {
        throw new Error("Укажи предмет")
      }

      let resolvedExamTypeId = examTypeId

      if (isCreatingNewType) {
        if (!newTypeName.trim()) {
          throw new Error("Укажи название нового типа экзамена")
        }
        resolvedExamTypeId = await createExamType(teacherId, {
          name: newTypeName,
          scaleType: newTypeScale,
          scaleMin: newTypeMin,
          scaleMax: newTypeMax,
          scaleUnitLabel: defaultUnitLabel(newTypeScale),
        })
      }

      // "school"-style (scaleType "none") templates show no score field at
      // all, but every row still needs minScoreRequired: 0 written so the
      // document shape stays uniform across template types — Exam Radar and
      // the curriculumProgress copy-on-assign both key off this field
      // existing.
      const normalizeRow = (row) => ({
        ...row,
        minScoreRequired: fieldConfig.showScore ? row.minScoreRequired : 0,
      })

      const payload = {
        name: name.trim(),
        examTypeId: resolvedExamTypeId,
        subject,
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

          <Field label="Предмет">
            <SubjectPicker
              single
              teacherId={teacherId}
              selected={subject}
              onToggle={setSubject}
              disabled={saving}
            />
          </Field>

          <Field label="Тип экзамена">
            <select
              value={examTypeId}
              onChange={(e) => setExamTypeId(e.target.value)}
              disabled={saving}
              className={teacherInputCls}
            >
              {examTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
              <option value={NEW_EXAM_TYPE_VALUE}>+ Создать новый тип экзамена</option>
            </select>
          </Field>

          {isCreatingNewType ? (
            <div className="glass-tile space-y-3 rounded-[1.25rem] p-4">
              <Field label="Название типа">
                <input
                  type="text"
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  disabled={saving}
                  placeholder="Например, IELTS"
                  className={teacherInputCls}
                />
              </Field>
              <Field label="Тип шкалы">
                <select
                  value={newTypeScale}
                  onChange={(e) => setNewTypeScale(e.target.value)}
                  disabled={saving}
                  className={teacherInputCls}
                >
                  <option value="score">Числовой балл</option>
                  <option value="grade">Оценка</option>
                  <option value="language_level">Уровни языка (A1–C2)</option>
                  <option value="none">Без шкалы</option>
                </select>
              </Field>
              {newTypeScale !== "none" && newTypeScale !== "language_level" ? (
                <div className="flex gap-3">
                  <Field label="Мин. значение">
                    <input
                      type="number"
                      value={newTypeMin}
                      onChange={(e) => setNewTypeMin(e.target.value)}
                      disabled={saving}
                      className={teacherInputCls}
                    />
                  </Field>
                  <Field label="Макс. значение">
                    <input
                      type="number"
                      value={newTypeMax}
                      onChange={(e) => setNewTypeMax(e.target.value)}
                      disabled={saving}
                      className={teacherInputCls}
                    />
                  </Field>
                </div>
              ) : null}
            </div>
          ) : null}

          <RowList
            label={fieldConfig.topicsLabel}
            rows={topics}
            onChange={setTopics}
            addLabel="Добавить тему"
            showScore={fieldConfig.showScore}
            levelMode={fieldConfig.levelMode}
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
            levelMode={fieldConfig.levelMode}
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
            <TeacherSaveBtn onClick={handleSave} disabled={saving || !name.trim() || !subject}>
              {saving ? "Сохраняем..." : "Сохранить"}
            </TeacherSaveBtn>
          </TeacherModalFooter>
        </div>
      </TeacherDialogContent>
    </TeacherDialog>
  )
}

function TemplateRow({ template, examType, onEdit, onDeleted }) {
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
      <ExamTypeTag examType={examType} />
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
  const [examTypes, setExamTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const teacherId = auth.currentUser?.uid ?? null

  function reload() {
    const uid = auth.currentUser?.uid
    if (!uid) return

    setLoading(true)
    getCurriculumTemplates(uid)
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

  useEffect(() => {
    if (!teacherId) return
    const unsubscribe = subscribeToExamTypes(teacherId, setExamTypes, (err) =>
      console.error("Failed to load exam types:", err),
    )
    return unsubscribe
  }, [teacherId])

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
                examType={examTypes.find((t) => t.id === template.examTypeId) ?? null}
                onEdit={() => handleEdit(template)}
                onDeleted={reload}
              />
            ))}
          </ul>
        )}
      </div>

      <CurriculumEditorDialog
        template={editingTemplate}
        examTypes={examTypes}
        teacherId={teacherId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={reload}
      />
    </Panel>
  )
}
