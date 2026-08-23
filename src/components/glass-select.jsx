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
// `glass-tile` (not `glass-inset`, which has no `backdrop-filter` at all —
// see index.css — and reads as flat white instead of glass on a real
// surface like this trigger) matches the blurred-glass look every other
// student-page control uses.
const glassSelectTriggerCls =
  "glass-tile flex h-11 w-full items-center justify-between gap-2 rounded-2xl px-3.5 text-left text-sm font-medium text-foreground outline-none transition-all disabled:opacity-50"

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
              "glass-panel w-[var(--anchor-width)] max-h-72 overflow-y-auto scrollbar-hidden rounded-[1.25rem] p-1.5 outline-none transition-all data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
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
                    "truncate rounded-[0.9rem] px-2.5 py-1.5 text-left text-sm transition hover:bg-white/60",
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
