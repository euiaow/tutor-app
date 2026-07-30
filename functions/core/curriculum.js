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

function withProgressDefaults(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    id: item.id,
    title: item.title,
    covered: false,
    coveredAt: null,
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

module.exports = { assignCurriculumTemplate, markTopicsCovered }
