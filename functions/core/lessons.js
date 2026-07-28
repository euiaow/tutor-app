const { randomUUID } = require("crypto")
const { Timestamp, FieldValue } = require("firebase-admin/firestore")
const { getStorage } = require("firebase-admin/storage")
const { HttpsError } = require("firebase-functions/v2/https")
const logger = require("firebase-functions/logger")
const { db } = require("./firestore")
const { getNextLessonDate } = require("./schedule")

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
    createdAt: FieldValue.serverTimestamp(),
  })

  logger.info("ensureUpcomingLesson: created upcoming lesson draft", {
    studentId,
    lessonId: draft.id,
  })

  return draft.id
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
  updateHomeworkAssignment,
  findStudentIdByChatIdentity,
  uploadHomeworkFile,
  recordHomeworkSubmission,
}
