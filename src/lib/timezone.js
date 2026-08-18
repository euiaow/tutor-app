import { getZonedParts, zonedTimeToUtc } from "@/lib/schedule"

// Multi-tenancy Phase 4a: every user (teacher or student) can now save an
// explicit IANA timezone on their own profile doc (teachers/{uid}.timezone,
// students/{id}.timezone). This is the shared source of truth for that
// preference — the curated <select> options, the device-detection fallback,
// and the "saved value, or device" resolution rule used everywhere a date/
// time gets formatted for on-screen display.
export const DEFAULT_TIME_ZONE = "Europe/Moscow"

export function getDeviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIME_ZONE
  } catch {
    return DEFAULT_TIME_ZONE
  }
}

// savedTimeZone is whatever's on the user's own profile doc — null/undefined
// for anyone who's never opened Settings, which is exactly when the device's
// own timezone should be used instead (see SettingsDialog/CLAUDE plan §4).
export function resolveTimeZone(savedTimeZone) {
  return savedTimeZone || getDeviceTimeZone()
}

// Common Russian + a handful of popular non-Russian zones, per explicit
// spec — not every IANA zone, just enough to cover the realistic range of
// students/teachers without an unusable 400-item dropdown. The saved value
// is always trusted even if it isn't in this list (see SettingsDialog),
// this is only the curated suggestion list.
// Full-rewrite (часовые пояса): every date/time a user TYPES into a form
// (reschedule proposal, extra-lesson date) is meant to be interpreted as
// wall-clock time in *that user's own* saved timezone — never the device's
// timezone, which is what a bare `new Date(\`${date}T${time}\`)` or
// `date.getTimezoneOffset()` would silently use instead. These two pairs
// are the shared conversion point for every such form (reuses the same
// zone-math lib/schedule.js already uses for the analogous backend-side
// problem — see that file's own zonedTimeToUtc/getZonedParts, exported
// from there so this stays the single implementation, not a second copy).

// Two separate <input type="date">/<input type="time"> values → the actual
// UTC instant they represent, interpreted in timeZone.
export function localInputsToUtcDate(dateStr, timeStr, timeZone) {
  const [year, month, day] = dateStr.split("-").map(Number)
  const [hour, minute] = timeStr.split(":").map(Number)
  return zonedTimeToUtc(year, month, day, hour, minute, timeZone)
}

// A single <input type="datetime-local"> value ("YYYY-MM-DDTHH:MM") → the
// actual UTC instant it represents, interpreted in timeZone.
export function datetimeLocalToUtcDate(value, timeZone) {
  const [dateStr, timeStr] = value.split("T")
  return localInputsToUtcDate(dateStr, timeStr, timeZone)
}

// Inverse — a UTC instant → "YYYY-MM-DDTHH:MM" as it reads in timeZone, for
// pre-filling a datetime-local input (or split further into separate date/
// time inputs by the caller).
export function utcDateToLocalInput(date, timeZone) {
  const parts = getZonedParts(date, timeZone)
  const pad = (n) => String(n).padStart(2, "0")
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`
}

export const TIME_ZONE_OPTIONS = [
  { value: "Europe/Kaliningrad", label: "Калининград (UTC+2)" },
  { value: "Europe/Moscow", label: "Москва (UTC+3)" },
  { value: "Europe/Samara", label: "Самара (UTC+4)" },
  { value: "Asia/Yekaterinburg", label: "Екатеринбург (UTC+5)" },
  { value: "Asia/Omsk", label: "Омск (UTC+6)" },
  { value: "Asia/Novosibirsk", label: "Новосибирск (UTC+7)" },
  { value: "Asia/Krasnoyarsk", label: "Красноярск (UTC+7)" },
  { value: "Asia/Irkutsk", label: "Иркутск (UTC+8)" },
  { value: "Asia/Yakutsk", label: "Якутск (UTC+9)" },
  { value: "Asia/Vladivostok", label: "Владивосток (UTC+10)" },
  { value: "Asia/Magadan", label: "Магадан (UTC+11)" },
  { value: "Asia/Kamchatka", label: "Камчатка (UTC+12)" },
  { value: "Europe/Kyiv", label: "Киев (UTC+2/+3)" },
  { value: "Europe/Minsk", label: "Минск (UTC+3)" },
  { value: "Asia/Almaty", label: "Алматы (UTC+6)" },
  { value: "Asia/Tashkent", label: "Ташкент (UTC+5)" },
  { value: "Europe/London", label: "Лондон (UTC+0/+1)" },
  { value: "Europe/Berlin", label: "Берлин (UTC+1/+2)" },
]
