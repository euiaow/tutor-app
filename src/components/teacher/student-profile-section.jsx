import { useState } from "react"
import { Pencil, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { updateStudentProfile } from "@/firebase/students"
import { assignCurriculumTemplate, getCurriculumTemplates } from "@/firebase/curriculum"
import { SUBJECT_OPTIONS, EXAM_TARGET_OPTIONS, formatSubjects, formatExamTarget } from "@/lib/student-profile"

function CurriculumAssignmentBlock({ student, templates }) {
  const [replacing, setReplacing] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState("")
  const [assigning, setAssigning] = useState(false)
  const [error, setError] = useState("")

  const matchingTemplates = student.examTarget
    ? templates.filter((template) => template.examTarget === student.examTarget)
    : templates

  const currentTemplateName = templates.find(
    (template) => template.id === student.curriculumSourceTemplateId,
  )?.name

  async function handleAssign() {
    if (!selectedTemplateId || assigning) return

    setAssigning(true)
    setError("")
    try {
      await assignCurriculumTemplate(student.id, selectedTemplateId)
      setReplacing(false)
      setSelectedTemplateId("")
    } catch (err) {
      console.error("Failed to assign curriculum template:", err)
      setError(err?.message || "Не удалось назначить программу")
    } finally {
      setAssigning(false)
    }
  }

  function handleReplaceClick() {
    if (
      !confirm(
        "Весь текущий прогресс по темам и прототипам будет сброшен и заменён новой программой. Продолжить?",
      )
    ) {
      return
    }
    setReplacing(true)
  }

  const showPicker = !student.curriculumSourceTemplateId || replacing

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">Учебный план</span>

      {!showPicker ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-foreground">Назначена программа: {currentTemplateName ?? "—"}</span>
          <Button type="button" variant="outline" size="sm" onClick={handleReplaceClick}>
            Заменить
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <select
            value={selectedTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value)}
            disabled={assigning}
            className="h-9 flex-1 rounded-lg border border-border bg-background px-2 text-sm text-foreground outline-none disabled:opacity-50"
          >
            <option value="">Выберите план</option>
            {matchingTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
          <Button type="button" size="sm" onClick={handleAssign} disabled={!selectedTemplateId || assigning}>
            {assigning ? "Назначаем..." : "Назначить программу"}
          </Button>
        </div>
      )}

      {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
    </div>
  )
}

export function StudentProfileSection({ student }) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [subject, setSubject] = useState(student.subject)
  const [examTarget, setExamTarget] = useState(student.examTarget)
  const [hourlyRate, setHourlyRate] = useState(student.hourlyRate)
  const [autoRemindLowBalance, setAutoRemindLowBalance] = useState(student.autoRemindLowBalance)
  const [curriculumTemplates, setCurriculumTemplates] = useState([])

  function handleEnterEdit() {
    setSubject(student.subject)
    setExamTarget(student.examTarget)
    setHourlyRate(student.hourlyRate)
    setAutoRemindLowBalance(student.autoRemindLowBalance)
    setEditing(true)

    getCurriculumTemplates()
      .then(setCurriculumTemplates)
      .catch((err) => console.error("Failed to load curriculum templates:", err))
  }

  function toggleSubject(value) {
    setSubject((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await updateStudentProfile(student.id, {
        subject,
        examTarget,
        hourlyRate: Number(hourlyRate) || 0,
        autoRemindLowBalance,
      })
      setEditing(false)
    } catch (error) {
      console.error("Failed to update student profile:", error)
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={handleEnterEdit}
        className="flex items-start gap-2 rounded-xl border border-border p-3 text-left text-sm text-foreground"
      >
        <div className="flex-1">
          <p className="text-xs text-muted-foreground">Профиль</p>
          <div className="text-sm font-semibold">{formatSubjects(student.subject)}</div>
          <div className="text-sm text-muted-foreground">{formatExamTarget(student.examTarget)}</div>
        </div>
        <Pencil className="ml-auto size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-3">
      <span className="text-xs font-semibold text-muted-foreground">Профиль</span>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">Предмет</span>
        <div className="flex flex-wrap gap-3">
          {SUBJECT_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-center gap-1.5 text-sm text-foreground">
              <input
                type="checkbox"
                checked={subject.includes(option.value)}
                onChange={() => toggleSubject(option.value)}
                disabled={saving}
              />
              {option.label}
            </label>
          ))}
        </div>
      </div>

      <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
        Цель
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

      <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
        Оплата в час
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            value={hourlyRate}
            onChange={(e) => setHourlyRate(e.target.value)}
            disabled={saving}
            className="h-9 flex-1 rounded-lg border border-border bg-background px-2 text-sm text-foreground outline-none disabled:opacity-50"
          />
          <span className="text-sm text-muted-foreground">₽</span>
        </div>
      </label>

      <label className="flex items-center justify-between gap-2 text-sm text-foreground">
        Автоматически напоминать об оплате
        <input
          type="checkbox"
          checked={autoRemindLowBalance}
          onChange={(e) => setAutoRemindLowBalance(e.target.checked)}
          disabled={saving}
          className="size-4"
        />
      </label>

      <CurriculumAssignmentBlock student={student} templates={curriculumTemplates} />

      <div className="flex gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={() => setEditing(false)}
          disabled={saving}
        >
          Отмена
        </Button>
        <Button type="button" className="flex-1" onClick={handleSave} disabled={saving}>
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
  )
}
