import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  runTransaction,
  updateDoc,
  where,
} from "firebase/firestore"
import { httpsCallable } from "firebase/functions"
import { db, functions } from "./firebase"
import { normalizeScheduleSlots } from "@/lib/schedule"

const STUDENTS_COLLECTION = "students"

const deleteStudentCallable = httpsCallable(functions, "deleteStudent")
const setStudentGoalCallable = httpsCallable(functions, "setStudentGoal")
const updateStudentSettingsCallable = httpsCallable(functions, "updateStudentSettings")

export function mapStudentDoc(id, data) {
  return {
    id,
    name: data.name ?? "",
    level: data.level ?? 1,
    xp: data.xp ?? 0,
    subject: Array.isArray(data.subject) ? data.subject : [],
    // Block 4 — goals/exam types moved to per-program fields
    // (students/{id}/programs/{programId}.examTypeId); the student-level
    // examTypeId Block 3 introduced is gone, this field no longer means
    // anything. teacherId is still needed: StudentDashboard.jsx resolves
    // each program's examTypeId against teachers/{teacherId}/examTypes,
    // and mapStudentDoc's explicit field list is the actual gate on what
    // reaches the client object (see systemPatterns.md).
    teacherId: data.teacherId ?? null,
    hourlyRate: data.hourlyRate ?? 0,
    paidLessonsBalance: data.paidLessonsBalance ?? 0,
    lowBalanceThreshold: data.lowBalanceThreshold ?? 1,
    autoRemindLowBalance: data.autoRemindLowBalance ?? true,
    scheduleSlots: normalizeScheduleSlots(data),
    topic: data.topic ?? "",
    reviewTopic: data.reviewTopic ?? "",
    platform: data.platform ?? null,
    telegramChatId: data.telegramChatId ?? null,
    vkPeerId: data.vkPeerId ?? null,
    contactUrl: data.contactUrl ?? null,
    accessCode: data.accessCode ?? null,
    curriculumSourceTemplateId: data.curriculumSourceTemplateId ?? null,
    targetScore: data.targetScore ?? null,
    examDate: data.examDate ?? null,
    timezone: data.timezone ?? null,
    colorTheme: data.colorTheme ?? null,
  }
}

export function subscribeToStudent(studentId, onData, onError) {
  const ref = doc(db, STUDENTS_COLLECTION, studentId)

  return onSnapshot(
    ref,
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(null)
        return
      }
      onData(mapStudentDoc(snapshot.id, snapshot.data()))
    },
    onError,
  )
}

// Multi-tenancy: students/{id}'s Firestore Rule is intentionally
// `allow read: if true` (an unauthenticated student needs to read their own
// card by id — see CLAUDE.md's architecture note), so Rules can never scope
// this list down on their own the way they will for lessons/
// curriculumProgress/balanceLedger/curriculumTemplates once Phase 2's draft
// rules are published. teacherId filtering has to live in the query itself.
export function subscribeToStudents(teacherId, onData, onError) {
  const ref = collection(db, STUDENTS_COLLECTION)
  const studentsQuery = query(ref, where("teacherId", "==", teacherId))

  return onSnapshot(
    studentsQuery,
    (snapshot) => {
      const students = snapshot.docs.map((document) =>
        mapStudentDoc(document.id, document.data()),
      )
      onData(students)
    },
    onError,
  )
}

export async function addXpToStudent(studentId, amount = 10) {
  const ref = doc(db, STUDENTS_COLLECTION, studentId)

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref)

    if (!snapshot.exists()) {
      throw new Error("Student not found")
    }

    const data = snapshot.data()
    let xp = (data.xp ?? 0) + amount
    let level = data.level ?? 1

    while (xp >= 100) {
      level += 1
      xp -= 100
    }

    transaction.update(ref, { xp, level })
  })
}

export async function updateStudentSchedule(studentId, scheduleSlots) {
  const ref = doc(db, STUDENTS_COLLECTION, studentId)
  await updateDoc(ref, { scheduleSlots })
}

export async function updateStudentContactUrl(studentId, contactUrl) {
  const ref = doc(db, STUDENTS_COLLECTION, studentId)
  await updateDoc(ref, { contactUrl })
}

export async function updateStudentProfile(studentId, { subject, hourlyRate, autoRemindLowBalance }) {
  const ref = doc(db, STUDENTS_COLLECTION, studentId)
  await updateDoc(ref, { subject, hourlyRate, autoRemindLowBalance })
}

// A callable (not a direct client write like updateStudentProfile above)
// per explicit spec — examDate needs server-side Timestamp construction
// from the ISO string a plain <input type="date"> value produces, and
// student-facing writes to students/{id} otherwise never go direct except
// where called out. `examDate` is a JS Date or null; serialized to ISO
// before crossing the callable boundary since Date doesn't survive
// httpsCallable's JSON serialization.
// Block 4 — programId is now required: a goal belongs to one specific
// program (students/{id}/programs/{programId}), not to the student doc
// itself, since a student can have several programs at once.
export async function setStudentGoal(studentId, programId, targetScore, examDate) {
  await setStudentGoalCallable({
    studentId,
    programId,
    targetScore: targetScore === "" || targetScore === null ? null : Number(targetScore),
    examDate: examDate ? examDate.toISOString() : null,
  })
}

// Student-facing, no request.auth — same trust model (studentId knowledge)
// as setStudentGoal above. Multi-tenancy Phase 4a.
export async function updateStudentSettings(studentId, { timezone, colorTheme }) {
  await updateStudentSettingsCallable({ studentId, timezone, colorTheme })
}

// Backend does the real work (Google Calendar event, lessons subcollection
// + their Storage files, registration tokens, bot sessions) before deleting
// the student doc itself — see functions/core/students.js.
export async function deleteStudent(studentId) {
  await deleteStudentCallable({ studentId })
}

// Used by /app's Telegram entry-point detection — students have no auth,
// so a plain client-side query is the same trust model already used
// everywhere else for student data (see CLAUDE.md architecture note).
export async function findStudentIdByTelegramUserId(telegramUserId) {
  const ref = collection(db, STUDENTS_COLLECTION)
  const studentQuery = query(ref, where("telegramChatId", "==", String(telegramUserId)), limit(1))
  const snapshot = await getDocs(studentQuery)
  return snapshot.empty ? null : snapshot.docs[0].id
}

// Used to verify a skipPin=true URL param actually matches the Telegram
// identity making the request, before trusting it to bypass the PIN
// screen — never trust the query param alone.
export async function getStudentTelegramChatId(studentId) {
  const ref = doc(db, STUDENTS_COLLECTION, studentId)
  const snapshot = await getDoc(ref)
  return snapshot.exists() ? (snapshot.data().telegramChatId ?? null) : null
}

export async function verifyStudentAccessCode(studentId, code) {
  const ref = doc(db, STUDENTS_COLLECTION, studentId)
  const snapshot = await getDoc(ref)

  if (!snapshot.exists()) {
    return false
  }

  const accessCode = snapshot.data().accessCode
  return accessCode != null && String(accessCode) === code
}
