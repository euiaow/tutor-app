// Mirrors the theme ids declared in src/lib/themes.js's THEME_REGISTRY —
// Functions run as CommonJS/Node, the frontend registry is an ESM module
// with a Vite-bundled image import, so it can't be required directly here.
// The backend only ever needs to validate that a submitted colorTheme is a
// real, known id (see updateStudentSettings, core/students.js) — it never
// needs the theme's actual colors/background, those are purely a rendering
// concern on the frontend. Keep this Set's ids in sync by hand whenever
// THEME_REGISTRY gains or loses an entry.
const VALID_THEME_IDS = new Set(["pink", "amber", "blue"])

module.exports = { VALID_THEME_IDS }
