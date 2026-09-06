import { useGamification } from "@/lib/gamification-context"
import { stickerPlaceholderColor } from "@/lib/stickerColors"

// A fixed tilt per zone (not per sticker, not random-per-render) — gives the
// "carelessly stuck on" look the reference design asks for while staying
// stable across re-renders. Each zone gets its own angle in the -10..+10deg
// range so 5 stickers on the same page don't all lean the same way.
const ZONE_ROTATION_DEG = {
  zone1: 3,
  zone2: -5,
  zone3: 2,
  zone4: -4,
  zone5: 5,
}

// Renders whatever sticker (if any) a student has placed into `zone` back
// onto the live dashboard. Reads decoration/inventory off the same
// GamificationProvider the sticker-workshop modal uses — decoration only
// ever stores an inventory doc id per zone (see firebase/gamification.js),
// so the actual sticker image/name/rarity has to be resolved via inventory.
// `className` carries all positioning (absolute + offsets) — the parent is
// expected to be `position: relative` so this renders relative to it, not
// the page, and therefore reflows naturally with that card.
export function DecorationZone({ zone, className = "" }) {
  const gamification = useGamification()
  // Sticker Workshop is hidden from the deployed site until it's finished —
  // see StickerWorkshopButton for the matching gate. Remove both when the
  // feature ships for real.
  if (!import.meta.env.DEV) return null
  const itemId = gamification?.decoration?.[zone]
  const item = itemId ? gamification.inventory.find((entry) => entry.id === itemId) : null
  if (!item) return null

  const rotation = ZONE_ROTATION_DEG[zone] ?? 0
  const placeholder = item.imageUrl ? null : stickerPlaceholderColor(item.id ?? item.name)

  return (
    <div
      aria-hidden="true"
      className={`decoration-sticker pointer-events-none absolute z-10 ${className}`}
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      <div
        className="overflow-hidden rounded-[10px] border-2 border-white"
        style={{ boxShadow: "0 6px 18px rgba(0,0,0,0.2)" }}
      >
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt=""
            className="block h-auto w-auto"
            style={{ maxWidth: "var(--sticker-max)", maxHeight: "var(--sticker-max)" }}
          />
        ) : (
          <div
            className="grid aspect-square place-items-center px-1.5 text-center text-[10px] font-semibold leading-tight"
            style={{ width: "var(--sticker-max)", background: placeholder.background, color: placeholder.textColor }}
          >
            {item.name}
          </div>
        )}
      </div>
    </div>
  )
}
