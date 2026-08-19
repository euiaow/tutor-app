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

// Full-rewrite note: schedule.dayOfWeek/time used to be interpreted as a
// fixed Moscow wall-clock value — reversed; the teacher's own saved
// timezone is now the interpretation context (see
// functions/core/schedule.js, the canonical backend copy this file
// mirrors — getNextLessonDateForSlot/getNextLessonDate below are unused on
// the frontend today, all "next lesson" display reads the already-computed
// date off the backend-written lesson doc instead, but kept in sync with
// the backend copy's shape regardless). DEFAULT_TIME_ZONE here is only
// this file's own safety-net default for a caller that doesn't pass one.
const DEFAULT_TIME_ZONE = "Europe/Moscow"

export function getZonedParts(date, timeZone) {
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
export function zonedTimeToUtc(year, month, day, hour, minute, timeZone) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0)
  const zoned = getZonedParts(new Date(utcGuess), timeZone)
  const zonedAsUtc = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute, zoned.second)
  const offset = zonedAsUtc - utcGuess
  return new Date(utcGuess - offset)
}

export function getNextLessonDateForSlot(slot) {
  if (!slot || typeof slot.dayOfWeek !== "number" || !slot.time) {
    return null
  }

  const [hours, minutes] = slot.time.split(":").map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null
  }

  const now = new Date()
  const nowInMoscow = getZonedParts(now, DEFAULT_TIME_ZONE)
  // A calendar date's day-of-week doesn't depend on time-of-day or zone
  // offset, so reading it off a UTC-midnight Date built from Moscow's
  // year/month/day is safe.
  const mskWeekday = new Date(Date.UTC(nowInMoscow.year, nowInMoscow.month - 1, nowInMoscow.day)).getUTCDay()
  const daysUntil = (slot.dayOfWeek - mskWeekday + 7) % 7

  const candidateDay = new Date(
    Date.UTC(nowInMoscow.year, nowInMoscow.month - 1, nowInMoscow.day + daysUntil),
  )

  let candidate = zonedTimeToUtc(
    candidateDay.getUTCFullYear(),
    candidateDay.getUTCMonth() + 1,
    candidateDay.getUTCDate(),
    hours,
    minutes,
    DEFAULT_TIME_ZONE,
  )

  if (candidate <= now) {
    candidate = new Date(candidate.getTime() + 7 * 24 * 60 * 60 * 1000)
  }

  return candidate
}

function isValidSlot(slot) {
  return Boolean(slot) && typeof slot.dayOfWeek === "number" && typeof slot.time === "string" && slot.time !== ""
}

// Reads a student doc regardless of whether it's already been migrated to
// scheduleSlots (array) or still has the legacy single `schedule` object —
// see functions/scripts/migrateSchedule.js and mapStudentDoc in
// src/firebase/students.js, which calls this for every student read.
export function normalizeScheduleSlots(data) {
  if (!data) {
    return []
  }

  if (Array.isArray(data.scheduleSlots)) {
    return data.scheduleSlots.filter(isValidSlot).map((slot) => ({
      dayOfWeek: slot.dayOfWeek,
      time: slot.time,
      durationMinutes: slot.durationMinutes ?? 60,
      // Per-slot subject binding — null for slots saved before this field
      // existed; UI/logic that needs a concrete subject falls back to
      // student.subject[0] at read time (see resolveSlotSubject callers).
      subject: typeof slot.subject === "string" && slot.subject ? slot.subject : null,
    }))
  }

  if (isValidSlot(data.schedule)) {
    return [
      {
        dayOfWeek: data.schedule.dayOfWeek,
        time: data.schedule.time,
        durationMinutes: data.schedule.durationMinutes ?? 60,
      },
    ]
  }

  return []
}

// Earliest next occurrence across every slot.
export function getNextLessonDate(scheduleSlots) {
  const slots = Array.isArray(scheduleSlots) ? scheduleSlots : []
  const dates = slots.map(getNextLessonDateForSlot).filter(Boolean)

  if (dates.length === 0) {
    return null
  }

  return dates.reduce((earliest, date) => (date < earliest ? date : earliest))
}

// timeZone is the *viewer's* own display preference (see
// lib/user-prefs-context.jsx's useTimeZone) — defaults to
// DEFAULT_TIME_ZONE (Moscow) purely as the technical fallback for a viewer
// with no timezone saved yet.
export function formatNextLessonDate(date, timeZone = DEFAULT_TIME_ZONE) {
  if (!date) {
    return "Расписание не задано"
  }

  const weekday = date.toLocaleDateString("ru-RU", { timeZone, weekday: "long" })
  const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1)
  const time = date.toLocaleTimeString("ru-RU", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  })

  return `${capitalizedWeekday}, ${time}`
}

// Full calendar date + time (e.g. "28 июля, 16:00") — used for concrete
// lesson.date values, as opposed to formatNextLessonDate's weekday-only
// format for the recurring weekly schedule.
export function formatLessonDateTime(date, timeZone = DEFAULT_TIME_ZONE) {
  if (!date) {
    return ""
  }

  const datePart = date.toLocaleDateString("ru-RU", {
    timeZone,
    day: "numeric",
    month: "long",
  })
  const timePart = date.toLocaleTimeString("ru-RU", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  })

  return `${datePart}, ${timePart}`
}
