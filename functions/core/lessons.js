const { randomUUID } = require("crypto")
const { Timestamp, FieldValue } = require("firebase-admin/firestore")
const { getStorage } = require("firebase-admin/storage")
const { HttpsError } = require("firebase-functions/v2/https")
const logger = require("firebase-functions/logger")
const { db } = require("./firestore")
const { normalizeScheduleSlots, getUpcomingLessonDates } = require("./schedule")
const botMessages = require("./botMessages")
const { rescheduleLessonEvent, deleteLessonEvent, deleteLessonEventInstance, createExtraLessonEvent } = require("./googleCalendar")
const { createNotification } = require("./notifier")
const { deductLessonFromBalance } = require("./finance")

const STUDENTS_COLLECTION = "students"
const LESSONS_SUBCOLLECTION = "lessons"

function lessonsRef(studentId) {
  return db.collection(STUDENTS_COLLECTION).doc(studentId).collection(LESSONS_SUBCOLLECTION)
}

function emptyHomework() {
  return {
    assignment: { text: "", files: [] },
    submission: { files: [], submittedAt: null },
  }
}

// durationMinutes is written directly onto the lesson doc (not just read
// live off scheduleSlots at income-calculation time) so a later schedule
// edit can't retroactively change what a past/current week's income
// calculation sees for an already-created draft.
function createUpcomingDraft(studentId, teacherId, slotIndex, date, durationMinutes) {
  return lessonsRef(studentId).add({
    status: "upcoming",
    teacherId: teacherId ?? null,
    date: Timestamp.fromDate(date),
    slotIndex,
    durationMinutes: durationMinutes ?? 60,
    topic: "",
    homework: emptyHomework(),
    rescheduled: false,
    rescheduledDate: null,
    rescheduleStatus: null,
    rescheduleInitiator: null,
    rescheduleProposedDate: null,
    cancellationStatus: null,
    cancellationInitiator: null,
    proposalMessage: null,
    teacherProposalMessage: null,
    createdAt: FieldValue.serverTimestamp(),
  })
}

// Buckets every existing "upcoming" lesson doc by which schedule slot it
// belongs to. Only the first doc found per slot is kept — there should
// never be more than one, but this stays defensive. A doc with no real
// numeric slotIndex (an extra lesson, or a group-lesson mirror — see
// core/groups.js) is skipped entirely rather than defaulting into slot 0:
// it used to default there, which meant a single extra lesson could
// silently occupy slot 0's bucket and block ensureUpcomingLesson from ever
// creating that slot's actual recurring draft. Harmless while extra lessons
// were rare; became a guaranteed collision once every group lesson mirror
// (one per week, per member) started landing in this same collection with
// slotIndex: null.
function bucketUpcomingBySlot(snapshot) {
  const bySlot = new Map()
  for (const doc of snapshot.docs) {
    const slotIndex = doc.data().slotIndex
    if (typeof slotIndex !== "number") {
      continue
    }
    if (!bySlot.has(slotIndex)) {
      bySlot.set(slotIndex, doc)
    }
  }
  return bySlot
}

// Idempotent: for every schedule slot that doesn't already have an
// "upcoming" lesson draft, creates one. Called both from the teacher UI
// ("Подготовить урок" / after saving a schedule) and from reminders.js, so
// it must be safe to call repeatedly for the same student. Returns the id
// of the soonest upcoming lesson across all slots (occurrences is sorted
// ascending), preserving the single-lessonId contract every caller relies
// on.
async function ensureUpcomingLesson(studentId) {
  const studentRef = db.collection(STUDENTS_COLLECTION).doc(studentId)
  const studentSnapshot = await studentRef.get()

  if (!studentSnapshot.exists) {
    logger.warn("ensureUpcomingLesson: student not found", { studentId })
    return null
  }

  const scheduleSlots = normalizeScheduleSlots(studentSnapshot.data())
  if (scheduleSlots.length === 0) {
    logger.warn("ensureUpcomingLesson: no schedule set, skipping draft creation", { studentId })
    return null
  }

  const existingUpcoming = await lessonsRef(studentId).where("status", "==", "upcoming").get()
  const idsBySlot = new Map(
    [...bucketUpcomingBySlot(existingUpcoming).entries()].map(([slotIndex, doc]) => [slotIndex, doc.id]),
  )

  const teacherId = studentSnapshot.data().teacherId ?? null
  // No teacher-profile-timezone fallback passed here on purpose — a slot's
  // own stamped `timeZone` (set client-side at save time) always wins
  // inside getNextLessonDateForSlot, and a legacy slot with none falls back
  // to DEFAULT_TIME_ZONE (Europe/Moscow, the zone every schedule was
  // implicitly set in before per-slot anchoring existed) rather than
  // whatever the teacher's *current* Settings preference happens to be —
  // otherwise a legacy "16:00" would silently mean a different real instant
  // every time the teacher changes their own display timezone, which is
  // exactly the bug this was meant to fix.
  const occurrences = getUpcomingLessonDates(scheduleSlots, scheduleSlots.length)

  for (const occurrence of occurrences) {
    if (idsBySlot.has(occurrence.slotIndex)) {
      continue
    }
    const draft = await createUpcomingDraft(
      studentId,
      teacherId,
      occurrence.slotIndex,
      occurrence.date,
      scheduleSlots[occurrence.slotIndex]?.durationMinutes,
    )
    idsBySlot.set(occurrence.slotIndex, draft.id)
    logger.info("ensureUpcomingLesson: created upcoming lesson draft", {
      studentId,
      lessonId: draft.id,
      slotIndex: occurrence.slotIndex,
    })
  }

  const soonestSlotIndex = occurrences[0]?.slotIndex
  return idsBySlot.get(soonestSlotIndex) ?? null
}

// The actual source of truth for "this student's next lesson" — unlike
// ensureUpcomingLesson (which only ever looks at schedule slots and is
// blind to extra/unscheduled lessons since they have slotIndex: null),
// this queries every "upcoming" doc regardless of slotIndex/isExtraLesson
// and picks the one with the soonest *effective* date (rescheduledDate if
// set, otherwise date). Firestore can't orderBy a computed field, so this
// fetches every upcoming doc (there are at most a handful per student) and
// sorts in code rather than trying to express the rescheduledDate-or-date
// fallback in the query itself. Read-only — never creates a draft, unlike
// ensureUpcomingLesson; callers that need "find or create" should keep
// using ensureUpcomingLesson for that and this for "what's next".
async function getNearestUpcomingLesson(studentId) {
  const snapshot = await lessonsRef(studentId).where("status", "==", "upcoming").get()

  if (snapshot.empty) {
    return null
  }

  let nearestDoc = null
  let nearestDate = null

  for (const doc of snapshot.docs) {
    const data = doc.data()
    const effectiveDate = data.rescheduledDate?.toDate?.() ?? data.date?.toDate?.() ?? null
    if (!effectiveDate) continue

    if (!nearestDate || effectiveDate < nearestDate) {
      nearestDate = effectiveDate
      nearestDoc = doc
    }
  }

  return nearestDoc ? { id: nearestDoc.id, ...nearestDoc.data() } : null
}

// Unlike ensureUpcomingLesson (a no-op once a draft exists for every slot),
// this recomputes each slot's draft date whenever the recurring schedule
// itself changes — so editing a student's day/time actually moves their
// upcoming lesson instead of leaving it stuck on the date it was first
// created with. A lesson with an active reschedule (pending or already
// confirmed) is left alone: a one-off reschedule shouldn't be silently
// overwritten by a later schedule edit that has nothing to do with it.
// Returns the soonest upcoming lesson id across all slots, same contract as
// ensureUpcomingLesson.
async function syncUpcomingLessonToSchedule(studentId) {
  const studentSnapshot = await db.collection(STUDENTS_COLLECTION).doc(studentId).get()

  if (!studentSnapshot.exists) {
    logger.warn("syncUpcomingLessonToSchedule: student not found", { studentId })
    return null
  }

  const scheduleSlots = normalizeScheduleSlots(studentSnapshot.data())
  if (scheduleSlots.length === 0) {
    logger.info("syncUpcomingLessonToSchedule: no schedule set, nothing to sync", { studentId })
    return null
  }

  const existingUpcoming = await lessonsRef(studentId).where("status", "==", "upcoming").get()
  const bySlot = bucketUpcomingBySlot(existingUpcoming)
  const teacherId = studentSnapshot.data().teacherId ?? null
  // See the identical comment in ensureUpcomingLesson above — no
  // teacher-profile-timezone fallback on purpose.
  const occurrences = getUpcomingLessonDates(scheduleSlots, scheduleSlots.length)
  const idsBySlot = new Map()

  for (const occurrence of occurrences) {
    const existingDoc = bySlot.get(occurrence.slotIndex)

    if (!existingDoc) {
      const draft = await createUpcomingDraft(
        studentId,
        teacherId,
        occurrence.slotIndex,
        occurrence.date,
        scheduleSlots[occurrence.slotIndex]?.durationMinutes,
      )
      idsBySlot.set(occurrence.slotIndex, draft.id)
      logger.info("syncUpcomingLessonToSchedule: created draft for new slot", {
        studentId,
        lessonId: draft.id,
        slotIndex: occurrence.slotIndex,
      })
      continue
    }

    const existingLesson = existingDoc.data()

    if (existingLesson.rescheduleStatus) {
      logger.info("syncUpcomingLessonToSchedule: skip, lesson has an active reschedule", {
        studentId,
        lessonId: existingDoc.id,
        slotIndex: occurrence.slotIndex,
        rescheduleStatus: existingLesson.rescheduleStatus,
      })
      idsBySlot.set(occurrence.slotIndex, existingDoc.id)
      continue
    }

    await existingDoc.ref.update({ date: Timestamp.fromDate(occurrence.date) })
    idsBySlot.set(occurrence.slotIndex, existingDoc.id)
    logger.info("syncUpcomingLessonToSchedule: updated draft date to match new schedule", {
      studentId,
      lessonId: existingDoc.id,
      slotIndex: occurrence.slotIndex,
    })
  }

  const soonestSlotIndex = occurrences[0]?.slotIndex
  return idsBySlot.get(soonestSlotIndex) ?? null
}

async function updateHomeworkAssignment(studentId, lessonId, { text, files }) {
  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
  }
  if (!lessonId || typeof lessonId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор урока")
  }

  const lessonRef = lessonsRef(studentId).doc(lessonId)
  const snapshot = await lessonRef.get()

  if (!snapshot.exists) {
    throw new HttpsError("not-found", "Урок не найден")
  }

  const assignmentText = typeof text === "string" ? text : ""
  const newFiles = Array.isArray(files) ? files : []

  const lesson = snapshot.data()
  const prevText = lesson.homework?.assignment?.text ?? ""
  const prevFiles = lesson.homework?.assignment?.files ?? []

  await lessonRef.update({
    "homework.assignment": {
      text: assignmentText,
      files: newFiles,
    },
  })

  logger.info("updateHomeworkAssignment: assignment saved", { studentId, lessonId })

  const lessonDate = lesson.rescheduledDate?.toDate?.() ?? lesson.date?.toDate?.() ?? null

  const textAdded = !prevText && assignmentText
  const textChanged = prevText && assignmentText && assignmentText !== prevText
  const prevUrls = new Set(prevFiles.map((file) => file.url))
  const addedFiles = newFiles.filter((file) => !prevUrls.has(file.url))

  if (textAdded) {
    await createNotification({
      target: "student",
      studentId,
      type: "assignment_added",
      params: { lessonDate, assignmentText },
      lessonId,
    })
  } else if (textChanged) {
    await createNotification({
      target: "student",
      studentId,
      type: "assignment_updated",
      params: { lessonDate, assignmentText },
      lessonId,
    })
  }

  if (addedFiles.length > 0) {
    await createNotification({
      target: "student",
      studentId,
      type: "material_added",
      params: { lessonDate, fileTitles: addedFiles.map((file) => file.title) },
      lessonId,
    })
  }
}

// Direct client write elsewhere in the app (addLessonMaterial in
// src/firebase/lessons.js) was moved to this callable-backed path solely so
// attaching a material can trigger a "material_added" notification —
// nothing about materials themselves needed server-side validation.
async function addLessonMaterial(studentId, lessonId, material) {
  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
  }
  if (!lessonId || typeof lessonId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор урока")
  }
  if (!material?.url) {
    throw new HttpsError("invalid-argument", "Некорректный материал")
  }

  const lessonRef = lessonsRef(studentId).doc(lessonId)
  const snapshot = await lessonRef.get()

  if (!snapshot.exists) {
    throw new HttpsError("not-found", "Урок не найден")
  }

  await lessonRef.update({ materials: FieldValue.arrayUnion(material) })

  logger.info("addLessonMaterial: material added", { studentId, lessonId })

  const lesson = snapshot.data()
  const lessonDate = lesson.rescheduledDate?.toDate?.() ?? lesson.date?.toDate?.() ?? null

  await createNotification({
    target: "student",
    studentId,
    type: "material_added",
    params: { lessonDate, materialTitle: material.title },
    lessonId,
  })
}

// Creates a one-off lesson not tied to any weekly schedule slot
// (slotIndex: null) — ensureUpcomingLesson/the schedule triggers never touch
// it since it isn't bucketed by slot. Its own googleEventId lives on the
// lesson doc itself, unlike slot-based lessons whose event id lives on the
// student's googleEventIds map.
async function createExtraLesson(studentId, date) {
  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
  }
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new HttpsError("invalid-argument", "Некорректная дата урока")
  }

  const studentRef = db.collection(STUDENTS_COLLECTION).doc(studentId)
  const studentSnapshot = await studentRef.get()

  if (!studentSnapshot.exists) {
    throw new HttpsError("not-found", "Ученик не найден")
  }

  const student = studentSnapshot.data()
  const teacherId = student.teacherId ?? null

  const lessonRef = await lessonsRef(studentId).add({
    status: "upcoming",
    teacherId,
    date: Timestamp.fromDate(date),
    isExtraLesson: true,
    slotIndex: null,
    durationMinutes: 60,
    homework: emptyHomework(),
    remindersSent: { preLessonSent: false },
    createdAt: FieldValue.serverTimestamp(),
  })

  logger.info("createExtraLesson: lesson created", { studentId, lessonId: lessonRef.id })

  // Calendar sync and the student notification are independent of each
  // other (neither reads the other's result) — run them concurrently
  // instead of back-to-back. Calendar failure is secondary to "the lesson
  // exists" (already committed above), so it's caught and logged here
  // rather than allowed to fail the whole call — same reasoning
  // confirmReschedule/confirmCancellation already apply to their own
  // Calendar calls.
  const calendarPromise = createExtraLessonEvent(teacherId, student, date, 60)
    .then(async (googleEventId) => {
      if (googleEventId) {
        await lessonRef.update({ googleEventId })
      }
    })
    .catch((error) => {
      logger.error("createExtraLesson: failed to create Google Calendar event", {
        studentId,
        lessonId: lessonRef.id,
        error,
      })
    })

  const notificationPromise = createNotification({
    target: "student",
    studentId,
    type: "extra_lesson_assigned",
    params: { lessonDate: date },
    lessonId: lessonRef.id,
    teacherId,
  })

  const [, notificationResult] = await Promise.allSettled([calendarPromise, notificationPromise])
  if (notificationResult.status === "rejected") {
    logger.error("createExtraLesson: createNotification failed", {
      studentId,
      lessonId: lessonRef.id,
      error: notificationResult.reason,
    })
  }

  return { lessonId: lessonRef.id }
}

// Called when the teacher marks a lesson done in the unified
// HomeworkLessonDialog. Assignment files get copied into lesson.materials
// (deduped by url) so they show up in the student's materials library,
// which only reads lesson.materials/completed lessons — the assignment
// itself lives under homework and isn't otherwise surfaced there.
async function completeLesson(studentId, lessonId, { attendance, homeworkDone, rating } = {}) {
  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
  }
  if (!lessonId || typeof lessonId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор урока")
  }

  const lessonRef = lessonsRef(studentId).doc(lessonId)
  const snapshot = await lessonRef.get()

  if (!snapshot.exists) {
    throw new HttpsError("not-found", "Урок не найден")
  }

  const data = snapshot.data()
  const assignmentFiles = Array.isArray(data.homework?.assignment?.files)
    ? data.homework.assignment.files
    : []
  const existingMaterials = Array.isArray(data.materials) ? data.materials : []

  const materialsByUrl = new Map()
  for (const material of [...existingMaterials, ...assignmentFiles]) {
    if (material?.url) {
      materialsByUrl.set(material.url, material)
    }
  }

  // Coins reward, 0-3 per lesson: on-time attendance + homework done + rating
  // (excellent=1, good=0.5, needs_work/unset=0) — a completed perfect lesson
  // scores 3, two of them exactly cover the sticker-case price (see
  // DEFAULT_CASE_PRICE in gamification.js).
  const attendanceScore = attendance === "on_time" ? 1 : 0
  const homeworkScore = homeworkDone ? 1 : 0
  const ratingScore = rating === "excellent" ? 1 : rating === "good" ? 0.5 : 0
  const coinsEarned = attendanceScore + homeworkScore + ratingScore

  await lessonRef.update({
    status: "completed",
    attendance: attendance ?? null,
    homeworkDone: Boolean(homeworkDone),
    rating: rating ?? null,
    materials: Array.from(materialsByUrl.values()),
    coinsEarned,
  })

  // FieldValue.increment, not read-then-write, so concurrent completeLesson
  // calls for the same student can't race and clobber each other's award.
  await db.collection(STUDENTS_COLLECTION).doc(studentId).update({
    coinsBalance: FieldValue.increment(coinsEarned),
  })

  logger.info("completeLesson: lesson marked completed", { studentId, lessonId, coinsEarned })

  await deductLessonFromBalance(studentId, lessonId)

  // Generate the next lesson's draft right away rather than waiting for
  // the next reminders.js run — ensureUpcomingLesson's own query already
  // filters by status === "upcoming", so it won't find the lesson we just
  // flipped to "completed" above and will correctly create a new draft.
  const nextLessonId = await ensureUpcomingLesson(studentId)
  logger.info("completeLesson: ensured next upcoming lesson", { studentId, nextLessonId })
}

// Deletes the bot message with buttons a propose* call sent to the student,
// once the other side has answered — through the bot itself (the same
// confirm*/cancel*/reject* call the button triggers) or through the website
// (the exact same call, just made via the callable instead of a bot
// callback) — so the buttons never sit there looking unanswered. One shared
// path for both channels by construction: this runs inside
// confirm/cancel/reject themselves, not in the bot adapters, so there's
// nothing channel-specific to duplicate. Never throws — deletion failing
// (message already gone, or older than the platform's delete window) isn't
// allowed to break the confirm/cancel/reject flow itself.
async function deleteOneProposalMessage(proposalMessage, context) {
  try {
    if (proposalMessage.platform === "telegram") {
      const { deleteMessage } = require("../adapters/telegram")
      await deleteMessage(proposalMessage.chatId, proposalMessage.messageId, proposalMessage.botKey)
    } else if (proposalMessage.platform === "vk") {
      const { deleteMessage } = require("../adapters/vk")
      await deleteMessage(proposalMessage.chatId, proposalMessage.messageId, proposalMessage.groupId)
    }
  } catch (error) {
    logger.warn("deleteProposalMessages: failed to delete bot proposal message", {
      ...context,
      proposalMessage,
      error,
    })
  }
}

// Deletes both the student-side proposal message (`lesson.proposalMessage`,
// at most one — a student only ever has one linked platform) and the
// teacher-side ones (`lesson.teacherProposalMessage`, an array — the
// teacher can have both Telegram and VK connected at once, so a single
// proposal to the teacher may have gone out as two separate bot messages).
async function deleteProposalMessages(lesson, context) {
  if (lesson?.proposalMessage) {
    await deleteOneProposalMessage(lesson.proposalMessage, context)
  }

  if (Array.isArray(lesson?.teacherProposalMessage)) {
    for (const proposalMessage of lesson.teacherProposalMessage) {
      await deleteOneProposalMessage(proposalMessage, context)
    }
  }
}

// Extra (unscheduled) lessons store their own googleEventId directly on the
// lesson doc (createExtraLesson above) — slotIndex: null, so they're never
// keyed into student.googleEventIds by slot the way a recurring lesson is.
// confirmReschedule/confirmCancellation/cancelLessonDirectly used to always
// go straight for student.googleEventIds[slotIndex] (defaulting slotIndex
// to 0 for any lesson without a real slotIndex), which for an extra lesson
// either found nothing or, worse, found and touched slot 0's *recurring*
// event instead of the extra lesson's own — the calendar event a teacher
// actually meant to move/delete was silently left untouched. One shared
// helper so all three call sites resolve this the same way instead of
// duplicating (and potentially re-diverging on) the same branch.
function resolveLessonEventId(lesson, student) {
  if (lesson?.isExtraLesson) {
    return lesson.googleEventId ?? null
  }
  const slotIndex = typeof lesson?.slotIndex === "number" ? lesson.slotIndex : 0
  return student?.googleEventIds?.[String(slotIndex)] ?? student?.googleEventId ?? null
}

function assertRescheduleActor(value) {
  if (value !== "teacher" && value !== "student") {
    throw new HttpsError("invalid-argument", "Некорректная роль участника переноса")
  }
}

// A group-lesson mirror (see core/groups.js) is a real students/{id}/lessons
// doc, so it's structurally reachable through every individual single-lesson
// entry point (bot "перенести"/"отменить" flows included) — but rescheduling
// or cancelling just ONE member's copy would desync it from the rest of the
// group and from the one shared Calendar event, and a propose/confirm
// handshake makes no sense for a class taught to several people at once.
// Per explicit product decision, reschedule/cancel for a group lesson is a
// teacher-only, immediate, whole-group action — core/groups.js's
// rescheduleGroupLesson/cancelGroupLesson, never these single-mirror
// functions. Guarding here (not just in the UI) protects every caller at
// once, bot included.
function assertNotGroupMirror(lesson) {
  if (lesson?.isGroupLesson) {
    throw new HttpsError(
      "failed-precondition",
      "Перенос и отмена группового занятия выполняются только преподавателем, для всей группы сразу",
    )
  }
}

// A one-off exception for a single lesson — the recurring `schedule` on the
// student doc is left untouched. `initiator` records who proposed, so the
// *other* side is the one who has to confirm (see confirmReschedule).
async function proposeReschedule(studentId, lessonId, proposedDate, initiator) {
  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
  }
  if (!lessonId || typeof lessonId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор урока")
  }
  if (!(proposedDate instanceof Date) || Number.isNaN(proposedDate.getTime())) {
    throw new HttpsError("invalid-argument", "Некорректная дата переноса")
  }
  assertRescheduleActor(initiator)

  const lessonRef = lessonsRef(studentId).doc(lessonId)
  const snapshot = await lessonRef.get()
  if (!snapshot.exists) {
    throw new HttpsError("not-found", "Урок не найден")
  }
  const lesson = snapshot.data()
  assertNotGroupMirror(lesson)

  const rescheduleStatus = initiator === "teacher" ? "pending_student" : "pending_teacher"

  await lessonRef.update({
    rescheduleProposedDate: Timestamp.fromDate(proposedDate),
    rescheduleInitiator: initiator,
    rescheduleStatus,
  })

  logger.info("proposeReschedule: proposal recorded", {
    studentId,
    lessonId,
    initiator,
    rescheduleStatus,
  })

  const oldDate = lesson.date?.toDate?.() ?? null

  if (initiator === "teacher") {
    const keyboards = botMessages.RESCHEDULE_KEYBOARDS(lessonId, studentId)
    logger.info("proposeReschedule: VK keyboard built", { studentId, lessonId, vkKeyboard: JSON.stringify(keyboards.vk) })
    const { sentMessage } = await createNotification({
      target: "student",
      studentId,
      type: "reschedule_proposed_to_student",
      params: { oldDate, newDate: proposedDate },
      lessonId,
      telegramReplyMarkup: keyboards.telegram,
      vkKeyboard: keyboards.vk,
    })

    if (sentMessage) {
      await lessonRef.update({ proposalMessage: sentMessage })
    }
  } else {
    const studentSnapshot = await db.collection(STUDENTS_COLLECTION).doc(studentId).get()
    const studentData = studentSnapshot.exists ? studentSnapshot.data() : null
    const studentName = studentData?.name ?? "Ученик"
    const keyboards = botMessages.RESCHEDULE_KEYBOARDS_FOR_TEACHER(lessonId, studentId)
    const { sentMessages } = await createNotification({
      target: "teacher",
      studentId,
      type: "reschedule_proposed_to_teacher",
      text: (tz) => botMessages.RESCHEDULE_PROPOSED_TO_TEACHER(studentName, oldDate, proposedDate, tz),
      lessonId,
      teacherId: studentData?.teacherId ?? null,
      telegramReplyMarkup: keyboards.telegram,
      vkKeyboard: keyboards.vk,
    })

    if (sentMessages && sentMessages.length > 0) {
      await lessonRef.update({ teacherProposalMessage: sentMessages })
    }
  }

  return rescheduleStatus
}

// confirmedBy is whoever is CONFIRMING, which must be the side that did NOT
// initiate — you can't confirm your own proposal.
async function confirmReschedule(studentId, lessonId, confirmedBy) {
  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
  }
  if (!lessonId || typeof lessonId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор урока")
  }
  assertRescheduleActor(confirmedBy)

  const lessonRef = lessonsRef(studentId).doc(lessonId)
  const expectedStatus = confirmedBy === "teacher" ? "pending_teacher" : "pending_student"

  // Read-check-write used to be three separate steps, which meant two
  // near-simultaneous confirms (e.g. the student confirming from both the
  // lesson banner and the notification panel at once) could both read
  // "still pending" before either committed its write — both would then
  // proceed to send notifications and touch Calendar. A Firestore
  // transaction makes the read+check+write atomic: a second transaction
  // racing the same document is forced to retry, re-reads the now-updated
  // status, and correctly throws failed-precondition instead of duplicating
  // the whole confirm flow. `lesson` below is the PRE-update snapshot data,
  // same shape every call site after this already expected.
  const lesson = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(lessonRef)
    if (!snapshot.exists) {
      throw new HttpsError("not-found", "Урок не найден")
    }
    const lessonData = snapshot.data()

    if (lessonData.rescheduleStatus !== expectedStatus) {
      throw new HttpsError(
        "failed-precondition",
        "Нельзя подтвердить собственное предложение о переносе, либо перенос уже обработан",
      )
    }
    if (!lessonData.rescheduleProposedDate) {
      throw new HttpsError("failed-precondition", "Нет предложенной даты переноса")
    }

    // `date` itself moves to the confirmed time (not just rescheduledDate)
    // so every other system that reads it — reminders' date-range queries,
    // the "Ближайшие уроки" ordering, etc. — picks up the real lesson time.
    // rescheduled/rescheduledDate stay set as the "this was moved" audit
    // trail the UI badges off of.
    transaction.update(lessonRef, {
      date: lessonData.rescheduleProposedDate,
      rescheduledDate: lessonData.rescheduleProposedDate,
      rescheduleStatus: "confirmed",
      rescheduled: true,
      proposalMessage: null,
      teacherProposalMessage: null,
    })

    return lessonData
  })

  const proposedDate = lesson.rescheduleProposedDate
  const originalDate = lesson.date?.toDate?.() ?? null

  logger.info("confirmReschedule: reschedule confirmed", { studentId, lessonId, confirmedBy })

  // deleteProposalMessages (bot cleanup, never throws) and the student read
  // (needed below for both notifications' teacherId and the Calendar
  // resolution) don't depend on each other — run them together instead of
  // sequentially, and reuse this one read everywhere below instead of
  // re-reading the student doc a second time for Calendar resolution.
  const [, studentSnapshot] = await Promise.all([
    deleteProposalMessages(lesson, { studentId, lessonId }),
    db.collection(STUDENTS_COLLECTION).doc(studentId).get(),
  ])
  const student = studentSnapshot.exists ? studentSnapshot.data() : null
  const teacherId = student?.teacherId ?? null

  const newDate = proposedDate.toDate()
  const buildMessage = (tz) => botMessages.RESCHEDULE_CONFIRMED(newDate, tz)

  // Notifying the student and the teacher are independent of each other —
  // parallelize with allSettled (not all()) so one side's failure can never
  // swallow the other's already-in-flight send, and log-only rather than
  // throw since the reschedule itself (the write above) already succeeded.
  const [studentNotifResult, teacherNotifResult] = await Promise.allSettled([
    createNotification({ target: "student", studentId, type: "reschedule_confirmed", params: { newDate }, lessonId, teacherId }),
    createNotification({ target: "teacher", studentId, type: "reschedule_confirmed", text: buildMessage, lessonId, teacherId }),
  ])
  if (studentNotifResult.status === "rejected") {
    logger.error("confirmReschedule: student notification failed", { studentId, lessonId, error: studentNotifResult.reason })
  }
  if (teacherNotifResult.status === "rejected") {
    logger.error("confirmReschedule: teacher notification failed", { studentId, lessonId, error: teacherNotifResult.reason })
  }

  const eventId = resolveLessonEventId(lesson, student)

  if (eventId && originalDate) {
    try {
      const slotIndex = typeof lesson.slotIndex === "number" ? lesson.slotIndex : 0
      const durationMinutes = lesson.isExtraLesson
        ? (lesson.durationMinutes ?? 60)
        : (normalizeScheduleSlots(student)[slotIndex]?.durationMinutes ?? 60)
      await rescheduleLessonEvent(student?.teacherId ?? null, eventId, originalDate, newDate, durationMinutes)
    } catch (error) {
      logger.error("confirmReschedule: failed to update Google Calendar event", {
        studentId,
        lessonId,
        error,
      })
    }
  }
}

async function cancelReschedule(studentId, lessonId) {
  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
  }
  if (!lessonId || typeof lessonId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор урока")
  }

  const lessonRef = lessonsRef(studentId).doc(lessonId)
  const snapshot = await lessonRef.get()
  if (!snapshot.exists) {
    throw new HttpsError("not-found", "Урок не найден")
  }
  const lesson = snapshot.data()
  const initiator = lesson.rescheduleInitiator
  const originalDate = lesson.date?.toDate?.() ?? null

  await lessonRef.update({
    rescheduled: false,
    rescheduledDate: null,
    rescheduleStatus: null,
    rescheduleInitiator: null,
    rescheduleProposedDate: null,
    proposalMessage: null,
    teacherProposalMessage: null,
  })

  logger.info("cancelReschedule: reschedule cancelled", { studentId, lessonId })

  await deleteProposalMessages(lesson, { studentId, lessonId })

  const buildMessage = (tz) => botMessages.RESCHEDULE_REJECTED(originalDate, tz)

  // Notify whoever originally proposed — the other side is the one acting.
  if (initiator === "teacher") {
    await createNotification({ target: "teacher", studentId, type: "reschedule_rejected", text: buildMessage, lessonId })
  } else if (initiator === "student") {
    await createNotification({ target: "student", studentId, type: "reschedule_rejected", params: { originalDate }, lessonId })
  }
}

function assertCancellationActor(value) {
  if (value !== "teacher" && value !== "student") {
    throw new HttpsError("invalid-argument", "Некорректная роль участника отмены")
  }
}

// Mirrors proposeReschedule: `initiator` records who proposed, so the
// *other* side is the one who has to confirm (see confirmCancellation).
async function proposeCancellation(studentId, lessonId, initiator) {
  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
  }
  if (!lessonId || typeof lessonId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор урока")
  }
  assertCancellationActor(initiator)

  const lessonRef = lessonsRef(studentId).doc(lessonId)
  const snapshot = await lessonRef.get()
  if (!snapshot.exists) {
    throw new HttpsError("not-found", "Урок не найден")
  }
  const lesson = snapshot.data()
  assertNotGroupMirror(lesson)

  const cancellationStatus = initiator === "teacher" ? "pending_student" : "pending_teacher"

  await lessonRef.update({
    cancellationInitiator: initiator,
    cancellationStatus,
  })

  logger.info("proposeCancellation: proposal recorded", {
    studentId,
    lessonId,
    initiator,
    cancellationStatus,
  })

  const lessonDate = lesson.rescheduledDate?.toDate?.() ?? lesson.date?.toDate?.() ?? null

  if (initiator === "teacher") {
    const keyboards = botMessages.CANCELLATION_KEYBOARDS(lessonId, studentId)
    const { sentMessage } = await createNotification({
      target: "student",
      studentId,
      type: "cancellation_proposed_to_student",
      params: { lessonDate },
      lessonId,
      telegramReplyMarkup: keyboards.telegram,
      vkKeyboard: keyboards.vk,
    })

    if (sentMessage) {
      await lessonRef.update({ proposalMessage: sentMessage })
    }
  } else {
    const studentSnapshot = await db.collection(STUDENTS_COLLECTION).doc(studentId).get()
    const studentData = studentSnapshot.exists ? studentSnapshot.data() : null
    const studentName = studentData?.name ?? "Ученик"
    const keyboards = botMessages.CANCELLATION_KEYBOARDS_FOR_TEACHER(lessonId, studentId)
    const { sentMessages } = await createNotification({
      target: "teacher",
      studentId,
      type: "cancellation_proposed_to_teacher",
      text: (tz) => botMessages.CANCELLATION_PROPOSED_TO_TEACHER(studentName, lessonDate, tz),
      lessonId,
      teacherId: studentData?.teacherId ?? null,
      telegramReplyMarkup: keyboards.telegram,
      vkKeyboard: keyboards.vk,
    })

    if (sentMessages && sentMessages.length > 0) {
      await lessonRef.update({ teacherProposalMessage: sentMessages })
    }
  }

  return cancellationStatus
}

// confirmedBy is whoever is CONFIRMING, which must be the side that did NOT
// initiate — same rule as confirmReschedule.
async function confirmCancellation(studentId, lessonId, confirmedBy) {
  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
  }
  if (!lessonId || typeof lessonId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор урока")
  }
  assertCancellationActor(confirmedBy)

  const lessonRef = lessonsRef(studentId).doc(lessonId)
  const expectedStatus = confirmedBy === "teacher" ? "pending_teacher" : "pending_student"

  // Same atomic read-check-write fix as confirmReschedule above — see its
  // comment for the full reasoning. `lesson` is the PRE-update snapshot
  // data, same shape every call site below already expected.
  const lesson = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(lessonRef)
    if (!snapshot.exists) {
      throw new HttpsError("not-found", "Урок не найден")
    }
    const lessonData = snapshot.data()

    if (lessonData.cancellationStatus !== expectedStatus) {
      throw new HttpsError(
        "failed-precondition",
        "Нельзя подтвердить собственное предложение об отмене, либо отмена уже обработана",
      )
    }

    // Marked "cancelled" rather than deleted — same as the one-way
    // cancelLessonDirectly path below — so it still shows up in lesson
    // history instead of vanishing. The next occurrence of this slot still
    // gets its own draft created lazily (dailyReminderMidday's
    // ensureUpcomingDraftsForAllStudents, or whenever the teacher next opens
    // this student's card), not eagerly here, so a cancellation doesn't
    // immediately "resurrect" a lesson.
    transaction.update(lessonRef, { status: "cancelled" })

    return lessonData
  })

  const studentSnapshot = await db.collection(STUDENTS_COLLECTION).doc(studentId).get()
  const student = studentSnapshot.exists ? studentSnapshot.data() : null

  const eventId = resolveLessonEventId(lesson, student)
  const teacherId = student?.teacherId ?? null
  const cancelledLessonDate = lesson.rescheduledDate?.toDate?.() ?? lesson.date?.toDate?.() ?? null

  // Calendar cleanup and cleaning up the bot proposal messages are
  // independent of each other and of the status write above (already
  // committed by the transaction) — run them together instead of one after
  // another. Calendar is guarded so its failure can't take the cleanup down
  // with it, same as every other Calendar call site in this file. Same
  // extra-lesson-vs-recurring-occurrence branch as cancelLessonDirectly — see
  // its own comment for why deleting the master eventId is wrong here for a
  // recurring slot.
  const calendarPromise = eventId
    ? (lesson.isExtraLesson
        ? deleteLessonEvent(teacherId, eventId)
        : deleteLessonEventInstance(teacherId, eventId, cancelledLessonDate)
      ).catch((error) => {
        logger.error("confirmCancellation: failed to delete Google Calendar event", {
          studentId,
          lessonId,
          error,
        })
      })
    : Promise.resolve()

  await Promise.all([calendarPromise, deleteProposalMessages(lesson, { studentId, lessonId })])

  logger.info("confirmCancellation: cancellation confirmed, lesson marked cancelled", {
    studentId,
    lessonId,
    confirmedBy,
  })

  const lessonDate = lesson.rescheduledDate?.toDate?.() ?? lesson.date?.toDate?.() ?? null
  const buildMessage = (tz) => botMessages.CANCELLATION_CONFIRMED(lessonDate, tz)

  const [studentNotifResult, teacherNotifResult] = await Promise.allSettled([
    createNotification({ target: "student", studentId, type: "cancellation_confirmed", params: { lessonDate }, lessonId, teacherId }),
    createNotification({ target: "teacher", studentId, type: "cancellation_confirmed", text: buildMessage, lessonId, teacherId }),
  ])
  if (studentNotifResult.status === "rejected") {
    logger.error("confirmCancellation: student notification failed", { studentId, lessonId, error: studentNotifResult.reason })
  }
  if (teacherNotifResult.status === "rejected") {
    logger.error("confirmCancellation: teacher notification failed", { studentId, lessonId, error: teacherNotifResult.reason })
  }
}

// One-way cancellation — teacher cancels outright, no cancellationStatus/
// cancellationInitiator pending step at all (those fields stay untouched,
// unused by this path). Same "mark status: 'cancelled', never delete" shape
// as confirmCancellation above, so both cancellation paths show up in
// lesson history identically; also doesn't call ensureUpcomingLesson for
// the same reason confirmCancellation doesn't — the slot's next occurrence
// gets its own draft lazily, not forced here.
async function cancelLessonDirectly(studentId, lessonId) {
  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
  }
  if (!lessonId || typeof lessonId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор урока")
  }

  const lessonRef = lessonsRef(studentId).doc(lessonId)
  const snapshot = await lessonRef.get()
  if (!snapshot.exists) {
    throw new HttpsError("not-found", "Урок не найден")
  }
  const lesson = snapshot.data()
  assertNotGroupMirror(lesson)

  const studentSnapshot = await db.collection(STUDENTS_COLLECTION).doc(studentId).get()
  const student = studentSnapshot.exists ? studentSnapshot.data() : null

  const eventId = resolveLessonEventId(lesson, student)
  const teacherId = student?.teacherId ?? null
  const lessonDate = lesson.rescheduledDate?.toDate?.() ?? lesson.date?.toDate?.() ?? null

  // Calendar cleanup and the "cancelled" status write don't depend on each
  // other — run them together (see confirmCancellation for the same
  // pattern). Status write stays inside the await, so it's still fully
  // resolved before this function returns. An extra (unscheduled) lesson's
  // event is a genuine one-off with no series to preserve, so it's deleted
  // outright; a recurring slot's occurrence must only remove that one
  // instance (deleteLessonEventInstance) — deleting the master eventId here
  // would cancel every future week of that slot too, not just this one.
  const calendarPromise = eventId
    ? (lesson.isExtraLesson ? deleteLessonEvent(teacherId, eventId) : deleteLessonEventInstance(teacherId, eventId, lessonDate)).catch(
        (error) => {
          logger.error("cancelLessonDirectly: failed to delete Google Calendar event", {
            studentId,
            lessonId,
            error,
          })
        },
      )
    : Promise.resolve()

  await Promise.all([calendarPromise, lessonRef.update({ status: "cancelled" })])

  logger.info("cancelLessonDirectly: lesson cancelled directly by teacher", { studentId, lessonId })

  await createNotification({
    target: "student",
    studentId,
    type: "lesson_cancelled_by_teacher",
    params: { lessonDate },
    lessonId,
    teacherId,
  })
}

async function rejectCancellation(studentId, lessonId) {
  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
  }
  if (!lessonId || typeof lessonId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор урока")
  }

  const lessonRef = lessonsRef(studentId).doc(lessonId)
  const snapshot = await lessonRef.get()
  if (!snapshot.exists) {
    throw new HttpsError("not-found", "Урок не найден")
  }
  const lesson = snapshot.data()
  const initiator = lesson.cancellationInitiator

  await lessonRef.update({
    cancellationStatus: null,
    cancellationInitiator: null,
    proposalMessage: null,
    teacherProposalMessage: null,
  })

  logger.info("rejectCancellation: cancellation rejected", { studentId, lessonId })

  await deleteProposalMessages(lesson, { studentId, lessonId })

  const message = botMessages.CANCELLATION_REJECTED()

  // Notify whoever originally proposed — the other side is the one acting.
  if (initiator === "teacher") {
    await createNotification({ target: "teacher", studentId, type: "cancellation_rejected", text: message, lessonId })
  } else if (initiator === "student") {
    await createNotification({ target: "student", studentId, type: "cancellation_rejected", params: {}, lessonId })
  }
}

// Both bot adapters need this to route an incoming photo/document to the
// right student — telegramChatId/vkPeerId are set once at registration
// time (see core/registration.js) and never change afterwards.
async function findStudentIdByChatIdentity(platform, chatIdentity) {
  const field = platform === "telegram" ? "telegramChatId" : "vkPeerId"

  const snapshot = await db
    .collection(STUDENTS_COLLECTION)
    .where(field, "==", String(chatIdentity))
    .limit(1)
    .get()

  return snapshot.empty ? null : snapshot.docs[0].id
}

// Mirrors the {title, url} shape materials use elsewhere in the app, plus a
// long-lived download token in the same style the client SDK's
// getDownloadURL relies on, so the resulting link works the same way.
async function uploadHomeworkFile(studentId, buffer, contentType) {
  const bucket = getStorage().bucket()
  const filePath = `materials/${studentId}/homework_${Date.now()}`
  const file = bucket.file(filePath)
  const downloadToken = randomUUID()

  await file.save(buffer, {
    metadata: {
      contentType,
      cacheControl: "public, max-age=3600",
      metadata: { firebaseStorageDownloadTokens: downloadToken },
    },
  })

  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media&token=${downloadToken}`
}

// Note: a serverTimestamp() sentinel can't be nested inside an
// arrayUnion() element, so each file entry gets a concrete Timestamp
// instead — only the top-level submission.submittedAt uses the sentinel.
// `explicitLessonId` (optional) lets the "attach homework" button under a
// specific lesson in the student's own "all lessons" list (not just their
// single nearest one) attach to *that* lesson instead — validated against
// this student's own upcoming lessons so a bad/foreign id can't redirect a
// submission onto another lesson. Every other caller (the nearest-lesson
// button, both bots) omits it and keeps the original "always the nearest
// upcoming lesson" behavior.
async function recordHomeworkSubmission(studentId, fileUrl, explicitLessonId = null) {
  let lessonId = null
  if (explicitLessonId) {
    const explicitSnapshot = await lessonsRef(studentId).doc(explicitLessonId).get()
    if (explicitSnapshot.exists && explicitSnapshot.data().status === "upcoming") {
      lessonId = explicitLessonId
    }
  }

  if (!lessonId) {
    // getNearestUpcomingLesson already sees every upcoming doc regardless of
    // shape — including a group lesson's mirror (core/groups.js), which lives
    // in this exact same students/{id}/lessons collection and is otherwise
    // indistinguishable from this student's own lesson for this purpose. No
    // separate "check the group side too" branch needed any more.
    const nearest = await getNearestUpcomingLesson(studentId)
    lessonId = nearest ? nearest.id : await ensureUpcomingLesson(studentId)
  }

  if (!lessonId) {
    logger.warn("recordHomeworkSubmission: no upcoming lesson to attach submission to", {
      studentId,
    })
    return null
  }

  await lessonsRef(studentId)
    .doc(lessonId)
    .update({
      "homework.submission.files": FieldValue.arrayUnion({
        url: fileUrl,
        submittedAt: Timestamp.now(),
      }),
      "homework.submission.submittedAt": FieldValue.serverTimestamp(),
    })

  logger.info("recordHomeworkSubmission: submission recorded", { studentId, lessonId })

  const [studentSnapshot, lessonSnapshot] = await Promise.all([
    db.collection(STUDENTS_COLLECTION).doc(studentId).get(),
    lessonsRef(studentId).doc(lessonId).get(),
  ])
  const studentData = studentSnapshot.exists ? studentSnapshot.data() : null
  const studentName = studentData?.name ?? "Ученик"
  const teacherId = studentData?.teacherId ?? null
  const lessonData = lessonSnapshot.exists ? lessonSnapshot.data() : null
  const lessonDate = lessonData?.rescheduledDate?.toDate?.() ?? lessonData?.date?.toDate?.() ?? null

  // Notifying the teacher (submission arrived) and the student
  // (confirmation it was received) are independent — see confirmReschedule
  // for the same allSettled reasoning.
  const [teacherNotifResult, studentNotifResult] = await Promise.allSettled([
    createNotification({
      target: "teacher",
      studentId,
      type: "homework_submitted",
      text: (tz) => botMessages.HOMEWORK_SUBMITTED_TO_TEACHER(studentName, lessonDate, tz),
      lessonId,
      teacherId,
    }),
    createNotification({
      target: "student",
      studentId,
      type: "homework_received",
      params: {},
      lessonId,
      teacherId,
    }),
  ])
  if (teacherNotifResult.status === "rejected") {
    logger.error("recordHomeworkSubmission: teacher notification failed", { studentId, lessonId, error: teacherNotifResult.reason })
  }
  if (studentNotifResult.status === "rejected") {
    logger.error("recordHomeworkSubmission: student notification failed", { studentId, lessonId, error: studentNotifResult.reason })
  }

  return lessonId
}

// Student-facing (no request.auth — same trust model as recordHomeworkSubmission
// above): attaches a free-text comment to a lesson's own homework submission,
// and notifies the teacher the same way a submitted file does. Overwrites any
// previous comment on this lesson rather than accumulating a thread — matches
// the "one submission, one optional note" scope this was asked for.
async function addHomeworkSubmissionComment(studentId, lessonId, comment) {
  const ref = lessonsRef(studentId).doc(lessonId)
  const snapshot = await ref.get()
  if (!snapshot.exists) {
    throw new HttpsError("not-found", "Урок не найден")
  }
  const wasEdit = Boolean(snapshot.data()?.homework?.submission?.comment)

  await ref.update({ "homework.submission.comment": comment })

  logger.info("addHomeworkSubmissionComment: comment recorded", { studentId, lessonId, wasEdit })

  const studentSnapshot = await db.collection(STUDENTS_COLLECTION).doc(studentId).get()
  const studentData = studentSnapshot.exists ? studentSnapshot.data() : null
  const studentName = studentData?.name ?? "Ученик"
  const teacherId = studentData?.teacherId ?? null
  const lessonData = snapshot.data()
  const lessonDate = lessonData?.rescheduledDate?.toDate?.() ?? lessonData?.date?.toDate?.() ?? null

  try {
    await createNotification({
      target: "teacher",
      studentId,
      type: wasEdit ? "homework_comment_edited" : "homework_comment_added",
      text: (tz) =>
        wasEdit
          ? botMessages.HOMEWORK_COMMENT_EDITED_TO_TEACHER(studentName, lessonDate, comment, tz)
          : botMessages.HOMEWORK_COMMENT_ADDED_TO_TEACHER(studentName, lessonDate, comment, tz),
      lessonId,
      teacherId,
    })
  } catch (error) {
    logger.error("addHomeworkSubmissionComment: teacher notification failed", { studentId, lessonId, error })
  }

  return { success: true }
}

module.exports = {
  lessonsRef,
  createUpcomingDraft,
  ensureUpcomingLesson,
  getNearestUpcomingLesson,
  syncUpcomingLessonToSchedule,
  updateHomeworkAssignment,
  addLessonMaterial,
  createExtraLesson,
  addHomeworkSubmissionComment,
  completeLesson,
  proposeReschedule,
  confirmReschedule,
  cancelReschedule,
  proposeCancellation,
  confirmCancellation,
  cancelLessonDirectly,
  rejectCancellation,
  findStudentIdByChatIdentity,
  uploadHomeworkFile,
  recordHomeworkSubmission,
}
