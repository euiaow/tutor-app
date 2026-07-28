import {
  addDoc,
  collection,
  collectionGroup,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  where,
} from "firebase/firestore"
import { httpsCallable } from "firebase/functions"
import { db, functions } from "./firebase"

const ensureUpcomingLessonCallable = httpsCallable(functions, "ensureUpcomingLesson")
const updateHomeworkAssignmentCallable = httpsCallable(functions, "updateHomeworkAssignment")

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
  }
}

export async function ensureUpcomingLesson(studentId) {
  const result = await ensureUpcomingLessonCallable({ studentId })
  return result.data.lessonId
}

export async function updateHomeworkAssignment(studentId, lessonId, { text, files }) {
  await updateHomeworkAssignmentCallable({ studentId, lessonId, text, files })
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
// subcollection at once.
export function subscribeToUpcomingLessons(onData, onError, maxResults = 3) {
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

export async function addLesson(
  studentId,
  { date, topic, attendance, homeworkDone, rating, materials = [] },
) {
  const ref = collection(db, "students", studentId, "lessons")

  await addDoc(ref, {
    date: Timestamp.fromDate(date),
    topic,
    attendance,
    homeworkDone,
    rating,
    materials,
    createdAt: serverTimestamp(),
  })
}

export async function getLessons(studentId) {
  const ref = collection(db, "students", studentId, "lessons")
  const lessonsQuery = query(ref, orderBy("date", "desc"))
  const snapshot = await getDocs(lessonsQuery)

  return snapshot.docs.map((document) => {
    const data = document.data()
    return {
      id: document.id,
      date: data.date?.toDate?.() ?? null,
      topic: data.topic ?? "",
      attendance: data.attendance ?? null,
      homeworkDone: Boolean(data.homeworkDone),
      rating: data.rating ?? null,
      materials: Array.isArray(data.materials) ? data.materials : [],
    }
  })
}
