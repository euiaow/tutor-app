import { useState } from "react"
import { Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useGamification } from "@/lib/gamification-context"
import { openCase } from "@/firebase/gamification"
import { StickerSquare } from "@/components/student/sticker-square"
import { CaseOpeningAnimation } from "@/components/student/case-opening-animation"
import { stickerRarityLabel } from "@/lib/stickerColors"

function CaseCard({ set, coinsBalance, studentId, onOpened }) {
  const { t } = useTranslation("student")
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState("")
  const canAfford = coinsBalance >= set.price

  async function handleOpen() {
    if (opening) return
    setOpening(true)
    setError("")
    try {
      const result = await openCase(studentId, set.id)
      onOpened(set, result)
    } catch (err) {
      console.error("Failed to open case:", err)
      setError(err?.message || t("gamification.openError"))
    } finally {
      setOpening(false)
    }
  }

  return (
    <div className="glass-inset flex flex-col items-center gap-2 rounded-2xl p-4">
      {set.coverUrl ? (
        <img src={set.coverUrl} alt={set.name} className="size-16 rounded-xl object-cover" />
      ) : (
        <div className="flex size-16 items-center justify-center rounded-xl bg-gradient-to-br from-primary/40 to-primary/10 text-center text-[11px] font-semibold text-foreground">
          {set.name}
        </div>
      )}
      <p className="text-center text-sm font-medium text-foreground">{set.name}</p>
      <button
        type="button"
        onClick={handleOpen}
        disabled={opening || !canAfford}
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-white/60 bg-white/45 px-4 text-xs font-medium text-secondary-foreground backdrop-blur-md transition-colors hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {opening ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
        {t("gamification.openButton", { price: set.price })}
      </button>
      {!canAfford && !opening ? (
        <p className="text-center text-[11px] text-muted-foreground">{t("gamification.notEnoughCoins")}</p>
      ) : null}
      {error ? <p className="text-center text-[11px] font-semibold text-destructive">{error}</p> : null}
    </div>
  )
}

// Задача 2 (баланс/кейсы/инвентарь) + Задача 3 (анимация открытия) — kept
// in one section since opening a case is the thing that bridges them: the
// grid triggers openCase, the resolved result feeds straight into
// CaseOpeningAnimation, never a client-guessed outcome.
export function GamificationSection({ studentId, coinsBalance }) {
  const { t, i18n } = useTranslation("student")
  const gamification = useGamification()
  const [activePull, setActivePull] = useState(null)
  const [animationOpen, setAnimationOpen] = useState(false)
  const [activeSetStickers, setActiveSetStickers] = useState([])

  if (!gamification) return null
  const { inventory, stickerSets, armedItemId, armItem } = gamification

  function handleOpened(set, result) {
    setActiveSetStickers(set.stickers)
    setActivePull(result)
    setAnimationOpen(true)
  }

  return (
    <section className="glass-soft rounded-4xl p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg text-foreground">{t("gamification.sectionTitle")}</h2>
        <span className="glass-inset inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold text-foreground">
          {coinsBalance} 🪙
        </span>
      </div>

      {stickerSets.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{t("gamification.noSets")}</p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {stickerSets.map((set) => (
            <CaseCard
              key={set.id}
              set={set}
              coinsBalance={coinsBalance}
              studentId={studentId}
              onOpened={handleOpened}
            />
          ))}
        </div>
      )}

      <h3 className="mt-6 font-display text-sm text-foreground">
        {t("gamification.collectionTitle", { count: inventory.length })}
      </h3>
      {inventory.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{t("gamification.collectionEmpty")}</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted-foreground">{t("gamification.collectionHint")}</p>
          <div className="mt-3 grid grid-cols-4 gap-3 sm:grid-cols-6">
            {inventory.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => armItem(item.id)}
                title={`${item.name} · ${stickerRarityLabel(item.rarity, i18n.language)}`}
                className={`flex flex-col items-center gap-1 rounded-xl p-1 transition ${
                  armedItemId === item.id ? "ring-2 ring-primary" : ""
                }`}
              >
                <StickerSquare sticker={item} size="sm" />
              </button>
            ))}
          </div>
        </>
      )}

      <CaseOpeningAnimation
        open={animationOpen}
        onOpenChange={setAnimationOpen}
        pull={activePull}
        setStickers={activeSetStickers}
      />
    </section>
  )
}
