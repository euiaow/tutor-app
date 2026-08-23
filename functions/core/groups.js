const { randomUUID } = require("crypto")
const { FieldValue, Timestamp } = require("firebase-admin/firestore")
const { HttpsError } = require("firebase-functions/v2/https")
const logger = require("firebase-functions/logger")
const { db } = require("./firestore")
const { assertOwnsStudent, assertOwnsGroup } = require("./tenancy")
const { normalizeScheduleSlots, getUpcomingLessonDates } = require("./schedule")
const { deleteLessonEvent, rescheduleLessonEvent, createExtraGroupLessonEvent } = require("./googleCalendar")
const { createNotification } = require("./notifier")
const { markTopicsCovered, assignCurriculumTemplate } = require("./curriculum")
const { createUpcomingDraft, completeLesson } = require("./lessons")

const CURRICULUM_TEMPLATES_COLLECTION = "curriculumTemplates"
const LESSONS_COLLECTION_GROUP = "lessons"

// Group lessons (rearchitected — see activeContext.md) — a group lesson is
// NOT its own doc type any more. The moment it's created, it's fanned out
// as one real students/{studentId}/lessons/{id} "mirror" doc per member —
// the exact same shape ensureUpcomingLesson's createUpcomingDraft already
// produces for an individual lesson — tagged isGroupLesson/groupId/
// groupLessonKey/groupSlotIndex/subject/groupName. Every existing
// per-student mechanism (the teacher's "Ближайшие уроки" feed, all 3
// reminder tiers, MaterialsLibrary, lesson history, income) sees these for
// free through the same collectionGroup("lessons") queries they already
// run — nothing group-specific to duplicate there any more.
//
// groupLessonKey is what ties one occurrence's N mirrors back together —
// generated fresh (randomUUID) at creation time, not any real doc's id,
// since there's no longer a single canonical "the" lesson doc. Every
// group-level action below (reschedule/cancel/complete/edit topic) is a
// fan-out over `db.collectionGroup("lessons").where("groupLessonKey", "==",
// key)` — a single-field equality filter, so it needs no composite index.
// slotIndex on a mirror is always left null (see core/lessons.js's
// bucketUpcomingBySlot comment for why) — the group's own recurring slot
// lives in a separate groupSlotIndex field instead, so it can never collide
// with that same student's own personal schedule-slot bucketing.
//
// Reschedule/cancel are one-sided, immediate teacher actions (no propose/
// confirm dance — a shared class time isn't something one member can
// unilaterally renegotiate) — per explicit product decision. Individual-
// lesson entry points (proposeReschedule/proposeCancellation/
// cancelLessonDirectly in core/lessons.js) refuse to touch a mirror
// (assertNotGroupMirror) specifically so a student's own "перенести"/
// "отменить" flow can never desync it from the rest of the group.

function groupsCollection(teacherId) {
  return db.collection("teachers").doc(teacherId).collection("groups")
}

function groupLessonMirrors(groupLessonKey) {
  return db.collectionGroup(LESSONS_COLLECTION_GROUP).where("groupLessonKey", "==", groupLessonKey).get()
}

// A group's program is NOT a separate stored copy any more (it used to be,
// under teachers/{uid}/groups/{groupId}/programs — deleted per explicit
// correction: a student in this group AND individually assigned the same
// subject ended up with two independent, silently-diverging program docs,
// and marking a topic covered "for the group" never reached the student's
// own progress at all). Now a group just remembers which template is
// currently assigned (`group.programTemplateId`), and assigning it means:
// for each current member, reuse their existing program if they already
// have one for this subject (tagging it sourceGroupId so it's known to be
// linked, createdByGroup: false so deleting/leaving the group never deletes
// data the student already owned independently), or create a fresh one via
// assignCurriculumTemplate (createByGroup: true — this copy exists *because*
// of the group, so it's fair game to delete once unlinked). The group's own
// "progress" is computed at read time by intersecting every linked member's
// own program (client-side, see firebase/groups.js's getGroupProgramView) —
// there's nothing server-side left to keep in sync.
async function findMemberProgramForSubject(studentId, subject) {
  if (!subject) return null
  const snapshot = await db
    .collection("students")
    .doc(studentId)
    .collection("programs")
    .where("subject", "==", subject)
    .limit(1)
    .get()
  return snapshot.empty ? null : snapshot.docs[0]
}

async function assignGroupProgram(teacherId, groupId, templateId) {
  const group = await assertOwnsGroup(groupId, teacherId)
  if (!templateId || typeof templateId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор шаблона")
  }

  const templateSnapshot = await db.collection(CURRICULUM_TEMPLATES_COLLECTION).doc(templateId).get()
  if (!templateSnapshot.exists) {
    throw new HttpsError("not-found", "Шаблон программы не найден")
  }
  const subject = templateSnapshot.data().subject ?? null

  const members = Array.isArray(group.memberStudentIds) ? group.memberStudentIds : []
  const results = await Promise.allSettled(
    members.map(async (studentId) => {
      const existing = await findMemberProgramForSubject(studentId, subject)
      if (existing) {
        await existing.ref.update({ sourceGroupId: groupId, createdByGroup: false })
        return
      }
      const { programId } = await assignCurriculumTemplate(studentId, templateId)
      await db
        .collection("students")
        .doc(studentId)
        .collection("programs")
        .doc(programId)
        .update({ sourceGroupId: groupId, createdByGroup: true })
    }),
  )
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      logger.error("assignGroupProgram: failed to assign to member, continuing", {
        teacherId,
        groupId,
        studentId: members[index],
        error: result.reason,
      })
    }
  })

  await groupsCollection(teacherId).doc(groupId).update({ programTemplateId: templateId })

  logger.info("assignGroupProgram: assigned", { teacherId, groupId, templateId, memberCount: members.length })
  return { success: true, templateId }
}

// Unlinks (createdByGroup: false — a program the student already owned
// independently) or deletes (createdByGroup: true — a program that only
// exists because of this group) every member's program tied to this group.
// Shared by deleteGroupProgram and deleteGroup itself (session 28, point 5
// — deleting the whole group used to leave its program stuck on every
// member forever, since only the narrower "delete just the program" path
// ever ran this cleanup).
async function unlinkGroupPrograms(teacherId, groupId, members) {
  const results = await Promise.allSettled(
    members.map(async (studentId) => {
      const snapshot = await db
        .collection("students")
        .doc(studentId)
        .collection("programs")
        .where("sourceGroupId", "==", groupId)
        .get()
      await Promise.all(
        snapshot.docs.map((doc) =>
          doc.data().createdByGroup
            ? doc.ref.delete()
            : doc.ref.update({ sourceGroupId: FieldValue.delete(), createdByGroup: FieldValue.delete() }),
        ),
      )
    }),
  )
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      logger.error("unlinkGroupPrograms: failed for member, continuing", {
        teacherId,
        groupId,
        studentId: members[index],
        error: result.reason,
      })
    }
  })
}

async function deleteGroupProgram(teacherId, groupId) {
  const group = await assertOwnsGroup(groupId, teacherId)
  const members = Array.isArray(group.memberStudentIds) ? group.memberStudentIds : []

  await unlinkGroupPrograms(teacherId, groupId, members)
  await groupsCollection(teacherId).doc(groupId).update({ programTemplateId: FieldValue.delete() })

  logger.info("deleteGroupProgram: deleted", { teacherId, groupId, memberCount: members.length })
  return { success: true }
}

// Unlink/delete the old template's links, then assign the new one fresh —
// simpler and more correct than trying to patch program docs in place now
// that "the group's program" is just a pointer, not stored content of its
// own to overwrite.
async function reassignGroupProgram(teacherId, groupId, newTemplateId) {
  await deleteGroupProgram(teacherId, groupId)
  return assignGroupProgram(teacherId, groupId, newTemplateId)
}

function validateGroupInput({ name, subject, memberStudentIds, scheduleSlots }) {
  if (!name || typeof name !== "string" || !name.trim()) {
    throw new HttpsError("invalid-argument", "Не указано название группы")
  }
  if (!subject || typeof subject !== "string") {
    throw new HttpsError("invalid-argument", "Не указан предмет группы")
  }
  if (memberStudentIds !== undefined && !Array.isArray(memberStudentIds)) {
    throw new HttpsError("invalid-argument", "Некорректный список участников")
  }
  if (scheduleSlots !== undefined && !Array.isArray(scheduleSlots)) {
    throw new HttpsError("invalid-argument", "Некорректное расписание")
  }
}

async function createGroup(teacherId, { name, subject, memberStudentIds, scheduleSlots }) {
  validateGroupInput({ name, subject, memberStudentIds, scheduleSlots })

  const members = Array.isArray(memberStudentIds) ? [...new Set(memberStudentIds)] : []
  // Every member must actually belong to this teacher — same per-item
  // ownership check the rest of the app already uses for a list of ids
  // trusted from the request body (assertOwnsStudent throws if not).
  for (const studentId of members) {
    await assertOwnsStudent(studentId, teacherId)
  }

  const slots = normalizeScheduleSlots({ scheduleSlots })

  const ref = groupsCollection(teacherId).doc()
  await ref.set({
    name: name.trim(),
    subject,
    memberStudentIds: members,
    scheduleSlots: slots,
    teacherId,
    createdAt: FieldValue.serverTimestamp(),
  })

  logger.info("createGroup: created", { teacherId, groupId: ref.id, memberCount: members.length })
  return { id: ref.id }
}

async function updateGroup(teacherId, groupId, { name, subject, memberStudentIds, scheduleSlots }) {
  await assertOwnsGroup(groupId, teacherId)
  validateGroupInput({ name, subject, memberStudentIds, scheduleSlots })

  const members = Array.isArray(memberStudentIds) ? [...new Set(memberStudentIds)] : []
  for (const studentId of members) {
    await assertOwnsStudent(studentId, teacherId)
  }

  const slots = normalizeScheduleSlots({ scheduleSlots })

  await groupsCollection(teacherId).doc(groupId).update({
    name: name.trim(),
    subject,
    memberStudentIds: members,
    scheduleSlots: slots,
  })

  logger.info("updateGroup: updated", { teacherId, groupId, memberCount: members.length })
  return { id: groupId }
}

// Deletes the group document, every lesson mirror it ever fanned out to its
// members (any status — matches the old subcollection's own delete-
// everything behavior, just relocated), and every Calendar event the
// group's schedule slots created — member students themselves are untouched
// (they simply stop being in any group's memberStudentIds), and their own,
// unrelated individual lessons are obviously untouched too (the query below
// is scoped to this groupId). Best-effort on the Calendar deletes (same
// "log and continue" reasoning as syncScheduleSlots's own stale-event
// cleanup) so a stale/already-gone event never blocks deleting the group
// itself.
async function deleteGroup(teacherId, groupId) {
  const group = await assertOwnsGroup(groupId, teacherId)

  // Session 28, point 5 — deleting the group used to leave its program
  // stuck on every member forever (only deleteGroupProgram itself ran this
  // cleanup before). Same unlink-or-delete rule as deleteGroupProgram: a
  // member's own pre-existing program is unlinked, not deleted; one that
  // only exists because of this group is deleted with it.
  if (group.programTemplateId) {
    const members = Array.isArray(group.memberStudentIds) ? group.memberStudentIds : []
    await unlinkGroupPrograms(teacherId, groupId, members)
  }

  const eventIds = Object.values(group.googleEventIds ?? {})
  for (const eventId of eventIds) {
    try {
      await deleteLessonEvent(teacherId, eventId)
    } catch (error) {
      logger.warn("deleteGroup: failed to delete Google Calendar event, continuing", { teacherId, groupId, eventId, error })
    }
  }

  const mirrorsSnapshot = await db.collectionGroup(LESSONS_COLLECTION_GROUP).where("groupId", "==", groupId).get()
  await Promise.all(mirrorsSnapshot.docs.map((doc) => doc.ref.delete()))

  await groupsCollection(teacherId).doc(groupId).delete()

  logger.info("deleteGroup: deleted", { teacherId, groupId, mirrorsDeleted: mirrorsSnapshot.size })
  return { id: groupId }
}

// Idempotent find-or-create, one occurrence per group schedule slot —
// mirrors core/lessons.js's own ensureUpcomingLesson, just fanning each new
// occurrence out to every current member as a real lesson mirror instead of
// creating a single doc. Safe to call repeatedly (from the reminders.js
// scheduler, from the group-schedule-change trigger, and from
// completeGroupLesson right after marking an occurrence completed).
async function ensureUpcomingGroupLessons(teacherId, groupId) {
  const groupSnapshot = await groupsCollection(teacherId).doc(groupId).get()
  if (!groupSnapshot.exists) {
    logger.warn("ensureUpcomingGroupLessons: group not found", { teacherId, groupId })
    return null
  }

  const group = groupSnapshot.data()
  const scheduleSlots = normalizeScheduleSlots(group)
  if (scheduleSlots.length === 0) {
    return null
  }

  const existingUpcoming = await db
    .collectionGroup(LESSONS_COLLECTION_GROUP)
    .where("groupId", "==", groupId)
    .where("status", "==", "upcoming")
    .get()
  const keyBySlot = new Map()
  for (const doc of existingUpcoming.docs) {
    const data = doc.data()
    if (typeof data.groupSlotIndex !== "number") continue
    if (!keyBySlot.has(data.groupSlotIndex)) {
      keyBySlot.set(data.groupSlotIndex, data.groupLessonKey)
    }
  }

  const occurrences = getUpcomingLessonDates(scheduleSlots, scheduleSlots.length)
  const members = Array.isArray(group.memberStudentIds) ? group.memberStudentIds : []

  for (const occurrence of occurrences) {
    if (keyBySlot.has(occurrence.slotIndex)) {
      continue
    }

    const groupLessonKey = randomUUID()
    const durationMinutes = scheduleSlots[occurrence.slotIndex]?.durationMinutes ?? 60

    await Promise.all(
      members.map(async (studentId) => {
        const ref = await createUpcomingDraft(studentId, teacherId, null, occurrence.date, durationMinutes)
        await ref.update({
          isGroupLesson: true,
          groupId,
          groupLessonKey,
          groupSlotIndex: occurrence.slotIndex,
          subject: group.subject ?? null,
          groupName: group.name ?? "",
        })
      }),
    )

    keyBySlot.set(occurrence.slotIndex, groupLessonKey)
    logger.info("ensureUpcomingGroupLessons: created mirrors for occurrence", {
      teacherId,
      groupId,
      groupLessonKey,
      slotIndex: occurrence.slotIndex,
      memberCount: members.length,
    })
  }

  const soonestSlotIndex = occurrences[0]?.slotIndex
  return keyBySlot.get(soonestSlotIndex) ?? null
}

// Group counterpart of createExtraLesson (core/lessons.js) — an unscheduled
// one-off group occurrence. groupSlotIndex: null, same as an individual
// extra lesson's slotIndex: null, so it's invisible to
// ensureUpcomingGroupLessons' own slot bucketing exactly the same way an
// individual isExtraLesson doc is invisible to ensureUpcomingLesson.
async function createExtraGroupLesson(teacherId, groupId, date) {
  const group = await assertOwnsGroup(groupId, teacherId)
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new HttpsError("invalid-argument", "Некорректная дата занятия")
  }

  const members = Array.isArray(group.memberStudentIds) ? group.memberStudentIds : []
  const groupLessonKey = randomUUID()
  const durationMinutes = 60

  const mirrors = await Promise.all(
    members.map(async (studentId) => {
      const ref = await createUpcomingDraft(studentId, teacherId, null, date, durationMinutes)
      await ref.update({
        isGroupLesson: true,
        isExtraLesson: true,
        groupId,
        groupLessonKey,
        groupSlotIndex: null,
        subject: group.subject ?? null,
        groupName: group.name ?? "",
      })
      return { studentId, ref }
    }),
  )

  logger.info("createExtraGroupLesson: created", { teacherId, groupId, groupLessonKey, memberCount: mirrors.length })

  const calendarPromise = createExtraGroupLessonEvent(teacherId, group, date, durationMinutes)
    .then(async (googleEventId) => {
      if (googleEventId) {
        await Promise.all(mirrors.map(({ ref }) => ref.update({ googleEventId })))
      }
    })
    .catch((error) => {
      logger.error("createExtraGroupLesson: failed to create Google Calendar event", {
        teacherId,
        groupId,
        groupLessonKey,
        error,
      })
    })

  const notificationPromises = Promise.allSettled(
    mirrors.map(({ studentId, ref }) =>
      createNotification({
        target: "student",
        studentId,
        type: "extra_lesson_assigned",
        params: { lessonDate: date, groupName: group.name ?? null },
        lessonId: ref.id,
        teacherId,
      }),
    ),
  )

  await Promise.all([calendarPromise, notificationPromises])

  return { groupLessonKey }
}

// Reschedule/cancel are one-sided, immediate teacher decisions — see this
// file's own module comment for why. Both resolve the shared Calendar event
// off the FIRST mirror found (every mirror carries an identical copy of the
// same googleEventId, stamped once at creation/first-reschedule time) and
// update it exactly once, then fan the actual date/status write out to
// every mirror, then notify every member independently
// (Promise.allSettled — one student's notification failing must never block
// the others).
async function rescheduleGroupLesson(teacherId, groupId, groupLessonKey, newDate) {
  await assertOwnsGroup(groupId, teacherId)
  if (!groupLessonKey || typeof groupLessonKey !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор занятия")
  }
  if (!(newDate instanceof Date) || Number.isNaN(newDate.getTime())) {
    throw new HttpsError("invalid-argument", "Некорректная дата переноса")
  }

  const mirrorsSnapshot = await groupLessonMirrors(groupLessonKey)
  if (mirrorsSnapshot.empty) {
    throw new HttpsError("not-found", "Занятие не найдено")
  }

  const groupSnapshot = await groupsCollection(teacherId).doc(groupId).get()
  const group = groupSnapshot.exists ? groupSnapshot.data() : null
  const firstLesson = mirrorsSnapshot.docs[0].data()
  const originalDate = firstLesson.rescheduledDate?.toDate?.() ?? firstLesson.date?.toDate?.() ?? null
  const eventId = firstLesson.googleEventId ?? null

  const calendarPromise =
    eventId && originalDate
      ? rescheduleLessonEvent(teacherId, eventId, originalDate, newDate, firstLesson.durationMinutes).catch((error) => {
          logger.error("rescheduleGroupLesson: failed to reschedule Google Calendar event", {
            teacherId,
            groupId,
            groupLessonKey,
            error,
          })
        })
      : Promise.resolve()

  const writePromise = Promise.all(
    mirrorsSnapshot.docs.map((doc) =>
      doc.ref.update({
        date: Timestamp.fromDate(newDate),
        rescheduledDate: Timestamp.fromDate(newDate),
        rescheduled: true,
      }),
    ),
  )

  await Promise.all([calendarPromise, writePromise])

  logger.info("rescheduleGroupLesson: rescheduled", {
    teacherId,
    groupId,
    groupLessonKey,
    memberCount: mirrorsSnapshot.size,
  })

  const notificationResults = await Promise.allSettled(
    mirrorsSnapshot.docs.map((doc) => {
      const studentId = doc.ref.parent.parent.id
      return createNotification({
        target: "student",
        studentId,
        type: "reschedule_confirmed",
        params: { newDate, groupName: group?.name ?? null },
        lessonId: doc.id,
        teacherId,
      })
    }),
  )
  notificationResults.forEach((result) => {
    if (result.status === "rejected") {
      logger.error("rescheduleGroupLesson: notification failed", { teacherId, groupId, groupLessonKey, error: result.reason })
    }
  })

  return { groupLessonKey }
}

async function cancelGroupLesson(teacherId, groupId, groupLessonKey) {
  await assertOwnsGroup(groupId, teacherId)
  if (!groupLessonKey || typeof groupLessonKey !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор занятия")
  }

  const mirrorsSnapshot = await groupLessonMirrors(groupLessonKey)
  if (mirrorsSnapshot.empty) {
    throw new HttpsError("not-found", "Занятие не найдено")
  }

  const groupSnapshot = await groupsCollection(teacherId).doc(groupId).get()
  const group = groupSnapshot.exists ? groupSnapshot.data() : null
  const firstLesson = mirrorsSnapshot.docs[0].data()
  const eventId = firstLesson.googleEventId ?? null
  const lessonDate = firstLesson.rescheduledDate?.toDate?.() ?? firstLesson.date?.toDate?.() ?? null

  const calendarPromise = eventId
    ? deleteLessonEvent(teacherId, eventId).catch((error) => {
        logger.error("cancelGroupLesson: failed to delete Google Calendar event", { teacherId, groupId, groupLessonKey, error })
      })
    : Promise.resolve()

  const writePromise = Promise.all(mirrorsSnapshot.docs.map((doc) => doc.ref.update({ status: "cancelled" })))

  await Promise.all([calendarPromise, writePromise])

  logger.info("cancelGroupLesson: cancelled", { teacherId, groupId, groupLessonKey, memberCount: mirrorsSnapshot.size })

  const notificationResults = await Promise.allSettled(
    mirrorsSnapshot.docs.map((doc) => {
      const studentId = doc.ref.parent.parent.id
      return createNotification({
        target: "student",
        studentId,
        type: "lesson_cancelled_by_teacher",
        params: { lessonDate, groupName: group?.name ?? null },
        lessonId: doc.id,
        teacherId,
      })
    }),
  )
  notificationResults.forEach((result) => {
    if (result.status === "rejected") {
      logger.error("cancelGroupLesson: notification failed", { teacherId, groupId, groupLessonKey, error: result.reason })
    }
  })

  return { groupLessonKey }
}

// Text-match the free-text group lesson topic against this student's own
// program for the group's subject — the group lesson dialog only has a
// single free-text "Тема урока" field (no per-student ProgramTopicPicker
// like the individual HomeworkLessonDialog has), so an exact
// (case-insensitive) title match is the only signal available for "was
// this actually a topic from their program." No match, no program, or no
// topic at all is a silent no-op — same "don't fail the whole completion
// over this" principle markTopicsCovered's own "program not found" no-op
// already established.
async function markGroupLessonTopicCovered(studentId, lessonId, subject, topic) {
  if (!subject || !topic) return

  const normalizedTopic = topic.trim().toLowerCase()
  const programsSnapshot = await db
    .collection("students")
    .doc(studentId)
    .collection("programs")
    .where("subject", "==", subject)
    .limit(1)
    .get()
  if (programsSnapshot.empty) return

  const programDoc = programsSnapshot.docs[0]
  const program = programDoc.data()
  const matchedTopic = (program.topics ?? []).find(
    (topicItem) => !topicItem.covered && topicItem.title?.trim().toLowerCase() === normalizedTopic,
  )
  const matchedPrototype = (program.prototypes ?? []).find(
    (prototypeItem) => !prototypeItem.covered && prototypeItem.title?.trim().toLowerCase() === normalizedTopic,
  )

  if (matchedTopic || matchedPrototype) {
    await markTopicsCovered(studentId, lessonId, programDoc.id, {
      topicIds: matchedTopic ? [matchedTopic.id] : [],
      prototypeIds: matchedPrototype ? [matchedPrototype.id] : [],
    })
  }
}

// attendeeUpdates: { [studentId]: { attendance, homeworkDone, rating } } —
// reuses completeLesson (core/lessons.js) verbatim, once per attendee — the
// exact same status/materials-merge/balance-deduction/next-personal-draft
// handling an individual lesson completion already gets, not a separate
// reimplementation. markGroupLessonTopicCovered runs alongside it for the
// program-progress matching completeLesson itself has no notion of. A key
// present in attendeeUpdates but not among this occurrence's actual mirrors
// (e.g. a stale client) is silently ignored.
async function completeGroupLesson(teacherId, groupId, groupLessonKey, attendeeUpdates) {
  await assertOwnsGroup(groupId, teacherId)
  if (!groupLessonKey || typeof groupLessonKey !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор занятия")
  }
  if (!attendeeUpdates || typeof attendeeUpdates !== "object" || Array.isArray(attendeeUpdates)) {
    throw new HttpsError("invalid-argument", "Не указаны данные по участникам")
  }

  const mirrorsSnapshot = await groupLessonMirrors(groupLessonKey)
  if (mirrorsSnapshot.empty) {
    throw new HttpsError("not-found", "Занятие не найдено")
  }

  const attendees = mirrorsSnapshot.docs
    .map((doc) => ({ doc, studentId: doc.ref.parent.parent.id }))
    .filter(({ studentId }) => Object.prototype.hasOwnProperty.call(attendeeUpdates, studentId))

  const results = await Promise.allSettled(
    attendees.map(async ({ doc, studentId }) => {
      const { attendance, homeworkDone, rating } = attendeeUpdates[studentId] ?? {}
      const lesson = doc.data()
      await completeLesson(studentId, doc.id, { attendance, homeworkDone, rating })
      await markGroupLessonTopicCovered(studentId, doc.id, lesson.subject, lesson.topic)
    }),
  )
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      logger.error("completeGroupLesson: attendee processing failed", {
        teacherId,
        groupId,
        groupLessonKey,
        studentId: attendees[index]?.studentId,
        error: result.reason,
      })
    }
  })

  logger.info("completeGroupLesson: completed", { teacherId, groupId, groupLessonKey, memberCount: attendees.length })

  const nextKey = await ensureUpcomingGroupLessons(teacherId, groupId)
  logger.info("completeGroupLesson: ensured next upcoming group lessons", { teacherId, groupId, nextKey })

  return { groupLessonKey }
}

module.exports = {
  createGroup,
  updateGroup,
  deleteGroup,
  groupsCollection,
  ensureUpcomingGroupLessons,
  rescheduleGroupLesson,
  cancelGroupLesson,
  completeGroupLesson,
  assignGroupProgram,
  reassignGroupProgram,
  deleteGroupProgram,
  createExtraGroupLesson,
}
