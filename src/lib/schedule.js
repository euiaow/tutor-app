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

// Tutor's schedule.dayOfWeek/time are always Moscow wall-clock values,
// regardless of where the student's or teacher's device is set to — a
// student on UTC+6 must see the same "19:00" the teacher typed in, not
// 19:00 shifted by their own device's offset.
const SCHEDULE_TIME_ZONE = "Europe/Moscow"

function getZonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date)

  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]))

  return {
    year: Number(byType.year),
    month: Number(byType.month),
    day: Number(byType.day),
    hour: Number(byType.hour),
    minute: Number(byType.minute),
    second: Number(byType.second),
  }
}

// Converts a wall-clock date/time as observed in `timeZone` into the actual
// UTC instant it represents. Re-measures the zone's offset at a guessed
// instant and corrects for it, so it works for any IANA zone without a
// library (the same technique date-fns-tz's zonedTimeToUtc uses internally).
function zonedTimeToUtc(year, month, day, hour, minute, timeZone) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0)
  const zoned = getZonedParts(new Date(utcGuess), timeZone)
  const zonedAsUtc = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute, zoned.second)
  const offset = zonedAsUtc - utcGuess
  return new Date(utcGuess - offset)
}

export function getNextLessonDate(schedule) {
  if (!schedule || typeof schedule.dayOfWeek !== "number" || !schedule.time) {
    return null
  }

  const [hours, minutes] = schedule.time.split(":").map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null
  }

  const now = new Date()
  const nowInMoscow = getZonedParts(now, SCHEDULE_TIME_ZONE)
  // A calendar date's day-of-week doesn't depend on time-of-day or zone
  // offset, so reading it off a UTC-midnight Date built from Moscow's
  // year/month/day is safe.
  const mskWeekday = new Date(Date.UTC(nowInMoscow.year, nowInMoscow.month - 1, nowInMoscow.day)).getUTCDay()
  const daysUntil = (schedule.dayOfWeek - mskWeekday + 7) % 7

  const candidateDay = new Date(
    Date.UTC(nowInMoscow.year, nowInMoscow.month - 1, nowInMoscow.day + daysUntil),
  )

  let candidate = zonedTimeToUtc(
    candidateDay.getUTCFullYear(),
    candidateDay.getUTCMonth() + 1,
    candidateDay.getUTCDate(),
    hours,
    minutes,
    SCHEDULE_TIME_ZONE,
  )

  if (candidate <= now) {
    candidate = new Date(candidate.getTime() + 7 * 24 * 60 * 60 * 1000)
  }

  return candidate
}

export function formatNextLessonDate(date) {
  if (!date) {
    return "Расписание не задано"
  }

  const weekday = date.toLocaleDateString("ru-RU", { timeZone: SCHEDULE_TIME_ZONE, weekday: "long" })
  const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1)
  const time = date.toLocaleTimeString("ru-RU", {
    timeZone: SCHEDULE_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  })

  return `${capitalizedWeekday}, ${time}`
}

// Full calendar date + time (e.g. "28 июля, 16:00") — used for concrete
// lesson.date values, as opposed to formatNextLessonDate's weekday-only
// format for the recurring weekly schedule.
export function formatLessonDateTime(date) {
  if (!date) {
    return ""
  }

  const datePart = date.toLocaleDateString("ru-RU", {
    timeZone: SCHEDULE_TIME_ZONE,
    day: "numeric",
    month: "long",
  })
  const timePart = date.toLocaleTimeString("ru-RU", {
    timeZone: SCHEDULE_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  })

  return `${datePart}, ${timePart}`
}
