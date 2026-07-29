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

// "только что" / "5 минут назад" / "3 часа назад" / "вчера" / "12 июля" —
// coarse enough for a notification feed, doesn't need second-level
// precision the way a chat timestamp would.
export function formatRelativeTime(date) {
  if (!date) return ""

  const diffMs = Date.now() - date.getTime()

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

  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })
}
