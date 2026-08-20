// English translations for the fixed STATIC_SUBJECTS list only
// (src/lib/subjects.js) — a teacher's own custom subject (typed free-form
// into teachers/{uid}/customSubjects) has no entry here and is left as-is
// by translateSubject below, on purpose: there is no way to machine-
// translate arbitrary teacher-authored text reliably, and showing it
// untranslated is less surprising than a wrong/garbled auto-translation.
const SUBJECT_TRANSLATIONS = {
  "Русский язык": "Russian",
  "Литература": "Literature",
  "Математика": "Mathematics",
  "Английский язык": "English",
  "Немецкий язык": "German",
  "Китайский язык": "Chinese",
  "Физика": "Physics",
  "Химия": "Chemistry",
  "Биология": "Biology",
  "Информатика": "Computer Science",
}

// `language` is the current studentI18n language ("ru"/"en") — only "en"
// ever triggers a lookup; any other value (including a missing/undefined
// one) returns `name` unchanged, same as a name with no dictionary entry.
export function translateSubject(name, language) {
  if (language !== "en") return name
  return SUBJECT_TRANSLATIONS[name] ?? name
}
