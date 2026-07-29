import { doc, onSnapshot, setDoc } from "firebase/firestore"
import { db } from "./firebase"

const VIDEO_CALL_DOC = doc(db, "integrations", "videoCall")

export function subscribeToVideoCallUrl(onData, onError) {
  return onSnapshot(
    VIDEO_CALL_DOC,
    (snapshot) => {
      onData(snapshot.exists() ? snapshot.data().url ?? null : null)
    },
    onError,
  )
}

export async function updateVideoCallUrl(url) {
  await setDoc(VIDEO_CALL_DOC, { url })
}
