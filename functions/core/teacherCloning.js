const crypto = require("crypto")
const { getAuth } = require("firebase-admin/auth")
const { FieldValue } = require("firebase-admin/firestore")
const logger = require("firebase-functions/logger")
const { db } = require("./firestore")
const { generateTeacherSlug } = require("./teachers")
const { deleteTeacherData } = require("./teacherDeletion")

const TEACHERS_COLLECTION = "teachers"
const STUDENTS_COLLECTION = "students"
const CURRICULUM_TEMPLATES_COLLECTION = "curriculumTemplates"

function randomPassword() {
  // 16 base64url chars — no ambiguous-character concerns since it's
  // generated and handed back whole, never manually retyped.
  return crypto.randomBytes(12).toString("base64url")
}

// Copies one teacher's entire demo-relevant footprint (profile prefs, exam
// types, custom subjects, curriculum templates, students + their own
// programs, groups) into a brand-new teacher account with its own real
// Firebase Auth user — built for cloning one populated "showcase" account
// into several demo accounts, not a general-purpose migration tool.
//
// Deliberately NOT cloned:
// - lessons/balanceLedger subcollections (real history tied to the source
//   account's own timeline — a fresh demo account starts with no lesson
//   history, same as any newly-onboarded real teacher would).
// - googleEventIds/googleEventId (Calendar event ids from the source
//   teacher's own connected Google Calendar — meaningless, and would never
//   resolve, for a demo account with no Calendar connection of its own).
// - remindersSent (stale reminder-throttle bookkeeping, not real data).
// - subscription/admin fields on the teacher profile (plan, blocked status,
//   admin notes) — a fresh demo account gets the same trial defaults
//   ensureTeacherProfile (App.jsx) gives any newly-created real teacher.
//
// Explicitly KEPT as-is (by explicit product decision, not an oversight):
// telegramChatId/vkPeerId/platform on cloned students — every clone shares
// the same real chat identity on purpose. This does mean an *inbound* bot
// action (a reply, a bot-side "перенести"/"отменить") can only ever route
// to one of the clones at a time (findStudentIdByChatIdentity,
// core/lessons.js, is a global lookup with no teacherId scoping and
// .limit(1)) — *outbound* notifications are unaffected (each clone's own
// event reads straight off that clone's own student doc, no lookup
// involved), which is the actual use case this was kept for.
async function cloneTeacherAccount(sourceTeacherId, { email, name }) {
  if (!email || typeof email !== "string") {
    throw new Error("email is required")
  }

  const password = randomPassword()
  const userRecord = await getAuth().createUser({
    email,
    password,
    displayName: name || email,
    emailVerified: true,
  })
  const targetTeacherId = userRecord.uid

  try {
    const sourceTeacherSnap = await db.collection(TEACHERS_COLLECTION).doc(sourceTeacherId).get()
    if (!sourceTeacherSnap.exists) {
      throw new Error(`source teacher ${sourceTeacherId} not found`)
    }
    const sourceTeacher = sourceTeacherSnap.data()

    const slug = await generateTeacherSlug(name || email)

    // Same shape ensureTeacherProfile (App.jsx) gives a brand-new real
    // teacher — built explicitly here (not spread from sourceTeacher) so a
    // demo clone never inherits the source's own billing/admin state.
    await db
      .collection(TEACHERS_COLLECTION)
      .doc(targetTeacherId)
      .set({
        name: name || "",
        email,
        slug,
        timezone: sourceTeacher.timezone ?? "Europe/Moscow",
        language: sourceTeacher.language ?? "ru",
        colorTheme: sourceTeacher.colorTheme ?? "pink",
        createdAt: FieldValue.serverTimestamp(),
        subscriptionPaidUntil: null,
        blocked: false,
        blockedReason: null,
        adminNotes: "",
        expiryReminderSentFor: null,
        plan: "trial",
        subscriptionPlanSince: null,
      })

    // --- examTypes (per-teacher subcollection, self-contained) ---
    const examTypesSnap = await db.collection(TEACHERS_COLLECTION).doc(sourceTeacherId).collection("examTypes").get()
    const examTypeIdMap = {}
    for (const doc of examTypesSnap.docs) {
      const newRef = await db.collection(TEACHERS_COLLECTION).doc(targetTeacherId).collection("examTypes").add(doc.data())
      examTypeIdMap[doc.id] = newRef.id
    }

    // --- customSubjects (per-teacher subcollection, self-contained) ---
    const customSubjectsSnap = await db
      .collection(TEACHERS_COLLECTION)
      .doc(sourceTeacherId)
      .collection("customSubjects")
      .get()
    for (const doc of customSubjectsSnap.docs) {
      await db.collection(TEACHERS_COLLECTION).doc(targetTeacherId).collection("customSubjects").add(doc.data())
    }

    // --- curriculumTemplates (top-level, teacherId-tagged) ---
    const templatesSnap = await db.collection(CURRICULUM_TEMPLATES_COLLECTION).where("teacherId", "==", sourceTeacherId).get()
    const templateIdMap = {}
    for (const doc of templatesSnap.docs) {
      const { teacherId: _teacherId, createdAt: _createdAt, updatedAt: _updatedAt, ...data } = doc.data()
      const newRef = await db.collection(CURRICULUM_TEMPLATES_COLLECTION).add({
        ...data,
        teacherId: targetTeacherId,
        examTypeId: data.examTypeId ? examTypeIdMap[data.examTypeId] ?? null : null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
      templateIdMap[doc.id] = newRef.id
    }

    // --- students (top-level doc first; their own programs subcollection
    // is deferred until after groups are cloned, since a program's
    // sourceGroupId needs the group id mapping below) ---
    const studentsSnap = await db.collection(STUDENTS_COLLECTION).where("teacherId", "==", sourceTeacherId).get()
    const studentIdMap = {}
    const deferredPrograms = [] // { newStudentId, programDoc }
    for (const doc of studentsSnap.docs) {
      const {
        teacherId: _teacherId,
        googleEventIds: _googleEventIds,
        googleEventId: _googleEventId,
        remindersSent: _remindersSent,
        createdAt: _createdAt,
        ...data
      } = doc.data()

      const newRef = db.collection(STUDENTS_COLLECTION).doc()
      await newRef.set({ ...data, teacherId: targetTeacherId, createdAt: FieldValue.serverTimestamp() })
      studentIdMap[doc.id] = newRef.id

      const programsSnap = await doc.ref.collection("programs").get()
      for (const programDoc of programsSnap.docs) {
        deferredPrograms.push({ newStudentId: newRef.id, programDoc })
      }
    }

    // --- groups (per-teacher subcollection) — needs studentIdMap/
    // templateIdMap already built above ---
    const groupsSnap = await db.collection(TEACHERS_COLLECTION).doc(sourceTeacherId).collection("groups").get()
    const groupIdMap = {}
    for (const doc of groupsSnap.docs) {
      const { teacherId: _teacherId, googleEventIds: _googleEventIds, createdAt: _createdAt, ...data } = doc.data()
      const newRef = db.collection(TEACHERS_COLLECTION).doc(targetTeacherId).collection("groups").doc()
      await newRef.set({
        ...data,
        teacherId: targetTeacherId,
        memberStudentIds: (data.memberStudentIds ?? []).map((id) => studentIdMap[id]).filter(Boolean),
        programTemplateId: data.programTemplateId ? templateIdMap[data.programTemplateId] ?? null : null,
        createdAt: FieldValue.serverTimestamp(),
      })
      groupIdMap[doc.id] = newRef.id
    }

    // --- each cloned student's own programs, now that template/examType/
    // group id mappings all exist ---
    for (const { newStudentId, programDoc } of deferredPrograms) {
      const { teacherId: _teacherId, assignedAt: _assignedAt, ...data } = programDoc.data()
      await db
        .collection(STUDENTS_COLLECTION)
        .doc(newStudentId)
        .collection("programs")
        .doc()
        .set({
          ...data,
          teacherId: targetTeacherId,
          templateId: data.templateId ? templateIdMap[data.templateId] ?? null : null,
          examTypeId: data.examTypeId ? examTypeIdMap[data.examTypeId] ?? null : null,
          sourceGroupId: data.sourceGroupId ? groupIdMap[data.sourceGroupId] ?? null : null,
          assignedAt: FieldValue.serverTimestamp(),
        })
    }

    const summary = {
      teacherId: targetTeacherId,
      email,
      password,
      slug,
      examTypesCloned: examTypesSnap.size,
      customSubjectsCloned: customSubjectsSnap.size,
      templatesCloned: templatesSnap.size,
      studentsCloned: studentsSnap.size,
      groupsCloned: groupsSnap.size,
      programsCloned: deferredPrograms.length,
    }
    logger.info("cloneTeacherAccount: done", { sourceTeacherId, ...summary, password: "[redacted from logs]" })
    return summary
  } catch (error) {
    // Reuses the same cascade deleteTeacherAccount uses for a real removal —
    // safe to run even against a partially-written clone (every step just
    // finds nothing for whatever wasn't created yet) — so a failure midway
    // through never leaves an orphaned half-cloned account (Firestore data
    // with no matching Auth user, or vice versa) behind silently.
    logger.error("cloneTeacherAccount: failed, rolling back the partial clone", {
      sourceTeacherId,
      targetTeacherId,
      error: error.message,
    })
    await deleteTeacherData(targetTeacherId, { deleteAuthUser: true }).catch((cleanupError) => {
      logger.error("cloneTeacherAccount: rollback itself failed", { targetTeacherId, error: cleanupError.message })
    })
    throw error
  }
}

module.exports = { cloneTeacherAccount }
