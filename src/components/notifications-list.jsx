import { formatRelativeTime } from "@/lib/notifications"

// No per-type icon here on purpose — every notification's own text already
// starts with an emoji (📅 ✅ ❌ 📝 etc, see functions/core/botMessages.js),
// so a separate colored type-icon duplicated the same signal twice.
//
// `glass` opts into the student page's grey-glass row treatment (see
// glass-dialog.jsx) — defaults to false so the teacher's own Sheet-based
// notification panel (a plain opaque surface, not the glass page) keeps
// its existing solid-card look unchanged.
function NotificationRow({ notification, onClick, glass }) {
  const rowClassName = glass
    ? `glass-inset flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-white/70 ${
        notification.read ? "opacity-70" : ""
      }`
    : `flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted active:bg-accent ${
        notification.read ? "bg-muted/40" : "bg-card"
      }`

  return (
    <li>
      <button type="button" onClick={() => onClick(notification)} className={rowClassName}>
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
    </li>
  )
}

export function NotificationsList({
  notifications,
  onNotificationClick,
  emptyLabel = "Нет новых уведомлений",
  glass = false,
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
        />
      ))}
    </ul>
  )
}
