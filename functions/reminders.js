const logger = require("firebase-functions/logger")
const { db } = require("./core/firestore")
const { getZonedParts, zonedTimeToUtc, SCHEDULE_TIME_ZONE } = require("./core/schedule")
const { ensureUpcomingLesson, getEffectiveLessonDate } = require("./core/lessons")
const { sendReminderToStudent } = require("./core/reminderUtils")
const botMessages = require("./core/botMessages")

const STUDENTS_COLLECTION = "students"
const LESSONS_SUBCOLLECTION = "lessons"

// Midnight (00:00) in Moscow for the given instant, as an actual UTC
// instant — used to build Moscow calendar-day query windows.
function moscowMidnight(date) {
  const parts = getZonedParts(date, SCHEDULE_TIME_ZONE)
  return zonedTimeToUtc(parts.year, parts.month, parts.day, 0, 0, SCHEDULE_TIME_ZONE)
}

// Guarantees every scheduled student has an "upcoming" lesson draft to find
// before the date-range queries below run — a student whose last lesson was
// completed (or who's never had one) otherwise has no lesson doc to match.
async function ensureUpcomingDraftsForAllStudents() {
  const snapshot = await db.collection(STUDENTS_COLLECTION).get()

  for (const doc of snapshot.docs) {
    const student = doc.data()
    if (!student.schedule) {
      continue
    }

    try {
      await ensureUpcomingLesson(doc.id)
    } catch (error) {
      logger.error("reminders: failed to ensure upcoming lesson draft", { studentId: doc.id, error })
    }
  }
}

// Fetches the single "upcoming" lesson doc for a student, if any — used
// after getEffectiveLessonDate has already decided the student is in the
// reminder window, to read/write remindersSent and homework text.
async function findUpcomingLessonDoc(studentId) {
  const snapshot = await db
    .collection(STUDENTS_COLLECTION)
    .doc(studentId)
    .collection(LESSONS_SUBCOLLECTION)
    .where("status", "==", "upcoming")
    .limit(1)
    .get()

  return snapshot.empty ? null : snapshot.docs[0]
}

// dailyReminderMidday: runs once a day at 12:00 Moscow time. Reminds every
// student whose effective next-lesson date (accounting for reschedules —
// see getEffectiveLessonDate) falls on the Moscow calendar day "tomorrow".
async function dailyReminderMidday() {
  logger.info("dailyReminderMidday: starting")

  await ensureUpcomingDraftsForAllStudents()

  const now = new Date()
  const tomorrowMidnight = moscowMidnight(new Date(now.getTime() + 24 * 60 * 60 * 1000))
  const dayAfterTomorrowMidnight = new Date(tomorrowMidnight.getTime() + 24 * 60 * 60 * 1000)

  const studentsSnapshot = await db.collection(STUDENTS_COLLECTION).get()

  for (const studentDoc of studentsSnapshot.docs) {
    const studentId = studentDoc.id
    if (!studentDoc.data().schedule) {
      continue
    }

    try {
      const effectiveDate = await getEffectiveLessonDate(studentId)
      if (!effectiveDate || effectiveDate < tomorrowMidnight || effectiveDate >= dayAfterTomorrowMidnight) {
        continue
      }

      const lessonDoc = await findUpcomingLessonDoc(studentId)
      if (!lessonDoc) {
        continue
      }
      const lesson = lessonDoc.data()

      if (lesson.remindersSent?.middaySent) {
        logger.info("dailyReminderMidday: already sent, skipping", { studentId, lessonId: lessonDoc.id })
        continue
      }

      const assignmentText = lesson.homework?.assignment?.text ?? ""
      const message = botMessages.REMINDER_MIDDAY(effectiveDate, assignmentText)

      const sent = await sendReminderToStudent(studentId, message)

      if (sent) {
        await lessonDoc.ref.update({ "remindersSent.middaySent": true })
        logger.info("dailyReminderMidday: reminder sent", { studentId, lessonId: lessonDoc.id })
      }
    } catch (error) {
      logger.error("dailyReminderMidday: failed to send reminder", { studentId, error })
    }
  }

  logger.info("dailyReminderMidday: finished")
}

// dailyReminderPreLesson: runs every hour on the hour. Reminds every student
// whose effective next-lesson date (accounting for reschedules — see
// getEffectiveLessonDate) starts within the next 2 hours.
async function dailyReminderPreLesson() {
  logger.info("dailyReminderPreLesson: starting")

  const now = new Date()
  const windowEnd = new Date(now.getTime() + 2 * 60 * 60 * 1000)

  const studentsSnapshot = await db.collection(STUDENTS_COLLECTION).get()

  for (const studentDoc of studentsSnapshot.docs) {
    const studentId = studentDoc.id
    if (!studentDoc.data().schedule) {
      continue
    }

    try {
      const effectiveDate = await getEffectiveLessonDate(studentId)
      if (!effectiveDate || effectiveDate < now || effectiveDate >= windowEnd) {
        continue
      }

      const lessonDoc = await findUpcomingLessonDoc(studentId)
      if (!lessonDoc) {
        continue
      }
      const lesson = lessonDoc.data()

      if (lesson.remindersSent?.preLessonSent) {
        logger.info("dailyReminderPreLesson: already sent, skipping", { studentId, lessonId: lessonDoc.id })
        continue
      }

      const assignmentText = lesson.homework?.assignment?.text ?? ""
      const message = botMessages.buildPreLessonMessage(effectiveDate, assignmentText)

      const sent = await sendReminderToStudent(studentId, message)

      if (sent) {
        await lessonDoc.ref.update({ "remindersSent.preLessonSent": true })
        logger.info("dailyReminderPreLesson: reminder sent", { studentId, lessonId: lessonDoc.id })
      }
    } catch (error) {
      logger.error("dailyReminderPreLesson: failed to send reminder", { studentId, error })
    }
  }

  logger.info("dailyReminderPreLesson: finished")
}

module.exports = { dailyReminderMidday, dailyReminderPreLesson }
