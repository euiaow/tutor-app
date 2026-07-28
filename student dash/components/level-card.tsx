import { Sparkles } from "lucide-react"

export function LevelCard() {
  const progress = 70

  return (
    <section
      aria-labelledby="level-title"
      className="rounded-3xl border border-border bg-card p-6 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
            <Sparkles className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Твой уровень</p>
            <h2 id="level-title" className="text-2xl font-extrabold text-card-foreground">
              3
            </h2>
          </div>
        </div>
        <span className="rounded-full bg-secondary px-3 py-1 text-sm font-bold text-secondary-foreground">
          {progress}%
        </span>
      </div>

      <div className="mt-5">
        <div
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Прогресс до 4 уровня: ${progress}%`}
          className="h-4 w-full overflow-hidden rounded-full bg-secondary"
        >
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-2 text-xs font-medium text-muted-foreground">
          До 4 уровня осталось 30 XP
        </p>
      </div>
    </section>
  )
}
