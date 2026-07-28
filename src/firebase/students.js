import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  updateDoc,
} from "firebase/firestore"
import { httpsCallable } from "firebase/functions"
import { db, functions } from "./firebase"

const STUDENTS_COLLECTION = "students"

const deleteStudentCallable = httpsCallable(functions, "deleteStudent")

export function mapStudentDoc(id, data) {
  return {
    id,
    name: data.name ?? "",
    level: data.level ?? 1,
    xp: data.xp ?? 0,
    subject: data.subject ?? "Английский язык",
    schedule: data.schedule ?? null,
    topic: data.topic ?? "",
    reviewTopic: data.reviewTopic ?? "",
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

export function subscribeToStudents(onData, onError) {
  const ref = collection(db, STUDENTS_COLLECTION)

  return onSnapshot(
    ref,
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

export async function updateStudentSchedule(studentId, schedule) {
  const ref = doc(db, STUDENTS_COLLECTION, studentId)
  await updateDoc(ref, { schedule })
}

// Backend does the real work (Google Calendar event, lessons subcollection
// + their Storage files, registration tokens, bot sessions) before deleting
// the student doc itself — see functions/core/students.js.
export async function deleteStudent(studentId) {
  await deleteStudentCallable({ studentId })
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
