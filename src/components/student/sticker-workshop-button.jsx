import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useGamification } from "@/lib/gamification-context"
import { StickerWorkshopModal } from "@/components/student/sticker-workshop-modal"
import group69 from "@/assets/gamification/group-69.png"

// Group 69 art is pinned to the button's right edge, sized off the button's
// own real rendered height (via ResizeObserver, not a CSS percentage — see
// below) rather than a fixed pixel size, so it stays pixel-fitted across
// screen widths/text reflow instead of a one-off number tied to a single
// viewport. GROUP_69_HEIGHT_OFFSET/RIGHT_OFFSET are the two fine-tuning
// deltas dialed in by eye against the real deployed page (a few px taller
// than the raw measured height, 1px past the edge) — confirmed as the
// correct fit and locked in here, not still-being-searched-for values.
const GROUP_69_HEIGHT_OFFSET = 12
const GROUP_69_RIGHT_OFFSET = -1

// The one entry point into the arcade-styled sticker workshop (see
// sticker-workshop-modal.jsx) — replaces the old inline cases/collection
// section and the 3 dashed "+" placeholder zones that used to sit directly
// on the dashboard. Everything (cases, opening, collection, placement) now
// lives inside the fullscreen modal this button opens.
export function StickerWorkshopButton({ studentId, coinsBalance }) {
  const { t } = useTranslation("student")
  const [open, setOpen] = useState(false)
  const gamification = useGamification()
  const buttonRef = useRef(null)
  const [buttonHeight, setButtonHeight] = useState(null)

  useEffect(() => {
    const el = buttonRef.current
    if (!el) return
    // ResizeObserver's own `contentRect` excludes padding (content-box
    // only) — this button has real padding, so contentRect alone under-
    // measures it. `getBoundingClientRect()` reports the actual border-box/
    // visual height instead, which is what the image needs to match.
    const observer = new ResizeObserver(() => {
      const height = el.getBoundingClientRect().height
      if (height) setButtonHeight(height)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  if (!gamification) return null
  const { inventory, decoration, stickerSets } = gamification

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(true)}
        className="glass-soft relative flex w-full items-center overflow-hidden rounded-4xl p-5 text-left transition hover:bg-white/60"
      >
        <img
          src={group69}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute top-0 w-auto shrink-0"
          style={{
            right: GROUP_69_RIGHT_OFFSET,
            ...(buttonHeight ? { height: buttonHeight + GROUP_69_HEIGHT_OFFSET } : null),
          }}
        />
        <div className="relative z-10 flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary/40 to-primary/10 text-xl">
            🎰
          </span>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <p className="font-display text-sm text-foreground">{t("gamification.portalTitle")}</p>
              <span className="glass-tile inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold text-foreground">
                {coinsBalance} 🪙
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{t("gamification.portalHint")}</p>
          </div>
        </div>
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
