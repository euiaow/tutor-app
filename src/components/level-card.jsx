import { Sparkles } from "lucide-react"

export function LevelCard({ level = 1, xp = 0, compact = false }) {
  const progress = xp

  return (
    <section
      aria-labelledby="level-title"
      className={`h-full rounded-3xl border border-border bg-card shadow-sm ${compact ? "p-5" : "p-6"}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className={`flex items-center justify-center rounded-2xl bg-accent text-accent-foreground ${
              compact ? "h-9 w-9" : "h-11 w-11"
            }`}
          >
            <Sparkles className={compact ? "h-5 w-5" : "h-6 w-6"} aria-hidden="true" />
          </span>
          <div>
            <p className="whitespace-nowrap text-sm font-medium text-muted-foreground">Твой уровень</p>
            <h2
              id="level-title"
              className={`font-extrabold text-card-foreground ${compact ? "text-xl" : "text-2xl"}`}
            >
              {level}
            </h2>
          </div>
        </div>
        <span
          className={`rounded-full bg-secondary font-bold text-secondary-foreground ${
            compact ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm"
          }`}
        >
          {progress}%
        </span>
      </div>

      <div className={compact ? "mt-4" : "mt-5"}>
        <div
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Прогресс до ${level + 1} уровня: ${progress}%`}
          className={`w-full overflow-hidden rounded-full bg-secondary ${compact ? "h-3" : "h-4"}`}
        >
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-2 text-xs font-medium text-muted-foreground">
          До {level + 1} уровня — {100 - progress} XP
        </p>
      </div>
    </section>
  )
}
