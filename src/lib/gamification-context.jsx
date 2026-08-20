import { createContext, useCallback, useContext, useEffect, useState } from "react"
import {
  subscribeToDecoration,
  subscribeToInventory,
  subscribeToStickerSets,
  saveDecoration as saveDecorationApi,
} from "@/firebase/gamification"

// Shared state for the 3 physically-separate decoration zones (header/
// progress card/bottom banner — see sticker-zone.jsx) plus the case/
// inventory section, all on one student's dashboard. Mirrors
// lib/user-prefs-context.jsx's shape: one Provider mounted once near the
// dashboard's root, everything below just calls the hook instead of prop-
// drilling inventory/decoration/armed-item state through unrelated trees.
const GamificationContext = createContext(null)

export function GamificationProvider({ studentId, children }) {
  const [inventory, setInventory] = useState([])
  const [decoration, setDecoration] = useState({ zone1: null, zone2: null, zone3: null })
  const [stickerSets, setStickerSets] = useState([])
  // The inventory item currently "picked up" for placement — tap a sticker
  // in the inventory grid to arm it, then tap any zone to place it there
  // (tap-then-tap instead of drag-and-drop, since most students are on
  // phones — see the task's own touch-gesture note).
  const [armedItemId, setArmedItemId] = useState(null)

  useEffect(() => {
    const unsubscribe = subscribeToInventory(studentId, setInventory, (error) =>
      console.error("Failed to load sticker inventory:", error),
    )
    return unsubscribe
  }, [studentId])

  useEffect(() => {
    const unsubscribe = subscribeToDecoration(studentId, setDecoration, (error) =>
      console.error("Failed to load sticker decoration:", error),
    )
    return unsubscribe
  }, [studentId])

  useEffect(() => {
    const unsubscribe = subscribeToStickerSets(setStickerSets, (error) =>
      console.error("Failed to load sticker sets:", error),
    )
    return unsubscribe
  }, [])

  const armItem = useCallback((itemId) => {
    setArmedItemId((current) => (current === itemId ? null : itemId))
  }, [])

  const disarm = useCallback(() => setArmedItemId(null), [])

  // Tapping a zone: if an item is armed, place it there; if the zone
  // already holds a sticker and nothing is armed, tapping again clears it
  // (simplest touch-friendly "remove" affordance — no separate UI needed).
  const placeInZone = useCallback(
    async (zone) => {
      if (armedItemId) {
        const itemId = armedItemId
        setArmedItemId(null)
        await saveDecorationApi(studentId, zone, itemId)
        return
      }
      if (decoration[zone]) {
        await saveDecorationApi(studentId, zone, null)
      }
    },
    [armedItemId, decoration, studentId],
  )

  const value = {
    studentId,
    inventory,
    decoration,
    stickerSets,
    armedItemId,
    armItem,
    disarm,
    placeInZone,
  }

  return <GamificationContext.Provider value={value}>{children}</GamificationContext.Provider>
}

// Returns null outside a Provider (e.g. a stray import on the teacher side)
// rather than throwing — callers that render unconditionally (the 3 zone
// spots) just render nothing in that case.
export function useGamification() {
  return useContext(GamificationContext)
}
