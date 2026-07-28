const logger = require("firebase-functions/logger")
const { db } = require("./core/firestore")
const { getZonedParts, zonedTimeToUtc, SCHEDULE_TIME_ZONE } = require("./core/schedule")
const { ensureUpcomingLesson } = require("./core/lessons")
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

async function findUpcomingLessonsInWindow(windowStart, windowEnd) {
  const snapshot = await db
    .collectionGroup(LESSONS_SUBCOLLECTION)
    .where("status", "==", "upcoming")
    .where("date", ">=", windowStart)
    .where("date", "<", windowEnd)
    .get()

  return snapshot.docs
}

// dailyReminderMidday: runs once a day at 12:00 Moscow time. Reminds every
// student whose upcoming lesson falls on the Moscow calendar day "tomorrow".
async function dailyReminderMidday() {
  logger.info("dailyReminderMidday: starting")

  await ensureUpcomingDraftsForAllStudents()

  const now = new Date()
  const tomorrowMidnight = moscowMidnight(new Date(now.getTime() + 24 * 60 * 60 * 1000))
  const dayAfterTomorrowMidnight = new Date(tomorrowMidnight.getTime() + 24 * 60 * 60 * 1000)

  const lessonDocs = await findUpcomingLessonsInWindow(tomorrowMidnight, dayAfterTomorrowMidnight)

  logger.info("dailyReminderMidday: lessons found", { count: lessonDocs.length })

  for (const lessonDoc of lessonDocs) {
    const lesson = lessonDoc.data()
    const studentId = lessonDoc.ref.parent.parent.id

    if (lesson.remindersSent?.middaySent) {
      logger.info("dailyReminderMidday: already sent, skipping", { studentId, lessonId: lessonDoc.id })
      continue
    }

    try {
      const studentSnapshot = await db.collection(STUDENTS_COLLECTION).doc(studentId).get()
      if (!studentSnapshot.exists || !studentSnapshot.data().schedule) {
        continue
      }
      const student = studentSnapshot.data()

      const assignmentText = lesson.homework?.assignment?.text ?? ""
      const message = botMessages.REMINDER_MIDDAY(student.schedule.time, assignmentText)

      const sent = await sendReminderToStudent(studentId, message)

      if (sent) {
        await lessonDoc.ref.update({ "remindersSent.middaySent": true })
        logger.info("dailyReminderMidday: reminder sent", { studentId, lessonId: lessonDoc.id })
      }
    } catch (error) {
      logger.error("dailyReminderMidday: failed to send reminder", {
        studentId,
        lessonId: lessonDoc.id,
        error,
      })
    }
  }

  logger.info("dailyReminderMidday: finished")
}

// dailyReminderPreLesson: runs every hour on the hour. Reminds every student
// whose upcoming lesson starts within the next 2 hours.
async function dailyReminderPreLesson() {
  logger.info("dailyReminderPreLesson: starting")

  const now = new Date()
  const windowEnd = new Date(now.getTime() + 2 * 60 * 60 * 1000)

  const lessonDocs = await findUpcomingLessonsInWindow(now, windowEnd)

  logger.info("dailyReminderPreLesson: lessons found", { count: lessonDocs.length })

  for (const lessonDoc of lessonDocs) {
    const lesson = lessonDoc.data()
    const studentId = lessonDoc.ref.parent.parent.id

    if (lesson.remindersSent?.preLessonSent) {
      logger.info("dailyReminderPreLesson: already sent, skipping", { studentId, lessonId: lessonDoc.id })
      continue
    }

    try {
      const assignmentText = lesson.homework?.assignment?.text ?? ""
      const message = botMessages.REMINDER_PRE_LESSON(assignmentText)

      const sent = await sendReminderToStudent(studentId, message)

      if (sent) {
        await lessonDoc.ref.update({ "remindersSent.preLessonSent": true })
        logger.info("dailyReminderPreLesson: reminder sent", { studentId, lessonId: lessonDoc.id })
      }
    } catch (error) {
      logger.error("dailyReminderPreLesson: failed to send reminder", {
        studentId,
        lessonId: lessonDoc.id,
        error,
      })
    }
  }

  logger.info("dailyReminderPreLesson: finished")
}

module.exports = { dailyReminderMidday, dailyReminderPreLesson }
