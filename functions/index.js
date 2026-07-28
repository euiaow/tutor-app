const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https")
const logger = require("firebase-functions/logger")
const { createRegistrationToken, cancelRegistrationToken } = require("./core/registration")
const { handleUpdate, TELEGRAM_BOT_TOKEN } = require("./adapters/telegram")
const { handleEvent, VK_GROUP_TOKEN, VK_CONFIRMATION_CODE } = require("./adapters/vk")

exports.generateRegistrationLink = onCall(async (request) => {
  const { studentName } = request.data ?? {}

  try {
    const token = await createRegistrationToken(studentName)
    return { token }
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error
    }

    logger.error("Failed to generate registration link", error)
    throw new HttpsError("internal", "Не удалось создать ссылку на регистрацию")
  }
})

exports.cancelRegistrationToken = onCall(async (request) => {
  const { token } = request.data ?? {}

  try {
    await cancelRegistrationToken(token)
    return { success: true }
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error
    }

    logger.error("Failed to cancel registration token", error)
    throw new HttpsError("internal", "Не удалось удалить ссылку регистрации")
  }
})

exports.telegramWebhook = onRequest({ secrets: [TELEGRAM_BOT_TOKEN] }, async (req, res) => {
  // Wait for the update to finish processing before acknowledging, so a
  // Cloud Functions instance freeze right after the response can't drop
  // an in-flight Firestore write or Telegram reply. Telegram tolerates a
  // webhook response taking a few seconds.
  try {
    await handleUpdate(req.body)
  } catch (error) {
    logger.error("Unhandled error while processing Telegram update", error)
  }

  res.status(200).send("OK")
})

exports.vkWebhook = onRequest(
  { secrets: [VK_GROUP_TOKEN, VK_CONFIRMATION_CODE] },
  async (req, res) => {
    // Same fix as telegramWebhook: process the event fully, then respond,
    // so an instance freeze right after the response can't drop an
    // in-flight Firestore write or VK reply.
    let responseBody = "ok"

    try {
      responseBody = await handleEvent(req.body)
    } catch (error) {
      logger.error("Unhandled error while processing VK event", error)
    }

    res.status(200).send(responseBody)
  },
)
