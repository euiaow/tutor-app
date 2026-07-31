import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

// Shared visual language for the rose/pink "teacher-theme" scope, ported
// from "redesign teacher v1" (rosy-reflections-main). Every piece here is
// meant to be used inside a `.teacher-theme` ancestor (TeacherDashboard's
// root) so the CSS custom-property overrides in index.css apply.

export function Tag({ children, tone = "muted", className = "" }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
        tone === "rose"
          ? "bg-primary/15 text-rose-deep"
          : "glass-tile text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  )
}

export function Avatar({ initials, className = "" }) {
  return (
    <div
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-primary-foreground",
        className,
      )}
      style={{ background: "var(--gradient-orb)", boxShadow: "var(--shadow-soft)" }}
    >
      {initials}
    </div>
  )
}

export function GhostBtn({ children, className = "", type = "button", ...props }) {
  return (
    <button
      type={type}
      className={cn(
        "glass-tile inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-foreground/80 transition hover:text-rose-deep disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function SolidBtn({ children, className = "", type = "button", ...props }) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      style={{ background: "var(--gradient-orb)", boxShadow: "var(--shadow-soft)" }}
      {...props}
    >
      {children}
    </button>
  )
}

export function Panel({ children, className = "" }) {
  return <section className={cn("glass-panel rounded-[2rem] p-6 md:p-7", className)}>{children}</section>
}

export function Title({ children, className = "" }) {
  return (
    <h2 className={cn("font-display text-xl tracking-tight text-ink md:text-2xl", className)}>{children}</h2>
  )
}

export function ProgressBar({ value }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 w-40 max-w-full overflow-hidden rounded-full bg-glass-strong">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: "var(--gradient-orb)" }}
        />
      </div>
      <span className="text-xs font-semibold text-muted-foreground">{value}%</span>
    </div>
  )
}

const TONE_COLOR = {
  amber: "var(--balance-warn)",
  green: "var(--balance-ok)",
  red: "var(--balance-danger)",
  rose: "var(--rose-deep)",
}

export function TeacherStatusBadge({ children, tone = "rose", className = "" }) {
  const color = TONE_COLOR[tone] ?? TONE_COLOR.rose
  return (
    <span
      className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", className)}
      style={{ color, borderColor: color, background: "color-mix(in oklab, currentColor 12%, transparent)" }}
    >
      {children}
    </span>
  )
}

export function TeacherDialog(props) {
  return <DialogPrimitive.Root {...props} />
}

export function TeacherDialogContent({ className, children, wide = false, ...props }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className="teacher-theme fixed inset-0 z-50 bg-ink/25 backdrop-blur-sm transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
      <DialogPrimitive.Popup
        className={cn(
          "teacher-theme glass-panel fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[2rem] p-6 outline-none transition-all data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 md:p-7",
          wide ? "max-w-2xl" : "max-w-lg",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className="absolute right-5 top-5 text-muted-foreground transition hover:text-rose-deep"
          aria-label="Закрыть"
        >
          <X className="size-4" aria-hidden="true" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  )
}

export function TeacherDialogTitle({ className, ...props }) {
  return (
    <DialogPrimitive.Title
      className={cn("pr-8 font-display text-xl tracking-tight text-ink", className)}
      {...props}
    />
  )
}

export function TeacherDialogDescription({ className, ...props }) {
  return (
    <DialogPrimitive.Description className={cn("mt-1 text-xs text-muted-foreground", className)} {...props} />
  )
}

export function Field({ label, children, className = "" }) {
  return (
    <label className={cn("block", className)}>
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  )
}

export const teacherInputCls =
  "glass-tile w-full rounded-full px-4 py-2.5 text-sm text-ink outline-none placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring disabled:opacity-50"

export const teacherTextareaCls =
  "glass-tile w-full rounded-[1.25rem] px-4 py-2.5 text-sm text-ink outline-none placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring disabled:opacity-50"

export function TeacherModalFooter({ children, className = "" }) {
  return <div className={cn("grid grid-cols-2 gap-3 pt-1", className)}>{children}</div>
}

export function TeacherCancelBtn({ children = "Отмена", className = "", ...props }) {
  return (
    <button
      type="button"
      className={cn(
        "glass-tile rounded-full px-4 py-2.5 text-sm font-semibold text-foreground/80 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function TeacherSaveBtn({ children = "Сохранить", className = "", ...props }) {
  return (
    <button
      type="button"
      className={cn(
        "rounded-full px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      style={{ background: "var(--gradient-orb)", boxShadow: "var(--shadow-soft)" }}
      {...props}
    >
      {children}
    </button>
  )
}
