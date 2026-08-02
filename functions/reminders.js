const logger = require("firebase-functions/logger")
const { Timestamp } = require("firebase-admin/firestore")
const { db } = require("./core/firestore")
const { getZonedParts, zonedTimeToUtc, normalizeScheduleSlots, SCHEDULE_TIME_ZONE } = require("./core/schedule")
const { ensureUpcomingLesson } = require("./core/lessons")
const { createNotification } = require("./core/notifier")
const botMessages = require("./core/botMessages")

const STUDENTS_COLLECTION = "students"
const LESSONS_SUBCOLLECTION = "lessons"
const PRE_LESSON_THROTTLE_MS = 30 * 60 * 1000

function lessonsRef(studentId) {
  return db.collection(STUDENTS_COLLECTION).doc(studentId).collection(LESSONS_SUBCOLLECTION)
}

// Midnight (00:00) in Moscow for the given instant, as an actual UTC
// instant — used to build Moscow calendar-day query windows.
function moscowMidnight(date) {
  const parts = getZonedParts(date, SCHEDULE_TIME_ZONE)
  return zonedTimeToUtc(parts.year, parts.month, parts.day, 0, 0, SCHEDULE_TIME_ZONE)
}

function isSameMoscowDay(a, b) {
  const partsA = getZonedParts(a, SCHEDULE_TIME_ZONE)
  const partsB = getZonedParts(b, SCHEDULE_TIME_ZONE)
  return partsA.year === partsB.year && partsA.month === partsB.month && partsA.day === partsB.day
}

// Guarantees every scheduled student has an "upcoming" lesson draft to find
// before the date-range queries below run — a student whose last lesson was
// completed (or who's never had one) otherwise has no lesson doc to match.
async function ensureUpcomingDraftsForAllStudents() {
  const snapshot = await db.collection(STUDENTS_COLLECTION).get()

  for (const doc of snapshot.docs) {
    const student = doc.data()
    if (normalizeScheduleSlots(student).length === 0) {
      continue
    }

    try {
      await ensureUpcomingLesson(doc.id)
    } catch (error) {
      logger.error("reminders: failed to ensure upcoming lesson draft", { studentId: doc.id, error })
    }
  }
}

// Every "upcoming" lesson for a student, ordered soonest first — a student
// can have more than one at once now that a schedule can have multiple
// slots.
async function getUpcomingLessons(studentId) {
  const snapshot = await lessonsRef(studentId).where("status", "==", "upcoming").orderBy("date", "asc").get()
  return snapshot.docs
}

function effectiveLessonDate(lesson) {
  return lesson.rescheduledDate?.toDate?.() ?? lesson.date?.toDate?.() ?? null
}

// dailyReminderMidday: runs once a day at 9:00 Moscow time. For every
// student with at least one upcoming lesson between now and the end of
// tomorrow (Moscow calendar day), sends a single combined reminder message
// listing every such lesson — rather than one message per lesson — so a
// student with two lessons this window gets one text, not two.
async function dailyReminderMidday() {
  logger.info("dailyReminderMidday: starting")

  await ensureUpcomingDraftsForAllStudents()

  const now = new Date()
  const windowStart = now
  const windowEnd = moscowMidnight(new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000))

  const studentsSnapshot = await db.collection(STUDENTS_COLLECTION).get()

  for (const studentDoc of studentsSnapshot.docs) {
    const studentId = studentDoc.id
    const student = studentDoc.data()

    if (normalizeScheduleSlots(student).length === 0) {
      continue
    }

    const middaySentDate = student.remindersSent?.middaySentDate?.toDate?.() ?? null
    if (middaySentDate && isSameMoscowDay(middaySentDate, now)) {
      continue
    }

    try {
      const upcomingDocs = await getUpcomingLessons(studentId)

      const lessonsInWindow = []
      for (const doc of upcomingDocs) {
        const lesson = doc.data()
        const date = effectiveLessonDate(lesson)
        if (!date || date < windowStart || date >= windowEnd) {
          continue
        }
        lessonsInWindow.push({ date, assignmentText: lesson.homework?.assignment?.text ?? "" })
      }

      if (lessonsInWindow.length === 0) {
        continue
      }

      const message = botMessages.REMINDER_MIDDAY_SUMMARY(lessonsInWindow, now)
      const { delivered } = await createNotification({
        target: "student",
        studentId,
        type: "lesson_reminder_midday",
        text: message,
        lessonId: null,
      })

      if (delivered) {
        await studentDoc.ref.update({ "remindersSent.middaySentDate": Timestamp.fromDate(now) })
        logger.info("dailyReminderMidday: reminder sent", { studentId, lessonCount: lessonsInWindow.length })
      }
    } catch (error) {
      logger.error("dailyReminderMidday: failed to send reminder", { studentId, error })
    }
  }

  logger.info("dailyReminderMidday: finished")
}

// dailyReminderPreLesson: runs every hour on the hour. Reminds a student
// about each upcoming lesson starting within the next 2 hours, skipping a
// lesson that's already been reminded (per-lesson flag) or if any
// pre-lesson reminder already went out to this student within the last 30
// minutes (cross-lesson throttle, so two closely-spaced lessons don't
// produce back-to-back texts).
async function dailyReminderPreLesson() {
  logger.info("dailyReminderPreLesson: starting")

  const now = new Date()
  const windowEnd = new Date(now.getTime() + 2 * 60 * 60 * 1000)

  const studentsSnapshot = await db.collection(STUDENTS_COLLECTION).get()

  for (const studentDoc of studentsSnapshot.docs) {
    const studentId = studentDoc.id
    const student = studentDoc.data()

    if (normalizeScheduleSlots(student).length === 0) {
      continue
    }

    try {
      const upcomingDocs = await getUpcomingLessons(studentId)

      for (const lessonDoc of upcomingDocs) {
        const lesson = lessonDoc.data()
        const date = effectiveLessonDate(lesson)
        if (!date || date < now || date >= windowEnd) {
          continue
        }

        if (lesson.remindersSent?.preLessonSent) {
          continue
        }

        const lastSentAt = student.remindersSent?.lastPreLessonSentAt?.toDate?.() ?? null
        if (lastSentAt && now.getTime() - lastSentAt.getTime() < PRE_LESSON_THROTTLE_MS) {
          logger.info("dailyReminderPreLesson: throttled, recent reminder already sent to this student", {
            studentId,
            lessonId: lessonDoc.id,
          })
          continue
        }

        const assignmentText = lesson.homework?.assignment?.text ?? ""
        const message = botMessages.buildPreLessonMessage(date, assignmentText)

        const { delivered } = await createNotification({
          target: "student",
          studentId,
          type: "lesson_reminder_preLesson",
          text: message,
          lessonId: lessonDoc.id,
        })

        if (delivered) {
          const sentTimestamp = Timestamp.fromDate(now)
          await lessonDoc.ref.update({ "remindersSent.preLessonSent": true })
          await studentDoc.ref.update({ "remindersSent.lastPreLessonSentAt": sentTimestamp })
          student.remindersSent = { ...student.remindersSent, lastPreLessonSentAt: sentTimestamp }
          logger.info("dailyReminderPreLesson: reminder sent", { studentId, lessonId: lessonDoc.id })
        }
      }
    } catch (error) {
      logger.error("dailyReminderPreLesson: failed to send reminder", { studentId, error })
    }
  }

  logger.info("dailyReminderPreLesson: finished")
}

// dailyReminderTenMin: runs every 5 minutes. A third, independent tier on
// top of dailyReminderMidday and dailyReminderPreLesson — reminds a student
// about each upcoming lesson starting within the next 15 minutes (wider than
// the "10 minutes" in the message text itself, as a buffer against the 5-min
// cron cadence) and is gated purely by its own per-lesson flag, so it never
// interferes with (or gets throttled by) the 2-hour pre-lesson reminder.
async function dailyReminderTenMin() {
  logger.info("dailyReminderTenMin: starting")

  const now = new Date()
  const windowEnd = new Date(now.getTime() + 15 * 60 * 1000)

  const studentsSnapshot = await db.collection(STUDENTS_COLLECTION).get()

  for (const studentDoc of studentsSnapshot.docs) {
    const studentId = studentDoc.id
    const student = studentDoc.data()

    if (normalizeScheduleSlots(student).length === 0) {
      continue
    }

    try {
      const upcomingDocs = await getUpcomingLessons(studentId)

      for (const lessonDoc of upcomingDocs) {
        const lesson = lessonDoc.data()
        const date = effectiveLessonDate(lesson)
        if (!date || date < now || date >= windowEnd) {
          continue
        }

        if (lesson.remindersSent?.tenMinSent) {
          continue
        }

        const assignmentText = lesson.homework?.assignment?.text ?? ""
        const message = botMessages.buildTenMinuteReminderMessage(assignmentText)

        const { delivered } = await createNotification({
          target: "student",
          studentId,
          type: "lesson_soon",
          text: message,
          lessonId: lessonDoc.id,
        })

        if (delivered) {
          await lessonDoc.ref.update({ "remindersSent.tenMinSent": true })
          logger.info("dailyReminderTenMin: reminder sent", { studentId, lessonId: lessonDoc.id })
        }
      }
    } catch (error) {
      logger.error("dailyReminderTenMin: failed to send reminder", { studentId, error })
    }
  }

  logger.info("dailyReminderTenMin: finished")
}

const VIDEO_CALL_WINDOW_BEFORE_MS = 10 * 60 * 1000
const VIDEO_CALL_WINDOW_AFTER_MS = 60 * 60 * 1000

// updateVideoCallAvailability: runs every 5 minutes. Flags each upcoming
// lesson's videoCallAvailable true while its effective date falls in
// [now-10min, now+60min] — active a little before the lesson and for a
// while after it starts, not switched off the instant it begins — and false
// otherwise. A separate, independent tier from dailyReminderTenMin (whose
// window is narrower and one-directional, and which sends a bot message
// rather than gating a UI button): this only maintains a Firestore flag the
// student dashboard's "Подключиться" button reads, no notification
// involved. Unlike the reminder tiers above, this doesn't skip students
// with no schedule slots — an extra (unscheduled) lesson still needs its
// availability window maintained.
async function updateVideoCallAvailability() {
  logger.info("updateVideoCallAvailability: starting")

  const now = new Date()
  const windowStart = new Date(now.getTime() - VIDEO_CALL_WINDOW_BEFORE_MS)
  const windowEnd = new Date(now.getTime() + VIDEO_CALL_WINDOW_AFTER_MS)

  const studentsSnapshot = await db.collection(STUDENTS_COLLECTION).get()

  for (const studentDoc of studentsSnapshot.docs) {
    const studentId = studentDoc.id

    try {
      const upcomingDocs = await getUpcomingLessons(studentId)

      for (const lessonDoc of upcomingDocs) {
        const lesson = lessonDoc.data()
        const date = effectiveLessonDate(lesson)
        const shouldBeAvailable = Boolean(date) && date >= windowStart && date <= windowEnd

        if (Boolean(lesson.videoCallAvailable) !== shouldBeAvailable) {
          await lessonDoc.ref.update({ videoCallAvailable: shouldBeAvailable })
        }
      }
    } catch (error) {
      logger.error("updateVideoCallAvailability: failed to update lesson", { studentId, error })
    }
  }

  logger.info("updateVideoCallAvailability: finished")
}

module.exports = {
  dailyReminderMidday,
  dailyReminderPreLesson,
  dailyReminderTenMin,
  updateVideoCallAvailability,
}
