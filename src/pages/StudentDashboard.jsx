import { useEffect, useRef, useState } from "react"
import { useParams, useSearchParams } from "react-router-dom"
import { I18nextProvider, useTranslation } from "react-i18next"
import { studentI18n, useDateLocale } from "@/lib/i18n"
import {
  Paperclip,
  CheckCircle2,
  Loader2,
  CalendarClock,
  X,
  Bell,
  Clock,
  TrendingUp,
  BookOpen,
  Layers,
  Flame,
  ChevronUp,
  ChevronDown,
  ArrowRight,
  Video,
  ChevronRight,
  CalendarDays,
  Target,
  Pencil,
  Settings,
  MessageSquarePlus,
} from "lucide-react"
import { StudentGrainBackground } from "@/components/student-grain-background"
import { ExamRadar } from "@/components/student/exam-radar"
import { CurriculumItemGroups } from "@/components/student/curriculum-item-groups"
import { MaterialsLibrary } from "@/components/materials-library"
import { LessonHistory } from "@/components/lesson-history"
import { NotificationsList } from "@/components/notifications-list"
import { formatLessonDateTime } from "@/lib/schedule"
import { formatRelativeTime } from "@/lib/notifications"
import { Spinner } from "@/components/ui/spinner"
import {
  GlassDialog,
  GlassDialogContent,
  GlassDialogTitle,
  GlassDialogDescription,
} from "@/components/glass-dialog"
import { LoginScreen } from "@/components/auth/login-screen"
import { usePageTitle } from "@/lib/usePageTitle"
import { subscribeToStudent, getStudentTelegramChatId, getStudentLanguage, setStudentGoal } from "@/firebase/students"
import {
  subscribeToStudentNotifications,
  markNotificationRead,
} from "@/firebase/notifications"
import {
  subscribeToLessons,
  subscribeToUpcomingLesson,
  subscribeToAllUpcomingLessons,
  subscribeToLesson,
  proposeReschedule,
  confirmReschedule,
  cancelReschedule,
  proposeCancellation,
  confirmCancellation,
  rejectCancellation,
  submitHomeworkFile,
  addHomeworkSubmissionComment,
} from "@/firebase/lessons"
import { uploadHomeworkSubmissionFile } from "@/firebase/materials"
import { subscribeToVideoCallUrl } from "@/firebase/videoCall"
import { subscribeToPrograms } from "@/firebase/curriculum"
import { subscribeToExamTypes } from "@/firebase/examTypes"
import { openExternalLink } from "@/lib/telegramWebApp"
import { computeRadarMetrics, requiredItems, daysSinceLastUpdate } from "@/lib/examRadar"
import { UserPrefsProvider, useTimeZone } from "@/lib/user-prefs-context"
import { getThemeById } from "@/lib/themes"
import { resolveTimeZone, getDeviceTimeZone, localInputsToUtcDate, utcDateToLocalInput } from "@/lib/timezone"
import { updateStudentSettings } from "@/firebase/students"
import { StudentSettingsDialog } from "@/components/student/student-settings-dialog"
import { GamificationProvider, useGamification } from "@/lib/gamification-context"
import { StickerWorkshopButton } from "@/components/student/sticker-workshop-button"
import { DecorationZone } from "@/components/student/decoration-zone"
import { StudentFinanceSection } from "@/components/student/finance-section"
import { translateSubject } from "@/locales/subjectTranslations"
import { translateUnitLabel } from "@/locales/examUnitTranslations"
import { buildNotificationText } from "@/lib/notificationMessages"

function ProposeRescheduleDialog({ studentId, lessonId, initialDate, open, onOpenChange, zIndex }) {
  const { t } = useTranslation("student")
  const timeZone = useTimeZone()
  const [date, setDate] = useState("")
  const [time, setTime] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  // Was a remount-via-key on the parent (key={open ? "open" : "closed"}) —
  // that reset the form fields on each open, but also meant Base UI's
  // Dialog.Root was born already-open instead of transitioning
  // closed→open, so the entrance animation (data-[starting-style], same
  // transition every other GlassDialog/TeacherDialog uses) never had a
  // state change to actually animate. A plain effect keyed on `open`
  // gets the same "fresh fields every time it opens" behavior without
  // remounting the dialog itself.
  useEffect(() => {
    if (!open) return
    const [initialDatePart, initialTimePart] = initialDate
      ? utcDateToLocalInput(initialDate, timeZone).split("T")
      : ["", ""]
    setDate(initialDatePart)
    setTime(initialTimePart)
    setError("")
  }, [open, initialDate, timeZone])

  function handleOpenChange(nextOpen) {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      setDate("")
      setTime("")
      setError("")
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!date || !time || submitting) return

    setSubmitting(true)
    setError("")
    try {
      const proposedDate = localInputsToUtcDate(date, time, timeZone)
      await proposeReschedule(studentId, lessonId, proposedDate, "student")
      handleOpenChange(false)
    } catch (err) {
      console.error("Failed to propose reschedule:", err)
      setError(err?.message || t("rescheduleDialog.error"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <GlassDialog open={open} onOpenChange={handleOpenChange}>
      <GlassDialogContent zIndex={zIndex}>
        <GlassDialogTitle>{t("rescheduleDialog.title")}</GlassDialogTitle>
        <GlassDialogDescription>{t("rescheduleDialog.description")}</GlassDialogDescription>

        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={submitting}
              className="glass-inset h-11 flex-1 rounded-2xl px-3.5 text-sm font-medium text-foreground outline-none transition-all focus:ring-4 focus:ring-primary/15 disabled:opacity-50"
            />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              disabled={submitting}
              className="glass-inset h-11 rounded-2xl px-3.5 text-sm font-medium text-foreground outline-none transition-all focus:ring-4 focus:ring-primary/15 disabled:opacity-50"
            />
          </div>

          {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}

          <button
            type="submit"
            disabled={!date || !time || submitting}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/60 bg-white/45 px-5 text-sm font-medium text-secondary-foreground backdrop-blur-md transition-colors hover:bg-white/70 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                {t("rescheduleDialog.submitting")}
              </>
            ) : (
              t("rescheduleDialog.submit")
            )}
          </button>
        </form>
      </GlassDialogContent>
    </GlassDialog>
  )
}

function ProposeCancelDialog({ studentId, lessonId, lessonDate, open, onOpenChange, zIndex }) {
  const { t } = useTranslation("student")
  const timeZone = useTimeZone()
  const dateLocale = useDateLocale()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  function handleOpenChange(nextOpen) {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      setError("")
    }
  }

  async function handleConfirm() {
    if (submitting) return

    setSubmitting(true)
    setError("")
    try {
      await proposeCancellation(studentId, lessonId, "student")
      handleOpenChange(false)
    } catch (err) {
      console.error("Failed to propose cancellation:", err)
      setError(err?.message || t("cancelDialog.error"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <GlassDialog open={open} onOpenChange={handleOpenChange}>
      <GlassDialogContent zIndex={zIndex}>
        <GlassDialogTitle>{t("cancelDialog.title")}</GlassDialogTitle>
        <GlassDialogDescription>
          {lessonDate
            ? t("cancelDialog.descriptionWithDate", { date: formatLessonDateTime(lessonDate, timeZone, dateLocale) })
            : t("cancelDialog.descriptionNoDate")}
        </GlassDialogDescription>

        {error ? <p className="mt-2 text-sm font-semibold text-destructive">{error}</p> : null}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
            className="flex-1 rounded-full border border-white/60 bg-white/45 px-5 py-3 text-sm font-medium text-secondary-foreground backdrop-blur-md transition-colors hover:bg-white/70 disabled:opacity-50"
          >
            {t("common.back")}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="flex flex-1 items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium text-destructive-foreground transition-transform hover:scale-[1.02] disabled:opacity-50"
            style={{ background: "var(--gradient-warm)", boxShadow: "var(--shadow-soft)" }}
          >
            {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : t("cancelDialog.confirmButton")}
          </button>
        </div>
      </GlassDialogContent>
    </GlassDialog>
  )
}

// Reschedule/cancellation status plates — same tinted-glass-card language
// as ExamRadar's own status plate (color-mix'd background/border off a
// semantic token, a solid dot with a soft ring, sm text). `tone` picks
// which of the --status-* tokens (index.css) to tint with: "warn" (amber)
// for a pending reschedule, "bad" (red) for a pending/confirmed
// cancellation, "good" (green) for a confirmed reschedule.
function StatusPlate({ tone, title, children }) {
  const color = `var(--status-${tone})`
  return (
    <div
      className="rounded-3xl border p-4"
      style={{
        background: `color-mix(in oklab, ${color} 12%, transparent)`,
        borderColor: `color-mix(in oklab, ${color} 32%, transparent)`,
      }}
    >
      <p className="flex items-center gap-2.5 text-sm font-semibold text-foreground">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: color, boxShadow: `0 0 0 4px color-mix(in oklab, ${color} 20%, transparent)` }}
        />
        {title}
      </p>
      {children}
    </div>
  )
}

// Same primary/neutral button pair already used everywhere else on this
// page (video-call "Подключиться", "Перенести урок"/"Отменить урок") —
// confirm always gets the project's one accent gradient regardless of
// tone, reject stays neutral glass; only the StatusPlate wrapper itself
// carries the reschedule-vs-cancellation color semantics.
function StatusPlateActions({ onConfirm, confirmLabel, onReject, rejectLabel, disabled }) {
  return (
    <div className="mt-3 flex gap-2">
      <button
        type="button"
        onClick={onConfirm}
        disabled={disabled}
        className="flex-1 inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-destructive-foreground transition-transform hover:scale-[1.01] disabled:opacity-55 disabled:hover:scale-100"
        style={{ background: "var(--gradient-warm)", boxShadow: "var(--shadow-soft)" }}
      >
        {confirmLabel}
      </button>
      <button
        type="button"
        onClick={onReject}
        disabled={disabled}
        className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-white/60 bg-white/45 px-4 py-2.5 text-sm font-medium text-secondary-foreground backdrop-blur-md transition-colors hover:bg-white/70 disabled:opacity-55"
      >
        {rejectLabel}
      </button>
    </div>
  )
}

// Compact, single-line version of StatusPlate's color language — used per
// row inside "Мои уроки" where a full tinted card per lesson would be too
// heavy for a scrollable list.
function CompactStatusBadge({ tone, children }) {
  const color = `var(--status-${tone})`
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ background: `color-mix(in oklab, ${color} 15%, transparent)`, color }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
      {children}
    </span>
  )
}

// Styled like the teacher's own per-student upcoming-lessons card
// (upcoming-lesson-card.jsx) but with every section shown at once instead
// of behind an "Открыть" — assignment, own homework submission, and
// reschedule/cancel all inline, since this dialog is the student's one
// detailed view of a lesson that isn't their single "Следующий урок" card.
// Reschedule/cancel reuse the exact same ProposeRescheduleDialog/
// ProposeCancelDialog this file already defines for that card, with the
// same isGroupLesson guard (a group mirror can't be individually
// rescheduled/cancelled — see core/lessons.js's assertNotGroupMirror).
// Shared "Тема: ... / Задание: ..." block for every lesson card that shows
// an assignment (NextLessonPlate, UpcomingLessonRow) — a 2-column grid so
// both labels share one column width and a wrapped value line indents to
// start under the value column instead of back under the label, per the
// explicit layout spec this was asked for.
function TopicAndAssignment({ topic, assignmentText }) {
  const { t } = useTranslation("student")
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-sm">
      <span className="shrink-0 font-semibold text-foreground">{t("nextLesson.topicLabel")}</span>
      <span className="text-secondary-foreground">
        {topic ? `"${topic}"` : <span className="text-muted-foreground">{t("common.noTopic")}</span>}
      </span>
      <span className="shrink-0 font-semibold text-foreground">{t("nextLesson.assignmentLabel")}</span>
      <span className="text-secondary-foreground">
        {assignmentText ? (
          `"${assignmentText}"`
        ) : (
          <span className="text-muted-foreground">{t("nextLesson.assignmentEmpty")}</span>
        )}
      </span>
    </div>
  )
}

// Shared state/handlers for the "add/edit comment on my homework" feature —
// used by both NextLessonPlate and UpcomingLessonRow (all-uroki dialog), so
// the two lesson cards never drift into two different comment behaviors.
function useHomeworkComment(studentId, lessonId, existingComment) {
  const { t } = useTranslation("student")
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  function startEditing() {
    setText(existingComment || "")
    setError("")
    setOpen(true)
  }

  function cancel() {
    setOpen(false)
    setError("")
  }

  async function save() {
    if (saving || !text.trim()) return
    setSaving(true)
    setError("")
    try {
      await addHomeworkSubmissionComment(studentId, lessonId, text.trim())
      setOpen(false)
    } catch (err) {
      console.error("Failed to save homework comment:", err)
      setError(t("nextLesson.commentSaveError"))
    } finally {
      setSaving(false)
    }
  }

  return { open, text, setText, saving, error, startEditing, cancel, save }
}

// The open textarea+save/cancel form only — rendered in place of whatever
// trigger button/attach-homework row the parent normally shows, same
// "editing replaces the row" shape UpcomingLessonRow already used for this.
// Renders nothing when not open; the existing-comment text and the trigger
// button that opens this stay the parent's own JSX (label/position differ
// slightly between NextLessonPlate and UpcomingLessonRow).
function HomeworkCommentForm({ comment }) {
  const { t } = useTranslation("student")
  if (!comment.open) return null

  return (
    <div className="mt-2.5 flex flex-col gap-2">
      <textarea
        value={comment.text}
        onChange={(e) => comment.setText(e.target.value)}
        disabled={comment.saving}
        placeholder={t("nextLesson.commentPlaceholder")}
        rows={3}
        className="glass-inset w-full rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/60 disabled:opacity-60"
      />
      {comment.error ? <p className="text-xs font-semibold text-destructive">{comment.error}</p> : null}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={comment.save}
          disabled={comment.saving || !comment.text.trim()}
          className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-xs text-ink-foreground transition-transform hover:scale-[1.02] disabled:opacity-50"
        >
          {comment.saving ? (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              {t("nextLesson.commentSaving")}
            </>
          ) : (
            t("common.save")
          )}
        </button>
        <button
          type="button"
          onClick={comment.cancel}
          disabled={comment.saving}
          className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/45 px-4 py-2 text-xs font-medium text-secondary-foreground backdrop-blur-md transition-colors hover:bg-white/70 disabled:opacity-50"
        >
          {t("common.cancel")}
        </button>
      </div>
    </div>
  )
}

function UpcomingLessonRow({ lesson, studentId }) {
  const { t } = useTranslation("student")
  const timeZone = useTimeZone()
  const dateLocale = useDateLocale()
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [uploadingHomework, setUploadingHomework] = useState(false)
  const [uploadHomeworkError, setUploadHomeworkError] = useState("")
  const homeworkFileInputRef = useRef(null)

  const assignment = lesson.homework.assignment
  const submissionFiles = lesson.homework.submission.files ?? []
  const lastSubmission = submissionFiles[submissionFiles.length - 1]
  const effectiveDate = lesson.rescheduledDate ?? lesson.date
  const comment = useHomeworkComment(studentId, lesson.id, lesson.homework.submission.comment)

  async function handleHomeworkFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingHomework(true)
    setUploadHomeworkError("")

    try {
      const fileUrl = await uploadHomeworkSubmissionFile(file, studentId)
      await submitHomeworkFile(studentId, fileUrl, lesson.id)
    } catch (err) {
      console.error("Failed to submit homework file:", err)
      setUploadHomeworkError(t("nextLesson.homeworkUploadError"))
    } finally {
      setUploadingHomework(false)
      if (homeworkFileInputRef.current) {
        homeworkFileInputRef.current.value = ""
      }
    }
  }

  return (
    <li className="glass-inset flex flex-col gap-3 rounded-2xl px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarDays className="size-3.5" aria-hidden="true" />
          {formatLessonDateTime(effectiveDate, timeZone, dateLocale)}
          {lesson.rescheduleStatus === "confirmed" ? (
            <CompactStatusBadge tone="good">{t("upcomingRow.rescheduleConfirmed")}</CompactStatusBadge>
          ) : null}
        </div>
        {lesson.isGroupLesson ? (
          <CompactStatusBadge tone="warn">{lesson.groupName || t("nextLesson.groupLabel", { name: lesson.subject })}</CompactStatusBadge>
        ) : null}
      </div>

      {lesson.rescheduleStatus === "pending_student" || lesson.rescheduleStatus === "pending_teacher" ? (
        <div className="flex flex-wrap items-center gap-2">
          <CompactStatusBadge tone="warn">
            {lesson.rescheduleStatus === "pending_student"
              ? t("upcomingRow.pendingStudent")
              : t("upcomingRow.rescheduleProposed")}
          </CompactStatusBadge>
          <span className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground line-through">
              {formatLessonDateTime(effectiveDate, timeZone, dateLocale)}
            </span>
            <ArrowRight className="size-3 text-muted-foreground" aria-hidden="true" />
            <span className="font-semibold text-foreground">
              {lesson.rescheduleProposedDate
                ? formatLessonDateTime(lesson.rescheduleProposedDate, timeZone, dateLocale)
                : "—"}
            </span>
          </span>
        </div>
      ) : null}

      {lesson.cancellationStatus === "pending_student" || lesson.cancellationStatus === "pending_teacher" ? (
        <CompactStatusBadge tone="bad">
          {lesson.cancellationStatus === "pending_student"
            ? t("upcomingRow.pendingStudentCancellation")
            : t("upcomingRow.cancellationProposed")}
        </CompactStatusBadge>
      ) : null}

      <div className="glass-inset rounded-2xl p-3.5">
        <TopicAndAssignment topic={lesson.topic} assignmentText={assignment.text} />
        {assignment.files.length > 0 ? (
          <ul className="mt-1.5 flex flex-col gap-1">
            {assignment.files.map((file, index) => (
              <li key={`${file.url}-${index}`}>
                <a
                  href={file.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-sm font-semibold text-foreground underline underline-offset-2"
                >
                  <Paperclip className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{file.title}</span>
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="glass-inset rounded-2xl p-3.5">
        <span className="font-display text-[0.65rem] font-medium tracking-[0.02em] text-muted-foreground">
          {t("nextLesson.myHomework")}
        </span>
        {submissionFiles.length === 0 ? (
          <p className="mt-1.5 text-sm text-secondary-foreground">{t("nextLesson.homeworkNotSubmitted")}</p>
        ) : (
          <>
            <p className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-secondary-foreground">
              <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
              {t("nextLesson.homeworkReceived")}
              {lastSubmission?.submittedAt ? (
                <span className="font-normal text-muted-foreground">
                  ({formatLessonDateTime(lastSubmission.submittedAt, timeZone, dateLocale)})
                </span>
              ) : null}
            </p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {submissionFiles.map((file, index) => (
                <li key={`${file.url}-${index}`}>
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-sm text-foreground underline underline-offset-2"
                  >
                    <Paperclip className="size-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">
                      {t("nextLesson.fileLabel", { index: index + 1 })}
                      {file.submittedAt ? ` (${formatLessonDateTime(file.submittedAt, timeZone, dateLocale)})` : ""}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}

        {!comment.open && lesson.homework.submission.comment ? (
          <p className="glass-tile mt-2.5 rounded-xl px-3 py-2 text-sm text-secondary-foreground">
            {lesson.homework.submission.comment}
          </p>
        ) : null}

        <HomeworkCommentForm comment={comment} />

        {!comment.open ? (
          <div className="mt-2.5 flex flex-wrap gap-2">
            <input
              ref={homeworkFileInputRef}
              type="file"
              onChange={handleHomeworkFileChange}
              disabled={uploadingHomework}
              className="hidden"
            />
            <button
              type="button"
              disabled={uploadingHomework}
              onClick={() => homeworkFileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-xs text-ink-foreground transition-transform hover:scale-[1.02] disabled:opacity-50"
            >
              {uploadingHomework ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  {t("nextLesson.uploading")}
                </>
              ) : (
                <>
                  <Paperclip className="size-3.5" aria-hidden="true" />
                  {t("nextLesson.attachHomework")}
                </>
              )}
            </button>
            <button
              type="button"
              onClick={comment.startEditing}
              className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/45 px-4 py-2 text-xs font-medium text-secondary-foreground backdrop-blur-md transition-colors hover:bg-white/70"
            >
              <MessageSquarePlus className="size-3.5" aria-hidden="true" />
              {lesson.homework.submission.comment ? t("nextLesson.editComment") : t("nextLesson.addComment")}
            </button>
          </div>
        ) : null}
        {uploadHomeworkError ? (
          <p className="mt-1.5 text-xs font-semibold text-destructive">{uploadHomeworkError}</p>
        ) : null}
      </div>

      {lesson.isGroupLesson ? (
        <p className="text-xs text-muted-foreground">{t("nextLesson.groupNoActions")}</p>
      ) : lesson.rescheduleStatus !== "pending_teacher" || lesson.cancellationStatus !== "pending_teacher" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {lesson.rescheduleStatus !== "pending_teacher" ? (
            <button
              type="button"
              onClick={() => setRescheduleDialogOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/60 bg-white/45 px-4 py-2 text-xs font-medium text-secondary-foreground backdrop-blur-md transition-colors hover:bg-white/70"
            >
              <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
              {t("nextLesson.rescheduleButton")}
            </button>
          ) : null}
          {lesson.cancellationStatus !== "pending_teacher" ? (
            <button
              type="button"
              onClick={() => setCancelDialogOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/60 bg-white/45 px-4 py-2 text-xs font-medium text-secondary-foreground backdrop-blur-md transition-colors hover:bg-white/70"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              {t("nextLesson.cancelButton")}
            </button>
          ) : null}
        </div>
      ) : null}

      {!lesson.isGroupLesson ? (
        <>
          <ProposeRescheduleDialog
            studentId={studentId}
            lessonId={lesson.id}
            initialDate={effectiveDate}
            open={rescheduleDialogOpen}
            onOpenChange={setRescheduleDialogOpen}
            zIndex={150}
          />
          <ProposeCancelDialog
            studentId={studentId}
            lessonId={lesson.id}
            lessonDate={effectiveDate}
            open={cancelDialogOpen}
            onOpenChange={setCancelDialogOpen}
            zIndex={150}
          />
        </>
      ) : null}
    </li>
  )
}

function AllUpcomingLessonsDialog({ studentId, open, onOpenChange }) {
  const { t } = useTranslation("student")
  const [lessons, setLessons] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return

    setLoading(true)
    const unsub = subscribeToAllUpcomingLessons(
      studentId,
      (data) => {
        setLessons(data)
        setLoading(false)
      },
      (error) => {
        console.error("Failed to load all upcoming lessons:", error)
        setLoading(false)
      },
    )
    return () => unsub()
  }, [open, studentId])

  return (
    <GlassDialog open={open} onOpenChange={onOpenChange}>
      <GlassDialogContent className="max-w-2xl">
        <GlassDialogTitle>{t("allUpcomingDialog.title")}</GlassDialogTitle>
        <GlassDialogDescription>{t("allUpcomingDialog.description")}</GlassDialogDescription>

        <div className="scrollbar-hidden mt-4 max-h-[65vh] overflow-y-auto pr-1">
          {loading ? (
            <Spinner label={t("common.loading")} />
          ) : lessons.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("allUpcomingDialog.empty")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {lessons.map((lesson) => (
                <UpcomingLessonRow key={lesson.id} lesson={lesson} studentId={studentId} />
              ))}
            </ul>
          )}
        </div>
      </GlassDialogContent>
    </GlassDialog>
  )
}

// Block 4 — a goal (targetScore/examDate) now belongs to one specific
// program, not to the student as a whole (a student can have several
// programs, each with its own exam target). `heading` lets the wrapper
// below decide "Моя цель" (only one qualifying program) vs. the program's
// own subject name (several) — see MyGoalsSection.
// zone3 ("МГУ" in the reference) anchors to this card's own top border,
// clear of the "Моя цель"/heading text on the left (the title is short but
// starts right after the icon badge, so the zone sits further right — ~28%
// in on desktop where the card is wide enough for that to already clear the
// title, ~48% on the narrower mobile card where 28% would still land on it)
// and clear of the "Заполнить"/pencil-edit controls, which live lower/more
// to the right than this top-border overlap ever reaches.
function GoalDecoration({ showDecoration }) {
  if (!showDecoration) return null
  // Pushed further up (mostly overlapping the notifications banner above,
  // which is fine) and further right (past both "Русский язык" and
  // "Заполнить" — the no-goal state's title and its far-right button share
  // almost the card's entire height, so there's no safe vertical band to
  // dip into; going higher shrinks how far down it reaches at all, and the
  // horizontal shift clears both regardless of title length). One unified
  // position for every width (session 26).
  return <DecorationZone zone="zone3" className="top-[-84px] left-[52%]" />
}

function GoalCard({ studentId, program, examType, heading, showDecoration = false }) {
  const { t, i18n } = useTranslation("student")
  const timeZone = useTimeZone()
  const dateLocale = useDateLocale()
  const [editing, setEditing] = useState(false)
  const [targetScore, setTargetScore] = useState("")
  const [examDate, setExamDate] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const hasGoal = program.targetScore != null && program.examDate != null
  // A "grade" scale (e.g. ОГЭ's 2-5) shows a bare number ("Целевая
  // оценка"), any other scale (ЕГЭ, custom types) shows the value with its
  // unit label — same rule ExamRadar applies to the read-only display.
  const isGradeScale = examType?.scaleType === "grade"
  // Hardcoded language-level scale (A1-C2) — targetScore stores the index
  // into examType.scaleLabels, not the label itself, same reasoning as any
  // other numeric targetScore (pace math in computeRadarMetrics stays
  // number-based); the select below just resolves index<->label at the
  // UI boundary.
  const isLanguageLevel = examType?.scaleType === "language_level"
  const scaleMin = examType?.scaleMin ?? 0
  const scaleMax = examType?.scaleMax ?? 100
  const scaleStep = examType?.scaleStep ?? 1
  const unitLabel = translateUnitLabel(examType?.scaleUnitLabel, i18n.language) || t("goals.unitFallback")
  const goalLabel = isLanguageLevel
    ? t("goals.targetLevel")
    : isGradeScale
      ? t("goals.targetGrade")
      : t("goals.targetScoreUnit", { unit: unitLabel })
  // examType.scaleDefault (e.g. ЕГЭ's 70) wins when set; otherwise falls
  // back to the old behavior — scaleMax-1 for a grade scale, the scale's
  // own minimum otherwise (custom types created via the inline form never
  // set scaleDefault, so they keep the pre-existing default).
  const defaultTargetScore = examType?.scaleDefault ?? (isGradeScale ? scaleMax - 1 : scaleMin)

  function startEditing() {
    setTargetScore(
      program.targetScore != null ? String(program.targetScore) : String(defaultTargetScore),
    )
    setExamDate(program.examDate ? toDateInputValue(program.examDate) : "")
    setError("")
    setEditing(true)
  }

  async function handleSave() {
    if (saving) return
    if (!isLanguageLevel) {
      const numericScore = Number(targetScore)
      if (!Number.isNaN(numericScore) && (numericScore < scaleMin || numericScore > scaleMax)) {
        setError(t("goals.scoreOutOfRange", { min: scaleMin, max: scaleMax }))
        return
      }
    }
    setSaving(true)
    setError("")
    try {
      const dateValue = examDate ? new Date(`${examDate}T12:00:00`) : null
      await setStudentGoal(studentId, program.id, targetScore, dateValue)
      setEditing(false)
    } catch (err) {
      console.error("Failed to save student goal:", err)
      setError(err?.message || t("goals.saveError"))
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <section className="glass-soft relative rounded-4xl p-6">
        <GoalDecoration showDecoration={showDecoration} />
        <h3 className="font-display text-lg text-foreground">{heading}</h3>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <label className="flex-1">
            <span className="text-xs text-muted-foreground">{goalLabel}</span>
            {isLanguageLevel ? (
              <select
                value={targetScore}
                onChange={(e) => setTargetScore(e.target.value)}
                disabled={saving}
                className="glass-inset mt-1 w-full rounded-2xl px-4 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/60 disabled:opacity-60"
              >
                {(examType?.scaleLabels ?? []).map((label, index) => (
                  <option key={label} value={index}>
                    {label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="number"
                min={String(scaleMin)}
                max={String(scaleMax)}
                step={String(scaleStep)}
                value={targetScore}
                onChange={(e) => setTargetScore(e.target.value)}
                disabled={saving}
                placeholder={String(scaleMin)}
                className="glass-inset mt-1 w-full rounded-2xl px-4 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/60 disabled:opacity-60"
              />
            )}
          </label>
          <label className="flex-1">
            <span className="text-xs text-muted-foreground">{t("goals.examDate")}</span>
            <input
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              disabled={saving}
              className="glass-inset mt-1 w-full rounded-2xl px-4 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/60 disabled:opacity-60"
            />
          </label>
        </div>

        {error ? <p className="mt-2 text-sm font-semibold text-destructive">{error}</p> : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={saving}
            className="rounded-full border border-white/60 bg-white/45 px-5 py-2.5 text-sm font-medium text-secondary-foreground backdrop-blur-md transition-colors hover:bg-white/70 disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !targetScore || !examDate}
            className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-destructive-foreground transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
            style={{ background: "var(--gradient-warm)", boxShadow: "var(--shadow-soft)" }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : t("common.save")}
          </button>
        </div>
      </section>
    )
  }

  if (!hasGoal) {
    return (
      <section className="glass-soft relative flex flex-wrap items-center gap-4 rounded-4xl p-6">
        <GoalDecoration showDecoration={showDecoration} />
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-primary-foreground"
          style={{ background: "var(--gradient-warm)" }}
        >
          <Target className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-[14rem] flex-1">
          <h3 className="font-display text-lg text-foreground">{heading}</h3>
          <p className="mt-1 text-sm text-secondary-foreground">{t("goals.noGoalHint")}</p>
        </div>
        <button
          type="button"
          onClick={startEditing}
          className="rounded-full px-5 py-2.5 text-sm font-medium text-primary-foreground"
          style={{ background: "var(--gradient-warm)", boxShadow: "var(--shadow-soft)" }}
        >
          {t("goals.fillIn")}
        </button>
      </section>
    )
  }

  return (
    <section className="glass-soft relative rounded-4xl p-6">
      <GoalDecoration showDecoration={showDecoration} />
      <div className="flex items-center gap-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-primary-foreground"
          style={{ background: "var(--gradient-warm)" }}
        >
          <Target className="h-5 w-5" aria-hidden="true" />
        </span>
        <h3 className="font-display text-lg text-foreground">{heading}</h3>
        <button
          type="button"
          onClick={startEditing}
          aria-label={t("goals.editGoalAria")}
          className="ml-auto text-muted-foreground transition hover:text-primary"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <div className="glass-inset flex-1 rounded-3xl p-4">
          <p className="text-xs text-muted-foreground">{goalLabel}</p>
          <p className="mt-1 font-display text-2xl text-primary">
            {isLanguageLevel ? (examType?.scaleLabels?.[program.targetScore] ?? program.targetScore) : program.targetScore}
          </p>
        </div>
        <div className="glass-inset flex-1 rounded-3xl p-4">
          <p className="text-xs text-muted-foreground">{t("goals.examDate")}</p>
          <p className="mt-1 font-display text-lg text-foreground">
            {formatShortDate(program.examDate, timeZone, dateLocale)}
          </p>
        </div>
      </div>
    </section>
  )
}

// Block 4 Phase 3 — replaces the old single-goal MyGoalCard. Filters to
// programs whose examType has a real scale (scaleType !== "none" — a
// "Школьная программа"-style program never participates in goals at all,
// same as the old examTarget === "school" exclusion). Singular "Моя цель"
// heading + the old rich single-card layout when there's exactly one such
// program (unchanged from before multi-program support); "Мои цели" +
// one full card per program, headed by its own subject name, when there
// are several.
function MyGoalsSection({ studentId, programs, examTypesById }) {
  const { t } = useTranslation("student")
  const qualifying = programs.filter((program) => {
    const examType = examTypesById[program.examTypeId]
    return examType && examType.scaleType !== "none"
  })

  if (qualifying.length === 0) return null

  if (qualifying.length === 1) {
    const program = qualifying[0]
    return (
      <GoalCard
        studentId={studentId}
        program={program}
        examType={examTypesById[program.examTypeId]}
        heading={t("goals.myGoal")}
        showDecoration
      />
    )
  }

  return (
    <section>
      <h2 className="font-display text-lg text-foreground">{t("goals.myGoals")}</h2>
      <div className="mt-3 space-y-3">
        {qualifying.map((program, index) => (
          <GoalCard
            key={program.id}
            studentId={studentId}
            program={program}
            examType={examTypesById[program.examTypeId]}
            heading={program.name || t("goals.noSubject")}
            showDecoration={index === 0}
          />
        ))}
      </div>
    </section>
  )
}

// A separate component (not inline in the parent that renders
// <GamificationProvider>) specifically so useGamification() actually sees
// the provided value — a component can't read its own child provider's
// context from within the same render call, only a real descendant can.
// zone1's *desktop* placement stays exactly as session 25/26 left it,
// anchored inside NextLessonPlate (untouched, hidden here via `sm:block`
// on that render site) — this mobile-only variant exists because a sticker
// placed there was landing on top of the greeting name on a narrow phone
// (session 28): when zone1 is occupied, "Добро пожаловать" hides (frees a
// line), the heading drops its forced single-line `truncate` so a long
// name wraps naturally instead of being covered, and a small `pr-*` keeps
// the text from running under where the sticker now sits, close to the
// settings button — all `sm:`-reverted back to the untouched desktop look.
function DashboardHeader({ t, firstName, initial, onSettingsClick }) {
  const gamification = useGamification()
  const zone1Occupied = Boolean(gamification?.decoration?.zone1)

  return (
    <header className="relative grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4">
      <div className="min-w-0">
        <p className={zone1Occupied ? "hidden text-sm text-muted-foreground sm:block" : "text-sm text-muted-foreground"}>
          {t("header.welcome")}
        </p>
        <h1
          className={
            zone1Occupied
              ? "font-display pr-28 text-2xl leading-tight text-foreground sm:truncate sm:pr-0 sm:text-3xl sm:leading-normal"
              : "font-display truncate text-2xl text-foreground sm:text-3xl"
          }
        >
          {t("header.greeting", { name: firstName })}
          {/* The ✌️ moved out of the translated string itself (was baked
              into "greeting" in both locales) and into its own hidden-on-
              mobile span — it was adding real line-height on a narrow
              phone for no benefit, per direct feedback. Desktop keeps it,
              unchanged. */}
          <span aria-hidden="true" className="hidden sm:inline">
            {" "}
            ✌️
          </span>
        </h1>
      </div>
      <button
        type="button"
        onClick={onSettingsClick}
        aria-label={t("header.settingsAria")}
        className="glass-soft grid size-11 shrink-0 place-items-center rounded-full text-foreground/70 transition hover:text-foreground"
      >
        <Settings className="h-5 w-5" aria-hidden="true" />
      </button>
      <div className="relative shrink-0">
        <div className="glass-soft grid h-14 w-14 place-items-center rounded-full font-display text-lg text-foreground">
          {initial}
        </div>
      </div>
      {/* Mobile-only counterpart to NextLessonPlate's own zone1 (desktop-only
          there via `hidden sm:block`) — clears the gear+avatar cluster
          (44+16+56+16=132px) the same way session 25's very first desktop
          clearance calc did, which works here because the header has no
          equivalent of the lesson card's own wider "Посмотреть все уроки"
          link to also clear. */}
      <DecorationZone zone="zone1" className="top-1 right-[136px] sm:hidden" />
    </header>
  )
}

function NextLessonPlate({ studentId, hasSchedule }) {
  const { t } = useTranslation("student")
  const timeZone = useTimeZone()
  const dateLocale = useDateLocale()
  const [lesson, setLesson] = useState(null)
  const [cancelledLesson, setCancelledLesson] = useState(null)
  const [actionPending, setActionPending] = useState(false)
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [allLessonsOpen, setAllLessonsOpen] = useState(false)
  const [uploadingHomework, setUploadingHomework] = useState(false)
  const [uploadHomeworkError, setUploadHomeworkError] = useState("")
  const homeworkFileInputRef = useRef(null)
  const lastLessonIdRef = useRef(null)
  const [videoCallUrl, setVideoCallUrl] = useState(null)

  // A group lesson is a real entry in `lesson` itself now (see
  // core/groups.js — it's a normal students/{id}/lessons mirror doc,
  // tagged isGroupLesson/groupName), so subscribeToUpcomingLesson above
  // already picks the soonest one whether it's individual or group — no
  // separate "compare two sources" step needed any more.
  const showGroupLesson = Boolean(lesson?.isGroupLesson)
  const individualEffectiveDate = lesson ? (lesson.rescheduledDate ?? lesson.date) : null
  const activeTeacherId = lesson?.teacherId
  const activeEffectiveDate = individualEffectiveDate

  // Reads off the currently-displayed lesson's teacherId (individual or
  // group, whichever is winning above) rather than a separate student-doc
  // field, since this component only ever loads studentId/hasSchedule as
  // props — the lesson subscriptions above already have to run first
  // regardless.
  useEffect(() => {
    if (!activeTeacherId) {
      setVideoCallUrl(null)
      return
    }

    const unsub = subscribeToVideoCallUrl(activeTeacherId, setVideoCallUrl, (error) =>
      console.error("Failed to load video call url:", error),
    )
    return () => unsub()
  }, [activeTeacherId])

  // Client-only availability window (replaces the old server-maintained
  // lesson.videoCallAvailable flag + its every-5-minutes Cloud Function —
  // deliberately simplified: a plain time comparison against the lesson's
  // own effective date, ticking every 30s while mounted, no server round
  // trip). Active from 3 minutes before the lesson through 60 minutes after
  // its start, matching the window the old scheduler used.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(interval)
  }, [])

  const videoCallActive = (() => {
    if (!activeEffectiveDate) return false
    const msUntilStart = activeEffectiveDate.getTime() - now.getTime()
    return msUntilStart <= 3 * 60 * 1000 && msUntilStart >= -60 * 60 * 1000
  })()

  async function handleHomeworkFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingHomework(true)
    setUploadHomeworkError("")

    try {
      const fileUrl = await uploadHomeworkSubmissionFile(file, studentId)
      await submitHomeworkFile(studentId, fileUrl)
    } catch (err) {
      console.error("Failed to submit homework file:", err)
      setUploadHomeworkError(t("nextLesson.homeworkUploadError"))
    } finally {
      setUploadingHomework(false)
      if (homeworkFileInputRef.current) {
        homeworkFileInputRef.current.value = ""
      }
    }
  }

  useEffect(() => {
    const unsubscribe = subscribeToUpcomingLesson(
      studentId,
      (nextLesson) => {
        setLesson(nextLesson)
        if (nextLesson) {
          lastLessonIdRef.current = nextLesson.id
          setCancelledLesson(null)
        }
      },
      (error) => {
        console.error("Failed to load upcoming lesson:", error)
      },
    )

    return unsubscribe
  }, [studentId])

  // subscribeToUpcomingLesson only matches status === "upcoming", so the
  // moment a lesson stops being upcoming it drops out of that query entirely
  // (onData(null)) — whether because it was completed (doc persists with
  // status "completed") or cancelled (confirmCancellation now deletes the
  // doc outright, see core/lessons.js). To actually show "Урок отменён" for
  // that brief window before the next draft lesson appears, the last known
  // lesson id is watched directly: the doc no longer existing is exactly the
  // cancellation case (completion never deletes the doc), until either that
  // resolves or a new upcoming lesson shows up above.
  useEffect(() => {
    if (lesson || !lastLessonIdRef.current) {
      return
    }

    const lessonId = lastLessonIdRef.current
    const unsubscribe = subscribeToLesson(
      studentId,
      lessonId,
      (doc) => {
        setCancelledLesson(doc === null || doc?.status === "cancelled" ? { id: lessonId } : null)
      },
      (error) => {
        console.error("Failed to check cancelled lesson:", error)
      },
    )

    return unsubscribe
  }, [lesson, studentId])

  async function handleConfirmCancellation() {
    if (actionPending || !lesson) return
    setActionPending(true)
    try {
      await confirmCancellation(studentId, lesson.id, "student")
    } catch (err) {
      console.error("Failed to confirm cancellation:", err)
    } finally {
      setActionPending(false)
    }
  }

  async function handleRejectCancellation() {
    if (actionPending || !lesson) return
    setActionPending(true)
    try {
      await rejectCancellation(studentId, lesson.id)
    } catch (err) {
      console.error("Failed to reject cancellation:", err)
    } finally {
      setActionPending(false)
    }
  }

  async function handleConfirmReschedule() {
    if (actionPending || !lesson) return
    setActionPending(true)
    try {
      await confirmReschedule(studentId, lesson.id, "student")
    } catch (err) {
      console.error("Failed to confirm reschedule:", err)
    } finally {
      setActionPending(false)
    }
  }

  async function handleRejectReschedule() {
    if (actionPending || !lesson) return
    setActionPending(true)
    try {
      await cancelReschedule(studentId, lesson.id)
    } catch (err) {
      console.error("Failed to reject reschedule:", err)
    } finally {
      setActionPending(false)
    }
  }

  const showPlaceholder = !hasSchedule || (!lesson && !cancelledLesson)
  const assignment = lesson?.homework.assignment
  const submissionFiles = lesson?.homework.submission.files ?? []
  const lastSubmission = submissionFiles[submissionFiles.length - 1]
  const comment = useHomeworkComment(studentId, lesson?.id ?? null, lesson?.homework.submission.comment)

  return (
    <section aria-labelledby="next-lesson-title" className="glass relative rounded-4xl p-6 sm:p-8">
      {/* zone1 ("kitten") sits beside the greeting, above the card, clear of
          both the "Посмотреть все уроки" link (wider than the header's own
          gear+avatar cluster, so the offset has to clear the wider of the
          two) and the greeting name. Desktop-only now (session 28) — a
          fixed-px offset this large doesn't scale down safely on a narrow
          phone (it was landing on the greeting name there), so mobile gets
          its own header-anchored variant in DashboardHeader instead. */}
      <DecorationZone zone="zone1" className="hidden top-[-104px] right-[230px] sm:block" />
      {/* zone2 ("pretty soul") sits almost entirely inside the card's own
          right edge at "Задание"'s height (session 26 correction — was
          mostly hanging outside the card before). */}
      <DecorationZone zone="zone2" className="top-[42%] right-[8px]" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 font-display text-[0.7rem] font-medium tracking-[0.02em] text-muted-foreground">
            {!cancelledLesson && showGroupLesson
              ? t("nextLesson.groupLabel", { name: lesson.groupName || lesson.subject })
              : t("nextLesson.label")}
            {!showGroupLesson && lesson?.rescheduleStatus === "confirmed" ? (
              <CompactStatusBadge tone="good">{t("nextLesson.rescheduleConfirmed")}</CompactStatusBadge>
            ) : null}
          </p>
          <h2
            id="next-lesson-title"
            className={`font-display mt-2 leading-tight text-balance ${
              showPlaceholder || cancelledLesson ? "text-2xl sm:text-3xl" : "text-3xl sm:text-[2.6rem]"
            } ${cancelledLesson ? "text-destructive" : "text-foreground"}`}
          >
            {cancelledLesson
              ? t("nextLesson.cancelled")
              : showPlaceholder
                ? t("nextLesson.noSchedule")
                : formatLessonDateTime(individualEffectiveDate, timeZone, dateLocale)}
          </h2>
        </div>
        {hasSchedule ? (
          <button
            type="button"
            onClick={() => setAllLessonsOpen(true)}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground sm:text-sm"
          >
            <span className="sm:hidden">{t("nextLesson.allLessonsShort")}</span>
            <span className="hidden sm:inline">{t("nextLesson.allLessonsFull")}</span>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <AllUpcomingLessonsDialog studentId={studentId} open={allLessonsOpen} onOpenChange={setAllLessonsOpen} />

      <div className="mt-5 flex flex-col gap-5">
        {/* Group lessons Phase 4 — reschedule/cancellation status plates and
            the individual-only content block below are all specific to
            `lesson` (this student's own individual lesson doc) and make no
            sense to show when a group lesson is what's actually being
            displayed above (its own reschedule/cancel history isn't
            per-student and isn't surfaced to students at all, by this
            feature's own explicit spec). */}
        {!showGroupLesson && lesson?.rescheduleStatus === "pending_student" ? (
          <StatusPlate tone="warn" title={t("nextLesson.teacherProposesReschedule")}>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground line-through">
                {formatLessonDateTime(lesson.rescheduledDate ?? lesson.date, timeZone, dateLocale)}
              </span>
              <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="font-semibold text-foreground">
                {lesson.rescheduleProposedDate
                  ? formatLessonDateTime(lesson.rescheduleProposedDate, timeZone, dateLocale)
                  : "—"}
              </span>
            </p>
            <StatusPlateActions
              onConfirm={handleConfirmReschedule}
              confirmLabel={t("common.confirm")}
              onReject={handleRejectReschedule}
              rejectLabel={t("common.reject")}
              disabled={actionPending}
            />
          </StatusPlate>
        ) : null}

        {!showGroupLesson && lesson?.rescheduleStatus === "pending_teacher" ? (
          <StatusPlate tone="warn" title={t("nextLesson.rescheduleRequestSent")}>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground line-through">
                {formatLessonDateTime(lesson.rescheduledDate ?? lesson.date, timeZone, dateLocale)}
              </span>
              <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="font-semibold text-foreground">
                {lesson.rescheduleProposedDate
                  ? formatLessonDateTime(lesson.rescheduleProposedDate, timeZone, dateLocale)
                  : "—"}
              </span>
            </p>
          </StatusPlate>
        ) : null}

        {!showGroupLesson && lesson?.cancellationStatus === "pending_student" ? (
          <StatusPlate tone="bad" title={t("nextLesson.teacherProposesCancellation")}>
            <StatusPlateActions
              onConfirm={handleConfirmCancellation}
              confirmLabel={t("nextLesson.confirmCancellation")}
              onReject={handleRejectCancellation}
              rejectLabel={t("common.reject")}
              disabled={actionPending}
            />
          </StatusPlate>
        ) : null}

        {!showGroupLesson && lesson?.cancellationStatus === "pending_teacher" ? (
          <StatusPlate tone="bad" title={t("nextLesson.cancellationRequestSent")} />
        ) : null}

        {lesson ? (
          <>
            {videoCallUrl ? (
              <div className="glass-inset grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-3xl p-5">
                <div className="min-w-0">
                  <p className="font-display text-[0.7rem] font-medium tracking-[0.02em] text-muted-foreground">
                    {t("nextLesson.videoCall")}
                  </p>
                  <p className="mt-1 text-sm break-words text-secondary-foreground">
                    {videoCallActive ? t("nextLesson.videoCallActive") : t("nextLesson.videoCallAvailableSoon")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openExternalLink(videoCallUrl)}
                  disabled={!videoCallActive}
                  className="inline-flex shrink-0 items-center gap-2 rounded-full px-5 py-3 text-sm font-medium text-destructive-foreground transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                  style={{ background: "var(--gradient-warm)", boxShadow: "var(--shadow-soft)" }}
                >
                  <Video className="h-4 w-4" aria-hidden="true" />
                  {t("nextLesson.videoCallJoin")}
                </button>
              </div>
            ) : null}

            <div className="glass-inset rounded-3xl p-5">
              <TopicAndAssignment topic={lesson?.topic} assignmentText={assignment?.text} />
              {assignment?.files.length > 0 ? (
                <ul className="mt-1.5 flex flex-col gap-1">
                  {assignment.files.map((file, index) => (
                    <li key={`${file.url}-${index}`}>
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 text-sm font-semibold text-foreground underline underline-offset-2"
                      >
                        <Paperclip className="size-3.5 shrink-0" aria-hidden="true" />
                        <span className="truncate">{file.title}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="glass-inset rounded-3xl p-5">
              <span className="font-display text-[0.7rem] font-medium tracking-[0.02em] text-muted-foreground">
                {t("nextLesson.myHomework")}
              </span>
              {submissionFiles.length === 0 ? (
                <p className="mt-1.5 text-sm text-secondary-foreground">{t("nextLesson.homeworkNotSubmitted")}</p>
              ) : (
                <>
                  <p className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-secondary-foreground">
                    <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
                    {t("nextLesson.homeworkReceived")}
                    {lastSubmission?.submittedAt ? (
                      <span className="font-normal text-muted-foreground">
                        ({formatLessonDateTime(lastSubmission.submittedAt, timeZone, dateLocale)})
                      </span>
                    ) : null}
                  </p>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {submissionFiles.map((file, index) => (
                      <li key={`${file.url}-${index}`}>
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 text-sm text-foreground underline underline-offset-2"
                        >
                          <Paperclip className="size-3.5 shrink-0" aria-hidden="true" />
                          <span className="truncate">
                            {t("nextLesson.fileLabel", { index: index + 1 })}
                            {file.submittedAt
                              ? ` (${formatLessonDateTime(file.submittedAt, timeZone, dateLocale)})`
                              : ""}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {!comment.open && lesson?.homework.submission.comment ? (
                <p className="glass-tile mt-2.5 rounded-xl px-3 py-2 text-sm text-secondary-foreground">
                  {lesson.homework.submission.comment}
                </p>
              ) : null}

              <HomeworkCommentForm comment={comment} />

              {!comment.open ? (
                <>
                  <input
                    ref={homeworkFileInputRef}
                    type="file"
                    onChange={handleHomeworkFileChange}
                    disabled={uploadingHomework}
                    className="hidden"
                  />
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={uploadingHomework}
                      onClick={() => homeworkFileInputRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm text-ink-foreground transition-transform hover:scale-[1.02] disabled:opacity-50"
                    >
                      {uploadingHomework ? (
                        <>
                          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                          {t("nextLesson.uploading")}
                        </>
                      ) : (
                        <>
                          <Paperclip className="size-4" aria-hidden="true" />
                          {t("nextLesson.attachHomework")}
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={comment.startEditing}
                      className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/45 px-4 py-2 text-sm font-medium text-secondary-foreground backdrop-blur-md transition-colors hover:bg-white/70"
                    >
                      <MessageSquarePlus className="size-4" aria-hidden="true" />
                      {lesson?.homework.submission.comment ? t("nextLesson.editComment") : t("nextLesson.addComment")}
                    </button>
                  </div>
                </>
              ) : null}
              {uploadHomeworkError ? (
                <p className="mt-1.5 text-xs font-semibold text-destructive">{uploadHomeworkError}</p>
              ) : null}
              <p className="mt-3 text-xs text-muted-foreground">{t("nextLesson.orSendViaBot")}</p>
            </div>

            {/* A group lesson's reschedule/cancel is the teacher's decision
                alone, applied to the whole group at once (see
                core/groups.js) — not something one student can propose for
                just their own copy, so these buttons don't apply to it. */}
            {lesson.isGroupLesson ? (
              <p className="text-xs text-muted-foreground">{t("nextLesson.groupNoActions")}</p>
            ) : lesson.rescheduleStatus !== "pending_teacher" || lesson.cancellationStatus !== "pending_teacher" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {lesson.rescheduleStatus !== "pending_teacher" ? (
                  <button
                    type="button"
                    onClick={() => setRescheduleDialogOpen(true)}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-white/60 bg-white/45 px-5 py-3 text-sm font-medium text-secondary-foreground backdrop-blur-md transition-colors hover:bg-white/70"
                  >
                    <CalendarClock className="h-4 w-4" />
                    {t("nextLesson.rescheduleButton")}
                  </button>
                ) : null}
                {lesson.cancellationStatus !== "pending_teacher" ? (
                  <button
                    type="button"
                    onClick={() => setCancelDialogOpen(true)}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-white/60 bg-white/45 px-5 py-3 text-sm font-medium text-secondary-foreground backdrop-blur-md transition-colors hover:bg-white/70"
                  >
                    <X className="h-4 w-4" />
                    {t("nextLesson.cancelButton")}
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {lesson && !lesson.isGroupLesson ? (
        <>
          <ProposeRescheduleDialog
            studentId={studentId}
            lessonId={lesson.id}
            initialDate={lesson.rescheduledDate ?? lesson.date}
            open={rescheduleDialogOpen}
            onOpenChange={setRescheduleDialogOpen}
          />

          <ProposeCancelDialog
            studentId={studentId}
            lessonId={lesson.id}
            lessonDate={lesson.rescheduledDate ?? lesson.date}
            open={cancelDialogOpen}
            onOpenChange={setCancelDialogOpen}
          />
        </>
      ) : null}
    </section>
  )
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

function toJsDate(value) {
  return value?.toDate?.() ?? value ?? null
}

function formatShortDate(value, timeZone, locale = "ru-RU") {
  const date = toJsDate(value)
  if (!date) return ""
  return date.toLocaleDateString(locale, { timeZone, day: "numeric", month: "long" })
}

// Local (not UTC) YYYY-MM-DD for a controlled <input type="date"> value —
// toISOString() would shift the date by a day for some timezones since it
// normalizes to UTC first, which a plain calendar date (exam day, no
// meaningful time component) should never do.
function toDateInputValue(value) {
  const date = toJsDate(value)
  if (!date) return ""
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function pluralizeTopics(n, lang = "ru") {
  if (lang === "en") return n === 1 ? "topic" : "topics"
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return "тема"
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "темы"
  return "тем"
}

function CurriculumProgressBar({ icon: Icon, label, done, total }) {
  const percent = total > 0 ? (done / total) * 100 : 0
  return (
    <div className="glass-inset rounded-3xl p-4">
      <div className="flex items-center gap-2.5">
        <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
        <span className="text-sm text-secondary-foreground">{label}</span>
        <span className="ml-auto text-sm">
          <b className="font-display">{done}</b>
          <span className="text-muted-foreground"> / {total}</span>
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/55">
        <div className="h-full rounded-full" style={{ width: `${percent}%`, background: "var(--gradient-warm)" }} />
      </div>
    </div>
  )
}

// Pure display of already-accumulated progress — no write path here (that's
// the teacher marking topics covered during lesson completion). Hidden
// entirely for students with no program assigned (no curriculumProgress
// doc), never shown as "0%". Visual container migrated to the mockup's
// ProgressCard.tsx; the mockup's own motivational tile computes a
// "paceMultiplier" stat this app has no logic for, so per instruction that
// slot instead holds this app's own existing "на этой неделе" line/logic,
// unchanged.
// progress is now lifted to StudentDashboardContent (Phase 3) — ExamRadar
// needs the exact same curriculumProgress subscription to decide which of
// the two cards to render at all, so a second independent listener here
// would be redundant. `null` while the parent's own subscription hasn't
// resolved yet, same as before.
function CurriculumProgressCard({ progress, subjectLabel }) {
  const { t, i18n } = useTranslation("student")
  const [expanded, setExpanded] = useState(false)

  if (!progress) return null

  const coveredTopics = progress.topics.filter((topic) => topic.covered)
  const remainingTopics = progress.topics.filter((topic) => !topic.covered)
  const totalTopics = progress.topics.length

  const coveredPrototypes = progress.prototypes.filter((prototype) => prototype.covered)
  const remainingPrototypes = progress.prototypes.filter((prototype) => !prototype.covered)
  const totalPrototypes = progress.prototypes.length

  const totalProgressItems = totalTopics + totalPrototypes
  const coveredProgressItems = coveredTopics.length + coveredPrototypes.length
  const overallPercent = totalProgressItems > 0 ? Math.round((coveredProgressItems / totalProgressItems) * 100) : 0

  const needsReviewItems = [...coveredTopics, ...coveredPrototypes].filter((item) => item.needsReview)

  const weekAgo = Date.now() - SEVEN_DAYS_MS
  const coveredThisWeek = coveredTopics.filter((topic) => {
    const date = toJsDate(topic.coveredAt)
    return date && date.getTime() >= weekAgo
  }).length

  return (
    <section className="glass-soft rounded-4xl p-6 sm:p-7">
      <div className="flex items-center gap-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-primary-foreground"
          style={{ background: "var(--gradient-warm)" }}
        >
          <TrendingUp className="h-5 w-5" aria-hidden="true" />
        </span>
        <h3 className="font-display text-lg text-foreground">
          {subjectLabel ? t("progress.titleWithSubject", { subject: subjectLabel }) : t("progress.title")}
        </h3>
        <span className="ml-auto font-display text-2xl text-primary">{overallPercent}%</span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <CurriculumProgressBar icon={BookOpen} label={t("progress.topics")} done={coveredTopics.length} total={totalTopics} />
        {totalPrototypes > 0 ? (
          <CurriculumProgressBar
            icon={Layers}
            label={t("progress.prototypeTypes")}
            done={coveredPrototypes.length}
            total={totalPrototypes}
          />
        ) : null}
      </div>

      {needsReviewItems.length > 0 ? (
        <div className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-400">
          <span className="font-semibold">{t("progress.needsReview")}</span>
          {needsReviewItems
            .slice(0, 3)
            .map((item) => item.title)
            .join(", ")}
          {needsReviewItems.length > 3 ? t("progress.andMore", { count: needsReviewItems.length - 3 }) : ""}
        </div>
      ) : null}

      {coveredThisWeek > 0 ? (
        <div className="glass-inset mt-3 flex items-start gap-3 rounded-3xl p-4">
          <Flame className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-sm text-secondary-foreground">
            {t("progress.coveredThisWeek", {
              count: coveredThisWeek,
              word: pluralizeTopics(coveredThisWeek, i18n.language),
            })}
          </p>
        </div>
      ) : null}

      {expanded ? (
        <div className={`mt-4 grid gap-6 ${totalPrototypes > 0 ? "sm:grid-cols-2" : "grid-cols-1"}`}>
          <CurriculumItemGroups icon={BookOpen} title={t("progress.topics")} covered={coveredTopics} remaining={remainingTopics} />
          {totalPrototypes > 0 ? (
            <CurriculumItemGroups
              icon={Layers}
              title={t("progress.prototypes")}
              covered={coveredPrototypes}
              remaining={remainingPrototypes}
            />
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary"
      >
        {expanded ? t("common.collapse") : t("common.expand")}
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
    </section>
  )
}

function AllNotificationsDialog({ notifications, open, onOpenChange, onNotificationClick }) {
  const { t } = useTranslation("student")
  return (
    <GlassDialog open={open} onOpenChange={onOpenChange}>
      <GlassDialogContent>
        <GlassDialogTitle>{t("notifications.allDialogTitle")}</GlassDialogTitle>
        <GlassDialogDescription>
          {t("notifications.allDialogDescription", { count: notifications.length })}
        </GlassDialogDescription>

        <div className="scrollbar-hidden mt-6 max-h-[60vh] overflow-y-auto">
          <NotificationsList
            notifications={notifications}
            onNotificationClick={onNotificationClick}
            glass
            enableProposalActions
          />
        </div>
      </GlassDialogContent>
    </GlassDialog>
  )
}

function StudentNotifications({ studentId }) {
  const { t, i18n } = useTranslation("student")
  const timeZone = useTimeZone()
  const dateLocale = useDateLocale()
  const [notifications, setNotifications] = useState([])
  const [allOpen, setAllOpen] = useState(false)
  const hasUnread = notifications.some((notification) => !notification.read)
  // `params` present means this is a new-style, bilingual notification —
  // render it via buildNotificationText in the student's current language.
  // A notification created before this feature has `params: null` and only
  // ever had a pre-built Russian `text` — shown as-is, no migration, per
  // spec ("старые уведомления... не делаем миграцию существующих данных").
  const displayNotifications = notifications.map((notification) =>
    notification.params
      ? { ...notification, text: buildNotificationText(notification.type, notification.params, i18n.language) }
      : notification,
  )
  const lastNotification = displayNotifications[0] ?? null

  useEffect(() => {
    const unsubscribe = subscribeToStudentNotifications(studentId, setNotifications, (firestoreError) => {
      console.error("Failed to load notifications:", firestoreError)
    })

    return unsubscribe
  }, [studentId])

  async function handleNotificationClick(notification) {
    if (!notification.read) {
      try {
        await markNotificationRead(notification.id)
      } catch (err) {
        console.error("Failed to mark notification read:", err)
      }
    }
  }

  return (
    <section className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 rounded-4xl bg-ink px-6 py-5 text-ink-foreground shadow-[var(--shadow-soft)]">
      <Clock className="h-5 w-5 shrink-0 opacity-70" aria-hidden="true" />

      {lastNotification ? (
        <button
          type="button"
          onClick={() => handleNotificationClick(lastNotification)}
          className="flex min-w-0 flex-col gap-0.5 text-left"
        >
          <span className={`text-sm leading-relaxed ${lastNotification.read ? "opacity-90" : ""}`}>
            {lastNotification.text}
          </span>
          <span className="text-xs opacity-50">
            {formatRelativeTime(lastNotification.createdAt, timeZone, dateLocale)}
          </span>
        </button>
      ) : (
        <span className="min-w-0 text-sm text-ink-foreground/60">{t("notifications.empty")}</span>
      )}

      <button
        type="button"
        onClick={() => setAllOpen(true)}
        className="relative inline-flex shrink-0 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs"
      >
        <Bell className="h-3.5 w-3.5" aria-hidden="true" />
        {t("notifications.all")}
        {hasUnread ? (
          <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-primary" />
        ) : null}
      </button>

      <AllNotificationsDialog
        notifications={displayNotifications}
        open={allOpen}
        onOpenChange={setAllOpen}
        onNotificationClick={handleNotificationClick}
      />
    </section>
  )
}

function getAuthKey(studentId) {
  return `auth_${studentId}`
}

function getFirstName(fullName) {
  return fullName.trim().split(/\s+/)[0] || fullName
}

function getInitial(name) {
  return name.trim().charAt(0).toUpperCase() || "?"
}

function StudentDashboardContent({ studentId }) {
  const { t, i18n } = useTranslation("student")
  usePageTitle(t("page.title"))
  const [student, setStudent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lessons, setLessons] = useState([])
  const [lessonsLoading, setLessonsLoading] = useState(true)
  const [lessonsError, setLessonsError] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    const unsubscribe = subscribeToStudent(
      studentId,
      (data) => {
        setStudent(data)
        setLoading(false)
      },
      (firestoreError) => {
        console.error("Failed to load student:", firestoreError)
        setError(t("page.loadStudentError"))
        setLoading(false)
      },
    )

    return unsubscribe
  }, [studentId])

  // Authoritative sync once the live student doc has loaded — the initial
  // language is already applied pre-auth by StudentI18nGate (a one-time
  // read, needed since the PIN screen renders before this component ever
  // mounts), this just keeps it correct if the Firestore value ever changes
  // while the dashboard stays open.
  useEffect(() => {
    if (student) {
      studentI18n.changeLanguage(student.language || "ru")
    }
  }, [student])

  useEffect(() => {
    const unsub = subscribeToLessons(
      studentId,
      (data) => {
        setLessons(data)
        setLessonsLoading(false)
      },
      (fetchError) => {
        console.error("Failed to load lessons:", fetchError)
        setLessonsError(t("history.loadError"))
        setLessonsLoading(false)
      },
    )

    return () => unsub()
  }, [studentId])

  // Block 4 — a student can have several programs at once (one per
  // subject); each renders its own goal/radar/progress block independently
  // below (MyGoalsSection + the per-program map further down), replacing
  // the old single curriculumProgress/main subscription.
  const [programs, setPrograms] = useState([])

  useEffect(() => {
    const unsubscribe = subscribeToPrograms(studentId, setPrograms, (error) =>
      console.error("Failed to load programs:", error),
    )
    return () => unsubscribe()
  }, [studentId])

  // Resolves each program's examTypeId against the owning teacher's own
  // examTypes list (GoalCard/ExamRadar need scaleType/scaleMin/scaleMax/
  // scaleUnitLabel, not just a name). student.teacherId is the denormalized
  // field mapStudentDoc exposes for exactly this.
  const [examTypes, setExamTypes] = useState([])

  useEffect(() => {
    if (!student?.teacherId) {
      setExamTypes([])
      return
    }
    const unsubscribe = subscribeToExamTypes(student.teacherId, setExamTypes, (error) =>
      console.error("Failed to load exam types:", error),
    )
    return unsubscribe
  }, [student?.teacherId])

  // A student who's never opened Settings has no `timezone` saved — the
  // on-site display already falls back to the device's own detected zone
  // (resolveTimeZone below), but a bot reminder is built server-side with no
  // access to that device, so it fell back to a hardcoded Moscow default
  // instead and could show the wrong local time. Persisting the detected
  // zone the first time it's known keeps the site and every future bot
  // message reading the same value from here on, without requiring the
  // student to visit Settings first.
  useEffect(() => {
    if (!student || student.timezone) return
    updateStudentSettings(studentId, {
      timezone: getDeviceTimeZone(),
      colorTheme: student.colorTheme ?? "amber",
      language: student.language ?? "ru",
    }).catch((err) => console.error("Failed to persist detected timezone:", err))
  }, [studentId, student])

  if (loading) {
    return <Spinner label={t("page.loadingStudent")} />
  }

  if (error) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-3 py-16 text-center">
        <p className="text-lg font-semibold text-destructive">{error}</p>
      </div>
    )
  }

  if (!student) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-3 py-16 text-center">
        <p className="text-lg font-semibold text-foreground">{t("page.studentNotFound")}</p>
      </div>
    )
  }

  const firstName = getFirstName(student.name)

  // A completed group lesson is a real entry in `lessons` now (see
  // core/groups.js) — this student's own attendance/homeworkDone/rating
  // already live directly on their own mirror doc, not nested under a
  // group-wide attendees map, so it needs no separate unwrap/merge step;
  // it sorts into history and MaterialsLibrary the same way any individual
  // lesson does.
  const mergedLessonHistory = lessons
    .filter((lesson) => lesson.status !== "upcoming")
    .sort((a, b) => (b.date?.getTime?.() ?? 0) - (a.date?.getTime?.() ?? 0))

  // Includes upcoming lessons too (not just completed ones) — a teacher can
  // attach an assignment file while still preparing a lesson, and the
  // student should see it in Materials right away, not only once the lesson
  // is marked complete. The underlying live `lessons` subscription already
  // updates this automatically if the teacher later detaches the file.
  const completedMaterials = lessons
    .flatMap((lesson) =>
      [...(lesson.materials || []), ...(lesson.homework?.assignment?.files || [])].map((material) => ({
        ...material,
        lessonDate: lesson.date,
      })),
    )

  const seenMaterialUrls = new Set()
  const dedupedMaterials = completedMaterials
    .slice()
    .sort((a, b) => (b.lessonDate?.getTime?.() ?? 0) - (a.lessonDate?.getTime?.() ?? 0))
    .filter((material) => {
      if (seenMaterialUrls.has(material.url)) return false
      seenMaterialUrls.add(material.url)
      return true
    })

  const allMaterials = dedupedMaterials

  // Gates whether a manually-toggled (not lesson-completion) covered item
  // can count toward ExamRadar's pace — see computeRadarMetrics' own
  // comment for why fewer than 2 real lessons isn't enough of a track
  // record to trust yet.
  const completedLessonsCount = lessons.filter(
    (lesson) => lesson.status === "completed" || !lesson.status,
  ).length

  const examTypesById = Object.fromEntries(examTypes.map((type) => [type.id, type]))

  // Block 4 Phase 3 — per-program toggle: a program with both
  // targetScore/examDate filled gets its own independent ExamRadar block
  // (its own computeRadarMetrics call, its own topics/prototypes/
  // assignedAt); every other program (scaleType "none", or a real scale
  // but no goal filled in yet) gets the plain progress card instead. Both
  // kinds can be present at once for the same student.
  const programBlocks = programs.map((program) => {
    const hasGoal = program.targetScore != null && program.examDate != null
    const metrics = hasGoal
      ? computeRadarMetrics({
          examDate: program.examDate,
          targetScore: program.targetScore,
          topics: program.topics,
          prototypes: program.prototypes,
          assignedAt: program.assignedAt,
          completedLessonsCount,
        })
      : null
    return {
      program,
      examType: examTypesById[program.examTypeId] ?? null,
      hasGoal,
      metrics,
      requiredTopics: requiredItems(program.topics, program.targetScore),
      requiredPrototypes: requiredItems(program.prototypes, program.targetScore),
      staleDays: daysSinceLastUpdate(program.topics, program.prototypes),
    }
  })

  // zone4/zone5 only ever belong on an ExamRadar card (session 26 —
  // previously they could land on a plain CurriculumProgressCard whenever
  // that happened to be the first program in the list, which the user
  // explicitly didn't want) — so this has to be "the first program that
  // actually renders ExamRadar," not just index 0 of programBlocks.
  const firstExamRadarIndex = programBlocks.findIndex((block) => block.hasGoal && block.metrics)

  // Theme registry (src/lib/themes.js) — same registry/mechanism
  // TeacherDashboard.jsx uses, per the "one theme system for both roles"
  // decision. Defaults to "amber" (this page's pre-existing native look) if
  // the student hasn't picked one yet.
  const themeClass = `${getThemeById(student.colorTheme ?? "amber").cssClassName} themed`
  const resolvedTimeZone = resolveTimeZone(student.timezone)

  return (
    <UserPrefsProvider timeZone={resolvedTimeZone} themeClass={themeClass}>
    <GamificationProvider studentId={studentId}>
    <div className={`relative mx-auto flex w-full max-w-3xl flex-col gap-5 px-5 py-10 sm:py-14 ${themeClass}`}>
      {/* Re-mounted here (inside the themed root), on top of the outer
          StudentDashboard()'s own pre-theme-knowledge instance — this one
          is a real descendant of `.themed`/the theme's own cssClassName, so
          its --theme-bg-image var resolves to the student's actually-chosen
          theme's photo instead of the fallback. */}
      <StudentGrainBackground themeId={student.colorTheme ?? "amber"} />
      <DashboardHeader
        t={t}
        firstName={firstName}
        initial={getInitial(firstName)}
        onSettingsClick={() => setSettingsOpen(true)}
      />

      <StudentSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        timezone={student.timezone ?? ""}
        colorTheme={student.colorTheme ?? "amber"}
        language={student.language ?? "ru"}
        onSave={(values) => updateStudentSettings(studentId, values)}
      />

      <NextLessonPlate studentId={studentId} hasSchedule={Boolean(student.scheduleSlots?.length)} />

      <StudentNotifications studentId={studentId} />

      <MyGoalsSection studentId={studentId} programs={programs} examTypesById={examTypesById} />

      {programBlocks.map(({ program, examType, hasGoal, metrics, requiredTopics, requiredPrototypes, staleDays }, index) => (
        <div key={program.id}>
          {hasGoal && metrics ? (
            <ExamRadar
              subject={program.subject}
              examTypeName={examType?.name ?? "—"}
              scaleType={examType?.scaleType}
              scaleUnitLabel={examType?.scaleUnitLabel}
              scaleLabels={examType?.scaleLabels}
              targetScore={program.targetScore}
              metrics={metrics}
              requiredTopics={requiredTopics}
              requiredPrototypes={requiredPrototypes}
              staleDays={staleDays}
              showDecoration={index === firstExamRadarIndex}
            />
          ) : (
            <CurriculumProgressCard
              progress={program}
              subjectLabel={program.name}
            />
          )}
        </div>
      ))}

      <MaterialsLibrary materials={allMaterials} loading={lessonsLoading} error={lessonsError} />

      <StudentFinanceSection studentId={studentId} paidLessonsBalance={student.paidLessonsBalance} />

      <StickerWorkshopButton studentId={studentId} coinsBalance={student.coinsBalance} />

      <LessonHistory
        studentId={studentId}
        lessons={mergedLessonHistory}
        loading={lessonsLoading}
        error={lessonsError}
      />
    </div>
    </GamificationProvider>
    </UserPrefsProvider>
  )
}

function StudentGate({ studentId }) {
  const { t } = useTranslation("student")
  const [searchParams] = useSearchParams()
  const skipPinRequested = searchParams.get("skipPin") === "true"

  const [authorized, setAuthorized] = useState(
    () => localStorage.getItem(getAuthKey(studentId)) != null,
  )
  const [checkingSkipPin, setCheckingSkipPin] = useState(skipPinRequested)

  // skipPin=true alone proves nothing — anyone can type it into a plain
  // browser URL. The actual trust signal is the Telegram WebApp's own
  // initDataUnsafe.user.id genuinely matching this student's stored
  // telegramChatId; only then is the PIN screen skipped, and even then
  // only after confirming it against Firestore, never trusting the URL by
  // itself.
  useEffect(() => {
    if (!skipPinRequested || authorized) {
      setCheckingSkipPin(false)
      return
    }

    const telegramUserId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id ?? null
    if (!telegramUserId) {
      setCheckingSkipPin(false)
      return
    }

    let cancelled = false

    getStudentTelegramChatId(studentId)
      .then((telegramChatId) => {
        if (cancelled) return
        if (telegramChatId && telegramChatId === String(telegramUserId)) {
          localStorage.setItem(getAuthKey(studentId), "true")
          setAuthorized(true)
        }
      })
      .catch((error) => console.error("Failed to verify Telegram identity for skipPin:", error))
      .finally(() => {
        if (!cancelled) setCheckingSkipPin(false)
      })

    return () => {
      cancelled = true
    }
  }, [studentId, skipPinRequested, authorized])

  if (checkingSkipPin) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-4">
        <Spinner label={t("page.checkingLogin")} />
      </main>
    )
  }

  if (!authorized) {
    return (
      <LoginScreen
        studentId={studentId}
        onSuccess={() => setAuthorized(true)}
      />
    )
  }

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* Pre-theme-knowledge fallback: this component's student.colorTheme
          isn't loaded yet at this level (StudentDashboardContent fetches it
          below) — renders the CSS var's own url('/bg/gr21.jpg') fallback.
          StudentDashboardContent re-mounts a second instance once it knows
          the real theme, which paints over this one entirely (both are
          fixed inset-0). */}
      <StudentGrainBackground />
      <StudentDashboardContent studentId={studentId} />
    </main>
  )
}

// Fetches students/{id}.language once (before authorization — the PIN
// login screen itself needs to render in the student's language) and
// applies it to studentI18n, then wraps everything StudentDashboard renders
// in an I18nextProvider bound to that instance. Blocks rendering briefly
// (returns null) rather than flashing Russian then re-rendering in English,
// same "resolve first, then render" shape used elsewhere (e.g.
// StudentGate's own checkingSkipPin).
function StudentI18nGate({ studentId, children }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    setReady(false)
    getStudentLanguage(studentId)
      .then((language) => studentI18n.changeLanguage(language || "ru"))
      .catch((error) => console.error("Failed to resolve student language:", error))
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [studentId])

  if (!ready) return null

  return <I18nextProvider i18n={studentI18n}>{children}</I18nextProvider>
}

export function StudentDashboard() {
  const { studentId } = useParams()

  if (!studentId) {
    return (
      <main className="min-h-screen bg-background px-4 py-8 sm:px-6">
        <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-3 py-16 text-center">
          <p className="text-lg font-semibold text-foreground">Ученик не найден</p>
        </div>
      </main>
    )
  }

  return (
    <StudentI18nGate studentId={studentId}>
      <StudentGate key={studentId} studentId={studentId} />
    </StudentI18nGate>
  )
}
