// Single source of truth for every color theme either dashboard can offer —
// same registry, same shape, for teacher and student (per explicit
// decision: one theme system for both roles, not two). Adding a theme is a
// pure data change here (plus, optionally, dropping an image file in
// src/assets/themes/ and importing it below) — nothing in index.css needs
// editing. See applyThemeRegistry() (apply-theme-styles.js) for how these 5
// author-facing fields (backgroundImage/accent/heading/subheading/text)
// turn into every actual CSS custom property (--card, --border, --shadow-*,
// --gradient-*, etc.) a themed screen reads: that derivation lives once, in
// index.css's shared `.themed` rule, driven entirely by the raw values a
// theme declares here.
//
// Field meaning:
// - id: stored verbatim in teachers/{uid}.colorTheme / students/{id}.colorTheme.
// - cssClassName: the class name applied to a themed root/portal alongside
//   "themed" (see UserPrefsProvider/useThemeClass) — must be unique per
//   theme and must not collide with any other class used in the app.
// - radius: card/dialog corner radius for this theme (a purely cosmetic
//   per-theme knob, not derived from the 4 colors below).
// - backgroundImage: a public path string (e.g. "/bg/gr9.jpg" — anything
//   dropped in the repo's public/bg/ folder is served at that exact path,
//   no import needed) or null. null falls back to the existing soft
//   gradient wash — no image required to ship a theme.
// - accent: the one color that drives every "brand" surface — buttons,
//   focus rings, the header avatar gradient, card/glass tinting, decorative
//   blobs. Pick an oklch() (or any valid CSS color) with the vibrancy you
//   want the *whole* derived palette to inherit — the derivation intentionally
//   pulls its hue from this value everywhere.
// - heading: fixed color for titles/section headings (maps to --ink, used by
//   every SectionTitle/DialogTitle/h1 in theme-ui.jsx and friends).
// - subheading: fixed color for descriptions/secondary text (maps to
//   --muted-foreground, used by every DialogDescription/helper caption).
// - text: fixed color for regular body copy (maps to --foreground/--card-foreground).
export const THEME_REGISTRY = [
  {
    id: "pink",
    label: "Розовая",
    cssClassName: "teacher-theme",
    radius: "1.5rem",
    backgroundImage: null,
    accent: "oklch(0.66 0.185 5)",
    heading: "oklch(0.24 0.045 350)",
    subheading: "oklch(0.55 0.05 350)",
    text: "oklch(0.4 0.045 350)",
  },
  {
    id: "amber",
    label: "Оранжевая",
    cssClassName: "amber-scope",
    radius: "1.75rem",
    backgroundImage: "/bg/gr21.jpg",
    accent: "oklch(0.72 0.19 47)",
    heading: "oklch(0.26 0.02 60)",
    subheading: "oklch(0.52 0.02 60)",
    text: "oklch(0.35 0.02 60)",
  },
  {
    id: "blue",
    label: "Синяя",
    cssClassName: "blue-theme",
    radius: "1.75rem",
    backgroundImage: "/bg/gr13.jpg",
    accent: "oklch(0.572 0.2062 262.76)",
    heading: "oklch(0.26 0.02 60)",
    subheading: "oklch(0.52 0.02 60)",
    text: "oklch(0.35 0.02 60)",
  },
]

export const THEME_IDS = THEME_REGISTRY.map((theme) => theme.id)

const DEFAULT_THEME = THEME_REGISTRY[0]

export function getThemeById(id) {
  return THEME_REGISTRY.find((theme) => theme.id === id) ?? DEFAULT_THEME
}
