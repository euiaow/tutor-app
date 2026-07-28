const logger = require("firebase-functions/logger")
const { db } = require("./core/firestore")
const { getNextLessonDate } = require("./core/schedule")
const { ensureUpcomingLesson } = require("./core/lessons")
const { sendMessage: sendTelegramMessage } = require("./adapters/telegram")
const { sendMessage: sendVkMessage } = require("./adapters/vk")

const STUDENTS_COLLECTION = "students"
const LESSONS_SUBCOLLECTION = "lessons"

function isSameCalendarDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function buildReminderText(time, assignmentText) {
  const base = `Напоминаем: завтра в ${time} у тебя урок!`
  return assignmentText ? `${base}\nЗадание: ${assignmentText}` : base
}

async function sendReminderForStudent(studentId, student) {
  const lessonId = await ensureUpcomingLesson(studentId)

  let assignmentText = ""
  if (lessonId) {
    const lessonSnapshot = await db
      .collection(STUDENTS_COLLECTION)
      .doc(studentId)
      .collection(LESSONS_SUBCOLLECTION)
      .doc(lessonId)
      .get()

    assignmentText = lessonSnapshot.exists
      ? (lessonSnapshot.data().homework?.assignment?.text ?? "")
      : ""
  }

  const text = buildReminderText(student.schedule.time, assignmentText)

  if (student.platform === "telegram" && student.telegramChatId) {
    await sendTelegramMessage(student.telegramChatId, text)
    logger.info("checkAndSendReminders: reminder sent via Telegram", { studentId })
    return
  }

  if (student.platform === "vk" && student.vkPeerId) {
    await sendVkMessage(student.vkPeerId, text)
    logger.info("checkAndSendReminders: reminder sent via VK", { studentId })
    return
  }

  logger.warn("checkAndSendReminders: no known messaging channel for student", { studentId })
}

async function checkAndSendReminders() {
  const now = new Date()
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)

  const snapshot = await db.collection(STUDENTS_COLLECTION).get()

  logger.info("checkAndSendReminders: scanning students", { count: snapshot.size })

  for (const doc of snapshot.docs) {
    const studentId = doc.id
    const student = doc.data()
    const nextDate = getNextLessonDate(student.schedule)

    if (!nextDate || !isSameCalendarDay(nextDate, tomorrow)) {
      continue
    }

    logger.info("checkAndSendReminders: lesson is tomorrow", { studentId })

    try {
      await sendReminderForStudent(studentId, student)
    } catch (error) {
      logger.error("checkAndSendReminders: failed to send reminder", { studentId, error })
    }
  }
}

module.exports = { checkAndSendReminders }
