// Student page background. Reads the current theme's own --theme-bg-image
// (set per-theme by applyThemeRegistry, see src/lib/themes.js's
// backgroundImage field and index.css's `.themed` derivation block) so the
// photo actually changes when the student switches theme — rendering
// inside a `.themed` ancestor (StudentDashboard.jsx's themed root div) is
// what makes that CSS var resolve here. The url('/bg/gr21.jpg') fallback
// only kicks in where no `.themed` ancestor exists at all (LoginScreen,
// rendered before the student's own colorTheme is even loaded) — every
// real theme in the registry sets its own --theme-bg-image explicitly
// (never left unset), so this fallback never overrides a deliberate "no
// image" theme choice once the student's real theme is known.
export function StudentGrainBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 overflow-hidden bg-cover bg-center"
      style={{ backgroundImage: "var(--theme-bg-image, url('/bg/gr21.jpg'))" }}
    ></div>
  )
}
