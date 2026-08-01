import {
  arrayRemove,
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
const cancelLessonDirectlyCallable = httpsCallable(functions, "cancelLessonDirectly")
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
    durationMinutes: data.durationMinutes ?? 60,
    rescheduled: Boolean(data.rescheduled),
    rescheduledDate: data.rescheduledDate?.toDate?.() ?? null,
    rescheduleStatus: data.rescheduleStatus ?? null,
    rescheduleInitiator: data.rescheduleInitiator ?? null,
    rescheduleProposedDate: data.rescheduleProposedDate?.toDate?.() ?? null,
    cancellationStatus: data.cancellationStatus ?? null,
    cancellationInitiator: data.cancellationInitiator ?? null,
    coveredTopics: Array.isArray(data.coveredTopics) ? data.coveredTopics : [],
    coveredPrototypes: Array.isArray(data.coveredPrototypes) ? data.coveredPrototypes : [],
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

// Teacher-only one-way cancellation — no confirmedBy/role param, always
// requires a signed-in teacher session (see index.js's cancelLessonDirectly).
export async function cancelLessonDirectly(studentId, lessonId) {
  await cancelLessonDirectlyCallable({ studentId, lessonId })
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

// Direct client write (same pattern as updateLessonTopic) — removing a
// material doesn't need a server-side notification, so no callable needed.
// material must be the exact object as stored in lesson.materials, since
// arrayRemove matches by deep-equality.
export async function removeLessonMaterial(studentId, lessonId, material) {
  const ref = doc(db, "students", studentId, "lessons", lessonId)
  await updateDoc(ref, { materials: arrayRemove(material) })
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

const UPCOMING_GRACE_MINUTES = 45

// A lesson stays status "upcoming" server-side until the teacher completes
// or cancels it, so a no-show or a lesson the teacher hasn't gotten to yet
// can sit well past its effective date. On the student side only, once it's
// more than UPCOMING_GRACE_MINUTES past due it should stop counting as the
// "next" lesson — display-only, never writes to the doc, so it's still
// there (and completable) in the teacher's own unfiltered
// subscribeToUpcomingLessons below.
function isStillRelevant(lesson) {
  const effectiveDate = lesson.rescheduledDate ?? lesson.date
  return Boolean(effectiveDate) && effectiveDate.getTime() + UPCOMING_GRACE_MINUTES * 60000 > Date.now()
}

export function subscribeToUpcomingLesson(studentId, onData, onError) {
  const ref = collection(db, "students", studentId, "lessons")
  // No server-side limit(1) here: the single soonest-by-date doc could be
  // exactly the one the grace-period filter drops while another slot's
  // draft is still relevant, so every upcoming doc has to be fetched and
  // filtered before picking the nearest one.
  const upcomingQuery = query(ref, where("status", "==", "upcoming"), orderBy("date", "asc"))

  return onSnapshot(
    upcomingQuery,
    (snapshot) => {
      const relevant = snapshot.docs
        .map((document) => mapLessonDoc(document.id, studentId, document.data()))
        .filter(isStillRelevant)

      if (relevant.length === 0) {
        onData(null)
        return
      }

      const nearest = relevant.reduce((soonest, lesson) =>
        (lesson.rescheduledDate ?? lesson.date) < (soonest.rescheduledDate ?? soonest.date) ? lesson : soonest,
      )
      onData(nearest)
    },
    onError,
  )
}

// Same query as subscribeToUpcomingLesson but without the limit(1) —
// powers "Мои уроки" (StudentDashboard.jsx), the one place that needs
// every upcoming draft across all of a student's schedule slots at once,
// not just the single soonest one. Same grace-period filter applies.
export function subscribeToAllUpcomingLessons(studentId, onData, onError) {
  const ref = collection(db, "students", studentId, "lessons")
  const upcomingQuery = query(ref, where("status", "==", "upcoming"), orderBy("date", "asc"))

  return onSnapshot(
    upcomingQuery,
    (snapshot) => {
      const lessons = snapshot.docs
        .map((document) => mapLessonDoc(document.id, studentId, document.data()))
        .filter(isStillRelevant)
      onData(lessons)
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

// Powers the teacher dashboard's "Доход за неделю" row — spans both
// "upcoming" and "completed" (a lesson shouldn't drop out of this week's
// income the moment it's marked done) and, unlike the two feeds above, isn't
// capped since every matching lesson has to be seen to sum correctly. Reuses
// the same (status, date) composite index as subscribeToUpcomingLessons —
// Firestore serves an `in` filter off the same index as `==`. Filtering down
// to "this week" happens client-side (see finance-section.jsx) because the
// week has to be evaluated against the *effective* date (rescheduledDate ??
// date), which Firestore can't query on directly.
export function subscribeToIncomeLessons(onData, onError) {
  const incomeQuery = query(
    collectionGroup(db, "lessons"),
    where("status", "in", ["upcoming", "completed"]),
    orderBy("date", "asc"),
  )

  return onSnapshot(
    incomeQuery,
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
