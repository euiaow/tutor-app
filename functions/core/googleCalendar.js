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

function colorIdForSubject(subjectName) {
  if (!subjectName) return DEFAULT_CALENDAR_COLOR_ID
  return CALENDAR_COLOR_IDS[getSubjectColorIndex(subjectName) % CALENDAR_COLOR_IDS.length]
}

function colorIdForStudent(student) {
  return colorIdForSubject(student.subject?.[0])
}

// A teacher on the "blue" dashboard theme gets every lesson event in a fixed
// blue instead of the per-subject hash above (colorId is overridden outright,
// not blended with it) — "9" is Calendar's own Blueberry, the closest real
// colorId to the dashboard's blue accent. Every other theme keeps the
// per-subject color exactly as before.
const BLUE_THEME_CALENDAR_COLOR_ID = "9"

async function getTeacherColorOverride(teacherId) {
  if (!teacherId) return null
  try {
    const snapshot = await db.collection("teachers").doc(teacherId).get()
    return snapshot.exists && snapshot.data().colorTheme === "blue" ? BLUE_THEME_CALENDAR_COLOR_ID : null
  } catch (error) {
    logger.warn("getTeacherColorOverride: failed to read teacher colorTheme, falling back to per-subject color", { teacherId, error })
    return null
  }
}

// A slot's own subject wins when set; falls back to the student's first
// subject for slots saved before per-slot binding existed (see
// normalizeScheduleSlots) — same backward-compat rule the frontend UI uses.
function resolveSlotSubject(student, slot) {
  return slot?.subject || student.subject?.[0] || null
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

function buildEventResourceForSlot(student, slot, colorOverride) {
  const start = getNextLessonDateForSlot(slot)
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
    colorId: colorOverride ?? colorIdForSubject(resolveSlotSubject(student, slot)),
  }

  if (student.topic) {
    resource.description = student.topic
  }

  return resource
}

// Google Calendar returns 410 (not 404) for a resource that used to exist
// but was already deleted — e.g. a second delete attempt against the same
// event id. Operationally identical to a 404 for every caller here
// ("nothing to do, it's already gone"), so both are treated the same way.
function isNotFoundError(error) {
  return (
    error?.code === 404 ||
    error?.code === 410 ||
    error?.response?.status === 404 ||
    error?.response?.status === 410
  )
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
  const colorOverride = await getTeacherColorOverride(teacherId)

  const resource = {
    summary: `${student.name} (доп. урок)`,
    start: { dateTime: toFloatingDateTime(date), timeZone: CALENDAR_TIME_ZONE },
    end: { dateTime: toFloatingDateTime(end), timeZone: CALENDAR_TIME_ZONE },
    colorId: colorOverride ?? colorIdForStudent(student),
  }

  return createEventFromResource(teacherId, resource)
}

// Group counterpart of createExtraLessonEvent above — summary is the
// group's own name, colorId comes from the group's single subject
// (colorIdForSubject directly, not colorIdForStudent, since a group has no
// per-member subject list to read [0] off of).
async function createExtraGroupLessonEvent(teacherId, group, date, durationMinutes = 60) {
  const end = new Date(date.getTime() + durationMinutes * 60 * 1000)
  const colorOverride = await getTeacherColorOverride(teacherId)

  const resource = {
    summary: `${group.name} (доп. занятие)`,
    start: { dateTime: toFloatingDateTime(date), timeZone: CALENDAR_TIME_ZONE },
    end: { dateTime: toFloatingDateTime(end), timeZone: CALENDAR_TIME_ZONE },
    colorId: colorOverride ?? colorIdForSubject(group.subject),
  }

  return createEventFromResource(teacherId, resource)
}

// Diffs a set of scheduleSlots against an existing googleEventIds map
// (keyed by slot index, e.g. {"0": eventId, "1": eventId}) and creates/
// updates/deletes events so the calendar ends up with exactly one recurring
// event per slot. Returns the rebuilt map — doesn't write it anywhere
// itself, so it's equally usable for a student doc (studentRef) or a group
// doc (groupRef), which have different fields/paths to write the result
// back onto. Extracted from what used to be syncScheduleSlots's own inline
// loop (session 15/16 shape) so group lessons (session 17) can reuse the
// exact same create/update/delete diffing instead of a second hand-copied
// version — `buildResource(slot)` is the only per-caller thing (student
// events use the student's name/topic, group events use the group's
// name/subject).
async function syncSlotEvents(teacherId, logContext, scheduleSlots, existingEventIds, buildResource) {
  const nextEventIds = {}

  for (let index = 0; index < scheduleSlots.length; index += 1) {
    const key = String(index)
    const slot = scheduleSlots[index]
    const existingEventId = existingEventIds[key] ?? null
    // No teacher-profile-timezone fallback passed here on purpose — see the
    // identical comment in core/lessons.js's ensureUpcomingLesson. A slot's
    // own stamped `timeZone` always wins; a legacy slot with none falls
    // back to DEFAULT_TIME_ZONE inside buildResource/getNextLessonDateForSlot
    // rather than the teacher's current Settings preference.
    const resource = buildResource(slot)

    if (!resource) {
      logger.warn("syncSlotEvents: cannot build event, invalid slot", { ...logContext, slotIndex: index })
      if (existingEventId) {
        nextEventIds[key] = existingEventId
      }
      continue
    }

    if (existingEventId) {
      try {
        await updateEventFromResource(teacherId, existingEventId, resource)
        nextEventIds[key] = existingEventId
        logger.info("syncSlotEvents: updated event", { ...logContext, slotIndex: index, eventId: existingEventId })
      } catch (error) {
        logger.error("syncSlotEvents: update failed, keeping existing mapping", {
          ...logContext,
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
        logger.info("syncSlotEvents: created event", { ...logContext, slotIndex: index, eventId })
      } else {
        logger.warn("syncSlotEvents: create skipped, calendar not connected", { ...logContext, slotIndex: index })
      }
    } catch (error) {
      logger.error("syncSlotEvents: create failed", { ...logContext, slotIndex: index, error })
    }
  }

  for (const [key, eventId] of Object.entries(existingEventIds)) {
    if (key in nextEventIds) {
      continue
    }
    try {
      await deleteLessonEvent(teacherId, eventId)
      logger.info("syncSlotEvents: deleted stale event", { ...logContext, slotIndex: key, eventId })
    } catch (error) {
      logger.warn("syncSlotEvents: failed to delete stale event, skipping", { ...logContext, slotIndex: key, error })
    }
  }

  return nextEventIds
}

// Self-healing counterpart to syncSlotEvents: verifies every currently
// scheduled slot's recorded event id still actually resolves to a live
// Calendar event, and (re)creates whatever's missing — without touching or
// resyncing an event that's still there (no update-in-place refresh, unlike
// syncSlotEvents, which is unconditionally called on every genuine schedule
// edit). A slot can lose its event without any scheduleSlots change at all
// (the very bug this was added for: cancelling one occurrence used to delete
// the whole recurring series instead of just that instance), so relying on
// syncStudentScheduleToGoogleCalendar's "did scheduleSlots change" trigger
// alone can never recover from that — this is the lazy-repair pass, run
// once a day from dailyReminderMidday, mirroring how ensureUpcomingLesson
// lazily repairs a missing Firestore draft. Returns { eventIds, changed } so
// a caller only has to write back to Firestore when something was actually
// recreated.
async function ensureSlotEventsExist(teacherId, logContext, scheduleSlots, existingEventIds, buildResource) {
  const calendar = await getCalendarOrNull(teacherId)
  if (!calendar) {
    return { eventIds: existingEventIds, changed: false }
  }

  const nextEventIds = { ...existingEventIds }
  let changed = false

  for (let index = 0; index < scheduleSlots.length; index += 1) {
    const key = String(index)
    const slot = scheduleSlots[index]
    const existingEventId = existingEventIds[key] ?? null

    if (existingEventId) {
      try {
        // A deleted event doesn't necessarily 404/410 on get() — Calendar
        // keeps a "tombstone" around for a while and returns it successfully
        // with status: "cancelled" instead of throwing. Both cases mean the
        // same thing here: nothing left for this slot, needs recreating.
        const response = await calendar.events.get({ calendarId: CALENDAR_ID, eventId: existingEventId })
        if (response.data.status !== "cancelled") {
          continue
        }
        logger.warn("ensureSlotEventsExist: recorded event is cancelled/deleted, recreating", {
          ...logContext,
          slotIndex: index,
          eventId: existingEventId,
        })
      } catch (error) {
        if (!isNotFoundError(error)) {
          logger.warn("ensureSlotEventsExist: failed to verify event, leaving as-is", {
            ...logContext,
            slotIndex: index,
            eventId: existingEventId,
            error,
          })
          continue
        }
        logger.warn("ensureSlotEventsExist: recorded event is gone, recreating", {
          ...logContext,
          slotIndex: index,
          eventId: existingEventId,
        })
      }
    }

    const resource = buildResource(slot)
    if (!resource) {
      continue
    }

    try {
      const eventId = await createEventFromResource(teacherId, resource)
      if (eventId) {
        nextEventIds[key] = eventId
        changed = true
        logger.info("ensureSlotEventsExist: created missing event", { ...logContext, slotIndex: index, eventId })
      }
    } catch (error) {
      logger.error("ensureSlotEventsExist: failed to create missing event", { ...logContext, slotIndex: index, error })
    }
  }

  return { eventIds: nextEventIds, changed }
}

// dailyReminderMidday's per-student counterpart to ensureUpcomingLesson: call
// once a day for every scheduled student regardless of whether anything
// changed — cheap (one Calendar GET per existing slot event, nothing at all
// when Calendar isn't connected) and idempotent.
async function ensureStudentCalendarEvents(teacherId, studentId, student, studentRef) {
  const scheduleSlots = normalizeScheduleSlots(student)
  if (scheduleSlots.length === 0) {
    return
  }

  const colorOverride = await getTeacherColorOverride(teacherId)
  const { eventIds, changed } = await ensureSlotEventsExist(
    teacherId,
    { studentId },
    scheduleSlots,
    student.googleEventIds ?? {},
    (slot) => buildEventResourceForSlot(student, slot, colorOverride),
  )

  if (changed) {
    await studentRef.update({ googleEventIds: eventIds })
  }
}

// Group counterpart of ensureStudentCalendarEvents above.
async function ensureGroupCalendarEvents(teacherId, groupId, group, groupRef) {
  const scheduleSlots = normalizeScheduleSlots(group)
  if (scheduleSlots.length === 0) {
    return
  }

  const colorOverride = await getTeacherColorOverride(teacherId)
  const { eventIds, changed } = await ensureSlotEventsExist(
    teacherId,
    { groupId },
    scheduleSlots,
    group.googleEventIds ?? {},
    (slot) => buildGroupEventResourceForSlot(group, slot, colorOverride),
  )

  if (changed) {
    await groupRef.update({ googleEventIds: eventIds })
  }
}

// On-demand counterpart of the lazy daily self-heal (ensureStudentCalendar-
// Events/ensureGroupCalendarEvents, normally only run once a day via
// dailyReminderMidday's ensureUpcomingDraftsForAllStudents/ForAllGroups) —
// for one specific teacher, right now, not "eventually, tomorrow morning."
// Added for reconnecting Google Calendar under a *different* Google account:
// every existing scheduleSlots event id was created against the old
// account's calendar, so a plain get() against the new one 404s exactly the
// same way a genuinely deleted event would (event ids are scoped to a single
// calendar/account) — ensureSlotEventsExist already treats that as "missing,
// recreate," so this is really just "run the existing self-heal for this
// teacher's own students/groups immediately" rather than new recovery logic.
// Best-effort per student/group, same as the reminders.js loops it mirrors —
// one failure must never block the rest.
async function resyncTeacherCalendar(teacherId) {
  const studentsSnapshot = await db.collection("students").where("teacherId", "==", teacherId).get()
  let studentsSynced = 0
  for (const doc of studentsSnapshot.docs) {
    const student = doc.data()
    if (normalizeScheduleSlots(student).length === 0) continue
    try {
      await ensureStudentCalendarEvents(teacherId, doc.id, student, doc.ref)
      studentsSynced += 1
    } catch (error) {
      logger.error("resyncTeacherCalendar: failed to sync student", { teacherId, studentId: doc.id, error })
    }
  }

  const groupsSnapshot = await db.collection("teachers").doc(teacherId).collection("groups").get()
  let groupsSynced = 0
  for (const doc of groupsSnapshot.docs) {
    const group = doc.data()
    if (normalizeScheduleSlots(group).length === 0) continue
    try {
      await ensureGroupCalendarEvents(teacherId, doc.id, group, doc.ref)
      groupsSynced += 1
    } catch (error) {
      logger.error("resyncTeacherCalendar: failed to sync group", { teacherId, groupId: doc.id, error })
    }
  }

  logger.info("resyncTeacherCalendar: done", { teacherId, studentsSynced, groupsSynced })
  return { studentsSynced, groupsSynced }
}

async function syncScheduleSlots(teacherId, studentId, student, studentRef) {
  const scheduleSlots = normalizeScheduleSlots(student)
  const colorOverride = await getTeacherColorOverride(teacherId)
  const nextEventIds = await syncSlotEvents(
    teacherId,
    { studentId },
    scheduleSlots,
    student.googleEventIds ?? {},
    (slot) => buildEventResourceForSlot(student, slot, colorOverride),
  )
  await studentRef.update({ googleEventIds: nextEventIds })
}

// summary is the group's own name (not a student's), colorId comes from the
// group's single subject (not per-slot — a group has one subject, unlike a
// student's scheduleSlots which can bind a different subject per slot).
function buildGroupEventResourceForSlot(group, slot, colorOverride) {
  const start = getNextLessonDateForSlot(slot)
  if (!start) {
    return null
  }

  const durationMinutes = slot?.durationMinutes ?? 60
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000)

  return {
    summary: group.name,
    start: { dateTime: toFloatingDateTime(start), timeZone: CALENDAR_TIME_ZONE },
    end: { dateTime: toFloatingDateTime(end), timeZone: CALENDAR_TIME_ZONE },
    recurrence: ["RRULE:FREQ=WEEKLY"],
    colorId: colorOverride ?? colorIdForSubject(group.subject),
  }
}

async function syncGroupScheduleSlots(teacherId, groupId, group, groupRef) {
  const scheduleSlots = normalizeScheduleSlots(group)
  const colorOverride = await getTeacherColorOverride(teacherId)
  const nextEventIds = await syncSlotEvents(
    teacherId,
    { groupId },
    scheduleSlots,
    group.googleEventIds ?? {},
    (slot) => buildGroupEventResourceForSlot(group, slot, colorOverride),
  )
  await groupRef.update({ googleEventIds: nextEventIds })
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

// Cancels a single occurrence of a recurring lesson's Calendar event without
// touching the recurring series itself — same instance-lookup approach as
// rescheduleLessonEvent above (calendar.events.instances(), scoped to a
// +/-1h window around the occurrence's own date), except the matched
// instance is deleted instead of patched. Deleting the *master* event id
// directly (what deleteLessonEvent does) removes the entire weekly series —
// correct when the whole slot/lesson is genuinely going away (an extra
// lesson's own one-off event, or a deleted schedule slot/student/group), but
// wrong for cancelling just one week's occurrence of an ongoing recurring
// slot, which should leave every other occurrence (past and future) alone.
async function deleteLessonEventInstance(teacherId, eventId, originalDate) {
  if (!eventId || !originalDate) {
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
      logger.warn("deleteLessonEventInstance: no matching instance found near original date", {
        eventId,
        originalDate: originalDate.toISOString(),
      })
      return
    }

    await calendar.events.delete({
      calendarId: CALENDAR_ID,
      eventId: instance.id,
    })

    logger.info("deleteLessonEventInstance: instance deleted, series left intact", {
      eventId,
      instanceId: instance.id,
    })
  } catch (error) {
    if (isNotFoundError(error)) {
      logger.warn("deleteLessonEventInstance: event or instance not found, skipping", { eventId })
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

module.exports = {
  syncScheduleSlots,
  syncGroupScheduleSlots,
  deleteLessonEvent,
  deleteLessonEventInstance,
  rescheduleLessonEvent,
  createExtraLessonEvent,
  createExtraGroupLessonEvent,
  createEventFromResource,
  updateEventFromResource,
  ensureStudentCalendarEvents,
  ensureGroupCalendarEvents,
  resyncTeacherCalendar,
  colorIdForSubject,
}
