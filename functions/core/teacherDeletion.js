const logger = require("firebase-functions/logger")
const { getAuth } = require("firebase-admin/auth")
const { db } = require("./firestore")
const { deleteGroup } = require("./groups")
const { deleteStudent } = require("./students")

const TEACHERS_COLLECTION = "teachers"
const STUDENTS_COLLECTION = "students"
const CURRICULUM_TEMPLATES_COLLECTION = "curriculumTemplates"
// Every other top-level collection that stamps a plain teacherId field
// (rather than living under teachers/{teacherId} as a subcollection, which
// db.recursiveDelete below already handles for free — groups/integrations/
// examTypes/customSubjects/subscriptionPayments).
const TOP_LEVEL_TEACHER_ID_COLLECTIONS = ["registrationTokens", "teacherConnectTokens", "notifications", "oauthStates"]
const BATCH_SIZE = 500

async function deleteDocsWhereTeacherId(collectionName, teacherId) {
  const snapshot = await db.collection(collectionName).where("teacherId", "==", teacherId).get()
  const docs = snapshot.docs
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = db.batch()
    for (const doc of docs.slice(i, i + BATCH_SIZE)) {
      batch.delete(doc.ref)
    }
    await batch.commit()
  }
  return docs.length
}

// Full cascade for one teacher's entire footprint in the app: every group
// (deleteGroup already cascades its lesson mirrors, Calendar events, and
// program unlink/delete), every student (deleteStudent already cascades
// their own lessons/programs/balance ledger/gamification data/notifications/
// registration tokens/bot sessions/Calendar events/Storage files — see
// core/students.js), every curriculum template, every other top-level doc
// keyed by teacherId, then the teachers/{teacherId} doc itself via
// recursiveDelete (picks up anything left under it — integrations,
// examTypes, customSubjects, subscriptionPayments, and any group that failed
// to delete above), and finally, optionally, the Firebase Auth account
// itself.
//
// Reused by two callers: the admin "delete teacher" action
// (deleteAuthUser: true — this is a live teacher being removed on purpose)
// and the one-off orphan-data cleanup pass (deleteAuthUser: false — an
// orphan by definition already has no live Auth account to delete).
// keepGroupLessons is always false for students here (unlike the normal
// single-student deleteStudent call) since every group this teacher owns is
// already being deleted in the loop above — nothing left to preserve.
async function deleteTeacherData(teacherId, { deleteAuthUser = false } = {}) {
  const summary = { teacherId, groupsDeleted: 0, groupsFailed: 0, studentsDeleted: 0, studentsFailed: 0 }

  const groupsSnapshot = await db.collection(TEACHERS_COLLECTION).doc(teacherId).collection("groups").get()
  for (const groupDoc of groupsSnapshot.docs) {
    try {
      await deleteGroup(teacherId, groupDoc.id)
      summary.groupsDeleted += 1
    } catch (error) {
      summary.groupsFailed += 1
      logger.error("deleteTeacherData: failed to delete group, continuing", { teacherId, groupId: groupDoc.id, error })
    }
  }

  const studentsSnapshot = await db.collection(STUDENTS_COLLECTION).where("teacherId", "==", teacherId).get()
  for (const studentDoc of studentsSnapshot.docs) {
    try {
      await deleteStudent(studentDoc.id, { keepGroupLessons: false })
      summary.studentsDeleted += 1
    } catch (error) {
      summary.studentsFailed += 1
      logger.error("deleteTeacherData: failed to delete student, continuing", { teacherId, studentId: studentDoc.id, error })
    }
  }

  summary.templatesDeleted = await deleteDocsWhereTeacherId(CURRICULUM_TEMPLATES_COLLECTION, teacherId)
  for (const collectionName of TOP_LEVEL_TEACHER_ID_COLLECTIONS) {
    summary[`${collectionName}Deleted`] = await deleteDocsWhereTeacherId(collectionName, teacherId)
  }

  try {
    await db.recursiveDelete(db.collection(TEACHERS_COLLECTION).doc(teacherId))
    summary.teacherDocDeleted = true
  } catch (error) {
    summary.teacherDocDeleted = false
    logger.error("deleteTeacherData: failed to recursively delete teacher doc", { teacherId, error })
  }

  if (deleteAuthUser) {
    try {
      await getAuth().deleteUser(teacherId)
      summary.authUserDeleted = true
    } catch (error) {
      if (error.code === "auth/user-not-found") {
        summary.authUserDeleted = false
      } else {
        summary.authUserDeleted = null
        logger.error("deleteTeacherData: failed to delete Auth user, continuing", { teacherId, error })
      }
    }
  }

  logger.info("deleteTeacherData: completed", summary)
  return summary
}

module.exports = { deleteTeacherData }
