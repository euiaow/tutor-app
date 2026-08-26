const logger = require("firebase-functions/logger")
const { HttpsError } = require("firebase-functions/v2/https")
const { db } = require("./firestore")
const { slugify } = require("./registration")

const TEACHERS_COLLECTION = "teachers"

// Sequential numeric suffixes (-2, -3, ...) rather than students.js's random
// suffix — a teacher's slug is a public, human-facing identifier (shown in
// URLs, bot deep links, VK signup codes), so it should stay short and
// predictable rather than opaque.
async function generateUniqueSlug(seed) {
  const base = slugify(seed) || "teacher"
  let candidate = base
  let suffix = 2

  for (;;) {
    const existing = await db.collection(TEACHERS_COLLECTION).where("slug", "==", candidate).limit(1).get()
    if (existing.empty) {
      return candidate
    }
    candidate = `${base}-${suffix}`
    suffix += 1
  }
}

// Called from the auth-gated generateTeacherSlug callable — admin-SDK read
// access across every teacher's doc is required to check uniqueness, which
// the per-teacher Firestore Rules (multi-tenancy Phase 2) deliberately
// don't grant a single signed-in teacher, so this can't run as a plain
// client query.
async function generateTeacherSlug(seed) {
  const slug = await generateUniqueSlug(seed)
  logger.info("generateTeacherSlug: slug generated", { seed, slug })
  return slug
}

// Public lookup — no request.auth (see the getTeacherBySlug callable in
// index.js): a prospective student browsing /app/:slug or scanning a QR
// code has no Firebase Auth session. Only ever returns the minimal public
// fields (id, name, slug, vkGroupId, telegramBotKey), never email/timezone/
// colorTheme/etc. vkGroupId/telegramBotKey are not sensitive (they're
// exactly what the VK/Telegram registration links themselves reveal) —
// needed here so the landing page can link to *this* teacher's own VK
// community/Telegram bot (personal or shared), see PublicLanding.jsx.
async function findTeacherBySlug(slug) {
  if (!slug || typeof slug !== "string") {
    return null
  }

  const snapshot = await db.collection(TEACHERS_COLLECTION).where("slug", "==", slug).limit(1).get()
  if (snapshot.empty) {
    return null
  }

  const doc = snapshot.docs[0]
  return {
    id: doc.id,
    name: doc.data().name ?? "",
    slug: doc.data().slug,
    vkGroupId: doc.data().vkGroupId ?? null,
    telegramBotKey: doc.data().telegramBotKey ?? null,
  }
}

// A callable (Admin SDK), not a direct client Firestore write like
// updateTeacherSettings' timezone/colorTheme — "name" was never a
// client-editable field before this feature, so the live Firestore Rules'
// update allow-list for teachers/{uid} may not include it yet. Routing
// through here sidesteps that entirely rather than depending on the Rules
// text being correct, and matches this project's own established fallback
// for exactly this situation (see techContext.md's guarded-onRequest
// pattern) — the difference here is this needs no admin bypass at all,
// just an authenticated write to the caller's own doc.
async function updateTeacherName(teacherId, name) {
  const trimmed = typeof name === "string" ? name.trim() : ""
  if (!trimmed) {
    throw new HttpsError("invalid-argument", "Имя не может быть пустым")
  }

  await db.collection(TEACHERS_COLLECTION).doc(teacherId).update({ name: trimmed })
  logger.info("updateTeacherName: name saved", { teacherId })
}

module.exports = { generateTeacherSlug, findTeacherBySlug, updateTeacherName }
