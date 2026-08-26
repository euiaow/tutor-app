const { HttpsError } = require("firebase-functions/v2/https")
const { FieldValue } = require("firebase-admin/firestore")
const logger = require("firebase-functions/logger")
const { getStorage } = require("firebase-admin/storage")
const { db } = require("./firestore")
const { deleteLessonEvent } = require("./googleCalendar")

const STUDENTS_COLLECTION = "students"
const LESSONS_SUBCOLLECTION = "lessons"
const REGISTRATION_TOKENS_COLLECTION = "registrationTokens"
const TELEGRAM_SESSIONS_COLLECTION = "telegramSessions"
const VK_SESSIONS_COLLECTION = "vkSessions"
const NOTIFICATIONS_COLLECTION = "notifications"
const BATCH_SIZE = 500

// Every other per-student subcollection besides "lessons" (which needs its
// own special handling — Storage/Calendar cleanup per doc, plus the
// keepGroupLessons carve-out below). Deleting a student used to leave all of
// these orphaned under a doc path that no longer resolves to anything (a
// collectionGroup query can still find them) — see activeContext.md for the
// cleanup pass this closes.
const OTHER_STUDENT_SUBCOLLECTIONS = ["programs", "balanceLedger", "inventory", "decoration", "coinLedger"]

// Storage download URLs look like
// https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{encodedPath}?alt=media&token=...
// (see core/lessons.js's uploadHomeworkFile) — the object path lives between
// "/o/" and the query string.
function extractStoragePathFromUrl(url) {
  if (typeof url !== "string") {
    return null
  }

  const match = /\/o\/([^?]+)/.exec(url)
  if (!match) {
    return null
  }

  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

async function deleteStorageFile(bucket, url) {
  const path = extractStoragePathFromUrl(url)
  if (!path) {
    return
  }

  try {
    await bucket.file(path).delete()
  } catch (error) {
    // The file may already be gone, or the URL may not even point at our
    // bucket — either way this must not abort the rest of the deletion.
    logger.warn("deleteStudent: failed to delete storage file, skipping", { url, error: error.message })
  }
}

function collectLessonFileUrls(lesson) {
  const urls = new Set()

  for (const material of lesson.materials ?? []) {
    if (material?.url) urls.add(material.url)
  }
  for (const file of lesson.homework?.assignment?.files ?? []) {
    if (file?.url) urls.add(file.url)
  }
  for (const file of lesson.homework?.submission?.files ?? []) {
    if (file?.url) urls.add(file.url)
  }

  return [...urls]
}

// Deletes every lesson doc plus whatever Storage files they reference.
// Firestore has no recursive delete for subcollections through a single
// document delete, so this has to be done explicitly before the parent
// students/{studentId} doc goes away.
// Extra (unscheduled) lessons store their own googleEventId directly on the
// lesson doc (createExtraLesson, core/lessons.js) — slotIndex: null, so
// they're invisible to the student.googleEventIds map deleteStudent's own
// cleanup loop reads. Collected here, alongside the file-url scan this
// function already did, rather than a second pass over the same snapshot.
// keepGroupLessons (default true, see deleteStudent's own param) leaves any
// isGroupLesson mirror doc untouched — a group lesson mirror is shared
// occurrence data (see core/groups.js's module comment on groupLessonKey
// tying N mirrors together); deleting one member's copy on its own would
// desync that occurrence from the rest of the group for no reason, when the
// group itself (and hence all its mirrors) is deleted as a whole via
// deleteGroup. A full teacher-account cascade delete passes
// keepGroupLessons: false since by that point every group the teacher owns
// is already being deleted anyway — this is just a safety net there.
async function deleteStudentLessons(studentId, bucket, teacherId, { keepGroupLessons = true } = {}) {
  const lessonsRef = db.collection(STUDENTS_COLLECTION).doc(studentId).collection(LESSONS_SUBCOLLECTION)
  const snapshot = await lessonsRef.get()
  const docsToDelete = snapshot.docs.filter((lessonDoc) => !(keepGroupLessons && lessonDoc.data().isGroupLesson))

  let extraLessonCalendarEventsDeleted = 0
  for (const lessonDoc of docsToDelete) {
    const lesson = lessonDoc.data()
    const fileUrls = collectLessonFileUrls(lesson)
    for (const url of fileUrls) {
      await deleteStorageFile(bucket, url)
    }

    if (lesson.isExtraLesson && lesson.googleEventId) {
      try {
        await deleteLessonEvent(teacherId, lesson.googleEventId)
        extraLessonCalendarEventsDeleted += 1
      } catch (error) {
        logger.warn("deleteStudentLessons: failed to delete extra lesson's Google Calendar event, continuing", {
          studentId,
          lessonId: lessonDoc.id,
          eventId: lesson.googleEventId,
          error: error.message,
        })
      }
    }
  }

  for (let i = 0; i < docsToDelete.length; i += BATCH_SIZE) {
    const batch = db.batch()
    for (const lessonDoc of docsToDelete.slice(i, i + BATCH_SIZE)) {
      batch.delete(lessonDoc.ref)
    }
    await batch.commit()
  }

  return { lessonsDeleted: docsToDelete.length, extraLessonCalendarEventsDeleted }
}

// The other per-student subcollections (programs/balanceLedger/inventory/
// decoration/coinLedger) have no Storage/Calendar side effects to worry
// about — a plain recursive delete per subcollection is enough.
async function deleteOtherStudentSubcollections(studentId) {
  for (const subcollection of OTHER_STUDENT_SUBCOLLECTIONS) {
    try {
      await db.recursiveDelete(db.collection(STUDENTS_COLLECTION).doc(studentId).collection(subcollection))
    } catch (error) {
      logger.warn("deleteStudent: failed to delete subcollection, continuing", {
        studentId,
        subcollection,
        error: error.message,
      })
    }
  }
}

// A deleted student left in a group's memberStudentIds would otherwise get
// silently "recreated" the next time ensureUpcomingGroupLessons runs for
// that group — createUpcomingDraft would happily write a fresh
// students/{deletedId}/lessons/{id} doc under a parent that no longer
// exists. Scoped to groups this student's own teacherId owns (a group can
// only ever contain a teacher's own students, so this is exhaustive without
// a wider collectionGroup scan).
async function removeStudentFromGroups(studentId, teacherId) {
  if (!teacherId) return

  try {
    const snapshot = await db
      .collection("teachers")
      .doc(teacherId)
      .collection("groups")
      .where("memberStudentIds", "array-contains", studentId)
      .get()

    await Promise.all(
      snapshot.docs.map((groupDoc) => groupDoc.ref.update({ memberStudentIds: FieldValue.arrayRemove(studentId) })),
    )
  } catch (error) {
    logger.warn("deleteStudent: failed to remove student from groups, continuing", {
      studentId,
      teacherId,
      error: error.message,
    })
  }
}

async function deleteNotificationsForStudent(studentId) {
  try {
    const snapshot = await db.collection(NOTIFICATIONS_COLLECTION).where("studentId", "==", studentId).get()
    if (snapshot.empty) return

    const docs = snapshot.docs
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = db.batch()
      for (const notificationDoc of docs.slice(i, i + BATCH_SIZE)) {
        batch.delete(notificationDoc.ref)
      }
      await batch.commit()
    }
  } catch (error) {
    logger.warn("deleteStudent: failed to delete notifications, skipping", { studentId, error: error.message })
  }
}

// completeRegistration (core/registration.js) stamps the token doc with
// studentId once it's used, so this is a direct query rather than needing
// to touch anything at registration time.
async function deleteRegistrationTokensForStudent(studentId) {
  try {
    const snapshot = await db
      .collection(REGISTRATION_TOKENS_COLLECTION)
      .where("studentId", "==", studentId)
      .get()

    if (snapshot.empty) {
      return
    }

    const batch = db.batch()
    snapshot.docs.forEach((tokenDoc) => batch.delete(tokenDoc.ref))
    await batch.commit()
  } catch (error) {
    logger.warn("deleteStudent: failed to delete registration tokens, skipping", {
      studentId,
      error: error.message,
    })
  }
}

// telegramSessions/vkSessions docs are keyed by chatId/peerId directly (see
// adapters/telegram.js and adapters/vk.js), not by studentId — the student
// doc's own telegramChatId/vkPeerId fields are the only link, and are
// normally already cleared by the adapters once a flow completes. This is
// just a defensive sweep for anything left mid-flow.
async function deleteBotSessionsForStudent(studentId, student) {
  const deletions = []

  if (student.telegramChatId) {
    deletions.push(db.collection(TELEGRAM_SESSIONS_COLLECTION).doc(String(student.telegramChatId)).delete())
  }
  if (student.vkPeerId) {
    deletions.push(db.collection(VK_SESSIONS_COLLECTION).doc(String(student.vkPeerId)).delete())
  }

  try {
    await Promise.all(deletions)
  } catch (error) {
    logger.warn("deleteStudent: failed to delete bot sessions, skipping", { studentId, error: error.message })
  }
}

const { VALID_THEME_IDS: VALID_COLOR_THEMES } = require("./themes")
const VALID_LANGUAGES = new Set(["ru", "en"])

// Generic IANA-zone validity check (Intl throws RangeError for a bogus
// zone) rather than checking against a fixed whitelist — the frontend's
// TIME_ZONE_OPTIONS (src/lib/timezone.js) is just a curated suggestion
// list, not the actual set of zones a saved value is allowed to be (e.g.
// Intl.DateTimeFormat().resolvedOptions().timeZone can hand back a device
// zone that isn't in that curated list at all).
function isValidTimeZone(timeZone) {
  if (typeof timeZone !== "string" || !timeZone) {
    return false
  }
  try {
    Intl.DateTimeFormat(undefined, { timeZone })
    return true
  } catch {
    return false
  }
}

// Student-facing, no request.auth check — same trust model (studentId
// knowledge) as every other student-reachable callable in this project
// (see setStudentGoal in core/curriculum.js for the identical shape).
// Multi-tenancy Phase 4a: the two per-user display preferences (see
// teachers/{uid}'s identically-named fields, written directly by the
// teacher via updateDoc rather than a callable — see App.jsx/
// firebase/teachers.js). `language` added later (student dashboard i18n) —
// optional/nullable on purpose: StudentSettingsDialog always sends the
// current value either way, but the field predates this callable (was set
// by hand in Firestore during the i18n rollout) so `undefined`/missing is
// still tolerated rather than forced to "ru".
async function updateStudentSettings(studentId, { timezone, colorTheme, language } = {}) {
  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
  }
  if (!isValidTimeZone(timezone)) {
    throw new HttpsError("invalid-argument", "Некорректный часовой пояс")
  }
  if (!VALID_COLOR_THEMES.has(colorTheme)) {
    throw new HttpsError("invalid-argument", "Некорректная цветовая тема")
  }
  if (language != null && !VALID_LANGUAGES.has(language)) {
    throw new HttpsError("invalid-argument", "Некорректный язык")
  }

  const studentRef = db.collection(STUDENTS_COLLECTION).doc(studentId)
  const studentSnapshot = await studentRef.get()
  if (!studentSnapshot.exists) {
    throw new HttpsError("not-found", "Ученик не найден")
  }

  const update = { timezone, colorTheme }
  if (language != null) {
    update.language = language
  }
  await studentRef.update(update)

  logger.info("updateStudentSettings: settings updated", { studentId, timezone, colorTheme, language })

  return { success: true }
}

// keepGroupLessons: true is the normal (teacher deletes one student) case —
// see deleteStudentLessons' own comment. A full teacher-account cascade
// delete (core/admin.js's deleteTeacherAccount) passes false, since it
// deletes every group first anyway and this is just a safety net for
// anything that survives that pass.
async function deleteStudent(studentId, { keepGroupLessons = true } = {}) {
  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
  }

  const studentRef = db.collection(STUDENTS_COLLECTION).doc(studentId)
  const studentSnapshot = await studentRef.get()

  if (!studentSnapshot.exists) {
    throw new HttpsError("not-found", "Ученик не найден")
  }

  const student = studentSnapshot.data()
  const bucket = getStorage().bucket()

  const eventIdsToDelete = [
    ...Object.values(student.googleEventIds ?? {}),
    ...(student.googleEventId ? [student.googleEventId] : []),
  ]

  let calendarEventsDeleted = 0
  for (const eventId of eventIdsToDelete) {
    try {
      await deleteLessonEvent(student.teacherId ?? null, eventId)
      calendarEventsDeleted += 1
    } catch (error) {
      logger.warn("deleteStudent: failed to delete Google Calendar event, continuing", {
        studentId,
        eventId,
        error: error.message,
      })
    }
  }

  let lessonsDeleted = 0
  let extraLessonCalendarEventsDeleted = 0
  try {
    const result = await deleteStudentLessons(studentId, bucket, student.teacherId ?? null, { keepGroupLessons })
    lessonsDeleted = result.lessonsDeleted
    extraLessonCalendarEventsDeleted = result.extraLessonCalendarEventsDeleted
  } catch (error) {
    logger.warn("deleteStudent: failed to delete lessons subcollection, continuing", {
      studentId,
      error: error.message,
    })
  }

  await deleteOtherStudentSubcollections(studentId)
  await removeStudentFromGroups(studentId, student.teacherId ?? null)
  await deleteNotificationsForStudent(studentId)
  await deleteRegistrationTokensForStudent(studentId)
  await deleteBotSessionsForStudent(studentId, student)

  try {
    await studentRef.delete()
  } catch (error) {
    logger.error("deleteStudent: failed to delete student document", { studentId, error })
    throw new HttpsError("internal", "Не удалось удалить ученика")
  }

  logger.info("deleteStudent completed", {
    studentId,
    lessonsDeleted,
    calendarEventsDeleted,
    extraLessonCalendarEventsDeleted,
  })
}

module.exports = { deleteStudent, updateStudentSettings }
