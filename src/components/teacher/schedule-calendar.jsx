import { useMemo } from "react"
import { Calendar, dateFnsLocalizer } from "react-big-calendar"
import { format, parse, startOfWeek, getDay } from "date-fns"
import { ru } from "date-fns/locale"
import "react-big-calendar/lib/css/react-big-calendar.css"

// Two-color palette for events, matching the reviewed design reference.
// There's no per-lesson "subject" in the data model to split by, so color
// is assigned per student instead, via a stable hash of their id — the
// same student always lands on the same color across renders/reloads.
const EVENT_COLOR_STYLES = [
  { backgroundColor: "#dbeafe", color: "#1e40af", border: "1px solid #bfdbfe" },
  { backgroundColor: "#ede9fe", color: "#5b21b6", border: "1px solid #ddd6fe" },
]

function colorIndexForStudentId(id) {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash + id.charCodeAt(i)) % EVENT_COLOR_STYLES.length
  }
  return hash
}

function EventContent({ event }) {
  return (
    <div className="flex flex-col overflow-hidden text-left leading-tight">
      <span className="truncate text-[11px] font-bold">{event.studentName}</span>
      <span className="truncate text-[10px] font-medium opacity-75">{event.timeLabel}</span>
    </div>
  )
}

const locales = { "ru-RU": ru }

const MESSAGES_RU = {
  today: "Сегодня",
  previous: "Назад",
  next: "Далее",
  day: "День",
  week: "Неделя",
  month: "Месяц",
  date: "Дата",
  time: "Время",
  event: "Событие",
  noEventsInRange: "Нет занятий в этот период",
  showMore: (count) => `+ ещё ${count}`,
}

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
})

// react-big-calendar has no built-in open-ended recurrence, so a weekly
// schedule slot is expanded into concrete event instances across a fixed
// window around today, wide enough to cover normal day/week/month browsing.
const WEEKS_BEFORE = 4
const WEEKS_AFTER = 12

function generateScheduleEvents(students) {
  const events = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (const student of students) {
    const schedule = student.schedule
    if (!schedule || typeof schedule.dayOfWeek !== "number" || !schedule.time) {
      continue
    }

    const [hours, minutes] = schedule.time.split(":").map(Number)
    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
      continue
    }

    const durationMinutes = schedule.durationMinutes ?? 60
    const colorIndex = colorIndexForStudentId(student.id)

    const daysUntilFirstOccurrenceInWindow = (schedule.dayOfWeek - today.getDay() + 7) % 7
    const firstOccurrence = new Date(today)
    firstOccurrence.setDate(today.getDate() + daysUntilFirstOccurrenceInWindow - WEEKS_BEFORE * 7)

    for (let week = 0; week < WEEKS_BEFORE + WEEKS_AFTER; week += 1) {
      const start = new Date(firstOccurrence)
      start.setDate(firstOccurrence.getDate() + week * 7)
      start.setHours(hours, minutes, 0, 0)

      const end = new Date(start.getTime() + durationMinutes * 60 * 1000)
      const timeLabel = `${format(start, "HH:mm")}–${format(end, "HH:mm")}`

      events.push({
        id: `${student.id}-${start.toISOString()}`,
        title: `${student.name}, ${timeLabel}`,
        studentName: student.name,
        timeLabel,
        colorIndex,
        start,
        end,
      })
    }
  }

  return events
}

export function ScheduleCalendar({ students }) {
  const events = useMemo(() => generateScheduleEvents(students), [students])

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-extrabold text-foreground">Расписание</h2>
      <div className="schedule-calendar h-[600px]">
        {/* Our custom event component already renders the time range, so the
            library's own separate time-grid label would just duplicate it. */}
        <style>{".schedule-calendar .rbc-event-label { display: none !important; }"}</style>
        <Calendar
          localizer={localizer}
          culture="ru-RU"
          messages={MESSAGES_RU}
          events={events}
          startAccessor="start"
          endAccessor="end"
          views={["day", "week", "month"]}
          defaultView="week"
          eventPropGetter={(event) => ({ style: EVENT_COLOR_STYLES[event.colorIndex] })}
          components={{ event: EventContent }}
        />
      </div>
    </section>
  )
}
