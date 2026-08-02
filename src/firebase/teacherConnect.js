import { httpsCallable } from "firebase/functions"
import { doc, onSnapshot, setDoc } from "firebase/firestore"
import { db, functions } from "./firebase"

const TEACHER_CONTACT_DOC_PATH = ["integrations", "teacherContact"]

const generateTeacherConnectTokenCallable = httpsCallable(functions, "generateTeacherConnectToken")

// Returns { deepLink } for "telegram" or { code } for "vk" — see
// functions/core/teacherConnect.js.
export async function generateTeacherConnectToken(platform) {
  const result = await generateTeacherConnectTokenCallable({ platform })
  return result.data
}

// integrations/teacherContact is admin-only config the teacher edits about
// their own bot connections, same category as schedule slots/curriculum
// templates — read/written directly from the client, no callable needed for
// status or disconnect (only *issuing* a connect token goes through a
// callable, since that one needs a request.auth check).
export function subscribeToTeacherContact(onData, onError) {
  return onSnapshot(
    doc(db, ...TEACHER_CONTACT_DOC_PATH),
    (snapshot) => {
      const data = snapshot.exists() ? snapshot.data() : {}
      onData({
        telegramConnected: Boolean(data.telegramChatId),
        vkConnected: Boolean(data.vkPeerId),
      })
    },
    onError,
  )
}

export async function disconnectTeacherPlatform(platform) {
  const field = platform === "telegram" ? "telegramChatId" : "vkPeerId"
  await setDoc(doc(db, ...TEACHER_CONTACT_DOC_PATH), { [field]: null }, { merge: true })
}
