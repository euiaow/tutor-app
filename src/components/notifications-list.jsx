import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { formatRelativeTime } from "@/lib/notifications"
import { markNotificationRead } from "@/firebase/notifications"
import {
  confirmReschedule,
  cancelReschedule,
  confirmCancellation,
  rejectCancellation,
  subscribeToLesson,
} from "@/firebase/lessons"

// Real values the backend actually writes (functions/core/lessons.js
// proposeReschedule/proposeCancellation, initiator === "teacher" branch) —
// NOT the plain "reschedule_proposed"/"cancellation_proposed" this constant
// held before, which never matched anything (a guessed name, never checked
// against the backend). The "_to_teacher" siblings exist too but are
// target:"teacher", so they'd never reach the student's own notification
// feed regardless.
const PROPOSAL_TYPES = ["reschedule_proposed_to_student", "cancellation_proposed_to_student"]

// Site-side duplicate of the bot's inline confirm/decline keyboard — student
// only, for reschedule_proposed_to_student/cancellation_proposed_to_student
// (teacher-initiated proposals the student needs to act on).
//
// Two independent signals decide what's shown: `state` (this click's own
// optimistic result — "confirming"/"confirmed"/etc.) and a live
// subscribeToLesson on the notification's own lessonId, which is what makes
// the buttons disappear here the moment the SAME proposal is resolved from
// anywhere else — the "Следующий урок" banner's own buttons, the bot's
// inline keyboard, or another open tab — not just after this row's own
// click. Before this, a resolved-elsewhere proposal only got caught
// reactively on click (confirmReschedule/confirmCancellation's own
// "not pending anymore" failed-precondition error, still relied on below
// as the actual authority/guard against a genuine double-submit race, not
// removed) — buttons stayed visible and clickable until then.
function ProposalActions({ notification }) {
  const [state, setState] = useState(null) // null | "confirming" | "rejecting" | "confirmed" | "rejected" | "resolved"
  const [lesson, setLesson] = useState(undefined) // undefined = not loaded yet

  useEffect(() => {
    if (!notification.studentId || !notification.lessonId) {
      setLesson(null)
      return
    }
    const unsubscribe = subscribeToLesson(notification.studentId, notification.lessonId, setLesson, (error) => {
      console.error("Failed to subscribe to lesson for notification actions:", error)
      setLesson(null)
    })
    return unsubscribe
  }, [notification.studentId, notification.lessonId])

  async function finish(action, nextState) {
    if (state) return
    setState(nextState)
    try {
      await action()
      setState(nextState)
    } catch (error) {
      console.error("Failed to act on notification proposal:", error)
      setState("resolved")
    } finally {
      try {
        await markNotificationRead(notification.id)
      } catch (error) {
        console.error("Failed to mark notification read:", error)
      }
    }
  }

  function handleConfirm() {
    finish(
      () =>
        notification.type === "reschedule_proposed_to_student"
          ? confirmReschedule(notification.studentId, notification.lessonId, "student")
          : confirmCancellation(notification.studentId, notification.lessonId, "student"),
      "confirmed",
    )
  }

  function handleReject() {
    finish(
      () =>
        notification.type === "reschedule_proposed_to_student"
          ? cancelReschedule(notification.studentId, notification.lessonId)
          : rejectCancellation(notification.studentId, notification.lessonId),
      "rejected",
    )
  }

  if (state === "confirmed") return <p className="mt-1 text-xs font-semibold text-primary">Подтверждено</p>
  if (state === "rejected") return <p className="mt-1 text-xs font-semibold text-muted-foreground">Отклонено</p>
  if (state === "resolved") return <p className="mt-1 text-xs font-semibold text-muted-foreground">Уже обработано</p>

  if (lesson !== undefined) {
    const stillPending =
      notification.type === "reschedule_proposed_to_student"
        ? lesson?.rescheduleStatus === "pending_student"
        : lesson?.status !== "cancelled" && lesson?.cancellationStatus === "pending_student"
    if (!stillPending) {
      return <p className="mt-1 text-xs font-semibold text-muted-foreground">Уже обработано</p>
    }
  }

  const busy = state === "confirming" || state === "rejecting"

  return (
    <div className="mt-1.5 flex gap-2" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={handleConfirm}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium text-destructive-foreground transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:scale-100"
        style={{ background: "var(--gradient-warm)", boxShadow: "var(--shadow-soft)" }}
      >
        {state === "confirming" ? <Loader2 className="size-3 animate-spin" aria-hidden="true" /> : null}
        Подтвердить
      </button>
      <button
        type="button"
        onClick={handleReject}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-full border border-white/60 bg-white/45 px-4 py-1.5 text-xs font-medium text-secondary-foreground backdrop-blur-md transition-colors hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-55"
      >
        {state === "rejecting" ? <Loader2 className="size-3 animate-spin" aria-hidden="true" /> : null}
        Отклонить
      </button>
    </div>
  )
}

// No per-type icon here on purpose — every notification's own text already
// starts with an emoji (📅 ✅ ❌ 📝 etc, see functions/core/botMessages.js),
// so a separate colored type-icon duplicated the same signal twice.
//
// `glass` opts into the student page's grey-glass row treatment (see
// glass-dialog.jsx) — defaults to false so the teacher's own Sheet-based
// notification panel (a plain opaque surface, not the glass page) keeps
// its existing solid-card look unchanged.
//
// `enableProposalActions` is student-only (see AllNotificationsDialog in
// StudentDashboard.jsx) — the teacher's bell never passes it, since these
// two proposal types are always addressed to the student.
function NotificationRow({ notification, onClick, glass, enableProposalActions }) {
  // The action buttons render a real <button> each — nesting those inside
  // the row's own click-to-mark-read <button> would be invalid HTML (and
  // break their own click handling), so the rowClassName (background,
  // padding, rounding) moved from that inner button onto the <li>, and
  // ProposalActions renders as its sibling instead of its child.
  const rowClassName = glass
    ? `rounded-2xl px-3 py-2.5 transition-colors hover:bg-white/70 ${notification.read ? "opacity-70" : ""}`
    : `rounded-xl px-3 py-2.5 transition-colors hover:bg-muted active:bg-accent ${
        notification.read ? "bg-muted/40" : "bg-card"
      }`
  const showActions = enableProposalActions && PROPOSAL_TYPES.includes(notification.type)

  return (
    <li className={`${glass ? "glass-inset" : ""} ${rowClassName}`}>
      <button type="button" onClick={() => onClick(notification)} className="flex w-full items-start gap-3 text-left">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            className={`text-sm ${glass ? "text-secondary-foreground" : "text-foreground"} ${notification.read ? "" : "font-semibold"}`}
          >
            {notification.text}
          </span>
          <span className="text-xs text-muted-foreground">{formatRelativeTime(notification.createdAt)}</span>
        </span>
        {!notification.read ? (
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-red-500" aria-hidden="true" />
        ) : null}
      </button>
      {showActions ? <ProposalActions notification={notification} /> : null}
    </li>
  )
}

export function NotificationsList({
  notifications,
  onNotificationClick,
  emptyLabel = "Нет новых уведомлений",
  glass = false,
  enableProposalActions = false,
}) {
  if (notifications.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {notifications.map((notification) => (
        <NotificationRow
          key={notification.id}
          notification={notification}
          onClick={onNotificationClick}
          glass={glass}
          enableProposalActions={enableProposalActions}
        />
      ))}
    </ul>
  )
}
