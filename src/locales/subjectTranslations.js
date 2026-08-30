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

// Dative-case ("по чему?") forms for the fixed STATIC_SUBJECTS list only —
// same "static list only, teacher's own custom text is never machine-
// transformed" boundary translateSubject above already draws. Used for the
// "До ЕГЭ по {{subject}}" radar title, which otherwise reads as bad Russian
// grammar in the nominative case a raw subject/program name is stored in.
const SUBJECT_DATIVE = {
  "Русский язык": "Русскому языку",
  "Литература": "Литературе",
  "Математика": "Математике",
  "Английский язык": "Английскому языку",
  "Немецкий язык": "Немецкому языку",
  "Китайский язык": "Китайскому языку",
  "Физика": "Физике",
  "Химия": "Химии",
  "Биология": "Биологии",
  "Информатика": "Информатике",
}

// Formats a subject/program name for the "по ..." slot in the radar title.
// A recognized standard subject gets declined to dative case; anything else
// (a teacher's own custom subject, or — more often here, since this is
// mostly fed a program's own name — a free-form template name like "ЕГЭ база
// 2026") is left in the nominative and wrapped in quotes instead, since it
// can't be grammatically declined without guessing.
export function formatSubjectForRadarTitle(name, language) {
  if (!name) return name
  if (language === "en") return translateSubject(name, language)
  return SUBJECT_DATIVE[name] ?? `«${name}»`
}
