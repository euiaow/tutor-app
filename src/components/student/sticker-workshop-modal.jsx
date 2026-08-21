import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { openCase as openCaseApi, saveDecoration as saveDecorationApi } from "@/firebase/gamification"
import { stickerRarityHex, stickerRarityGlow, stickerRarityLabel } from "@/lib/stickerColors"
import dashboardScreen from "@/assets/gamification/dashboard-screen.png"
import arcadeLettering from "@/assets/gamification/arcade-lettering-clean.png"
import heroCat from "@/assets/gamification/hero-cat.png"
import slayLettering from "@/assets/gamification/slay-lettering.png"
import legacyLettering from "@/assets/gamification/legacy-lettering.png"
import mythicLettering from "@/assets/gamification/mythic-lettering.png"

// Photo-lettering for case titles, ported 1:1 from the design's per-name
// asset branches (isSlay/isClean/isReels in Sticker Modal v2.dc.html). SLAY
// and LEGACY get the design's "sticker" treatment (transparent-background
// lettering art, bottom-anchored, drop-shadow). The design's 3rd case slot
// (demo name "REELS") used a different "photo" treatment instead — a
// bordered, object-fit:cover photo card — because its asset
// (reels-lettering.png) isn't lettering art, just a photo; mapped onto our
// real 3rd case (MYTHIC) using that same photo-card treatment, reusing the
// design's exact positioning for that slot rather than forcing it into the
// sticker layout.
const CASE_LETTERING = {
  SLAY: { type: "sticker", src: slayLettering, alt: "SLAY", width: 210, height: 136 },
  LEGACY: { type: "sticker", src: legacyLettering, alt: "LEGACY", width: 210, height: 133 },
  MYTHIC: {
    type: "photo",
    src: mythicLettering,
    alt: "MYTHIC",
    card: { wrapperHeight: 130, wrapperMargin: "-64px -20px 6px", left: 3, top: 7, width: 187, height: 145 },
    detail: { wrapperHeight: 150, wrapperMargin: "-64px -30px 6px", left: 11, top: 8, width: 178, height: 148 },
  },
}

// Every image the modal can show is identical across students, so it's
// worth preloading them all before the modal ever paints real content
// instead of popping in cover art mid-render (task 4).
const CRITICAL_IMAGES = [dashboardScreen, arcadeLettering, heroCat, slayLettering, legacyLettering, mythicLettering]

function preloadImages(sources, timeoutMs = 4000) {
  const loaders = sources.map(
    (src) =>
      new Promise((resolve) => {
        const img = new Image()
        img.onload = resolve
        img.onerror = resolve
        img.src = src
      }),
  )
  const timeout = new Promise((resolve) => setTimeout(resolve, timeoutMs))
  return Promise.race([Promise.all(loaders), timeout])
}

const CAT_RUN_FRAMES = [
  ["..##......", ".####.....", ".########.", "##########", "##########", ".########.", "..#..#....", "#..#....#."],
  ["..##......", ".####.....", ".########.", "##########", "##########", ".########.", "#..#....#.", "..#..#...."],
]

function PixelCat({ frame, size = 5 }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(10, ${size}px)`, gridTemplateRows: `repeat(8, ${size}px)` }}>
      {frame.flatMap((row, y) =>
        row.split("").map((ch, x) => (
          <div key={`${x}-${y}`} style={{ width: size, height: size, background: ch === "#" ? "currentColor" : "transparent" }} />
        )),
      )}
    </div>
  )
}

function LoadingScreen() {
  const [frameIndex, setFrameIndex] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setFrameIndex((f) => (f + 1) % CAT_RUN_FRAMES.length), 220)
    return () => clearInterval(id)
  }, [])
  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "#0b0b0b",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 22,
        fontFamily: "'JetBrains Mono',ui-monospace,monospace",
      }}
    >
      <span style={{ fontFamily: "'Bungee',sans-serif", fontSize: 16, letterSpacing: ".06em", color: YELLOW, textShadow: `3px 3px 0 ${ACCENT}` }}>
        STICKER WORKSHOP
      </span>
      <div style={{ color: YELLOW, animation: "sw-rainbow 1.4s linear infinite", transform: "scale(2.2)" }}>
        <div style={{ animation: "sw-catbob .4s steps(2) infinite" }}>
          <PixelCat frame={CAT_RUN_FRAMES[frameIndex]} />
        </div>
      </div>
      <div style={{ width: 220, border: "4px solid #111", background: "#161616", boxShadow: `4px 4px 0 0 ${YELLOW}`, padding: 4 }}>
        <div
          style={{
            height: 10,
            backgroundImage: `repeating-linear-gradient(45deg, ${ACCENT} 0 8px, ${CYAN} 8px 16px, ${YELLOW} 16px 24px)`,
            backgroundSize: "48px 100%",
            animation: "sw-loadbar .6s linear infinite",
          }}
        />
      </div>
      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 10, letterSpacing: ".2em", color: GREEN }}>ЗАГРУЗКА...</span>
      <style>{`
        @keyframes sw-rainbow { 0% { filter: hue-rotate(0deg) } 100% { filter: hue-rotate(360deg) } }
        @keyframes sw-catbob { 0%,49% { transform: translateY(0) } 50%,100% { transform: translateY(-3px) } }
        @keyframes sw-loadbar { from { background-position: 0 0 } to { background-position: 48px 0 } }
      `}</style>
    </div>,
    document.body,
  )
}

// Fullscreen arcade-cabinet takeover ported from the "roulette-design"
// Claude Design canvas (Sticker Modal v2.dc.html) — deliberately kept as
// hand-written inline styles (not Tailwind) to preserve the original
// design's exact look, and deliberately Russian-only (the design has no
// i18n hooks at all) rather than routed through react-i18next like the rest
// of the student dashboard — see activeContext.md for the scope note. Ported
// as a plain React component: the original's DCLogic class/state became
// useState, its computed `renderVals()` became inline derivations below.
const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Bungee&family=JetBrains+Mono:wght@400;700&display=swap"

const ACCENT = "#ff2e9a"
const YELLOW = "#ffe800"
const CYAN = "#00e5ff"
const GREEN = "#7cf03d"
const INK = "#111111"

const SWATCHES = ["#ffd9ec", "#ffffff", "#ffe800", "#00e5ff", "#7cf03d", "#111111", ACCENT, "#ff8ec7"]

// Deterministic per-sticker accent color (djb2-style hash), same shape as
// getSubjectColorClass/getSubjectColorIndex (src/lib/subjects.js) — rarity
// alone would make every "common" sticker render as the same flat white
// square, so this adds visual variety without needing real pixel art yet.
function hashColor(key) {
  const str = String(key ?? "")
  let hash = 5381
  for (let i = 0; i < str.length; i++) hash = (hash * 33) ^ str.charCodeAt(i)
  const index = Math.abs(hash) % SWATCHES.length
  return SWATCHES[index]
}

function ink(fill) {
  const dark = [INK, "#111", ACCENT.toLowerCase(), "#e0257f", "#2b2b2b"]
  return dark.includes(String(fill).toLowerCase()) ? "#ffffff" : "#111111"
}

// Zone positions are approximate percentages over the dashboard screenshot
// below — cosmetic placement aid inside the modal's picker panel only; the
// dashed "+" placeholders that used to live directly on the real dashboard
// were removed per this task, so pixel-perfect alignment isn't load-bearing.
const ZONE_DEFS = [
  { id: "zone1", label: "У АВАТАРА", x: 78, y: 3, w: 20, h: 6 },
  { id: "zone2", label: "КАРТОЧКА УРОКА", x: 60, y: 19, w: 38, h: 6 },
  { id: "zone3", label: "ВНИЗУ СТРАНИЦЫ", x: 30, y: 96, w: 40, h: 3.5 },
  { id: "zone4", label: "КАРТОЧКА ЦЕЛИ", x: 65, y: 55, w: 30, h: 5 },
  { id: "zone5", label: "НИЗ СТРАНИЦЫ", x: 55, y: 78, w: 35, h: 4 },
]

const REEL_ITEM = 104
const REEL_WIN = 62
const REEL_LENGTH = 74

// Doubled from the original 4500ms flat ease-out. Split into three explicit
// phases (task 5) instead of one easing curve for the whole spin: a short
// accelerating burst, a long constant-speed plateau with NO slowdown, then a
// deceleration phase that lands exactly on the server-provided sticker.
const SPIN_DURATION_MS = 9000
const SPIN_PHASE1_TIME_RATIO = 0.08 // quick rev-up
const SPIN_PHASE2_TIME_RATIO = 0.6 // steady plateau, ~60% of total time — remainder (~32%) is the deceleration phase
const SPIN_PHASE1_DIST_RATIO = 0.06
const SPIN_PHASE2_DIST_RATIO = 0.62 // remainder (~32%) is covered during deceleration, ending exactly on `target`

function randomOf(list) {
  return list[Math.floor(Math.random() * list.length)]
}

function useModalFonts(active) {
  useEffect(() => {
    if (!active) return
    if (document.getElementById("sticker-workshop-fonts")) return
    const link = document.createElement("link")
    link.id = "sticker-workshop-fonts"
    link.rel = "stylesheet"
    link.href = FONT_HREF
    document.head.appendChild(link)
  }, [active])
}

function useBodyScrollLock(active) {
  useEffect(() => {
    if (!active) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [active])
}

function buildStick(sticker) {
  const color = sticker.imageUrl ? null : hashColor(sticker.id ?? sticker.name)
  const rarity = sticker.rarity ?? "common"
  return {
    ...sticker,
    color,
    textColor: color ? ink(color) : "#111111",
    rarityColor: stickerRarityHex(rarity),
    rarityLabel: stickerRarityLabel(rarity, "ru"),
    glow: stickerRarityGlow(rarity),
  }
}

function CaseTitle({ name, fontSize, variant = "card" }) {
  const lettering = CASE_LETTERING[name]
  if (!lettering) {
    return <span style={{ fontFamily: "'Bungee',sans-serif", fontSize, color: "#111" }}>{name}</span>
  }

  if (lettering.type === "photo") {
    const spec = lettering[variant]
    return (
      <div
        style={{
          position: "relative",
          height: spec.wrapperHeight,
          margin: spec.wrapperMargin,
          pointerEvents: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 3,
        }}
      >
        <img
          src={lettering.src}
          alt={lettering.alt}
          style={{
            position: "absolute",
            left: spec.left,
            top: spec.top,
            zIndex: 4,
            display: "block",
            boxSizing: "border-box",
            width: spec.width,
            height: spec.height,
            objectFit: "cover",
            objectPosition: "50% 18%",
            border: "5px solid #fff",
            boxShadow: "0 10px 18px rgba(0,0,0,.55),0 0 0 3px #111",
          }}
        />
      </div>
    )
  }

  return (
    <div
      style={{
        position: "relative",
        height: lettering.height,
        margin: "-64px -30px 6px",
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 3,
      }}
    >
      <img
        src={lettering.src}
        alt={lettering.alt}
        style={{
          position: "absolute",
          left: 6,
          bottom: 0,
          display: "block",
          width: lettering.width,
          height: lettering.height,
          filter: "drop-shadow(0 10px 12px rgba(0,0,0,.45))",
        }}
      />
    </div>
  )
}

function StickerFrame({ item, size = 96, className = "" }) {
  const style = {
    width: size,
    height: size,
    background: item.imageUrl ? undefined : item.color,
    border: "4px solid #fff",
    boxShadow: `0 6px 12px rgba(0,0,0,.5),0 0 0 2px #111,0 0 0 6px ${item.rarityColor}${item.glow}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 6,
    flex: "none",
    overflow: "hidden",
  }
  return (
    <div style={style} className={className}>
      {item.imageUrl ? (
        <img src={item.imageUrl} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <span
          style={{
            fontFamily: "'JetBrains Mono',monospace",
            fontWeight: 700,
            fontSize: size >= 140 ? 13 : size >= 90 ? 9 : 8.5,
            lineHeight: 1.2,
            textAlign: "center",
            color: item.textColor,
          }}
        >
          {item.name}
        </span>
      )}
    </div>
  )
}

export function StickerWorkshopModal({
  open,
  onOpenChange,
  studentId,
  coinsBalance,
  stickerSets,
  inventory,
  decoration,
}) {
  useModalFonts(open)
  useBodyScrollLock(open)

  const [tab, setTab] = useState("cases") // cases | detail | collection
  const [openSetId, setOpenSetId] = useState(null)
  const [phase, setPhase] = useState("idle") // idle | confirm | opening | spinning | result
  const [error, setError] = useState("")
  const [pull, setPull] = useState(null) // { sticker, isDuplicate, coinsAwarded, newBalance, price, setId }
  const [strip, setStrip] = useState([])
  const [spinX, setSpinX] = useState(-80)
  const [spinTransition, setSpinTransition] = useState("none")
  const [peek, setPeek] = useState(null)
  const [placingItemId, setPlacingItemId] = useState(null)
  const [selectedZone, setSelectedZone] = useState(null)
  const [placeNote, setPlaceNote] = useState("")
  const [tip, setTip] = useState(null)
  const [tipSeen, setTipSeen] = useState(false)
  const [assetsReady, setAssetsReady] = useState(false)

  const spinTimersRef = useRef([])

  function clearSpinTimers() {
    spinTimersRef.current.forEach(clearTimeout)
    spinTimersRef.current = []
  }

  useEffect(() => {
    if (!open) {
      setTab("cases")
      setOpenSetId(null)
      setPhase("idle")
      setError("")
      setPull(null)
      setPlacingItemId(null)
      setSelectedZone(null)
      setPlaceNote("")
      setPeek(null)
      setAssetsReady(false)
      clearSpinTimers()
      return
    }
    let cancelled = false
    preloadImages(CRITICAL_IMAGES).then(() => {
      if (!cancelled) setAssetsReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => () => clearSpinTimers(), [])

  const sets = useMemo(
    () =>
      stickerSets.map((set) => {
        const totalWeight = set.stickers.reduce((sum, s) => sum + (Number(s.weight) || 0), 0)
        return {
          ...set,
          pool: set.stickers.map((sticker) => ({
            ...buildStick(sticker),
            chancePct: totalWeight > 0 ? Math.round(((Number(sticker.weight) || 0) / totalWeight) * 1000) / 10 : 0,
          })),
        }
      }),
    [stickerSets],
  )

  const current = useMemo(() => sets.find((set) => set.id === openSetId) ?? sets[0] ?? null, [sets, openSetId])
  const afford = current ? coinsBalance >= current.price : false

  const collection = useMemo(() => inventory.map((item) => buildStick(item)), [inventory])

  if (!open) return null
  if (!assetsReady) return <LoadingScreen />

  function closeModal() {
    if (phase === "spinning" || phase === "opening") return
    onOpenChange(false)
  }

  function openSet(setId) {
    setOpenSetId(setId)
    setTab("detail")
  }

  function askConfirm() {
    setError("")
    setPhase("confirm")
  }

  async function confirmOpen() {
    if (!current) return
    setPhase("opening")
    try {
      const result = await openCaseApi(studentId, current.id)
      const pool = current.pool.length > 0 ? current.pool : [buildStick(result.sticker)]
      const built = Array.from({ length: REEL_LENGTH }, (_, i) => ({ ...randomOf(pool), uid: i }))
      built[REEL_WIN] = { ...buildStick(result.sticker), uid: REEL_WIN }
      const jitter = Math.round((Math.random() - 0.5) * 44)
      const target = -(REEL_WIN * REEL_ITEM + 48) + jitter

      const startX = -80
      const totalDist = target - startX
      const phase1Time = Math.round(SPIN_DURATION_MS * SPIN_PHASE1_TIME_RATIO)
      const phase2Time = Math.round(SPIN_DURATION_MS * SPIN_PHASE2_TIME_RATIO)
      const phase3Time = SPIN_DURATION_MS - phase1Time - phase2Time
      const phase1X = startX + totalDist * SPIN_PHASE1_DIST_RATIO
      const phase2X = startX + totalDist * (SPIN_PHASE1_DIST_RATIO + SPIN_PHASE2_DIST_RATIO)

      setStrip(built)
      setSpinX(startX)
      setSpinTransition("none")
      setPull({ ...result, setId: current.id })
      setPhase("spinning")
      clearSpinTimers()

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // Phase 1: short accelerating burst.
          setSpinTransition(`transform ${phase1Time}ms cubic-bezier(.55,0,.85,.35)`)
          setSpinX(phase1X)
        })
      })

      spinTimersRef.current.push(
        setTimeout(() => {
          // Phase 2: steady plateau at constant speed — linear, no slowdown.
          setSpinTransition(`transform ${phase2Time}ms linear`)
          setSpinX(phase2X)

          spinTimersRef.current.push(
            setTimeout(() => {
              // Phase 3: smooth deceleration, lands exactly on the server result.
              setSpinTransition(`transform ${phase3Time}ms cubic-bezier(.12,.85,.18,1)`)
              setSpinX(target)
            }, phase2Time),
          )
        }, phase1Time),
      )

      spinTimersRef.current.push(setTimeout(() => setPhase("result"), SPIN_DURATION_MS + 250))
    } catch (err) {
      console.error("Failed to open case:", err)
      setError(err?.message || "Не удалось открыть кейс")
      setPhase("idle")
    }
  }

  async function placeArmed(zoneId) {
    if (!placingItemId) return
    try {
      await saveDecorationApi(studentId, zoneId, placingItemId)
      const item = collection.find((entry) => entry.id === placingItemId)
      setPlaceNote((item?.name || "стикер") + " размещён")
      setPlacingItemId(null)
      setSelectedZone(null)
    } catch (err) {
      console.error("Failed to save decoration:", err)
      setError(err?.message || "Не удалось разместить стикер")
    }
  }

  async function clearZone(zoneId, e) {
    e.stopPropagation()
    try {
      await saveDecorationApi(studentId, zoneId, null)
      setPlaceNote("стикер убран")
    } catch (err) {
      console.error("Failed to clear decoration:", err)
    }
  }

  const zones = ZONE_DEFS.map((z) => {
    const itemId = decoration[z.id]
    const occupied = itemId ? collection.find((entry) => entry.id === itemId) : null
    const selected = selectedZone === z.id
    const base = {
      position: "absolute",
      left: `${z.x}%`,
      top: `${z.y}%`,
      width: `${z.w}%`,
      minHeight: `${z.h}%`,
      boxSizing: "border-box",
      padding: "2px 3px",
      display: "flex",
      alignItems: "center",
      cursor: "pointer",
      ...(selected
        ? { border: "3px solid #4fbf12", background: "rgba(124,240,61,.34)", boxShadow: "0 0 0 2px #111,0 0 12px rgba(79,191,18,.5)" }
        : occupied
          ? { border: "2px solid #b6a276", background: "rgba(184,162,118,.4)" }
          : { border: "2px dashed #ff7a1a", background: "rgba(255,122,26,.16)" }),
    }
    return { ...z, occupied, selected, style: base }
  })

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "#0b0b0b",
        overflowY: "auto",
        fontFamily: "'JetBrains Mono',ui-monospace,monospace",
      }}
    >
      <div
        style={{
          minHeight: "100%",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "clamp(60px,10vw,200px) clamp(16px,8vw,110px) 60px",
          background:
            "repeating-linear-gradient(to right, rgba(255,255,255,.05) 0 1px, transparent 1px 34px)," +
            "repeating-linear-gradient(to bottom, rgba(255,255,255,.05) 0 1px, transparent 1px 34px), #0b0b0b",
        }}
      >
        <div style={{ position: "relative", width: 1040, maxWidth: "100%" }}>
          <div
            style={{
              position: "absolute",
              top: -132,
              left: -64,
              zIndex: 6,
              pointerEvents: "none",
              width: 340,
              display: window.innerWidth < 760 ? "none" : "block",
            }}
          >
            <img
              src={arcadeLettering}
              alt=""
              style={{ display: "block", width: "100%", height: "auto", imageRendering: "pixelated", filter: `drop-shadow(8px 8px 0 rgba(255,232,0,.85))` }}
            />
          </div>

          <div
            style={{
              position: "absolute",
              top: -172,
              right: -10,
              zIndex: 7,
              display: window.innerWidth < 760 ? "none" : "flex",
              alignItems: "flex-end",
              gap: 12,
            }}
          >
            <div style={{ position: "relative" }}>
              <div style={{ width: 150, height: 150, border: "5px solid #111", background: GREEN, boxShadow: `8px 8px 0 0 ${YELLOW}`, overflow: "hidden" }}>
                <img src={heroCat} alt="" style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 20%" }} />
              </div>
              <span
                style={{
                  position: "absolute",
                  left: 8,
                  top: 8,
                  background: "#111",
                  padding: "2px 5px",
                  fontFamily: "'JetBrains Mono',monospace",
                  fontWeight: 700,
                  fontSize: 8,
                  letterSpacing: ".16em",
                  color: GREEN,
                }}
              >
                CAT.EXE
              </span>
            </div>
          </div>

          <div
            style={{
              position: "relative",
              zIndex: 4,
              border: "5px solid #111",
              background: "#161616",
              boxShadow: `0 0 0 5px ${YELLOW}, 18px 18px 0 0 #111`,
              backgroundImage:
                "repeating-linear-gradient(to right,rgba(255,255,255,.045) 0 1px,transparent 1px 26px),repeating-linear-gradient(to bottom,rgba(255,255,255,.045) 0 1px,transparent 1px 26px)",
            }}
          >
            {/* Title bar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 14,
                background: YELLOW,
                borderBottom: "5px solid #111",
                padding: "6px 8px 6px 12px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 4 }}>
                  <div style={{ width: 13, height: 13, background: "#111" }} />
                  <div style={{ width: 13, height: 13, background: ACCENT, border: "2px solid #111" }} />
                  <div style={{ width: 13, height: 13, background: CYAN, border: "2px solid #111" }} />
                </div>
                <span style={{ fontFamily: "'Bungee',sans-serif", fontSize: 12, letterSpacing: ".04em", color: "#111" }}>STICKER WORKSHOP</span>
                <div style={{ position: "relative" }}>
                  <div
                    onClick={(e) => {
                      e.stopPropagation()
                      setTipSeen(true)
                      setTip((t) => (t === "about" ? null : "about"))
                    }}
                    style={{
                      width: 22,
                      height: 22,
                      border: "3px solid #111",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: "'Bungee',sans-serif",
                      fontSize: 11,
                      cursor: "pointer",
                      animation: tipSeen ? "none" : "iattn 1s steps(1) infinite",
                    }}
                  >
                    i
                  </div>
                  {tip === "about" ? (
                    <div
                      style={{
                        position: "absolute",
                        left: -6,
                        top: 30,
                        zIndex: 40,
                        width: 250,
                        border: "4px solid #111",
                        background: "#fff",
                        boxShadow: `6px 6px 0 0 ${ACCENT}`,
                        padding: "10px 11px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, lineHeight: 1.5, color: "#111" }}>
                        Это твоя коллекция стикеров! Открывай кейсы за монеты и размещай стикеры на дашборде.
                      </span>
                      <div
                        onClick={(e) => {
                          e.stopPropagation()
                          setTip(null)
                        }}
                        style={{
                          alignSelf: "flex-start",
                          fontFamily: "'JetBrains Mono',monospace",
                          fontWeight: 700,
                          fontSize: 9.5,
                          letterSpacing: ".12em",
                          textTransform: "uppercase",
                          background: "#111",
                          color: YELLOW,
                          padding: "4px 7px",
                          cursor: "pointer",
                        }}
                      >
                        понятно
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div
                  onClick={closeModal}
                  style={{
                    width: 24,
                    height: 24,
                    border: "3px solid #111",
                    background: "#111",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "'Bungee',sans-serif",
                    fontSize: 10,
                    color: YELLOW,
                    cursor: "pointer",
                  }}
                >
                  X
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", alignItems: "stretch", gap: 0, borderBottom: "5px solid #111", background: "#111" }}>
              <div
                onClick={() => {
                  setTab("cases")
                  setPhase("idle")
                }}
                style={{
                  fontFamily: "'Bungee',sans-serif",
                  fontSize: 12,
                  padding: "11px 20px",
                  borderRight: `5px solid ${YELLOW}`,
                  cursor: "pointer",
                  background: tab === "cases" || tab === "detail" ? YELLOW : "#111",
                  color: tab === "cases" || tab === "detail" ? "#111" : YELLOW,
                }}
              >
                КЕЙСЫ
              </div>
              <div
                onClick={() => {
                  setTab("collection")
                  setPhase("idle")
                }}
                style={{
                  fontFamily: "'Bungee',sans-serif",
                  fontSize: 12,
                  padding: "11px 20px",
                  borderRight: `5px solid ${YELLOW}`,
                  cursor: "pointer",
                  background: tab === "collection" ? YELLOW : "#111",
                  color: tab === "collection" ? "#111" : YELLOW,
                }}
              >
                КОЛЛЕКЦИЯ
              </div>
              <div style={{ flex: 1, minWidth: 0, background: `repeating-linear-gradient(45deg,${YELLOW} 0 6px,#111 6px 12px)`, opacity: 0.55 }} />
              <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "0 12px", borderLeft: `5px solid ${YELLOW}`, background: "#111" }}>
                <span style={{ fontFamily: "'Bungee',sans-serif", fontSize: 15, color: YELLOW }}>{coinsBalance}</span>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "#8b8676" }}>🪙</span>
              </div>
            </div>

            {/* CASES TAB */}
            {tab === "cases" ? (
              <div style={{ padding: "14px 16px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 12px" }}>
                  <span style={{ fontFamily: "'Bungee',sans-serif", fontSize: 10, color: ACCENT }}>◆</span>
                  <span style={{ fontFamily: "'Bungee',sans-serif", fontSize: 11, color: YELLOW, letterSpacing: ".02em" }}>В КАЖДОМ КЕЙСЕ — ОДИН СТИКЕР</span>
                  <span style={{ flex: 1, height: 3, background: `repeating-linear-gradient(to right,${YELLOW} 0 5px,transparent 5px 10px)` }} />
                </div>

                {sets.length === 0 ? (
                  <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: "#8b8676" }}>Кейсы пока не добавлены.</p>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 14 }}>
                    {sets.map((set, i) => (
                      <div
                        key={set.id}
                        onClick={() => openSet(set.id)}
                        style={{
                          minWidth: 0,
                          position: "relative",
                          border: "5px solid #111",
                          background: "#fff",
                          boxShadow: `7px 7px 0 0 ${YELLOW}`,
                          display: "flex",
                          flexDirection: "column",
                          cursor: "pointer",
                        }}
                      >
                        <span
                          style={{
                            position: "absolute",
                            top: -13,
                            left: -9,
                            zIndex: 2,
                            fontFamily: "'JetBrains Mono',monospace",
                            fontWeight: 700,
                            fontSize: 10,
                            letterSpacing: ".1em",
                            color: "#111",
                            background: CYAN,
                            border: "3px solid #111",
                            padding: "1px 5px",
                          }}
                        >
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <div
                          style={{
                            position: "relative",
                            padding: "12px 12px 10px",
                            background: set.coverUrl ? undefined : hashColor(set.id),
                            backgroundImage: set.coverUrl
                              ? `url(${set.coverUrl})`
                              : "radial-gradient(rgba(17,17,17,.2) 1.5px, transparent 1.6px)",
                            backgroundSize: set.coverUrl ? "cover" : "7px 7px",
                            backgroundPosition: "center",
                            borderBottom: "5px solid #111",
                            overflow: "hidden",
                            minHeight: 118,
                          }}
                        >
                          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: 96, minWidth: 0 }}>
                            {set.pool.slice(0, 3).map((st, k) => (
                              <div
                                key={st.id}
                                style={{
                                  width: "30%",
                                  aspectRatio: "1",
                                  flex: "0 1 30%",
                                  minWidth: 0,
                                  margin: k === 1 ? "0 5px" : 0,
                                  background: st.imageUrl ? undefined : st.color,
                                  border: "4px solid #fff",
                                  boxShadow: "0 6px 12px rgba(0,0,0,.35),0 0 0 2px #111",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  padding: 3,
                                  transform: `rotate(${[-9, 0, 9][k % 3]}deg) translateY(${k === 1 ? "-7px" : "0"})`,
                                  overflow: "hidden",
                                }}
                              >
                                {st.imageUrl ? (
                                  <img src={st.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                ) : (
                                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 8, lineHeight: 1.2, textAlign: "center", color: st.textColor }}>
                                    {st.name}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                          <div style={{ position: "absolute", top: 8, left: 8, background: "#111", padding: "3px 6px" }}>
                            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: ".1em", color: YELLOW, textTransform: "uppercase" }}>
                              {set.pool.length} в пуле · 1 выпадет
                            </span>
                          </div>
                        </div>

                        <div style={{ position: "relative", padding: "11px 12px 20px", display: "flex", flexDirection: "column", gap: 7, flex: 1 }}>
                          <CaseTitle name={set.name} fontSize={13} variant="card" />
                          {set.description ? (
                            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#5f5b50", lineHeight: 1.45 }}>{set.description}</span>
                          ) : null}
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 8,
                              marginTop: "auto",
                              paddingTop: 6,
                              borderTop: "3px dotted #111",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <div style={{ width: 13, height: 13, background: YELLOW, border: "3px solid #111" }} />
                              <span style={{ fontFamily: "'Bungee',sans-serif", fontSize: 14, color: "#111" }}>{set.price}</span>
                            </div>
                            <span
                              style={{
                                fontFamily: "'JetBrains Mono',monospace",
                                fontWeight: 700,
                                fontSize: 9.5,
                                letterSpacing: ".08em",
                                textTransform: "uppercase",
                                color: "#111",
                                background: ACCENT,
                                border: "3px solid #111",
                                padding: "3px 6px",
                              }}
                            >
                              что внутри →
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {/* DETAIL TAB */}
            {tab === "detail" && current ? (
              <div style={{ padding: "12px 16px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <div
                    onClick={() => setTab("cases")}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      border: `3px solid ${YELLOW}`,
                      background: "#111",
                      padding: "5px 10px",
                      cursor: "pointer",
                      fontFamily: "'Bungee',sans-serif",
                      fontSize: 10,
                      color: YELLOW,
                    }}
                  >
                    ← ВСЕ КЕЙСЫ
                  </div>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 9, letterSpacing: ".2em", color: GREEN }}>
                    КЕЙС · СОДЕРЖИМОЕ
                  </span>
                  <span style={{ flex: 1, height: 3, background: `repeating-linear-gradient(to right,${ACCENT} 0 5px,transparent 5px 10px)` }} />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "minmax(0,268px) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
                  <div style={{ minWidth: 0, position: "relative", border: "5px solid #111", background: "#fff", boxShadow: `7px 7px 0 0 ${YELLOW}`, display: "flex", flexDirection: "column", width: 259 }}>
                    <div
                      style={{
                        position: "relative",
                        padding: "12px 12px 10px",
                        background: current.coverUrl ? undefined : hashColor(current.id),
                        backgroundImage: current.coverUrl ? `url(${current.coverUrl})` : "radial-gradient(rgba(17,17,17,.2) 1.5px, transparent 1.6px)",
                        backgroundSize: current.coverUrl ? "cover" : "7px 7px",
                        borderBottom: "5px solid #111",
                        overflow: "hidden",
                        minHeight: 118,
                      }}
                    >
                      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: 96, minWidth: 0 }}>
                        {current.pool.slice(0, 3).map((st, k) => (
                          <div
                            key={st.id}
                            style={{
                              width: "30%",
                              aspectRatio: "1",
                              flex: "0 1 30%",
                              minWidth: 0,
                              margin: k === 1 ? "0 5px" : 0,
                              background: st.imageUrl ? undefined : st.color,
                              border: "4px solid #fff",
                              boxShadow: "0 6px 12px rgba(0,0,0,.35),0 0 0 2px #111",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              padding: 3,
                              transform: `rotate(${[-9, 0, 9][k % 3]}deg) translateY(${k === 1 ? "-7px" : "0"})`,
                              overflow: "hidden",
                            }}
                          >
                            {st.imageUrl ? (
                              <img src={st.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            ) : (
                              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 8, lineHeight: 1.2, textAlign: "center", color: st.textColor }}>
                                {st.name}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ position: "relative", padding: "11px 12px 16px", display: "flex", flexDirection: "column", gap: 7, flex: 1 }}>
                      <CaseTitle name={current.name} fontSize={15} variant="detail" />
                      {current.description ? (
                        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#5f5b50", lineHeight: 1.45 }}>{current.description}</span>
                      ) : null}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, paddingTop: 6, borderTop: "3px dotted #111" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ width: 13, height: 13, background: YELLOW, border: "3px solid #111" }} />
                          <span style={{ fontFamily: "'Bungee',sans-serif", fontSize: 14, color: "#111" }}>{current.price}</span>
                        </div>
                        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "#5f5b50", letterSpacing: ".12em", textTransform: "uppercase" }}>1 стикер</span>
                      </div>
                      <div
                        onClick={afford ? askConfirm : undefined}
                        style={
                          afford
                            ? {
                                fontFamily: "'Bungee',sans-serif",
                                fontSize: 13,
                                padding: "12px 10px",
                                textAlign: "center",
                                border: "4px solid #111",
                                background: ACCENT,
                                color: "#111",
                                boxShadow: "4px 4px 0 0 #111",
                                cursor: "pointer",
                              }
                            : {
                                fontFamily: "'Bungee',sans-serif",
                                fontSize: 11,
                                padding: "12px 10px",
                                textAlign: "center",
                                border: "4px solid rgba(17,17,17,.35)",
                                background: "#efece0",
                                color: "rgba(17,17,17,.45)",
                                cursor: "not-allowed",
                              }
                        }
                      >
                        {afford ? "ОТКРЫТЬ КЕЙС" : "НЕ ХВАТАЕТ МОНЕТ"}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, margin: "0 0 10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontFamily: "'Bungee',sans-serif", fontSize: 10, color: GREEN }}>◆</span>
                        <span style={{ fontFamily: "'Bungee',sans-serif", fontSize: 11, color: YELLOW }}>ЧТО МОЖЕТ ВЫПАСТЬ</span>
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(90px,1fr))", gap: 11 }}>
                      {current.pool.map((d) => (
                        <div
                          key={d.id}
                          onClick={() => setPeek(d)}
                          style={{ minWidth: 0, border: "4px solid #111", background: "#fff", boxShadow: `4px 4px 0 0 ${YELLOW}${d.glow}`, cursor: "pointer" }}
                        >
                          <div style={{ height: 6, background: d.rarityColor, borderBottom: "3px solid #111" }} />
                          <div style={{ padding: "9px 8px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
                            <StickerFrame item={d} size={72} />
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: 5, minWidth: 0, flexWrap: "wrap" }}>
                              <span style={{ minWidth: 0, fontFamily: "'JetBrains Mono',monospace", fontSize: 8.5, letterSpacing: ".05em", textTransform: "uppercase", color: "#5f5b50" }}>
                                {d.rarityLabel}
                              </span>
                              <span style={{ fontFamily: "'Bungee',sans-serif", fontSize: 10, color: "#111" }}>{d.chancePct}%</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* COLLECTION TAB */}
            {tab === "collection" ? (
              <div style={{ padding: "14px 16px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", margin: "0 0 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: "'Bungee',sans-serif", fontSize: 10, color: CYAN }}>◆</span>
                    <span style={{ fontFamily: "'Bungee',sans-serif", fontSize: 11, color: YELLOW }}>МОИ СТИКЕРЫ</span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "#8b8676" }}>{collection.length}</span>
                    {placeNote ? (
                      <span
                        style={{
                          fontFamily: "'JetBrains Mono',monospace",
                          fontWeight: 700,
                          fontSize: 9,
                          letterSpacing: ".1em",
                          textTransform: "uppercase",
                          background: GREEN,
                          color: "#111",
                          padding: "3px 6px",
                        }}
                      >
                        {placeNote}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 320px", minWidth: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(78px,1fr))", gap: 12 }}>
                    {collection.length === 0 ? (
                      <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: "#8b8676", gridColumn: "1 / -1" }}>
                        Пока пусто — открой кейс, чтобы получить первый стикер.
                      </p>
                    ) : (
                      collection.map((it) => (
                        <div key={it.id} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                          <div style={{ position: "relative", cursor: "pointer" }} onClick={() => setPeek({ ...it, owned: true })}>
                            <StickerFrame item={it} size={78} />
                            <div style={{ position: "absolute", top: -6, right: -6, width: 12, height: 12, background: it.rarityColor, border: "3px solid #111" }} />
                          </div>
                          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8.5, letterSpacing: ".06em", textTransform: "uppercase", color: "#b9b4a4" }}>
                            {it.rarityLabel}
                          </span>
                          <div
                            onClick={(e) => {
                              e.stopPropagation()
                              setPlacingItemId(it.id)
                              setSelectedZone(null)
                              setPlaceNote("")
                            }}
                            style={{
                              fontFamily: "'JetBrains Mono',monospace",
                              fontWeight: 700,
                              fontSize: 8,
                              letterSpacing: ".1em",
                              textTransform: "uppercase",
                              textAlign: "center",
                              padding: "4px 2px",
                              border: `3px solid ${placingItemId === it.id ? YELLOW : "rgba(255,255,255,.35)"}`,
                              background: placingItemId === it.id ? YELLOW : "transparent",
                              color: placingItemId === it.id ? "#111" : "#e8e4d6",
                              cursor: "pointer",
                            }}
                          >
                            разместить
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div style={{ flex: "none", width: 318, maxWidth: "100%", border: "5px solid #111", background: "#f4ecd8", boxShadow: `7px 7px 0 0 ${YELLOW}`, display: "flex", flexDirection: "column" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 10px", background: "#111" }}>
                      <span style={{ fontFamily: "'Bungee',sans-serif", fontSize: 10, color: YELLOW }}>ГДЕ РАЗМЕСТИТЬ</span>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 8, letterSpacing: ".1em", textTransform: "uppercase", color: GREEN }}>
                        {zones.filter((z) => z.occupied).length} / {zones.length} занято
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderBottom: "4px solid #111", background: "#e8dcc0" }}>
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          background: placingItemId ? collection.find((c) => c.id === placingItemId)?.color || YELLOW : "transparent",
                          border: `3px ${placingItemId ? "solid" : "dashed"} #111`,
                          boxShadow: "3px 3px 0 0 #fff",
                        }}
                      />
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 10, color: "#3d372a" }}>
                        {placingItemId ? collection.find((c) => c.id === placingItemId)?.name : "выбери стикер слева"}
                      </span>
                    </div>

                    <div style={{ margin: 10, border: "4px solid #111", background: "#fffaf0", maxHeight: 300, overflowY: "auto" }}>
                      <div style={{ position: "relative", width: "100%" }}>
                        <img src={dashboardScreen} alt="Дашборд ученика" style={{ display: "block", width: "100%", height: "auto" }} />
                        {zones.map((z) => (
                          <div key={z.id} onClick={() => setSelectedZone(z.id)} style={z.style}>
                            <div style={{ width: "100%", minWidth: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 3, overflow: "hidden" }}>
                              <span
                                style={{
                                  minWidth: 0,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  fontFamily: "'JetBrains Mono',monospace",
                                  fontWeight: 700,
                                  fontSize: 6,
                                  lineHeight: 1.1,
                                  whiteSpace: "nowrap",
                                  color: z.selected ? "#1f4d0a" : z.occupied ? "#6b5c37" : "#a34500",
                                }}
                              >
                                {z.label}
                              </span>
                              {z.occupied && !z.selected ? (
                                <div style={{ display: "flex", alignItems: "center", gap: 2, flex: "none" }}>
                                  <div style={{ flex: "none", width: 9, height: 9, background: z.occupied.color || "#fff", border: "1.5px solid #8a7b58", opacity: 0.55 }} />
                                  <div
                                    onClick={(e) => clearZone(z.id, e)}
                                    style={{
                                      flex: "none",
                                      width: 11,
                                      height: 11,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      fontFamily: "'Bungee',sans-serif",
                                      fontSize: 7,
                                      background: "#111",
                                      color: YELLOW,
                                      cursor: "pointer",
                                    }}
                                  >
                                    X
                                  </div>
                                </div>
                              ) : null}
                            </div>
                            {z.selected ? (
                              <div
                                style={{
                                  position: "absolute",
                                  top: -9,
                                  right: -9,
                                  width: 18,
                                  height: 18,
                                  background: GREEN,
                                  border: "3px solid #111",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontFamily: "'Bungee',sans-serif",
                                  fontSize: 9,
                                  color: "#111",
                                }}
                              >
                                V
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div style={{ padding: "0 10px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, lineHeight: 1.5, color: "#6b6248" }}>
                        {!placingItemId
                          ? "Нажми «разместить» под стикером слева, затем выбери зону на схеме."
                          : selectedZone
                            ? "Зона выбрана. Нажми «подтвердить размещение»."
                            : "Выбери зону на схеме — занятые зоны можно заменить, X убирает стикер."}
                      </span>
                      <div
                        onClick={() => placeArmed(selectedZone)}
                        style={
                          selectedZone && placingItemId
                            ? { fontFamily: "'Bungee',sans-serif", fontSize: 11, textAlign: "center", padding: "11px 8px", border: "4px solid #111", background: YELLOW, color: "#111", boxShadow: "4px 4px 0 0 #111", cursor: "pointer" }
                            : { fontFamily: "'Bungee',sans-serif", fontSize: 11, textAlign: "center", padding: "11px 8px", border: "4px solid rgba(17,17,17,.3)", background: "#e2d9c2", color: "rgba(17,17,17,.4)", cursor: "not-allowed" }
                        }
                      >
                        ПОДТВЕРДИТЬ РАЗМЕЩЕНИЕ
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* CONFIRM OVERLAY */}
            {phase === "confirm" && current ? (
              <div style={{ position: "absolute", inset: 0, zIndex: 30, background: "rgba(8,8,8,.92)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ border: "5px solid #111", background: "#fff", boxShadow: `10px 10px 0 0 ${YELLOW}`, padding: "22px 24px", display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
                  <span style={{ fontFamily: "'Bungee',sans-serif", fontSize: 18, color: "#111" }}>ПОДТВЕРДИ</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 12, color: "#5f5b50" }}>
                    Открыть {current.name} за {current.price} монет?
                  </span>
                  {error ? <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "#c0264c" }}>{error}</span> : null}
                  <div style={{ display: "flex", gap: 12 }}>
                    <div onClick={confirmOpen} style={{ fontFamily: "'Bungee',sans-serif", fontSize: 13, padding: "11px 20px", border: "4px solid #111", background: ACCENT, color: "#111", boxShadow: "4px 4px 0 0 #111", cursor: "pointer" }}>
                      ОТКРЫТЬ
                    </div>
                    <div onClick={() => setPhase("idle")} style={{ fontFamily: "'Bungee',sans-serif", fontSize: 13, padding: "11px 20px", border: "4px solid #111", background: "#fff", color: "#111", cursor: "pointer" }}>
                      ОТМЕНА
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* OPENING (awaiting server) / SPINNING OVERLAY */}
            {phase === "opening" || phase === "spinning" ? (
              <div style={{ position: "absolute", inset: 0, zIndex: 30, background: "rgba(8,8,8,.96)", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18 }}>
                <span style={{ position: "relative", fontFamily: "'Bungee',sans-serif", fontSize: 20, color: YELLOW, letterSpacing: ".04em" }}>ОТКРЫВАЕМ...</span>
                <div style={{ position: "relative", width: "100%", height: 130, borderTop: `5px solid ${YELLOW}`, borderBottom: `5px solid ${YELLOW}`, overflow: "hidden", background: "rgba(255,232,0,.06)" }}>
                  {phase === "spinning" ? (
                    <div
                      style={{
                        position: "absolute",
                        top: 16,
                        left: "50%",
                        display: "flex",
                        gap: 8,
                        transform: `translateX(${spinX}px)`,
                        transition: spinTransition,
                        willChange: "transform",
                      }}
                    >
                      {strip.map((s) => (
                        <StickerFrame key={s.uid} item={s} size={96} />
                      ))}
                    </div>
                  ) : (
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "#8b8676" }}>связь с сервером...</span>
                    </div>
                  )}
                  <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 4, marginLeft: -2, background: ACCENT, boxShadow: `0 0 16px ${ACCENT}`, zIndex: 3 }} />
                  <div style={{ position: "absolute", left: "50%", top: 0, marginLeft: -9, width: 18, height: 12, background: ACCENT, clipPath: "polygon(0 0,100% 0,50% 100%)", zIndex: 3 }} />
                </div>
                <span style={{ position: "relative", fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 10, letterSpacing: ".2em", color: GREEN }}>КРУТИТЕ БАРАБАН...</span>
              </div>
            ) : null}

            {/* RESULT OVERLAY */}
            {phase === "result" && pull ? (
              <div style={{ position: "absolute", inset: 0, zIndex: 30, background: "rgba(8,8,8,.96)", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
                <span style={{ position: "relative", fontFamily: "'Bungee',sans-serif", fontSize: 22, color: YELLOW }}>
                  {pull.isDuplicate ? "ДУБЛИКАТ" : "НОВЫЙ СТИКЕР"}
                </span>
                <div style={{ position: "relative" }}>
                  <StickerFrame item={buildStick(pull.sticker)} size={172} />
                </div>
                <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 12, height: 12, background: stickerRarityHex(pull.sticker.rarity), border: "3px solid #fff" }} />
                  <span style={{ fontFamily: "'Bungee',sans-serif", fontSize: 13, color: "#fff" }}>{stickerRarityLabel(pull.sticker.rarity, "ru")}</span>
                </div>
                <span style={{ position: "relative", fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 11, letterSpacing: ".06em", color: GREEN }}>
                  {pull.isDuplicate ? `Уже был в коллекции — обменяли на ${pull.coinsAwarded} монет` : "Добавлен в коллекцию"}
                </span>
                <div style={{ position: "relative", display: "flex", gap: 12, marginTop: 4 }}>
                  <div
                    onClick={() => {
                      setPhase("idle")
                      setPull(null)
                      setTab("collection")
                    }}
                    style={{ fontFamily: "'Bungee',sans-serif", fontSize: 12, padding: "10px 18px", border: "4px solid #111", background: YELLOW, color: "#111", boxShadow: "4px 4px 0 0 #fff", cursor: "pointer" }}
                  >
                    В КОЛЛЕКЦИЮ
                  </div>
                  <div
                    onClick={() => {
                      setPhase("idle")
                      setPull(null)
                    }}
                    style={{ fontFamily: "'Bungee',sans-serif", fontSize: 12, padding: "10px 18px", border: `4px solid ${YELLOW}`, background: "#111", color: YELLOW, cursor: "pointer" }}
                  >
                    ЕЩЁ РАЗ
                  </div>
                </div>
              </div>
            ) : null}

            {/* PEEK OVERLAY */}
            {peek ? (
              <div
                style={{ position: "absolute", inset: 0, zIndex: 35, background: "rgba(8,8,8,.96)", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}
                onClick={() => setPeek(null)}
              >
                <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 8 }} onClick={(e) => e.stopPropagation()}>
                  <span style={{ width: 172, textAlign: "left", fontFamily: "'Bungee',sans-serif", fontSize: 16, color: YELLOW }}>{peek.name}</span>
                  <StickerFrame item={peek} size={172} />
                </div>
                <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 12, height: 12, background: peek.rarityColor, border: "3px solid #fff" }} />
                  <span style={{ fontFamily: "'Bungee',sans-serif", fontSize: 13, color: "#fff" }}>{peek.rarityLabel}</span>
                </div>
                {peek.owned ? (
                  <div
                    onClick={(e) => {
                      e.stopPropagation()
                      setTab("collection")
                      setPlacingItemId(peek.id)
                      setSelectedZone(null)
                      setPlaceNote("")
                      setPeek(null)
                    }}
                    style={{ position: "relative", fontFamily: "'Bungee',sans-serif", fontSize: 12, padding: "11px 18px", border: "4px solid #111", background: YELLOW, color: "#111", boxShadow: "4px 4px 0 0 #fff", cursor: "pointer", marginTop: 2 }}
                  >
                    РАЗМЕСТИТЬ СТИКЕР
                  </div>
                ) : null}
                <div
                  onClick={() => setPeek(null)}
                  style={{ position: "relative", fontFamily: "'Bungee',sans-serif", fontSize: 12, padding: "10px 18px", border: `4px solid ${YELLOW}`, background: "#111", color: YELLOW, cursor: "pointer", marginTop: 4 }}
                >
                  ЗАКРЫТЬ
                </div>
              </div>
            ) : null}

            {/* Ticker */}
            <div style={{ borderTop: "5px solid #111", background: YELLOW, overflow: "hidden", padding: "6px 0" }}>
              <div style={{ display: "flex", width: "max-content", animation: "sw-tick 20s linear infinite" }}>
                {[0, 1].map((k) => (
                  <span
                    key={k}
                    style={{ flex: "none", width: "max-content", fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 10, letterSpacing: ".2em", color: "#111", textTransform: "uppercase", whiteSpace: "nowrap", paddingRight: 24 }}
                  >
                    ◆ ЗА КАЖДЫЙ УРОК — МОНЕТЫ ◆ ДУБЛИКАТЫ ОБМЕНИВАЮТСЯ НА МОНЕТЫ ◆ РАЗМЕЩАЙ СТИКЕРЫ НА ДАШБОРДЕ ◆
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes sw-tick { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        @keyframes iattn { 0%,49% { background: transparent; color: #111 } 50%,100% { background: #111; color: ${YELLOW} } }
      `}</style>
    </div>,
    document.body,
  )
}
