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
// fixed Moscow wall-clock value — reversed; each slot now carries its own
// `timeZone`, stamped at save time with whatever timezone the teacher had
// active then (see functions/core/schedule.js, the canonical backend copy
// this file mirrors). getNextLessonDateForSlot/getNextLessonDate are used
// on the frontend for the recurring-schedule display (student-row.jsx) and
// the "Следующие уроки" virtual-occurrence projection
// (upcoming-lessons-list-dialog.jsx); real stored lesson dates still come
// from the backend-written lesson doc. DEFAULT_TIME_ZONE here is only this
// file's own safety-net default for a caller that doesn't pass one.
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

// `timeZone` is the fallback used only for a slot with no `timeZone` field
// of its own (legacy slots saved before per-slot anchoring existed) — a
// slot's own stamped `timeZone` (set at save time, see student-row.jsx's
// StudentEditModal) always wins over it, so a schedule set for "16:00
// Europe/Moscow" stays pinned to that instant even after the teacher later
// changes their own display timezone preference in Settings.
export function getNextLessonDateForSlot(slot, timeZone = DEFAULT_TIME_ZONE) {
  if (!slot || typeof slot.dayOfWeek !== "number" || !slot.time) {
    return null
  }

  const [hours, minutes] = slot.time.split(":").map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null
  }

  const effectiveTimeZone = slot.timeZone || timeZone

  const now = new Date()
  const nowZoned = getZonedParts(now, effectiveTimeZone)
  // A calendar date's day-of-week doesn't depend on time-of-day or zone
  // offset, so reading it off a UTC-midnight Date built from the zoned
  // year/month/day is safe.
  const zonedWeekday = new Date(Date.UTC(nowZoned.year, nowZoned.month - 1, nowZoned.day)).getUTCDay()
  const daysUntil = (slot.dayOfWeek - zonedWeekday + 7) % 7

  const candidateDay = new Date(
    Date.UTC(nowZoned.year, nowZoned.month - 1, nowZoned.day + daysUntil),
  )

  let candidate = zonedTimeToUtc(
    candidateDay.getUTCFullYear(),
    candidateDay.getUTCMonth() + 1,
    candidateDay.getUTCDate(),
    hours,
    minutes,
    effectiveTimeZone,
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
      // Per-slot timezone anchor — null for slots saved before this field
      // existed; getNextLessonDateForSlot falls back to a passed-in
      // timezone (the teacher's current one) for those, same "store null,
      // resolve fallback at read time" shape as `subject` above.
      timeZone: typeof slot.timeZone === "string" && slot.timeZone ? slot.timeZone : null,
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
export function getNextLessonDate(scheduleSlots, timeZone = DEFAULT_TIME_ZONE) {
  const slots = Array.isArray(scheduleSlots) ? scheduleSlots : []
  const dates = slots.map((slot) => getNextLessonDateForSlot(slot, timeZone)).filter(Boolean)

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
// format for the recurring weekly schedule. `locale` defaults to "ru-RU" so
// every pre-existing (teacher-side) caller is unaffected — only the student
// dashboard passes "en-US" explicitly, resolved from students/{id}.language
// via useDateLocale() (src/lib/i18n.js).
export function formatLessonDateTime(date, timeZone = DEFAULT_TIME_ZONE, locale = "ru-RU") {
  if (!date) {
    return ""
  }

  const datePart = date.toLocaleDateString(locale, {
    timeZone,
    day: "numeric",
    month: "long",
  })
  const timePart = date.toLocaleTimeString(locale, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  })

  return `${datePart}, ${timePart}`
}
