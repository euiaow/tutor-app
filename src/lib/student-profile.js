// Block 3 — student.subject now stores the display name directly (e.g.
// "Русский язык"), not a lookup code, since subjects are free-form
// (STATIC_SUBJECTS + per-teacher customSubjects — see src/lib/subjects.js),
// so formatSubjects is just a join, no lookup table needed anymore.
// examTarget's old EXAM_TARGET_OPTIONS/formatExamTarget are gone entirely —
// exam type is now a teacher-owned examTypes doc (src/firebase/examTypes.js),
// resolved by id where needed, not a static enum this module can format.
export function formatSubjects(subjectNames) {
  if (!subjectNames || subjectNames.length === 0) return "Предмет не указан"
  return subjectNames.join(", ")
}

// Russian pluralization for "занятие" (1 занятие, 2-4 занятия, 5+ занятий),
// with the usual 11-14 exception falling into the "занятий" bucket.
export function pluralizeLessons(count) {
  const n = Math.abs(count) % 100
  const n1 = n % 10

  if (n > 10 && n < 20) return "занятий"
  if (n1 > 1 && n1 < 5) return "занятия"
  if (n1 === 1) return "занятие"
  return "занятий"
}

export function getBalanceColorClass(balance, lowBalanceThreshold) {
  if (balance <= 0) return "text-red-600 dark:text-red-400"
  if (balance <= lowBalanceThreshold) return "text-amber-600 dark:text-amber-400"
  return "text-emerald-600 dark:text-emerald-400"
}
