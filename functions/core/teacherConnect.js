const { randomBytes } = require("crypto")
const { FieldValue } = require("firebase-admin/firestore")
const { HttpsError } = require("firebase-functions/v2/https")
const logger = require("firebase-functions/logger")
const { db } = require("./firestore")
const botMessages = require("./botMessages")

const TOKENS_COLLECTION = "teacherConnectTokens"
const TEACHERS_COLLECTION = "teachers"
const INTEGRATIONS_SUBCOLLECTION = "integrations"
const TEACHER_CONTACT_DOC_ID = "teacherContact"
const TOKEN_TTL_MS = 10 * 60 * 1000

function teacherContactRef(teacherId) {
  return db.collection(TEACHERS_COLLECTION).doc(teacherId).collection(INTEGRATIONS_SUBCOLLECTION).doc(TEACHER_CONTACT_DOC_ID)
}

// Same two bots that serve student registration/reminders (Telegram
// personal/shared split, by analogy with VK) — duplicated here rather than
// imported from src/lib/registration-links.js since that's frontend ESM and
// this is backend CommonJS; the two are supposed to agree conceptually, not
// literally share a module (same tradeoff as googleCalendar.js's colorId map
// vs student-tags.jsx's TAG_STYLES).
const TELEGRAM_PERSONAL_BOT_USERNAME = "Anst_reg_bot"
const TELEGRAM_SHARED_BOT_USERNAME = "Askk_edu_bot"

function generateToken() {
  return randomBytes(16).toString("hex")
}

function isTokenExpired(createdAt) {
  if (!createdAt?.toMillis) {
    return true
  }
  return Date.now() - createdAt.toMillis() > TOKEN_TTL_MS
}

// Called from the authenticated Teacher Dashboard only (see
// generateTeacherConnectToken in index.js, which gates this on
// request.auth) — mints a short-lived token the teacher then redeems from
// inside Telegram/VK to link that chat to integrations/teacherContact.
async function createTeacherConnectToken(teacherId, platform) {
  if (platform !== "telegram" && platform !== "vk") {
    throw new HttpsError("invalid-argument", "Некорректная платформа подключения")
  }

  const token = generateToken()
  await db.collection(TOKENS_COLLECTION).doc(token).set({
    platform,
    status: "pending",
    teacherId,
    createdAt: FieldValue.serverTimestamp(),
  })

  logger.info("createTeacherConnectToken: token created", { platform, token, teacherId })

  if (platform === "telegram") {
    // teachers/{teacherId}.telegramBotKey (personal/shared split) decides
    // which bot's deep link this teacher needs to open — sending her to the
    // wrong bot would mean her "/start teacher_{token}" never reaches the
    // webhook that's actually watching for this token. Unset (null/missing)
    // means SHARED here — that's the default for every teacher who wasn't
    // explicitly given the personal bot (see functions/core/teacherNotifier.js
    // for the matching outbound-send default and why it's the opposite
    // direction from a student's own fallback).
    const teacherSnapshot = await db.collection(TEACHERS_COLLECTION).doc(teacherId).get()
    const telegramBotKey = teacherSnapshot.exists ? teacherSnapshot.data().telegramBotKey ?? null : null
    const botUsername = telegramBotKey === "personal" ? TELEGRAM_PERSONAL_BOT_USERNAME : TELEGRAM_SHARED_BOT_USERNAME
    return { deepLink: `https://t.me/${botUsername}?start=teacher_${token}` }
  }
  return { code: token }
}

// Called from inside the bot adapters when a chat presents a token (Telegram
// via "/start teacher_{token}", VK via free-text code) — validates it's
// pending, not expired, and for the right platform, then marks it used and
// writes the chat identity onto integrations/teacherContact. Returns
// whether the connection actually happened so the adapter can reply
// accordingly; never throws; a bad/expired/foreign-platform token is just a
// normal "not connected" result, not an error.
async function resolveTeacherConnectToken(token, platform, chatIdentity) {
  if (typeof token !== "string" || token.trim() === "") {
    return false
  }

  const ref = db.collection(TOKENS_COLLECTION).doc(token)
  const snapshot = await ref.get()

  if (!snapshot.exists) {
    return false
  }

  const data = snapshot.data()
  if (data.platform !== platform || data.status !== "pending" || isTokenExpired(data.createdAt)) {
    return false
  }

  await ref.update({ status: "used" })

  const field = platform === "telegram" ? "telegramChatId" : "vkPeerId"
  await teacherContactRef(data.teacherId).set(
    { [field]: String(chatIdentity), updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  )

  logger.info("resolveTeacherConnectToken: teacher connected", { platform, token, teacherId: data.teacherId })
  return true
}

// Called from the authenticated Teacher Dashboard (see disconnectTeacherPlatform
// callable in index.js) — this used to be a direct client Firestore write
// (setDoc(..., {[field]: null})), but that meant the bot chat itself never
// heard anything: it just silently stopped receiving notifications with no
// explanation. Routing through a callable lets the backend send one last
// confirmation message through the channel being disconnected, using its
// still-current chatId/peerId, *before* clearing it — best-effort, a failed
// send must never block the actual disconnect.
async function disconnectTeacherPlatform(teacherId, platform) {
  if (platform !== "telegram" && platform !== "vk") {
    throw new HttpsError("invalid-argument", "Некорректная платформа подключения")
  }

  const [contactSnapshot, teacherSnapshot] = await Promise.all([
    teacherContactRef(teacherId).get(),
    db.collection(TEACHERS_COLLECTION).doc(teacherId).get(),
  ])
  const contact = contactSnapshot.exists ? contactSnapshot.data() : {}
  const teacherData = teacherSnapshot.exists ? teacherSnapshot.data() : {}

  if (platform === "telegram" && contact.telegramChatId) {
    try {
      // Required lazily to avoid a circular require, same reasoning
      // core/teacherNotifier.js already uses for this same module.
      const { sendMessage: sendTelegramMessage, SHARED_BOT_KEY } = require("../adapters/telegram")
      const telegramBotKey = teacherData.telegramBotKey ?? SHARED_BOT_KEY
      await sendTelegramMessage(contact.telegramChatId, botMessages.TEACHER_DISCONNECTED(), { botKey: telegramBotKey })
    } catch (error) {
      logger.warn("disconnectTeacherPlatform: failed to send Telegram disconnect notice", { teacherId, error })
    }
  }

  if (platform === "vk" && contact.vkPeerId) {
    try {
      const { sendMessage: sendVkMessage, SHARED_VK_GROUP_ID } = require("../adapters/vk")
      const vkGroupId = teacherData.vkGroupId ?? SHARED_VK_GROUP_ID
      await sendVkMessage(contact.vkPeerId, botMessages.TEACHER_DISCONNECTED(), { groupId: vkGroupId })
    } catch (error) {
      logger.warn("disconnectTeacherPlatform: failed to send VK disconnect notice", { teacherId, error })
    }
  }

  const field = platform === "telegram" ? "telegramChatId" : "vkPeerId"
  await teacherContactRef(teacherId).set({ [field]: null }, { merge: true })

  logger.info("disconnectTeacherPlatform: disconnected", { teacherId, platform })
}

module.exports = { createTeacherConnectToken, resolveTeacherConnectToken, disconnectTeacherPlatform }
