const DAY_NAMES_RU = [
  "Воскресенье",
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
]

export const DAY_OPTIONS = DAY_NAMES_RU.map((label, value) => ({ value, label }))

export function getNextLessonDate(schedule) {
  if (!schedule || typeof schedule.dayOfWeek !== "number" || !schedule.time) {
    return null
  }

  const [hours, minutes] = schedule.time.split(":").map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null
  }

  const now = new Date()
  const daysUntil = (schedule.dayOfWeek - now.getDay() + 7) % 7
  const candidate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + daysUntil,
    hours,
    minutes,
    0,
    0,
  )

  if (candidate <= now) {
    candidate.setDate(candidate.getDate() + 7)
  }

  return candidate
}

export function formatNextLessonDate(date) {
  if (!date) {
    return "Расписание не задано"
  }

  const weekday = date.toLocaleDateString("ru-RU", { weekday: "long" })
  const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1)
  const time = date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })

  return `${capitalizedWeekday}, ${time}`
}
