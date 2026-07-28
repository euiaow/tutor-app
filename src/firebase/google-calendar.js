import { httpsCallable } from "firebase/functions"
import { functions } from "./firebase"

const startGoogleOAuthCallable = httpsCallable(functions, "startGoogleOAuth")
const getGoogleCalendarStatusCallable = httpsCallable(functions, "getGoogleCalendarStatus")
const getCalendarEmbedInfoCallable = httpsCallable(functions, "getCalendarEmbedInfo")

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
