// Colored-square placeholders stand in for real pixel-art stickers until
// that art exists (imageUrl stays "" on every sticker until then — see
// functions/core/gamification.js). Rarity drives the placeholder color, a
// small fixed palette (not the subject-hash approach in lib/subjects.js —
// rarity is a closed, known set of tiers, not free-form user text).
const RARITY_STYLES = {
  common: "bg-slate-300 text-slate-700",
  rare: "bg-sky-400 text-sky-950",
  epic: "bg-violet-500 text-violet-50",
  legendary: "bg-amber-400 text-amber-950",
}

const DEFAULT_STYLE = "bg-slate-300 text-slate-700"

export function stickerColorClass(rarity) {
  return RARITY_STYLES[rarity] ?? DEFAULT_STYLE
}

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
