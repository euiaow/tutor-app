const { FieldValue } = require("firebase-admin/firestore")
const logger = require("firebase-functions/logger")
const { db } = require("./firestore")

const NOTIFICATIONS_COLLECTION = "notifications"

// Single place every user-facing notification goes through: logs a
// notifications/ doc (source of truth for the in-app bell/block) and best-
// effort dispatches the same text to the recipient's bot. Bot delivery
// failures are swallowed (logged as a warning) rather than thrown — the
// Firestore record is what the UI reads, so it must survive even if the
// bot send fails (student never linked a platform, token expired, etc).
//
// `telegramReplyMarkup`/`vkKeyboard` are passed straight through to
// sendReminderToStudent for the few flows (reschedule/cancellation
// proposals) that attach an interactive keyboard — they're dispatch-only
// options, not part of the persisted notification document.
async function createNotification({
  target,
  studentId = null,
  type,
  text,
  lessonId = null,
  telegramReplyMarkup,
  vkKeyboard,
}) {
  const ref = db.collection(NOTIFICATIONS_COLLECTION).doc()

  await ref.set({
    target,
    studentId,
    type,
    text,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
    lessonId,
  })

  logger.info("createNotification: notification recorded", { id: ref.id, target, studentId, type, lessonId })

  // Required lazily to avoid a circular require — reminderUtils/
  // teacherNotifier pull in the bot adapters, which require core/lessons.js
  // (which requires this module to send notifications). By call time the
  // whole module graph has already finished loading, so this is safe (same
  // pattern core/lessons.js already used before this module existed).
  let delivered = false
  // Only populated when sendReminderToStudent actually sent something and
  // returned its message identity (see reminderUtils.js) — lets
  // proposeReschedule/proposeCancellation record which bot message to
  // delete later once the proposal is answered (see core/lessons.js's
  // deleteProposalMessages). Stays null for every other notification type.
  let sentMessage = null
  // Teacher equivalent of sentMessage, but an array — unlike a student, the
  // teacher can have both Telegram and VK connected at once, so
  // sendMessageToTeacher may send (and need tracked) more than one message
  // for the same proposal.
  let sentMessages = null
  try {
    if (target === "student" && studentId) {
      const { sendReminderToStudent } = require("./reminderUtils")
      const result = await sendReminderToStudent(studentId, text, { telegramReplyMarkup, vkKeyboard })
      delivered = Boolean(result)
      if (result && result.messageId != null) {
        sentMessage = { platform: result.platform, chatId: result.chatId, messageId: result.messageId }
      }
    } else if (target === "teacher") {
      const { sendMessageToTeacher } = require("./teacherNotifier")
      const results = await sendMessageToTeacher(text, { telegramReplyMarkup, vkKeyboard })
      delivered = results.length > 0
      sentMessages = results.filter((result) => result.messageId != null)
    }
  } catch (error) {
    logger.warn("createNotification: failed to deliver bot message", { id: ref.id, target, studentId, type, error })
  }

  // `delivered` lets callers that gate retry logic on it (e.g. reminders.js
  // deciding whether to mark a reminder as sent) tell a bot-delivery
  // failure apart from success — the Firestore record above is written
  // either way, so the in-app notification always exists regardless.
  return { id: ref.id, delivered, sentMessage, sentMessages }
}

module.exports = { createNotification }
