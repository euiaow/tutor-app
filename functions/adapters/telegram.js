const { defineSecret } = require("firebase-functions/params")
const { HttpsError } = require("firebase-functions/v2/https")
const logger = require("firebase-functions/logger")
const { db } = require("../core/firestore")
const {
  completeRegistration,
  getRegistrationTokenStatus,
} = require("../core/registration")
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

// TODO: заменить на реальный домен приложения, когда он будет известен
const PLACEHOLDER_DOMAIN = "PLACEHOLDER_DOMAIN"

const TELEGRAM_BOT_TOKEN = defineSecret("TELEGRAM_BOT_TOKEN")

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

async function sendMessage(chatId, text, options = {}) {
  const token = TELEGRAM_BOT_TOKEN.value()
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

    if (!response.ok) {
      const errorBody = await response.text()
      logger.error("Telegram sendMessage failed", {
        chatId,
        status: response.status,
        errorBody,
      })
    }

    return response
  } catch (error) {
    logger.error("Telegram sendMessage request threw", { chatId, error })
    return null
  }
}

// Telegram expects every callback_query to be acknowledged, or the button
// keeps showing a loading spinner on the client — `text` (optional) pops up
// as a small toast.
async function answerCallbackQuery(callbackQueryId, text) {
  const token = TELEGRAM_BOT_TOKEN.value()
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

async function handleStart(chatId, text) {
  const token = parseStartToken(text)

  if (!token) {
    logger.info("Telegram /start received without a token", { chatId })
    await sendMessage(chatId, botMessages.WELCOME_NO_TOKEN())
    return
  }

  logger.info("Telegram /start received with token", { chatId, token })

  const tokenData = await getRegistrationTokenStatus(token)

  if (!tokenData || tokenData.status !== "pending") {
    logger.warn("Telegram /start with invalid or used token", { chatId, token })
    await sendMessage(chatId, botMessages.INVALID_TOKEN())
    return
  }

  await db
    .collection(SESSIONS_COLLECTION)
    .doc(String(chatId))
    .set({ token, step: "awaiting_name" })

  logger.info("Telegram session started", { chatId, token, step: "awaiting_name" })
  await sendMessage(chatId, botMessages.WELCOME_WITH_TOKEN())
}

async function handleAwaitingName(chatId, sessionRef, session, text) {
  const name = text.trim()

  await sessionRef.set({ ...session, name, step: "awaiting_pin" })

  logger.info("Telegram name captured", { chatId, step: "awaiting_pin" })
  await sendMessage(chatId, botMessages.NAME_SAVED(name))
}

async function handleAwaitingPin(chatId, sessionRef, session, text) {
  const pin = text.trim()

  if (!isFourDigitPin(pin)) {
    logger.info("Telegram pin rejected: not 4 digits", { chatId })
    await sendMessage(chatId, botMessages.INVALID_PIN())
    return
  }

  logger.info("Telegram pin accepted, completing registration", { chatId, token: session.token })

  try {
    const studentId = await completeRegistration(session.token, session.name, pin, {
      platform: "telegram",
      id: chatId,
    })
    await sessionRef.delete()

    logger.info("Telegram registration completed", { chatId, studentId })
    await sendMessage(
      chatId,
      botMessages.PIN_SAVED(`https://${PLACEHOLDER_DOMAIN}/student/${studentId}`, true),
    )
  } catch (error) {
    logger.error("Telegram registration failed", { chatId, token: session.token, error })
    await sessionRef.delete()

    const message = error instanceof HttpsError ? error.message : botMessages.REGISTRATION_FAILED()
    await sendMessage(chatId, message)
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

async function downloadTelegramFile(fileId) {
  const token = TELEGRAM_BOT_TOKEN.value()

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

async function handleRescheduleRequest(chatId, studentId) {
  const lessonsSnapshot = await db
    .collection("students")
    .doc(studentId)
    .collection("lessons")
    .where("status", "==", "upcoming")
    .limit(1)
    .get()

  if (lessonsSnapshot.empty) {
    await sendMessage(chatId, botMessages.RESCHEDULE_NO_UPCOMING_LESSON())
    return
  }

  const lessonId = lessonsSnapshot.docs[0].id

  await db
    .collection(SESSIONS_COLLECTION)
    .doc(String(chatId))
    .set({ step: "awaiting_reschedule_date", lessonId })

  logger.info("Telegram reschedule request started", { chatId, studentId, lessonId })
  await sendMessage(chatId, botMessages.RESCHEDULE_ASK_DATE())
}

async function handleAwaitingRescheduleDate(chatId, sessionRef, session, text) {
  const proposedDate = parseRescheduleDateInput(text)

  if (!proposedDate) {
    await sendMessage(chatId, botMessages.RESCHEDULE_INVALID_DATE())
    return
  }

  await sessionRef.delete()

  const studentId = await findStudentIdByChatIdentity("telegram", chatId)
  if (!studentId) {
    await sendMessage(chatId, botMessages.STUDENT_NOT_LINKED())
    return
  }

  try {
    await proposeReschedule(studentId, session.lessonId, proposedDate, "student")
    logger.info("Telegram reschedule proposed by student", { chatId, studentId, lessonId: session.lessonId })
    await sendMessage(chatId, botMessages.RESCHEDULE_REQUEST_SENT())
  } catch (error) {
    logger.error("Telegram reschedule proposal failed", { chatId, studentId, error })
    await sendMessage(chatId, botMessages.RESCHEDULE_CALLBACK_FAILED())
  }
}

async function handleCallbackQuery(callbackQuery) {
  const chatId = callbackQuery?.message?.chat?.id
  const data = callbackQuery?.data
  const callbackQueryId = callbackQuery?.id

  if (!chatId || typeof data !== "string") {
    logger.info("Telegram callback_query ignored: missing chat id or data")
    return
  }

  logger.info("Telegram callback_query received", { chatId, data })

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
    await answerCallbackQuery(callbackQueryId)
    return
  }

  const studentId = await findStudentIdByChatIdentity("telegram", chatId)
  if (!studentId) {
    await answerCallbackQuery(callbackQueryId, "Не нашли твой аккаунт")
    return
  }

  try {
    if (confirmMatch) {
      await confirmReschedule(studentId, confirmMatch[1], "student")
      await answerCallbackQuery(callbackQueryId, "Перенос подтверждён")
    } else if (cancelMatch) {
      await cancelReschedule(studentId, cancelMatch[1])
      await answerCallbackQuery(callbackQueryId, "Перенос отклонён")
    } else if (confirmCancelMatch) {
      await confirmCancellation(studentId, confirmCancelMatch[1], "student")
      await answerCallbackQuery(callbackQueryId, "Отмена урока подтверждена")
    } else {
      await rejectCancellation(studentId, rejectCancelMatch[1])
      await answerCallbackQuery(callbackQueryId, "Отмена урока отклонена")
    }
  } catch (error) {
    logger.error("Telegram reschedule/cancellation callback failed", { chatId, data, error })
    const failureMessage =
      confirmCancelMatch || rejectCancelMatch
        ? botMessages.CANCELLATION_CALLBACK_FAILED()
        : botMessages.RESCHEDULE_CALLBACK_FAILED()
    await answerCallbackQuery(callbackQueryId, failureMessage)
  }
}

async function handleHomeworkFile(chatId, incomingFile) {
  const studentId = await findStudentIdByChatIdentity("telegram", chatId)

  if (!studentId) {
    logger.warn("Telegram homework file received but no student is linked to this chat", {
      chatId,
    })
    await sendMessage(chatId, botMessages.STUDENT_NOT_LINKED())
    return
  }

  logger.info("Telegram homework file received", { chatId, studentId, mimeType: incomingFile.mimeType })

  try {
    const buffer = await downloadTelegramFile(incomingFile.fileId)
    const url = await uploadHomeworkFile(studentId, buffer, incomingFile.mimeType)
    const lessonId = await recordHomeworkSubmission(studentId, url)

    logger.info("Telegram homework file saved", { chatId, studentId, lessonId })

    // recordHomeworkSubmission already sent the "homework_received"
    // notification (and its bot message) when a lesson existed — only the
    // no-lesson case still needs a direct reply here.
    if (!lessonId) {
      await sendMessage(chatId, botMessages.HOMEWORK_NO_LESSON())
    }
  } catch (error) {
    logger.error("Failed to process Telegram homework file", { chatId, studentId, error })
    await sendMessage(chatId, botMessages.HOMEWORK_SAVE_FAILED())
  }
}

async function handleUpdate(update) {
  if (update?.callback_query) {
    await handleCallbackQuery(update.callback_query)
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
      await handleHomeworkFile(chatId, incomingFile)
      return
    }

    logger.info("Telegram update ignored: no text or file", { chatId })
    return
  }

  logger.info("Telegram update received", { chatId, text })

  if (text.trim().startsWith("/start")) {
    await handleStart(chatId, text)
    return
  }

  const sessionRef = db.collection(SESSIONS_COLLECTION).doc(String(chatId))
  const sessionSnapshot = await sessionRef.get()

  if (!sessionSnapshot.exists) {
    if (isRescheduleRequestText(text)) {
      const studentId = await findStudentIdByChatIdentity("telegram", chatId)
      if (studentId) {
        await handleRescheduleRequest(chatId, studentId)
        return
      }
    }

    logger.info("Telegram message with no active session", { chatId })
    await sendMessage(chatId, botMessages.UNKNOWN_MESSAGE())
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
  await sendMessage(chatId, botMessages.UNKNOWN_MESSAGE())
}

module.exports = { sendMessage, handleUpdate, TELEGRAM_BOT_TOKEN }
