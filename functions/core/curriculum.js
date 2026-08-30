const { FieldValue, Timestamp } = require("firebase-admin/firestore")
const { HttpsError } = require("firebase-functions/v2/https")
const logger = require("firebase-functions/logger")
const { db } = require("./firestore")

const STUDENTS_COLLECTION = "students"
const CURRICULUM_TEMPLATES_COLLECTION = "curriculumTemplates"
const PROGRAMS_SUBCOLLECTION = "programs"
const LESSONS_SUBCOLLECTION = "lessons"

function programsRef(studentId) {
  return db.collection(STUDENTS_COLLECTION).doc(studentId).collection(PROGRAMS_SUBCOLLECTION)
}

function programRef(studentId, programId) {
  return programsRef(studentId).doc(programId)
}

function lessonRef(studentId, lessonId) {
  return db.collection(STUDENTS_COLLECTION).doc(studentId).collection(LESSONS_SUBCOLLECTION).doc(lessonId)
}

// Mirrors curriculum-section.jsx's own shortId() — only needs to be unique
// within one program's own topics/prototypes array, not globally.
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

// Block 4 (multi-program) — this used to fully overwrite the student's
// single curriculumProgress/main doc, discarding any existing progress. Now
// it ADDS a new program doc instead, so a student can have several programs
// (e.g. one per subject) assigned at once, each tracked independently.
// Replacing/resetting one specific already-assigned program's content is
// reassignProgram below, not this function.
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

  const studentSnapshot = await db.collection(STUDENTS_COLLECTION).doc(studentId).get()
  if (!studentSnapshot.exists) {
    throw new HttpsError("not-found", "Ученик не найден")
  }

  const programRefNew = programsRef(studentId).doc()
  await programRefNew.set({
    subject: template.subject ?? null,
    // Denormalized from the template at assignment time, same reasoning as
    // examTypeId below — the student-facing radar/progress card titles show
    // the program's own name, not the raw subject, so they need this even
    // if the template is later renamed or deleted.
    name: template.name ?? "",
    templateId,
    // Denormalized from the template at assignment time, not a live
    // reference — if the template is later deleted/changed, this program's
    // own scale must keep working (same reasoning as teacherId below).
    examTypeId: template.examTypeId ?? null,
    // Denormalized from the parent student doc, same pattern already used
    // for lessons/balanceLedger — needed for the collectionGroup("programs")
    // summary query (getAllProgramsByStudent) to filter by teacherId
    // without an extra join.
    teacherId: studentSnapshot.data().teacherId ?? null,
    topics: withProgressDefaults(template.topics),
    prototypes: withProgressDefaults(template.prototypes),
    targetScore: null,
    examDate: null,
    assignedAt: FieldValue.serverTimestamp(),
  })

  logger.info("assignCurriculumTemplate: program added", { studentId, templateId, programId: programRefNew.id })

  return { success: true, programId: programRefNew.id }
}

// Replaces one specific already-assigned program's template-derived content
// (subject/templateId/examTypeId/topics/prototypes) — same "full replace,
// resets progress" semantics assignCurriculumTemplate used to have for the
// single-program model, now scoped to just this one program doc. Deliberately
// leaves targetScore/examDate untouched: those are the student's own goal
// for this program's subject, not part of "which topics does this program
// cover" — a teacher replacing the underlying template plan shouldn't
// silently wipe a goal the student already set.
async function reassignProgram(studentId, programId, newTemplateId) {
  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
  }
  if (!programId || typeof programId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор программы")
  }
  if (!newTemplateId || typeof newTemplateId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор шаблона")
  }

  const ref = programRef(studentId, programId)
  const [programSnapshot, templateSnapshot] = await Promise.all([
    ref.get(),
    db.collection(CURRICULUM_TEMPLATES_COLLECTION).doc(newTemplateId).get(),
  ])

  if (!programSnapshot.exists) {
    throw new HttpsError("not-found", "Программа не найдена")
  }
  if (!templateSnapshot.exists) {
    throw new HttpsError("not-found", "Шаблон программы не найден")
  }
  const template = templateSnapshot.data()

  await ref.update({
    subject: template.subject ?? null,
    name: template.name ?? "",
    templateId: newTemplateId,
    examTypeId: template.examTypeId ?? null,
    topics: withProgressDefaults(template.topics),
    prototypes: withProgressDefaults(template.prototypes),
  })

  logger.info("reassignProgram: program replaced", { studentId, programId, newTemplateId })

  return { success: true }
}

async function deleteProgram(studentId, programId) {
  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
  }
  if (!programId || typeof programId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор программы")
  }

  await programRef(studentId, programId).delete()
  logger.info("deleteProgram: program deleted", { studentId, programId })

  return { success: true }
}

// Student's own exam-prep goal for one specific program (Block 4 — used to
// live directly on students/{id}.targetScore/.examDate before multi-program
// support; a goal now belongs to the program whose subject it's for, not to
// the student as a whole). No request.auth check: student-facing action,
// reachable from the unauthenticated Student Dashboard, same trust model
// (studentId knowledge) as the rest of the student-facing surface.
async function setStudentGoal(studentId, programId, targetScore, examDate) {
  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
  }
  if (!programId || typeof programId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор программы")
  }

  const ref = programRef(studentId, programId)
  const snapshot = await ref.get()
  if (!snapshot.exists) {
    throw new HttpsError("not-found", "Программа не найдена")
  }
  const program = snapshot.data()

  // Clamp against this program's own exam type scale, not a hardcoded
  // 0-100 — a custom exam type with e.g. scaleMax 50 must not accept a
  // goal of 90 just because 90 <= 100. Falls back to the old 0-100 range
  // only if the exam type can't be resolved (deleted, or a "language_level"
  // type, whose targetScore is a scaleLabels index rather than a raw score).
  let scaleMin = 0
  let scaleMax = 100
  if (program.teacherId && program.examTypeId) {
    const examTypeSnapshot = await db
      .collection("teachers")
      .doc(program.teacherId)
      .collection("examTypes")
      .doc(program.examTypeId)
      .get()
    if (examTypeSnapshot.exists) {
      const examType = examTypeSnapshot.data()
      if (examType.scaleType === "language_level") {
        scaleMin = 0
        scaleMax = Array.isArray(examType.scaleLabels) ? examType.scaleLabels.length - 1 : 5
      } else {
        if (typeof examType.scaleMin === "number") scaleMin = examType.scaleMin
        if (typeof examType.scaleMax === "number") scaleMax = examType.scaleMax
      }
    }
  }

  const normalizedScore =
    targetScore === null || targetScore === undefined || targetScore === ""
      ? null
      : Math.max(scaleMin, Math.min(scaleMax, Number(targetScore)))
  const normalizedExamDate = examDate ? Timestamp.fromDate(new Date(examDate)) : null

  await ref.update({ targetScore: normalizedScore, examDate: normalizedExamDate })

  logger.info("setStudentGoal: goal updated", { studentId, programId, targetScore: normalizedScore })

  return { success: true }
}

// Adds one topic/prototype directly to one specific program, independent of
// whatever template it was originally assigned from. minScoreRequired
// defaults to 0 (the common case — a personal addition the teacher wants
// regardless of the student's target score) but still respects an explicit
// value, clamped 0-100 the same way setStudentGoal clamps targetScore.
async function addPersonalTopic(studentId, programId, { title, minScoreRequired, type } = {}) {
  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
  }
  if (!programId || typeof programId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор программы")
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

  const ref = programRef(studentId, programId)
  const snapshot = await ref.get()
  if (!snapshot.exists) {
    throw new HttpsError("not-found", "Программа не найдена")
  }

  await ref.update({ [field]: FieldValue.arrayUnion(newItem) })

  logger.info("addPersonalTopic: item added", { studentId, programId, type, id: newItem.id })

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
async function removePersonalTopic(studentId, programId, { itemId, type } = {}) {
  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
  }
  if (!programId || typeof programId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор программы")
  }
  if (!itemId || typeof itemId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор темы")
  }
  if (type !== "topic" && type !== "prototype") {
    throw new HttpsError("invalid-argument", "Некорректный тип элемента")
  }

  const field = type === "prototype" ? "prototypes" : "topics"
  const ref = programRef(studentId, programId)
  const snapshot = await ref.get()
  if (!snapshot.exists) {
    throw new HttpsError("not-found", "Программа не найдена")
  }

  const data = snapshot.data()
  const items = Array.isArray(data[field]) ? data[field] : []
  const nextItems = items.filter((item) => item.id !== itemId)

  await ref.update({ [field]: nextItems })

  logger.info("removePersonalTopic: item removed", { studentId, programId, type, itemId })

  return { success: true }
}

// Marks specific topics/prototypes as covered against one specific program,
// and mirrors the full covered {id,title} objects onto the lesson doc
// itself for history. A program that no longer exists (e.g. deleted between
// the dialog opening and the lesson being completed) is a silent no-op, not
// an error — completing a lesson must never fail just because of this.
async function markTopicsCovered(studentId, lessonId, programId, { topicIds, prototypeIds, rating } = {}) {
  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
  }
  if (!lessonId || typeof lessonId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор урока")
  }
  if (!programId || typeof programId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор программы")
  }

  const topicIdSet = new Set(Array.isArray(topicIds) ? topicIds : [])
  const prototypeIdSet = new Set(Array.isArray(prototypeIds) ? prototypeIds : [])
  const needsReview = rating === "needs_work"

  const progRef = programRef(studentId, programId)

  await db.runTransaction(async (transaction) => {
    // Reads must precede writes in a transaction — checking whether this
    // lessonId actually corresponds to a real students/{id}/lessons/{id}
    // doc lets this function stay reusable for a group lesson's
    // completion (session 17), whose lessonId lives at
    // teachers/{uid}/groups/{groupId}/lessons/{lessonId} instead — there is
    // no individual lesson doc to mirror coveredTopics/coveredPrototypes
    // onto in that case, so that part is just skipped rather than throwing
    // NOT_FOUND on a doc that was never meant to exist.
    const [progressSnapshot, lessonSnapshot] = await Promise.all([
      transaction.get(progRef),
      transaction.get(lessonRef(studentId, lessonId)),
    ])
    if (!progressSnapshot.exists) {
      logger.info("markTopicsCovered: program not found, no-op", { studentId, lessonId, programId })
      return
    }

    const data = progressSnapshot.data()
    const coveredTopics = []
    const coveredPrototypes = []

    const nextTopics = (Array.isArray(data.topics) ? data.topics : []).map((topic) => {
      if (!topicIdSet.has(topic.id)) return topic
      coveredTopics.push({ id: topic.id, title: topic.title })
      // "lesson" (vs. setCurriculumItemCovered's "manual") is what
      // computeRadarMetrics (src/lib/examRadar.js) uses to decide whether a
      // covered item can count toward pace — see its own comment for why a
      // teacher's initial "student already knows this" baseline setup must
      // not read as real per-week progress.
      return { ...topic, covered: true, coveredAt: Timestamp.now(), coveredVia: "lesson", needsReview }
    })

    const nextPrototypes = (Array.isArray(data.prototypes) ? data.prototypes : []).map((prototype) => {
      if (!prototypeIdSet.has(prototype.id)) return prototype
      coveredPrototypes.push({ id: prototype.id, title: prototype.title })
      return { ...prototype, covered: true, coveredAt: Timestamp.now(), coveredVia: "lesson", needsReview }
    })

    transaction.update(progRef, { topics: nextTopics, prototypes: nextPrototypes })
    if (lessonSnapshot.exists) {
      transaction.update(lessonRef(studentId, lessonId), { coveredTopics, coveredPrototypes })
    }
  })

  logger.info("markTopicsCovered: marked", {
    studentId,
    lessonId,
    programId,
    topicIds: [...topicIdSet],
    prototypeIds: [...prototypeIdSet],
  })

  return { success: true }
}

module.exports = {
  assignCurriculumTemplate,
  reassignProgram,
  deleteProgram,
  setStudentGoal,
  addPersonalTopic,
  removePersonalTopic,
  markTopicsCovered,
}
