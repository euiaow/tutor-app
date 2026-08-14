const { google } = require("googleapis")
const { defineSecret } = require("firebase-functions/params")
const { FieldValue } = require("firebase-admin/firestore")
const logger = require("firebase-functions/logger")
const { db } = require("./firestore")

const GOOGLE_OAUTH_CLIENT_ID = defineSecret("GOOGLE_OAUTH_CLIENT_ID")
const GOOGLE_OAUTH_CLIENT_SECRET = defineSecret("GOOGLE_OAUTH_CLIENT_SECRET")

const INTEGRATIONS_COLLECTION = "integrations"
const GOOGLE_CALENDAR_DOC_ID = "googleCalendar"
// userinfo.email is required so getCalendarEmbedInfo can resolve the
// connected account's email via oauth2("v2").userinfo.get() — a
// calendar-only token can't authenticate against that endpoint at all
// (Google reports it as a missing credential, not just insufficient scope).
const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/userinfo.email",
]

function getIntegrationRef() {
  return db.collection(INTEGRATIONS_COLLECTION).doc(GOOGLE_CALENDAR_DOC_ID)
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

async function saveTokens(tokens) {
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

  await getIntegrationRef().set(data, { merge: true })

  logger.info("Google Calendar tokens saved", { hasRefreshToken: Boolean(refreshToken) })
}

async function getAuthorizedClient() {
  const snapshot = await getIntegrationRef().get()
  const data = snapshot.exists ? snapshot.data() : null

  if (!data || !data.refresh_token) {
    throw new Error("Google Calendar не подключён")
  }

  // TEMP diagnostics: only presence/shape, never the token values themselves.
  logger.info("getAuthorizedClient: stored token shape", {
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
    saveTokens(tokens).catch((error) => {
      logger.error("Failed to persist refreshed Google Calendar tokens", error)
    })
  })

  // TEMP diagnostics: force-resolve an access token now instead of letting
  // the request library do it lazily, so a refresh failure surfaces here
  // with a clear error instead of the API call silently going out with no
  // Authorization header.
  try {
    const { token } = await client.getAccessToken()
    logger.info("getAuthorizedClient: getAccessToken resolved", { hasToken: Boolean(token) })
  } catch (error) {
    logger.error("getAuthorizedClient: getAccessToken failed", error)
    throw error
  }

  return client
}

async function isConnected() {
  const snapshot = await getIntegrationRef().get()
  return Boolean(snapshot.exists && snapshot.data().refresh_token)
}

// Clears both the stored tokens and every student's stale googleEventIds —
// without the latter, reconnecting (especially under a different Google
// account) would try to update events by ids that no longer exist instead
// of creating fresh ones. Token revocation with Google is best-effort: a
// failure there (already-revoked token, network hiccup) must never block
// the local cleanup, which is the part that actually matters for a clean
// reconnect.
async function disconnectGoogleCalendar() {
  const integrationSnapshot = await getIntegrationRef().get()
  const refreshToken = integrationSnapshot.exists ? integrationSnapshot.data().refresh_token : null

  if (refreshToken) {
    try {
      const client = buildOAuthClient()
      client.setCredentials({ refresh_token: refreshToken })
      await client.revokeToken(refreshToken)
      logger.info("Google Calendar token revoked with Google")
    } catch (error) {
      logger.warn("Failed to revoke Google Calendar token with Google (continuing anyway)", error)
    }
  }

  await getIntegrationRef().delete()

  const studentsSnapshot = await db.collection("students").get()
  const batch = db.batch()
  studentsSnapshot.docs.forEach((studentDoc) => {
    batch.update(studentDoc.ref, {
      googleEventIds: FieldValue.delete(),
      googleEventId: FieldValue.delete(),
    })
  })
  await batch.commit()

  logger.info("Google Calendar disconnected", { studentsCleared: studentsSnapshot.size })
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
