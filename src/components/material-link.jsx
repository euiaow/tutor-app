import { Paperclip } from "lucide-react"

export function MaterialLink({ material }) {
  return (
    <a
      href={material.url}
      target="_blank"
      rel="noopener noreferrer"
      className="glass-inset flex items-center gap-2.5 rounded-2xl px-4 py-3 text-sm text-secondary-foreground transition-colors hover:bg-white/70"
    >
      <Paperclip className="size-4 shrink-0 opacity-60" aria-hidden="true" />
      <span className="truncate">{material.title}</span>
    </a>
  )
}
