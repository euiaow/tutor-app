const logger = require("firebase-functions/logger")
const { db } = require("./firestore")
const { sendMessage: sendTelegramMessage } = require("../adapters/telegram")
const { sendMessage: sendVkMessage } = require("../adapters/vk")

const STUDENTS_COLLECTION = "students"

// Shared by both reminder schedules (midday + pre-lesson) and by the
// reschedule flow: resolves the student's linked messaging platform and
// dispatches through the matching adapter, so callers don't need to know
// Telegram/VK exist. Returns whether the message was actually dispatched,
// so callers can decide whether it's safe to mark the reminder as sent.
//
// `options.telegramReplyMarkup`/`options.vkKeyboard` let callers (e.g.
// proposeReschedule) attach an interactive keyboard in each platform's own
// format — plain reminders leave both undefined.
// Returns `false` if nothing was sent, or `{ platform, chatId, messageId }`
// on success — the object form lets callers that attach a reply keyboard
// (proposeReschedule/proposeCancellation) record which message to delete
// later (see core/lessons.js's deleteProposalMessage), while still being
// truthy for callers that only care whether delivery happened.
async function sendReminderToStudent(studentId, message, options = {}) {
  const studentSnapshot = await db.collection(STUDENTS_COLLECTION).doc(studentId).get()

  if (!studentSnapshot.exists) {
    logger.warn("sendReminderToStudent: student not found", { studentId })
    return false
  }

  const student = studentSnapshot.data()

  if (student.platform === "telegram" && student.telegramChatId) {
    const result = await sendTelegramMessage(student.telegramChatId, message, {
      replyMarkup: options.telegramReplyMarkup,
    })
    logger.info("sendReminderToStudent: sent via Telegram", { studentId })
    return {
      platform: "telegram",
      chatId: student.telegramChatId,
      messageId: result?.result?.message_id ?? null,
    }
  }

  if (student.platform === "vk" && student.vkPeerId) {
    const result = await sendVkMessage(student.vkPeerId, message, { keyboard: options.vkKeyboard })
    logger.info("sendReminderToStudent: sent via VK", { studentId })
    return {
      platform: "vk",
      chatId: student.vkPeerId,
      messageId: result?.response ?? null,
    }
  }

  logger.warn("sendReminderToStudent: no known messaging channel for student", { studentId })
  return false
}

module.exports = { sendReminderToStudent }
