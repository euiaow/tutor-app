import {
  AlertCircle,
  BookOpen,
  Bell,
  CalendarCheck,
  CalendarClock,
  CalendarX,
  CheckCircle2,
  Clock,
  FileText,
  Paperclip,
  Undo2,
  XCircle,
} from "lucide-react"
import { formatRelativeTime } from "@/lib/notifications"

const TYPE_ICONS = {
  homework_submitted: FileText,
  homework_received: CheckCircle2,
  assignment_added: BookOpen,
  material_added: Paperclip,
  reschedule_proposed_to_student: CalendarClock,
  reschedule_proposed_to_teacher: CalendarClock,
  reschedule_confirmed: CalendarCheck,
  reschedule_rejected: CalendarX,
  cancellation_proposed_to_student: AlertCircle,
  cancellation_proposed_to_teacher: AlertCircle,
  cancellation_confirmed: XCircle,
  cancellation_rejected: Undo2,
  lesson_reminder_midday: Bell,
  lesson_reminder_preLesson: Clock,
}

function NotificationIcon({ type }) {
  const Icon = TYPE_ICONS[type] ?? Bell
  return <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
}

function NotificationRow({ notification, onClick }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onClick(notification)}
        className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted active:bg-accent ${
          notification.read ? "bg-muted/40" : "bg-card"
        }`}
      >
        <NotificationIcon type={notification.type} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={`text-sm text-foreground ${notification.read ? "" : "font-semibold"}`}>
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

export function NotificationsList({ notifications, onNotificationClick, emptyLabel = "Нет новых уведомлений" }) {
  if (notifications.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {notifications.map((notification) => (
        <NotificationRow key={notification.id} notification={notification} onClick={onNotificationClick} />
      ))}
    </ul>
  )
}

export { NotificationIcon, TYPE_ICONS }
