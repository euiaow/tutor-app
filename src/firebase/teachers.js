import { doc, onSnapshot, updateDoc } from "firebase/firestore"
import { httpsCallable } from "firebase/functions"
import { db, functions } from "./firebase"

const TEACHERS_COLLECTION = "teachers"

const generateTeacherSlugCallable = httpsCallable(functions, "generateTeacherSlug")
const getTeacherBySlugCallable = httpsCallable(functions, "getTeacherBySlug")

// Multi-tenancy Phase 3: slug uniqueness has to be checked server-side
// (admin SDK reads across every teacher's doc) — the per-teacher Firestore
// Rules deliberately don't let one signed-in teacher query another's doc.
export async function generateTeacherSlug(name) {
  const result = await generateTeacherSlugCallable({ name })
  return result.data.slug
}

// Public — no auth required, used by the unauthenticated /app/:slug landing
// page. Returns { id, name, slug } or null.
export async function getTeacherBySlug(slug) {
  const result = await getTeacherBySlugCallable({ slug })
  return result.data.teacher
}

// Multi-tenancy Phase 4a — timezone/colorTheme live on the same
// teachers/{uid} profile doc ensureTeacherProfile (App.jsx) bootstraps.
// Subscribed (not a one-time getDoc) so TeacherDashboard.jsx's
// UserPrefsProvider re-renders immediately after a SettingsDialog save.
export function subscribeToTeacherProfile(uid, onData, onError) {
  const ref = doc(db, TEACHERS_COLLECTION, uid)
  return onSnapshot(
    ref,
    (snapshot) => onData(snapshot.exists() ? snapshot.data() : null),
    onError,
  )
}

// Admin/config content the teacher alone edits — direct client Firestore
// write, no callable, same pattern as updateStudentSchedule (see
// systemPatterns.md): the signed-in teacher is always allowed to write
// their own teachers/{uid} doc, no server-side validation needed.
export async function updateTeacherSettings(uid, { timezone, colorTheme }) {
  const ref = doc(db, TEACHERS_COLLECTION, uid)
  await updateDoc(ref, { timezone, colorTheme })
}
