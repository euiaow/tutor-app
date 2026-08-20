// English translations for the two seeded exam types' scaleUnitLabel
// (see App.jsx's ensureTeacherProfile — ЕГЭ: "баллов", ОГЭ: "оценка"). A
// custom exam type's own unit label (e.g. a teacher-authored "band" for
// IELTS) has no entry here and is left as-is by translateUnitLabel below,
// same reasoning as subjectTranslations.js — no reliable way to auto-
// translate arbitrary teacher-authored text.
const UNIT_TRANSLATIONS = {
  "баллов": "points",
  "оценка": "grade",
}

export function translateUnitLabel(label, language) {
  if (language !== "en") return label
  return UNIT_TRANSLATIONS[label] ?? label
}
