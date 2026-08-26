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

  // teachers/{teacherId}.vkGroupId/telegramBotKey (personal/shared splits)
  // live on the teacher's own profile doc, not the integrations/
  // teacherContact subdoc — fetched alongside it so an outbound send knows
  // which community/bot's token to use.
  const [snapshot, teacherSnapshot] = await Promise.all([
    teacherContactRef(teacherId).get(),
    db.collection("teachers").doc(teacherId).get(),
  ])
  const contact = snapshot.exists ? snapshot.data() : {}
  const teacherData = teacherSnapshot.exists ? teacherSnapshot.data() : {}

  // Required lazily to avoid a circular require: the adapters require
  // core/lessons.js, and core/lessons.js calls into this module while
  // handling lesson reschedules.
  const { sendMessage: sendTelegramMessage, SHARED_BOT_KEY } = require("../adapters/telegram")
  const { sendMessage: sendVkMessage, SHARED_VK_GROUP_ID } = require("../adapters/vk")

  // Unlike a student's vkGroupId/telegramBotKey (where an unset field means
  // a legacy record predating the personal/shared split, and must fall back
  // to PERSONAL to not break already-working delivery — see
  // reminderUtils.js), an unset field HERE means a teacher who simply never
  // got a personal community/bot assigned — by design (see core/registration
  // model docs) that's every new teacher, and it must resolve to SHARED, not
  // personal. The single teacher who does need the personal one gets it via
  // an explicit Console-set value, not this default.
  const vkGroupId = teacherData.vkGroupId ?? SHARED_VK_GROUP_ID
  const telegramBotKey = teacherData.telegramBotKey ?? SHARED_BOT_KEY

  const sentMessages = []

  if (contact.telegramChatId) {
    const result = await sendTelegramMessage(contact.telegramChatId, text, {
      replyMarkup: options.telegramReplyMarkup,
      botKey: telegramBotKey,
    })
    logger.info("sendMessageToTeacher: sent via Telegram")
    sentMessages.push({
      platform: "telegram",
      chatId: contact.telegramChatId,
      messageId: result?.result?.message_id ?? null,
      botKey: telegramBotKey,
    })
  }

  if (contact.vkPeerId) {
    const result = await sendVkMessage(contact.vkPeerId, text, { keyboard: options.vkKeyboard, groupId: vkGroupId })
    logger.info("sendMessageToTeacher: sent via VK")
    sentMessages.push({ platform: "vk", chatId: contact.vkPeerId, messageId: result?.response ?? null, groupId: vkGroupId })
  }

  if (sentMessages.length === 0) {
    logger.warn("sendMessageToTeacher: no connected platform in integrations/teacherContact")
  }

  return sentMessages
}

module.exports = { sendMessageToTeacher }
