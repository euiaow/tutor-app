import { doc, onSnapshot, setDoc } from "firebase/firestore"
import { db } from "./firebase"

// Multi-tenancy Phase 1: moved from the old singleton integrations/videoCall
// to a per-teacher path — every caller now passes teacherId explicitly
// (VideoCallSettings uses its own auth.currentUser.uid; StudentDashboard
// uses the student's own upcoming lesson's teacherId, since the student has
// no Firebase Auth uid of their own).
function videoCallDoc(teacherId) {
  return doc(db, "teachers", teacherId, "integrations", "videoCall")
}

export function subscribeToVideoCallUrl(teacherId, onData, onError) {
  return onSnapshot(
    videoCallDoc(teacherId),
    (snapshot) => {
      onData(snapshot.exists() ? snapshot.data().url ?? null : null)
    },
    onError,
  )
}

export async function updateVideoCallUrl(teacherId, url) {
  await setDoc(videoCallDoc(teacherId), { url })
}
