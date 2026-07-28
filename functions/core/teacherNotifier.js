const logger = require("firebase-functions/logger")
const { db } = require("./firestore")

// Manually created once in Firestore after deploy (there's no self-serve
// signup for the teacher): integrations/teacherContact = { platform: "telegram"
// | "vk", chatId: "<telegram chat id or vk peer id>" }.
const TEACHER_CONTACT_DOC = "integrations/teacherContact"

async function sendMessageToTeacher(text) {
  const snapshot = await db.doc(TEACHER_CONTACT_DOC).get()

  if (!snapshot.exists) {
    logger.warn("sendMessageToTeacher: integrations/teacherContact is not configured")
    return false
  }

  const contact = snapshot.data()

  // Required lazily to avoid a circular require: the adapters require
  // core/lessons.js, and core/lessons.js calls into this module while
  // handling lesson reschedules.
  const { sendMessage: sendTelegramMessage } = require("../adapters/telegram")
  const { sendMessage: sendVkMessage } = require("../adapters/vk")

  if (contact.platform === "telegram" && contact.chatId) {
    await sendTelegramMessage(contact.chatId, text)
    logger.info("sendMessageToTeacher: sent via Telegram")
    return true
  }

  if (contact.platform === "vk" && contact.chatId) {
    await sendVkMessage(contact.chatId, text)
    logger.info("sendMessageToTeacher: sent via VK")
    return true
  }

  logger.warn("sendMessageToTeacher: teacherContact has no recognized platform/chatId", {
    platform: contact.platform,
  })
  return false
}

module.exports = { sendMessageToTeacher }
