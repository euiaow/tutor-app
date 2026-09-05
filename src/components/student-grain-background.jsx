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
//
// The "blue" theme is the one exception (deliberate, per-theme choice, not
// a general student-page treatment): it has no backgroundImage at all
// (src/lib/themes.js), and instead of falling back to the same plain
// gradient wash pink/amber use, it reuses the teacher panel's own
// blob-a/blob-b/grain-layer glow (TeacherDashboard.jsx's `bg-grain-blobs`
// markup, already accent-derived — see index.css's --blob-a-gradient/
// --blob-b-gradient) so a student on the blue theme sees the same
// background their teacher does. Pink/amber are untouched by this branch.
//
// Both branches must share the plain photo variant's own `-z-10` — two
// instances of this component are always mounted at once (StudentDashboard's
// outer pre-theme-knowledge placeholder, always the photo variant since
// colorTheme isn't known there yet, plus this file's own themed instance
// once it is), and .bg-grain-blobs already carries `z-index: -10` itself.
// Without a matching z-index on the photo variant, the untamed
// (effectively z-index: 0) outer placeholder would sit above the blob
// variant's z-index: -10 and permanently hide it, regardless of theme —
// the exact bug this comment is here to prevent regressing.
export function StudentGrainBackground({ themeId } = {}) {
  if (themeId === "blue") {
    // bg-white is deliberate and load-bearing, not decorative — it's an
    // opaque full-viewport base underneath the two blobs, so this layer can
    // never let anything behind it (the pre-theme-knowledge photo
    // placeholder, body:has(.themed)'s own background-image layer, or
    // anything else) show through, regardless of z-index/inheritance
    // subtleties elsewhere. Explicit white per the product decision — this
    // theme's background is "white + two accent-tinted blobs", not a tinted
    // wash.
    return (
      <div aria-hidden="true" className="bg-grain-blobs bg-white">
        <div className="blob-a" />
        <div className="blob-b" />
        <div className="grain-layer" />
      </div>
    )
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-cover bg-center"
      style={{ backgroundImage: "var(--theme-bg-image, url('/bg/gr21.jpg'))" }}
    ></div>
  )
}
