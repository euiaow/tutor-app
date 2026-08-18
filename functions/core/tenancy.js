const { HttpsError } = require("firebase-functions/v2/https")
const { db } = require("./firestore")

// Multi-tenancy Phase 2: ownership checks for teacher-invoked callables that
// act on an existing student/template. A doc with no teacherId at all
// (legacy data predating the Phase 1/5 backfill) is deliberately let
// through rather than denied — denying it would lock the one real existing
// teacher out of all of today's pre-migration data before Phase 5 ever
// runs. This is a real, temporary gap in the tenant boundary (any teacher
// could still act on any *unmigrated* student), not an oversight — flagged
// explicitly here and in the Phase 2 summary rather than silently left for
// Phase 5 to discover.
function assertMatchesOrUnowned(actualTeacherId, requestingTeacherId, message) {
  if (actualTeacherId && actualTeacherId !== requestingTeacherId) {
    throw new HttpsError("permission-denied", message)
  }
}

async function assertOwnsStudent(studentId, teacherId) {
  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
  }

  const snapshot = await db.collection("students").doc(studentId).get()
  if (!snapshot.exists) {
    throw new HttpsError("not-found", "Ученик не найден")
  }

  const data = snapshot.data()
  assertMatchesOrUnowned(data.teacherId, teacherId, "Not your student")

  return data
}

async function assertOwnsTemplate(templateId, teacherId) {
  if (!templateId || typeof templateId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор шаблона")
  }

  const snapshot = await db.collection("curriculumTemplates").doc(templateId).get()
  if (!snapshot.exists) {
    throw new HttpsError("not-found", "Шаблон программы не найден")
  }

  const data = snapshot.data()
  assertMatchesOrUnowned(data.teacherId, teacherId, "Not your template")

  return data
}

module.exports = { assertOwnsStudent, assertOwnsTemplate }
