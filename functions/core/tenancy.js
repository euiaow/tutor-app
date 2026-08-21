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

// Groups live at teachers/{teacherId}/groups/{groupId} (a subcollection of
// the teacher's own doc), unlike students/templates which are top-level
// collections with a stored teacherId field to compare against — so this
// doesn't need assertMatchesOrUnowned's "stored field matches caller" check
// at all. The path itself is the ownership boundary: a lookup at
// teachers/{callerId}/groups/{groupId} can structurally never resolve to a
// group belonging to a different teacher, so a mismatched groupId just
// 404s here the same way it would for anyone. Kept as its own function
// (mirroring assertOwnsStudent/assertOwnsTemplate's shape) for a
// consistent "not found" error and to hand back the group's data, not
// because groups need the same kind of ownership arithmetic.
async function assertOwnsGroup(groupId, teacherId) {
  if (!groupId || typeof groupId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор группы")
  }

  const snapshot = await db.collection("teachers").doc(teacherId).collection("groups").doc(groupId).get()
  if (!snapshot.exists) {
    throw new HttpsError("not-found", "Группа не найдена")
  }

  return snapshot.data()
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

module.exports = { assertOwnsStudent, assertOwnsTemplate, assertOwnsGroup }
