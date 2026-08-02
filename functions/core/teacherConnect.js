const { randomBytes } = require("crypto")
const { FieldValue } = require("firebase-admin/firestore")
const { HttpsError } = require("firebase-functions/v2/https")
const logger = require("firebase-functions/logger")
const { db } = require("./firestore")

const TOKENS_COLLECTION = "teacherConnectTokens"
const TEACHER_CONTACT_DOC = "integrations/teacherContact"
const TOKEN_TTL_MS = 10 * 60 * 1000

// Same bot that serves student registration/reminders (one Telegram bot for
// the whole app) — duplicated here rather than imported from
// src/lib/registration-links.js since that's frontend ESM and this is
// backend CommonJS; the two are supposed to agree conceptually, not
// literally share a module (same tradeoff as googleCalendar.js's colorId map
// vs student-tags.jsx's TAG_STYLES).
const TELEGRAM_BOT_USERNAME = "Anst_reg_bot"

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
async function createTeacherConnectToken(platform) {
  if (platform !== "telegram" && platform !== "vk") {
    throw new HttpsError("invalid-argument", "Некорректная платформа подключения")
  }

  const token = generateToken()
  await db.collection(TOKENS_COLLECTION).doc(token).set({
    platform,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
  })

  logger.info("createTeacherConnectToken: token created", { platform, token })

  if (platform === "telegram") {
    return { deepLink: `https://t.me/${TELEGRAM_BOT_USERNAME}?start=teacher_${token}` }
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
  await db.doc(TEACHER_CONTACT_DOC).set(
    { [field]: String(chatIdentity), updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  )

  logger.info("resolveTeacherConnectToken: teacher connected", { platform, token })
  return true
}

module.exports = { createTeacherConnectToken, resolveTeacherConnectToken }
