import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useGamification } from "@/lib/gamification-context"
import { StickerWorkshopModal } from "@/components/student/sticker-workshop-modal"
import group69 from "@/assets/gamification/group-69.png"
import group70 from "@/assets/gamification/group-70.png"

// Desktop keeps the original "Group 69" art untouched (session 32 reverted
// an earlier swap to Group 70 there — the user only ever wanted the
// narrower crop on mobile, desktop was fine as it was). Both images are
// pinned to the button's right edge, sized off the button's own real
// rendered height (via ResizeObserver, not a CSS percentage — see below)
// rather than a fixed pixel size, so they stay pixel-fitted across text
// reflow instead of a one-off number tied to a single viewport.
// GROUP_69_HEIGHT_OFFSET/RIGHT_OFFSET are fine-tuning deltas dialed in by
// eye against the real deployed page — Group 70 (mobile-only) reuses the
// same base height offset plus a shorter delta, per explicit request, same
// top alignment. The two images' right offsets used to be one shared
// constant (sessions 32-34 nudged them together); session 35 diverged them
// — desktop and mobile now get independent per-pixel nudges instead.
const GROUP_69_HEIGHT_OFFSET = 12
const GROUP_69_RIGHT_OFFSET = -4
const GROUP_70_RIGHT_OFFSET = -4
const GROUP_70_HEIGHT_DELTA = -10

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
          className="pointer-events-none absolute top-0 hidden w-auto shrink-0 sm:block"
          style={{
            right: GROUP_69_RIGHT_OFFSET,
            ...(buttonHeight ? { height: buttonHeight + GROUP_69_HEIGHT_OFFSET } : null),
          }}
        />
        <img
          src={group70}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute top-0 block w-auto shrink-0 sm:hidden"
          style={{
            right: GROUP_70_RIGHT_OFFSET,
            ...(buttonHeight ? { height: buttonHeight + GROUP_69_HEIGHT_OFFSET + GROUP_70_HEIGHT_DELTA } : null),
          }}
        />
        <div className="relative z-10 flex min-w-0 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary/40 to-primary/10 text-xl">
            🎰
          </span>
          <div className="flex min-w-0 flex-col gap-1.5">
            {/* Desktop: full title + balance badge on one line, unchanged. */}
            <div className="hidden min-w-0 items-center gap-2 sm:flex">
              <p className="font-display truncate text-sm text-foreground">{t("gamification.portalTitle")}</p>
              <span className="glass-tile inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold text-foreground">
                {coinsBalance} 🪙
              </span>
            </div>
            {/* Mobile: shortened title ("Стикеры", not "Стикеры и кейсы"),
                balance badge dropped to its own line underneath instead of
                squeezed onto the title's line. */}
            <div className="flex min-w-0 flex-col items-start gap-1.5 sm:hidden">
              <p className="font-display truncate text-sm text-foreground">{t("gamification.portalTitleShort")}</p>
              <span className="glass-tile inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold text-foreground">
                {coinsBalance} 🪙
              </span>
            </div>
            {/* Hidden on mobile only (session 29) — the title/badge split
                above frees the space this used to compete for. */}
            <p className="hidden text-xs text-muted-foreground sm:block">{t("gamification.portalHint")}</p>
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
