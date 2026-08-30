import { useRef, useState } from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { useThemeClass } from "@/lib/user-prefs-context"

// Designed replacement for a plain native <select>, for the student page's
// "grey-glass" surfaces — same shape/intent as TeacherSelect
// (components/teacher/theme-ui.jsx), ported rather than reused directly
// since that one is hardcoded to the teacher-theme's rose tokens/Popover
// wrapper and this needs the student page's own glass classes instead.
// A lighter, more transparent tint than glass-tile/glass-panel (both ~30-42%
// white) — per explicit feedback that Settings' dropdowns read as too
// opaque/white against the theme's own background photo. Keeps the blur
// (unlike glass-inset, which has none) so text stays legible over a busy
// background, just with much less white mixed in.
const glassSelectTriggerCls =
  "flex h-11 w-full items-center justify-between gap-2 rounded-2xl border border-white/25 bg-white/12 px-3.5 text-left text-sm font-medium text-foreground outline-none backdrop-blur-xl transition-all disabled:opacity-50"

export function GlassSelect({ value, onChange, options, placeholder = "Выбрать...", disabled, className = "" }) {
  const [open, setOpen] = useState(false)
  const popupRef = useRef(null)
  const themeClass = useThemeClass()
  const selected = options.find((option) => option.value === value)

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        disabled={disabled}
        className={cn(glassSelectTriggerCls, "disabled:cursor-not-allowed", className)}
      >
        <span className={cn("truncate", !selected ? "text-muted-foreground/70" : "")}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner align="start" sideOffset={6} className="z-[120]">
          <PopoverPrimitive.Popup
            ref={popupRef}
            initialFocus={popupRef}
            className={cn(
              themeClass,
              "w-[var(--anchor-width)] max-h-72 overflow-y-auto scrollbar-hidden rounded-[1.25rem] border border-white/25 bg-white/12 p-1.5 shadow-[var(--shadow-glass)] backdrop-blur-xl outline-none transition-all data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            )}
          >
            <div className="flex flex-col gap-0.5">
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                  className={cn(
                    "truncate rounded-[0.9rem] px-2.5 py-1.5 text-left text-sm transition hover:bg-white/25",
                    option.value === value ? "font-semibold text-primary" : "text-foreground",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
