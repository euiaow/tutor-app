import { useEffect, useRef, useState } from "react"
import { AlertCircle, Loader2, Paperclip, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { ensureUpcomingLesson, subscribeToLesson, updateHomeworkAssignment } from "@/firebase/lessons"
import { uploadMaterial } from "@/firebase/materials"
import { formatLessonDateTime } from "@/lib/schedule"

export function HomeworkLessonDialog({ studentId, studentName, open, onOpenChange }) {
  const [lessonId, setLessonId] = useState(null)
  const [lesson, setLesson] = useState(null)
  const [prepareError, setPrepareError] = useState("")
  const preparing = open && !lesson && !prepareError

  const [assignmentText, setAssignmentText] = useState("")
  const [assignmentFiles, setAssignmentFiles] = useState([])
  const initializedAssignmentRef = useRef(false)

  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const fileInputRef = useRef(null)

  // Reset so a later re-open re-syncs the textarea/file list from
  // Firestore instead of keeping whatever was left over from last time.
  useEffect(() => {
    if (!open) {
      initializedAssignmentRef.current = false
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    let cancelled = false
    let unsubscribe = null

    ensureUpcomingLesson(studentId)
      .then((id) => {
        if (cancelled) return

        if (!id) {
          setPrepareError(
            "У ученика не задано расписание занятий — сначала укажите день и время в карточке ученика",
          )
          return
        }

        setLessonId(id)
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
  }, [open, studentId])

  useEffect(() => {
    if (lesson && !initializedAssignmentRef.current) {
      setAssignmentText(lesson.homework.assignment.text)
      setAssignmentFiles(lesson.homework.assignment.files)
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
      await updateHomeworkAssignment(studentId, lessonId, {
        text: assignmentText,
        files: assignmentFiles,
      })
    } catch (error) {
      console.error("Failed to save homework assignment:", error)
      setSaveError(error?.message || "Не удалось сохранить задание")
    } finally {
      setSaving(false)
    }
  }

  const submissionFiles = lesson?.homework.submission.files ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogTitle>{studentName}</DialogTitle>
        <DialogDescription>
          {lesson?.date ? formatLessonDateTime(lesson.date) : "Следующий урок"}
        </DialogDescription>

        {preparing ? (
          <Spinner label="Готовим урок..." />
        ) : prepareError ? (
          <div className="mt-6 flex items-center gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
            <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
            <span>{prepareError}</span>
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-foreground">Задание</span>
              <textarea
                value={assignmentText}
                onChange={(e) => setAssignmentText(e.target.value)}
                disabled={saving}
                placeholder="Напишите задание..."
                rows={4}
                className="rounded-xl border-2 border-border bg-secondary/40 px-3.5 py-2.5 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary focus:bg-card focus:ring-4 focus:ring-primary/15 disabled:opacity-50"
              />

              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileChange}
                disabled={saving || uploading}
                className="text-sm text-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-semibold file:text-secondary-foreground file:transition-colors hover:file:bg-secondary/80 disabled:opacity-50"
              />

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
                      <button
                        type="button"
                        onClick={() => handleRemoveFile(index)}
                        disabled={saving}
                        className="shrink-0 text-xs font-semibold text-destructive hover:underline disabled:opacity-50"
                      >
                        Удалить
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              {saveError ? (
                <span className="text-sm font-semibold text-destructive">{saveError}</span>
              ) : null}

              <Button
                type="button"
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
                  "Сохранить задание"
                )}
              </Button>
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
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
