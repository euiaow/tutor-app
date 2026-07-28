import { Lock } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { MaterialLink } from "@/components/material-link"

export function MaterialsLibrary({ materials, loading = false, error = null }) {
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
        <ul className="mt-3 flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
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
              <li key={key}>
                <MaterialLink material={material} />
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
