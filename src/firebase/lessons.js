import {
  arrayUnion,
  collection,
  collectionGroup,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore"
import { httpsCallable } from "firebase/functions"
import { db, functions } from "./firebase"

const ensureUpcomingLessonCallable = httpsCallable(functions, "ensureUpcomingLesson")
const updateHomeworkAssignmentCallable = httpsCallable(functions, "updateHomeworkAssignment")
const completeLessonCallable = httpsCallable(functions, "completeLesson")
const proposeRescheduleCallable = httpsCallable(functions, "proposeReschedule")
const confirmRescheduleCallable = httpsCallable(functions, "confirmReschedule")
const cancelRescheduleCallable = httpsCallable(functions, "cancelReschedule")

function mapLessonDoc(id, studentId, data) {
  const submissionFiles = Array.isArray(data.homework?.submission?.files)
    ? data.homework.submission.files
    : []

  return {
    id,
    studentId,
    status: data.status ?? null,
    date: data.date?.toDate?.() ?? null,
    topic: data.topic ?? "",
    attendance: data.attendance ?? null,
    homeworkDone: Boolean(data.homeworkDone),
    rating: data.rating ?? null,
    materials: Array.isArray(data.materials) ? data.materials : [],
    homework: {
      assignment: {
        text: data.homework?.assignment?.text ?? "",
        files: Array.isArray(data.homework?.assignment?.files) ? data.homework.assignment.files : [],
      },
      submission: {
        files: submissionFiles.map((file) => ({
          url: file.url,
          submittedAt: file.submittedAt?.toDate?.() ?? null,
        })),
        submittedAt: data.homework?.submission?.submittedAt?.toDate?.() ?? null,
      },
    },
    rescheduled: Boolean(data.rescheduled),
    rescheduledDate: data.rescheduledDate?.toDate?.() ?? null,
    rescheduleStatus: data.rescheduleStatus ?? null,
    rescheduleInitiator: data.rescheduleInitiator ?? null,
    rescheduleProposedDate: data.rescheduleProposedDate?.toDate?.() ?? null,
  }
}

export async function ensureUpcomingLesson(studentId) {
  const result = await ensureUpcomingLessonCallable({ studentId })
  return result.data.lessonId
}

export async function updateHomeworkAssignment(studentId, lessonId, { text, files }) {
  await updateHomeworkAssignmentCallable({ studentId, lessonId, text, files })
}

export async function completeLesson(studentId, lessonId, { attendance, homeworkDone, rating, topic }) {
  await completeLessonCallable({ studentId, lessonId, attendance, homeworkDone, rating, topic })
}

// initiator is always "teacher" here — this wrapper is only used from the
// teacher UI. Students propose reschedules by texting the bot instead,
// which calls core/lessons.js's proposeReschedule directly.
export async function proposeReschedule(studentId, lessonId, proposedDate) {
  await proposeRescheduleCallable({ studentId, lessonId, proposedDate: proposedDate.toISOString() })
}

export async function confirmReschedule(studentId, lessonId) {
  await confirmRescheduleCallable({ studentId, lessonId })
}

export async function cancelReschedule(studentId, lessonId) {
  await cancelRescheduleCallable({ studentId, lessonId })
}

// Direct client write (same pattern as updateStudentSchedule) rather than a
// callable — attaching an extra material to an already-completed lesson
// doesn't need server-side validation beyond what Firestore already grants
// the teacher's client.
export async function addLessonMaterial(studentId, lessonId, material) {
  const ref = doc(db, "students", studentId, "lessons", lessonId)
  await updateDoc(ref, { materials: arrayUnion(material) })
}

export function subscribeToLesson(studentId, lessonId, onData, onError) {
  const ref = doc(db, "students", studentId, "lessons", lessonId)

  return onSnapshot(
    ref,
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(null)
        return
      }
      onData(mapLessonDoc(snapshot.id, studentId, snapshot.data()))
    },
    onError,
  )
}

export function subscribeToUpcomingLesson(studentId, onData, onError) {
  const ref = collection(db, "students", studentId, "lessons")
  const upcomingQuery = query(ref, where("status", "==", "upcoming"), limit(1))

  return onSnapshot(
    upcomingQuery,
    (snapshot) => {
      if (snapshot.empty) {
        onData(null)
        return
      }
      const document = snapshot.docs[0]
      onData(mapLessonDoc(document.id, studentId, document.data()))
    },
    onError,
  )
}

// Powers the teacher dashboard's "Ближайшие уроки" block — needs a
// collectionGroup query (and its composite index, see
// firestore.indexes.json) since it spans every student's lessons
// subcollection at once. maxResults is fetched up front and the dashboard
// paginates the "Показать ещё" button client-side over this array, rather
// than re-querying Firestore on every click.
export function subscribeToUpcomingLessons(onData, onError, maxResults = 25) {
  const upcomingQuery = query(
    collectionGroup(db, "lessons"),
    where("status", "==", "upcoming"),
    orderBy("date", "asc"),
    limit(maxResults),
  )

  return onSnapshot(
    upcomingQuery,
    (snapshot) => {
      const lessons = snapshot.docs.map((document) => {
        const studentId = document.ref.parent.parent.id
        return mapLessonDoc(document.id, studentId, document.data())
      })
      onData(lessons)
    },
    onError,
  )
}

// Powers the teacher dashboard's "Прошедшие уроки" block — same
// collectionGroup approach as subscribeToUpcomingLessons, ordered newest
// first instead (needs its own composite index, see firestore.indexes.json).
export function subscribeToCompletedLessons(onData, onError, maxResults = 25) {
  const completedQuery = query(
    collectionGroup(db, "lessons"),
    where("status", "==", "completed"),
    orderBy("date", "desc"),
    limit(maxResults),
  )

  return onSnapshot(
    completedQuery,
    (snapshot) => {
      const lessons = snapshot.docs.map((document) => {
        const studentId = document.ref.parent.parent.id
        return mapLessonDoc(document.id, studentId, document.data())
      })
      onData(lessons)
    },
    onError,
  )
}

export async function getLessons(studentId) {
  const ref = collection(db, "students", studentId, "lessons")
  const lessonsQuery = query(ref, orderBy("date", "desc"))
  const snapshot = await getDocs(lessonsQuery)

  return snapshot.docs.map((document) => {
    const data = document.data()
    return {
      id: document.id,
      status: data.status ?? null,
      date: data.date?.toDate?.() ?? null,
      topic: data.topic ?? "",
      attendance: data.attendance ?? null,
      homeworkDone: Boolean(data.homeworkDone),
      rating: data.rating ?? null,
      materials: Array.isArray(data.materials) ? data.materials : [],
      homework: {
        assignment: {
          files: Array.isArray(data.homework?.assignment?.files)
            ? data.homework.assignment.files
            : [],
        },
      },
    }
  })
}
