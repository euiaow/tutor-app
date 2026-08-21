const { FieldValue, Timestamp } = require("firebase-admin/firestore")
const { HttpsError } = require("firebase-functions/v2/https")
const logger = require("firebase-functions/logger")
const { db } = require("./firestore")
const { assertOwnsStudent, assertOwnsGroup } = require("./tenancy")
const { normalizeScheduleSlots, getUpcomingLessonDates } = require("./schedule")
const { deleteLessonEvent, rescheduleLessonEvent } = require("./googleCalendar")
const { createNotification } = require("./notifier")
const { deductLessonFromBalance } = require("./finance")
const { markTopicsCovered, assignCurriculumTemplate } = require("./curriculum")

const CURRICULUM_TEMPLATES_COLLECTION = "curriculumTemplates"
const GROUP_PROGRAMS_SUBCOLLECTION = "programs"

// Group lessons — teachers/{uid}/groups/{groupId}, mirroring the student
// edit form's shape (name/subject/scheduleSlots) plus memberStudentIds
// instead of a single student. teacherId is denormalized onto the doc even
// though the path already scopes it (see tenancy.js's assertOwnsGroup
// comment) — purely so the collectionGroup("lessons") queries elsewhere in
// this app (reminders, income) can filter by teacherId the same way every
// other collectionGroup query already does.
//
// Phase 2 (lesson generation + Calendar sync) and Phase 3 (completing a
// group lesson) live in this same file — ensureUpcomingGroupLessons mirrors
// core/lessons.js's ensureUpcomingLesson exactly (idempotent find-or-create
// per schedule slot), and completeGroupLesson reuses the same per-student
// building blocks completeLesson uses (deductLessonFromBalance,
// markTopicsCovered, createNotification), just looped over every attendee.

function groupsCollection(teacherId) {
  return db.collection("teachers").doc(teacherId).collection("groups")
}

// Read-only "what's this student's nearest upcoming group lesson, across
// every group they're in" — mirrors core/lessons.js's own
// getNearestUpcomingLesson shape, just reached via a collectionGroup query
// on `memberIds` instead of a single student's own subcollection. Used by
// recordHomeworkSubmission (core/lessons.js, session 17 Phase 4) to decide
// whether a bot-sent homework photo should attach to a group lesson instead
// of an individual one, whichever is actually sooner, and by the student
// dashboard's "next lesson" merge (StudentDashboard.jsx). The `memberIds`
// array-contains filter alone is enough to exclude every individual
// students/{id}/lessons/{id} doc from this collectionGroup("lessons")
// query — those never have a `memberIds` field at all, and array-contains
// on a missing field never matches (confirmed in practice, not just
// assumed, per this feature's own spec).
async function findNearestUpcomingGroupLessonForStudent(studentId) {
  const snapshot = await db
    .collectionGroup("lessons")
    .where("memberIds", "array-contains", studentId)
    .where("status", "==", "upcoming")
    .get()

  let nearestDoc = null
  let nearestDate = null
  for (const doc of snapshot.docs) {
    const data = doc.data()
    const effectiveDate = data.rescheduledDate?.toDate?.() ?? data.date?.toDate?.() ?? null
    if (!effectiveDate) continue
    if (!nearestDate || effectiveDate < nearestDate) {
      nearestDate = effectiveDate
      nearestDoc = doc
    }
  }

  if (!nearestDoc) {
    return null
  }

  const groupRef = nearestDoc.ref.parent.parent
  return {
    teacherId: nearestDoc.data().teacherId,
    groupId: groupRef.id,
    groupName: null, // caller reads it separately only if actually needed — not worth an extra doc read here every time
    lessonId: nearestDoc.id,
    effectiveDate: nearestDate,
  }
}

function groupLessonsRef(teacherId, groupId) {
  return groupsCollection(teacherId).doc(groupId).collection("lessons")
}

function groupProgramsRef(teacherId, groupId) {
  return groupsCollection(teacherId).doc(groupId).collection(GROUP_PROGRAMS_SUBCOLLECTION)
}

// Same shape as curriculum.js's own (unexported) withProgressDefaults —
// duplicated rather than imported since that function isn't exported and
// this is the only other call site that needs it.
function withGroupProgressDefaults(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    id: item.id,
    title: item.title,
    covered: false,
    coveredAt: null,
    minScoreRequired: typeof item.minScoreRequired === "number" ? item.minScoreRequired : 0,
  }))
}

// A group's own program is a SEPARATE, shared/common progress copy
// (teachers/{uid}/groups/{groupId}/programs/{programId}) — not a proxy for
// each member's individual one. Assigning a template to a group does two
// independent things: (1) creates this shared copy, whose topics/
// prototypes get marked covered manually via
// setGroupCurriculumItemCovered, entirely separate from any one student's
// own progress; (2) fans out a real assignCurriculumTemplate call to every
// current member, reusing that function completely unmodified — each
// student ends up with their own normal, independently-tracked program
// doc, exactly as if the teacher had assigned it to that student by hand.
// Per the task's own spec: "программа автоматически закрепляется за всеми
// учениками и дальше работает вся та логика ... что уже реализована для
// учеников" — this fan-out is what makes that literally true, not just
// metaphorically. One member's assignment failing doesn't roll back the
// others (Promise.allSettled), matching completeGroupLesson's own
// per-attendee fault isolation elsewhere in this file.
async function assignGroupProgram(teacherId, groupId, templateId) {
  const group = await assertOwnsGroup(groupId, teacherId)
  if (!templateId || typeof templateId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор шаблона")
  }

  const templateSnapshot = await db.collection(CURRICULUM_TEMPLATES_COLLECTION).doc(templateId).get()
  if (!templateSnapshot.exists) {
    throw new HttpsError("not-found", "Шаблон программы не найден")
  }
  const template = templateSnapshot.data()

  const programRefNew = groupProgramsRef(teacherId, groupId).doc()
  await programRefNew.set({
    subject: template.subject ?? null,
    templateId,
    examTypeId: template.examTypeId ?? null,
    teacherId,
    topics: withGroupProgressDefaults(template.topics),
    prototypes: withGroupProgressDefaults(template.prototypes),
    assignedAt: FieldValue.serverTimestamp(),
  })

  const members = Array.isArray(group.memberStudentIds) ? group.memberStudentIds : []
  const results = await Promise.allSettled(
    members.map((studentId) => assignCurriculumTemplate(studentId, templateId)),
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

  logger.info("assignGroupProgram: assigned", {
    teacherId,
    groupId,
    templateId,
    programId: programRefNew.id,
    memberCount: members.length,
  })

  return { success: true, programId: programRefNew.id }
}

// Replaces only the group's OWN shared program content — deliberately does
// NOT touch any member's already-independent individual copy (same
// "replacing a template shouldn't reach into what's now each student's own
// data" reasoning reassignProgram already uses for a single student).
async function reassignGroupProgram(teacherId, groupId, programId, newTemplateId) {
  await assertOwnsGroup(groupId, teacherId)
  if (!programId || typeof programId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор программы")
  }
  if (!newTemplateId || typeof newTemplateId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор шаблона")
  }

  const ref = groupProgramsRef(teacherId, groupId).doc(programId)
  const [programSnapshot, templateSnapshot] = await Promise.all([
    ref.get(),
    db.collection(CURRICULUM_TEMPLATES_COLLECTION).doc(newTemplateId).get(),
  ])
  if (!programSnapshot.exists) {
    throw new HttpsError("not-found", "Программа не найдена")
  }
  if (!templateSnapshot.exists) {
    throw new HttpsError("not-found", "Шаблон программы не найден")
  }
  const template = templateSnapshot.data()

  await ref.update({
    subject: template.subject ?? null,
    templateId: newTemplateId,
    examTypeId: template.examTypeId ?? null,
    topics: withGroupProgressDefaults(template.topics),
    prototypes: withGroupProgressDefaults(template.prototypes),
  })

  logger.info("reassignGroupProgram: replaced", { teacherId, groupId, programId, newTemplateId })
  return { success: true }
}

// Deletes only the group's own shared program doc — again, never touches
// any member's individual copy, same reasoning as reassignGroupProgram.
async function deleteGroupProgram(teacherId, groupId, programId) {
  await assertOwnsGroup(groupId, teacherId)
  if (!programId || typeof programId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор программы")
  }

  await groupProgramsRef(teacherId, groupId).doc(programId).delete()
  logger.info("deleteGroupProgram: deleted", { teacherId, groupId, programId })
  return { success: true }
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

// Deletes the group document, every generated lesson under it, and every
// Calendar event the group's schedule slots created — member students
// themselves are untouched (they simply stop being in any group's
// memberStudentIds). Best-effort on the Calendar deletes (same "log and
// continue" reasoning as syncScheduleSlots's own stale-event cleanup) so a
// stale/already-gone event never blocks deleting the group itself.
async function deleteGroup(teacherId, groupId) {
  const group = await assertOwnsGroup(groupId, teacherId)

  const eventIds = Object.values(group.googleEventIds ?? {})
  for (const eventId of eventIds) {
    try {
      await deleteLessonEvent(teacherId, eventId)
    } catch (error) {
      logger.warn("deleteGroup: failed to delete Google Calendar event, continuing", { teacherId, groupId, eventId, error })
    }
  }

  const lessonsSnapshot = await groupLessonsRef(teacherId, groupId).get()
  const batchDeletes = lessonsSnapshot.docs.map((doc) => doc.ref.delete())
  await Promise.all(batchDeletes)

  await groupsCollection(teacherId).doc(groupId).delete()

  logger.info("deleteGroup: deleted", { teacherId, groupId, lessonsDeleted: lessonsSnapshot.size })
  return { id: groupId }
}

// Buckets every existing "upcoming" group-lesson doc by which schedule slot
// it belongs to — identical shape to core/lessons.js's own
// bucketUpcomingBySlot for individual students, just over a different
// subcollection.
function bucketUpcomingBySlot(snapshot) {
  const bySlot = new Map()
  for (const doc of snapshot.docs) {
    const slotIndex = typeof doc.data().slotIndex === "number" ? doc.data().slotIndex : 0
    if (!bySlot.has(slotIndex)) {
      bySlot.set(slotIndex, doc)
    }
  }
  return bySlot
}

function emptyAttendee() {
  return { attendance: null, homeworkDone: false, rating: null, submissionFiles: [] }
}

function createUpcomingGroupDraft(teacherId, groupId, group, slotIndex, date, durationMinutes) {
  const attendees = {}
  for (const studentId of group.memberStudentIds ?? []) {
    attendees[studentId] = emptyAttendee()
  }

  return groupLessonsRef(teacherId, groupId).add({
    status: "upcoming",
    date: Timestamp.fromDate(date),
    rescheduledDate: null,
    slotIndex,
    subject: group.subject,
    topic: null,
    homework: { assignment: { text: "", files: [] } },
    materials: [],
    attendees,
    // Same keys as `attendees` above, kept as its own array field purely so
    // an array-contains query (collectionGroup("lessons").where("memberIds",
    // "array-contains", studentId), see Phase 4's student-side "next
    // lesson" lookup) doesn't need to enumerate a map's keys, which
    // Firestore can't query directly.
    memberIds: Object.keys(attendees),
    teacherId,
    durationMinutes: durationMinutes ?? 60,
    googleEventId: null,
    createdAt: FieldValue.serverTimestamp(),
  })
}

// Idempotent find-or-create, one draft per schedule slot — identical shape
// to core/lessons.js's ensureUpcomingLesson, just against
// teachers/{uid}/groups/{groupId}/lessons instead of
// students/{id}/lessons, and seeding `attendees`/`memberIds` from the
// group's current membership instead of nothing. Safe to call repeatedly
// (from the reminders.js scheduler, from the group-schedule-change trigger,
// and from completeGroupLesson right after marking a lesson completed).
async function ensureUpcomingGroupLessons(teacherId, groupId) {
  const groupRef = groupsCollection(teacherId).doc(groupId)
  const groupSnapshot = await groupRef.get()
  if (!groupSnapshot.exists) {
    logger.warn("ensureUpcomingGroupLessons: group not found", { teacherId, groupId })
    return null
  }

  const group = groupSnapshot.data()
  const scheduleSlots = normalizeScheduleSlots(group)
  if (scheduleSlots.length === 0) {
    return null
  }

  const existingUpcoming = await groupLessonsRef(teacherId, groupId).where("status", "==", "upcoming").get()
  const idsBySlot = new Map(
    [...bucketUpcomingBySlot(existingUpcoming).entries()].map(([slotIndex, doc]) => [slotIndex, doc.id]),
  )

  const occurrences = getUpcomingLessonDates(scheduleSlots, scheduleSlots.length)

  for (const occurrence of occurrences) {
    if (idsBySlot.has(occurrence.slotIndex)) {
      continue
    }
    const draft = await createUpcomingGroupDraft(
      teacherId,
      groupId,
      group,
      occurrence.slotIndex,
      occurrence.date,
      scheduleSlots[occurrence.slotIndex]?.durationMinutes,
    )
    idsBySlot.set(occurrence.slotIndex, draft.id)
    logger.info("ensureUpcomingGroupLessons: created draft", {
      teacherId,
      groupId,
      lessonId: draft.id,
      slotIndex: occurrence.slotIndex,
    })
  }

  const soonestSlotIndex = occurrences[0]?.slotIndex
  return idsBySlot.get(soonestSlotIndex) ?? null
}

function resolveGroupEventId(group, lesson) {
  const slotIndex = typeof lesson?.slotIndex === "number" ? lesson.slotIndex : 0
  return group?.googleEventIds?.[String(slotIndex)] ?? null
}

// Reschedule/cancel are one-sided teacher decisions for a group lesson —
// unlike individual lessons, there is no propose/confirm dance, since the
// task this was built for treats a group reschedule/cancellation as an
// already-made decision the teacher is recording, not a negotiation. Both
// functions below notify every member independently
// (Promise.allSettled — one student's notification failing must never
// block the others, same reasoning as completeGroupLesson's own attendee
// loop).
async function proposeGroupReschedule(teacherId, groupId, lessonId, newDate) {
  await assertOwnsGroup(groupId, teacherId)
  if (!lessonId || typeof lessonId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор занятия")
  }
  if (!(newDate instanceof Date) || Number.isNaN(newDate.getTime())) {
    throw new HttpsError("invalid-argument", "Некорректная дата переноса")
  }

  const lessonRef = groupLessonsRef(teacherId, groupId).doc(lessonId)
  const lessonSnapshot = await lessonRef.get()
  if (!lessonSnapshot.exists) {
    throw new HttpsError("not-found", "Занятие не найдено")
  }
  const lesson = lessonSnapshot.data()

  const groupSnapshot = await groupsCollection(teacherId).doc(groupId).get()
  const group = groupSnapshot.exists ? groupSnapshot.data() : null

  const originalDate = lesson.rescheduledDate?.toDate?.() ?? lesson.date?.toDate?.() ?? null
  const eventId = resolveGroupEventId(group, lesson)

  const calendarPromise =
    eventId && originalDate
      ? rescheduleLessonEvent(teacherId, eventId, originalDate, newDate, lesson.durationMinutes).catch((error) => {
          logger.error("proposeGroupReschedule: failed to reschedule Google Calendar event", {
            teacherId,
            groupId,
            lessonId,
            error,
          })
        })
      : Promise.resolve()

  await Promise.all([calendarPromise, lessonRef.update({ rescheduledDate: Timestamp.fromDate(newDate) })])

  logger.info("proposeGroupReschedule: rescheduled", { teacherId, groupId, lessonId })

  const memberIds = Array.isArray(lesson.memberIds) ? lesson.memberIds : []
  const notificationResults = await Promise.allSettled(
    memberIds.map((studentId) =>
      createNotification({
        target: "student",
        studentId,
        type: "group_lesson_rescheduled",
        params: { groupName: group?.name ?? "", oldDate: originalDate, newDate },
        lessonId,
        teacherId,
      }),
    ),
  )
  notificationResults.forEach((result, index) => {
    if (result.status === "rejected") {
      logger.error("proposeGroupReschedule: notification failed", {
        teacherId,
        groupId,
        lessonId,
        studentId: memberIds[index],
        error: result.reason,
      })
    }
  })

  return { id: lessonId }
}

async function cancelGroupLesson(teacherId, groupId, lessonId) {
  await assertOwnsGroup(groupId, teacherId)
  if (!lessonId || typeof lessonId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор занятия")
  }

  const lessonRef = groupLessonsRef(teacherId, groupId).doc(lessonId)
  const lessonSnapshot = await lessonRef.get()
  if (!lessonSnapshot.exists) {
    throw new HttpsError("not-found", "Занятие не найдено")
  }
  const lesson = lessonSnapshot.data()

  const groupSnapshot = await groupsCollection(teacherId).doc(groupId).get()
  const group = groupSnapshot.exists ? groupSnapshot.data() : null
  const eventId = resolveGroupEventId(group, lesson)

  // Same "delete the slot's recurring Calendar event" behavior
  // cancelLessonDirectly already uses for an individual lesson tied to a
  // recurring slot — mirrored here deliberately, not redesigned, per this
  // feature's own spec ("переиспользуй... они уже принимают teacherId").
  const calendarPromise = eventId
    ? deleteLessonEvent(teacherId, eventId).catch((error) => {
        logger.error("cancelGroupLesson: failed to delete Google Calendar event", { teacherId, groupId, lessonId, error })
      })
    : Promise.resolve()

  await Promise.all([calendarPromise, lessonRef.update({ status: "cancelled" })])

  logger.info("cancelGroupLesson: cancelled", { teacherId, groupId, lessonId })

  const lessonDate = lesson.rescheduledDate?.toDate?.() ?? lesson.date?.toDate?.() ?? null
  const memberIds = Array.isArray(lesson.memberIds) ? lesson.memberIds : []
  const notificationResults = await Promise.allSettled(
    memberIds.map((studentId) =>
      createNotification({
        target: "student",
        studentId,
        type: "group_lesson_cancelled",
        params: { groupName: group?.name ?? "", lessonDate },
        lessonId,
        teacherId,
      }),
    ),
  )
  notificationResults.forEach((result, index) => {
    if (result.status === "rejected") {
      logger.error("cancelGroupLesson: notification failed", {
        teacherId,
        groupId,
        lessonId,
        studentId: memberIds[index],
        error: result.reason,
      })
    }
  })

  return { id: lessonId }
}

// Per-attendee side effects of completing a group lesson — everything
// completeLesson (core/lessons.js) already does for an individual lesson,
// just called once per member instead of once for the one student. Never
// throws past completeGroupLesson's own Promise.allSettled wrapper; a
// failure here for one student must not affect any other student's
// processing.
async function completeGroupLessonForAttendee(teacherId, groupId, lessonId, studentId, subject, topic, groupName) {
  // Text-match the free-text group lesson topic against this student's own
  // program for the group's subject — the group lesson dialog only has a
  // single free-text "Тема урока" field (no per-student ProgramTopicPicker
  // like the individual HomeworkLessonDialog has), so an exact
  // (case-insensitive) title match is the only signal available for "was
  // this actually a topic from their program." No match, no program, or no
  // topic at all is a silent no-op — same "don't fail the whole completion
  // over this" principle markTopicsCovered's own "program not found"
  // no-op already established.
  if (subject && topic) {
    const normalizedTopic = topic.trim().toLowerCase()
    const programsSnapshot = await db
      .collection("students")
      .doc(studentId)
      .collection("programs")
      .where("subject", "==", subject)
      .limit(1)
      .get()

    if (!programsSnapshot.empty) {
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
  }

  await deductLessonFromBalance(studentId, lessonId)

  await createNotification({
    target: "student",
    studentId,
    type: "group_lesson_completed",
    params: { groupName },
    lessonId,
    teacherId,
  })
}

// attendeeUpdates: { [studentId]: { attendance, homeworkDone, rating } } —
// every key must already be a member recorded in the lesson's own
// `attendees` map (seeded at draft-creation time from the group's
// membership then, not necessarily the group's *current* membership —
// intentional, a roster shouldn't retroactively change once the lesson
// happened). Materials aren't duplicated per student (see this file's own
// module comment / activeContext.md) — MaterialsLibrary on the student
// dashboard needs to read group lessons as a second source for this to
// surface there at all, which is Phase 4 work, not this function's job.
async function completeGroupLesson(teacherId, groupId, lessonId, attendeeUpdates) {
  await assertOwnsGroup(groupId, teacherId)
  if (!lessonId || typeof lessonId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор занятия")
  }
  if (!attendeeUpdates || typeof attendeeUpdates !== "object" || Array.isArray(attendeeUpdates)) {
    throw new HttpsError("invalid-argument", "Не указаны данные по участникам")
  }

  const lessonRef = groupLessonsRef(teacherId, groupId).doc(lessonId)
  const lessonSnapshot = await lessonRef.get()
  if (!lessonSnapshot.exists) {
    throw new HttpsError("not-found", "Занятие не найдено")
  }
  const lesson = lessonSnapshot.data()
  const subject = lesson.subject ?? null
  const topic = lesson.topic ?? null

  const groupSnapshot = await groupsCollection(teacherId).doc(groupId).get()
  const groupName = groupSnapshot.exists ? groupSnapshot.data().name ?? "" : ""

  const knownMemberIds = new Set(Array.isArray(lesson.memberIds) ? lesson.memberIds : [])
  const attendeeIds = Object.keys(attendeeUpdates).filter((studentId) => knownMemberIds.has(studentId))

  const statusUpdate = { status: "completed" }
  for (const studentId of attendeeIds) {
    const { attendance, homeworkDone, rating } = attendeeUpdates[studentId] ?? {}
    statusUpdate[`attendees.${studentId}.attendance`] = attendance ?? null
    statusUpdate[`attendees.${studentId}.homeworkDone`] = Boolean(homeworkDone)
    statusUpdate[`attendees.${studentId}.rating`] = rating ?? null
  }
  await lessonRef.update(statusUpdate)
  logger.info("completeGroupLesson: lesson marked completed", {
    teacherId,
    groupId,
    lessonId,
    memberCount: attendeeIds.length,
  })

  const results = await Promise.allSettled(
    attendeeIds.map((studentId) =>
      completeGroupLessonForAttendee(teacherId, groupId, lessonId, studentId, subject, topic, groupName),
    ),
  )
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      logger.error("completeGroupLesson: attendee post-processing failed", {
        teacherId,
        groupId,
        lessonId,
        studentId: attendeeIds[index],
        error: result.reason,
      })
    }
  })

  const nextLessonId = await ensureUpcomingGroupLessons(teacherId, groupId)
  logger.info("completeGroupLesson: ensured next upcoming group lesson", { teacherId, groupId, nextLessonId })

  return { id: lessonId }
}

module.exports = {
  createGroup,
  updateGroup,
  deleteGroup,
  groupsCollection,
  groupLessonsRef,
  groupProgramsRef,
  ensureUpcomingGroupLessons,
  proposeGroupReschedule,
  cancelGroupLesson,
  completeGroupLesson,
  findNearestUpcomingGroupLessonForStudent,
  assignGroupProgram,
  reassignGroupProgram,
  deleteGroupProgram,
}
