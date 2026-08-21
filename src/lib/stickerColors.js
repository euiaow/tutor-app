// Rarity drives a sticker's placeholder color/glow until real pixel art
// exists (imageUrl stays "" on every sticker until then — see
// functions/core/gamification.js) — a small fixed palette, not the
// subject-hash approach in lib/subjects.js, since rarity is a closed, known
// set of tiers, not free-form user text.
const RARITY_LABELS = {
  ru: {
    common: "Обычный",
    rare: "Редкий",
    epic: "Эпический",
    legendary: "Легендарный",
  },
  en: {
    common: "Common",
    rare: "Rare",
    epic: "Epic",
    legendary: "Legendary",
  },
}

// `lang` defaults to "ru" (unchanged behavior for any caller that doesn't
// pass it) — this module is only ever used from student-facing components,
// so there's no teacher-side call site to worry about, but the default is
// kept anyway for the same "explicit param, safe default" shape used by
// formatLessonDateTime/formatRelativeTime.
export function stickerRarityLabel(rarity, lang = "ru") {
  const labels = RARITY_LABELS[lang] ?? RARITY_LABELS.ru
  return labels[rarity] ?? rarity ?? ""
}

// Hex colors (not Tailwind classes) for the arcade sticker-workshop modal,
// which draws its own borders/glows via inline styles rather than Tailwind
// utility classes — kept here rather than duplicated in the modal component
// so rarity's visual identity has one source of truth across both UIs.
const RARITY_HEX = {
  common: "#ffffff",
  rare: "#2f9bff",
  epic: "#a970ff",
  legendary: "#ffc400",
}

const RARITY_GLOW = {
  common: "",
  rare: ",0 0 12px rgba(47,155,255,.55),0 0 22px rgba(47,155,255,.28)",
  epic: ",0 0 16px rgba(169,112,255,.6),0 0 30px rgba(169,112,255,.32)",
  legendary: ",0 0 22px rgba(255,196,0,.95),0 0 48px rgba(255,196,0,.6),0 0 84px rgba(255,196,0,.35)",
}

export function stickerRarityHex(rarity) {
  return RARITY_HEX[rarity] ?? RARITY_HEX.common
}

export function stickerRarityGlow(rarity) {
  return RARITY_GLOW[rarity] ?? ""
}

// Deterministic placeholder color for a sticker with no imageUrl yet — same
// djb2-hash-over-a-fixed-palette shape as the sticker-workshop modal's own
// hashColor/ink (kept separate rather than imported from there, since that
// palette is scoped to the modal's arcade visual language; duplicated here
// on purpose so the live-dashboard decoration zones don't need to reach into
// that unrelated component's internals for an unexported helper).
const PLACEHOLDER_SWATCHES = ["#ffd9ec", "#ffffff", "#ffe800", "#00e5ff", "#7cf03d", "#111111", "#ff2e9a", "#ff8ec7"]
const PLACEHOLDER_DARK = new Set(["#111111", "#ff2e9a"])

export function stickerPlaceholderColor(key) {
  const str = String(key ?? "")
  let hash = 5381
  for (let i = 0; i < str.length; i++) hash = (hash * 33) ^ str.charCodeAt(i)
  const background = PLACEHOLDER_SWATCHES[Math.abs(hash) % PLACEHOLDER_SWATCHES.length]
  return { background, textColor: PLACEHOLDER_DARK.has(background) ? "#ffffff" : "#111111" }
}
