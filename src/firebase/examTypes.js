import { addDoc, collection, onSnapshot, orderBy, query } from "firebase/firestore"
import { db } from "./firebase"

// Admin/config content the teacher alone edits — direct client Firestore
// write, no callable, same convention as curriculumTemplates (see
// systemPatterns.md). Seeded with 3 starting types (ЕГЭ/ОГЭ/Школьная
// программа) by App.jsx's ensureTeacherProfile when a teacher doc is first
// created — this module has no bootstrap logic of its own.
const EXAM_TYPES_SUBCOLLECTION = "examTypes"

function examTypesRef(teacherId) {
  return collection(db, "teachers", teacherId, EXAM_TYPES_SUBCOLLECTION)
}

function mapExamTypeDoc(id, data) {
  return {
    id,
    name: data.name ?? "",
    scaleType: data.scaleType ?? "none",
    scaleMin: data.scaleMin ?? null,
    scaleMax: data.scaleMax ?? null,
    scaleStep: data.scaleStep ?? 1,
    scaleUnitLabel: data.scaleUnitLabel ?? "",
  }
}

export function subscribeToExamTypes(teacherId, onData, onError) {
  const examTypesQuery = query(examTypesRef(teacherId), orderBy("name"))
  return onSnapshot(
    examTypesQuery,
    (snapshot) => onData(snapshot.docs.map((d) => mapExamTypeDoc(d.id, d.data()))),
    onError,
  )
}

// scaleMin/scaleMax are ignored (stored null) for scaleType "none" — a
// "Школьная программа"-style type has no formal target to range-check
// against, matching MyGoalCard/ExamRadar's existing "no goal block at all"
// treatment for that case.
export async function createExamType(teacherId, { name, scaleType, scaleMin, scaleMax, scaleUnitLabel }) {
  const hasScale = scaleType !== "none"
  const ref = await addDoc(examTypesRef(teacherId), {
    name: name.trim(),
    scaleType,
    scaleMin: hasScale ? Number(scaleMin) : null,
    scaleMax: hasScale ? Number(scaleMax) : null,
    scaleStep: 1,
    scaleUnitLabel: hasScale ? (scaleUnitLabel ?? "") : "",
  })
  return ref.id
}
