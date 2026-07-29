import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { X } from 'lucide-react'

import { cn } from '@/lib/utils'

// Same Base UI Dialog primitive as components/ui/dialog.jsx (outside-click/
// Escape/close-button behavior for free), just anchored to the right edge
// and sliding in horizontally instead of a centered scale-fade — used for
// the notifications panel.
function Sheet(props) {
  return <DialogPrimitive.Root {...props} />
}

function SheetClose(props) {
  return <DialogPrimitive.Close {...props} />
}

function SheetContent({ className, children, ...props }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-foreground/40 transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
      <DialogPrimitive.Popup
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex h-full w-[calc(100%-2rem)] max-w-sm flex-col overflow-hidden border-l border-border bg-card p-6 shadow-xl shadow-primary/5 outline-none transition-transform data-[ending-style]:translate-x-full data-[starting-style]:translate-x-full",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className="absolute right-5 top-5 flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          aria-label="Закрыть"
        >
          <X className="size-4" aria-hidden="true" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  )
}

function SheetTitle({ className, ...props }) {
  return (
    <DialogPrimitive.Title
      className={cn("pr-8 text-xl font-extrabold tracking-tight text-foreground text-balance", className)}
      {...props}
    />
  )
}

export { Sheet, SheetClose, SheetContent, SheetTitle }
