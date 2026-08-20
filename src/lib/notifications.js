const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

function pluralize(count, one, few, many) {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}

function pluralizeEn(count, singular, plural) {
  return count === 1 ? singular : plural
}

// "just now" / "5 minutes ago" / "3 hours ago" / "yesterday" / "July 12" —
// the English mirror of the Russian strings below, used only when `locale`
// is explicitly "en-US" (student dashboard, students/{id}.language === "en").
function formatRelativeTimeEn(date, timeZone, diffMs) {
  if (diffMs < MINUTE_MS) {
    return "just now"
  }

  if (diffMs < HOUR_MS) {
    const minutes = Math.floor(diffMs / MINUTE_MS)
    return `${minutes} ${pluralizeEn(minutes, "minute", "minutes")} ago`
  }

  if (diffMs < DAY_MS) {
    const hours = Math.floor(diffMs / HOUR_MS)
    return `${hours} ${pluralizeEn(hours, "hour", "hours")} ago`
  }

  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)

  if (date.toDateString() === yesterday.toDateString()) {
    return "yesterday"
  }

  const days = Math.floor(diffMs / DAY_MS)
  if (days < 7) {
    return `${days} ${pluralizeEn(days, "day", "days")} ago`
  }

  return date.toLocaleDateString("en-US", { timeZone, day: "numeric", month: "long" })
}

// "только что" / "5 минут назад" / "3 часа назад" / "вчера" / "12 июля" —
// coarse enough for a notification feed, doesn't need second-level
// precision the way a chat timestamp would. timeZone only matters for the
// final ">7 days ago" branch (an actual calendar date) — pass the viewer's
// resolved timezone (see lib/user-prefs-context.jsx); omitting it keeps the
// old device-timezone behavior. `locale` defaults to "ru-RU" so every
// pre-existing (teacher-side) caller is unaffected — only the student
// dashboard passes "en-US" explicitly (see useDateLocale, src/lib/i18n.js).
export function formatRelativeTime(date, timeZone, locale = "ru-RU") {
  if (!date) return ""

  const diffMs = Date.now() - date.getTime()

  if (locale === "en-US") {
    return formatRelativeTimeEn(date, timeZone, diffMs)
  }

  if (diffMs < MINUTE_MS) {
    return "только что"
  }

  if (diffMs < HOUR_MS) {
    const minutes = Math.floor(diffMs / MINUTE_MS)
    return `${minutes} ${pluralize(minutes, "минуту", "минуты", "минут")} назад`
  }

  if (diffMs < DAY_MS) {
    const hours = Math.floor(diffMs / HOUR_MS)
    return `${hours} ${pluralize(hours, "час", "часа", "часов")} назад`
  }

  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)

  if (date.toDateString() === yesterday.toDateString()) {
    return "вчера"
  }

  const days = Math.floor(diffMs / DAY_MS)
  if (days < 7) {
    return `${days} ${pluralize(days, "день", "дня", "дней")} назад`
  }

  return date.toLocaleDateString("ru-RU", { timeZone, day: "numeric", month: "long" })
}
