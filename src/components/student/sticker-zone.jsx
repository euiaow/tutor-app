import { Plus } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { useGamification } from "@/lib/gamification-context"
import { StickerSquare } from "@/components/student/sticker-square"

// One of the 3 fixed placement spots (task spec: "у аватара, в карточке
// прогресса, в нижнем баннере") — each renders this same component with a
// different `zone` id ("zone1"/"zone2"/"zone3") at its own physical spot in
// StudentDashboard.jsx, all reading/writing through the shared
// GamificationProvider so placing a sticker from any one of them is
// immediately consistent everywhere. Empty slot = dashed "+" placeholder;
// filled slot = the sticker square. While something is armed (picked up
// from the inventory grid), every zone pulses to show it's a valid drop
// target — tap-then-tap, not drag-and-drop, for touch screens.
export function StickerZone({ zone, size = "md", className = "" }) {
  const { t } = useTranslation("student")
  const gamification = useGamification()
  if (!gamification) return null

  const { decoration, inventory, armedItemId, placeInZone } = gamification
  const itemId = decoration[zone]
  const item = itemId ? inventory.find((entry) => entry.id === itemId) : null
  const isArmedTarget = Boolean(armedItemId)

  return (
    <button
      type="button"
      onClick={() => placeInZone(zone)}
      title={item ? t("gamification.zoneRemoveTitle", { name: item.name }) : t("gamification.zonePlaceTitle")}
      className={cn(
        "relative rounded-xl transition",
        isArmedTarget && "animate-pulse ring-2 ring-primary ring-offset-2 ring-offset-background",
        className,
      )}
    >
      {item ? (
        <StickerSquare sticker={item} size={size} />
      ) : (
        <div
          className={cn(
            size === "sm" ? "size-12" : size === "lg" ? "size-24" : "size-16",
            "flex items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/30 text-muted-foreground/50",
          )}
        >
          <Plus className="size-4" aria-hidden="true" />
        </div>
      )}
    </button>
  )
}
