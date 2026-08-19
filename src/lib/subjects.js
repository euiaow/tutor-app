// Static list of common school subjects — not a Firestore collection since
// it never changes per-teacher; each teacher's own additions live in
// teachers/{uid}/customSubjects instead (see src/firebase/customSubjects.js).
export const STATIC_SUBJECTS = [
  "Русский язык",
  "Литература",
  "Математика",
  "Английский язык",
  "Немецкий язык",
  "Китайский язык",
  "Физика",
  "Химия",
  "Биология",
  "Информатика",
]

// A small fixed palette, cycled by a deterministic hash of the subject name
// — every teacher/student sees the same subject in the same color without
// storing a color anywhere. No prior "hash a string to a color" helper
// exists in this codebase to reuse (checked student-tags.jsx and the rest
// of src/ — the technique predates the current hardcoded TAG_STYLES map
// this replaces), so this is a fresh implementation, not a port.
const SUBJECT_COLOR_PALETTE = [
  "bg-blue-500/15 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400",
  "bg-purple-500/15 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400",
  "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",
  "bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400",
  "bg-rose-500/15 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400",
  "bg-cyan-500/15 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-400",
  "bg-indigo-500/15 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400",
  "bg-lime-500/15 text-lime-700 dark:bg-lime-500/20 dark:text-lime-400",
  "bg-fuchsia-500/15 text-fuchsia-700 dark:bg-fuchsia-500/20 dark:text-fuchsia-400",
  "bg-orange-500/15 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400",
  "bg-teal-500/15 text-teal-700 dark:bg-teal-500/20 dark:text-teal-400",
]

// Simple deterministic string hash (djb2-style) — same technique the
// backend twin (functions/core/subjectColor.js) uses, kept in sync by hand
// since one's ESM and the other's CommonJS (same split as src/lib/schedule.js
// vs functions/core/schedule.js).
function hashString(value) {
  let hash = 5381
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33 + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

export function getSubjectColorIndex(name) {
  if (!name) return 0
  return hashString(name) % SUBJECT_COLOR_PALETTE.length
}

export function getSubjectColorClass(name) {
  return SUBJECT_COLOR_PALETTE[getSubjectColorIndex(name)]
}
