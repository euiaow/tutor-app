import { useState } from "react"
import { Lock, Paperclip } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { MaterialLink } from "@/components/material-link"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { formatLessonDateTime } from "@/lib/schedule"

const VISIBLE_COUNT = 3

export function MaterialsLibrary({ materials, loading = false, error = null }) {
  const [showAll, setShowAll] = useState(false)
  const visibleMaterials = materials.slice(0, VISIBLE_COUNT)
  const hasMore = materials.length > VISIBLE_COUNT

  return (
    <section
      aria-labelledby="materials-library-title"
      className="flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      <h2 id="materials-library-title" className="text-lg font-extrabold text-foreground">
        Материалы к урокам
      </h2>

      {loading ? (
        <Spinner label="Загрузка материалов..." className="py-6" />
      ) : error ? (
        <p className="mt-3 text-sm font-semibold text-destructive">{error}</p>
      ) : materials.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Материалов пока нет</p>
      ) : (
        <>
          <ul className="mt-3 flex flex-col gap-2">
            {visibleMaterials.map((material, index) => {
              const key = material.id ?? material.url ?? index

              if (material.isLocked) {
                return (
                  <li
                    key={key}
                    aria-disabled="true"
                    className="flex items-center gap-2.5 rounded-xl border border-border bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground opacity-60"
                  >
                    <Lock className="size-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{material.title}</span>
                  </li>
                )
              }

              return (
                <li key={key}>
                  <MaterialLink material={material} />
                </li>
              )
            })}
          </ul>

          {hasMore ? (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mt-3 self-start text-sm font-semibold text-primary hover:underline"
            >
              Показать все
            </button>
          ) : null}
        </>
      )}

      <Dialog open={showAll} onOpenChange={setShowAll}>
        <DialogContent className="max-w-md">
          <DialogTitle>Все материалы</DialogTitle>
          <DialogDescription>Файлы, прикреплённые к урокам</DialogDescription>

          <ul className="mt-6 flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
            {materials.map((material, index) => {
              const key = material.id ?? material.url ?? index

              if (material.isLocked) {
                return (
                  <li
                    key={key}
                    aria-disabled="true"
                    className="flex items-center gap-2.5 rounded-xl border border-border bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground opacity-60"
                  >
                    <Lock className="size-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{material.title}</span>
                  </li>
                )
              }

              return (
                <li
                  key={key}
                  className="flex flex-col gap-0.5 rounded-xl border border-border bg-muted px-3 py-2.5"
                >
                  <a
                    href={material.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-primary"
                  >
                    <Paperclip className="size-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="truncate">{material.title}</span>
                  </a>
                  {material.lessonDate ? (
                    <span className="text-xs text-muted-foreground">
                      {formatLessonDateTime(material.lessonDate)}
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </DialogContent>
      </Dialog>
    </section>
  )
}
