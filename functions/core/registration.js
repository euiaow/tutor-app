const crypto = require("crypto")
const { FieldValue } = require("firebase-admin/firestore")
const { HttpsError } = require("firebase-functions/v2/https")
const logger = require("firebase-functions/logger")
const { db } = require("./firestore")

const REGISTRATION_TOKENS_COLLECTION = "registrationTokens"
const STUDENTS_COLLECTION = "students"

// Only covers common Cyrillic letters — platform-specific bots pass
// through whatever the user typed, so student names are expected in Russian.
const TRANSLIT_MAP = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh",
  з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts",
  ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu",
  я: "ya",
}

function transliterate(text) {
  return text
    .toLowerCase()
    .split("")
    .map((char) => TRANSLIT_MAP[char] ?? char)
    .join("")
}

function slugify(fullName) {
  const slug = transliterate(fullName)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || "student"
}

function randomToken(bytes = 9) {
  return crypto.randomBytes(bytes).toString("base64url")
}

function randomSuffix(length = 4) {
  return crypto.randomBytes(length).toString("hex").slice(0, length)
}

async function generateUniqueId(collectionName, candidateFn, maxAttempts = 5) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = candidateFn()
    const snapshot = await db.collection(collectionName).doc(candidate).get()

    if (!snapshot.exists) {
      return candidate
    }

    logger.warn("Id collision, retrying", { collectionName, candidate, attempt })
  }

  throw new HttpsError(
    "internal",
    `Не удалось сгенерировать уникальный идентификатор в ${collectionName}`,
  )
}

// No name upfront — unlike createRegistrationToken (teacher pre-fills the
// name before sharing a link), a self-service signup starts from the
// student's own "/start signup"/"регистрация" trigger with nothing known
// about them yet. The same awaiting_name/awaiting_pin session machine
// fills the name in afterward, same as always; only isSelfService marks
// this token so completeRegistration knows to notify the teacher.
//
// Multi-tenancy Phase 1 gap, flagged explicitly: teacherId is null here
// (default) because the bot adapters that call this (adapters/telegram.js's
// "/start signup", adapters/vk.js's "регистрация") have no way yet to know
// which teacher's bot a student is talking to — there is still only one
// global bot per platform, serving one teacher. Resolving that is Phase 3's
// bot-routing problem, not this phase's. A student who signs up this way
// today gets `teacherId: null` on their student doc until Phase 3 wires up
// per-teacher bot routing (or Phase 5 backfills it for the single existing
// teacher).
async function createSelfServiceToken(teacherId = null) {
  const token = await generateUniqueId(REGISTRATION_TOKENS_COLLECTION, () => randomToken())

  await db
    .collection(REGISTRATION_TOKENS_COLLECTION)
    .doc(token)
    .set({
      studentName: null,
      status: "pending",
      isSelfService: true,
      teacherId,
      createdAt: FieldValue.serverTimestamp(),
    })

  logger.info("Self-service registration token created", { token, teacherId })

  return token
}

async function createRegistrationToken(studentName, teacherId) {
  if (!studentName || typeof studentName !== "string" || !studentName.trim()) {
    throw new HttpsError("invalid-argument", "Укажите имя ученика")
  }
  if (!teacherId || typeof teacherId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан преподаватель")
  }

  const token = await generateUniqueId(REGISTRATION_TOKENS_COLLECTION, () => randomToken())

  await db
    .collection(REGISTRATION_TOKENS_COLLECTION)
    .doc(token)
    .set({
      studentName: studentName.trim(),
      status: "pending",
      teacherId,
      createdAt: FieldValue.serverTimestamp(),
    })

  logger.info("Registration token created", { token, teacherId })

  return token
}

async function getRegistrationTokenStatus(token) {
  if (!token || typeof token !== "string") {
    return null
  }

  const snapshot = await db.collection(REGISTRATION_TOKENS_COLLECTION).doc(token).get()

  if (!snapshot.exists) {
    return null
  }

  return snapshot.data()
}

async function completeRegistration(token, fullName, accessCode, identity = null) {
  if (!token || typeof token !== "string") {
    throw new HttpsError("invalid-argument", "Не указан токен регистрации")
  }
  if (!fullName || typeof fullName !== "string" || !fullName.trim()) {
    throw new HttpsError("invalid-argument", "Укажите имя и фамилию ученика")
  }
  if (!accessCode || typeof accessCode !== "string" || !accessCode.trim()) {
    throw new HttpsError("invalid-argument", "Укажите код доступа")
  }

  // identity ties the student doc back to the chat the bot registered them
  // from, so reminders.js and the homework-photo handlers can later find
  // the student by chatId/peerId without asking them to re-authenticate.
  const platform = identity?.platform ?? null
  const telegramChatId = platform === "telegram" ? String(identity.id) : null
  const vkPeerId = platform === "vk" ? String(identity.id) : null

  const tokenRef = db.collection(REGISTRATION_TOKENS_COLLECTION).doc(token)
  const tokenSnapshot = await tokenRef.get()

  if (!tokenSnapshot.exists) {
    throw new HttpsError("not-found", "Ссылка на регистрацию недействительна")
  }
  if (tokenSnapshot.data().status !== "pending") {
    throw new HttpsError("failed-precondition", "Эта ссылка уже была использована")
  }

  const isSelfService = tokenSnapshot.data().isSelfService === true

  const studentId = await generateUniqueId(
    STUDENTS_COLLECTION,
    () => `${slugify(fullName)}-${randomSuffix()}`,
  )
  const studentRef = db.collection(STUDENTS_COLLECTION).doc(studentId)

  await db.runTransaction(async (transaction) => {
    const [freshToken, freshStudent] = await Promise.all([
      transaction.get(tokenRef),
      transaction.get(studentRef),
    ])

    if (!freshToken.exists || freshToken.data().status !== "pending") {
      throw new HttpsError("failed-precondition", "Эта ссылка уже была использована")
    }
    if (freshStudent.exists) {
      throw new HttpsError("already-exists", "Ученик с таким идентификатором уже существует")
    }

    transaction.set(studentRef, {
      name: fullName.trim(),
      accessCode: accessCode.trim(),
      xp: 0,
      level: 1,
      scheduleSlots: [],
      topic: "",
      platform,
      telegramChatId,
      vkPeerId,
      teacherId: freshToken.data().teacherId ?? null,
    })

    transaction.update(tokenRef, {
      status: "used",
      studentId,
      completedAt: FieldValue.serverTimestamp(),
    })
  })

  logger.info("Registration completed", { token, studentId })

  if (isSelfService) {
    // Required lazily to avoid a circular require, same reasoning
    // core/lessons.js and core/finance.js already use for this same module.
    const { createNotification } = require("./notifier")
    await createNotification({
      target: "teacher",
      studentId,
      type: "self_service_registration",
      text: `🎓 Новый ученик зарегистрировался самостоятельно: ${fullName.trim()}. Заполни его предмет, ставку и программу в панели.`,
    })
  }

  return studentId
}

async function cancelRegistrationToken(token, teacherId) {
  if (!token || typeof token !== "string") {
    throw new HttpsError("invalid-argument", "Не указан токен регистрации")
  }

  const tokenRef = db.collection(REGISTRATION_TOKENS_COLLECTION).doc(token)
  const snapshot = await tokenRef.get()

  if (!snapshot.exists) {
    throw new HttpsError("not-found", "Ссылка на регистрацию не найдена")
  }

  // Multi-tenancy Phase 2 ownership check. Self-service tokens (teacherId:
  // null, see createSelfServiceToken's own note) can't be owned by anyone
  // yet — cancelling one of those is left permitted for now rather than
  // permanently unreachable, since Phase 3's bot routing hasn't assigned
  // them an owner.
  const tokenTeacherId = snapshot.data().teacherId ?? null
  if (tokenTeacherId && tokenTeacherId !== teacherId) {
    throw new HttpsError("permission-denied", "Not your student")
  }

  await tokenRef.delete()

  logger.info("Registration token cancelled", { token })
}

module.exports = {
  createRegistrationToken,
  createSelfServiceToken,
  completeRegistration,
  getRegistrationTokenStatus,
  cancelRegistrationToken,
  // Multi-tenancy Phase 3: reused by core/teachers.js for slug generation —
  // same transliteration/slugify shape a student id's slug half already
  // needed, no reason to maintain a second Cyrillic transliteration map.
  slugify,
}
