import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore"
import { db } from "./firebase"

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
