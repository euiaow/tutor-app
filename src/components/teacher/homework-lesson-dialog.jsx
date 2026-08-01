import { useEffect, useRef, useState } from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import {
  AlertCircle,
  BookOpen,
  Check,
  ExternalLink,
  FileText,
  ListChecks,
  Loader2,
  Paperclip,
  Trash2,
  X,
} from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { GhostBtn, SolidBtn, TeacherDialog, teacherInputCls, teacherTextareaCls } from "@/components/teacher/theme-ui"
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

// Same visual family as the mockup's LessonModal glass-tile sections, but
// selectable (the mockup never draws this — it has no attendance/rating/
// homework form at all) so it reuses the pill-toggle pattern from
// StudentEditModal's subject picker instead of inventing a new one.
function ToggleGroup({ options, value, onChange, disabled }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={
              "flex-1 rounded-full px-3.5 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 " +
              (selected ? "text-primary-foreground" : "glass-tile text-foreground/80 hover:text-rose-deep")
            }
            style={selected ? { background: "var(--gradient-orb)", boxShadow: "var(--shadow-soft)" } : undefined}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

// A checklist of not-yet-covered items — check any number to mark them
// covered:true (via markTopicsCovered) together with completeLesson. Only
// uncovered items are ever listed here; already-covered ones live in the
// interactive tiles on the expanded student row instead.
function CoveredMaterialChecklist({ label, items, selections, onChange, allCoveredLabel }) {
  const available = items.filter((item) => !item.covered)

  if (available.length === 0) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-ink">{label}</span>
        <p className="text-sm text-muted-foreground">{allCoveredLabel}</p>
      </div>
    )
  }

  function toggle(itemId) {
    onChange(selections.includes(itemId) ? selections.filter((id) => id !== itemId) : [...selections, itemId])
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-ink">{label}</span>

      <div className="flex flex-col gap-1.5">
        {available.map((item) => (
          <label
            key={item.id}
            className="glass-tile flex items-center gap-2.5 rounded-[1rem] px-3 py-2 text-sm text-ink transition hover:bg-glass-strong/50"
          >
            <input
              type="checkbox"
              checked={selections.includes(item.id)}
              onChange={() => toggle(item.id)}
              className="size-4 shrink-0 rounded-md border-2 border-glass-border accent-primary"
            />
            {item.title}
          </label>
        ))}
      </div>
    </div>
  )
}

function Section({ icon: Icon, label, children }) {
  return (
    <div className="glass-tile rounded-[1.25rem] p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Icon className="size-4 text-rose-deep" aria-hidden="true" />
        {label}
      </p>
      <div className="mt-2">{children}</div>
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
  const popupRef = useRef(null)
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
    <TeacherDialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="teacher-theme fixed inset-0 z-[100] bg-ink/25 backdrop-blur-sm transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <DialogPrimitive.Popup
          ref={popupRef}
          initialFocus={popupRef}
          className="teacher-theme glass-panel fixed top-1/2 left-1/2 z-[101] flex max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[2rem] p-0 outline-none transition-all data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 sm:max-h-[85vh]"
        >
          <div className="shrink-0 p-6 pb-0 sm:p-7 sm:pb-0">
            <DialogPrimitive.Title className="pr-8 font-display text-xl tracking-tight text-ink">
              {studentName}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-1 text-xs text-muted-foreground">
              {lesson?.date ? formatLessonDateTime(lesson.rescheduledDate ?? lesson.date) : "Следующий урок"}
            </DialogPrimitive.Description>
          </div>

          <DialogPrimitive.Close
            className="absolute right-5 top-5 text-muted-foreground transition hover:text-rose-deep"
            aria-label="Закрыть"
          >
            <X className="size-4" aria-hidden="true" />
          </DialogPrimitive.Close>

          {preparing ? (
            <div className="p-6 pt-6 sm:p-7 sm:pt-6">
              <Spinner label="Готовим урок..." />
            </div>
          ) : prepareError ? (
            <div className="p-6 pt-6 sm:p-7 sm:pt-6">
              <div className="flex items-center gap-2 rounded-[1rem] bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
                <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
                <span>{prepareError}</span>
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto scrollbar-hidden p-6 pt-5 sm:p-7 sm:pt-5">
              <Section icon={BookOpen} label="Тема урока">
                {isEditableAssignment ? (
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    disabled={saving}
                    placeholder="Present Simple"
                    className={teacherInputCls}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">{topic || "Тема не указана"}</p>
                )}
              </Section>

              <Section icon={ListChecks} label="Задание">
                <div className="flex flex-col gap-2">
                  {isEditableAssignment ? (
                    <textarea
                      value={assignmentText}
                      onChange={(e) => setAssignmentText(e.target.value)}
                      disabled={saving}
                      placeholder="Напишите задание..."
                      rows={4}
                      className={teacherTextareaCls}
                    />
                  ) : assignmentText ? (
                    <p className="text-sm text-muted-foreground">{assignmentText}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Задание не добавлено</p>
                  )}

                  {isEditableAssignment ? (
                    <input
                      ref={fileInputRef}
                      type="file"
                      onChange={handleFileChange}
                      disabled={saving || uploading}
                      className="text-sm text-foreground file:mr-3 file:rounded-full file:border-0 file:bg-glass-strong file:px-3 file:py-2 file:text-sm file:font-semibold file:text-foreground/80 file:transition hover:file:text-rose-deep disabled:opacity-50"
                    />
                  ) : null}

                  {uploading ? (
                    <span className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      Загрузка файла...
                    </span>
                  ) : null}

                  {uploadError ? <span className="text-sm font-semibold text-destructive">{uploadError}</span> : null}

                  {assignmentFiles.length > 0 ? (
                    <ul className="flex flex-col gap-1.5">
                      {assignmentFiles.map((file, index) => (
                        <li
                          key={`${file.url}-${index}`}
                          className="glass-tile flex items-center gap-2 rounded-[1rem] px-3 py-2 text-sm"
                        >
                          <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate text-ink">{file.title}</span>
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

                  {saveError ? <span className="text-sm font-semibold text-destructive">{saveError}</span> : null}

                  {isEditableAssignment ? (
                    <GhostBtn onClick={handleSaveAssignment} disabled={saving || uploading} className="mt-1 self-start px-4 py-2">
                      {saving ? (
                        <>
                          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                          Сохраняем...
                        </>
                      ) : (
                        "Сохранить"
                      )}
                    </GhostBtn>
                  ) : null}
                </div>
              </Section>

              <Section icon={FileText} label="Ответ ученика">
                {submissionFiles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ученик ещё не прислал домашнее задание</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {submissionFiles.map((file, index) => (
                      <li
                        key={`${file.url}-${index}`}
                        className="glass-tile flex items-center gap-2 rounded-[1rem] px-3 py-2 text-sm"
                      >
                        <span className="min-w-0 flex-1 truncate text-muted-foreground">
                          {file.submittedAt ? formatLessonDateTime(file.submittedAt) : "Дата отправки неизвестна"}
                        </span>
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex shrink-0 items-center gap-1 text-xs font-semibold text-rose-deep hover:underline"
                        >
                          Открыть
                          <ExternalLink className="size-3.5" aria-hidden="true" />
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              {isCompleted ? (
                <div className="glass-tile flex flex-col gap-2 rounded-[1.25rem] p-4">
                  <span className="text-sm font-bold text-ink">Итоги урока</span>
                  <p className="text-sm text-ink">Посещение: {optionLabel(ATTENDANCE_OPTIONS, lesson.attendance)}</p>
                  <p className="text-sm text-ink">Домашка: {lesson.homeworkDone ? "Сделана" : "Не сделана"}</p>
                  <p className="text-sm text-ink">Оценка: {optionLabel(RATING_OPTIONS, lesson.rating)}</p>
                  {lesson.coveredTopics.length > 0 ? (
                    <p className="text-sm text-ink">
                      Пройдено (темы): {lesson.coveredTopics.map((topic) => topic.title).join(", ")}
                    </p>
                  ) : null}
                  {lesson.coveredPrototypes.length > 0 ? (
                    <p className="text-sm text-ink">
                      Пройдено (прототипы): {lesson.coveredPrototypes.map((p) => p.title).join(", ")}
                    </p>
                  ) : null}
                </div>
              ) : mode === "upcoming" ? null : (
                <div className="glass-tile flex flex-col gap-5 rounded-[1.25rem] p-4">
                  <span className="text-sm font-bold text-ink">Итоги урока</span>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-semibold text-ink">Посещение</span>
                    <ToggleGroup options={ATTENDANCE_OPTIONS} value={attendance} onChange={setAttendance} disabled={completing} />
                  </div>

                  <label className="flex items-center gap-2.5 text-sm font-semibold text-ink">
                    <input
                      type="checkbox"
                      checked={homeworkDone}
                      onChange={(e) => setHomeworkDone(e.target.checked)}
                      disabled={completing}
                      className="size-5 rounded-md border-2 border-glass-border accent-primary disabled:opacity-50"
                    />
                    Домашка сделана
                  </label>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-semibold text-ink">Оценка</span>
                    <ToggleGroup options={RATING_OPTIONS} value={rating} onChange={setRating} disabled={completing} />
                  </div>

                  {curriculumProgress ? (
                    <div className="flex flex-col gap-4">
                      <span className="text-sm font-bold text-ink">Пройденный материал</span>
                      <CoveredMaterialChecklist
                        label="Темы"
                        items={curriculumProgress.topics}
                        selections={topicSelections}
                        onChange={setTopicSelections}
                        allCoveredLabel="Все темы пройдены ✓"
                      />
                      {curriculumProgress.prototypes.length > 0 ? (
                        <CoveredMaterialChecklist
                          label="Прототипы"
                          items={curriculumProgress.prototypes}
                          selections={prototypeSelections}
                          onChange={setPrototypeSelections}
                          allCoveredLabel="Все прототипы пройдены ✓"
                        />
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )}

              {mode === "completing" || isCompleted ? (
                <Section icon={Paperclip} label="Дополнительные материалы">
                  <div className="flex flex-col gap-2">
                    <input
                      ref={extraFileInputRef}
                      type="file"
                      onChange={handleAddExtraMaterial}
                      disabled={uploadingExtra}
                      className="text-sm text-foreground file:mr-3 file:rounded-full file:border-0 file:bg-glass-strong file:px-3 file:py-2 file:text-sm file:font-semibold file:text-foreground/80 file:transition hover:file:text-rose-deep disabled:opacity-50"
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
                            className="glass-tile flex items-center gap-2 rounded-[1rem] px-3 py-2 text-sm"
                          >
                            <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                            <span className="min-w-0 flex-1 truncate text-ink">{material.title}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {formatLessonDateTime(lesson.rescheduledDate ?? lesson.date)}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveExtraMaterial(material)}
                              disabled={removingMaterialUrl !== null}
                              aria-label={`Удалить ${material.title}`}
                              className="shrink-0 text-destructive transition hover:text-destructive/80 disabled:opacity-50"
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
                </Section>
              ) : null}
            </div>
          )}

          {!preparing && !prepareError && !isCompleted ? (
            <div className="shrink-0 border-t border-glass-border p-4 sm:px-7">
              {mode === "completing" && completeError ? (
                <p className="mb-2 text-sm font-semibold text-destructive">{completeError}</p>
              ) : null}
              <SolidBtn
                className="w-full justify-center py-3 text-sm"
                onClick={mode === "upcoming" ? () => setMode("completing") : handleCompleteLesson}
                disabled={mode === "completing" && completing}
              >
                {mode === "completing" ? (
                  completing ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      Сохраняем...
                    </>
                  ) : (
                    <>
                      <Check className="size-4" aria-hidden="true" />
                      Сохранить и завершить урок
                    </>
                  )
                ) : (
                  "Урок прошёл"
                )}
              </SolidBtn>
            </div>
          ) : null}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </TeacherDialog>
  )
}
