import { Clock, CheckCircle2, Flame, type LucideIcon } from "lucide-react"

type Badge = {
  icon: LucideIcon
  label: string
  colorClass: string
}

const badges: Badge[] = [
  {
    icon: Clock,
    label: "Вовремя сдал ДЗ",
    colorClass: "bg-chart-2/15 text-chart-2",
  },
  {
    icon: CheckCircle2,
    label: "Без ошибок",
    colorClass: "bg-chart-3/15 text-chart-3",
  },
  {
    icon: Flame,
    label: "5 дней подряд",
    colorClass: "bg-chart-5/15 text-chart-5",
  },
]

export function Achievements() {
  return (
    <section aria-labelledby="achievements-title">
      <h2 id="achievements-title" className="mb-3 text-lg font-extrabold text-foreground">
        Достижения
      </h2>
      <ul className="grid grid-cols-3 gap-3">
        {badges.map((badge) => {
          const Icon = badge.icon
          return (
            <li
              key={badge.label}
              className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4 text-center shadow-sm"
            >
              <span
                className={`flex h-12 w-12 items-center justify-center rounded-2xl ${badge.colorClass}`}
              >
                <Icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <span className="text-xs font-semibold leading-tight text-card-foreground text-balance">
                {badge.label}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
