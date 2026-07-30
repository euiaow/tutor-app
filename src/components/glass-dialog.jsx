import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

// Shared "grey-glass" modal look for the student page — CancelLessonDialog,
// RescheduleDialog, "Все уведомления" and "Все материалы" all render
// through this instead of each hand-copying the same className string.
// Not used by anything teacher-facing (that side of the app still renders
// through plain ui/dialog.jsx, unchanged).
export { Dialog as GlassDialog }

export function GlassDialogContent({ className, ...props }) {
  return (
    <DialogContent
      className={cn(
        "rounded-4xl border-white/50 bg-white/50 p-6 shadow-[var(--shadow-glass)] backdrop-blur-2xl sm:p-8",
        className,
      )}
      {...props}
    />
  )
}

export function GlassDialogTitle({ className, ...props }) {
  return <DialogTitle className={cn("font-display", className)} {...props} />
}

export { DialogDescription as GlassDialogDescription }
