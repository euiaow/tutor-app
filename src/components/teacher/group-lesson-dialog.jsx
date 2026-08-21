import { useEffect, useRef, useState } from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { BookOpen, ExternalLink, FileText, Loader2, Paperclip, Trash2, Users, X } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { GhostBtn, SolidBtn, TeacherDialog, teacherInputCls, teacherTextareaCls } from "@/components/teacher/theme-ui"
import { ATTENDANCE_OPTIONS, RATING_OPTIONS, ToggleGroup, optionLabel } from "@/components/teacher/homework-lesson-dialog"
import {
  subscribeToGroupLesson,
  updateGroupLessonTopic,
  updateGroupLessonAssignment,
  addGroupLessonMaterial,
  removeGroupLessonMaterial,
  completeGroupLesson,
} from "@/firebase/groups"
import { uploadGroupMaterial } from "@/firebase/materials"
import { formatLessonDateTime } from "@/lib/schedule"
import { SubjectTag } from "@/components/student-tags"
import { useTimeZone } from "@/lib/user-prefs-context"

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

// Phase 3 of group lessons — same fixed-header/scroll-middle/sticky-footer
// dialog shape as HomeworkLessonDialog (see systemPatterns.md's own note on
// this pattern), adapted for several attendees instead of one student: the
// "upcoming" mode's attendee list is just names, and only "completing" mode
// grows a full per-attendee roster (attendance/homework/rating), matching
// this feature's own spec — the roster is deliberately absent until the
// teacher clicks "Занятие прошло", so a still-scheduled group lesson never
// looks taller than an individual one.
export function GroupLessonDialog({ teacherId, group, students, lessonId, open, onOpenChange }) {
  const timeZone = useTimeZone()
  const popupRef = useRef(null)
  const [lesson, setLesson] = useState(null)
  const [mode, setMode] = useState("upcoming")

  const [topic, setTopic] = useState("")
  const [assignmentText, setAssignmentText] = useState("")
  const [assignmentFiles, setAssignmentFiles] = useState([])
  const initializedRef = useRef(false)

  const [attendeeState, setAttendeeState] = useState({})

  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [uploadingMaterial, setUploadingMaterial] = useState(false)
  const [materialError, setMaterialError] = useState("")
  const [completing, setCompleting] = useState(false)
  const [completeError, setCompleteError] = useState("")

  const fileInputRef = useRef(null)
  const materialInputRef = useRef(null)

  useEffect(() => {
    if (!open || !lessonId) {
      setLesson(null)
      initializedRef.current = false
      setMode("upcoming")
      return
    }
    const unsubscribe = subscribeToGroupLesson(teacherId, group.id, lessonId, setLesson, (error) =>
      console.error("Failed to load group lesson:", error),
    )
    return unsubscribe
  }, [open, teacherId, group.id, lessonId])

  useEffect(() => {
    if (!lesson || initializedRef.current) return
    initializedRef.current = true
    setTopic(lesson.topic)
    setAssignmentText(lesson.homework.assignment.text)
    setAssignmentFiles(lesson.homework.assignment.files)
    const initialAttendees = {}
    for (const studentId of lesson.memberIds) {
      const existing = lesson.attendees[studentId]
      initialAttendees[studentId] = {
        attendance: existing?.attendance ?? "on_time",
        homeworkDone: Boolean(existing?.homeworkDone),
        rating: existing?.rating ?? null,
      }
    }
    setAttendeeState(initialAttendees)
    if (lesson.status === "upcoming") setMode("upcoming")
  }, [lesson])

  function studentName(studentId) {
    return students.find((s) => s.id === studentId)?.name ?? "Ученик"
  }

  async function handleSaveTopic() {
    if (saving) return
    setSaving(true)
    setSaveError("")
    try {
      await updateGroupLessonTopic(teacherId, group.id, lessonId, topic)
    } catch (err) {
      console.error("Failed to save topic:", err)
      setSaveError(err?.message || "Не удалось сохранить тему")
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveAssignment() {
    if (saving) return
    setSaving(true)
    setSaveError("")
    try {
      await updateGroupLessonAssignment(teacherId, group.id, lessonId, { text: assignmentText, files: assignmentFiles })
    } catch (err) {
      console.error("Failed to save assignment:", err)
      setSaveError(err?.message || "Не удалось сохранить задание")
    } finally {
      setSaving(false)
    }
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError("")
    try {
      const material = await uploadGroupMaterial(file, group.id)
      setAssignmentFiles((prev) => [...prev, material])
    } catch (err) {
      console.error("Failed to upload file:", err)
      setUploadError(err?.message || "Не удалось загрузить файл")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  function handleRemoveAssignmentFile(index) {
    setAssignmentFiles((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleMaterialUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingMaterial(true)
    setMaterialError("")
    try {
      const material = await uploadGroupMaterial(file, group.id)
      await addGroupLessonMaterial(teacherId, group.id, lessonId, material)
    } catch (err) {
      console.error("Failed to upload material:", err)
      setMaterialError(err?.message || "Не удалось загрузить материал")
    } finally {
      setUploadingMaterial(false)
      if (materialInputRef.current) materialInputRef.current.value = ""
    }
  }

  async function handleRemoveMaterial(material) {
    try {
      await removeGroupLessonMaterial(teacherId, group.id, lessonId, material)
    } catch (err) {
      console.error("Failed to remove material:", err)
    }
  }

  function updateAttendee(studentId, field, value) {
    setAttendeeState((prev) => ({ ...prev, [studentId]: { ...prev[studentId], [field]: value } }))
  }

  async function handleComplete() {
    if (completing) return
    setCompleting(true)
    setCompleteError("")
    try {
      await completeGroupLesson(group.id, lessonId, attendeeState)
      onOpenChange(false)
    } catch (err) {
      console.error("Failed to complete group lesson:", err)
      setCompleteError(err?.message || "Не удалось завершить занятие")
    } finally {
      setCompleting(false)
    }
  }

  function handleDialogOpenChange(nextOpen) {
    if (saving || completing) return
    onOpenChange(nextOpen)
  }

  if (!open) return null

  const isCompleted = lesson?.status === "completed"
  const isCancelled = lesson?.status === "cancelled"
  const isEditable = lesson?.status === "upcoming" && mode === "upcoming"
  const effectiveDate = lesson?.rescheduledDate ?? lesson?.date ?? null

  return (
    <TeacherDialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          forceRender
          className="teacher-theme fixed inset-0 z-[110] bg-ink/25 backdrop-blur-sm transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0"
        />
        <DialogPrimitive.Popup
          ref={popupRef}
          initialFocus={popupRef}
          className="teacher-theme glass-panel fixed top-1/2 left-1/2 z-[111] flex max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[2rem] p-0 outline-none transition-all data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 sm:max-h-[85vh]"
        >
          <div className="shrink-0 p-6 pb-0 sm:p-7 sm:pb-0">
            <DialogPrimitive.Title className="pr-8 font-display text-xl tracking-tight text-ink">
              {group.name}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{effectiveDate ? formatLessonDateTime(effectiveDate, timeZone) : "—"}</span>
              {group.subject ? <SubjectTag name={group.subject} /> : null}
            </DialogPrimitive.Description>
          </div>

          <DialogPrimitive.Close
            className="absolute right-5 top-5 text-muted-foreground transition hover:text-rose-deep"
            aria-label="Закрыть"
          >
            <X className="size-4" aria-hidden="true" />
          </DialogPrimitive.Close>

          {!lesson ? (
            <div className="p-6 pt-6 sm:p-7 sm:pt-6">
              <Spinner label="Загрузка занятия..." />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto scrollbar-hidden p-6 pt-5 sm:p-7 sm:pt-5">
              <Section icon={BookOpen} label="Тема урока">
                {isEditable ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={topic ?? ""}
                      onChange={(e) => setTopic(e.target.value)}
                      disabled={saving}
                      placeholder="Тема занятия"
                      className={teacherInputCls}
                    />
                    <SolidBtn onClick={handleSaveTopic} disabled={saving} className="shrink-0 px-4 py-2.5">
                      {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : "Сохранить"}
                    </SolidBtn>
                  </div>
                ) : (
                  <p className="text-sm text-ink">{lesson.topic || "Тема не указана"}</p>
                )}
              </Section>

              <Section icon={FileText} label="Задание">
                <div className="flex flex-col gap-3">
                  {isEditable ? (
                    <textarea
                      value={assignmentText}
                      onChange={(e) => setAssignmentText(e.target.value)}
                      disabled={saving}
                      rows={3}
                      placeholder="Текст задания..."
                      className={teacherTextareaCls}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">{lesson.homework.assignment.text || "Задание не задано"}</p>
                  )}

                  {isEditable ? (
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

                  {(isEditable ? assignmentFiles : lesson.homework.assignment.files).length > 0 ? (
                    <ul className="flex flex-col gap-1.5">
                      {(isEditable ? assignmentFiles : lesson.homework.assignment.files).map((file, index) => (
                        <li key={`${file.url}-${index}`} className="glass-tile flex items-center gap-2 rounded-[1rem] px-3 py-2 text-sm">
                          <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate text-ink">{file.title}</span>
                          {isEditable ? (
                            <button
                              type="button"
                              onClick={() => handleRemoveAssignmentFile(index)}
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

                  {isEditable ? (
                    <SolidBtn onClick={handleSaveAssignment} disabled={saving || uploading} className="self-start px-4 py-2">
                      {saving ? (
                        <>
                          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                          Сохраняем...
                        </>
                      ) : (
                        "Сохранить задание"
                      )}
                    </SolidBtn>
                  ) : null}
                </div>
              </Section>

              <Section icon={Paperclip} label="Дополнительные материалы">
                <div className="flex flex-col gap-2">
                  {lesson.materials.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Материалов пока нет</p>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {lesson.materials.map((material, index) => (
                        <li key={`${material.url}-${index}`} className="glass-tile flex items-center gap-2 rounded-[1rem] px-3 py-2 text-sm">
                          <a
                            href={material.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-rose-deep hover:underline"
                          >
                            <span className="min-w-0 truncate">{material.title}</span>
                            <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
                          </a>
                          {isEditable ? (
                            <button
                              type="button"
                              onClick={() => handleRemoveMaterial(material)}
                              className="shrink-0 text-destructive transition hover:text-destructive/80"
                              aria-label="Удалить материал"
                            >
                              <Trash2 className="size-3.5" aria-hidden="true" />
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                  {isEditable ? (
                    <>
                      <input
                        ref={materialInputRef}
                        type="file"
                        onChange={handleMaterialUpload}
                        disabled={uploadingMaterial}
                        className="text-sm text-foreground file:mr-3 file:rounded-full file:border-0 file:bg-glass-strong file:px-3 file:py-2 file:text-sm file:font-semibold file:text-foreground/80 file:transition hover:file:text-rose-deep disabled:opacity-50"
                      />
                      {uploadingMaterial ? (
                        <span className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                          Загрузка...
                        </span>
                      ) : null}
                      {materialError ? <span className="text-sm font-semibold text-destructive">{materialError}</span> : null}
                    </>
                  ) : null}
                </div>
              </Section>

              {mode === "completing" && !isCompleted && !isCancelled ? (
                <Section icon={Users} label={`Участники (${lesson.memberIds.length})`}>
                  <div className="flex flex-col gap-3">
                    {lesson.memberIds.map((studentId) => {
                      const state = attendeeState[studentId] ?? { attendance: "on_time", homeworkDone: false, rating: null }
                      const submissionFiles = lesson.attendees[studentId]?.submissionFiles ?? []
                      return (
                        <div key={studentId} className="glass-tile flex flex-col gap-2 rounded-[1rem] p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-ink">{studentName(studentId)}</span>
                            {submissionFiles.length > 0 ? (
                              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-rose-deep">
                                {submissionFiles.length} файл(ов) от ученика
                              </span>
                            ) : null}
                          </div>
                          <ToggleGroup
                            options={ATTENDANCE_OPTIONS}
                            value={state.attendance}
                            onChange={(value) => updateAttendee(studentId, "attendance", value)}
                            disabled={completing}
                          />
                          <label className="flex items-center gap-2 text-sm text-ink">
                            <input
                              type="checkbox"
                              checked={state.homeworkDone}
                              onChange={(e) => updateAttendee(studentId, "homeworkDone", e.target.checked)}
                              disabled={completing}
                              className="size-4 rounded-md border-2 border-glass-border accent-primary"
                            />
                            Домашка сделана
                          </label>
                          <ToggleGroup
                            options={RATING_OPTIONS}
                            value={state.rating}
                            onChange={(value) => updateAttendee(studentId, "rating", value)}
                            disabled={completing}
                          />
                        </div>
                      )
                    })}
                  </div>
                </Section>
              ) : mode === "upcoming" && lesson.status === "upcoming" ? (
                <Section icon={Users} label={`Участники (${lesson.memberIds.length})`}>
                  <div className="flex flex-wrap gap-1.5">
                    {lesson.memberIds.map((studentId) => (
                      <span key={studentId} className="glass-tile rounded-full px-3 py-1 text-sm text-ink">
                        {studentName(studentId)}
                      </span>
                    ))}
                  </div>
                </Section>
              ) : null}

              {isCompleted ? (
                <Section icon={Users} label={`Итоги (${lesson.memberIds.length} участников)`}>
                  <div className="flex flex-col gap-2">
                    {lesson.memberIds.map((studentId) => {
                      const a = lesson.attendees[studentId] ?? {}
                      return (
                        <div key={studentId} className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="min-w-0 flex-1 truncate font-semibold text-ink">{studentName(studentId)}</span>
                          <span className="text-muted-foreground">{optionLabel(ATTENDANCE_OPTIONS, a.attendance)}</span>
                          <span className="text-muted-foreground">{a.homeworkDone ? "ДЗ сделано" : "ДЗ не сделано"}</span>
                          <span className="text-muted-foreground">{optionLabel(RATING_OPTIONS, a.rating)}</span>
                        </div>
                      )
                    })}
                  </div>
                </Section>
              ) : null}

              {isCancelled ? (
                <div className="glass-tile flex items-center gap-2 rounded-[1.25rem] p-4">
                  <span className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-[11px] font-semibold text-destructive">Отменено</span>
                  <span className="text-sm text-muted-foreground">Занятие не состоялось</span>
                </div>
              ) : null}
            </div>
          )}

          {lesson && lesson.status === "upcoming" ? (
            <div className="shrink-0 border-t border-glass-border p-4 sm:px-7">
              {completeError ? <p className="mb-2 text-sm font-semibold text-destructive">{completeError}</p> : null}
              {mode === "completing" ? (
                <SolidBtn onClick={handleComplete} disabled={completing} className="w-full justify-center py-3 text-sm">
                  {completing ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      Сохраняем...
                    </span>
                  ) : (
                    "Сохранить и завершить занятие"
                  )}
                </SolidBtn>
              ) : (
                <GhostBtn className="w-full justify-center py-3 text-sm" onClick={() => setMode("completing")}>
                  Занятие прошло
                </GhostBtn>
              )}
            </div>
          ) : null}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </TeacherDialog>
  )
}
