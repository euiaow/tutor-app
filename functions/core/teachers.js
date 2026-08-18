const logger = require("firebase-functions/logger")
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
// fields (id, name, slug), never email/timezone/colorTheme/etc.
async function findTeacherBySlug(slug) {
  if (!slug || typeof slug !== "string") {
    return null
  }

  const snapshot = await db.collection(TEACHERS_COLLECTION).where("slug", "==", slug).limit(1).get()
  if (snapshot.empty) {
    return null
  }

  const doc = snapshot.docs[0]
  return { id: doc.id, name: doc.data().name ?? "", slug: doc.data().slug }
}

module.exports = { generateTeacherSlug, findTeacherBySlug }
