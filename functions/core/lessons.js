const { randomUUID } = require("crypto")
const { Timestamp, FieldValue } = require("firebase-admin/firestore")
const { getStorage } = require("firebase-admin/storage")
const { HttpsError } = require("firebase-functions/v2/https")
const logger = require("firebase-functions/logger")
const { db } = require("./firestore")
const { normalizeScheduleSlots, getUpcomingLessonDates } = require("./schedule")
const botMessages = require("./botMessages")
const { rescheduleLessonEvent, deleteLessonEvent, createExtraLessonEvent } = require("./googleCalendar")
const { createNotification } = require("./notifier")
const { deductLessonFromBalance } = require("./finance")

const STUDENTS_COLLECTION = "students"
const LESSONS_SUBCOLLECTION = "lessons"

function lessonsRef(studentId) {
  return db.collection(STUDENTS_COLLECTION).doc(studentId).collection(LESSONS_SUBCOLLECTION)
}

function emptyHomework() {
  return {
    assignment: { text: "", files: [] },
    submission: { files: [], submittedAt: null },
  }
}

// durationMinutes is written directly onto the lesson doc (not just read
// live off scheduleSlots at income-calculation time) so a later schedule
// edit can't retroactively change what a past/current week's income
// calculation sees for an already-created draft.
function createUpcomingDraft(studentId, slotIndex, date, durationMinutes) {
  return lessonsRef(studentId).add({
    status: "upcoming",
    date: Timestamp.fromDate(date),
    slotIndex,
    durationMinutes: durationMinutes ?? 60,
    topic: "",
    homework: emptyHomework(),
    rescheduled: false,
    rescheduledDate: null,
    rescheduleStatus: null,
    rescheduleInitiator: null,
    rescheduleProposedDate: null,
    cancellationStatus: null,
    cancellationInitiator: null,
    proposalMessage: null,
    teacherProposalMessage: null,
    createdAt: FieldValue.serverTimestamp(),
  })
}

// Buckets every existing "upcoming" lesson doc by which schedule slot it
// belongs to (legacy docs predating multi-slot support have no slotIndex
// field and are treated as slot 0). Only the first doc found per slot is
// kept — there should never be more than one, but this stays defensive.
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

// Idempotent: for every schedule slot that doesn't already have an
// "upcoming" lesson draft, creates one. Called both from the teacher UI
// ("Подготовить урок" / after saving a schedule) and from reminders.js, so
// it must be safe to call repeatedly for the same student. Returns the id
// of the soonest upcoming lesson across all slots (occurrences is sorted
// ascending), preserving the single-lessonId contract every caller relies
// on.
async function ensureUpcomingLesson(studentId) {
  const studentRef = db.collection(STUDENTS_COLLECTION).doc(studentId)
  const studentSnapshot = await studentRef.get()

  if (!studentSnapshot.exists) {
    logger.warn("ensureUpcomingLesson: student not found", { studentId })
    return null
  }

  const scheduleSlots = normalizeScheduleSlots(studentSnapshot.data())
  if (scheduleSlots.length === 0) {
    logger.warn("ensureUpcomingLesson: no schedule set, skipping draft creation", { studentId })
    return null
  }

  const existingUpcoming = await lessonsRef(studentId).where("status", "==", "upcoming").get()
  const idsBySlot = new Map(
    [...bucketUpcomingBySlot(existingUpcoming).entries()].map(([slotIndex, doc]) => [slotIndex, doc.id]),
  )

  const occurrences = getUpcomingLessonDates(scheduleSlots, scheduleSlots.length)

  for (const occurrence of occurrences) {
    if (idsBySlot.has(occurrence.slotIndex)) {
      continue
    }
    const draft = await createUpcomingDraft(
      studentId,
      occurrence.slotIndex,
      occurrence.date,
      scheduleSlots[occurrence.slotIndex]?.durationMinutes,
    )
    idsBySlot.set(occurrence.slotIndex, draft.id)
    logger.info("ensureUpcomingLesson: created upcoming lesson draft", {
      studentId,
      lessonId: draft.id,
      slotIndex: occurrence.slotIndex,
    })
  }

  const soonestSlotIndex = occurrences[0]?.slotIndex
  return idsBySlot.get(soonestSlotIndex) ?? null
}

// The actual source of truth for "this student's next lesson" — unlike
// ensureUpcomingLesson (which only ever looks at schedule slots and is
// blind to extra/unscheduled lessons since they have slotIndex: null),
// this queries every "upcoming" doc regardless of slotIndex/isExtraLesson
// and picks the one with the soonest *effective* date (rescheduledDate if
// set, otherwise date). Firestore can't orderBy a computed field, so this
// fetches every upcoming doc (there are at most a handful per student) and
// sorts in code rather than trying to express the rescheduledDate-or-date
// fallback in the query itself. Read-only — never creates a draft, unlike
// ensureUpcomingLesson; callers that need "find or create" should keep
// using ensureUpcomingLesson for that and this for "what's next".
async function getNearestUpcomingLesson(studentId) {
  const snapshot = await lessonsRef(studentId).where("status", "==", "upcoming").get()

  if (snapshot.empty) {
    return null
  }

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

  return nearestDoc ? { id: nearestDoc.id, ...nearestDoc.data() } : null
}

// Unlike ensureUpcomingLesson (a no-op once a draft exists for every slot),
// this recomputes each slot's draft date whenever the recurring schedule
// itself changes — so editing a student's day/time actually moves their
// upcoming lesson instead of leaving it stuck on the date it was first
// created with. A lesson with an active reschedule (pending or already
// confirmed) is left alone: a one-off reschedule shouldn't be silently
// overwritten by a later schedule edit that has nothing to do with it.
// Returns the soonest upcoming lesson id across all slots, same contract as
// ensureUpcomingLesson.
async function syncUpcomingLessonToSchedule(studentId) {
  const studentSnapshot = await db.collection(STUDENTS_COLLECTION).doc(studentId).get()

  if (!studentSnapshot.exists) {
    logger.warn("syncUpcomingLessonToSchedule: student not found", { studentId })
    return null
  }

  const scheduleSlots = normalizeScheduleSlots(studentSnapshot.data())
  if (scheduleSlots.length === 0) {
    logger.info("syncUpcomingLessonToSchedule: no schedule set, nothing to sync", { studentId })
    return null
  }

  const existingUpcoming = await lessonsRef(studentId).where("status", "==", "upcoming").get()
  const bySlot = bucketUpcomingBySlot(existingUpcoming)
  const occurrences = getUpcomingLessonDates(scheduleSlots, scheduleSlots.length)
  const idsBySlot = new Map()

  for (const occurrence of occurrences) {
    const existingDoc = bySlot.get(occurrence.slotIndex)

    if (!existingDoc) {
      const draft = await createUpcomingDraft(
        studentId,
        occurrence.slotIndex,
        occurrence.date,
        scheduleSlots[occurrence.slotIndex]?.durationMinutes,
      )
      idsBySlot.set(occurrence.slotIndex, draft.id)
      logger.info("syncUpcomingLessonToSchedule: created draft for new slot", {
        studentId,
        lessonId: draft.id,
        slotIndex: occurrence.slotIndex,
      })
      continue
    }

    const existingLesson = existingDoc.data()

    if (existingLesson.rescheduleStatus) {
      logger.info("syncUpcomingLessonToSchedule: skip, lesson has an active reschedule", {
        studentId,
        lessonId: existingDoc.id,
        slotIndex: occurrence.slotIndex,
        rescheduleStatus: existingLesson.rescheduleStatus,
      })
      idsBySlot.set(occurrence.slotIndex, existingDoc.id)
      continue
    }

    await existingDoc.ref.update({ date: Timestamp.fromDate(occurrence.date) })
    idsBySlot.set(occurrence.slotIndex, existingDoc.id)
    logger.info("syncUpcomingLessonToSchedule: updated draft date to match new schedule", {
      studentId,
      lessonId: existingDoc.id,
      slotIndex: occurrence.slotIndex,
    })
  }

  const soonestSlotIndex = occurrences[0]?.slotIndex
  return idsBySlot.get(soonestSlotIndex) ?? null
}

async function updateHomeworkAssignment(studentId, lessonId, { text, files }) {
  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
  }
  if (!lessonId || typeof lessonId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор урока")
  }

  const lessonRef = lessonsRef(studentId).doc(lessonId)
  const snapshot = await lessonRef.get()

  if (!snapshot.exists) {
    throw new HttpsError("not-found", "Урок не найден")
  }

  const assignmentText = typeof text === "string" ? text : ""
  const newFiles = Array.isArray(files) ? files : []

  const lesson = snapshot.data()
  const prevText = lesson.homework?.assignment?.text ?? ""
  const prevFiles = lesson.homework?.assignment?.files ?? []

  await lessonRef.update({
    "homework.assignment": {
      text: assignmentText,
      files: newFiles,
    },
  })

  logger.info("updateHomeworkAssignment: assignment saved", { studentId, lessonId })

  const lessonDate = lesson.rescheduledDate?.toDate?.() ?? lesson.date?.toDate?.() ?? null

  const textAdded = !prevText && assignmentText
  const textChanged = prevText && assignmentText && assignmentText !== prevText
  const prevUrls = new Set(prevFiles.map((file) => file.url))
  const addedFiles = newFiles.filter((file) => !prevUrls.has(file.url))

  if (textAdded) {
    await createNotification({
      target: "student",
      studentId,
      type: "assignment_added",
      text: botMessages.ASSIGNMENT_ADDED(lessonDate, assignmentText),
      lessonId,
    })
  } else if (textChanged) {
    await createNotification({
      target: "student",
      studentId,
      type: "assignment_updated",
      text: botMessages.ASSIGNMENT_UPDATED(lessonDate, assignmentText),
      lessonId,
    })
  }

  if (addedFiles.length > 0) {
    await createNotification({
      target: "student",
      studentId,
      type: "material_added",
      text: botMessages.ASSIGNMENT_FILES_ADDED(
        lessonDate,
        addedFiles.map((file) => file.title)
      ),
      lessonId,
    })
  }
}

// Direct client write elsewhere in the app (addLessonMaterial in
// src/firebase/lessons.js) was moved to this callable-backed path solely so
// attaching a material can trigger a "material_added" notification —
// nothing about materials themselves needed server-side validation.
async function addLessonMaterial(studentId, lessonId, material) {
  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
  }
  if (!lessonId || typeof lessonId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор урока")
  }
  if (!material?.url) {
    throw new HttpsError("invalid-argument", "Некорректный материал")
  }

  const lessonRef = lessonsRef(studentId).doc(lessonId)
  const snapshot = await lessonRef.get()

  if (!snapshot.exists) {
    throw new HttpsError("not-found", "Урок не найден")
  }

  await lessonRef.update({ materials: FieldValue.arrayUnion(material) })

  logger.info("addLessonMaterial: material added", { studentId, lessonId })

  const lesson = snapshot.data()
  const lessonDate = lesson.rescheduledDate?.toDate?.() ?? lesson.date?.toDate?.() ?? null

  await createNotification({
    target: "student",
    studentId,
    type: "material_added",
    text: botMessages.MATERIAL_ADDED(lessonDate, material.title),
    lessonId,
  })
}

// Creates a one-off lesson not tied to any weekly schedule slot
// (slotIndex: null) — ensureUpcomingLesson/the schedule triggers never touch
// it since it isn't bucketed by slot. Its own googleEventId lives on the
// lesson doc itself, unlike slot-based lessons whose event id lives on the
// student's googleEventIds map.
async function createExtraLesson(studentId, date) {
  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
  }
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new HttpsError("invalid-argument", "Некорректная дата урока")
  }

  const studentRef = db.collection(STUDENTS_COLLECTION).doc(studentId)
  const studentSnapshot = await studentRef.get()

  if (!studentSnapshot.exists) {
    throw new HttpsError("not-found", "Ученик не найден")
  }

  const student = studentSnapshot.data()

  const lessonRef = await lessonsRef(studentId).add({
    status: "upcoming",
    date: Timestamp.fromDate(date),
    isExtraLesson: true,
    slotIndex: null,
    durationMinutes: 60,
    homework: emptyHomework(),
    remindersSent: { preLessonSent: false },
    createdAt: FieldValue.serverTimestamp(),
  })

  logger.info("createExtraLesson: lesson created", { studentId, lessonId: lessonRef.id })

  const googleEventId = await createExtraLessonEvent(student, date, 60)
  if (googleEventId) {
    await lessonRef.update({ googleEventId })
  }

  await createNotification({
    target: "student",
    studentId,
    type: "extra_lesson_assigned",
    text: botMessages.EXTRA_LESSON_ASSIGNED(date),
    lessonId: lessonRef.id,
  })

  return { lessonId: lessonRef.id }
}

// Called when the teacher marks a lesson done in the unified
// HomeworkLessonDialog. Assignment files get copied into lesson.materials
// (deduped by url) so they show up in the student's materials library,
// which only reads lesson.materials/completed lessons — the assignment
// itself lives under homework and isn't otherwise surfaced there.
async function completeLesson(studentId, lessonId, { attendance, homeworkDone, rating } = {}) {
  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
  }
  if (!lessonId || typeof lessonId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор урока")
  }

  const lessonRef = lessonsRef(studentId).doc(lessonId)
  const snapshot = await lessonRef.get()

  if (!snapshot.exists) {
    throw new HttpsError("not-found", "Урок не найден")
  }

  const data = snapshot.data()
  const assignmentFiles = Array.isArray(data.homework?.assignment?.files)
    ? data.homework.assignment.files
    : []
  const existingMaterials = Array.isArray(data.materials) ? data.materials : []

  const materialsByUrl = new Map()
  for (const material of [...existingMaterials, ...assignmentFiles]) {
    if (material?.url) {
      materialsByUrl.set(material.url, material)
    }
  }

  await lessonRef.update({
    status: "completed",
    attendance: attendance ?? null,
    homeworkDone: Boolean(homeworkDone),
    rating: rating ?? null,
    materials: Array.from(materialsByUrl.values()),
  })

  logger.info("completeLesson: lesson marked completed", { studentId, lessonId })

  await deductLessonFromBalance(studentId, lessonId)

  // Generate the next lesson's draft right away rather than waiting for
  // the next reminders.js run — ensureUpcomingLesson's own query already
  // filters by status === "upcoming", so it won't find the lesson we just
  // flipped to "completed" above and will correctly create a new draft.
  const nextLessonId = await ensureUpcomingLesson(studentId)
  logger.info("completeLesson: ensured next upcoming lesson", { studentId, nextLessonId })
}

// Deletes the bot message with buttons a propose* call sent to the student,
// once the other side has answered — through the bot itself (the same
// confirm*/cancel*/reject* call the button triggers) or through the website
// (the exact same call, just made via the callable instead of a bot
// callback) — so the buttons never sit there looking unanswered. One shared
// path for both channels by construction: this runs inside
// confirm/cancel/reject themselves, not in the bot adapters, so there's
// nothing channel-specific to duplicate. Never throws — deletion failing
// (message already gone, or older than the platform's delete window) isn't
// allowed to break the confirm/cancel/reject flow itself.
async function deleteOneProposalMessage(proposalMessage, context) {
  try {
    if (proposalMessage.platform === "telegram") {
      const { deleteMessage } = require("../adapters/telegram")
      await deleteMessage(proposalMessage.chatId, proposalMessage.messageId)
    } else if (proposalMessage.platform === "vk") {
      const { deleteMessage } = require("../adapters/vk")
      await deleteMessage(proposalMessage.chatId, proposalMessage.messageId)
    }
  } catch (error) {
    logger.warn("deleteProposalMessages: failed to delete bot proposal message", {
      ...context,
      proposalMessage,
      error,
    })
  }
}

// Deletes both the student-side proposal message (`lesson.proposalMessage`,
// at most one — a student only ever has one linked platform) and the
// teacher-side ones (`lesson.teacherProposalMessage`, an array — the
// teacher can have both Telegram and VK connected at once, so a single
// proposal to the teacher may have gone out as two separate bot messages).
async function deleteProposalMessages(lesson, context) {
  if (lesson?.proposalMessage) {
    await deleteOneProposalMessage(lesson.proposalMessage, context)
  }

  if (Array.isArray(lesson?.teacherProposalMessage)) {
    for (const proposalMessage of lesson.teacherProposalMessage) {
      await deleteOneProposalMessage(proposalMessage, context)
    }
  }
}

function assertRescheduleActor(value) {
  if (value !== "teacher" && value !== "student") {
    throw new HttpsError("invalid-argument", "Некорректная роль участника переноса")
  }
}

// A one-off exception for a single lesson — the recurring `schedule` on the
// student doc is left untouched. `initiator` records who proposed, so the
// *other* side is the one who has to confirm (see confirmReschedule).
async function proposeReschedule(studentId, lessonId, proposedDate, initiator) {
  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
  }
  if (!lessonId || typeof lessonId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор урока")
  }
  if (!(proposedDate instanceof Date) || Number.isNaN(proposedDate.getTime())) {
    throw new HttpsError("invalid-argument", "Некорректная дата переноса")
  }
  assertRescheduleActor(initiator)

  const lessonRef = lessonsRef(studentId).doc(lessonId)
  const snapshot = await lessonRef.get()
  if (!snapshot.exists) {
    throw new HttpsError("not-found", "Урок не найден")
  }
  const lesson = snapshot.data()

  const rescheduleStatus = initiator === "teacher" ? "pending_student" : "pending_teacher"

  await lessonRef.update({
    rescheduleProposedDate: Timestamp.fromDate(proposedDate),
    rescheduleInitiator: initiator,
    rescheduleStatus,
  })

  logger.info("proposeReschedule: proposal recorded", {
    studentId,
    lessonId,
    initiator,
    rescheduleStatus,
  })

  const oldDate = lesson.date?.toDate?.() ?? null

  if (initiator === "teacher") {
    const keyboards = botMessages.RESCHEDULE_KEYBOARDS(lessonId, studentId)
    logger.info("proposeReschedule: VK keyboard built", { studentId, lessonId, vkKeyboard: JSON.stringify(keyboards.vk) })
    const { sentMessage } = await createNotification({
      target: "student",
      studentId,
      type: "reschedule_proposed_to_student",
      text: botMessages.RESCHEDULE_PROPOSED_TO_STUDENT(oldDate, proposedDate),
      lessonId,
      telegramReplyMarkup: keyboards.telegram,
      vkKeyboard: keyboards.vk,
    })

    if (sentMessage) {
      await lessonRef.update({ proposalMessage: sentMessage })
    }
  } else {
    const studentSnapshot = await db.collection(STUDENTS_COLLECTION).doc(studentId).get()
    const studentName = studentSnapshot.exists ? studentSnapshot.data().name : "Ученик"
    const keyboards = botMessages.RESCHEDULE_KEYBOARDS_FOR_TEACHER(lessonId, studentId)
    const { sentMessages } = await createNotification({
      target: "teacher",
      studentId,
      type: "reschedule_proposed_to_teacher",
      text: botMessages.RESCHEDULE_PROPOSED_TO_TEACHER(studentName, oldDate, proposedDate),
      lessonId,
      telegramReplyMarkup: keyboards.telegram,
      vkKeyboard: keyboards.vk,
    })

    if (sentMessages && sentMessages.length > 0) {
      await lessonRef.update({ teacherProposalMessage: sentMessages })
    }
  }

  return rescheduleStatus
}

// confirmedBy is whoever is CONFIRMING, which must be the side that did NOT
// initiate — you can't confirm your own proposal.
async function confirmReschedule(studentId, lessonId, confirmedBy) {
  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
  }
  if (!lessonId || typeof lessonId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор урока")
  }
  assertRescheduleActor(confirmedBy)

  const lessonRef = lessonsRef(studentId).doc(lessonId)
  const snapshot = await lessonRef.get()
  if (!snapshot.exists) {
    throw new HttpsError("not-found", "Урок не найден")
  }
  const lesson = snapshot.data()

  const expectedStatus = confirmedBy === "teacher" ? "pending_teacher" : "pending_student"
  if (lesson.rescheduleStatus !== expectedStatus) {
    throw new HttpsError(
      "failed-precondition",
      "Нельзя подтвердить собственное предложение о переносе, либо перенос уже обработан",
    )
  }

  const proposedDate = lesson.rescheduleProposedDate
  if (!proposedDate) {
    throw new HttpsError("failed-precondition", "Нет предложенной даты переноса")
  }

  const originalDate = lesson.date?.toDate?.() ?? null

  // `date` itself moves to the confirmed time (not just rescheduledDate) so
  // every other system that reads it — reminders' date-range queries, the
  // "Ближайшие уроки" ordering, etc. — picks up the real lesson time.
  // rescheduled/rescheduledDate stay set as the "this was moved" audit trail
  // the UI badges off of.
  await lessonRef.update({
    date: proposedDate,
    rescheduledDate: proposedDate,
    rescheduleStatus: "confirmed",
    rescheduled: true,
    proposalMessage: null,
    teacherProposalMessage: null,
  })

  logger.info("confirmReschedule: reschedule confirmed", { studentId, lessonId, confirmedBy })

  await deleteProposalMessages(lesson, { studentId, lessonId })

  const newDate = proposedDate.toDate()
  const message = botMessages.RESCHEDULE_CONFIRMED(newDate)

  await createNotification({ target: "student", studentId, type: "reschedule_confirmed", text: message, lessonId })
  await createNotification({ target: "teacher", studentId, type: "reschedule_confirmed", text: message, lessonId })

  const studentSnapshot = await db.collection(STUDENTS_COLLECTION).doc(studentId).get()
  const student = studentSnapshot.exists ? studentSnapshot.data() : null

  const slotIndex = typeof lesson.slotIndex === "number" ? lesson.slotIndex : 0
  const eventId = student?.googleEventIds?.[String(slotIndex)] ?? student?.googleEventId ?? null

  if (eventId && originalDate) {
    try {
      const durationMinutes = normalizeScheduleSlots(student)[slotIndex]?.durationMinutes ?? 60
      await rescheduleLessonEvent(eventId, originalDate, newDate, durationMinutes)
    } catch (error) {
      logger.error("confirmReschedule: failed to update Google Calendar event", {
        studentId,
        lessonId,
        error,
      })
    }
  }
}

async function cancelReschedule(studentId, lessonId) {
  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
  }
  if (!lessonId || typeof lessonId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор урока")
  }

  const lessonRef = lessonsRef(studentId).doc(lessonId)
  const snapshot = await lessonRef.get()
  if (!snapshot.exists) {
    throw new HttpsError("not-found", "Урок не найден")
  }
  const lesson = snapshot.data()
  const initiator = lesson.rescheduleInitiator
  const originalDate = lesson.date?.toDate?.() ?? null

  await lessonRef.update({
    rescheduled: false,
    rescheduledDate: null,
    rescheduleStatus: null,
    rescheduleInitiator: null,
    rescheduleProposedDate: null,
    proposalMessage: null,
    teacherProposalMessage: null,
  })

  logger.info("cancelReschedule: reschedule cancelled", { studentId, lessonId })

  await deleteProposalMessages(lesson, { studentId, lessonId })

  const message = botMessages.RESCHEDULE_REJECTED(originalDate)

  // Notify whoever originally proposed — the other side is the one acting.
  if (initiator === "teacher") {
    await createNotification({ target: "teacher", studentId, type: "reschedule_rejected", text: message, lessonId })
  } else if (initiator === "student") {
    await createNotification({ target: "student", studentId, type: "reschedule_rejected", text: message, lessonId })
  }
}

function assertCancellationActor(value) {
  if (value !== "teacher" && value !== "student") {
    throw new HttpsError("invalid-argument", "Некорректная роль участника отмены")
  }
}

// Mirrors proposeReschedule: `initiator` records who proposed, so the
// *other* side is the one who has to confirm (see confirmCancellation).
async function proposeCancellation(studentId, lessonId, initiator) {
  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
  }
  if (!lessonId || typeof lessonId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор урока")
  }
  assertCancellationActor(initiator)

  const lessonRef = lessonsRef(studentId).doc(lessonId)
  const snapshot = await lessonRef.get()
  if (!snapshot.exists) {
    throw new HttpsError("not-found", "Урок не найден")
  }
  const lesson = snapshot.data()

  const cancellationStatus = initiator === "teacher" ? "pending_student" : "pending_teacher"

  await lessonRef.update({
    cancellationInitiator: initiator,
    cancellationStatus,
  })

  logger.info("proposeCancellation: proposal recorded", {
    studentId,
    lessonId,
    initiator,
    cancellationStatus,
  })

  const lessonDate = lesson.rescheduledDate?.toDate?.() ?? lesson.date?.toDate?.() ?? null

  if (initiator === "teacher") {
    const keyboards = botMessages.CANCELLATION_KEYBOARDS(lessonId, studentId)
    const { sentMessage } = await createNotification({
      target: "student",
      studentId,
      type: "cancellation_proposed_to_student",
      text: botMessages.CANCELLATION_PROPOSED_TO_STUDENT(lessonDate),
      lessonId,
      telegramReplyMarkup: keyboards.telegram,
      vkKeyboard: keyboards.vk,
    })

    if (sentMessage) {
      await lessonRef.update({ proposalMessage: sentMessage })
    }
  } else {
    const studentSnapshot = await db.collection(STUDENTS_COLLECTION).doc(studentId).get()
    const studentName = studentSnapshot.exists ? studentSnapshot.data().name : "Ученик"
    const keyboards = botMessages.CANCELLATION_KEYBOARDS_FOR_TEACHER(lessonId, studentId)
    const { sentMessages } = await createNotification({
      target: "teacher",
      studentId,
      type: "cancellation_proposed_to_teacher",
      text: botMessages.CANCELLATION_PROPOSED_TO_TEACHER(studentName, lessonDate),
      lessonId,
      telegramReplyMarkup: keyboards.telegram,
      vkKeyboard: keyboards.vk,
    })

    if (sentMessages && sentMessages.length > 0) {
      await lessonRef.update({ teacherProposalMessage: sentMessages })
    }
  }

  return cancellationStatus
}

// confirmedBy is whoever is CONFIRMING, which must be the side that did NOT
// initiate — same rule as confirmReschedule.
async function confirmCancellation(studentId, lessonId, confirmedBy) {
  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
  }
  if (!lessonId || typeof lessonId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор урока")
  }
  assertCancellationActor(confirmedBy)

  const lessonRef = lessonsRef(studentId).doc(lessonId)
  const snapshot = await lessonRef.get()
  if (!snapshot.exists) {
    throw new HttpsError("not-found", "Урок не найден")
  }
  const lesson = snapshot.data()

  const expectedStatus = confirmedBy === "teacher" ? "pending_teacher" : "pending_student"
  if (lesson.cancellationStatus !== expectedStatus) {
    throw new HttpsError(
      "failed-precondition",
      "Нельзя подтвердить собственное предложение об отмене, либо отмена уже обработана",
    )
  }

  const studentSnapshot = await db.collection(STUDENTS_COLLECTION).doc(studentId).get()
  const student = studentSnapshot.exists ? studentSnapshot.data() : null

  const slotIndex = typeof lesson.slotIndex === "number" ? lesson.slotIndex : 0
  const eventId = student?.googleEventIds?.[String(slotIndex)] ?? student?.googleEventId ?? null

  if (eventId) {
    try {
      await deleteLessonEvent(eventId)
    } catch (error) {
      logger.error("confirmCancellation: failed to delete Google Calendar event", {
        studentId,
        lessonId,
        error,
      })
    }
  }

  // Marked "cancelled" rather than deleted — same as the one-way
  // cancelLessonDirectly path below — so it still shows up in lesson
  // history instead of vanishing. The next occurrence of this slot still
  // gets its own draft created lazily (dailyReminderMidday's
  // ensureUpcomingDraftsForAllStudents, or whenever the teacher next opens
  // this student's card), not eagerly here, so a cancellation doesn't
  // immediately "resurrect" a lesson.
  await lessonRef.update({ status: "cancelled" })

  logger.info("confirmCancellation: cancellation confirmed, lesson marked cancelled", {
    studentId,
    lessonId,
    confirmedBy,
  })

  await deleteProposalMessages(lesson, { studentId, lessonId })

  const lessonDate = lesson.rescheduledDate?.toDate?.() ?? lesson.date?.toDate?.() ?? null
  const message = botMessages.CANCELLATION_CONFIRMED(lessonDate)

  await createNotification({ target: "student", studentId, type: "cancellation_confirmed", text: message, lessonId })
  await createNotification({ target: "teacher", studentId, type: "cancellation_confirmed", text: message, lessonId })
}

// One-way cancellation — teacher cancels outright, no cancellationStatus/
// cancellationInitiator pending step at all (those fields stay untouched,
// unused by this path). Same "mark status: 'cancelled', never delete" shape
// as confirmCancellation above, so both cancellation paths show up in
// lesson history identically; also doesn't call ensureUpcomingLesson for
// the same reason confirmCancellation doesn't — the slot's next occurrence
// gets its own draft lazily, not forced here.
async function cancelLessonDirectly(studentId, lessonId) {
  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
  }
  if (!lessonId || typeof lessonId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор урока")
  }

  const lessonRef = lessonsRef(studentId).doc(lessonId)
  const snapshot = await lessonRef.get()
  if (!snapshot.exists) {
    throw new HttpsError("not-found", "Урок не найден")
  }
  const lesson = snapshot.data()

  const studentSnapshot = await db.collection(STUDENTS_COLLECTION).doc(studentId).get()
  const student = studentSnapshot.exists ? studentSnapshot.data() : null

  const slotIndex = typeof lesson.slotIndex === "number" ? lesson.slotIndex : 0
  const eventId = student?.googleEventIds?.[String(slotIndex)] ?? student?.googleEventId ?? null

  if (eventId) {
    try {
      await deleteLessonEvent(eventId)
    } catch (error) {
      logger.error("cancelLessonDirectly: failed to delete Google Calendar event", {
        studentId,
        lessonId,
        error,
      })
    }
  }

  await lessonRef.update({ status: "cancelled" })

  logger.info("cancelLessonDirectly: lesson cancelled directly by teacher", { studentId, lessonId })

  const lessonDate = lesson.rescheduledDate?.toDate?.() ?? lesson.date?.toDate?.() ?? null
  await createNotification({
    target: "student",
    studentId,
    type: "lesson_cancelled_by_teacher",
    text: botMessages.LESSON_CANCELLED_BY_TEACHER(lessonDate),
    lessonId,
  })
}

async function rejectCancellation(studentId, lessonId) {
  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
  }
  if (!lessonId || typeof lessonId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор урока")
  }

  const lessonRef = lessonsRef(studentId).doc(lessonId)
  const snapshot = await lessonRef.get()
  if (!snapshot.exists) {
    throw new HttpsError("not-found", "Урок не найден")
  }
  const lesson = snapshot.data()
  const initiator = lesson.cancellationInitiator

  await lessonRef.update({
    cancellationStatus: null,
    cancellationInitiator: null,
    proposalMessage: null,
    teacherProposalMessage: null,
  })

  logger.info("rejectCancellation: cancellation rejected", { studentId, lessonId })

  await deleteProposalMessages(lesson, { studentId, lessonId })

  const message = botMessages.CANCELLATION_REJECTED()

  // Notify whoever originally proposed — the other side is the one acting.
  if (initiator === "teacher") {
    await createNotification({ target: "teacher", studentId, type: "cancellation_rejected", text: message, lessonId })
  } else if (initiator === "student") {
    await createNotification({ target: "student", studentId, type: "cancellation_rejected", text: message, lessonId })
  }
}

// Both bot adapters need this to route an incoming photo/document to the
// right student — telegramChatId/vkPeerId are set once at registration
// time (see core/registration.js) and never change afterwards.
async function findStudentIdByChatIdentity(platform, chatIdentity) {
  const field = platform === "telegram" ? "telegramChatId" : "vkPeerId"

  const snapshot = await db
    .collection(STUDENTS_COLLECTION)
    .where(field, "==", String(chatIdentity))
    .limit(1)
    .get()

  return snapshot.empty ? null : snapshot.docs[0].id
}

// Mirrors the {title, url} shape materials use elsewhere in the app, plus a
// long-lived download token in the same style the client SDK's
// getDownloadURL relies on, so the resulting link works the same way.
async function uploadHomeworkFile(studentId, buffer, contentType) {
  const bucket = getStorage().bucket()
  const filePath = `materials/${studentId}/homework_${Date.now()}`
  const file = bucket.file(filePath)
  const downloadToken = randomUUID()

  await file.save(buffer, {
    metadata: {
      contentType,
      cacheControl: "public, max-age=3600",
      metadata: { firebaseStorageDownloadTokens: downloadToken },
    },
  })

  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media&token=${downloadToken}`
}

// Note: a serverTimestamp() sentinel can't be nested inside an
// arrayUnion() element, so each file entry gets a concrete Timestamp
// instead — only the top-level submission.submittedAt uses the sentinel.
async function recordHomeworkSubmission(studentId, fileUrl) {
  // getNearestUpcomingLesson first so a submission attaches to an extra
  // (isExtraLesson) lesson when one is nearer than the next scheduled slot
  // — ensureUpcomingLesson is blind to those (see its own comment). Falls
  // back to ensureUpcomingLesson (find-or-create) only when there's no
  // upcoming lesson doc of any kind yet, same as before this fix.
  const nearest = await getNearestUpcomingLesson(studentId)
  const lessonId = nearest ? nearest.id : await ensureUpcomingLesson(studentId)

  if (!lessonId) {
    logger.warn("recordHomeworkSubmission: no upcoming lesson to attach submission to", {
      studentId,
    })
    return null
  }

  await lessonsRef(studentId)
    .doc(lessonId)
    .update({
      "homework.submission.files": FieldValue.arrayUnion({
        url: fileUrl,
        submittedAt: Timestamp.now(),
      }),
      "homework.submission.submittedAt": FieldValue.serverTimestamp(),
    })

  logger.info("recordHomeworkSubmission: submission recorded", { studentId, lessonId })

  const [studentSnapshot, lessonSnapshot] = await Promise.all([
    db.collection(STUDENTS_COLLECTION).doc(studentId).get(),
    lessonsRef(studentId).doc(lessonId).get(),
  ])
  const studentName = studentSnapshot.exists ? studentSnapshot.data().name : "Ученик"
  const lessonData = lessonSnapshot.exists ? lessonSnapshot.data() : null
  const lessonDate = lessonData?.rescheduledDate?.toDate?.() ?? lessonData?.date?.toDate?.() ?? null

  await createNotification({
    target: "teacher",
    studentId,
    type: "homework_submitted",
    text: botMessages.HOMEWORK_SUBMITTED_TO_TEACHER(studentName, lessonDate),
    lessonId,
  })
  await createNotification({
    target: "student",
    studentId,
    type: "homework_received",
    text: botMessages.HOMEWORK_RECEIVED(),
    lessonId,
  })

  return lessonId
}

module.exports = {
  ensureUpcomingLesson,
  getNearestUpcomingLesson,
  syncUpcomingLessonToSchedule,
  updateHomeworkAssignment,
  addLessonMaterial,
  createExtraLesson,
  completeLesson,
  proposeReschedule,
  confirmReschedule,
  cancelReschedule,
  proposeCancellation,
  confirmCancellation,
  cancelLessonDirectly,
  rejectCancellation,
  findStudentIdByChatIdentity,
  uploadHomeworkFile,
  recordHomeworkSubmission,
}
