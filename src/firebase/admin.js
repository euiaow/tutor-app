import { collection, onSnapshot, orderBy, query } from "firebase/firestore"
import { httpsCallable } from "firebase/functions"
import { db, functions } from "./firebase"

// Admin panel — isolated contour. An admin is just a teacher's existing
// Firebase Auth account whose uid is also listed in config/admin.allowedUids
// (checked server-side in every callable below, see functions/core/admin.js).

const isAdminCallable = httpsCallable(functions, "isAdmin")
const recordSubscriptionPaymentCallable = httpsCallable(functions, "recordSubscriptionPayment")
const updateTeacherNotesCallable = httpsCallable(functions, "updateTeacherNotes")
const setTeacherBlockedCallable = httpsCallable(functions, "setTeacherBlocked")
const setTeacherPlanCallable = httpsCallable(functions, "setTeacherPlan")
const getTeacherStatsCallable = httpsCallable(functions, "getTeacherStats")
const deleteTeacherAccountCallable = httpsCallable(functions, "deleteTeacherAccount")

export async function isAdmin() {
  const result = await isAdminCallable()
  return Boolean(result.data?.isAdmin)
}

export async function recordSubscriptionPayment(teacherId, { daysAdded, amount, note }) {
  const result = await recordSubscriptionPaymentCallable({ teacherId, daysAdded, amount, note })
  return result.data
}

export async function updateTeacherNotes(teacherId, notes) {
  await updateTeacherNotesCallable({ teacherId, notes })
}

export async function setTeacherBlocked(teacherId, blocked) {
  await setTeacherBlockedCallable({ teacherId, blocked })
}

export async function setTeacherPlan(teacherId, plan) {
  await setTeacherPlanCallable({ teacherId, plan })
}

export async function getTeacherStats(teacherId) {
  const result = await getTeacherStatsCallable({ teacherId })
  return result.data
}

// Irreversible — deletes the teacher's entire footprint (students, groups,
// curriculum templates, tokens, notifications) plus the teachers/{id} doc
// and Firebase Auth account itself. See functions/core/teacherDeletion.js.
export async function deleteTeacherAccount(teacherId) {
  const result = await deleteTeacherAccountCallable({ teacherId })
  return result.data
}

function mapTeacherDoc(id, data) {
  return {
    id,
    name: data.name ?? "",
    email: data.email ?? "",
    createdAt: data.createdAt?.toDate?.() ?? null,
    // Legacy docs predating this rollout have no `plan` field at all —
    // default to "trial", the same default a freshly bootstrapped teacher
    // gets (see App.jsx's ensureTeacherProfile).
    plan: data.plan ?? "trial",
    subscriptionPaidUntil: data.subscriptionPaidUntil?.toDate?.() ?? null,
    subscriptionPlanSince: data.subscriptionPlanSince?.toDate?.() ?? null,
    blocked: Boolean(data.blocked),
    // Legacy manually-blocked docs predating blockedReason default to
    // "manual" — the only kind of block that could have existed before.
    blockedReason: data.blocked ? data.blockedReason ?? "manual" : null,
    adminNotes: data.adminNotes ?? "",
  }
}

// Requires the caller's uid to be in config/admin.allowedUids — the
// extended teachers Firestore Rule (see the Phase 1 rules draft) is what
// makes reading every teacher, not just your own doc, possible at all.
export function subscribeToAllTeachers(onData, onError) {
  const ref = collection(db, "teachers")
  return onSnapshot(
    ref,
    (snapshot) => onData(snapshot.docs.map((document) => mapTeacherDoc(document.id, document.data()))),
    onError,
  )
}

function mapPaymentDoc(id, data) {
  return {
    id,
    daysAdded: data.daysAdded ?? 0,
    amount: data.amount ?? null,
    note: data.note ?? null,
    recordedAt: data.recordedAt?.toDate?.() ?? null,
  }
}

export function subscribeToSubscriptionPayments(teacherId, onData, onError) {
  const ref = collection(db, "teachers", teacherId, "subscriptionPayments")
  const paymentsQuery = query(ref, orderBy("recordedAt", "desc"))
  return onSnapshot(
    paymentsQuery,
    (snapshot) => onData(snapshot.docs.map((document) => mapPaymentDoc(document.id, document.data()))),
    onError,
  )
}
