const { google } = require("googleapis")
const logger = require("firebase-functions/logger")
const { getAuthorizedClient } = require("./googleAuth")
const { getNextLessonDate, getZonedParts, SCHEDULE_TIME_ZONE } = require("./schedule")

const CALENDAR_ID = "primary"
const CALENDAR_TIME_ZONE = SCHEDULE_TIME_ZONE

function pad(number) {
  return String(number).padStart(2, "0")
}

// getNextLessonDate returns a real UTC instant, but Google Calendar needs a
// floating (offset-less) dateTime paired with timeZone: "Europe/Moscow" to
// display Moscow wall-clock time regardless of what timezone the Cloud
// Functions runtime itself happens to be in — so the instant is re-read
// through Europe/Moscow rather than via getHours()/getMinutes(), which
// would reflect the runtime's own local timezone instead.
function toFloatingDateTime(date) {
  const parts = getZonedParts(date, CALENDAR_TIME_ZONE)
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:00`
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

// Reschedules a single occurrence of the student's recurring lesson event
// without touching the recurring series itself: looks up the specific
// instance nearest the lesson's original date via the Calendar API's
// instances() endpoint and patches just that instance's start/end. Patching
// the master event directly (as updateLessonEvent does) would shift the
// entire weekly series, not just this one lesson.
async function rescheduleLessonEvent(eventId, originalDate, newDate, durationMinutes) {
  if (!eventId || !originalDate || !newDate) {
    return
  }

  const calendar = await getCalendarOrNull()
  if (!calendar) {
    return
  }

  try {
    const instancesResponse = await calendar.events.instances({
      calendarId: CALENDAR_ID,
      eventId,
      timeMin: new Date(originalDate.getTime() - 60 * 60 * 1000).toISOString(),
      timeMax: new Date(originalDate.getTime() + 60 * 60 * 1000).toISOString(),
    })

    const instance = instancesResponse.data.items?.[0]
    if (!instance) {
      logger.warn("rescheduleLessonEvent: no matching instance found near original date", {
        eventId,
        originalDate: originalDate.toISOString(),
      })
      return
    }

    const newEnd = new Date(newDate.getTime() + (durationMinutes ?? 60) * 60 * 1000)

    await calendar.events.patch({
      calendarId: CALENDAR_ID,
      eventId: instance.id,
      requestBody: {
        start: { dateTime: toFloatingDateTime(newDate), timeZone: CALENDAR_TIME_ZONE },
        end: { dateTime: toFloatingDateTime(newEnd), timeZone: CALENDAR_TIME_ZONE },
      },
    })

    logger.info("rescheduleLessonEvent: instance rescheduled", { eventId, instanceId: instance.id })
  } catch (error) {
    if (isNotFoundError(error)) {
      logger.warn("rescheduleLessonEvent: event not found, skipping", { eventId })
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

module.exports = { createLessonEvent, updateLessonEvent, deleteLessonEvent, rescheduleLessonEvent }
