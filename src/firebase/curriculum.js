import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore"
import { httpsCallable } from "firebase/functions"
import { db, functions, auth } from "./firebase"

const CURRICULUM_TEMPLATES_COLLECTION = "curriculumTemplates"
const PROGRAMS_SUBCOLLECTION = "programs"

const assignCurriculumTemplateCallable = httpsCallable(functions, "assignCurriculumTemplate")
const reassignProgramCallable = httpsCallable(functions, "reassignProgram")
const deleteProgramCallable = httpsCallable(functions, "deleteProgram")
const markTopicsCoveredCallable = httpsCallable(functions, "markTopicsCovered")
const addPersonalTopicCallable = httpsCallable(functions, "addPersonalTopic")
const removePersonalTopicCallable = httpsCallable(functions, "removePersonalTopic")

function mapTemplateDoc(id, data) {
  return {
    id,
    name: data.name ?? "",
    examTypeId: data.examTypeId ?? null,
    // Block 4 Phase 2 — templates now carry their own subject, copied onto
    // every program assigned from them (assignCurriculumTemplate).
    subject: data.subject ?? "",
    topics: Array.isArray(data.topics) ? data.topics : [],
    prototypes: Array.isArray(data.prototypes) ? data.prototypes : [],
    // Default minScoreRequired applied to a new topic/prototype row added
    // after this was set — existing rows are never touched by a change
    // here (see curriculum-section.jsx's RowList addRow).
    defaultTargetScore: data.defaultTargetScore ?? null,
  }
}

// teacherId filter is explicit, not left to Firestore Rules alone — same
// reasoning as subscribeToStudents (src/firebase/students.js): a `list`
// query whose security rule checks resource.data.teacherId is rejected
// outright (permission-denied) unless the query itself is provably scoped
// on that same field.
export async function getCurriculumTemplates(teacherId) {
  const ref = collection(db, CURRICULUM_TEMPLATES_COLLECTION)
  const templatesQuery = query(ref, where("teacherId", "==", teacherId))
  const snapshot = await getDocs(templatesQuery)
  return snapshot.docs.map((document) => mapTemplateDoc(document.id, document.data()))
}

export async function createCurriculumTemplate({ name, examTypeId, subject, topics, prototypes, defaultTargetScore }) {
  const ref = collection(db, CURRICULUM_TEMPLATES_COLLECTION)
  await addDoc(ref, {
    name,
    examTypeId,
    subject,
    topics,
    prototypes,
    defaultTargetScore: defaultTargetScore ?? null,
    // Multi-tenancy Phase 2: templates are admin-only, teacher-owned config
    // (same "direct client write" convention as the rest of this file) —
    // stamped once at creation, never touched again by updateCurriculumTemplate.
    teacherId: auth.currentUser?.uid ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function updateCurriculumTemplate(
  templateId,
  { name, examTypeId, subject, topics, prototypes, defaultTargetScore },
) {
  const ref = doc(db, CURRICULUM_TEMPLATES_COLLECTION, templateId)
  await updateDoc(ref, {
    name,
    examTypeId,
    subject,
    topics,
    prototypes,
    defaultTargetScore: defaultTargetScore ?? null,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteCurriculumTemplate(templateId) {
  const ref = doc(db, CURRICULUM_TEMPLATES_COLLECTION, templateId)
  await deleteDoc(ref)
}

// Block 4 — adds a new program (never overwrites an existing one). Returns
// { success, programId }.
export async function assignCurriculumTemplate(studentId, templateId) {
  const result = await assignCurriculumTemplateCallable({ studentId, templateId })
  return result.data
}

// Replaces one already-assigned program's template-derived content in
// place — see functions/core/curriculum.js's own comment on the semantics.
export async function reassignProgram(studentId, programId, templateId) {
  await reassignProgramCallable({ studentId, programId, templateId })
}

export async function deleteProgram(studentId, programId) {
  await deleteProgramCallable({ studentId, programId })
}

function mapProgramDoc(id, data) {
  return {
    id,
    subject: data.subject ?? null,
    // Denormalized from the template at assign/reassign time — falls back
    // to "Без шаблона" for a program assigned before this field existed
    // (see functions/core/curriculum.js), same fallback student-row.jsx's
    // own live templateId lookup already used.
    name: data.name || "Без шаблона",
    templateId: data.templateId ?? null,
    examTypeId: data.examTypeId ?? null,
    topics: Array.isArray(data.topics) ? data.topics : [],
    prototypes: Array.isArray(data.prototypes) ? data.prototypes : [],
    targetScore: data.targetScore ?? null,
    examDate: data.examDate?.toDate?.() ?? null,
    assignedAt: data.assignedAt ?? null,
  }
}

// One-time read (not realtime) — used by HomeworkLessonDialog when it
// enters completing/upcoming mode to source the topic picker/checklist.
export async function getProgramsForStudent(studentId) {
  const ref = collection(db, "students", studentId, PROGRAMS_SUBCOLLECTION)
  const snapshot = await getDocs(ref)
  return snapshot.docs.map((document) => mapProgramDoc(document.id, document.data()))
}

export function subscribeToPrograms(studentId, onData, onError) {
  const ref = collection(db, "students", studentId, PROGRAMS_SUBCOLLECTION)
  return onSnapshot(
    ref,
    (snapshot) => onData(snapshot.docs.map((document) => mapProgramDoc(document.id, document.data()))),
    onError,
  )
}

export async function markTopicsCovered(studentId, lessonId, programId, { topicIds, prototypeIds, rating }) {
  await markTopicsCoveredCallable({ studentId, lessonId, programId, topicIds, prototypeIds, rating })
}

// Edits one program's topics/prototypes directly — independent of whatever
// template it came from. type is "topic" | "prototype".
export async function addPersonalTopic(studentId, programId, { title, minScoreRequired, type }) {
  const result = await addPersonalTopicCallable({ studentId, programId, title, minScoreRequired, type })
  return result.data
}

export async function removePersonalTopic(studentId, programId, { itemId, type }) {
  await removePersonalTopicCallable({ studentId, programId, itemId, type })
}

// One-time collectionGroup scan across every student's programs — powers
// the (averaged, Block 4 Phase 4) progress indicator on every collapsed row
// in the student list without holding open a listener per student.
export async function getAllProgramsByStudent(teacherId) {
  const programsQuery = query(collectionGroup(db, PROGRAMS_SUBCOLLECTION), where("teacherId", "==", teacherId))
  const snapshot = await getDocs(programsQuery)

  const byStudentId = {}
  snapshot.docs.forEach((document) => {
    const studentId = document.ref.parent.parent.id
    if (!byStudentId[studentId]) byStudentId[studentId] = []
    byStudentId[studentId].push(mapProgramDoc(document.id, document.data()))
  })
  return byStudentId
}

// Manual correction path, separate from the normal completeLesson ->
// markTopicsCovered flow — reads the whole array and writes it back since
// Firestore doesn't support indexing into an array by element id via a dot
// path in updateDoc.
export async function setCurriculumItemCovered(studentId, programId, kind, itemId, covered) {
  const ref = doc(db, "students", studentId, PROGRAMS_SUBCOLLECTION, programId)
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) return

  const items = Array.isArray(snapshot.data()[kind]) ? snapshot.data()[kind] : []
  const next = items.map((item) =>
    item.id === itemId
      ? { ...item, covered, coveredAt: covered ? new Date() : null, coveredVia: covered ? "manual" : null }
      : item,
  )
  await updateDoc(ref, { [kind]: next })
}
