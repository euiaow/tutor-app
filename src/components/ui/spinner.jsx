import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

export function Spinner({ className, label = "Загрузка..." }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={cn("flex flex-col items-center justify-center gap-3 py-16", className)}
    >
      <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden="true" />
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
    </div>
  )
}
