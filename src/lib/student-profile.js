export const SUBJECT_OPTIONS = [
  { value: "russian", label: "Русский язык" },
  { value: "literature", label: "Литература" },
]

export const EXAM_TARGET_OPTIONS = [
  { value: "ege", label: "ЕГЭ" },
  { value: "oge", label: "ОГЭ" },
  { value: "school", label: "Школьная программа" },
]

export function formatSubjects(subjectCodes) {
  if (!subjectCodes || subjectCodes.length === 0) return "Предмет не указан"
  return subjectCodes
    .map((code) => SUBJECT_OPTIONS.find((option) => option.value === code)?.label ?? code)
    .join(", ")
}

export function formatExamTarget(examTarget) {
  return EXAM_TARGET_OPTIONS.find((option) => option.value === examTarget)?.label ?? "—"
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
