import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { StickerSquare } from "@/components/student/sticker-square"
import { GlassDialog, GlassDialogContent, GlassDialogTitle, GlassDialogDescription } from "@/components/glass-dialog"
import { cn } from "@/lib/utils"

const TILE_WIDTH = 84 // px, must match the w-[84px] class on each reel tile
const TILE_GAP = 12 // px, must match the gap-3 class on the reel track
const STEP = TILE_WIDTH + TILE_GAP
const REEL_LENGTH = 48 // total tiles rendered; the real result sits near the end
const WIN_INDEX = 40 // fixed position the winning tile always lands on

function randomFiller(stickers) {
  return stickers[Math.floor(Math.random() * stickers.length)]
}

// Fast → slow deceleration, matching the task spec's "быстро→медленно"
// requirement — a long duration with most of the distance covered in the
// first third reads as a spinning reel slamming to a stop, not a linear
// slide.
const REEL_EASING = "cubic-bezier(0.09, 0.86, 0.23, 1)"
const REEL_DURATION_MS = 4200

// `pull` is the already-resolved server result (openCase's return value) —
// the reel is built and pointed at it before any animation frame runs, so
// there is no client-side chance for the visual outcome to disagree with
// what the server actually granted (see the task's own "результат известен
// ДО начала анимации" requirement).
export function CaseOpeningAnimation({ open, onOpenChange, pull, setStickers }) {
  const { t } = useTranslation("student")
  const trackRef = useRef(null)
  const containerRef = useRef(null)
  const [phase, setPhase] = useState("spinning") // "spinning" | "revealed"

  const reel = useMemo(() => {
    if (!pull || setStickers.length === 0) return []
    const items = Array.from({ length: REEL_LENGTH }, () => randomFiller(setStickers))
    items[WIN_INDEX] = pull.sticker
    return items
  }, [pull, setStickers])

  useEffect(() => {
    if (!open) {
      setPhase("spinning")
      return
    }
    if (!trackRef.current || !containerRef.current || reel.length === 0) return

    // Start at rest (no transition), then apply the transform that lands on
    // WIN_INDEX on the next frame so the browser has a "before" state to
    // actually transition from.
    const containerWidth = containerRef.current.offsetWidth
    const targetOffset = WIN_INDEX * STEP + TILE_WIDTH / 2 - containerWidth / 2

    const track = trackRef.current
    track.style.transition = "none"
    track.style.transform = "translateX(0px)"

    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        track.style.transition = `transform ${REEL_DURATION_MS}ms ${REEL_EASING}`
        track.style.transform = `translateX(-${targetOffset}px)`
      })
    })

    const revealTimer = setTimeout(() => setPhase("revealed"), REEL_DURATION_MS + 150)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(revealTimer)
    }
  }, [open, reel])

  if (!pull) return null

  return (
    <GlassDialog open={open} onOpenChange={onOpenChange}>
      <GlassDialogContent className="max-w-xl">
        <GlassDialogTitle>{t("gamification.caseOpening.dialogTitle")}</GlassDialogTitle>
        <GlassDialogDescription>
          {phase === "spinning" ? t("gamification.caseOpening.spinning") : t("gamification.caseOpening.revealed")}
        </GlassDialogDescription>

        <div
          ref={containerRef}
          className="glass-inset relative mt-5 h-24 overflow-hidden rounded-2xl"
        >
          {/* Fixed center marker — the tile that ends up under this line is
              the actual result. */}
          <div className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-0.5 -translate-x-1/2 bg-primary" />

          <div
            ref={trackRef}
            className="absolute inset-y-0 left-0 flex items-center gap-3 pl-4"
            style={{ willChange: "transform" }}
          >
            {reel.map((sticker, index) => (
              <div key={index} className="w-[84px] shrink-0">
                <StickerSquare sticker={sticker} size="md" className="w-[84px]" />
              </div>
            ))}
          </div>
        </div>

        {phase === "revealed" ? (
          <div className="mt-5 flex flex-col items-center gap-2 text-center">
            <StickerSquare sticker={pull.sticker} size="lg" />
            <p className="font-display text-lg text-foreground">{pull.sticker.name}</p>
            {pull.isDuplicate ? (
              <p className="text-sm text-muted-foreground">
                {t("gamification.caseOpening.duplicate", { coins: pull.coinsAwarded })}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{t("gamification.caseOpening.newItem")}</p>
            )}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className={cn(
                "mt-2 inline-flex h-11 items-center justify-center rounded-full border border-white/60 bg-white/45 px-6 text-sm font-medium text-secondary-foreground backdrop-blur-md transition-colors hover:bg-white/70",
              )}
            >
              {t("gamification.caseOpening.continue")}
            </button>
          </div>
        ) : null}
      </GlassDialogContent>
    </GlassDialog>
  )
}
