const { FieldValue } = require("firebase-admin/firestore")
const logger = require("firebase-functions/logger")
const { db } = require("./firestore")

const NOTIFICATIONS_COLLECTION = "notifications"
const DEFAULT_TIME_ZONE = "Europe/Moscow"

// Every user-facing time in the app is meant to read in the *viewer's* own
// timezone — for a bot notification, the viewer is whoever receives it, not
// the tutor. Resolves the recipient's saved timezone here, once, so the
// ~15 call sites across core/lessons.js don't each need their own
// student/teacher profile read — see `text` below for how it's used.
// Falls back to DEFAULT_TIME_ZONE only when the recipient genuinely has no
// timezone saved yet (never as a "this is schedule/reminder data so use
// Moscow" special case — there is no such case anymore).
async function resolveRecipientTimeZone(target, studentData, teacherId) {
  if (target === "student") {
    return studentData?.timezone || DEFAULT_TIME_ZONE
  }
  if (target === "teacher" && teacherId) {
    const teacherSnapshot = await db.collection("teachers").doc(teacherId).get()
    return teacherSnapshot.exists ? teacherSnapshot.data().timezone || DEFAULT_TIME_ZONE : DEFAULT_TIME_ZONE
  }
  return DEFAULT_TIME_ZONE
}

// Single place every user-facing notification goes through: logs a
// notifications/ doc (source of truth for the in-app bell/block) and best-
// effort dispatches the same text to the recipient's bot. Bot delivery
// failures are swallowed (logged as a warning) rather than thrown — the
// Firestore record is what the UI reads, so it must survive even if the
// bot send fails (student never linked a platform, token expired, etc).
//
// `text` can be a plain string (unchanged behavior, e.g. messages with no
// date in them) or a `(timeZone) => string` builder — used by every
// core/lessons.js call site that formats a lesson date/time, so each of the
// (up to two, student + teacher) createNotification calls for the same
// event renders its own copy of the text in *that* recipient's own
// timezone, instead of one shared pre-built string.
//
// `telegramReplyMarkup`/`vkKeyboard` are passed straight through to
// sendReminderToStudent for the few flows (reschedule/cancellation
// proposals) that attach an interactive keyboard — they're dispatch-only
// options, not part of the persisted notification document.
async function createNotification({
  target,
  studentId = null,
  type,
  text,
  lessonId = null,
  teacherId: providedTeacherId = null,
  telegramReplyMarkup,
  vkKeyboard,
}) {
  // Same student read this funnel already did for teacherId resolution
  // (see the `target === "teacher"` branch below) — pulled up front now so
  // it can also serve the student-timezone lookup, rather than reading the
  // student doc twice.
  //
  // `teacherId` is an optional perf shortcut: most call sites already have
  // the student doc loaded in scope for other reasons by the time they call
  // this. When passed, and the target is "teacher", the whole read below is
  // skipped entirely — teacherId is all a "teacher" target ever needed the
  // student doc for. A "student" target still needs the read regardless
  // (studentData.timezone), so passing teacherId there saves nothing; it's
  // harmless to pass anyway, callers don't need to know which case applies.
  let studentData = null
  let teacherId = providedTeacherId
  if (studentId && (target === "student" || !teacherId)) {
    const studentSnapshot = await db.collection("students").doc(studentId).get()
    studentData = studentSnapshot.exists ? studentSnapshot.data() : null
    teacherId = teacherId ?? (studentData?.teacherId ?? null)
  }

  const timeZone = await resolveRecipientTimeZone(target, studentData, teacherId)
  const resolvedText = typeof text === "function" ? text(timeZone) : text

  const ref = db.collection(NOTIFICATIONS_COLLECTION).doc()

  await ref.set({
    target,
    studentId,
    teacherId,
    type,
    text: resolvedText,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
    lessonId,
  })

  logger.info("createNotification: notification recorded", { id: ref.id, target, studentId, type, lessonId })

  // Required lazily to avoid a circular require — reminderUtils/
  // teacherNotifier pull in the bot adapters, which require core/lessons.js
  // (which requires this module to send notifications). By call time the
  // whole module graph has already finished loading, so this is safe (same
  // pattern core/lessons.js already used before this module existed).
  let delivered = false
  // Only populated when sendReminderToStudent actually sent something and
  // returned its message identity (see reminderUtils.js) — lets
  // proposeReschedule/proposeCancellation record which bot message to
  // delete later once the proposal is answered (see core/lessons.js's
  // deleteProposalMessages). Stays null for every other notification type.
  let sentMessage = null
  // Teacher equivalent of sentMessage, but an array — unlike a student, the
  // teacher can have both Telegram and VK connected at once, so
  // sendMessageToTeacher may send (and need tracked) more than one message
  // for the same proposal.
  let sentMessages = null
  try {
    if (target === "student" && studentId) {
      const { sendReminderToStudent } = require("./reminderUtils")
      const result = await sendReminderToStudent(studentId, resolvedText, { telegramReplyMarkup, vkKeyboard })
      delivered = Boolean(result)
      if (result && result.messageId != null) {
        sentMessage = { platform: result.platform, chatId: result.chatId, messageId: result.messageId }
      }
    } else if (target === "teacher" && studentId) {
      const { sendMessageToTeacher } = require("./teacherNotifier")
      const results = await sendMessageToTeacher(teacherId, resolvedText, { telegramReplyMarkup, vkKeyboard })
      delivered = results.length > 0
      sentMessages = results.filter((result) => result.messageId != null)
    }
  } catch (error) {
    logger.warn("createNotification: failed to deliver bot message", { id: ref.id, target, studentId, type, error })
  }

  // `delivered` lets callers that gate retry logic on it (e.g. reminders.js
  // deciding whether to mark a reminder as sent) tell a bot-delivery
  // failure apart from success — the Firestore record above is written
  // either way, so the in-app notification always exists regardless.
  return { id: ref.id, delivered, sentMessage, sentMessages }
}

module.exports = { createNotification }
