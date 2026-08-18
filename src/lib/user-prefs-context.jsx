import { createContext, useContext } from "react"
import { getDeviceTimeZone } from "@/lib/timezone"

// Single shared context for the two per-user display preferences (timezone,
// color-theme scope class) that would otherwise need threading through many
// layers of components (lesson-history, finance-section, upcoming-lesson-
// card, student-row, homework-lesson-dialog, materials-library, every
// TeacherDialog/GlassDialog usage, ...). TeacherDashboard/StudentDashboard
// each mount one Provider near their root, already resolved from the
// signed-in user's own profile doc (see resolveTimeZone in lib/timezone.js);
// everything below just calls the hooks instead of receiving props.
const UserPrefsContext = createContext(null)

export function UserPrefsProvider({ timeZone, themeClass, children }) {
  return <UserPrefsContext.Provider value={{ timeZone, themeClass }}>{children}</UserPrefsContext.Provider>
}

// Falls back to the device's own timezone if used outside a Provider (should
// never happen in practice — both dashboards always mount one — but keeps
// this hook safe to call anywhere without crashing).
export function useTimeZone() {
  const ctx = useContext(UserPrefsContext)
  return ctx?.timeZone || getDeviceTimeZone()
}

// "" (no class) is the correct default outside a Provider: it means "render
// with the plain root-token palette", the same as before this feature
// existed.
export function useThemeClass() {
  const ctx = useContext(UserPrefsContext)
  return ctx?.themeClass || ""
}
