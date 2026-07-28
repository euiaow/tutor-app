const { defineSecret } = require("firebase-functions/params")
const { HttpsError } = require("firebase-functions/v2/https")
const logger = require("firebase-functions/logger")
const { db } = require("../core/firestore")
const {
  completeRegistration,
  getRegistrationTokenStatus,
} = require("../core/registration")

const SESSIONS_COLLECTION = "vkSessions"

// TODO: заменить на реальный домен приложения, когда он будет известен
const PLACEHOLDER_DOMAIN = "PLACEHOLDER_DOMAIN"

const VK_GROUP_TOKEN = defineSecret("VK_GROUP_TOKEN")
const VK_CONFIRMATION_CODE = defineSecret("VK_CONFIRMATION_CODE")

const VK_API_VERSION = "5.199"

const NO_SESSION_REPLY = "Обратись к репетитору за ссылкой"

function isFourDigitPin(text) {
  return /^\d{4}$/.test(text.trim())
}

async function sendMessage(peerId, text) {
  const token = VK_GROUP_TOKEN.value()
  const url = "https://api.vk.com/method/messages.send"
  const params = new URLSearchParams({
    access_token: token,
    v: VK_API_VERSION,
    peer_id: String(peerId),
    message: text,
    random_id: String(Math.floor(Math.random() * 2 ** 31)),
  })

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    })

    const payload = await response.json()

    if (!response.ok || payload.error) {
      logger.error("VK sendMessage failed", {
        peerId,
        status: response.status,
        error: payload.error,
      })
    }

    return payload
  } catch (error) {
    logger.error("VK sendMessage request threw", { peerId, error })
    return null
  }
}

async function handleNoSessionMessage(peerId, text, ref) {
  const hasRef = typeof ref === "string" && ref.trim() !== ""
  const token = hasRef ? ref.trim() : text.trim()

  logger.info("VK message with no active session, resolving token", {
    peerId,
    source: hasRef ? "ref" : "text",
  })

  const tokenData = await getRegistrationTokenStatus(token)

  if (!tokenData || tokenData.status !== "pending") {
    logger.warn("VK token invalid or already used", { peerId, token })
    await sendMessage(peerId, "Ссылка недействительна, обратись к репетитору за новой")
    return
  }

  await db
    .collection(SESSIONS_COLLECTION)
    .doc(String(peerId))
    .set({ token, step: "awaiting_name" })

  logger.info("VK session started", { peerId, token, step: "awaiting_name" })
  await sendMessage(peerId, "Привет! Как тебя зовут? (Имя и Фамилия)")
}

async function handleAwaitingName(peerId, sessionRef, session, text) {
  const name = text.trim()

  await sessionRef.set({ ...session, name, step: "awaiting_pin" })

  logger.info("VK name captured", { peerId, step: "awaiting_pin" })
  await sendMessage(peerId, "Отлично! Придумай 4-значный код для входа в личный кабинет")
}

async function handleAwaitingPin(peerId, sessionRef, session, text) {
  const pin = text.trim()

  if (!isFourDigitPin(pin)) {
    logger.info("VK pin rejected: not 4 digits", { peerId })
    await sendMessage(peerId, "Код должен состоять ровно из 4 цифр. Попробуй ещё раз")
    return
  }

  logger.info("VK pin accepted, completing registration", { peerId, token: session.token })

  try {
    const studentId = await completeRegistration(session.token, session.name, pin)
    await sessionRef.delete()

    logger.info("VK registration completed", { peerId, studentId })
    await sendMessage(
      peerId,
      `Готово! Твоя ссылка на личный кабинет: https://${PLACEHOLDER_DOMAIN}/student/${studentId}`,
    )
  } catch (error) {
    logger.error("VK registration failed", { peerId, token: session.token, error })
    await sessionRef.delete()

    const message =
      error instanceof HttpsError
        ? error.message
        : "Не удалось завершить регистрацию. Обратись к репетитору за новой ссылкой"
    await sendMessage(peerId, message)
  }
}

async function handleMessageNew(object) {
  const message = object?.message
  const peerId = message?.peer_id
  const text = message?.text
  const ref = message?.ref

  if (!peerId || typeof text !== "string") {
    logger.info("VK message_new ignored: no peer id or text", { object })
    return
  }

  logger.info("VK message received", { peerId, text, ref: ref || null })

  const sessionRef = db.collection(SESSIONS_COLLECTION).doc(String(peerId))
  const sessionSnapshot = await sessionRef.get()

  if (!sessionSnapshot.exists) {
    await handleNoSessionMessage(peerId, text, ref)
    return
  }

  const session = sessionSnapshot.data()

  if (session.step === "awaiting_name") {
    await handleAwaitingName(peerId, sessionRef, session, text)
    return
  }

  if (session.step === "awaiting_pin") {
    await handleAwaitingPin(peerId, sessionRef, session, text)
    return
  }

  logger.warn("VK session in unknown step", { peerId, step: session.step })
  await sendMessage(peerId, NO_SESSION_REPLY)
}

async function handleEvent(body) {
  const type = body?.type

  logger.info("VK event received", { type })

  if (type === "confirmation") {
    logger.info("VK confirmation requested")
    return VK_CONFIRMATION_CODE.value()
  }

  if (type === "message_new") {
    try {
      await handleMessageNew(body.object)
    } catch (error) {
      logger.error("Unhandled error while processing VK message_new event", error)
    }
    // VK requires the literal lowercase string "ok" for every non-confirmation
    // event, or it will keep retrying the same event.
    return "ok"
  }

  logger.info("VK event type ignored", { type })
  return "ok"
}

module.exports = { sendMessage, handleEvent, VK_GROUP_TOKEN, VK_CONFIRMATION_CODE }
