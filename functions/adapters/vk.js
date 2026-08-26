const { defineSecret } = require("firebase-functions/params")
const { HttpsError } = require("firebase-functions/v2/https")
const { FieldValue } = require("firebase-admin/firestore")
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

const SESSIONS_COLLECTION = "vkSessions"
const PROCESSED_MESSAGES_COLLECTION = "vkProcessedMessages"

const PLACEHOLDER_DOMAIN = "princessschool-e678c.web.app"

// VK community split: VK_GROUP_TOKEN/VK_CONFIRMATION_CODE are (despite the
// generic-looking names, kept as-is rather than renamed) the PERSONAL
// community's secrets — the original, fully-customized group, still used by
// whichever single teacher it's set up for. VK_SHARED_GROUP_TOKEN/
// VK_SHARED_CONFIRMATION_CODE are the new community every other teacher's
// students go through. Which one a given request/message uses is resolved
// per-request from the VK Callback API's own `group_id` (always present on
// every event) via resolveVkToken/PERSONAL_VK_GROUP_ID/SHARED_VK_GROUP_ID
// below — never a single hardcoded secret.
const VK_GROUP_TOKEN = defineSecret("VK_GROUP_TOKEN")
const VK_CONFIRMATION_CODE = defineSecret("VK_CONFIRMATION_CODE")
const VK_SHARED_GROUP_TOKEN = defineSecret("VK_SHARED_GROUP_TOKEN")
const VK_SHARED_CONFIRMATION_CODE = defineSecret("VK_SHARED_CONFIRMATION_CODE")

// Must stay in sync with src/lib/registration-links.js's VK_PERSONAL_GROUP/
// VK_SHARED_GROUP ids (frontend can't require this CommonJS module, so the
// two are hand-kept parallel, not shared code).
const PERSONAL_VK_GROUP_ID = "240507222"
const SHARED_VK_GROUP_ID = "241047499"

// The single place that turns "which VK community is this?" into a secret
// value — every send/delete/pin/event-answer call below goes through this,
// never `VK_GROUP_TOKEN.value()` directly. Missing/unrecognized groupId
// (null, undefined, a legacy student/teacher predating this split) falls
// back to the PERSONAL token, since every VK student/teacher that existed
// before this split registered through the personal community — falling
// back to the shared one would silently break their delivery.
function resolveVkToken(groupId) {
  return String(groupId) === SHARED_VK_GROUP_ID ? VK_SHARED_GROUP_TOKEN.value() : VK_GROUP_TOKEN.value()
}

const VK_API_VERSION = "5.199"

function isFourDigitPin(text) {
  return /^\d{4}$/.test(text.trim())
}

function isRescheduleRequestText(text) {
  const normalized = text.trim().toLowerCase()
  return normalized.includes("перенести урок") || normalized.includes("хочу перенести")
}

// VK has no "/start {arg}" deep-link mechanic like Telegram — this is the
// self-service entry point instead. Multi-tenancy Phase 3: the bare word
// "регистрация" used to be enough (single global teacher); now the exact
// code must carry which teacher via a slug suffix, "регистрация-{slug}"
// (dash chosen over underscore since it's easier to type on a phone
// keyboard). Anchored full-string match (not a substring match, unlike
// isRescheduleRequestText) so it can't false-positive inside an unrelated
// sentence.
function parseSignupSlug(text) {
  const match = /^регистрация-([a-z0-9-]+)$/i.exec(text.trim().toLowerCase())
  return match ? match[1] : null
}

function isBareSignupRequestText(text) {
  return text.trim().toLowerCase() === "регистрация"
}

function parseVkPayload(rawPayload) {
  if (typeof rawPayload !== "string") {
    return null
  }
  try {
    return JSON.parse(rawPayload)
  } catch {
    return null
  }
}

// `options.groupId` picks which community's token sends this — always pass
// it explicitly (the caller knows which webhook request/student/teacher this
// is for); omitting it falls back to the personal community via
// resolveVkToken.
async function sendMessage(peerId, text, options = {}) {
  const token = resolveVkToken(options.groupId)
  const url = "https://api.vk.com/method/messages.send"
  const params = new URLSearchParams({
    access_token: token,
    v: VK_API_VERSION,
    peer_id: String(peerId),
    message: text,
    random_id: String(Math.floor(Math.random() * 2 ** 31)),
  })

  if (options.keyboard) {
    const keyboardJson = JSON.stringify(options.keyboard)
    params.set("keyboard", keyboardJson)
    logger.info("VK sendMessage keyboard payload", { peerId, keyboard: keyboardJson })
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    })

    const payload = await response.json()

    logger.info("VK sendMessage response", { peerId, status: response.status, payload })

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

// Deletes a message the group's bot itself sent — used to keep a proposal
// message with buttons from being left dangling once the other side has
// already answered through a different channel (see core/lessons.js's
// deleteProposalMessage). `message_ids` takes the plain message id VK's own
// messages.send response returns (see sendMessage below), not a
// conversation_message_id. VK rejects this for messages older than 24h or
// already deleted; callers are expected to treat failure as non-fatal.
async function deleteMessage(peerId, messageId, groupId) {
  const token = resolveVkToken(groupId)
  const params = new URLSearchParams({
    access_token: token,
    v: VK_API_VERSION,
    message_ids: String(messageId),
    delete_for_all: "1",
  })

  try {
    const response = await fetch("https://api.vk.com/method/messages.delete", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    })

    const payload = await response.json()

    if (!response.ok || payload.error) {
      logger.warn("VK messages.delete failed", { peerId, messageId, status: response.status, error: payload.error })
    }

    return payload
  } catch (error) {
    logger.warn("VK messages.delete request threw", { peerId, messageId, error })
    return null
  }
}

// Pins the bot's own PIN_SAVED message (the one carrying the student's
// personal-cabinet link) right after sending it — mirrors telegram.js's
// pinChatMessage. Best-effort: must never affect whether registration
// itself is considered successful, see handleAwaitingPin's call site.
async function pinMessage(peerId, messageId, groupId) {
  const token = resolveVkToken(groupId)
  const params = new URLSearchParams({
    access_token: token,
    v: VK_API_VERSION,
    peer_id: String(peerId),
    message_id: String(messageId),
  })

  const response = await fetch("https://api.vk.com/method/messages.pin", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  })

  const payload = await response.json()

  if (!response.ok || payload.error) {
    throw new Error(`VK messages.pin failed: ${JSON.stringify(payload.error ?? payload)}`)
  }
}

async function handleNoSessionMessage(peerId, text, ref, groupId) {
  const hasRef = typeof ref === "string" && ref.trim() !== ""
  const token = hasRef ? ref.trim() : text.trim()

  logger.info("VK message with no active session, resolving token", {
    peerId,
    source: hasRef ? "ref" : "text",
  })

  const tokenData = await getRegistrationTokenStatus(token)

  if (tokenData) {
    if (tokenData.status !== "pending") {
      logger.warn("VK token already used", { peerId, token })
      await sendMessage(peerId, botMessages.INVALID_TOKEN(), { groupId })
      return
    }

    await db
      .collection(SESSIONS_COLLECTION)
      .doc(String(peerId))
      .set({ token, step: "awaiting_name", groupId })

    logger.info("VK session started", { peerId, token, step: "awaiting_name" })
    await sendMessage(peerId, botMessages.WELCOME_WITH_TOKEN(), { groupId })
    return
  }

  // Not a student registration token — check whether it's a pending teacher
  // connect code instead (see core/teacherConnect.js). An explicit
  // collection lookup, not a guess by format, since both kinds of token come
  // from the same random-string generator and could theoretically collide.
  const connected = await resolveTeacherConnectToken(token, "vk", peerId)
  if (connected) {
    logger.info("VK teacher connect succeeded", { peerId, token })
    await sendMessage(peerId, botMessages.TEACHER_CONNECTED(), { groupId })
    return
  }

  // No matching token of either kind: this is just a regular message from
  // someone who hasn't started registration, not a broken/used link — greet
  // them instead of telling them their (nonexistent) link is invalid.
  logger.info("VK message text/ref is not a known token", { peerId })
  await sendMessage(peerId, botMessages.WELCOME_NO_TOKEN(), { groupId })
}

async function handleAwaitingName(peerId, sessionRef, session, text) {
  const name = text.trim()

  await sessionRef.set({ ...session, name, step: "awaiting_pin" })

  logger.info("VK name captured", { peerId, step: "awaiting_pin" })
  await sendMessage(peerId, botMessages.NAME_SAVED(name), { groupId: session.groupId })
}

async function handleAwaitingPin(peerId, sessionRef, session, text) {
  const pin = text.trim()
  const groupId = session.groupId

  if (!isFourDigitPin(pin)) {
    logger.info("VK pin rejected: not 4 digits", { peerId })
    await sendMessage(peerId, botMessages.INVALID_PIN(), { groupId })
    return
  }

  logger.info("VK pin accepted, completing registration", { peerId, token: session.token })

  try {
    const studentId = await completeRegistration(session.token, session.name, pin, {
      platform: "vk",
      id: peerId,
      groupId,
    })
    await sessionRef.delete()

    logger.info("VK registration completed", { peerId, studentId })
    const sent = await sendMessage(
      peerId,
      botMessages.PIN_SAVED(`https://${PLACEHOLDER_DOMAIN}/student/${studentId}`),
      { groupId },
    )

    const sentMessageId = sent && !sent.error ? sent.response : null
    if (sentMessageId) {
      try {
        await pinMessage(peerId, sentMessageId, groupId)
      } catch (pinError) {
        logger.warn("VK messages.pin failed after registration", { peerId, studentId, error: pinError })
      }
    }
  } catch (error) {
    logger.error("VK registration failed", { peerId, token: session.token, error })
    await sessionRef.delete()

    const message = error instanceof HttpsError ? error.message : botMessages.REGISTRATION_FAILED()
    await sendMessage(peerId, message, { groupId })
  }
}

// VK attachments don't carry a mime_type field the way Telegram documents
// do — photos are always JPEG, and doc attachments only expose a file
// extension, so that's mapped to a best-guess mime type instead.
const EXTENSION_MIME_TYPES = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

function guessMimeTypeFromExtension(ext) {
  return EXTENSION_MIME_TYPES[ext?.toLowerCase()] || "application/octet-stream"
}

function extractIncomingAttachment(message) {
  const attachments = message?.attachments
  if (!Array.isArray(attachments)) {
    return null
  }

  const photoAttachment = attachments.find((attachment) => attachment.type === "photo")
  const sizes = photoAttachment?.photo?.sizes
  if (Array.isArray(sizes) && sizes.length > 0) {
    // VK lists photo sizes smallest to largest; the last one is the largest.
    return { url: sizes[sizes.length - 1].url, mimeType: "image/jpeg" }
  }

  const docAttachment = attachments.find((attachment) => attachment.type === "doc")
  if (docAttachment?.doc?.url) {
    return { url: docAttachment.doc.url, mimeType: guessMimeTypeFromExtension(docAttachment.doc.ext) }
  }

  return null
}

async function downloadFileFromUrl(url) {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error("VK file download failed")
  }

  return Buffer.from(await response.arrayBuffer())
}

async function handleRescheduleRequest(peerId, studentId, groupId) {
  const lessonsSnapshot = await db
    .collection("students")
    .doc(studentId)
    .collection("lessons")
    .where("status", "==", "upcoming")
    .limit(1)
    .get()

  if (lessonsSnapshot.empty) {
    await sendMessage(peerId, botMessages.RESCHEDULE_NO_UPCOMING_LESSON(), { groupId })
    return
  }

  const lessonId = lessonsSnapshot.docs[0].id

  await db
    .collection(SESSIONS_COLLECTION)
    .doc(String(peerId))
    .set({ step: "awaiting_reschedule_date", lessonId, groupId })

  logger.info("VK reschedule request started", { peerId, studentId, lessonId })
  await sendMessage(peerId, botMessages.RESCHEDULE_ASK_DATE(), { groupId })
}

async function handleAwaitingRescheduleDate(peerId, sessionRef, session, text) {
  const groupId = session.groupId
  const studentId = await findStudentIdByChatIdentity("vk", peerId)
  if (!studentId) {
    await sendMessage(peerId, botMessages.STUDENT_NOT_LINKED(), { groupId })
    return
  }

  // The student is the one typing this date, so it's parsed as wall-clock
  // time in *their* own saved timezone, not a fixed assumption.
  const studentSnapshot = await db.collection("students").doc(studentId).get()
  const studentTimeZone = studentSnapshot.exists ? studentSnapshot.data().timezone || undefined : undefined
  const proposedDate = parseRescheduleDateInput(text, studentTimeZone)

  if (!proposedDate) {
    await sendMessage(peerId, botMessages.RESCHEDULE_INVALID_DATE(), { groupId })
    return
  }

  await sessionRef.delete()

  try {
    await proposeReschedule(studentId, session.lessonId, proposedDate, "student")
    logger.info("VK reschedule proposed by student", { peerId, studentId, lessonId: session.lessonId })
    await sendMessage(peerId, botMessages.RESCHEDULE_REQUEST_SENT(), { groupId })
  } catch (error) {
    logger.error("VK reschedule proposal failed", { peerId, studentId, error })
    await sendMessage(peerId, botMessages.RESCHEDULE_CALLBACK_FAILED(), { groupId })
  }
}

// Older reschedule keyboards (sent before callback-type buttons were
// introduced) used plain "text" buttons: pressing one sends a regular
// message whose text equals the button label, with `payload` carrying the
// JSON command. Kept so any already-sent proposal still using that keyboard
// still resolves correctly.
async function handleReschedulePayload(peerId, payload, groupId) {
  const studentId = await findStudentIdByChatIdentity("vk", peerId)
  if (!studentId) {
    await sendMessage(peerId, botMessages.STUDENT_NOT_LINKED(), { groupId })
    return
  }

  try {
    if (payload.command === "confirm_reschedule") {
      await confirmReschedule(studentId, payload.lessonId, "student")
    } else {
      await cancelReschedule(studentId, payload.lessonId)
    }
  } catch (error) {
    logger.error("VK reschedule payload failed", { peerId, payload, error })
    await sendMessage(peerId, botMessages.RESCHEDULE_CALLBACK_FAILED(), { groupId })
  }
}

// Acknowledges a message_event callback. VK requires this call after every
// message_event or it will keep re-delivering the same button press.
async function sendMessageEventAnswer(object, groupId) {
  const token = resolveVkToken(groupId)
  const params = new URLSearchParams({
    access_token: token,
    v: VK_API_VERSION,
    event_id: object.event_id,
    user_id: String(object.user_id),
    peer_id: String(object.peer_id),
  })

  try {
    const response = await fetch("https://api.vk.com/method/messages.sendMessageEventAnswer", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    })

    const payload = await response.json()
    if (!response.ok || payload.error) {
      logger.error("VK sendMessageEventAnswer failed", { object, status: response.status, error: payload.error })
    }
  } catch (error) {
    logger.error("VK sendMessageEventAnswer request threw", { object, error })
  }
}

// Handles a press on a "callback"-type keyboard button (message_event),
// as opposed to the legacy "text"-type buttons handled by
// handleReschedulePayload via message_new. The payload carries studentId
// directly (see botMessages.RESCHEDULE_KEYBOARDS) so this doesn't need a
// chat-identity lookup the way handleReschedulePayload does.
async function handleCallbackEvent(object, groupId) {
  const peerId = object?.peer_id
  const rawPayload = object?.payload
  const payload = typeof rawPayload === "string" ? parseVkPayload(rawPayload) : rawPayload

  if (peerId && payload) {
    logger.info("VK callback event received", { peerId, payload })

    // "teacher_*" actions come from a keyboard sent to the teacher (a
    // student proposed the reschedule/cancellation) — see
    // botMessages.RESCHEDULE_KEYBOARDS_FOR_TEACHER/
    // CANCELLATION_KEYBOARDS_FOR_TEACHER. Same payload shape as the
    // student-facing actions below, just confirmed/rejected with role
    // "teacher" instead of "student".
    const isTeacherFailure = payload.action === "teacher_confirm_cancel" || payload.action === "teacher_reject_cancel"
    const isCancellationFailure = payload.action === "confirm_cancel" || payload.action === "reject_cancel"

    try {
      if (payload.action === "confirm_reschedule") {
        await confirmReschedule(payload.studentId, payload.lessonId, "student")
      } else if (payload.action === "cancel_reschedule") {
        await cancelReschedule(payload.studentId, payload.lessonId)
      } else if (payload.action === "confirm_cancel") {
        await confirmCancellation(payload.studentId, payload.lessonId, "student")
      } else if (payload.action === "reject_cancel") {
        await rejectCancellation(payload.studentId, payload.lessonId)
      } else if (payload.action === "teacher_confirm_reschedule") {
        await confirmReschedule(payload.studentId, payload.lessonId, "teacher")
      } else if (payload.action === "teacher_cancel_reschedule") {
        await cancelReschedule(payload.studentId, payload.lessonId)
      } else if (payload.action === "teacher_confirm_cancel") {
        await confirmCancellation(payload.studentId, payload.lessonId, "teacher")
      } else if (payload.action === "teacher_reject_cancel") {
        await rejectCancellation(payload.studentId, payload.lessonId)
      } else {
        logger.info("VK callback event ignored: unknown action", { peerId, payload })
      }
    } catch (error) {
      logger.error("VK callback event handling failed", { peerId, payload, error })
      const failureMessage =
        isCancellationFailure || isTeacherFailure
          ? botMessages.CANCELLATION_CALLBACK_FAILED()
          : botMessages.RESCHEDULE_CALLBACK_FAILED()
      await sendMessage(peerId, failureMessage, { groupId })
    }
  } else {
    logger.info("VK message_event ignored: missing peer id or payload", { object })
  }

  await sendMessageEventAnswer(object, groupId)
}

async function handleHomeworkFile(peerId, attachment, groupId) {
  const studentId = await findStudentIdByChatIdentity("vk", peerId)

  if (!studentId) {
    logger.warn("VK homework file received but no student is linked to this chat", { peerId })
    await sendMessage(peerId, botMessages.STUDENT_NOT_LINKED(), { groupId })
    return
  }

  logger.info("VK homework file received", { peerId, studentId, mimeType: attachment.mimeType })

  try {
    const buffer = await downloadFileFromUrl(attachment.url)
    const url = await uploadHomeworkFile(studentId, buffer, attachment.mimeType)
    const lessonId = await recordHomeworkSubmission(studentId, url)

    logger.info("VK homework file saved", { peerId, studentId, lessonId })

    // recordHomeworkSubmission already sent the "homework_received"
    // notification (and its bot message) when a lesson existed — only the
    // no-lesson case still needs a direct reply here.
    if (!lessonId) {
      await sendMessage(peerId, botMessages.HOMEWORK_NO_LESSON(), { groupId })
    }
  } catch (error) {
    logger.error("Failed to process VK homework file", { peerId, studentId, error })
    await sendMessage(peerId, botMessages.HOMEWORK_SAVE_FAILED(), { groupId })
  }
}

// VK retries a message_new event if it doesn't get the "ok" response back
// quickly enough (e.g. while a photo is still being downloaded/uploaded),
// which without this guard re-runs the whole handler — duplicate homework
// submissions, duplicate registration steps, etc. Keyed by
// peer_id+conversation_message_id (stable and always present on incoming
// messages), falling back to the message's own id if that's ever missing.
// `.create()` fails if the doc already exists, so the reservation is
// atomic even if two deliveries race each other.
async function reserveMessageProcessing(message) {
  const key =
    message?.peer_id != null && message?.conversation_message_id != null
      ? `${message.peer_id}_${message.conversation_message_id}`
      : message?.id != null
        ? `id_${message.id}`
        : null

  if (!key) {
    logger.warn("VK message has no id to dedupe on, processing without idempotency guard", {
      peerId: message?.peer_id,
    })
    return true
  }

  try {
    await db
      .collection(PROCESSED_MESSAGES_COLLECTION)
      .doc(key)
      .create({ processedAt: FieldValue.serverTimestamp() })
    return true
  } catch (error) {
    if (error.code === 6) {
      logger.info("VK message_new already processed, skipping duplicate delivery", { key })
      return false
    }
    throw error
  }
}

async function handleMessageNew(object, groupId) {
  const message = object?.message
  const peerId = message?.peer_id
  const text = message?.text
  const ref = message?.ref

  if (!peerId) {
    logger.info("VK message_new ignored: no peer id", { object })
    return
  }

  const shouldProcess = await reserveMessageProcessing(message)
  if (!shouldProcess) {
    return
  }

  const payload = parseVkPayload(message?.payload)
  if (payload?.command === "confirm_reschedule" || payload?.command === "cancel_reschedule") {
    logger.info("VK reschedule button pressed", { peerId, payload })
    await handleReschedulePayload(peerId, payload, groupId)
    return
  }

  if (typeof text !== "string" || text.trim() === "") {
    const attachment = extractIncomingAttachment(message)

    if (attachment) {
      await handleHomeworkFile(peerId, attachment, groupId)
      return
    }

    logger.info("VK message_new ignored: no text or file", { peerId })
    return
  }

  logger.info("VK message received", { peerId, text, ref: ref || null })

  const sessionRef = db.collection(SESSIONS_COLLECTION).doc(String(peerId))
  const sessionSnapshot = await sessionRef.get()

  if (!sessionSnapshot.exists) {
    if (isRescheduleRequestText(text)) {
      const studentId = await findStudentIdByChatIdentity("vk", peerId)
      if (studentId) {
        await handleRescheduleRequest(peerId, studentId, groupId)
        return
      }
    }

    const signupSlug = parseSignupSlug(text)
    if (signupSlug) {
      const teacher = await findTeacherBySlug(signupSlug)

      if (!teacher) {
        logger.warn("VK self-service signup: unknown teacher slug", { peerId, slug: signupSlug })
        await sendMessage(peerId, botMessages.SIGNUP_LINK_INVALID(), { groupId })
        return
      }

      const token = await createSelfServiceToken(teacher.id)
      await sessionRef.set({ token, step: "awaiting_name", groupId })

      logger.info("VK self-service signup started", { peerId, token, teacherId: teacher.id })
      await sendMessage(peerId, botMessages.WELCOME_WITH_TOKEN(), { groupId })
      return
    }

    // Bare "регистрация" (no slug) — can no longer be resolved to a
    // specific teacher now that the community serves more than one.
    if (isBareSignupRequestText(text)) {
      logger.info("VK self-service signup requested with no teacher slug", { peerId })
      await sendMessage(peerId, botMessages.SIGNUP_NEEDS_TEACHER_LINK(), { groupId })
      return
    }

    await handleNoSessionMessage(peerId, text, ref, groupId)
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

  if (session.step === "awaiting_reschedule_date") {
    await handleAwaitingRescheduleDate(peerId, sessionRef, session, text)
    return
  }

  logger.warn("VK session in unknown step", { peerId, step: session.step })
  await sendMessage(peerId, botMessages.UNKNOWN_MESSAGE(), { groupId })
}

async function handleEvent(body) {
  const type = body?.type
  const groupId = body?.group_id != null ? String(body.group_id) : null

  logger.info("VK raw event", {
    type: body?.type,
    hasObject: !!body?.object,
    objectKeys: Object.keys(body?.object || {}),
  })

  logger.info("VK event received", { type, groupId })

  if (type === "confirmation") {
    logger.info("VK confirmation requested", { groupId })
    return groupId === SHARED_VK_GROUP_ID ? VK_SHARED_CONFIRMATION_CODE.value() : VK_CONFIRMATION_CODE.value()
  }

  if (type === "message_new") {
    try {
      await handleMessageNew(body.object, groupId)
    } catch (error) {
      logger.error("Unhandled error while processing VK message_new event", error)
    }
    // VK requires the literal lowercase string "ok" for every non-confirmation
    // event, or it will keep retrying the same event.
    return "ok"
  }

  if (type === "message_event") {
    try {
      await handleCallbackEvent(body.object, groupId)
    } catch (error) {
      logger.error("Unhandled error while processing VK message_event event", error)
    }
    return "ok"
  }

  logger.info("VK event type ignored", { type })
  return "ok"
}

module.exports = {
  sendMessage,
  deleteMessage,
  handleEvent,
  VK_GROUP_TOKEN,
  VK_CONFIRMATION_CODE,
  VK_SHARED_GROUP_TOKEN,
  VK_SHARED_CONFIRMATION_CODE,
  PERSONAL_VK_GROUP_ID,
  SHARED_VK_GROUP_ID,
}
