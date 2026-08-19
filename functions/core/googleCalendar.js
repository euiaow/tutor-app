const { google } = require("googleapis")
const logger = require("firebase-functions/logger")
const { getAuthorizedClient } = require("./googleAuth")
const { getNextLessonDateForSlot, normalizeScheduleSlots, getZonedParts, DEFAULT_TIME_ZONE } = require("./schedule")
const { db } = require("./firestore")
const { getSubjectColorIndex } = require("./subjectColor")

const CALENDAR_ID = "primary"
// Purely an internal reference frame for the floating-dateTime round-trip
// below (toFloatingDateTime always re-derives wall-clock parts from an
// already-absolute Date through this same zone, then tags the request with
// the identical zone) — any IANA zone works here with equal correctness,
// since the two values are only ever interpreted together. Not user-facing:
// Google Calendar always displays event times per the viewer's own Google
// Account timezone setting regardless of what's sent here (see
// SettingsDialog's hint text). Left as Europe/Moscow rather than threading
// a real per-teacher zone through purely for internal consistency, since
// there is no correctness reason to change it.
const CALENDAR_TIME_ZONE = DEFAULT_TIME_ZONE

async function getTeacherTimeZone(teacherId) {
  if (!teacherId) return DEFAULT_TIME_ZONE
  const snapshot = await db.collection("teachers").doc(teacherId).get()
  return snapshot.exists ? snapshot.data().timezone || DEFAULT_TIME_ZONE : DEFAULT_TIME_ZONE
}

// Google Calendar's event colorId palette is a fixed 1-11 set (not
// arbitrary hex). Block 3 — subjects are free-form now (no fixed set of
// codes to hardcode a map against), so the color is derived the same way
// the frontend's subject tags are (getSubjectColorIndex, a deterministic
// hash of the subject name) and cycled onto Calendar's 11 real colorIds —
// same subject always gets the same colorId, consistently, without storing
// one anywhere. A student with no subject set falls back to Graphite
// (neutral gray), same as before.
const CALENDAR_COLOR_IDS = ["9", "3", "11", "5", "4", "7", "1", "2", "10", "6", "8"]
const DEFAULT_CALENDAR_COLOR_ID = "8" // Graphite

function colorIdForStudent(student) {
  const firstSubject = student.subject?.[0]
  if (!firstSubject) return DEFAULT_CALENDAR_COLOR_ID
  return CALENDAR_COLOR_IDS[getSubjectColorIndex(firstSubject) % CALENDAR_COLOR_IDS.length]
}

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

function buildEventResourceForSlot(student, slot, teacherTimeZone) {
  const start = getNextLessonDateForSlot(slot, teacherTimeZone)
  if (!start) {
    return null
  }

  const durationMinutes = slot?.durationMinutes ?? 60
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000)

  const resource = {
    summary: student.name,
    start: { dateTime: toFloatingDateTime(start), timeZone: CALENDAR_TIME_ZONE },
    end: { dateTime: toFloatingDateTime(end), timeZone: CALENDAR_TIME_ZONE },
    recurrence: ["RRULE:FREQ=WEEKLY"],
    colorId: colorIdForStudent(student),
  }

  if (student.topic) {
    resource.description = student.topic
  }

  return resource
}

function isNotFoundError(error) {
  return error?.code === 404 || error?.response?.status === 404
}

async function getCalendarOrNull(teacherId) {
  if (!teacherId) {
    logger.warn("Google Calendar sync skipped: no teacherId (legacy student predating multi-tenancy Phase 1/5)")
    return null
  }

  try {
    const client = await getAuthorizedClient(teacherId)
    return google.calendar({ version: "v3", auth: client })
  } catch (error) {
    logger.warn("Google Calendar not connected, skipping sync", { teacherId, message: error.message })
    return null
  }
}

async function createEventFromResource(teacherId, resource) {
  const calendar = await getCalendarOrNull(teacherId)
  if (!calendar) {
    return null
  }

  logger.info("createEventFromResource: sending", { requestColorId: resource.colorId, resource })
  const response = await calendar.events.insert({
    calendarId: CALENDAR_ID,
    requestBody: resource,
  })
  logger.info("createEventFromResource: Calendar API response", {
    eventId: response.data.id,
    responseColorId: response.data.colorId ?? null,
    requestColorId: resource.colorId,
  })

  return response.data.id
}

async function updateEventFromResource(teacherId, eventId, resource) {
  const calendar = await getCalendarOrNull(teacherId)
  if (!calendar) {
    return
  }

  try {
    logger.info("updateEventFromResource: sending", { eventId, requestColorId: resource.colorId, resource })
    const response = await calendar.events.update({
      calendarId: CALENDAR_ID,
      eventId,
      requestBody: resource,
    })
    logger.info("updateEventFromResource: Calendar API response", {
      eventId,
      responseColorId: response.data.colorId ?? null,
      requestColorId: resource.colorId,
    })
  } catch (error) {
    if (isNotFoundError(error)) {
      logger.warn("Google Calendar event not found, treating as already gone", { eventId })
      return
    }
    throw error
  }
}

async function createExtraLessonEvent(teacherId, student, date, durationMinutes = 60) {
  const end = new Date(date.getTime() + durationMinutes * 60 * 1000)

  const resource = {
    summary: `${student.name} (доп. урок)`,
    start: { dateTime: toFloatingDateTime(date), timeZone: CALENDAR_TIME_ZONE },
    end: { dateTime: toFloatingDateTime(end), timeZone: CALENDAR_TIME_ZONE },
    colorId: colorIdForStudent(student),
  }

  return createEventFromResource(teacherId, resource)
}

// Diffs a student's current scheduleSlots against their existing
// googleEventIds map (keyed by slot index, e.g. {"0": eventId, "1": eventId})
// and creates/updates/deletes events so the calendar ends up with exactly
// one recurring event per slot. Writes the rebuilt map back onto the
// student doc itself.
async function syncScheduleSlots(teacherId, studentId, student, studentRef) {
  const scheduleSlots = normalizeScheduleSlots(student)
  const existingEventIds = student.googleEventIds ?? {}
  const nextEventIds = {}
  const teacherTimeZone = await getTeacherTimeZone(teacherId)

  for (let index = 0; index < scheduleSlots.length; index += 1) {
    const key = String(index)
    const slot = scheduleSlots[index]
    const existingEventId = existingEventIds[key] ?? null
    const resource = buildEventResourceForSlot(student, slot, teacherTimeZone)

    if (!resource) {
      logger.warn("syncScheduleSlots: cannot build event, invalid slot", { studentId, slotIndex: index })
      if (existingEventId) {
        nextEventIds[key] = existingEventId
      }
      continue
    }

    if (existingEventId) {
      try {
        await updateEventFromResource(teacherId, existingEventId, resource)
        nextEventIds[key] = existingEventId
        logger.info("syncScheduleSlots: updated event", { studentId, slotIndex: index, eventId: existingEventId })
      } catch (error) {
        logger.error("syncScheduleSlots: update failed, keeping existing mapping", {
          studentId,
          slotIndex: index,
          eventId: existingEventId,
          error,
        })
        nextEventIds[key] = existingEventId
      }
      continue
    }

    try {
      const eventId = await createEventFromResource(teacherId, resource)
      if (eventId) {
        nextEventIds[key] = eventId
        logger.info("syncScheduleSlots: created event", { studentId, slotIndex: index, eventId })
      } else {
        logger.warn("syncScheduleSlots: create skipped, calendar not connected", { studentId, slotIndex: index })
      }
    } catch (error) {
      logger.error("syncScheduleSlots: create failed", { studentId, slotIndex: index, error })
    }
  }

  for (const [key, eventId] of Object.entries(existingEventIds)) {
    if (key in nextEventIds) {
      continue
    }
    try {
      await deleteLessonEvent(teacherId, eventId)
      logger.info("syncScheduleSlots: deleted stale event", { studentId, slotIndex: key, eventId })
    } catch (error) {
      logger.warn("syncScheduleSlots: failed to delete stale event, skipping", { studentId, slotIndex: key, error })
    }
  }

  await studentRef.update({ googleEventIds: nextEventIds })
}

// Reschedules a single occurrence of the student's recurring lesson event
// without touching the recurring series itself: looks up the specific
// instance nearest the lesson's original date via the Calendar API's
// instances() endpoint and patches just that instance's start/end. Patching
// the master event directly (as updateEventFromResource does) would shift
// the entire weekly series, not just this one lesson.
async function rescheduleLessonEvent(teacherId, eventId, originalDate, newDate, durationMinutes) {
  if (!eventId || !originalDate || !newDate) {
    return
  }

  const calendar = await getCalendarOrNull(teacherId)
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

async function deleteLessonEvent(teacherId, eventId) {
  const calendar = await getCalendarOrNull(teacherId)
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

module.exports = { syncScheduleSlots, deleteLessonEvent, rescheduleLessonEvent, createExtraLessonEvent }
