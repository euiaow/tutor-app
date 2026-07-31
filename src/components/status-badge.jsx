// Same pastel-fill + matching-tone-text pill language as StudentTags'
// TAG_STYLES (ЕГЭ/Рус. tags) — generalized so attendance/rating/etc.
// badges don't each hand-roll their own className, and any future badge
// can just pick one of these five semantic variants.
const VARIANT_CLASSES = {
  success: "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",
  warning: "bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400",
  danger: "bg-destructive/10 text-destructive dark:bg-destructive/20",
  primary: "bg-primary/15 text-primary dark:bg-primary/20",
  neutral: "bg-muted text-muted-foreground",
}

export function StatusBadge({ variant = "neutral", className = "", children }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {children}
    </span>
  )
}
