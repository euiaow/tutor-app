const { defineSecret } = require("firebase-functions/params")
const { HttpsError } = require("firebase-functions/v2/https")
const logger = require("firebase-functions/logger")
const { db } = require("../core/firestore")
const {
  completeRegistration,
  createSelfServiceToken,
  getRegistrationTokenStatus,
} = require("../core/registration")
const { resolveTeacherConnectToken } = require("../core/teacherConnect")
const { findTeacherBySlug } = require("../core/teachers")
const {
  findStudentIdByChatIdentity,
  uploadHomeworkFile,
  recordHomeworkSubmission,
  proposeReschedule,
  confirmReschedule,
  cancelReschedule,
  confirmCancellation,
  rejectCancellation,
} = require("../core/lessons")
const botMessages = require("../core/botMessages")
const { parseRescheduleDateInput } = require("../core/schedule")

const SESSIONS_COLLECTION = "telegramSessions"

const PLACEHOLDER_DOMAIN = "princessschool-e678c.web.app"

// Telegram bot split (by analogy with the VK personal/shared split):
// TELEGRAM_BOT_TOKEN is (name kept as-is, not renamed) now specifically the
// PERSONAL bot's token — the original bot, still serving whichever single
// teacher it's set up for. TELEGRAM_SHARED_BOT_TOKEN is the new bot every
// other teacher's students go through. Which one a given request/message
// uses is resolved per-request from which webhook endpoint received it
// (telegramWebhook = personal, telegramSharedWebhook = shared — Telegram has
// no equivalent of VK's group_id-on-every-event, so the webhook itself is
// the signal) via resolveTelegramToken/PERSONAL_BOT_KEY/SHARED_BOT_KEY below
// — never a single hardcoded secret.
const TELEGRAM_BOT_TOKEN = defineSecret("TELEGRAM_BOT_TOKEN")
const TELEGRAM_SHARED_BOT_TOKEN = defineSecret("TELEGRAM_SHARED_BOT_TOKEN")

const PERSONAL_BOT_KEY = "personal"
const SHARED_BOT_KEY = "shared"

// The single place that turns "which bot is this?" into a secret value —
// every send/delete/pin/callback-answer/file-download call below goes
// through this, never `TELEGRAM_BOT_TOKEN.value()` directly. Missing/
// unrecognized botKey (null, undefined, a legacy student/teacher predating
// this split) falls back to the PERSONAL token, since every Telegram
// student/teacher that existed before this split registered through the
// personal bot — falling back to the shared one would silently break their
// delivery.
function resolveTelegramToken(botKey) {
  return botKey === SHARED_BOT_KEY ? TELEGRAM_SHARED_BOT_TOKEN.value() : TELEGRAM_BOT_TOKEN.value()
}

function parseStartToken(text) {
  const match = /^\/start(?:\s+(\S+))?/.exec(text.trim())
  if (!match) {
    return null
  }
  return match[1] ?? null
}

function isFourDigitPin(text) {
  return /^\d{4}$/.test(text.trim())
}

function isRescheduleRequestText(text) {
  const normalized = text.trim().toLowerCase()
  return normalized.includes("перенести урок") || normalized.includes("хочу перенести")
}

// `options.botKey` picks which bot's token sends this — always pass it
// explicitly (the caller knows which webhook request/student/teacher this
// is for); omitting it falls back to the personal bot via
// resolveTelegramToken.
async function sendMessage(chatId, text, options = {}) {
  const token = resolveTelegramToken(options.botKey)
  const url = `https://api.telegram.org/bot${token}/sendMessage`

  const body = { chat_id: chatId, text }
  if (options.replyMarkup) {
    body.reply_markup = options.replyMarkup
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    const payload = await response.json()

    if (!response.ok || !payload.ok) {
      logger.error("Telegram sendMessage failed", {
        chatId,
        status: response.status,
        payload,
      })
    }

    return payload
  } catch (error) {
    logger.error("Telegram sendMessage request threw", { chatId, error })
    return null
  }
}

// Deletes a message the bot itself sent — used to keep a proposal message
// with buttons from being left dangling once the other side has already
// answered through a different channel (see core/lessons.js's
// deleteProposalMessage). Telegram rejects this for messages older than 48h
// or already deleted; callers are expected to treat failure as non-fatal.
async function deleteMessage(chatId, messageId, botKey) {
  const token = resolveTelegramToken(botKey)
  const url = `https://api.telegram.org/bot${token}/deleteMessage`

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
    })

    const payload = await response.json()

    if (!response.ok || !payload.ok) {
      logger.warn("Telegram deleteMessage failed", { chatId, messageId, status: response.status, payload })
    }

    return payload
  } catch (error) {
    logger.warn("Telegram deleteMessage request threw", { chatId, messageId, error })
    return null
  }
}

// Pins the bot's own PIN_SAVED message (the one carrying the student's
// personal-cabinet link) right after sending it, so it stays at the top of
// the chat instead of scrolling away. Best-effort: pinning can't really fail
// in a private bot chat, but a stale/blocked chat is still possible, and a
// failure here must never affect whether registration itself is considered
// successful — see handleAwaitingPin's call site.
async function pinChatMessage(chatId, messageId, botKey) {
  const token = resolveTelegramToken(botKey)
  const url = `https://api.telegram.org/bot${token}/pinChatMessage`

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, disable_notification: true }),
  })

  const payload = await response.json()

  if (!response.ok || !payload.ok) {
    throw new Error(`Telegram pinChatMessage failed: ${JSON.stringify(payload)}`)
  }
}

// Telegram expects every callback_query to be acknowledged, or the button
// keeps showing a loading spinner on the client — `text` (optional) pops up
// as a small toast.
async function answerCallbackQuery(callbackQueryId, text, botKey) {
  const token = resolveTelegramToken(botKey)
  const url = `https://api.telegram.org/bot${token}/answerCallbackQuery`

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
    })
  } catch (error) {
    logger.error("Telegram answerCallbackQuery request threw", { callbackQueryId, error })
  }
}

async function handleStart(chatId, text, botKey) {
  const rawArg = parseStartToken(text)

  // "/start teacher_{token}" connects the teacher's own chat to receive
  // notifications — checked first since the "teacher_" prefix makes it
  // unambiguous, unlike VK's free-text token entry (see vk.js's
  // handleNoSessionMessage) which has to fall back to an explicit
  // teacherConnectTokens lookup instead.
  if (typeof rawArg === "string" && rawArg.startsWith("teacher_")) {
    const token = rawArg.slice("teacher_".length)
    const connected = await resolveTeacherConnectToken(token, "telegram", chatId)

    logger.info("Telegram teacher connect attempt", { chatId, token, connected })
    await sendMessage(chatId, connected ? botMessages.TEACHER_CONNECTED() : botMessages.TEACHER_CONNECT_INVALID(), {
      botKey,
    })
    return
  }

  // "/start signup_{slug}" is the entry point from a specific teacher's
  // /app/:slug landing page (multi-tenancy Phase 3) — the slug identifies
  // which teacher this student is signing up with, since the bot itself is
  // shared across every teacher. A fresh token is minted right here rather
  // than requiring the teacher to have pre-created one, then the exact same
  // awaiting_name/awaiting_pin session machine below takes over, no
  // separate code path to keep in sync.
  if (typeof rawArg === "string" && rawArg.startsWith("signup_")) {
    const slug = rawArg.slice("signup_".length)
    const teacher = await findTeacherBySlug(slug)

    if (!teacher) {
      logger.warn("Telegram self-service signup: unknown teacher slug", { chatId, slug })
      await sendMessage(chatId, botMessages.SIGNUP_LINK_INVALID(), { botKey })
      return
    }

    const token = await createSelfServiceToken(teacher.id)

    await db
      .collection(SESSIONS_COLLECTION)
      .doc(String(chatId))
      .set({ token, step: "awaiting_name", botKey })

    logger.info("Telegram self-service signup started", { chatId, token, teacherId: teacher.id })
    await sendMessage(chatId, botMessages.WELCOME_WITH_TOKEN(), { botKey })
    return
  }

  // Bare "/start signup" (no slug) — can no longer be resolved to a
  // specific teacher now that the bot serves more than one. Previously this
  // minted a token with no teacherId at all; that's no longer acceptable
  // once there's more than one teacher to potentially attribute it to.
  if (rawArg === "signup") {
    logger.info("Telegram self-service signup requested with no teacher slug", { chatId })
    await sendMessage(chatId, botMessages.SIGNUP_NEEDS_TEACHER_LINK(), { botKey })
    return
  }

  if (!rawArg) {
    logger.info("Telegram /start received without a token", { chatId })
    await sendMessage(chatId, botMessages.WELCOME_NO_TOKEN(), { botKey })
    return
  }

  logger.info("Telegram /start received with token", { chatId, token: rawArg })

  const tokenData = await getRegistrationTokenStatus(rawArg)

  if (!tokenData || tokenData.status !== "pending") {
    logger.warn("Telegram /start with invalid or used token", { chatId, token: rawArg })
    await sendMessage(chatId, botMessages.INVALID_TOKEN(), { botKey })
    return
  }

  await db
    .collection(SESSIONS_COLLECTION)
    .doc(String(chatId))
    .set({ token: rawArg, step: "awaiting_name", botKey })

  logger.info("Telegram session started", { chatId, token: rawArg, step: "awaiting_name" })
  await sendMessage(chatId, botMessages.WELCOME_WITH_TOKEN(), { botKey })
}

async function handleAwaitingName(chatId, sessionRef, session, text) {
  const name = text.trim()

  await sessionRef.set({ ...session, name, step: "awaiting_pin" })

  logger.info("Telegram name captured", { chatId, step: "awaiting_pin" })
  await sendMessage(chatId, botMessages.NAME_SAVED(name), { botKey: session.botKey })
}

async function handleAwaitingPin(chatId, sessionRef, session, text) {
  const pin = text.trim()
  const botKey = session.botKey

  if (!isFourDigitPin(pin)) {
    logger.info("Telegram pin rejected: not 4 digits", { chatId })
    await sendMessage(chatId, botMessages.INVALID_PIN(), { botKey })
    return
  }

  logger.info("Telegram pin accepted, completing registration", { chatId, token: session.token })

  try {
    const studentId = await completeRegistration(session.token, session.name, pin, {
      platform: "telegram",
      id: chatId,
      botKey,
    })
    await sessionRef.delete()

    logger.info("Telegram registration completed", { chatId, studentId })
    const sent = await sendMessage(
      chatId,
      botMessages.PIN_SAVED(`https://${PLACEHOLDER_DOMAIN}/student/${studentId}`, true),
      { botKey },
    )

    const sentMessageId = sent?.ok ? sent.result?.message_id : null
    if (sentMessageId) {
      try {
        await pinChatMessage(chatId, sentMessageId, botKey)
      } catch (pinError) {
        logger.warn("Telegram pinChatMessage failed after registration", { chatId, studentId, error: pinError })
      }
    }
  } catch (error) {
    logger.error("Telegram registration failed", { chatId, token: session.token, error })
    await sessionRef.delete()

    const message = error instanceof HttpsError ? error.message : botMessages.REGISTRATION_FAILED()
    await sendMessage(chatId, message, { botKey })
  }
}

function extractIncomingFile(message) {
  const photos = message?.photo
  if (Array.isArray(photos) && photos.length > 0) {
    // Telegram sends multiple resolutions of the same photo; the last one
    // is the largest. PhotoSize objects never carry mime_type — Telegram
    // always re-encodes photos as JPEG, so that's a safe default.
    return { fileId: photos[photos.length - 1].file_id, mimeType: "image/jpeg" }
  }

  const document = message?.document
  if (document?.file_id) {
    return { fileId: document.file_id, mimeType: document.mime_type || "application/octet-stream" }
  }

  return null
}

async function downloadTelegramFile(fileId, botKey) {
  const token = resolveTelegramToken(botKey)

  const fileInfoResponse = await fetch(
    `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`,
  )
  const fileInfo = await fileInfoResponse.json()

  if (!fileInfo.ok) {
    throw new Error("Telegram getFile failed")
  }

  const filePath = fileInfo.result.file_path
  const fileResponse = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`)

  if (!fileResponse.ok) {
    throw new Error("Telegram file download failed")
  }

  return Buffer.from(await fileResponse.arrayBuffer())
}

async function handleRescheduleRequest(chatId, studentId, botKey) {
  const lessonsSnapshot = await db
    .collection("students")
    .doc(studentId)
    .collection("lessons")
    .where("status", "==", "upcoming")
    .limit(1)
    .get()

  if (lessonsSnapshot.empty) {
    await sendMessage(chatId, botMessages.RESCHEDULE_NO_UPCOMING_LESSON(), { botKey })
    return
  }

  const lessonId = lessonsSnapshot.docs[0].id

  await db
    .collection(SESSIONS_COLLECTION)
    .doc(String(chatId))
    .set({ step: "awaiting_reschedule_date", lessonId, botKey })

  logger.info("Telegram reschedule request started", { chatId, studentId, lessonId })
  await sendMessage(chatId, botMessages.RESCHEDULE_ASK_DATE(), { botKey })
}

async function handleAwaitingRescheduleDate(chatId, sessionRef, session, text) {
  const botKey = session.botKey
  const studentId = await findStudentIdByChatIdentity("telegram", chatId)
  if (!studentId) {
    await sendMessage(chatId, botMessages.STUDENT_NOT_LINKED(), { botKey })
    return
  }

  // The student is the one typing this date, so it's parsed as wall-clock
  // time in *their* own saved timezone, not a fixed assumption.
  const studentSnapshot = await db.collection("students").doc(studentId).get()
  const studentTimeZone = studentSnapshot.exists ? studentSnapshot.data().timezone || undefined : undefined
  const proposedDate = parseRescheduleDateInput(text, studentTimeZone)

  if (!proposedDate) {
    await sendMessage(chatId, botMessages.RESCHEDULE_INVALID_DATE(), { botKey })
    return
  }

  await sessionRef.delete()

  try {
    await proposeReschedule(studentId, session.lessonId, proposedDate, "student")
    logger.info("Telegram reschedule proposed by student", { chatId, studentId, lessonId: session.lessonId })
    await sendMessage(chatId, botMessages.RESCHEDULE_REQUEST_SENT(), { botKey })
  } catch (error) {
    logger.error("Telegram reschedule proposal failed", { chatId, studentId, error })
    await sendMessage(chatId, botMessages.RESCHEDULE_CALLBACK_FAILED(), { botKey })
  }
}

async function handleCallbackQuery(callbackQuery, botKey) {
  const chatId = callbackQuery?.message?.chat?.id
  const data = callbackQuery?.data
  const callbackQueryId = callbackQuery?.id

  if (!chatId || typeof data !== "string") {
    logger.info("Telegram callback_query ignored: missing chat id or data")
    return
  }

  logger.info("Telegram callback_query received", { chatId, data })

  // Teacher-side buttons (shown when a *student* proposes a reschedule/
  // cancellation) — checked first since their callback_data carries
  // studentId+lessonId directly rather than relying on chat-identity
  // resolution: the teacher's chat has no student doc to resolve through,
  // unlike a student's own chat. See botMessages.RESCHEDULE_KEYBOARDS_FOR_TEACHER
  // for why the prefix is short (Telegram's 64-byte callback_data limit).
  const teacherConfirmReschMatch = /^t_confirm_resch_([^_]+)_([^_]+)$/.exec(data)
  const teacherCancelReschMatch = /^t_cancel_resch_([^_]+)_([^_]+)$/.exec(data)
  const teacherConfirmCxlMatch = /^t_confirm_cxl_([^_]+)_([^_]+)$/.exec(data)
  const teacherRejectCxlMatch = /^t_reject_cxl_([^_]+)_([^_]+)$/.exec(data)

  if (teacherConfirmReschMatch || teacherCancelReschMatch || teacherConfirmCxlMatch || teacherRejectCxlMatch) {
    const match = teacherConfirmReschMatch || teacherCancelReschMatch || teacherConfirmCxlMatch || teacherRejectCxlMatch
    const [, lessonId, studentId] = match

    try {
      if (teacherConfirmReschMatch) {
        await confirmReschedule(studentId, lessonId, "teacher")
        await answerCallbackQuery(callbackQueryId, "Перенос подтверждён", botKey)
      } else if (teacherCancelReschMatch) {
        await cancelReschedule(studentId, lessonId)
        await answerCallbackQuery(callbackQueryId, "Перенос отклонён", botKey)
      } else if (teacherConfirmCxlMatch) {
        await confirmCancellation(studentId, lessonId, "teacher")
        await answerCallbackQuery(callbackQueryId, "Отмена урока подтверждена", botKey)
      } else {
        await rejectCancellation(studentId, lessonId)
        await answerCallbackQuery(callbackQueryId, "Отмена урока отклонена", botKey)
      }
    } catch (error) {
      logger.error("Telegram teacher reschedule/cancellation callback failed", { chatId, data, error })
      const failureMessage =
        teacherConfirmCxlMatch || teacherRejectCxlMatch
          ? botMessages.CANCELLATION_CALLBACK_FAILED()
          : botMessages.RESCHEDULE_CALLBACK_FAILED()
      await answerCallbackQuery(callbackQueryId, failureMessage, botKey)
    }
    return
  }

  const confirmMatch = /^confirm_reschedule_(.+)$/.exec(data)
  const cancelMatch = /^cancel_reschedule_(.+)$/.exec(data)
  // Cancellation callback_data also carries studentId (see
  // botMessages.CANCELLATION_KEYBOARDS), but studentId is still resolved via
  // chat identity below for the same reason reschedule's callback_data never
  // bothered encoding it — the chat this button was pressed in already
  // belongs to exactly one student.
  const confirmCancelMatch = /^confirm_cancel_([^_]+)_([^_]+)$/.exec(data)
  const rejectCancelMatch = /^reject_cancel_([^_]+)_([^_]+)$/.exec(data)

  if (!confirmMatch && !cancelMatch && !confirmCancelMatch && !rejectCancelMatch) {
    await answerCallbackQuery(callbackQueryId, undefined, botKey)
    return
  }

  const studentId = await findStudentIdByChatIdentity("telegram", chatId)
  if (!studentId) {
    await answerCallbackQuery(callbackQueryId, "Не нашли твой аккаунт", botKey)
    return
  }

  try {
    if (confirmMatch) {
      await confirmReschedule(studentId, confirmMatch[1], "student")
      await answerCallbackQuery(callbackQueryId, "Перенос подтверждён", botKey)
    } else if (cancelMatch) {
      await cancelReschedule(studentId, cancelMatch[1])
      await answerCallbackQuery(callbackQueryId, "Перенос отклонён", botKey)
    } else if (confirmCancelMatch) {
      await confirmCancellation(studentId, confirmCancelMatch[1], "student")
      await answerCallbackQuery(callbackQueryId, "Отмена урока подтверждена", botKey)
    } else {
      await rejectCancellation(studentId, rejectCancelMatch[1])
      await answerCallbackQuery(callbackQueryId, "Отмена урока отклонена", botKey)
    }
  } catch (error) {
    logger.error("Telegram reschedule/cancellation callback failed", { chatId, data, error })
    const failureMessage =
      confirmCancelMatch || rejectCancelMatch
        ? botMessages.CANCELLATION_CALLBACK_FAILED()
        : botMessages.RESCHEDULE_CALLBACK_FAILED()
    await answerCallbackQuery(callbackQueryId, failureMessage, botKey)
  }
}

async function handleHomeworkFile(chatId, incomingFile, botKey) {
  const studentId = await findStudentIdByChatIdentity("telegram", chatId)

  if (!studentId) {
    logger.warn("Telegram homework file received but no student is linked to this chat", {
      chatId,
    })
    await sendMessage(chatId, botMessages.STUDENT_NOT_LINKED(), { botKey })
    return
  }

  logger.info("Telegram homework file received", { chatId, studentId, mimeType: incomingFile.mimeType })

  try {
    const buffer = await downloadTelegramFile(incomingFile.fileId, botKey)
    const url = await uploadHomeworkFile(studentId, buffer, incomingFile.mimeType)
    const lessonId = await recordHomeworkSubmission(studentId, url)

    logger.info("Telegram homework file saved", { chatId, studentId, lessonId })

    // recordHomeworkSubmission already sent the "homework_received"
    // notification (and its bot message) when a lesson existed — only the
    // no-lesson case still needs a direct reply here.
    if (!lessonId) {
      await sendMessage(chatId, botMessages.HOMEWORK_NO_LESSON(), { botKey })
    }
  } catch (error) {
    logger.error("Failed to process Telegram homework file", { chatId, studentId, error })
    await sendMessage(chatId, botMessages.HOMEWORK_SAVE_FAILED(), { botKey })
  }
}

// `botKey` ("personal" | "shared") identifies which bot's webhook this
// update arrived on — telegramWebhook/telegramSharedWebhook in index.js each
// pass their own fixed literal, since (unlike VK's group_id) Telegram
// updates carry no per-request signal of which bot received them.
async function handleUpdate(update, botKey) {
  if (update?.callback_query) {
    await handleCallbackQuery(update.callback_query, botKey)
    return
  }

  const message = update?.message
  const chatId = message?.chat?.id
  const text = message?.text

  if (!chatId) {
    logger.info("Telegram update ignored: no chat id", { update })
    return
  }

  if (typeof text !== "string") {
    const incomingFile = extractIncomingFile(message)

    if (incomingFile) {
      await handleHomeworkFile(chatId, incomingFile, botKey)
      return
    }

    logger.info("Telegram update ignored: no text or file", { chatId })
    return
  }

  logger.info("Telegram update received", { chatId, text })

  if (text.trim().startsWith("/start")) {
    await handleStart(chatId, text, botKey)
    return
  }

  const sessionRef = db.collection(SESSIONS_COLLECTION).doc(String(chatId))
  const sessionSnapshot = await sessionRef.get()

  if (!sessionSnapshot.exists) {
    if (isRescheduleRequestText(text)) {
      const studentId = await findStudentIdByChatIdentity("telegram", chatId)
      if (studentId) {
        await handleRescheduleRequest(chatId, studentId, botKey)
        return
      }
    }

    logger.info("Telegram message with no active session", { chatId })
    await sendMessage(chatId, botMessages.UNKNOWN_MESSAGE(), { botKey })
    return
  }

  const session = sessionSnapshot.data()

  if (session.step === "awaiting_name") {
    await handleAwaitingName(chatId, sessionRef, session, text)
    return
  }

  if (session.step === "awaiting_pin") {
    await handleAwaitingPin(chatId, sessionRef, session, text)
    return
  }

  if (session.step === "awaiting_reschedule_date") {
    await handleAwaitingRescheduleDate(chatId, sessionRef, session, text)
    return
  }

  logger.warn("Telegram session in unknown step", { chatId, step: session.step })
  await sendMessage(chatId, botMessages.UNKNOWN_MESSAGE(), { botKey: session.botKey })
}

module.exports = {
  sendMessage,
  deleteMessage,
  handleUpdate,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_SHARED_BOT_TOKEN,
  PERSONAL_BOT_KEY,
  SHARED_BOT_KEY,
}
