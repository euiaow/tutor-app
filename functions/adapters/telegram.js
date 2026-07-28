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
} = require("../core/lessons")

const SESSIONS_COLLECTION = "telegramSessions"

// TODO: заменить на реальный домен приложения, когда он будет известен
const PLACEHOLDER_DOMAIN = "PLACEHOLDER_DOMAIN"

const TELEGRAM_BOT_TOKEN = defineSecret("TELEGRAM_BOT_TOKEN")

const NO_SESSION_REPLY = "Для регистрации обратись к репетитору за ссылкой"

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

async function sendMessage(chatId, text) {
  const token = TELEGRAM_BOT_TOKEN.value()
  const url = `https://api.telegram.org/bot${token}/sendMessage`

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
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

async function handleStart(chatId, text) {
  const token = parseStartToken(text)

  if (!token) {
    logger.info("Telegram /start received without a token", { chatId })
    await sendMessage(chatId, NO_SESSION_REPLY)
    return
  }

  logger.info("Telegram /start received with token", { chatId, token })

  const tokenData = await getRegistrationTokenStatus(token)

  if (!tokenData || tokenData.status !== "pending") {
    logger.warn("Telegram /start with invalid or used token", { chatId, token })
    await sendMessage(chatId, "Ссылка недействительна, обратись к репетитору за новой")
    return
  }

  await db
    .collection(SESSIONS_COLLECTION)
    .doc(String(chatId))
    .set({ token, step: "awaiting_name" })

  logger.info("Telegram session started", { chatId, token, step: "awaiting_name" })
  await sendMessage(chatId, "Привет! Как тебя зовут? (Имя и Фамилия)")
}

async function handleAwaitingName(chatId, sessionRef, session, text) {
  const name = text.trim()

  await sessionRef.set({ ...session, name, step: "awaiting_pin" })

  logger.info("Telegram name captured", { chatId, step: "awaiting_pin" })
  await sendMessage(chatId, "Отлично! Придумай 4-значный код для входа в личный кабинет")
}

async function handleAwaitingPin(chatId, sessionRef, session, text) {
  const pin = text.trim()

  if (!isFourDigitPin(pin)) {
    logger.info("Telegram pin rejected: not 4 digits", { chatId })
    await sendMessage(chatId, "Код должен состоять ровно из 4 цифр. Попробуй ещё раз")
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
      `Готово! Твоя ссылка на личный кабинет: https://${PLACEHOLDER_DOMAIN}/student/${studentId}`,
    )
  } catch (error) {
    logger.error("Telegram registration failed", { chatId, token: session.token, error })
    await sessionRef.delete()

    const message =
      error instanceof HttpsError
        ? error.message
        : "Не удалось завершить регистрацию. Обратись к репетитору за новой ссылкой"
    await sendMessage(chatId, message)
  }
}

function extractIncomingFileId(message) {
  const photos = message?.photo
  if (Array.isArray(photos) && photos.length > 0) {
    // Telegram sends multiple resolutions of the same photo; the last one
    // is the largest.
    return photos[photos.length - 1].file_id
  }
  return message?.document?.file_id ?? null
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

  const buffer = Buffer.from(await fileResponse.arrayBuffer())
  const contentType = fileResponse.headers.get("content-type") || "application/octet-stream"

  return { buffer, contentType }
}

async function handleHomeworkFile(chatId, fileId) {
  const studentId = await findStudentIdByChatIdentity("telegram", chatId)

  if (!studentId) {
    logger.warn("Telegram homework file received but no student is linked to this chat", {
      chatId,
    })
    await sendMessage(chatId, "Не нашли твой аккаунт. Обратись к репетитору за новой ссылкой")
    return
  }

  logger.info("Telegram homework file received", { chatId, studentId })

  try {
    const { buffer, contentType } = await downloadTelegramFile(fileId)
    const url = await uploadHomeworkFile(studentId, buffer, contentType)
    await recordHomeworkSubmission(studentId, url)

    logger.info("Telegram homework file saved", { chatId, studentId })
    await sendMessage(chatId, "Домашка получена! ✓")
  } catch (error) {
    logger.error("Failed to process Telegram homework file", { chatId, studentId, error })
    await sendMessage(chatId, "Не удалось сохранить файл, попробуй ещё раз")
  }
}

async function handleUpdate(update) {
  const message = update?.message
  const chatId = message?.chat?.id
  const text = message?.text

  if (!chatId) {
    logger.info("Telegram update ignored: no chat id", { update })
    return
  }

  if (typeof text !== "string") {
    const fileId = extractIncomingFileId(message)

    if (fileId) {
      await handleHomeworkFile(chatId, fileId)
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
    logger.info("Telegram message with no active session", { chatId })
    await sendMessage(chatId, NO_SESSION_REPLY)
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

  logger.warn("Telegram session in unknown step", { chatId, step: session.step })
  await sendMessage(chatId, NO_SESSION_REPLY)
}

module.exports = { sendMessage, handleUpdate, TELEGRAM_BOT_TOKEN }
