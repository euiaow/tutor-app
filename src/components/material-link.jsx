import { Paperclip } from "lucide-react"

export function MaterialLink({ material }) {
  return (
    <a
      href={material.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2.5 rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground transition-colors hover:border-primary hover:bg-secondary/40"
    >
      <Paperclip className="size-4 shrink-0 text-primary" aria-hidden="true" />
      <span className="truncate">{material.title}</span>
    </a>
  )
}
