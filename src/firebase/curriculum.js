import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore"
import { httpsCallable } from "firebase/functions"
import { db, functions } from "./firebase"

const CURRICULUM_TEMPLATES_COLLECTION = "curriculumTemplates"
const CURRICULUM_PROGRESS_SUBCOLLECTION = "curriculumProgress"
const CURRICULUM_PROGRESS_DOC_ID = "main"

const assignCurriculumTemplateCallable = httpsCallable(functions, "assignCurriculumTemplate")
const markTopicsCoveredCallable = httpsCallable(functions, "markTopicsCovered")

function mapTemplateDoc(id, data) {
  return {
    id,
    name: data.name ?? "",
    examTarget: data.examTarget ?? "school",
    topics: Array.isArray(data.topics) ? data.topics : [],
    prototypes: Array.isArray(data.prototypes) ? data.prototypes : [],
  }
}

export async function getCurriculumTemplates() {
  const ref = collection(db, CURRICULUM_TEMPLATES_COLLECTION)
  const snapshot = await getDocs(ref)
  return snapshot.docs.map((document) => mapTemplateDoc(document.id, document.data()))
}

export async function createCurriculumTemplate({ name, examTarget, topics, prototypes }) {
  const ref = collection(db, CURRICULUM_TEMPLATES_COLLECTION)
  await addDoc(ref, {
    name,
    examTarget,
    topics,
    prototypes,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function updateCurriculumTemplate(templateId, { name, examTarget, topics, prototypes }) {
  const ref = doc(db, CURRICULUM_TEMPLATES_COLLECTION, templateId)
  await updateDoc(ref, {
    name,
    examTarget,
    topics,
    prototypes,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteCurriculumTemplate(templateId) {
  const ref = doc(db, CURRICULUM_TEMPLATES_COLLECTION, templateId)
  await deleteDoc(ref)
}

export async function assignCurriculumTemplate(studentId, templateId) {
  await assignCurriculumTemplateCallable({ studentId, templateId })
}

// One-time read (not realtime) — used by HomeworkLessonDialog when it
// enters completing mode, and by the student-row detail view (Phase 4).
export async function getCurriculumProgress(studentId) {
  const ref = doc(db, "students", studentId, CURRICULUM_PROGRESS_SUBCOLLECTION, CURRICULUM_PROGRESS_DOC_ID)
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) return null

  const data = snapshot.data()
  return {
    topics: Array.isArray(data.topics) ? data.topics : [],
    prototypes: Array.isArray(data.prototypes) ? data.prototypes : [],
  }
}

export async function markTopicsCovered(studentId, lessonId, { topicIds, prototypeIds, rating }) {
  await markTopicsCoveredCallable({ studentId, lessonId, topicIds, prototypeIds, rating })
}

export function subscribeToCurriculumProgress(studentId, onData, onError) {
  const ref = doc(db, "students", studentId, CURRICULUM_PROGRESS_SUBCOLLECTION, CURRICULUM_PROGRESS_DOC_ID)

  return onSnapshot(
    ref,
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(null)
        return
      }
      const data = snapshot.data()
      onData({
        topics: Array.isArray(data.topics) ? data.topics : [],
        prototypes: Array.isArray(data.prototypes) ? data.prototypes : [],
      })
    },
    onError,
  )
}

// One-time collectionGroup scan across every student's curriculumProgress —
// powers the progress bar on every (collapsed) row in the student list
// without holding open a listener per student; only the row a teacher
// actually expands gets a live subscribeToCurriculumProgress on top of this.
export async function getAllCurriculumProgressByStudent() {
  const progressQuery = collectionGroup(db, CURRICULUM_PROGRESS_SUBCOLLECTION)
  const snapshot = await getDocs(progressQuery)

  const byStudentId = {}
  snapshot.docs.forEach((document) => {
    const studentId = document.ref.parent.parent.id
    const data = document.data()
    byStudentId[studentId] = {
      topics: Array.isArray(data.topics) ? data.topics : [],
      prototypes: Array.isArray(data.prototypes) ? data.prototypes : [],
    }
  })
  return byStudentId
}

// Manual correction path, separate from the normal completeLesson ->
// markTopicsCovered flow — reads the whole array and writes it back since
// Firestore doesn't support indexing into an array by element id via a dot
// path in updateDoc.
export async function setCurriculumItemCovered(studentId, kind, itemId, covered) {
  const ref = doc(db, "students", studentId, CURRICULUM_PROGRESS_SUBCOLLECTION, CURRICULUM_PROGRESS_DOC_ID)
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) return

  const items = Array.isArray(snapshot.data()[kind]) ? snapshot.data()[kind] : []
  const next = items.map((item) =>
    item.id === itemId ? { ...item, covered, coveredAt: covered ? Timestamp.now() : null } : item,
  )
  await updateDoc(ref, { [kind]: next })
}
