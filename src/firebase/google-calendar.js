import { httpsCallable } from "firebase/functions"
import { functions } from "./firebase"

const startGoogleOAuthCallable = httpsCallable(functions, "startGoogleOAuth")
const getGoogleCalendarStatusCallable = httpsCallable(functions, "getGoogleCalendarStatus")
const getCalendarEmbedInfoCallable = httpsCallable(functions, "getCalendarEmbedInfo")
const disconnectGoogleCalendarCallable = httpsCallable(functions, "disconnectGoogleCalendar")
const resyncGoogleCalendarCallable = httpsCallable(functions, "resyncGoogleCalendar")

export async function startGoogleOAuth() {
  const result = await startGoogleOAuthCallable()
  return result.data.authUrl
}

export async function getGoogleCalendarStatus() {
  const result = await getGoogleCalendarStatusCallable()
  return result.data.connected
}

export async function getCalendarEmbedInfo() {
  const result = await getCalendarEmbedInfoCallable()
  return result.data.embedUrl
}

export async function disconnectGoogleCalendar() {
  await disconnectGoogleCalendarCallable()
}

// Runs the Calendar self-heal (normally only lazy, once a day) immediately
// for the current teacher — see resyncTeacherCalendar's own comment,
// functions/core/googleCalendar.js. Returns how many students/groups had
// their schedule re-checked.
export async function resyncGoogleCalendar() {
  const result = await resyncGoogleCalendarCallable()
  return result.data
}
