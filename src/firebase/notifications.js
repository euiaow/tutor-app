import {
  collection,
  doc,
  limit as fsLimit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore"
import { db } from "./firebase"

function mapNotificationDoc(id, data) {
  return {
    id,
    target: data.target ?? null,
    studentId: data.studentId ?? null,
    type: data.type ?? null,
    text: data.text ?? "",
    read: Boolean(data.read),
    createdAt: data.createdAt?.toDate?.() ?? null,
    lessonId: data.lessonId ?? null,
  }
}

// Powers the teacher dashboard's notification bell — a single subscription
// doubles as both the unread-dot check and the panel list (see
// TeacherDashboard.jsx), since 20 most-recent notifications is small enough
// to just filter client-side rather than running a second query for the
// unread count.
export function subscribeToTeacherNotifications(onData, onError, maxResults = 20) {
  const notificationsQuery = query(
    collection(db, "notifications"),
    where("target", "==", "teacher"),
    orderBy("createdAt", "desc"),
    fsLimit(maxResults),
  )

  return onSnapshot(
    notificationsQuery,
    (snapshot) => {
      onData(snapshot.docs.map((document) => mapNotificationDoc(document.id, document.data())))
    },
    onError,
  )
}

export function subscribeToStudentNotifications(studentId, onData, onError, maxResults = 20) {
  const notificationsQuery = query(
    collection(db, "notifications"),
    where("target", "==", "student"),
    where("studentId", "==", studentId),
    orderBy("createdAt", "desc"),
    fsLimit(maxResults),
  )

  return onSnapshot(
    notificationsQuery,
    (snapshot) => {
      onData(snapshot.docs.map((document) => mapNotificationDoc(document.id, document.data())))
    },
    onError,
  )
}

export async function markNotificationRead(notificationId) {
  await updateDoc(doc(db, "notifications", notificationId), { read: true })
}

export async function markAllNotificationsRead(notifications) {
  const unread = notifications.filter((notification) => !notification.read)
  if (unread.length === 0) return

  const batch = writeBatch(db)
  for (const notification of unread) {
    batch.update(doc(db, "notifications", notification.id), { read: true })
  }
  await batch.commit()
}
