// One-off backfill for Block 4 (multi-program support): copies each
// student's single curriculumProgress/main doc into a new
// students/{id}/programs/{programId} doc, denormalizing teacherId and
// resolving subject/examTypeId from data that previously lived elsewhere
// (student.subject[0], student.examTarget mapped to the matching examType
// by name). The old curriculumProgress/main doc is NEVER deleted by this
// script — it's left in place as a manual-review backup, on purpose (real
// teacher/student data, not just test fixtures this time). Run manually:
//
//   node functions/scripts/migrateToPrograms.js
//
// Not wired into `firebase deploy` or any automatic trigger.

const { db } = require("../core/firestore")

const BATCH_SIZE = 500

// Matches the 3 seed names App.jsx's ensureTeacherProfile creates for every
// new teacher — the only reliable link between the old enum value and a
// real examTypes doc, since nothing stored the mapping explicitly.
const LEGACY_EXAM_TARGET_TO_NAME = {
  ege: "ЕГЭ",
  oge: "ОГЭ",
  school: "Школьная программа",
}

async function findExamTypeIdByName(examTypesCache, teacherId, name) {
  if (!teacherId || !name) return null

  const cacheKey = teacherId
  if (!examTypesCache.has(cacheKey)) {
    const snapshot = await db.collection("teachers").doc(teacherId).collection("examTypes").get()
    const byName = new Map(snapshot.docs.map((doc) => [doc.data().name, doc.id]))
    examTypesCache.set(cacheKey, byName)
  }

  return examTypesCache.get(cacheKey).get(name) ?? null
}

async function migrateToPrograms() {
  const studentsSnapshot = await db.collection("students").get()

  let migrated = 0
  let needsReview = 0
  const reviewNotes = []
  const examTypesCache = new Map()

  let batch = db.batch()
  let opsInBatch = 0

  async function flushIfNeeded() {
    if (opsInBatch >= BATCH_SIZE) {
      await batch.commit()
      batch = db.batch()
      opsInBatch = 0
    }
  }

  for (const studentDoc of studentsSnapshot.docs) {
    const studentId = studentDoc.id
    const student = studentDoc.data()

    const progressRef = studentDoc.ref.collection("curriculumProgress").doc("main")
    const progressSnapshot = await progressRef.get()
    if (!progressSnapshot.exists) {
      continue
    }
    const progress = progressSnapshot.data()

    const teacherId = student.teacherId ?? null
    if (!teacherId) {
      needsReview += 1
      reviewNotes.push(`${studentId}: no teacherId on student doc — skipped, migrate manually`)
      continue
    }

    const subject = Array.isArray(student.subject) && student.subject.length > 0 ? student.subject[0] : null
    if (!subject) {
      needsReview += 1
      reviewNotes.push(`${studentId}: no subject set — migrated with subject: null, needs manual fill-in`)
    }

    const legacyExamTargetName = LEGACY_EXAM_TARGET_TO_NAME[student.examTarget] ?? null
    const examTypeId = await findExamTypeIdByName(examTypesCache, teacherId, legacyExamTargetName)
    if (!examTypeId) {
      needsReview += 1
      reviewNotes.push(
        `${studentId}: could not resolve examTypeId (old examTarget: ${student.examTarget ?? "none"}) — migrated with examTypeId: null, needs manual fix`,
      )
    }

    const newProgramRef = studentDoc.ref.collection("programs").doc()
    batch.set(newProgramRef, {
      subject,
      templateId: student.curriculumSourceTemplateId ?? null,
      examTypeId,
      teacherId,
      topics: Array.isArray(progress.topics) ? progress.topics : [],
      prototypes: Array.isArray(progress.prototypes) ? progress.prototypes : [],
      targetScore: student.targetScore ?? null,
      examDate: student.examDate ?? null,
      assignedAt: progress.assignedAt ?? null,
    })
    migrated += 1
    opsInBatch += 1
    await flushIfNeeded()
  }

  if (opsInBatch > 0) {
    await batch.commit()
  }

  console.log(`migrateToPrograms: migrated ${migrated} program(s)`)
  console.log(`migrateToPrograms: ${needsReview} entry/entries need manual review:`)
  reviewNotes.forEach((note) => console.log(`  - ${note}`))
  console.log("migrateToPrograms: old curriculumProgress/main docs were NOT deleted — remove manually once verified.")
}

migrateToPrograms()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("migrateToPrograms: failed", error)
    process.exit(1)
  })
