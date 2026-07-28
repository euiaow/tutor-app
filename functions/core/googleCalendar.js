const { google } = require("googleapis")
const logger = require("firebase-functions/logger")
const { getAuthorizedClient } = require("./googleAuth")
const { getNextLessonDate } = require("./schedule")

const CALENDAR_ID = "primary"
const CALENDAR_TIME_ZONE = "Europe/Moscow"

function pad(number) {
  return String(number).padStart(2, "0")
}

// Cloud Functions run in UTC, so getNextLessonDate's Date object carries
// schedule.time's hour/minute as its UTC-as-naive components. Formatting
// with toISOString() would append "Z" (UTC) and Google would ignore the
// timeZone field, shifting the lesson by Moscow's offset. A floating
// (offset-less) dateTime paired with timeZone: "Europe/Moscow" tells
// Google to interpret these numbers as Moscow wall-clock time instead.
function toFloatingDateTime(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`
}

function buildEventResource(student) {
  const start = getNextLessonDate(student.schedule)
  if (!start) {
    return null
  }

  const durationMinutes = student.schedule?.durationMinutes ?? 60
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000)

  const resource = {
    summary: student.name,
    start: { dateTime: toFloatingDateTime(start), timeZone: CALENDAR_TIME_ZONE },
    end: { dateTime: toFloatingDateTime(end), timeZone: CALENDAR_TIME_ZONE },
    recurrence: ["RRULE:FREQ=WEEKLY"],
  }

  if (student.topic) {
    resource.description = student.topic
  }

  return resource
}

function isNotFoundError(error) {
  return error?.code === 404 || error?.response?.status === 404
}

async function getCalendarOrNull() {
  try {
    const client = await getAuthorizedClient()
    return google.calendar({ version: "v3", auth: client })
  } catch (error) {
    logger.warn("Google Calendar not connected, skipping sync", { message: error.message })
    return null
  }
}

async function createLessonEvent(student) {
  const calendar = await getCalendarOrNull()
  if (!calendar) {
    return null
  }

  const resource = buildEventResource(student)
  if (!resource) {
    logger.warn("Cannot build Google Calendar event: no valid schedule", { studentName: student.name })
    return null
  }

  const response = await calendar.events.insert({
    calendarId: CALENDAR_ID,
    requestBody: resource,
  })

  return response.data.id
}

async function updateLessonEvent(eventId, student) {
  const calendar = await getCalendarOrNull()
  if (!calendar) {
    return
  }

  const resource = buildEventResource(student)
  if (!resource) {
    logger.warn("Cannot build Google Calendar event: no valid schedule", { studentName: student.name })
    return
  }

  try {
    await calendar.events.update({
      calendarId: CALENDAR_ID,
      eventId,
      requestBody: resource,
    })
  } catch (error) {
    if (isNotFoundError(error)) {
      logger.warn("Google Calendar event not found, treating as already gone", { eventId })
      return
    }
    throw error
  }
}

async function deleteLessonEvent(eventId) {
  const calendar = await getCalendarOrNull()
  if (!calendar) {
    return
  }

  try {
    await calendar.events.delete({
      calendarId: CALENDAR_ID,
      eventId,
    })
  } catch (error) {
    if (isNotFoundError(error)) {
      logger.warn("Google Calendar event already gone", { eventId })
      return
    }
    throw error
  }
}

module.exports = { createLessonEvent, updateLessonEvent, deleteLessonEvent }
