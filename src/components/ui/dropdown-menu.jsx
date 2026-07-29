import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import { cn } from "@/lib/utils"

function DropdownMenu(props) {
  return <MenuPrimitive.Root {...props} />
}

function DropdownMenuTrigger(props) {
  return <MenuPrimitive.Trigger {...props} />
}

function DropdownMenuContent({ className, children, align = "end", ...props }) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner align={align} sideOffset={6}>
        <MenuPrimitive.Popup
          className={cn(
            "z-50 min-w-40 overflow-hidden rounded-xl border border-border bg-card p-1 shadow-lg outline-none data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
            className,
          )}
          {...props}
        >
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

function DropdownMenuItem({ className, ...props }) {
  return (
    <MenuPrimitive.Item
      className={cn(
        "flex cursor-pointer items-center rounded-lg px-3 py-2 text-sm font-medium text-foreground outline-none transition-colors data-[highlighted]:bg-muted",
        className,
      )}
      {...props}
    />
  )
}

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem }
