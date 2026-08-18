const logger = require("firebase-functions/logger")
const { db } = require("./firestore")

// teachers/{teacherId}/integrations/teacherContact = { telegramChatId:
// string | null, vkPeerId: string | null, updatedAt }. Populated by
// core/teacherConnect.js's resolveTeacherConnectToken once the teacher
// redeems a connect token/link from inside Telegram/VK — see the Teacher
// Dashboard's bot-connection UI. Multi-tenancy Phase 1: moved from the old
// singleton integrations/teacherContact to a per-teacher path.
function teacherContactRef(teacherId) {
  return db.collection("teachers").doc(teacherId).collection("integrations").doc("teacherContact")
}

// Sends to every platform the teacher has connected, not just one — a
// teacher who's linked both Telegram and VK gets the message in both.
// `options.telegramReplyMarkup`/`options.vkKeyboard` let callers (student-
// initiated reschedule/cancellation proposals) attach an interactive
// keyboard, same as sendReminderToStudent. Returns an array of
// `{platform, chatId, messageId}` — one entry per channel actually sent to
// (0, 1, or 2 long) — rather than a single object like
// sendReminderToStudent, since unlike a student the teacher can have both
// channels connected at once and each needs its own message tracked for
// deleteProposalMessages (core/lessons.js) to clean up later.
async function sendMessageToTeacher(teacherId, text, options = {}) {
  if (!teacherId) {
    logger.warn("sendMessageToTeacher: no teacherId, skipping (legacy student predating multi-tenancy Phase 1/5?)")
    return []
  }

  const snapshot = await teacherContactRef(teacherId).get()
  const contact = snapshot.exists ? snapshot.data() : {}

  // Required lazily to avoid a circular require: the adapters require
  // core/lessons.js, and core/lessons.js calls into this module while
  // handling lesson reschedules.
  const { sendMessage: sendTelegramMessage } = require("../adapters/telegram")
  const { sendMessage: sendVkMessage } = require("../adapters/vk")

  const sentMessages = []

  if (contact.telegramChatId) {
    const result = await sendTelegramMessage(contact.telegramChatId, text, {
      replyMarkup: options.telegramReplyMarkup,
    })
    logger.info("sendMessageToTeacher: sent via Telegram")
    sentMessages.push({
      platform: "telegram",
      chatId: contact.telegramChatId,
      messageId: result?.result?.message_id ?? null,
    })
  }

  if (contact.vkPeerId) {
    const result = await sendVkMessage(contact.vkPeerId, text, { keyboard: options.vkKeyboard })
    logger.info("sendMessageToTeacher: sent via VK")
    sentMessages.push({ platform: "vk", chatId: contact.vkPeerId, messageId: result?.response ?? null })
  }

  if (sentMessages.length === 0) {
    logger.warn("sendMessageToTeacher: no connected platform in integrations/teacherContact")
  }

  return sentMessages
}

module.exports = { sendMessageToTeacher }
