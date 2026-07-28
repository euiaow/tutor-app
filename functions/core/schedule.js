// Mirrors src/lib/schedule.js#getNextLessonDate — the frontend module isn't
// importable from functions/ (separate deployable package), so this is the
// canonical copy for backend use; keep both in sync if the logic changes.

// Tutor's schedule.dayOfWeek/time are always Moscow wall-clock values,
// regardless of the Cloud Functions runtime's own local timezone — the
// computed instant must be correct in absolute (UTC) terms.
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

function getNextLessonDate(schedule) {
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

const RESCHEDULE_DATE_PATTERN = /^(\d{1,2})\.(\d{1,2})\s+(\d{1,2}):(\d{2})$/

// Parses a student-typed "ДД.ММ ЧЧ:ММ" reschedule request as Moscow
// wall-clock time (matching how schedule.time is interpreted everywhere
// else), rolling over to next year if that day/month has already passed
// this year. Shared by both bot adapters so the fiddly timezone math only
// lives in one place.
function parseRescheduleDateInput(text) {
  const match = RESCHEDULE_DATE_PATTERN.exec(text.trim())
  if (!match) {
    return null
  }

  const [, dayStr, monthStr, hourStr, minuteStr] = match
  const day = Number(dayStr)
  const month = Number(monthStr)
  const hour = Number(hourStr)
  const minute = Number(minuteStr)

  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    return null
  }

  const now = new Date()
  const nowInMoscow = getZonedParts(now, SCHEDULE_TIME_ZONE)

  let candidate = zonedTimeToUtc(nowInMoscow.year, month, day, hour, minute, SCHEDULE_TIME_ZONE)
  if (candidate < now) {
    candidate = zonedTimeToUtc(nowInMoscow.year + 1, month, day, hour, minute, SCHEDULE_TIME_ZONE)
  }

  return candidate
}

module.exports = {
  getNextLessonDate,
  SCHEDULE_TIME_ZONE,
  getZonedParts,
  zonedTimeToUtc,
  parseRescheduleDateInput,
}
