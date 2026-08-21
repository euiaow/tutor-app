import { createContext, useContext, useEffect, useState } from "react"
import { subscribeToDecoration, subscribeToInventory, subscribeToStickerSets } from "@/firebase/gamification"

// Shared read state for the sticker workshop (cases/inventory/decoration) —
// mounted once near the dashboard's root (mirrors lib/user-prefs-context.jsx's
// shape) so both the portal button (sticker-workshop-button.jsx) and the
// fullscreen modal it opens (sticker-workshop-modal.jsx) read the same live
// data without prop-drilling. Mutations (openCase/saveDecoration) are called
// directly from the modal, not funneled through this context.
const GamificationContext = createContext(null)

export function GamificationProvider({ studentId, children }) {
  const [inventory, setInventory] = useState([])
  const [decoration, setDecoration] = useState({ zone1: null, zone2: null, zone3: null, zone4: null, zone5: null })
  const [stickerSets, setStickerSets] = useState([])

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

  const value = { studentId, inventory, decoration, stickerSets }

  return <GamificationContext.Provider value={value}>{children}</GamificationContext.Provider>
}

// Returns null outside a Provider (e.g. a stray import on the teacher side)
// rather than throwing — the portal button renders nothing in that case.
export function useGamification() {
  return useContext(GamificationContext)
}
