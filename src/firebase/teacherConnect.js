import { httpsCallable } from "firebase/functions"
import { doc, onSnapshot } from "firebase/firestore"
import { db, functions, auth } from "./firebase"

// Multi-tenancy Phase 1: moved from the old singleton
// integrations/teacherContact to a per-teacher path. Read/written directly
// from the client using auth.currentUser.uid — this module is only ever
// used from the authenticated Teacher Dashboard (TeacherBotConnectStatus),
// never the student side.
function teacherContactDoc() {
  return doc(db, "teachers", auth.currentUser.uid, "integrations", "teacherContact")
}

const generateTeacherConnectTokenCallable = httpsCallable(functions, "generateTeacherConnectToken")
const disconnectTeacherPlatformCallable = httpsCallable(functions, "disconnectTeacherPlatform")

// Returns { deepLink } for "telegram" or { code } for "vk" — see
// functions/core/teacherConnect.js.
export async function generateTeacherConnectToken(platform) {
  const result = await generateTeacherConnectTokenCallable({ platform })
  return result.data
}

// teachers/{uid}/integrations/teacherContact is admin-only config the
// teacher edits about their own bot connections, same category as schedule
// slots/curriculum templates — read/written directly from the client, no
// callable needed for status or disconnect (only *issuing* a connect token
// goes through a callable, since that one needs a request.auth check).
export function subscribeToTeacherContact(onData, onError) {
  return onSnapshot(
    teacherContactDoc(),
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

// Routed through a callable (not a direct client write, unlike this file's
// other reads/writes) — the backend needs to send a "you've been
// disconnected" message through the bot before clearing its chat id, which
// needs a bot secret the client never has. See
// functions/core/teacherConnect.js's disconnectTeacherPlatform.
export async function disconnectTeacherPlatform(platform) {
  await disconnectTeacherPlatformCallable({ platform })
}
