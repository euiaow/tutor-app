import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useGamification } from "@/lib/gamification-context"
import { StickerWorkshopModal } from "@/components/student/sticker-workshop-modal"

// The one entry point into the arcade-styled sticker workshop (see
// sticker-workshop-modal.jsx) — replaces the old inline cases/collection
// section and the 3 dashed "+" placeholder zones that used to sit directly
// on the dashboard. Everything (cases, opening, collection, placement) now
// lives inside the fullscreen modal this button opens.
export function StickerWorkshopButton({ studentId, coinsBalance }) {
  const { t } = useTranslation("student")
  const [open, setOpen] = useState(false)
  const gamification = useGamification()

  if (!gamification) return null
  const { inventory, decoration, stickerSets } = gamification

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="glass-soft flex w-full items-center justify-between rounded-4xl p-5 text-left transition hover:bg-white/60"
      >
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary/40 to-primary/10 text-xl">
            🎰
          </span>
          <div>
            <p className="font-display text-sm text-foreground">{t("gamification.portalTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("gamification.portalHint")}</p>
          </div>
        </div>
        <span className="glass-inset inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold text-foreground">
          {coinsBalance} 🪙
        </span>
      </button>

      <StickerWorkshopModal
        open={open}
        onOpenChange={setOpen}
        studentId={studentId}
        coinsBalance={coinsBalance}
        stickerSets={stickerSets}
        inventory={inventory}
        decoration={decoration}
      />
    </>
  )
}
