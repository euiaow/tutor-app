import {
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
const getNearestUpcomingLessonCallable = httpsCallable(functions, "getNearestUpcomingLesson")
const updateHomeworkAssignmentCallable = httpsCallable(functions, "updateHomeworkAssignment")
const addLessonMaterialCallable = httpsCallable(functions, "addLessonMaterial")
const createExtraLessonCallable = httpsCallable(functions, "createExtraLesson")
const submitHomeworkFileCallable = httpsCallable(functions, "submitHomeworkFile")
const completeLessonCallable = httpsCallable(functions, "completeLesson")
const proposeRescheduleCallable = httpsCallable(functions, "proposeReschedule")
const confirmRescheduleCallable = httpsCallable(functions, "confirmReschedule")
const cancelRescheduleCallable = httpsCallable(functions, "cancelReschedule")
const proposeCancellationCallable = httpsCallable(functions, "proposeCancellation")
const confirmCancellationCallable = httpsCallable(functions, "confirmCancellation")
const rejectCancellationCallable = httpsCallable(functions, "rejectCancellation")

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
    cancellationStatus: data.cancellationStatus ?? null,
    cancellationInitiator: data.cancellationInitiator ?? null,
  }
}

export async function ensureUpcomingLesson(studentId) {
  const result = await ensureUpcomingLessonCallable({ studentId })
  return result.data.lessonId
}

// Read-only "what's this student's next lesson" — unlike
// ensureUpcomingLesson, sees isExtraLesson docs too and never creates a
// draft. Returns null if there's no upcoming lesson of any kind yet.
export async function getNearestUpcomingLesson(studentId) {
  const result = await getNearestUpcomingLessonCallable({ studentId })
  return result.data.lessonId
}

export async function updateHomeworkAssignment(studentId, lessonId, { text, files }) {
  await updateHomeworkAssignmentCallable({ studentId, lessonId, text, files })
}

export async function completeLesson(studentId, lessonId, { attendance, homeworkDone, rating }) {
  await completeLessonCallable({ studentId, lessonId, attendance, homeworkDone, rating })
}

// initiator is "teacher" from TeacherDashboard (default, unpassed) or
// "student" from StudentDashboard's own "Перенести урок" button — see
// index.js's proposeReschedule for why only the "teacher" path requires a
// signed-in session.
export async function proposeReschedule(studentId, lessonId, proposedDate, initiator) {
  await proposeRescheduleCallable({ studentId, lessonId, proposedDate: proposedDate.toISOString(), initiator })
}

// confirmedBy is "teacher" (default, TeacherDashboard) or "student"
// (StudentDashboard confirming a teacher-initiated reschedule).
export async function confirmReschedule(studentId, lessonId, confirmedBy) {
  await confirmRescheduleCallable({ studentId, lessonId, confirmedBy })
}

export async function cancelReschedule(studentId, lessonId) {
  await cancelRescheduleCallable({ studentId, lessonId })
}

// initiator is "teacher" (default, TeacherDashboard) or "student"
// (StudentDashboard's own "Отменить урок" button) — same reasoning as
// proposeReschedule above.
export async function proposeCancellation(studentId, lessonId, initiator) {
  await proposeCancellationCallable({ studentId, lessonId, initiator })
}

// confirmedBy is "teacher" from TeacherDashboard (confirming a
// student-initiated cancellation) or "student" from StudentDashboard
// (confirming a teacher-initiated one) — see index.js's confirmCancellation
// for why only the "teacher" path requires a signed-in session.
export async function confirmCancellation(studentId, lessonId, confirmedBy) {
  await confirmCancellationCallable({ studentId, lessonId, confirmedBy })
}

export async function rejectCancellation(studentId, lessonId) {
  await rejectCancellationCallable({ studentId, lessonId })
}

// A callable (not a direct client write like updateLessonTopic below)
// because attaching a material also needs to trigger a "material_added"
// notification to the student — see core/lessons.js.
export async function addLessonMaterial(studentId, lessonId, material) {
  await addLessonMaterialCallable({ studentId, lessonId, material })
}

export async function createExtraLesson(studentId, date) {
  const result = await createExtraLessonCallable({ studentId, date: date.toISOString() })
  return result.data.lessonId
}

export async function submitHomeworkFile(studentId, fileUrl) {
  await submitHomeworkFileCallable({ studentId, fileUrl })
}

// Direct client write (same pattern as addLessonMaterial) — the teacher
// edits a lesson's topic while it's still upcoming, no server-side
// validation needed beyond what Firestore rules already grant.
export async function updateLessonTopic(studentId, lessonId, topic) {
  const ref = doc(db, "students", studentId, "lessons", lessonId)
  await updateDoc(ref, { topic })
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
  const upcomingQuery = query(ref, where("status", "==", "upcoming"), orderBy("date", "asc"), limit(1))

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

// One-time fetch of every completed lesson across every student — powers
// the teacher dashboard's "Показать все прошедшие уроки" modal, which loads
// on demand rather than subscribing, unlike subscribeToCompletedLessons.
export async function getAllCompletedLessons() {
  const completedQuery = query(
    collectionGroup(db, "lessons"),
    where("status", "==", "completed"),
    orderBy("date", "desc"),
  )

  const snapshot = await getDocs(completedQuery)

  return snapshot.docs.map((document) => {
    const studentId = document.ref.parent.parent.id
    return mapLessonDoc(document.id, studentId, document.data())
  })
}

function mapPlainLessonDoc(document) {
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
        files: Array.isArray(data.homework?.assignment?.files) ? data.homework.assignment.files : [],
      },
    },
  }
}

export async function getLessons(studentId) {
  const ref = collection(db, "students", studentId, "lessons")
  const lessonsQuery = query(ref, orderBy("date", "desc"))
  const snapshot = await getDocs(lessonsQuery)

  return snapshot.docs.map(mapPlainLessonDoc)
}

export function subscribeToLessons(studentId, onData, onError) {
  const ref = collection(db, "students", studentId, "lessons")
  const lessonsQuery = query(ref, orderBy("date", "desc"))

  return onSnapshot(
    lessonsQuery,
    (snapshot) => {
      onData(snapshot.docs.map(mapPlainLessonDoc))
    },
    onError,
  )
}
