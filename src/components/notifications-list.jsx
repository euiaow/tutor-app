import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatRelativeTime } from "@/lib/notifications"
import { markNotificationRead } from "@/firebase/notifications"
import { confirmReschedule, cancelReschedule, confirmCancellation, rejectCancellation } from "@/firebase/lessons"

const PROPOSAL_TYPES = ["reschedule_proposed", "cancellation_proposed"]

// Site-side duplicate of the bot's inline confirm/decline keyboard — student
// only, for reschedule_proposed/cancellation_proposed (teacher-initiated
// proposals the student needs to act on). `state` starts idle (buttons
// shown) rather than reflecting live lesson status: if the student already
// answered via the bot, clicking here just makes the callable reject with
// its own "not pending anymore" validation error (confirmReschedule/
// confirmCancellation already guard on current status), which is caught
// below and rendered as "already handled" instead of a raw error — this is
// the actual desync guard, not a pre-check.
function ProposalActions({ notification }) {
  const [state, setState] = useState(null) // null | "confirming" | "rejecting" | "confirmed" | "rejected" | "resolved"

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
        notification.type === "reschedule_proposed"
          ? confirmReschedule(notification.studentId, notification.lessonId, "student")
          : confirmCancellation(notification.studentId, notification.lessonId, "student"),
      "confirmed",
    )
  }

  function handleReject() {
    finish(
      () =>
        notification.type === "reschedule_proposed"
          ? cancelReschedule(notification.studentId, notification.lessonId)
          : rejectCancellation(notification.studentId, notification.lessonId),
      "rejected",
    )
  }

  if (state === "confirmed") return <p className="mt-1 text-xs font-semibold text-primary">Подтверждено</p>
  if (state === "rejected") return <p className="mt-1 text-xs font-semibold text-muted-foreground">Отклонено</p>
  if (state === "resolved") return <p className="mt-1 text-xs font-semibold text-muted-foreground">Уже обработано</p>

  const busy = state === "confirming" || state === "rejecting"

  return (
    <div className="mt-1.5 flex gap-2" onClick={(e) => e.stopPropagation()}>
      <Button type="button" size="sm" onClick={handleConfirm} disabled={busy}>
        {state === "confirming" ? <Loader2 className="size-3 animate-spin" aria-hidden="true" /> : null}
        Подтвердить
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={handleReject} disabled={busy}>
        {state === "rejecting" ? <Loader2 className="size-3 animate-spin" aria-hidden="true" /> : null}
        Отклонить
      </Button>
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
