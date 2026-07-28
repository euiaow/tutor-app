const { randomUUID } = require("crypto")
const { Timestamp, FieldValue } = require("firebase-admin/firestore")
const { getStorage } = require("firebase-admin/storage")
const { HttpsError } = require("firebase-functions/v2/https")
const logger = require("firebase-functions/logger")
const { db } = require("./firestore")
const { getNextLessonDate } = require("./schedule")
const botMessages = require("./botMessages")
const { rescheduleLessonEvent } = require("./googleCalendar")

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

// Idempotent: if an upcoming lesson already exists for this student, its id
// is returned as-is rather than creating a second draft. Called both from
// the teacher UI ("Подготовить урок") and from reminders.js, so it must be
// safe to call repeatedly for the same student.
async function ensureUpcomingLesson(studentId) {
  const studentRef = db.collection(STUDENTS_COLLECTION).doc(studentId)
  const studentSnapshot = await studentRef.get()

  if (!studentSnapshot.exists) {
    logger.warn("ensureUpcomingLesson: student not found", { studentId })
    return null
  }

  const existingUpcoming = await lessonsRef(studentId)
    .where("status", "==", "upcoming")
    .limit(1)
    .get()

  if (!existingUpcoming.empty) {
    const existingId = existingUpcoming.docs[0].id
    logger.info("ensureUpcomingLesson: upcoming lesson already exists", {
      studentId,
      lessonId: existingId,
    })
    return existingId
  }

  const schedule = studentSnapshot.data().schedule
  const nextDate = getNextLessonDate(schedule)

  if (!nextDate) {
    logger.warn("ensureUpcomingLesson: no schedule set, skipping draft creation", { studentId })
    return null
  }

  const draft = await lessonsRef(studentId).add({
    status: "upcoming",
    date: Timestamp.fromDate(nextDate),
    topic: "",
    homework: emptyHomework(),
    rescheduled: false,
    rescheduledDate: null,
    rescheduleStatus: null,
    rescheduleInitiator: null,
    rescheduleProposedDate: null,
    createdAt: FieldValue.serverTimestamp(),
  })

  logger.info("ensureUpcomingLesson: created upcoming lesson draft", {
    studentId,
    lessonId: draft.id,
  })

  return draft.id
}

// Unlike ensureUpcomingLesson (a no-op once a draft exists), this recomputes
// the draft's date whenever the recurring schedule itself changes — so
// editing a student's day/time actually moves their upcoming lesson instead
// of leaving it stuck on the date it was first created with. A lesson with
// an active reschedule (pending or already confirmed) is left alone: a
// one-off reschedule shouldn't be silently overwritten by a later schedule
// edit that has nothing to do with it.
async function syncUpcomingLessonToSchedule(studentId) {
  const studentSnapshot = await db.collection(STUDENTS_COLLECTION).doc(studentId).get()

  if (!studentSnapshot.exists) {
    logger.warn("syncUpcomingLessonToSchedule: student not found", { studentId })
    return null
  }

  const schedule = studentSnapshot.data().schedule
  const nextDate = getNextLessonDate(schedule)

  if (!nextDate) {
    logger.info("syncUpcomingLessonToSchedule: no schedule set, nothing to sync", { studentId })
    return null
  }

  const existingUpcoming = await lessonsRef(studentId).where("status", "==", "upcoming").limit(1).get()

  if (existingUpcoming.empty) {
    return ensureUpcomingLesson(studentId)
  }

  const existingDoc = existingUpcoming.docs[0]
  const existingLesson = existingDoc.data()

  if (existingLesson.rescheduleStatus) {
    logger.info("syncUpcomingLessonToSchedule: skip, lesson has an active reschedule", {
      studentId,
      lessonId: existingDoc.id,
      rescheduleStatus: existingLesson.rescheduleStatus,
    })
    return existingDoc.id
  }

  await existingDoc.ref.update({ date: Timestamp.fromDate(nextDate) })

  logger.info("syncUpcomingLessonToSchedule: updated draft date to match new schedule", {
    studentId,
    lessonId: existingDoc.id,
  })

  return existingDoc.id
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

  await lessonRef.update({
    "homework.assignment": {
      text: typeof text === "string" ? text : "",
      files: Array.isArray(files) ? files : [],
    },
  })

  logger.info("updateHomeworkAssignment: assignment saved", { studentId, lessonId })
}

// Called when the teacher marks a lesson done in the unified
// HomeworkLessonDialog. Assignment files get copied into lesson.materials
// (deduped by url) so they show up in the student's materials library,
// which only reads lesson.materials/completed lessons — the assignment
// itself lives under homework and isn't otherwise surfaced there.
async function completeLesson(studentId, lessonId, { attendance, homeworkDone, rating, topic } = {}) {
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
    topic: typeof topic === "string" ? topic.trim() : "",
    materials: Array.from(materialsByUrl.values()),
  })

  logger.info("completeLesson: lesson marked completed", { studentId, lessonId })

  // Generate the next lesson's draft right away rather than waiting for
  // the next reminders.js run — ensureUpcomingLesson's own query already
  // filters by status === "upcoming", so it won't find the lesson we just
  // flipped to "completed" above and will correctly create a new draft.
  const nextLessonId = await ensureUpcomingLesson(studentId)
  logger.info("completeLesson: ensured next upcoming lesson", { studentId, nextLessonId })
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

  // Required lazily: reminderUtils/teacherNotifier pull in the bot adapters,
  // which require this module for findStudentIdByChatIdentity etc. — a
  // top-level require here would create a circular require. By call time
  // the whole module graph has already finished loading, so this is safe.
  const { sendReminderToStudent } = require("./reminderUtils")
  const { sendMessageToTeacher } = require("./teacherNotifier")

  const oldDate = lesson.date?.toDate?.() ?? null

  if (initiator === "teacher") {
    const keyboards = botMessages.RESCHEDULE_KEYBOARDS(lessonId)
    await sendReminderToStudent(studentId, botMessages.RESCHEDULE_PROPOSED_TO_STUDENT(oldDate, proposedDate), {
      telegramReplyMarkup: keyboards.telegram,
      vkKeyboard: keyboards.vk,
    })
  } else {
    const studentSnapshot = await db.collection(STUDENTS_COLLECTION).doc(studentId).get()
    const studentName = studentSnapshot.exists ? studentSnapshot.data().name : "Ученик"
    await sendMessageToTeacher(botMessages.RESCHEDULE_PROPOSED_TO_TEACHER(studentName, oldDate, proposedDate))
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
  })

  logger.info("confirmReschedule: reschedule confirmed", { studentId, lessonId, confirmedBy })

  const { sendReminderToStudent } = require("./reminderUtils")
  const { sendMessageToTeacher } = require("./teacherNotifier")

  const newDate = proposedDate.toDate()
  const message = botMessages.RESCHEDULE_CONFIRMED(newDate)

  await sendReminderToStudent(studentId, message)
  await sendMessageToTeacher(message)

  const studentSnapshot = await db.collection(STUDENTS_COLLECTION).doc(studentId).get()
  const student = studentSnapshot.exists ? studentSnapshot.data() : null

  if (student?.googleEventId && originalDate) {
    try {
      await rescheduleLessonEvent(
        student.googleEventId,
        originalDate,
        newDate,
        student.schedule?.durationMinutes ?? 60,
      )
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
  const initiator = snapshot.data().rescheduleInitiator

  await lessonRef.update({
    rescheduled: false,
    rescheduledDate: null,
    rescheduleStatus: null,
    rescheduleInitiator: null,
    rescheduleProposedDate: null,
  })

  logger.info("cancelReschedule: reschedule cancelled", { studentId, lessonId })

  const { sendReminderToStudent } = require("./reminderUtils")
  const { sendMessageToTeacher } = require("./teacherNotifier")

  const message = botMessages.RESCHEDULE_REJECTED()

  // Notify whoever originally proposed — the other side is the one acting.
  if (initiator === "teacher") {
    await sendMessageToTeacher(message)
  } else if (initiator === "student") {
    await sendReminderToStudent(studentId, message)
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
  const lessonId = await ensureUpcomingLesson(studentId)

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

  return lessonId
}

module.exports = {
  ensureUpcomingLesson,
  syncUpcomingLessonToSchedule,
  updateHomeworkAssignment,
  completeLesson,
  proposeReschedule,
  confirmReschedule,
  cancelReschedule,
  findStudentIdByChatIdentity,
  uploadHomeworkFile,
  recordHomeworkSubmission,
}
