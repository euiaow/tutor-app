import i18next from "i18next"
import { initReactI18next, useTranslation } from "react-i18next"
import ruStudent from "@/locales/ru/student.json"
import enStudent from "@/locales/en/student.json"

// A dedicated i18next instance for the student-facing dashboard only — not
// the global i18next singleton, so nothing here can ever leak into (or be
// affected by) the teacher panel, which has no i18n dependency at all.
// Language comes from students/{id}.language (Firestore), never a user-
// facing toggle at this stage — see StudentDashboard.jsx's StudentI18nGate.
export const studentI18n = i18next.createInstance()

studentI18n.use(initReactI18next).init({
  resources: {
    ru: { student: ruStudent },
    en: { student: enStudent },
  },
  lng: "ru",
  fallbackLng: "ru",
  ns: ["student"],
  defaultNS: "student",
  interpolation: { escapeValue: false },
  returnEmptyString: false,
})

// "en" -> "en-US" / "ru" -> "ru-RU" for Intl.DateTimeFormat-based helpers
// (formatLessonDateTime, formatRelativeTime) that take an explicit BCP-47
// locale rather than reading the current i18next language themselves.
export function useDateLocale() {
  const { i18n } = useTranslation("student", { i18n: studentI18n })
  return i18n.language === "en" ? "en-US" : "ru-RU"
}
