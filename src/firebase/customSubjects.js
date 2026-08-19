import { addDoc, collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from "firebase/firestore"
import { db } from "./firebase"

const CUSTOM_SUBJECTS_SUBCOLLECTION = "customSubjects"

function customSubjectsRef(teacherId) {
  return collection(db, "teachers", teacherId, CUSTOM_SUBJECTS_SUBCOLLECTION)
}

export function subscribeToCustomSubjects(teacherId, onData, onError) {
  const subjectsQuery = query(customSubjectsRef(teacherId), orderBy("name"))
  return onSnapshot(
    subjectsQuery,
    (snapshot) => onData(snapshot.docs.map((d) => d.data().name)),
    onError,
  )
}

// De-dupes by name before creating — "Указать свой предмет" is meant to
// grow a shared per-teacher list over time, not accumulate near-duplicate
// entries every time the same custom subject gets typed again for a
// different student.
export async function createCustomSubjectIfNeeded(teacherId, name) {
  const trimmed = name.trim()
  if (!trimmed) return

  const existing = await getDocs(query(customSubjectsRef(teacherId), where("name", "==", trimmed)))
  if (!existing.empty) return

  await addDoc(customSubjectsRef(teacherId), { name: trimmed, createdAt: serverTimestamp() })
}

// Most-recent-first, max 3, no duplicates — called every time a subject is
// picked from any source (static list, custom list, or freshly typed), not
// just for custom ones, so "Недавние" reflects actual recent usage.
export async function pushRecentSubject(teacherId, name) {
  const trimmed = name.trim()
  if (!trimmed) return

  const ref = doc(db, "teachers", teacherId)
  const snapshot = await getDoc(ref)
  const current = snapshot.exists() ? (snapshot.data().recentSubjects ?? []) : []
  const next = [trimmed, ...current.filter((existing) => existing !== trimmed)].slice(0, 3)

  await updateDoc(ref, { recentSubjects: next })
}
