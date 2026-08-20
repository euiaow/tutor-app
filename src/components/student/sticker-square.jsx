import { cn } from "@/lib/utils"
import { stickerColorClass } from "@/lib/stickerColors"

// The one shared "sticker visual" primitive — renders imageUrl when one
// exists (real pixel art, added later) and falls back to a colored square
// with the sticker's name until then. Every place that shows a sticker
// (case reveal, inventory grid, opening animation reel, decoration zones)
// renders through this so swapping in real art later is a one-file change.
export function StickerSquare({ sticker, size = "md", className = "" }) {
  const sizeClass = size === "sm" ? "size-12 text-[9px]" : size === "lg" ? "size-24 text-sm" : "size-16 text-[11px]"

  if (sticker?.imageUrl) {
    return (
      <img
        src={sticker.imageUrl}
        alt={sticker.name ?? ""}
        className={cn(sizeClass, "rounded-xl object-cover", className)}
      />
    )
  }

  return (
    <div
      className={cn(
        sizeClass,
        "flex items-center justify-center rounded-xl p-1 text-center font-semibold leading-tight",
        stickerColorClass(sticker?.rarity),
        className,
      )}
    >
      {sticker?.name || "?"}
    </div>
  )
}
