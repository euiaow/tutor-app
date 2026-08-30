const { HttpsError } = require("firebase-functions/v2/https")
const { FieldValue, Timestamp } = require("firebase-admin/firestore")
const logger = require("firebase-functions/logger")
const { db } = require("./firestore")
const { getZonedParts } = require("./schedule")
const { createNotification } = require("./notifier")
const { deleteTeacherData } = require("./teacherDeletion")

const TEACHERS_COLLECTION = "teachers"
const STUDENTS_COLLECTION = "students"
const CURRICULUM_TEMPLATES_COLLECTION = "curriculumTemplates"
const CONFIG_COLLECTION = "config"
const ADMIN_CONFIG_DOC = "admin"
const SUBSCRIPTION_PAYMENTS_SUBCOLLECTION = "subscriptionPayments"
const DAY_MS = 24 * 60 * 60 * 1000
const PLAN_VALUES = ["trial", "subscription"]
// Grace window after a "subscription" teacher's paid-until date (or, if
// they've never paid at all, after the moment their plan was switched to
// "subscription") before checkExpiringSubscriptions auto-blocks them for
// non-payment.
const SUBSCRIPTION_GRACE_DAYS = 2

function adminConfigRef() {
  return db.collection(CONFIG_COLLECTION).doc(ADMIN_CONFIG_DOC)
}

async function isAdminUid(uid) {
  if (!uid) {
    return false
  }

  const snapshot = await adminConfigRef().get()
  if (!snapshot.exists) {
    return false
  }

  const allowedUids = snapshot.data().allowedUids
  return Array.isArray(allowedUids) && allowedUids.includes(uid)
}

// Single admin-rights gate every admin-panel callable in this module runs
// through first — mirrors the isAdmin() callable's own check exactly (same
// underlying isAdminUid), never duplicated.
async function assertIsAdmin(uid) {
  if (!(await isAdminUid(uid))) {
    throw new HttpsError("permission-denied", "Доступ запрещён")
  }
}

async function isAdmin(uid) {
  return { isAdmin: await isAdminUid(uid) }
}

// Adds daysAdded days to the teacher's subscription. A still-active
// subscription extends from its own current expiry (not from today) so
// paid-for time already on the books never gets lost by a top-up; an
// expired-or-never-paid one starts counting from today. Transaction keeps
// the read-current-value / write-new-value / log-payment sequence atomic so
// two payments recorded back-to-back can't clobber each other.
async function recordSubscriptionPayment(adminUid, { teacherId, daysAdded, amount, note }) {
  await assertIsAdmin(adminUid)

  if (!teacherId || typeof teacherId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор учителя")
  }

  const days = Number(daysAdded)
  if (!Number.isFinite(days) || days <= 0) {
    throw new HttpsError("invalid-argument", "Некорректное число дней")
  }

  let normalizedAmount = null
  if (amount !== undefined && amount !== null && amount !== "") {
    normalizedAmount = Number(amount)
    if (!Number.isFinite(normalizedAmount)) {
      throw new HttpsError("invalid-argument", "Некорректная сумма")
    }
  }

  const normalizedNote = typeof note === "string" && note.trim() ? note.trim() : null

  const teacherRef = db.collection(TEACHERS_COLLECTION).doc(teacherId)
  const paymentRef = teacherRef.collection(SUBSCRIPTION_PAYMENTS_SUBCOLLECTION).doc()

  const subscriptionPaidUntil = await db.runTransaction(async (transaction) => {
    const teacherSnapshot = await transaction.get(teacherRef)
    if (!teacherSnapshot.exists) {
      throw new HttpsError("not-found", "Учитель не найден")
    }

    const now = new Date()
    const teacherData = teacherSnapshot.data()
    const currentPaidUntil = teacherData.subscriptionPaidUntil?.toDate?.() ?? null
    const base = currentPaidUntil && currentPaidUntil > now ? currentPaidUntil : now
    const nextTimestamp = Timestamp.fromDate(new Date(base.getTime() + days * DAY_MS))

    const teacherUpdate = { subscriptionPaidUntil: nextTimestamp }
    // A teacher auto-blocked by checkExpiringSubscriptions for non-payment
    // gets restored the moment a payment lands, same "no extra manual step"
    // guarantee Phase 3's manual unblock already gives — but only for that
    // specific reason: a teacher the admin blocked manually (blockedReason
    // "manual") stays blocked until the admin explicitly unblocks them,
    // recording a payment must never silently override that call.
    if (teacherData.blocked && teacherData.blockedReason === "subscription_expired") {
      teacherUpdate.blocked = false
      teacherUpdate.blockedReason = null
    }

    transaction.update(teacherRef, teacherUpdate)
    transaction.set(paymentRef, {
      daysAdded: days,
      amount: normalizedAmount,
      note: normalizedNote,
      recordedAt: FieldValue.serverTimestamp(),
    })

    return nextTimestamp
  })

  logger.info("recordSubscriptionPayment: payment recorded", { teacherId, daysAdded: days })

  // Timestamps don't cross the httpsCallable wire cleanly (see
  // getNearestUpcomingLesson's comment in index.js for the established
  // reasoning) — hand back an ISO string instead.
  return { subscriptionPaidUntil: subscriptionPaidUntil.toDate().toISOString() }
}

async function updateTeacherNotes(adminUid, { teacherId, notes }) {
  await assertIsAdmin(adminUid)

  if (!teacherId || typeof teacherId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор учителя")
  }

  await db
    .collection(TEACHERS_COLLECTION)
    .doc(teacherId)
    .update({ adminNotes: typeof notes === "string" ? notes : "" })

  return { success: true }
}

async function setTeacherBlocked(adminUid, { teacherId, blocked }) {
  await assertIsAdmin(adminUid)

  if (!teacherId || typeof teacherId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор учителя")
  }

  const nextBlocked = Boolean(blocked)
  await db
    .collection(TEACHERS_COLLECTION)
    .doc(teacherId)
    .update({ blocked: nextBlocked, blockedReason: nextBlocked ? "manual" : null })

  logger.info("setTeacherBlocked: updated", { teacherId, blocked: nextBlocked })

  return { success: true }
}

// Admin toggles a teacher between "trial" (no payment required, never
// auto-blocked for non-payment) and "subscription" (payment tracked,
// checkExpiringSubscriptions can auto-block after the grace period). Moving
// TO "subscription" (re)starts the grace-period anchor for a teacher who's
// never paid yet — see checkExpiringSubscriptions' own comment for how
// subscriptionPlanSince is used. Moving back to "trial" lifts an
// auto-block immediately (same reasoning as the payment-triggered
// auto-unblock above: a plan change isn't a manual block/unblock decision,
// so it must never touch a "manual" block either way).
async function setTeacherPlan(adminUid, { teacherId, plan }) {
  await assertIsAdmin(adminUid)

  if (!teacherId || typeof teacherId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор учителя")
  }
  if (!PLAN_VALUES.includes(plan)) {
    throw new HttpsError("invalid-argument", "Некорректный тарифный план")
  }

  const teacherRef = db.collection(TEACHERS_COLLECTION).doc(teacherId)

  await db.runTransaction(async (transaction) => {
    const teacherSnapshot = await transaction.get(teacherRef)
    if (!teacherSnapshot.exists) {
      throw new HttpsError("not-found", "Учитель не найден")
    }

    const teacherData = teacherSnapshot.data()
    const update = { plan }

    if (plan === "subscription") {
      update.subscriptionPlanSince = FieldValue.serverTimestamp()
    }

    if (teacherData.blocked && teacherData.blockedReason === "subscription_expired") {
      update.blocked = false
      update.blockedReason = null
    }

    transaction.update(teacherRef, update)
  })

  logger.info("setTeacherPlan: updated", { teacherId, plan })

  return { success: true }
}

// Irreversible — deletes every trace of a teacher's account: their
// students, groups, curriculum templates, tokens, notifications, and
// finally the teachers/{teacherId} doc and Firebase Auth account themselves
// (see core/teacherDeletion.js for the full cascade). This is the ONLY
// correct way to remove a teacher — deleting just the Firebase Auth account
// by hand (e.g. from the Firebase Console) leaves 100% of their Firestore
// data behind, which is exactly how this app accumulated orphaned test data
// before this function existed (see activeContext.md).
async function deleteTeacherAccount(adminUid, { teacherId }) {
  await assertIsAdmin(adminUid)

  if (!teacherId || typeof teacherId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор учителя")
  }

  const summary = await deleteTeacherData(teacherId, { deleteAuthUser: true })
  logger.info("deleteTeacherAccount: teacher account deleted by admin", { adminUid, teacherId })

  return { success: true, summary }
}

// Cheap, read-only usage snapshot for one teacher — every number here is
// derived from collections that already exist, nothing new is logged or
// tracked to make this possible. Only ever called on demand (one teacher's
// card expanding in the admin UI), not for the whole list at once.
async function getTeacherStats(adminUid, teacherId) {
  await assertIsAdmin(adminUid)

  if (!teacherId || typeof teacherId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор учителя")
  }

  const teacherRef = db.collection(TEACHERS_COLLECTION).doc(teacherId)
  const thirtyDaysAgo = Timestamp.fromDate(new Date(Date.now() - 30 * DAY_MS))

  const [
    teacherSnapshot,
    studentsCountSnap,
    groupsCountSnap,
    totalCompletedSnap,
    completedLast30Snap,
    templatesCountSnap,
    assignedProgramsCountSnap,
    googleCalendarSnap,
    videoCallSnap,
    teacherContactSnap,
  ] = await Promise.all([
    teacherRef.get(),
    db.collection(STUDENTS_COLLECTION).where("teacherId", "==", teacherId).count().get(),
    teacherRef.collection("groups").count().get(),
    db
      .collectionGroup("lessons")
      .where("teacherId", "==", teacherId)
      .where("status", "==", "completed")
      .count()
      .get(),
    db
      .collectionGroup("lessons")
      .where("teacherId", "==", teacherId)
      .where("status", "==", "completed")
      .where("date", ">=", thirtyDaysAgo)
      .count()
      .get(),
    db.collection(CURRICULUM_TEMPLATES_COLLECTION).where("teacherId", "==", teacherId).count().get(),
    // Total assigned programs (not distinct students — a student can have
    // several at once via multi-program), a plain equality count() reusing
    // the same "programs"/teacherId collectionGroup field override every
    // other program query here already relies on. Replaced the earlier
    // "distinct students with >=1 program" metric — that one needed a
    // select()+dedupe fallback (no count() shortcut for "distinct"), was
    // slower, and read as a confusing number next to studentsCount.
    db.collectionGroup("programs").where("teacherId", "==", teacherId).count().get(),
    teacherRef.collection("integrations").doc("googleCalendar").get(),
    teacherRef.collection("integrations").doc("videoCall").get(),
    teacherRef.collection("integrations").doc("teacherContact").get(),
  ])

  if (!teacherSnapshot.exists) {
    throw new HttpsError("not-found", "Учитель не найден")
  }

  const teacher = teacherSnapshot.data()

  const googleCalendar = googleCalendarSnap.exists
  const teacherContactData = teacherContactSnap.exists ? teacherContactSnap.data() : null
  const botNotifications = Boolean(teacherContactData?.telegramChatId || teacherContactData?.vkPeerId)

  return {
    studentsCount: studentsCountSnap.data().count,
    groupsCount: groupsCountSnap.data().count,
    totalCompletedLessons: totalCompletedSnap.data().count,
    completedLessonsLast30Days: completedLast30Snap.data().count,
    curriculumTemplatesCount: templatesCountSnap.data().count,
    assignedProgramsCount: assignedProgramsCountSnap.data().count,
    integrationsConnected: {
      googleCalendar,
      videoCall: videoCallSnap.exists,
      botNotifications,
    },
    // Real product-usage signal (last time the teacher actually did
    // something — completed/rescheduled/cancelled a lesson, added/edited a
    // student or group, recorded a payment, assigned a program — see
    // touchTeacherActivity's call sites in index.js), not Firebase Auth's
    // lastSignInTime, which only means "opened the tab" and told the admin
    // nothing about real usage.
    lastActivityAt: teacher.lastActivityAt?.toDate?.().toISOString() ?? null,
    registeredAt: teacher.createdAt?.toDate?.().toISOString() ?? null,
  }
}

// Best-effort "the teacher just did something" stamp — called from every
// backend callable that represents a real teacher action (see index.js's
// call sites: lesson complete/reschedule/cancel/create-extra, student/group
// add/edit/delete, payment recorded, program assigned/changed/removed).
// Deliberately swallows its own errors so a failure here (e.g. a
// legacy/unowned resource with no real teacherId) never fails the actual
// action it's attached to — this is a nice-to-have admin signal, not a
// correctness-critical write.
async function touchTeacherActivity(teacherId) {
  if (!teacherId) {
    return
  }
  try {
    await db.collection(TEACHERS_COLLECTION).doc(teacherId).update({ lastActivityAt: FieldValue.serverTimestamp() })
  } catch (error) {
    logger.error("touchTeacherActivity: failed", { teacherId, error })
  }
}

// Calendar-day comparison in the teacher's OWN saved timezone (falls back
// to Moscow for a teacher with none saved yet) — same reasoning as every
// other date-window comparison in this codebase: comparing raw millisecond
// difference would misfire near a day boundary depending on which zone
// "3 days" is measured in.
function daysBetweenCalendarDates(from, to, timeZone) {
  const fromParts = getZonedParts(from, timeZone)
  const toParts = getZonedParts(to, timeZone)
  const fromUtcMidnight = Date.UTC(fromParts.year, fromParts.month - 1, fromParts.day)
  const toUtcMidnight = Date.UTC(toParts.year, toParts.month - 1, toParts.day)
  return Math.round((toUtcMidnight - fromUtcMidnight) / DAY_MS)
}

function formatRuDate(date, timeZone) {
  return date.toLocaleDateString("ru-RU", { timeZone, day: "numeric", month: "long", year: "numeric" })
}

// Russian plural forms for "N дней/день/дня" — standard three-form rule
// (11-14 always "дней", then last digit 1 -> "день", 2-4 -> "дня", else
// "дней").
function pluralDays(n) {
  const abs = Math.abs(n)
  const mod10 = abs % 10
  const mod100 = abs % 100
  if (mod10 === 1 && mod100 !== 11) return "день"
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "дня"
  return "дней"
}

// Runs once a day (see index.js's onSchedule wiring), doing three
// independent jobs per teacher in a single pass over the (small) teachers
// collection:
//
// 1. Pre-expiry reminder — a "subscription" teacher with 3 or fewer calendar
//    days left (in their own timezone) before subscriptionPaidUntil gets a
//    reminder naming exactly how many days are left and the renewal date.
//    Fires once per distinct (paidUntil, daysLeft) pair — guarded by
//    expiryReminderSentFor — so it re-fires on each new day of the 3-day
//    window (3, then 2, then 1) rather than only once, but never twice for
//    the same day if this function is re-run manually. A renewal (which
//    changes subscriptionPaidUntil) resets the guard for the new date.
//
// 2. Post-expiry warning — once daysLeft reaches 0 or goes negative (the
//    subscription has actually lapsed) but the teacher isn't blocked yet,
//    a distinct warning fires naming how many days remain in the
//    SUBSCRIPTION_GRACE_DAYS grace window before job 3 below auto-blocks
//    them. Same one-per-day guard shape as job 1, via a separate field
//    (expiredWarningSentFor) so the two never collide.
//
// 3. Non-payment auto-block — a "subscription" teacher, not already
//    blocked, whose grace deadline (subscriptionPaidUntil if they've ever
//    paid, otherwise subscriptionPlanSince — the moment their plan was set
//    to "subscription") is more than SUBSCRIPTION_GRACE_DAYS calendar days
//    in the past gets blocked with blockedReason "subscription_expired" —
//    distinct from a "manual" block so a later payment (recordSubscription-
//    Payment) or plan change back to "trial" can safely auto-restore access
//    without ever touching a block the admin set on purpose.
//
// Trial-plan teachers are never reminded, warned, or auto-blocked — there's
// nothing for them to pay.
async function checkExpiringSubscriptions() {
  logger.info("checkExpiringSubscriptions: starting")

  const now = new Date()
  const snapshot = await db.collection(TEACHERS_COLLECTION).get()

  for (const doc of snapshot.docs) {
    const teacherId = doc.id
    const teacher = doc.data()
    const timeZone = teacher.timezone || "Europe/Moscow"
    const isSubscriptionPlan = teacher.plan === "subscription"
    const paidUntil = teacher.subscriptionPaidUntil?.toDate?.() ?? null

    if (isSubscriptionPlan && paidUntil && !teacher.blocked) {
      const daysLeft = daysBetweenCalendarDates(now, paidUntil, timeZone)
      const paidUntilIso = paidUntil.toISOString()

      if (daysLeft >= 1 && daysLeft <= 3) {
        const guardKey = `${paidUntilIso}:${daysLeft}`
        if (teacher.expiryReminderSentFor !== guardKey) {
          try {
            const text = `💳 Осталось ${daysLeft} ${pluralDays(daysLeft)} до конца подписки на платформу — продли до ${formatRuDate(paidUntil, timeZone)}, чтобы не потерять доступ. Свяжись с администратором.`
            // Goes through the same funnel every other notification does —
            // logs to notifications/ (in-app bell) AND best-effort dispatches
            // to the teacher's connected bot, instead of a bot-only send that
            // never showed up on the site if no bot happened to be connected.
            await createNotification({ target: "teacher", teacherId, type: "subscription_reminder", text })
            await doc.ref.update({ expiryReminderSentFor: guardKey })
            logger.info("checkExpiringSubscriptions: reminder sent", { teacherId, daysLeft })
          } catch (error) {
            logger.error("checkExpiringSubscriptions: failed to send reminder", { teacherId, error })
          }
        }
      } else if (daysLeft <= 0) {
        const daysSinceExpiry = -daysLeft
        const daysUntilBlock = Math.max(0, SUBSCRIPTION_GRACE_DAYS - daysSinceExpiry)
        const guardKey = `${paidUntilIso}:e${daysSinceExpiry}`
        if (teacher.expiredWarningSentFor !== guardKey) {
          try {
            const blockPhrase =
              daysUntilBlock === 0
                ? "доступ будет заблокирован сегодня"
                : `иначе через ${daysUntilBlock} ${pluralDays(daysUntilBlock)} доступ будет заблокирован`
            // formatRuDate's ru-RU output already ends in "г." (e.g. "27
            // августа 2026 г.") — no extra "." after it, or it doubles up.
            const text = `⚠️ Подписка на платформу истекла ${formatRuDate(paidUntil, timeZone)} Свяжись с администратором, ${blockPhrase}.`
            await createNotification({ target: "teacher", teacherId, type: "subscription_expired_warning", text })
            await doc.ref.update({ expiredWarningSentFor: guardKey })
            logger.info("checkExpiringSubscriptions: expired warning sent", { teacherId, daysSinceExpiry })
          } catch (error) {
            logger.error("checkExpiringSubscriptions: failed to send expired warning", { teacherId, error })
          }
        }
      }
    }

    if (isSubscriptionPlan && !teacher.blocked) {
      const deadline = paidUntil ?? teacher.subscriptionPlanSince?.toDate?.() ?? null
      if (deadline && daysBetweenCalendarDates(deadline, now, timeZone) > SUBSCRIPTION_GRACE_DAYS) {
        try {
          await doc.ref.update({ blocked: true, blockedReason: "subscription_expired" })
          logger.info("checkExpiringSubscriptions: auto-blocked for non-payment", { teacherId })
        } catch (error) {
          logger.error("checkExpiringSubscriptions: failed to auto-block", { teacherId, error })
        }
      }
    }
  }

  logger.info("checkExpiringSubscriptions: finished")
}

module.exports = {
  isAdmin,
  assertIsAdmin,
  recordSubscriptionPayment,
  updateTeacherNotes,
  setTeacherBlocked,
  setTeacherPlan,
  getTeacherStats,
  deleteTeacherAccount,
  checkExpiringSubscriptions,
  touchTeacherActivity,
}
