import { addDoc, collection, onSnapshot, orderBy, query } from "firebase/firestore"
import { db } from "./firebase"

// Admin/config content the teacher alone edits — direct client Firestore
// write, no callable, same convention as curriculumTemplates (see
// systemPatterns.md). Seeded with 3 starting types (ЕГЭ/ОГЭ/Школьная
// программа) by App.jsx's ensureTeacherProfile when a teacher doc is first
// created — this module has no bootstrap logic of its own.
const EXAM_TYPES_SUBCOLLECTION = "examTypes"

// Hardcoded per explicit decision — not a generic "custom ordinal scale"
// feature (that would need a labels-array UI, select-based inputs
// everywhere a number input is used today, and per-topic level thresholds
// reworked too; scoped down to just this one fixed case instead).
// targetScore for a "language_level" exam type stores the INDEX into this
// array (0-5), not the CEFR label itself — GoalCard/ExamRadar resolve the
// index to a label for display, same reasoning as any other scale using a
// numeric targetScore for pace math.
export const LANGUAGE_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]

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
    // Initial value GoalCard (StudentDashboard.jsx) pre-fills when a goal
    // is first being set for this exam type — e.g. ЕГЭ defaults to 70, not
    // the scale's own minimum. Falls back to scaleMin at the call site if
    // this is null (custom types created via the inline form don't ask for
    // it, so they get the old "start from the scale minimum" behavior).
    scaleDefault: data.scaleDefault ?? null,
    scaleUnitLabel: data.scaleUnitLabel ?? "",
    // Only meaningful for scaleType "language_level" — null for every
    // other type, mirroring scaleMin/scaleMax's own "null when unused".
    scaleLabels: Array.isArray(data.scaleLabels) ? data.scaleLabels : null,
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
// treatment for that case. "language_level" ignores them too — its range
// is the fixed LANGUAGE_LEVELS array (as an index), not a numeric min/max.
export async function createExamType(teacherId, { name, scaleType, scaleMin, scaleMax, scaleUnitLabel }) {
  const isLanguageLevel = scaleType === "language_level"
  const hasNumericScale = scaleType !== "none" && !isLanguageLevel
  const ref = await addDoc(examTypesRef(teacherId), {
    name: name.trim(),
    scaleType,
    scaleMin: hasNumericScale ? Number(scaleMin) : isLanguageLevel ? 0 : null,
    scaleMax: hasNumericScale ? Number(scaleMax) : isLanguageLevel ? LANGUAGE_LEVELS.length - 1 : null,
    scaleStep: 1,
    // No default-value input in the inline "+ Создать новый тип экзамена"
    // form (only name/scaleType/min/max) — left null so GoalCard falls
    // back to the scale's own minimum, same as before this field existed.
    scaleDefault: null,
    scaleUnitLabel: hasNumericScale ? (scaleUnitLabel ?? "") : "",
    scaleLabels: isLanguageLevel ? LANGUAGE_LEVELS : null,
  })
  return ref.id
}
