const { google } = require("googleapis")
const { defineSecret } = require("firebase-functions/params")
const { FieldValue } = require("firebase-admin/firestore")
const logger = require("firebase-functions/logger")
const { db } = require("./firestore")

const GOOGLE_OAUTH_CLIENT_ID = defineSecret("GOOGLE_OAUTH_CLIENT_ID")
const GOOGLE_OAUTH_CLIENT_SECRET = defineSecret("GOOGLE_OAUTH_CLIENT_SECRET")

const TEACHERS_COLLECTION = "teachers"
const INTEGRATIONS_SUBCOLLECTION = "integrations"
const GOOGLE_CALENDAR_DOC_ID = "googleCalendar"
const STUDENTS_COLLECTION = "students"
// userinfo.email is required so getCalendarEmbedInfo can resolve the
// connected account's email via oauth2("v2").userinfo.get() — a
// calendar-only token can't authenticate against that endpoint at all
// (Google reports it as a missing credential, not just insufficient scope).
const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/userinfo.email",
]

// Multi-tenancy Phase 1: moved from the old singleton integrations/googleCalendar
// to a per-teacher path — every function here now takes teacherId explicitly
// (see functions/index.js's callers, which source it from request.auth.uid or,
// for the Firestore trigger, from the student doc's own teacherId).
function getIntegrationRef(teacherId) {
  return db.collection(TEACHERS_COLLECTION).doc(teacherId).collection(INTEGRATIONS_SUBCOLLECTION).doc(GOOGLE_CALENDAR_DOC_ID)
}

function buildOAuthClient(redirectUri) {
  return new google.auth.OAuth2(
    GOOGLE_OAUTH_CLIENT_ID.value(),
    GOOGLE_OAUTH_CLIENT_SECRET.value(),
    redirectUri,
  )
}

function getAuthUrl(redirectUri, state) {
  const client = buildOAuthClient(redirectUri)
  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: CALENDAR_SCOPES,
    state,
  })

  logger.info("Google OAuth redirectUri used for consent URL", { redirectUri })

  return authUrl
}

async function saveTokens(teacherId, tokens) {
  const { refresh_token: refreshToken, access_token: accessToken, expiry_date: expiryDate } = tokens

  const data = {
    access_token: accessToken,
    expiry_date: expiryDate,
    connectedAt: FieldValue.serverTimestamp(),
  }

  // refresh_token is only sent by Google on the very first consent —
  // later silent refreshes only return a new access_token, so don't
  // overwrite the stored refresh_token with undefined.
  if (refreshToken) {
    data.refresh_token = refreshToken
  }

  await getIntegrationRef(teacherId).set(data, { merge: true })

  logger.info("Google Calendar tokens saved", { teacherId, hasRefreshToken: Boolean(refreshToken) })
}

async function getAuthorizedClient(teacherId) {
  const snapshot = await getIntegrationRef(teacherId).get()
  const data = snapshot.exists ? snapshot.data() : null

  if (!data || !data.refresh_token) {
    throw new Error("Google Calendar не подключён")
  }

  // TEMP diagnostics: only presence/shape, never the token values themselves.
  logger.info("getAuthorizedClient: stored token shape", {
    teacherId,
    hasRefreshToken: Boolean(data.refresh_token),
    hasAccessToken: Boolean(data.access_token),
    hasExpiryDate: Boolean(data.expiry_date),
    expiryDate: data.expiry_date ?? null,
    isExpired: data.expiry_date ? data.expiry_date < Date.now() : null,
  })

  const client = buildOAuthClient()
  client.setCredentials({
    refresh_token: data.refresh_token,
    access_token: data.access_token,
    expiry_date: data.expiry_date,
  })

  client.on("tokens", (tokens) => {
    saveTokens(teacherId, tokens).catch((error) => {
      logger.error("Failed to persist refreshed Google Calendar tokens", { teacherId, error })
    })
  })

  // TEMP diagnostics: force-resolve an access token now instead of letting
  // the request library do it lazily, so a refresh failure surfaces here
  // with a clear error instead of the API call silently going out with no
  // Authorization header.
  try {
    const { token } = await client.getAccessToken()
    logger.info("getAuthorizedClient: getAccessToken resolved", { teacherId, hasToken: Boolean(token) })
  } catch (error) {
    logger.error("getAuthorizedClient: getAccessToken failed", { teacherId, error })
    throw error
  }

  return client
}

async function isConnected(teacherId) {
  const snapshot = await getIntegrationRef(teacherId).get()
  return Boolean(snapshot.exists && snapshot.data().refresh_token)
}

// Clears both the stored tokens and every one of THIS teacher's students'
// stale googleEventIds (scoped by teacherId — a multi-tenant deployment must
// never touch another teacher's students here) — without the latter,
// reconnecting (especially under a different Google account) would try to
// update events by ids that no longer exist instead of creating fresh ones.
// Token revocation with Google is best-effort: a failure there (already-
// revoked token, network hiccup) must never block the local cleanup, which
// is the part that actually matters for a clean reconnect.
async function disconnectGoogleCalendar(teacherId) {
  const integrationSnapshot = await getIntegrationRef(teacherId).get()
  const refreshToken = integrationSnapshot.exists ? integrationSnapshot.data().refresh_token : null

  if (refreshToken) {
    try {
      const client = buildOAuthClient()
      client.setCredentials({ refresh_token: refreshToken })
      await client.revokeToken(refreshToken)
      logger.info("Google Calendar token revoked with Google", { teacherId })
    } catch (error) {
      logger.warn("Failed to revoke Google Calendar token with Google (continuing anyway)", { teacherId, error })
    }
  }

  await getIntegrationRef(teacherId).delete()

  const studentsSnapshot = await db.collection(STUDENTS_COLLECTION).where("teacherId", "==", teacherId).get()
  const batch = db.batch()
  studentsSnapshot.docs.forEach((studentDoc) => {
    batch.update(studentDoc.ref, {
      googleEventIds: FieldValue.delete(),
      googleEventId: FieldValue.delete(),
    })
  })
  await batch.commit()

  logger.info("Google Calendar disconnected", { teacherId, studentsCleared: studentsSnapshot.size })
}

module.exports = {
  buildOAuthClient,
  getAuthUrl,
  saveTokens,
  getAuthorizedClient,
  isConnected,
  disconnectGoogleCalendar,
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET,
}
