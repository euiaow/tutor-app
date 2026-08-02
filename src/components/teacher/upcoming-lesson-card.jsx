import { useState } from "react"
import { ArrowRight, CalendarClock, Check, CircleSlash, Clock, FileText, X } from "lucide-react"
import { HomeworkLessonDialog } from "@/components/teacher/homework-lesson-dialog"
import { ContactIconButton } from "@/components/teacher/contact-button"
import { StudentTags } from "@/components/student-tags"
import {
  GhostBtn,
  SolidBtn,
  StudentDot,
  TeacherCancelBtn,
  TeacherDialog,
  TeacherDialogContent,
  TeacherDialogDescription,
  TeacherDialogTitle,
  TeacherStatusBadge,
  teacherInputCls,
} from "@/components/teacher/theme-ui"
import {
  cancelLessonDirectly,
  cancelReschedule,
  confirmCancellation,
  confirmReschedule,
  proposeCancellation,
  proposeReschedule,
  rejectCancellation,
} from "@/firebase/lessons"
import { formatLessonDateTime } from "@/lib/schedule"

// Shared by TeacherDashboard.jsx's "Ближайшие уроки" (all students) and
// student-row.jsx's UpcomingLessonsListDialog (one student's next few weeks)
// — moved out of TeacherDashboard.jsx so both can reuse the exact same row/
// dialog logic instead of two copies drifting apart.

// datetime-local inputs want "YYYY-MM-DDTHH:mm" in the device's local
// timezone, not UTC — offsetting by getTimezoneOffset() before calling
// toISOString() (which is always UTC) gets that local wall-clock string.
function toDatetimeLocal(date) {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function formatRescheduleDate(date) {
  if (!date) return ""
  return date.toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// The dialog is remounted (via a `key` on its usage below) every time it
// opens, so these lazy initial values — computed once per mount — pick up
// the lesson's current date fresh each time, without needing an effect to
// resync state that React already owns.
export function RescheduleDialog({ studentId, lessonId, initialDate, open, onOpenChange }) {
  const [initialDatePart, initialTimePart] = initialDate
    ? toDatetimeLocal(initialDate).split("T")
    : ["", ""]
  const [date, setDate] = useState(initialDatePart)
  const [time, setTime] = useState(initialTimePart)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

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
      const proposedDate = new Date(`${date}T${time}:00`)
      await proposeReschedule(studentId, lessonId, proposedDate)
      handleOpenChange(false)
    } catch (err) {
      console.error("Failed to propose reschedule:", err)
      setError(err?.message || "Не удалось отправить запрос на перенос")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <TeacherDialog open={open} onOpenChange={handleOpenChange}>
      <TeacherDialogContent>
        <TeacherDialogTitle>Предложить перенос</TeacherDialogTitle>
        <TeacherDialogDescription>Выберите новую дату и время урока для ученика</TeacherDialogDescription>

        <form className="mt-5 flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={submitting}
              className={teacherInputCls}
            />
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
            {submitting ? "Отправляем..." : "Отправить запрос ученику"}
          </SolidBtn>
        </form>
      </TeacherDialogContent>
    </TeacherDialog>
  )
}

export function CancelLessonDialog({ studentId, lessonId, lessonDate, open, onOpenChange }) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [cancelDirectly, setCancelDirectly] = useState(false)

  function handleOpenChange(nextOpen) {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      setError("")
      setCancelDirectly(false)
    }
  }

  async function handleConfirm() {
    if (submitting) return
    setSubmitting(true)
    setError("")
    try {
      if (cancelDirectly) {
        await cancelLessonDirectly(studentId, lessonId)
      } else {
        await proposeCancellation(studentId, lessonId)
      }
      handleOpenChange(false)
    } catch (err) {
      console.error("Failed to cancel lesson:", err)
      setError(err?.message || "Не удалось отменить урок")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <TeacherDialog open={open} onOpenChange={handleOpenChange}>
      <TeacherDialogContent>
        <TeacherDialogTitle>Отменить урок</TeacherDialogTitle>
        <TeacherDialogDescription>
          {cancelDirectly
            ? `Урок${lessonDate ? ` ${formatRescheduleDate(lessonDate)}` : ""} будет отменён сразу, без запроса подтверждения у ученика.`
            : `Вы уверены, что хотите предложить отменить урок${lessonDate ? ` ${formatRescheduleDate(lessonDate)}` : ""}?`}
        </TeacherDialogDescription>

        <label className="mt-4 flex items-start gap-2.5 text-sm text-ink">
          <input
            type="checkbox"
            checked={cancelDirectly}
            onChange={(e) => setCancelDirectly(e.target.checked)}
            disabled={submitting}
            className="mt-0.5 size-5 shrink-0 rounded-md border-2 border-glass-border accent-primary disabled:opacity-50"
          />
          Отменить сразу, без подтверждения ученика
        </label>

        {error ? <p className="mt-2 text-sm font-semibold text-destructive">{error}</p> : null}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <TeacherCancelBtn onClick={() => handleOpenChange(false)} disabled={submitting}>
            Назад
          </TeacherCancelBtn>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="rounded-full bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Отменяем..." : "Да, отменить"}
          </button>
        </div>
      </TeacherDialogContent>
    </TeacherDialog>
  )
}

export function UpcomingLessonCard({ lesson, studentName, student }) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [rescheduleActionPending, setRescheduleActionPending] = useState(false)
  const [cancellationActionPending, setCancellationActionPending] = useState(false)

  const isCancelled = lesson.status === "cancelled"

  const hasAssignment =
    lesson.homework.assignment.text.trim() !== "" || lesson.homework.assignment.files.length > 0
  const hasSubmission = lesson.homework.submission.files.length > 0

  // Шаг 2, правило 1: когда инициатива по переносу/отмене исходит от
  // ученика (pending_teacher), обычные кнопки скрываются — остаются только
  // Подтвердить/Отклонить/Подробнее. Во всех остальных состояниях
  // (pending_student, confirmed, "доп.", без статуса) полный набор кнопок
  // сохраняется как раньше.
  const studentAsksReschedule = lesson.rescheduleStatus === "pending_teacher"
  const studentAsksCancel = lesson.cancellationStatus === "pending_teacher"
  const studentInitiated = studentAsksReschedule || studentAsksCancel

  async function handleConfirmReschedule() {
    if (rescheduleActionPending) return
    setRescheduleActionPending(true)
    try {
      await confirmReschedule(lesson.studentId, lesson.id)
    } catch (err) {
      console.error("Failed to confirm reschedule:", err)
    } finally {
      setRescheduleActionPending(false)
    }
  }

  async function handleCancelReschedule() {
    if (rescheduleActionPending) return
    setRescheduleActionPending(true)
    try {
      await cancelReschedule(lesson.studentId, lesson.id)
    } catch (err) {
      console.error("Failed to cancel reschedule:", err)
    } finally {
      setRescheduleActionPending(false)
    }
  }

  async function handleConfirmCancellation() {
    if (cancellationActionPending) return
    setCancellationActionPending(true)
    try {
      await confirmCancellation(lesson.studentId, lesson.id, "teacher")
    } catch (err) {
      console.error("Failed to confirm cancellation:", err)
    } finally {
      setCancellationActionPending(false)
    }
  }

  async function handleRejectCancellation() {
    if (cancellationActionPending) return
    setCancellationActionPending(true)
    try {
      await rejectCancellation(lesson.studentId, lesson.id)
    } catch (err) {
      console.error("Failed to reject cancellation:", err)
    } finally {
      setCancellationActionPending(false)
    }
  }

  // Whole row is clickable and opens the lesson card ("Подробнее" removed
  // as a separate button) — every real action button inside stops
  // propagation so it doesn't also trigger the row's own click.
  function stop(e) {
    e.stopPropagation()
  }

  // The dialogs below are rendered as siblings of the row's <li> (inside
  // the same fragment), not as its children — even though they're portaled
  // out of the DOM visually, React's synthetic events still bubble along
  // the COMPONENT tree, so a click inside a nested dialog would otherwise
  // also trigger the row's own onClick and reopen HomeworkLessonDialog on
  // top of whatever dialog was just used.
  return (
    <>
    <li
      role="button"
      tabIndex={0}
      onClick={() => setDialogOpen(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          setDialogOpen(true)
        }
      }}
      className={`glass-tile cursor-pointer rounded-[1.5rem] p-3 ${isCancelled ? "border-destructive/40" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 basis-64 items-center gap-3">
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <StudentDot />
              <span className="font-semibold text-ink">{studentName}</span>
              {lesson.isExtraLesson ? <TeacherStatusBadge tone="rose">доп.</TeacherStatusBadge> : null}
              <StudentTags student={student} />
              {isCancelled ? <TeacherStatusBadge tone="red">Урок отменён</TeacherStatusBadge> : null}
              {lesson.rescheduleStatus === "pending_student" ? (
                <TeacherStatusBadge tone="amber">Ожидает подтверждения ученика</TeacherStatusBadge>
              ) : null}
              {studentAsksReschedule ? (
                <TeacherStatusBadge tone="amber">Ученик предлагает перенос</TeacherStatusBadge>
              ) : null}
              {lesson.rescheduleStatus === "confirmed" ? (
                <TeacherStatusBadge tone="green">Перенос подтверждён</TeacherStatusBadge>
              ) : null}
              {lesson.cancellationStatus === "pending_student" ? (
                <TeacherStatusBadge tone="red">Ожидает подтверждения отмены</TeacherStatusBadge>
              ) : null}
              {studentAsksCancel ? <TeacherStatusBadge tone="red">Ученик просит отменить</TeacherStatusBadge> : null}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="size-3" aria-hidden="true" />
                {lesson.rescheduleStatus === "pending_student" || lesson.rescheduleStatus === "pending_teacher" ? (
                  <>
                    <span className="line-through">
                      {formatLessonDateTime(lesson.rescheduledDate ?? lesson.date)}
                    </span>
                    <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    <span className="font-semibold text-foreground">
                      {formatLessonDateTime(lesson.rescheduleProposedDate)}
                    </span>
                  </>
                ) : (
                  <>
                    {formatLessonDateTime(lesson.rescheduledDate ?? lesson.date)}
                    {lesson.rescheduled ? <span className="ml-1 font-semibold text-rose-deep">перенесён</span> : null}
                  </>
                )}
              </span>
              <span className={hasAssignment ? "flex items-center gap-1 font-semibold text-rose-deep" : "flex items-center gap-1"}>
                <FileText className="size-3" aria-hidden="true" />
                {hasAssignment ? "Задание добавлено" : "Задание не добавлено"}
              </span>
              {hasSubmission ? (
                <span className="flex items-center gap-1 font-semibold text-rose-deep">
                  <Check className="size-3" aria-hidden="true" /> ДЗ получено
                </span>
              ) : null}
            </span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5" onClick={stop}>
          {studentAsksReschedule ? (
            <>
              <SolidBtn onClick={handleConfirmReschedule} disabled={rescheduleActionPending}>
                <Check className="size-3.5" aria-hidden="true" /> Подтвердить
              </SolidBtn>
              <GhostBtn onClick={handleCancelReschedule} disabled={rescheduleActionPending} className="px-3 py-1.5">
                <X className="size-3.5" aria-hidden="true" /> Отклонить
              </GhostBtn>
            </>
          ) : null}

          {studentAsksCancel ? (
            <>
              <SolidBtn onClick={handleConfirmCancellation} disabled={cancellationActionPending}>
                <Check className="size-3.5" aria-hidden="true" /> Подтвердить отмену
              </SolidBtn>
              <GhostBtn onClick={handleRejectCancellation} disabled={cancellationActionPending} className="px-3 py-1.5">
                <X className="size-3.5" aria-hidden="true" /> Отклонить
              </GhostBtn>
            </>
          ) : null}

          {!studentInitiated && !isCancelled ? (
            <>
              <GhostBtn onClick={() => setRescheduleDialogOpen(true)} className="px-3 py-1.5">
                <CalendarClock className="size-3.5" aria-hidden="true" /> Перенести
              </GhostBtn>
              <GhostBtn onClick={() => setCancelDialogOpen(true)} className="px-3 py-1.5">
                <CircleSlash className="size-3.5" aria-hidden="true" /> Отменить
              </GhostBtn>
            </>
          ) : null}

          {student ? <ContactIconButton student={student} /> : null}
        </div>
      </div>
    </li>

      <HomeworkLessonDialog
        studentId={lesson.studentId}
        studentName={studentName}
        lessonId={lesson.id}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      <RescheduleDialog
        key={rescheduleDialogOpen ? "open-reschedule" : "closed-reschedule"}
        studentId={lesson.studentId}
        lessonId={lesson.id}
        initialDate={lesson.rescheduledDate ?? lesson.date}
        open={rescheduleDialogOpen}
        onOpenChange={setRescheduleDialogOpen}
      />

      <CancelLessonDialog
        key={cancelDialogOpen ? "open-cancel" : "closed-cancel"}
        studentId={lesson.studentId}
        lessonId={lesson.id}
        lessonDate={lesson.rescheduledDate ?? lesson.date}
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
      />
    </>
  )
}
