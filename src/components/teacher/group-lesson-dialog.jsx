import { useEffect, useRef, useState } from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { ExternalLink, ListChecks, Loader2, Paperclip, Trash2, Users, X } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import {
  GhostBtn,
  ProgressBar,
  SolidBtn,
  TeacherCancelBtn,
  TeacherDialog,
  TeacherDialogContent,
  TeacherDialogDescription,
  TeacherDialogTitle,
  TeacherModalFooter,
  teacherInputCls,
  teacherTextareaCls,
} from "@/components/teacher/theme-ui"
import {
  ATTENDANCE_OPTIONS,
  RATING_OPTIONS,
  ToggleGroup,
  optionLabel,
  ProgramTopicPicker,
  CoveredMaterialChecklist,
} from "@/components/teacher/homework-lesson-dialog"
import {
  getGroupLessonMirrors,
  completeGroupLesson,
  getGroupProgramView,
  setGroupCurriculumItemCovered,
  rescheduleGroupLesson,
  cancelGroupLesson,
} from "@/firebase/groups"
import { updateLessonTopic, updateHomeworkAssignment, addLessonMaterial, removeLessonMaterial } from "@/firebase/lessons"
import { uploadGroupMaterial } from "@/firebase/materials"
import { formatLessonDateTime } from "@/lib/schedule"
import { localInputsToUtcDate, utcDateToLocalInput } from "@/lib/timezone"
import { SubjectTag } from "@/components/student-tags"
import { useTimeZone, useThemeClass } from "@/lib/user-prefs-context"

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

function groupProgramPercent(program) {
  const total = program.topics.length + program.prototypes.length
  if (total === 0) return null
  const covered = program.topics.filter((t) => t.covered).length + program.prototypes.filter((p) => p.covered).length
  return Math.round((covered / total) * 100)
}

// A group lesson is now literally N normal lesson docs — one real
// students/{id}/lessons mirror per member (see core/groups.js), all
// sharing one groupLessonKey. Topic/assignment/materials are edited here
// once and fanned out to every mirror via the exact same
// updateLessonTopic/updateHomeworkAssignment/addLessonMaterial/
// removeLessonMaterial (firebase/lessons.js) an individual lesson already
// uses — not a parallel group-specific write path. Loaded once per open
// (not a live subscription — only the teacher ever edits this dialog) and
// reloaded after any mutation that isn't already reflected in local state.
export function GroupLessonDialog({ teacherId, group, students, groupLessonKey, open, onOpenChange }) {
  const timeZone = useTimeZone()
  // Whichever theme (src/lib/themes.js) the teacher picked — this dialog is
  // portaled straight to document.body (see DialogPrimitive.Portal below),
  // so it needs the class applied directly to itself rather than inherited
  // from TeacherDashboard's root, same reasoning as TeacherDialogContent
  // (theme-ui.jsx). Was hardcoded to "teacher-theme themed" (always pink)
  // regardless of the teacher's actual chosen theme — real bug, fixed here.
  const themeClass = useThemeClass() || "teacher-theme themed"
  const popupRef = useRef(null)
  const [mirrors, setMirrors] = useState([])
  const [loading, setLoading] = useState(true)
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

  // The group's aggregated program view — computed from each attendee's own
  // program (see firebase/groups.js's getGroupProgramView), loaded once
  // mirrors are in hand (it needs their studentIds), same "cheap one-time
  // read, only actually rendered once completing mode is entered" shape
  // HomeworkLessonDialog already uses for a student's programs.
  const [groupProgram, setGroupProgram] = useState(null)
  const [topicSelections, setTopicSelections] = useState([])
  const [prototypeSelections, setPrototypeSelections] = useState([])

  async function loadMirrors() {
    const data = await getGroupLessonMirrors(teacherId, groupLessonKey)
    setMirrors(data)
    return data
  }

  useEffect(() => {
    if (!open || !groupLessonKey) {
      setMirrors([])
      setGroupProgram(null)
      setLoading(true)
      initializedRef.current = false
      setMode("upcoming")
      return
    }
    setLoading(true)
    loadMirrors()
      .then((data) => getGroupProgramView(group.subject, data.map((mirror) => mirror.studentId)))
      .then(setGroupProgram)
      .catch((error) => console.error("Failed to load group lesson:", error))
      .finally(() => setLoading(false))
  }, [open, teacherId, groupLessonKey, group.subject])

  const primary = mirrors[0] ?? null

  useEffect(() => {
    if (!primary || initializedRef.current) return
    initializedRef.current = true
    setTopic(primary.topic)
    setAssignmentText(primary.homework.assignment.text)
    setAssignmentFiles(primary.homework.assignment.files)
    const initialAttendees = {}
    for (const mirror of mirrors) {
      initialAttendees[mirror.studentId] = {
        attendance: mirror.attendance ?? "on_time",
        homeworkDone: Boolean(mirror.homeworkDone),
        rating: mirror.rating ?? null,
      }
    }
    setAttendeeState(initialAttendees)
    if (primary.status === "upcoming") setMode("upcoming")
  }, [primary, mirrors])

  function studentName(studentId) {
    return students.find((s) => s.id === studentId)?.name ?? "Ученик"
  }

  async function handleSaveTopicAndAssignment() {
    if (saving) return
    setSaving(true)
    setSaveError("")
    try {
      await Promise.all(
        mirrors.flatMap((mirror) => [
          updateLessonTopic(mirror.studentId, mirror.id, topic),
          updateHomeworkAssignment(mirror.studentId, mirror.id, { text: assignmentText, files: assignmentFiles }),
        ]),
      )
    } catch (err) {
      console.error("Failed to save topic/assignment:", err)
      setSaveError(err?.message || "Не удалось сохранить")
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
      await Promise.all(mirrors.map((mirror) => addLessonMaterial(mirror.studentId, mirror.id, material)))
      await loadMirrors()
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
      await Promise.all(mirrors.map((mirror) => removeLessonMaterial(mirror.studentId, mirror.id, material)))
      await loadMirrors()
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
      await completeGroupLesson(group.id, groupLessonKey, attendeeState)

      // Marks covered directly on every attendee's OWN program — not a
      // group-shared copy any more (there isn't one). setGroupCurriculumItemCovered
      // is a plain client toggle, not part of completeGroupLesson itself,
      // same "select what was covered, apply on complete" shape
      // HomeworkLessonDialog uses for a student's own program via
      // markTopicsCovered.
      if (groupProgram) {
        await Promise.all([
          ...topicSelections.map((itemId) =>
            setGroupCurriculumItemCovered(groupProgram.memberPrograms, "topics", itemId, true),
          ),
          ...prototypeSelections.map((itemId) =>
            setGroupCurriculumItemCovered(groupProgram.memberPrograms, "prototypes", itemId, true),
          ),
        ])
      }

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

  const isCompleted = primary?.status === "completed"
  const isCancelled = primary?.status === "cancelled"
  const isEditable = primary?.status === "upcoming" && mode === "upcoming"
  const effectiveDate = primary?.rescheduledDate ?? primary?.date ?? null
  const groupProgramPercentValue = groupProgram ? groupProgramPercent(groupProgram) : null
  const memberIds = mirrors.map((mirror) => mirror.studentId)
  const materials = primary?.materials ?? []

  return (
    <TeacherDialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          forceRender
          className={`${themeClass} fixed inset-0 z-[110] bg-ink/25 backdrop-blur-sm transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0`}
        />
        <DialogPrimitive.Popup
          ref={popupRef}
          initialFocus={popupRef}
          className={`${themeClass} glass-panel fixed top-1/2 left-1/2 z-[111] flex max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[2rem] p-0 outline-none transition-all data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 sm:max-h-[85vh]`}
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

          {loading || !primary ? (
            <div className="p-6 pt-6 sm:p-7 sm:pt-6">
              <Spinner label="Загрузка занятия..." />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto scrollbar-hidden p-6 pt-5 sm:p-7 sm:pt-5">
              {/* Merged topic+assignment, one save button — same shape as
                  HomeworkLessonDialog's own merge. */}
              <Section icon={ListChecks} label="Тема урока и задание">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-muted-foreground">Тема урока</span>
                    {isEditable ? (
                      <div className="flex flex-col gap-2">
                        <ProgramTopicPicker
                          program={groupProgram}
                          programLabel={groupProgram?.subject || ""}
                          onSelect={setTopic}
                          disabled={saving}
                        />
                        <input
                          type="text"
                          value={topic ?? ""}
                          onChange={(e) => setTopic(e.target.value)}
                          disabled={saving}
                          placeholder="Тема занятия"
                          className={teacherInputCls}
                        />
                      </div>
                    ) : (
                      <p className="text-sm text-ink">{primary.topic || "Тема не указана"}</p>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 border-t border-glass-border pt-4">
                    <span className="text-xs font-semibold text-muted-foreground">Задание</span>
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
                      <p className="text-sm text-muted-foreground">{primary.homework.assignment.text || "Задание не задано"}</p>
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

                    {(isEditable ? assignmentFiles : primary.homework.assignment.files).length > 0 ? (
                      <ul className="flex flex-col gap-1.5">
                        {(isEditable ? assignmentFiles : primary.homework.assignment.files).map((file, index) => (
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
                      <SolidBtn onClick={handleSaveTopicAndAssignment} disabled={saving || uploading} className="self-start px-4 py-2">
                        {saving ? (
                          <>
                            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                            Сохраняем...
                          </>
                        ) : (
                          "Сохранить"
                        )}
                      </SolidBtn>
                    ) : null}
                  </div>
                </div>
              </Section>

              <Section icon={Paperclip} label="Дополнительные материалы">
                <div className="flex flex-col gap-2">
                  {materials.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Материалов пока нет</p>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {materials.map((material, index) => (
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
                <>
                  <Section icon={Users} label={`Участники (${memberIds.length})`}>
                    <div className="flex flex-col gap-3">
                      {mirrors.map((mirror) => {
                        const studentId = mirror.studentId
                        const state = attendeeState[studentId] ?? { attendance: "on_time", homeworkDone: false, rating: null }
                        return (
                          <div key={studentId} className="glass-tile flex flex-col gap-2 rounded-[1rem] p-3">
                            <span className="text-sm font-semibold text-ink">{studentName(studentId)}</span>
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

                  {groupProgram ? (
                    <Section icon={ListChecks} label="Прогресс по программе группы">
                      <div className="flex flex-col gap-4">
                        {groupProgramPercentValue != null ? <ProgressBar value={groupProgramPercentValue} /> : null}
                        <CoveredMaterialChecklist
                          label="Темы"
                          items={groupProgram.topics}
                          selections={topicSelections}
                          onChange={setTopicSelections}
                          allCoveredLabel="Все темы пройдены ✓"
                        />
                        {groupProgram.prototypes.length > 0 ? (
                          <CoveredMaterialChecklist
                            label="Прототипы"
                            items={groupProgram.prototypes}
                            selections={prototypeSelections}
                            onChange={setPrototypeSelections}
                            allCoveredLabel="Все прототипы пройдены ✓"
                          />
                        ) : null}
                      </div>
                    </Section>
                  ) : null}
                </>
              ) : mode === "upcoming" && primary.status === "upcoming" ? (
                <Section icon={Users} label={`Участники (${memberIds.length})`}>
                  <div className="flex flex-wrap gap-1.5">
                    {memberIds.map((studentId) => (
                      <span key={studentId} className="glass-tile rounded-full border border-glass-border px-3 py-1 text-sm text-ink">
                        {studentName(studentId)}
                      </span>
                    ))}
                  </div>
                </Section>
              ) : null}

              {isCompleted ? (
                <Section icon={Users} label={`Итоги (${memberIds.length} участников)`}>
                  <div className="flex flex-col gap-2">
                    {mirrors.map((mirror) => (
                      <div key={mirror.studentId} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="min-w-0 flex-1 truncate font-semibold text-ink">{studentName(mirror.studentId)}</span>
                        <span className="text-muted-foreground">{optionLabel(ATTENDANCE_OPTIONS, mirror.attendance)}</span>
                        <span className="text-muted-foreground">{mirror.homeworkDone ? "ДЗ сделано" : "ДЗ не сделано"}</span>
                        <span className="text-muted-foreground">{optionLabel(RATING_OPTIONS, mirror.rating)}</span>
                      </div>
                    ))}
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

          {primary && primary.status === "upcoming" ? (
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

// Same "immediate apply, no confirm step" shape as the individual lesson's
// RescheduleDialog/CancelLessonDialog (upcoming-lesson-card.jsx), minus the
// "propose to the other side" framing those use -- a group reschedule/
// cancellation is a decision the teacher is recording, not negotiating
// (see functions/core/groups.js's own comment on this). Lives here (not
// groups-section.jsx) so upcoming-lesson-card.jsx can import them without
// a circular dependency -- it also imports UpcomingLessonCard from here
// indirectly via groups-section.jsx, which itself now imports
// UpcomingLessonCard back.
export function GroupRescheduleDialog({ groupId, groupLessonKey, initialDate, open, onOpenChange }) {
  const timeZone = useTimeZone()
  const [date, setDate] = useState("")
  const [time, setTime] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open) return
    const [initialDatePart, initialTimePart] = initialDate ? utcDateToLocalInput(initialDate, timeZone).split("T") : ["", ""]
    setDate(initialDatePart)
    setTime(initialTimePart)
    setError("")
  }, [open, initialDate, timeZone])

  function handleOpenChange(nextOpen) {
    if (submitting) return
    onOpenChange(nextOpen)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!date || !time || submitting) return
    setSubmitting(true)
    setError("")
    try {
      const newDate = localInputsToUtcDate(date, time, timeZone)
      await rescheduleGroupLesson(groupId, groupLessonKey, newDate)
      handleOpenChange(false)
    } catch (err) {
      console.error("Failed to reschedule group lesson:", err)
      setError(err?.message || "Не удалось перенести занятие")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <TeacherDialog open={open} onOpenChange={handleOpenChange}>
      <TeacherDialogContent elevated>
        <TeacherDialogTitle>Перенести занятие</TeacherDialogTitle>
        <TeacherDialogDescription>Новая дата и время применятся сразу, без подтверждения от участников</TeacherDialogDescription>

        <form className="mt-5 flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex gap-2">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={submitting} className={teacherInputCls} />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              disabled={submitting}
              className={`${teacherInputCls} max-w-36`}
            />
          </div>
          {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
          <SolidBtn type="submit" className="w-full justify-center py-3 text-sm" disabled={!date || !time || submitting}>
            {submitting ? "Переносим..." : "Перенести"}
          </SolidBtn>
        </form>
      </TeacherDialogContent>
    </TeacherDialog>
  )
}

export function GroupCancelDialog({ groupId, groupLessonKey, lessonDate, open, onOpenChange }) {
  const timeZone = useTimeZone()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  function handleOpenChange(nextOpen) {
    if (submitting) return
    onOpenChange(nextOpen)
    if (!nextOpen) setError("")
  }

  async function handleConfirm() {
    if (submitting) return
    setSubmitting(true)
    setError("")
    try {
      await cancelGroupLesson(groupId, groupLessonKey)
      handleOpenChange(false)
    } catch (err) {
      console.error("Failed to cancel group lesson:", err)
      setError(err?.message || "Не удалось отменить занятие")
      setSubmitting(false)
    }
  }

  return (
    <TeacherDialog open={open} onOpenChange={handleOpenChange}>
      <TeacherDialogContent elevated>
        <TeacherDialogTitle>Отменить занятие?</TeacherDialogTitle>
        <TeacherDialogDescription>
          Занятие{lessonDate ? ` ${formatLessonDateTime(lessonDate, timeZone)}` : ""} будет отменено сразу, участники получат уведомление.
        </TeacherDialogDescription>

        {error ? <p className="mt-2 text-sm font-semibold text-destructive">{error}</p> : null}

        <TeacherModalFooter className="mt-5">
          <TeacherCancelBtn onClick={() => handleOpenChange(false)} disabled={submitting} />
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="rounded-full bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Отменяем..." : "Отменить занятие"}
          </button>
        </TeacherModalFooter>
      </TeacherDialogContent>
    </TeacherDialog>
  )
}
