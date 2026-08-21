import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore"
import { httpsCallable } from "firebase/functions"
import { db, functions } from "./firebase"

// Gamification (sticker cases) — stickerSets is a GLOBAL catalog (no
// teacherId, shared by every teacher's students, deliberate product
// decision — see activeContext.md), unlike curriculumTemplates which is
// per-teacher. No teacherId filter needed on the list query below because
// of that.
const STICKER_SETS_COLLECTION = "stickerSets"
const STUDENTS_COLLECTION = "students"
const INVENTORY_SUBCOLLECTION = "inventory"
const DECORATION_SUBCOLLECTION = "decoration"
const DECORATION_DOC_ID = "main"

export const DECORATION_ZONES = ["zone1", "zone2", "zone3", "zone4", "zone5"]

const openCaseCallable = httpsCallable(functions, "openCase")
const saveDecorationCallable = httpsCallable(functions, "saveDecoration")

function mapStickerSetDoc(id, data) {
  return {
    id,
    name: data.name ?? "",
    description: data.description ?? "",
    coverUrl: data.coverUrl ?? "",
    price: Number(data.price) > 0 ? Number(data.price) : 6,
    stickers: Array.isArray(data.stickers)
      ? data.stickers.map((sticker) => ({
          id: sticker.id,
          name: sticker.name ?? "",
          rarity: sticker.rarity ?? null,
          weight: Number(sticker.weight) || 0,
          imageUrl: sticker.imageUrl ?? "",
        }))
      : [],
  }
}

export function subscribeToStickerSets(onData, onError) {
  const ref = collection(db, STICKER_SETS_COLLECTION)
  return onSnapshot(
    ref,
    (snapshot) => onData(snapshot.docs.map((document) => mapStickerSetDoc(document.id, document.data()))),
    onError,
  )
}

function mapInventoryItemDoc(id, data) {
  return {
    id,
    setId: data.setId ?? null,
    stickerId: data.stickerId ?? null,
    name: data.name ?? "",
    rarity: data.rarity ?? null,
    imageUrl: data.imageUrl ?? "",
    quantity: data.quantity ?? 1,
    obtainedAt: data.obtainedAt?.toDate?.() ?? null,
  }
}

export function subscribeToInventory(studentId, onData, onError) {
  const ref = query(
    collection(db, STUDENTS_COLLECTION, studentId, INVENTORY_SUBCOLLECTION),
    orderBy("obtainedAt", "desc"),
  )
  return onSnapshot(
    ref,
    (snapshot) => onData(snapshot.docs.map((document) => mapInventoryItemDoc(document.id, document.data()))),
    onError,
  )
}

function mapDecorationDoc(data) {
  return {
    zone1: data?.zone1 ?? null,
    zone2: data?.zone2 ?? null,
    zone3: data?.zone3 ?? null,
    zone4: data?.zone4 ?? null,
    zone5: data?.zone5 ?? null,
  }
}

export function subscribeToDecoration(studentId, onData, onError) {
  const ref = doc(db, STUDENTS_COLLECTION, studentId, DECORATION_SUBCOLLECTION, DECORATION_DOC_ID)
  return onSnapshot(ref, (snapshot) => onData(mapDecorationDoc(snapshot.data())), onError)
}

// Returns { sticker: {id,name,rarity,imageUrl}, isDuplicate, coinsAwarded,
// newBalance, price } — the sticker is already fully decided server-side by
// the time this resolves, so a case-opening animation can safely start
// only after awaiting this (see CaseOpeningAnimation).
export async function openCase(studentId, setId) {
  const result = await openCaseCallable({ studentId, setId })
  return result.data
}

// itemId is an inventory doc id (setId_stickerId) or null to clear a zone.
export async function saveDecoration(studentId, zone, itemId) {
  const result = await saveDecorationCallable({ studentId, zone, itemId: itemId ?? null })
  return result.data
}
