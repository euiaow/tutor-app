import { useState } from "react"
import { ChevronRight, Lock, Paperclip } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { MaterialLink } from "@/components/material-link"
import {
  GlassDialog,
  GlassDialogContent,
  GlassDialogTitle,
  GlassDialogDescription,
} from "@/components/glass-dialog"
import { formatLessonDateTime } from "@/lib/schedule"

const VISIBLE_COUNT = 3

export function MaterialsLibrary({ materials, loading = false, error = null }) {
  const [showAll, setShowAll] = useState(false)
  const visibleMaterials = materials.slice(0, VISIBLE_COUNT)
  const hasMore = materials.length > VISIBLE_COUNT

  return (
    <section aria-labelledby="materials-library-title" className="glass-soft rounded-4xl p-6">
      <h2 id="materials-library-title" className="font-display text-lg text-foreground">
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
          <ul className="mt-4 flex flex-col gap-2.5">
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
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary"
            >
              Показать все
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </>
      )}

      <GlassDialog open={showAll} onOpenChange={setShowAll}>
        <GlassDialogContent className="max-w-md">
          <GlassDialogTitle>Все материалы</GlassDialogTitle>
          <GlassDialogDescription>Файлы, прикреплённые к урокам</GlassDialogDescription>

          <ul className="mt-6 flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
            {materials.map((material, index) => {
              const key = material.id ?? material.url ?? index

              if (material.isLocked) {
                return (
                  <li
                    key={key}
                    aria-disabled="true"
                    className="flex items-center gap-2.5 rounded-2xl border border-white/45 bg-white/25 px-3 py-2.5 text-sm text-muted-foreground opacity-60"
                  >
                    <Lock className="size-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{material.title}</span>
                  </li>
                )
              }

              return (
                <li key={key} className="glass-inset flex flex-col gap-0.5 rounded-2xl px-3 py-2.5">
                  <a
                    href={material.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-sm font-semibold text-secondary-foreground hover:text-primary"
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
        </GlassDialogContent>
      </GlassDialog>
    </section>
  )
}
