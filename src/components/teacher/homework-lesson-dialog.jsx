import { useEffect, useRef, useState } from "react"
import { AlertCircle, Loader2, Paperclip, ExternalLink, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import {
  addLessonMaterial,
  completeLesson,
  ensureUpcomingLesson,
  getNearestUpcomingLesson,
  removeLessonMaterial,
  subscribeToLesson,
  updateHomeworkAssignment,
  updateLessonTopic,
} from "@/firebase/lessons"
import { getCurriculumProgress, markTopicsCovered } from "@/firebase/curriculum"
import { uploadMaterial } from "@/firebase/materials"
import { formatLessonDateTime } from "@/lib/schedule"

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

function optionLabel(options, value) {
  return options.find((option) => option.value === value)?.label ?? "—"
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

// One "row" per selected item — each row is a <select> over items not yet
// covered and not already picked by a different row in this same form
// (picked-elsewhere items stay excluded from other rows' options, but a
// row's own current value stays in its own list so it doesn't disappear).
function CoveredMaterialPicker({ label, items, selections, onChange, addLabel, allCoveredLabel }) {
  const available = items.filter((item) => !item.covered)

  if (available.length === 0) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <p className="text-sm text-muted-foreground">{allCoveredLabel}</p>
      </div>
    )
  }

  function updateRow(index, value) {
    onChange(selections.map((v, i) => (i === index ? value : v)))
  }

  function removeRow(index) {
    onChange(selections.filter((_, i) => i !== index))
  }

  function addRow() {
    onChange([...selections, ""])
  }

  function optionsForRow(index) {
    const usedElsewhere = new Set(selections.filter((_, i) => i !== index).filter(Boolean))
    return available.filter((item) => item.id === selections[index] || !usedElsewhere.has(item.id))
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-foreground">{label}</span>

      {selections.map((value, index) => (
        <div key={index} className="flex items-center gap-2">
          <select
            value={value}
            onChange={(e) => updateRow(index, e.target.value)}
            className="h-9 flex-1 rounded-lg border border-border bg-background px-2 text-sm text-foreground outline-none"
          >
            <option value="">Выберите...</option>
            {optionsForRow(index).map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
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

export function HomeworkLessonDialog({
  studentId,
  studentName,
  lessonId: fixedLessonId,
  open,
  onOpenChange,
}) {
  const [derivedLessonId, setDerivedLessonId] = useState(null)
  const lessonId = fixedLessonId ?? derivedLessonId
  const [lesson, setLesson] = useState(null)
  const [prepareError, setPrepareError] = useState("")
  const preparing = open && !lesson && !prepareError
  const isCompleted = lesson?.status === "completed"

  const [mode, setMode] = useState("upcoming")

  const [assignmentText, setAssignmentText] = useState("")
  const [assignmentFiles, setAssignmentFiles] = useState([])
  const initializedAssignmentRef = useRef(false)

  const [attendance, setAttendance] = useState("on_time")
  const [homeworkDone, setHomeworkDone] = useState(false)
  const [rating, setRating] = useState(null)
  const [topic, setTopic] = useState("")

  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [completing, setCompleting] = useState(false)
  const [completeError, setCompleteError] = useState("")
  const fileInputRef = useRef(null)

  const [uploadingExtra, setUploadingExtra] = useState(false)
  const [extraUploadError, setExtraUploadError] = useState("")
  const extraFileInputRef = useRef(null)
  const [removingMaterialUrl, setRemovingMaterialUrl] = useState(null)

  const [curriculumProgress, setCurriculumProgress] = useState(null)
  const [topicSelections, setTopicSelections] = useState([])
  const [prototypeSelections, setPrototypeSelections] = useState([])

  // Reset so a later re-open starts fresh instead of keeping whatever was
  // left over from the previous time this dialog was open. Done directly in
  // the close handler (a user-triggered event, not an effect reacting to
  // `open`) so it isn't a synchronous setState-in-effect.
  function handleDialogOpenChange(nextOpen) {
    if (!nextOpen) {
      initializedAssignmentRef.current = false
      setMode("upcoming")
      setAttendance("on_time")
      setHomeworkDone(false)
      setRating(null)
      setTopic("")
      setCompleteError("")
      setExtraUploadError("")
      setCurriculumProgress(null)
      setTopicSelections([])
      setPrototypeSelections([])
    }
    onOpenChange(nextOpen)
  }

  useEffect(() => {
    if (!open) return

    let cancelled = false
    let unsubscribe = null

    // A specific lessonId (e.g. from "Прошедшие уроки") means we already
    // know exactly which lesson to show — skip ensureUpcomingLesson
    // entirely, since that call only ever finds/creates an "upcoming" draft
    // and would be the wrong lesson for a completed one.
    if (fixedLessonId) {
      unsubscribe = subscribeToLesson(
        studentId,
        fixedLessonId,
        (data) => {
          if (cancelled) return
          setLesson(data)
        },
        (error) => {
          console.error("Failed to load lesson:", error)
          if (cancelled) return
          setPrepareError("Не удалось загрузить урок")
        },
      )

      return () => {
        cancelled = true
        if (unsubscribe) unsubscribe()
      }
    }

    getNearestUpcomingLesson(studentId)
      .then((existingId) => (existingId ? existingId : ensureUpcomingLesson(studentId)))
      .then((id) => {
        if (cancelled) return

        if (!id) {
          setPrepareError(
            "У ученика не задано расписание занятий — сначала укажите день и время в карточке ученика",
          )
          return
        }

        setDerivedLessonId(id)
        unsubscribe = subscribeToLesson(
          studentId,
          id,
          (data) => {
            if (cancelled) return
            setLesson(data)
          },
          (error) => {
            console.error("Failed to load lesson:", error)
            if (cancelled) return
            setPrepareError("Не удалось загрузить урок")
          },
        )
      })
      .catch((error) => {
        console.error("Failed to prepare upcoming lesson:", error)
        if (cancelled) return
        setPrepareError("Не удалось подготовить урок")
      })

    return () => {
      cancelled = true
      if (unsubscribe) unsubscribe()
    }
  }, [open, studentId, fixedLessonId])

  // Loaded once per open, not tied to `mode` — cheap getDoc, only actually
  // rendered once the teacher clicks into completing mode.
  useEffect(() => {
    if (!open) return

    getCurriculumProgress(studentId)
      .then(setCurriculumProgress)
      .catch((error) => console.error("Failed to load curriculum progress:", error))
  }, [open, studentId])

  useEffect(() => {
    if (lesson && !initializedAssignmentRef.current) {
      setAssignmentText(lesson.homework.assignment.text)
      setAssignmentFiles(lesson.homework.assignment.files)
      setTopic(lesson.topic ?? "")
      initializedAssignmentRef.current = true
    }
  }, [lesson])

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setUploadError("")

    try {
      const material = await uploadMaterial(file, studentId)
      setAssignmentFiles((prev) => [...prev, material])
    } catch (error) {
      console.error("Failed to upload assignment file:", error)
      setUploadError(error?.message || "Не удалось загрузить файл")
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  function handleRemoveFile(index) {
    setAssignmentFiles((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSaveAssignment() {
    if (!lessonId || saving) return

    setSaving(true)
    setSaveError("")

    try {
      await Promise.all([
        updateHomeworkAssignment(studentId, lessonId, {
          text: assignmentText,
          files: assignmentFiles,
        }),
        updateLessonTopic(studentId, lessonId, topic),
      ])
    } catch (error) {
      console.error("Failed to save lesson topic/assignment:", error)
      setSaveError(error?.message || "Не удалось сохранить")
    } finally {
      setSaving(false)
    }
  }

  async function handleAddExtraMaterial(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingExtra(true)
    setExtraUploadError("")

    try {
      const material = await uploadMaterial(file, studentId)
      await addLessonMaterial(studentId, lessonId, material)
    } catch (error) {
      console.error("Failed to attach extra material:", error)
      setExtraUploadError(error?.message || "Не удалось загрузить файл")
    } finally {
      setUploadingExtra(false)
      if (extraFileInputRef.current) {
        extraFileInputRef.current.value = ""
      }
    }
  }

  async function handleRemoveExtraMaterial(material) {
    if (removingMaterialUrl) return

    setRemovingMaterialUrl(material.url)
    try {
      await removeLessonMaterial(studentId, lessonId, material)
    } catch (error) {
      console.error("Failed to remove material:", error)
      setExtraUploadError(error?.message || "Не удалось удалить файл")
    } finally {
      setRemovingMaterialUrl(null)
    }
  }

  async function handleCompleteLesson() {
    if (!lessonId || completing) return

    setCompleting(true)
    setCompleteError("")

    try {
      await completeLesson(studentId, lessonId, { attendance, homeworkDone, rating })

      const topicIds = topicSelections.filter(Boolean)
      const prototypeIds = prototypeSelections.filter(Boolean)
      if (topicIds.length > 0 || prototypeIds.length > 0) {
        await markTopicsCovered(studentId, lessonId, { topicIds, prototypeIds, rating })
      }

      handleDialogOpenChange(false)
    } catch (error) {
      console.error("Failed to complete lesson:", error)
      setCompleteError(error?.message || "Не удалось сохранить итоги урока")
      setCompleting(false)
    }
  }

  const submissionFiles = lesson?.homework.submission.files ?? []
  const isEditableAssignment = mode === "upcoming" && !isCompleted

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-lg flex-col overflow-hidden p-0 sm:max-h-[85vh]">
        <div className="shrink-0 p-6 pb-0 sm:p-8 sm:pb-0">
          <DialogTitle>{studentName}</DialogTitle>
          <DialogDescription>
            {lesson?.date ? formatLessonDateTime(lesson.rescheduledDate ?? lesson.date) : "Следующий урок"}
          </DialogDescription>
        </div>

        {preparing ? (
          <div className="p-6 pt-6 sm:p-8 sm:pt-6">
            <Spinner label="Готовим урок..." />
          </div>
        ) : prepareError ? (
          <div className="p-6 pt-6 sm:p-8 sm:pt-6">
            <div className="flex items-center gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
              <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
              <span>{prepareError}</span>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6 pt-6 sm:p-8 sm:pt-6">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-foreground">Тема урока</span>

              {isEditableAssignment ? (
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  disabled={saving}
                  placeholder="Present Simple"
                  className="h-11 rounded-xl border-2 border-border bg-secondary/40 px-3.5 text-base font-medium text-foreground outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary focus:bg-card focus:ring-4 focus:ring-primary/15 disabled:opacity-50"
                />
              ) : (
                <p className="rounded-xl bg-muted px-3.5 py-2.5 text-sm text-foreground">
                  {topic || "Тема не указана"}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-foreground">Задание</span>

              {isEditableAssignment ? (
                <textarea
                  value={assignmentText}
                  onChange={(e) => setAssignmentText(e.target.value)}
                  disabled={saving}
                  placeholder="Напишите задание..."
                  rows={4}
                  className="rounded-xl border-2 border-border bg-secondary/40 px-3.5 py-2.5 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary focus:bg-card focus:ring-4 focus:ring-primary/15 disabled:opacity-50"
                />
              ) : assignmentText ? (
                <p className="rounded-xl bg-muted px-3.5 py-2.5 text-sm text-foreground">
                  {assignmentText}
                </p>
              ) : (
                <p className="rounded-xl bg-muted px-3.5 py-2.5 text-sm text-muted-foreground">
                  Задание не добавлено
                </p>
              )}

              {isEditableAssignment ? (
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileChange}
                  disabled={saving || uploading}
                  className="text-sm text-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-semibold file:text-secondary-foreground file:transition-colors hover:file:bg-secondary/80 disabled:opacity-50"
                />
              ) : null}

              {uploading ? (
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Загрузка файла...
                </span>
              ) : null}

              {uploadError ? (
                <span className="text-sm font-semibold text-destructive">{uploadError}</span>
              ) : null}

              {assignmentFiles.length > 0 ? (
                <ul className="flex flex-col gap-1.5">
                  {assignmentFiles.map((file, index) => (
                    <li
                      key={`${file.url}-${index}`}
                      className="flex items-center gap-2 rounded-xl border border-border bg-muted px-3 py-2 text-sm"
                    >
                      <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-foreground">{file.title}</span>
                      {isEditableAssignment ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveFile(index)}
                          disabled={saving}
                          className="shrink-0 text-xs font-semibold text-destructive hover:underline disabled:opacity-50"
                        >
                          Удалить
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}

              {saveError ? (
                <span className="text-sm font-semibold text-destructive">{saveError}</span>
              ) : null}

              {isEditableAssignment ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSaveAssignment}
                  disabled={saving || uploading}
                  className="mt-1"
                >
                  {saving ? (
                    <>
                      <Loader2 className="animate-spin" aria-hidden="true" />
                      Сохраняем...
                    </>
                  ) : (
                    "Сохранить"
                  )}
                </Button>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-foreground">Ответ ученика</span>

              {submissionFiles.length === 0 ? (
                <p className="rounded-xl bg-muted px-3.5 py-2.5 text-sm text-muted-foreground">
                  Ученик ещё не прислал домашнее задание
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {submissionFiles.map((file, index) => (
                    <li
                      key={`${file.url}-${index}`}
                      className="flex items-center gap-2 rounded-xl border border-border bg-muted px-3 py-2 text-sm"
                    >
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        {file.submittedAt
                          ? formatLessonDateTime(file.submittedAt)
                          : "Дата отправки неизвестна"}
                      </span>
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex shrink-0 items-center gap-1 text-xs font-semibold text-primary hover:underline"
                      >
                        Открыть
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {isCompleted ? (
              <div className="flex flex-col gap-2 rounded-2xl border border-border bg-muted/40 p-4">
                <span className="text-sm font-bold text-foreground">Итоги урока</span>
                <p className="text-sm text-foreground">
                  Посещение: {optionLabel(ATTENDANCE_OPTIONS, lesson.attendance)}
                </p>
                <p className="text-sm text-foreground">
                  Домашка: {lesson.homeworkDone ? "Сделана" : "Не сделана"}
                </p>
                <p className="text-sm text-foreground">
                  Оценка: {optionLabel(RATING_OPTIONS, lesson.rating)}
                </p>
                {lesson.coveredTopics.length > 0 ? (
                  <p className="text-sm text-foreground">
                    Пройдено (темы): {lesson.coveredTopics.map((topic) => topic.title).join(", ")}
                  </p>
                ) : null}
                {lesson.coveredPrototypes.length > 0 ? (
                  <p className="text-sm text-foreground">
                    Пройдено (прототипы): {lesson.coveredPrototypes.map((p) => p.title).join(", ")}
                  </p>
                ) : null}
              </div>
            ) : mode === "upcoming" ? null : (
              <div className="flex flex-col gap-5 rounded-2xl border border-border bg-muted/40 p-4">
                <span className="text-sm font-bold text-foreground">Итоги урока</span>

                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-semibold text-foreground">Посещение</span>
                  <ToggleGroup
                    options={ATTENDANCE_OPTIONS}
                    value={attendance}
                    onChange={setAttendance}
                    disabled={completing}
                  />
                </div>

                <label className="flex items-center gap-2.5 text-sm font-semibold text-foreground">
                  <input
                    type="checkbox"
                    checked={homeworkDone}
                    onChange={(e) => setHomeworkDone(e.target.checked)}
                    disabled={completing}
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
                    disabled={completing}
                  />
                </div>

                {curriculumProgress ? (
                  <div className="flex flex-col gap-4">
                    <span className="text-sm font-bold text-foreground">Пройденный материал</span>
                    <CoveredMaterialPicker
                      label="Темы"
                      items={curriculumProgress.topics}
                      selections={topicSelections}
                      onChange={setTopicSelections}
                      addLabel="Добавить ещё"
                      allCoveredLabel="Все темы программы пройдены"
                    />
                    <CoveredMaterialPicker
                      label="Прототипы"
                      items={curriculumProgress.prototypes}
                      selections={prototypeSelections}
                      onChange={setPrototypeSelections}
                      addLabel="Добавить ещё"
                      allCoveredLabel="Все прототипы программы пройдены"
                    />
                  </div>
                ) : null}
              </div>
            )}

            {mode === "completing" || isCompleted ? (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-foreground">Дополнительные материалы</span>

                <input
                  ref={extraFileInputRef}
                  type="file"
                  onChange={handleAddExtraMaterial}
                  disabled={uploadingExtra}
                  className="text-sm text-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-semibold file:text-secondary-foreground file:transition-colors hover:file:bg-secondary/80 disabled:opacity-50"
                />

                {uploadingExtra ? (
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    Загрузка файла...
                  </span>
                ) : null}

                {extraUploadError ? (
                  <span className="text-sm font-semibold text-destructive">{extraUploadError}</span>
                ) : null}

                {lesson?.materials?.length > 0 ? (
                  <ul className="flex flex-col gap-1.5">
                    {lesson.materials.map((material, index) => (
                      <li
                        key={`${material.url}-${index}`}
                        className="flex items-center gap-2 rounded-xl border border-border bg-muted px-3 py-2 text-sm"
                      >
                        <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate text-foreground">{material.title}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatLessonDateTime(lesson.rescheduledDate ?? lesson.date)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveExtraMaterial(material)}
                          disabled={removingMaterialUrl !== null}
                          aria-label={`Удалить ${material.title}`}
                          className="shrink-0 text-destructive transition-colors hover:text-destructive/80 disabled:opacity-50"
                        >
                          {removingMaterialUrl === material.url ? (
                            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <Trash2 className="size-4" aria-hidden="true" />
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Материалов пока нет</p>
                )}
              </div>
            ) : null}
          </div>
        )}

        {!preparing && !prepareError && !isCompleted ? (
          <div className="sticky bottom-0 shrink-0 border-t border-border bg-card p-4 sm:px-8">
            {mode === "completing" && completeError ? (
              <p className="mb-2 text-sm font-semibold text-destructive">{completeError}</p>
            ) : null}
            <Button
              type="button"
              className="w-full"
              onClick={mode === "upcoming" ? () => setMode("completing") : handleCompleteLesson}
              disabled={mode === "completing" && completing}
            >
              {mode === "completing" ? (
                completing ? (
                  <>
                    <Loader2 className="animate-spin" aria-hidden="true" />
                    Сохраняем...
                  </>
                ) : (
                  "Сохранить и завершить урок"
                )
              ) : (
                "Урок прошёл"
              )}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
