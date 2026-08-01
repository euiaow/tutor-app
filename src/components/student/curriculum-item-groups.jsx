import { RotateCcw } from "lucide-react"
import { TruncatedList } from "@/components/truncated-list"

function toJsDate(value) {
  return value?.toDate?.() ?? value ?? null
}

function formatShortDate(value) {
  const date = toJsDate(value)
  if (!date) return ""
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })
}

// Пройдено/Осталось split for a topics or prototypes list — stacked
// vertically (divider between), "к повторению" marker, truncate-3 +
// "Показать все". Shared between StudentDashboard.jsx's own
// CurriculumProgressCard (the student's full program) and ExamRadar's
// expanded state (Phase 3 — same rendering, just a filtered
// requiredTopics/requiredPrototypes subset as input instead of the whole
// program), so this logic lives in one place instead of being duplicated
// across the two page/component files that need it.
export function CurriculumItemGroups({ title, icon: Icon, covered, remaining }) {
  const total = covered.length + remaining.length

  return (
    <section className="glass-inset rounded-3xl p-5">
      <div className="flex items-center gap-2.5">
        <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
        <p className="font-display text-[0.7rem] font-medium">{title}</p>
        <span className="ml-auto text-sm">
          <b className="font-display">{covered.length}</b>
          <span className="text-muted-foreground"> / {total}</span>
        </span>
      </div>

      {covered.length > 0 ? (
        <div className="mt-4">
          <p className="mb-2.5 text-xs text-muted-foreground">Пройдено · {covered.length}</p>
          <TruncatedList
            items={covered}
            emptyLabel={null}
            className="space-y-1.5"
            renderItem={(item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 text-sm text-secondary-foreground"
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  {item.needsReview ? (
                    <RotateCcw className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                  ) : null}
                  <span className={`truncate ${item.needsReview ? "text-primary" : ""}`}>{item.title}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatShortDate(item.coveredAt)}</span>
              </li>
            )}
          />
        </div>
      ) : null}

      {remaining.length > 0 ? (
        <div className={covered.length > 0 ? "mt-5 border-t border-white/50 pt-4" : "mt-4"}>
          <p className="mb-2.5 text-xs text-muted-foreground">Осталось · {remaining.length}</p>
          <TruncatedList
            items={remaining}
            emptyLabel={null}
            className="space-y-1.5"
            renderItem={(item) => (
              <li key={item.id} className="truncate text-sm text-muted-foreground">
                {item.title}
              </li>
            )}
          />
        </div>
      ) : (
        <p className="mt-5 border-t border-white/50 pt-4 text-xs text-muted-foreground">Все темы пройдены 🎉</p>
      )}
    </section>
  )
}
