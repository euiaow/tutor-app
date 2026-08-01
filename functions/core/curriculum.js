const { FieldValue, Timestamp } = require("firebase-admin/firestore")
const { HttpsError } = require("firebase-functions/v2/https")
const logger = require("firebase-functions/logger")
const { db } = require("./firestore")

const STUDENTS_COLLECTION = "students"
const CURRICULUM_TEMPLATES_COLLECTION = "curriculumTemplates"
const CURRICULUM_PROGRESS_SUBCOLLECTION = "curriculumProgress"
const CURRICULUM_PROGRESS_DOC_ID = "main"
const LESSONS_SUBCOLLECTION = "lessons"

function progressRef(studentId) {
  return db
    .collection(STUDENTS_COLLECTION)
    .doc(studentId)
    .collection(CURRICULUM_PROGRESS_SUBCOLLECTION)
    .doc(CURRICULUM_PROGRESS_DOC_ID)
}

function lessonRef(studentId, lessonId) {
  return db.collection(STUDENTS_COLLECTION).doc(studentId).collection(LESSONS_SUBCOLLECTION).doc(lessonId)
}

// Mirrors curriculum-section.jsx's own shortId() — only needs to be unique
// within one student's topics/prototypes array, not globally.
function shortId() {
  return Math.random().toString(36).slice(2, 10)
}

function withProgressDefaults(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    id: item.id,
    title: item.title,
    covered: false,
    coveredAt: null,
    minScoreRequired: typeof item.minScoreRequired === "number" ? item.minScoreRequired : 0,
  }))
}

// Full replace, never a merge — assigning a new template while one is
// already active discards all prior progress on purpose (the caller warns
// the teacher about this before calling in, see student-card.jsx).
async function assignCurriculumTemplate(studentId, templateId) {
  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
  }
  if (!templateId || typeof templateId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор шаблона")
  }

  const templateSnapshot = await db.collection(CURRICULUM_TEMPLATES_COLLECTION).doc(templateId).get()
  if (!templateSnapshot.exists) {
    throw new HttpsError("not-found", "Шаблон программы не найден")
  }
  const template = templateSnapshot.data()

  const studentRef = db.collection(STUDENTS_COLLECTION).doc(studentId)
  const studentSnapshot = await studentRef.get()
  if (!studentSnapshot.exists) {
    throw new HttpsError("not-found", "Ученик не найден")
  }

  await progressRef(studentId).set({
    topics: withProgressDefaults(template.topics),
    prototypes: withProgressDefaults(template.prototypes),
    assignedAt: FieldValue.serverTimestamp(),
  })

  await studentRef.update({ curriculumSourceTemplateId: templateId })

  logger.info("assignCurriculumTemplate: template assigned", { studentId, templateId })

  return { success: true }
}

// Student's own exam-prep goal (Exam Radar Phase 1) — lives here rather
// than core/students.js since it's conceptually part of the same
// curriculum/exam-tracking domain as assignCurriculumTemplate/
// markTopicsCovered, not general profile data. No request.auth check: this
// is a student-facing action, reachable from the unauthenticated Student
// Dashboard, same trust model (studentId knowledge) as the rest of the
// student-facing surface.
async function setStudentGoal(studentId, targetScore, examDate) {
  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
  }

  const studentRef = db.collection(STUDENTS_COLLECTION).doc(studentId)
  const studentSnapshot = await studentRef.get()
  if (!studentSnapshot.exists) {
    throw new HttpsError("not-found", "Ученик не найден")
  }

  const normalizedScore =
    targetScore === null || targetScore === undefined || targetScore === ""
      ? null
      : Math.max(0, Math.min(100, Number(targetScore)))
  const normalizedExamDate = examDate ? Timestamp.fromDate(new Date(examDate)) : null

  await studentRef.update({ targetScore: normalizedScore, examDate: normalizedExamDate })

  logger.info("setStudentGoal: goal updated", { studentId, targetScore: normalizedScore })

  return { success: true }
}

// Adds one topic/prototype directly to a student's own curriculumProgress,
// independent of whatever template it was originally assigned from —
// doesn't touch curriculumTemplates at all. minScoreRequired defaults to 0
// (the common case — a personal addition the teacher wants regardless of
// the student's target score) but still respects an explicit value from
// the same compact "Мин. балл" input the template editor uses, clamped
// 0-100 the same way setStudentGoal clamps targetScore. Creates
// curriculumProgress/main on the fly (via .set, not .update) if the
// student has no program assigned yet at all — this is a valid way to
// start a fully custom program without ever assigning a template.
async function addPersonalTopic(studentId, { title, minScoreRequired, type } = {}) {
  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
  }
  if (!title || typeof title !== "string" || !title.trim()) {
    throw new HttpsError("invalid-argument", "Не указано название темы")
  }
  if (type !== "topic" && type !== "prototype") {
    throw new HttpsError("invalid-argument", "Некорректный тип элемента")
  }

  const field = type === "prototype" ? "prototypes" : "topics"
  const score =
    minScoreRequired === null || minScoreRequired === undefined || minScoreRequired === ""
      ? 0
      : Math.max(0, Math.min(100, Number(minScoreRequired) || 0))

  const newItem = {
    id: shortId(),
    title: title.trim(),
    minScoreRequired: score,
    covered: false,
    coveredAt: null,
  }

  const ref = progressRef(studentId)
  const snapshot = await ref.get()

  if (!snapshot.exists) {
    await ref.set({
      topics: field === "topics" ? [newItem] : [],
      prototypes: field === "prototypes" ? [newItem] : [],
      assignedAt: FieldValue.serverTimestamp(),
    })
  } else {
    await ref.update({ [field]: FieldValue.arrayUnion(newItem) })
  }

  logger.info("addPersonalTopic: item added", { studentId, type, id: newItem.id })

  return { success: true, id: newItem.id }
}

// Removes one item by id — arrayRemove doesn't work here since the element
// isn't a primitive/exact-match value (its own covered/coveredAt could
// differ from what the client last saw), so this reads the array, filters
// out the matching id, and writes the whole array back. Deliberately never
// touches any lesson doc's coveredTopics/coveredPrototypes — those are
// historical records of what was actually covered in a past lesson, and
// removing an item from the *current* program must not rewrite that
// history.
async function removePersonalTopic(studentId, { itemId, type } = {}) {
  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
  }
  if (!itemId || typeof itemId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор темы")
  }
  if (type !== "topic" && type !== "prototype") {
    throw new HttpsError("invalid-argument", "Некорректный тип элемента")
  }

  const field = type === "prototype" ? "prototypes" : "topics"
  const ref = progressRef(studentId)
  const snapshot = await ref.get()
  if (!snapshot.exists) {
    throw new HttpsError("not-found", "Программа ученика не найдена")
  }

  const data = snapshot.data()
  const items = Array.isArray(data[field]) ? data[field] : []
  const nextItems = items.filter((item) => item.id !== itemId)

  await ref.update({ [field]: nextItems })

  logger.info("removePersonalTopic: item removed", { studentId, type, itemId })

  return { success: true }
}

// Marks specific topics/prototypes as covered against the student's active
// curriculumProgress, and mirrors the full covered {id,title} objects onto
// the lesson doc itself for history. A student with no curriculumProgress
// doc (no program assigned) is a silent no-op, not an error — completing a
// lesson must never fail just because this student has no program.
async function markTopicsCovered(studentId, lessonId, { topicIds, prototypeIds, rating } = {}) {
  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
  }
  if (!lessonId || typeof lessonId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор урока")
  }

  const topicIdSet = new Set(Array.isArray(topicIds) ? topicIds : [])
  const prototypeIdSet = new Set(Array.isArray(prototypeIds) ? prototypeIds : [])
  const needsReview = rating === "needs_work"

  const progRef = progressRef(studentId)

  await db.runTransaction(async (transaction) => {
    const progressSnapshot = await transaction.get(progRef)
    if (!progressSnapshot.exists) {
      logger.info("markTopicsCovered: no curriculum progress assigned, no-op", { studentId, lessonId })
      return
    }

    const data = progressSnapshot.data()
    const coveredTopics = []
    const coveredPrototypes = []

    const nextTopics = (Array.isArray(data.topics) ? data.topics : []).map((topic) => {
      if (!topicIdSet.has(topic.id)) return topic
      coveredTopics.push({ id: topic.id, title: topic.title })
      return { ...topic, covered: true, coveredAt: Timestamp.now(), needsReview }
    })

    const nextPrototypes = (Array.isArray(data.prototypes) ? data.prototypes : []).map((prototype) => {
      if (!prototypeIdSet.has(prototype.id)) return prototype
      coveredPrototypes.push({ id: prototype.id, title: prototype.title })
      return { ...prototype, covered: true, coveredAt: Timestamp.now(), needsReview }
    })

    transaction.update(progRef, { topics: nextTopics, prototypes: nextPrototypes })
    transaction.update(lessonRef(studentId, lessonId), { coveredTopics, coveredPrototypes })
  })

  logger.info("markTopicsCovered: marked", {
    studentId,
    lessonId,
    topicIds: [...topicIdSet],
    prototypeIds: [...prototypeIdSet],
  })

  return { success: true }
}

module.exports = {
  assignCurriculumTemplate,
  setStudentGoal,
  addPersonalTopic,
  removePersonalTopic,
  markTopicsCovered,
}
