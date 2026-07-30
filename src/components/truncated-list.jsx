import { useState } from "react"

// Reusable "show the first N, reveal the rest in place" pattern — used by
// both StudentDashboard's progress card and the teacher's expanded
// student-row detail view for the same four lists (covered/remaining
// topics, covered/remaining prototypes), so the show/hide logic lives in
// one place instead of four near-identical copies. Expands in place, not a
// modal — these lists already live inside an already-expanded block.
export function TruncatedList({ items, limit = 3, renderItem, emptyLabel = null, className = "flex flex-col gap-1" }) {
  const [expanded, setExpanded] = useState(false)

  if (items.length === 0) {
    return emptyLabel ? <p className="text-sm text-muted-foreground">{emptyLabel}</p> : null
  }

  const visibleItems = expanded ? items : items.slice(0, limit)
  const hasMore = items.length > limit

  return (
    <>
      <ul className={className}>{visibleItems.map(renderItem)}</ul>

      {hasMore ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-1 self-start text-sm font-semibold text-primary hover:underline"
        >
          {expanded ? "Свернуть" : `Показать все (${items.length})`}
        </button>
      ) : null}
    </>
  )
}
