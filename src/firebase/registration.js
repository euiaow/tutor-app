import { httpsCallable } from "firebase/functions"
import { collection, onSnapshot, query, where } from "firebase/firestore"
import { db, functions } from "./firebase"

const REGISTRATION_TOKENS_COLLECTION = "registrationTokens"

const generateRegistrationLinkCallable = httpsCallable(functions, "generateRegistrationLink")
const cancelRegistrationTokenCallable = httpsCallable(functions, "cancelRegistrationToken")

export async function generateRegistrationLink(studentName) {
  const result = await generateRegistrationLinkCallable({ studentName })
  return result.data.token
}

export async function cancelRegistrationToken(token) {
  await cancelRegistrationTokenCallable({ token })
}

// Same reasoning as subscribeToStudents (src/firebase/students.js) — this
// is a flat, whole-collection query with no per-document owner to lean on
// server-side yet, so teacherId filtering belongs in the query itself
// rather than relying solely on the not-yet-published Rules.
export function subscribeToPendingRegistrationTokens(teacherId, onData, onError) {
  const pendingQuery = query(
    collection(db, REGISTRATION_TOKENS_COLLECTION),
    where("status", "==", "pending"),
    where("teacherId", "==", teacherId),
  )

  return onSnapshot(
    pendingQuery,
    (snapshot) => {
      const tokens = snapshot.docs
        .map((document) => ({
          token: document.id,
          studentName: document.data().studentName ?? "",
          createdAt: document.data().createdAt ?? null,
        }))
        .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))
      onData(tokens)
    },
    onError,
  )
}
