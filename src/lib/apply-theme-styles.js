import { THEME_REGISTRY } from "./themes"

let injected = false

// Turns THEME_REGISTRY into real CSS: one rule per theme, setting only the 5
// raw values a theme author supplies (see themes.js's field doc comment).
// Everything else a themed screen actually renders with (--card, --border,
// --shadow-*, --gradient-*, chart colors, decorative blobs, ...) is derived
// from these via color-mix()/oklch(from ...) in index.css's shared `.themed`
// rule — so this function, and the registry it reads, are the *only* things
// that need to change to add a theme. Runs once per page load, before React
// mounts (see main.jsx), so there's never a flash of unstyled/undefined
// theme vars on first paint.
export function applyThemeRegistry() {
  if (injected) return
  injected = true

  const css = THEME_REGISTRY.map((theme) => {
    const bgImage = theme.backgroundImage ? `url("${theme.backgroundImage}")` : "none"
    return `.${theme.cssClassName} {
  --radius: ${theme.radius};
  --accent-color: ${theme.accent};
  --heading-color: ${theme.heading};
  --subheading-color: ${theme.subheading};
  --text-color: ${theme.text};
  --theme-bg-image: ${bgImage};
}`
  }).join("\n")

  const style = document.createElement("style")
  style.id = "theme-registry-styles"
  style.textContent = css
  document.head.appendChild(style)
}
