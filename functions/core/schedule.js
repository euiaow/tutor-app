// Mirrors src/lib/schedule.js#getNextLessonDate — the frontend module isn't
// importable from functions/ (separate deployable package), so this is the
// canonical copy for backend use; keep both in sync if the logic changes.
function getNextLessonDate(schedule) {
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

module.exports = { getNextLessonDate }
