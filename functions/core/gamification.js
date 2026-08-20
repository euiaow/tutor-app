const { FieldValue } = require("firebase-admin/firestore")
const { HttpsError } = require("firebase-functions/v2/https")
const logger = require("firebase-functions/logger")
const { db } = require("./firestore")

// Gamification MVP — sticker cases (CS:GO-style), a global catalog shared by
// every teacher's students (not per-teacher content, unlike
// curriculumTemplates — a deliberate product decision, see activeContext.md).
// Stickers are colored-square placeholders for now (`imageUrl: ""` on every
// sticker until real pixel art exists) — the schema already carries the
// field so swapping in real art later needs no shape change.

const STICKER_SETS_COLLECTION = "stickerSets"
const STUDENTS_COLLECTION = "students"
const INVENTORY_SUBCOLLECTION = "inventory"
const DECORATION_SUBCOLLECTION = "decoration"
const COIN_LEDGER_SUBCOLLECTION = "coinLedger"
const DECORATION_DOC_ID = "main"

const DEFAULT_CASE_PRICE = 6
const DUPLICATE_COIN_REWARD = 2
const DECORATION_ZONES = ["zone1", "zone2", "zone3"]

function studentRef(studentId) {
  return db.collection(STUDENTS_COLLECTION).doc(studentId)
}

function inventoryCollectionRef(studentId) {
  return studentRef(studentId).collection(INVENTORY_SUBCOLLECTION)
}

// Deterministic doc id (not an auto-id) — one inventory doc can ever exist
// per (set, sticker) pair, so "does the student already have this" is a
// single .get() by known path instead of a query, both outside and inside
// the transaction below.
function inventoryDocId(setId, stickerId) {
  return `${setId}_${stickerId}`
}

// Server-side weighted pick — never trust a client-supplied result (the
// whole point of a case being a server-resolved gamble, not a client
// animation with a client-decided outcome).
function pickWeightedSticker(stickers) {
  const weighted = stickers.filter((sticker) => Number(sticker?.weight) > 0)
  const totalWeight = weighted.reduce((sum, sticker) => sum + Number(sticker.weight), 0)
  if (totalWeight <= 0) return null

  let roll = Math.random() * totalWeight
  for (const sticker of weighted) {
    roll -= Number(sticker.weight)
    if (roll <= 0) return sticker
  }
  return weighted[weighted.length - 1]
}

// studentId/setId are trusted from the request body, not request.auth —
// students have no Firebase Auth identity in this app (see CLAUDE.md /
// systemPatterns.md's dual-actor/no-auth pattern), same as every other
// student-facing callable.
async function openCase(studentId, setId) {
  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
  }
  if (!setId || typeof setId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор набора")
  }

  const setSnapshot = await db.collection(STICKER_SETS_COLLECTION).doc(setId).get()
  if (!setSnapshot.exists) {
    throw new HttpsError("not-found", "Набор кейсов не найден")
  }
  const setData = setSnapshot.data()
  const stickers = Array.isArray(setData.stickers) ? setData.stickers : []
  if (stickers.length === 0) {
    throw new HttpsError("failed-precondition", "В наборе нет стикеров")
  }
  const price = Number(setData.price) > 0 ? Number(setData.price) : DEFAULT_CASE_PRICE

  const picked = pickWeightedSticker(stickers)
  if (!picked?.id) {
    throw new HttpsError("failed-precondition", "Не удалось выбрать стикер — проверьте веса редкости набора")
  }

  const sRef = studentRef(studentId)
  const invRef = inventoryCollectionRef(studentId).doc(inventoryDocId(setId, picked.id))
  const ledgerDocRef = sRef.collection(COIN_LEDGER_SUBCOLLECTION).doc()

  const { newBalance, isDuplicate, coinsAwarded } = await db.runTransaction(async (tx) => {
    // Reads must all happen before any write inside a Firestore transaction.
    const [studentSnapshot, inventorySnapshot] = await Promise.all([tx.get(sRef), tx.get(invRef)])

    if (!studentSnapshot.exists) {
      throw new HttpsError("not-found", "Ученик не найден")
    }

    const studentData = studentSnapshot.data()
    const currentBalance = Number(studentData.coinsBalance) || 0
    if (currentBalance < price) {
      throw new HttpsError("failed-precondition", "Недостаточно монет для открытия кейса")
    }

    const duplicate = inventorySnapshot.exists
    const awarded = duplicate ? DUPLICATE_COIN_REWARD : 0
    const nextBalance = currentBalance - price + awarded

    tx.update(sRef, { coinsBalance: nextBalance })

    if (!duplicate) {
      tx.set(invRef, {
        setId,
        stickerId: picked.id,
        name: picked.name ?? "",
        rarity: picked.rarity ?? null,
        imageUrl: picked.imageUrl ?? "",
        quantity: 1,
        obtainedAt: FieldValue.serverTimestamp(),
      })
    }

    tx.set(ledgerDocRef, {
      type: "case_open",
      setId,
      stickerId: picked.id,
      stickerName: picked.name ?? "",
      price,
      isDuplicate: duplicate,
      coinsAwarded: awarded,
      balanceAfter: nextBalance,
      teacherId: studentData.teacherId ?? null,
      createdAt: FieldValue.serverTimestamp(),
    })

    return { newBalance: nextBalance, isDuplicate: duplicate, coinsAwarded: awarded }
  })

  logger.info("openCase: completed", { studentId, setId, stickerId: picked.id, isDuplicate, price })

  return {
    sticker: {
      id: picked.id,
      name: picked.name ?? "",
      rarity: picked.rarity ?? null,
      imageUrl: picked.imageUrl ?? "",
    },
    isDuplicate,
    coinsAwarded,
    newBalance,
    price,
  }
}

// itemId is an inventory doc id (setId_stickerId), not a bare sticker id —
// unambiguous even if two different sets ever reuse the same sticker id.
// null clears the zone. Validated server-side (must actually own the item)
// rather than a plain client write, same "student-facing trust boundary
// needs a callable" reasoning as addLessonMaterial/homework endpoints.
async function saveDecoration(studentId, zone, itemId) {
  if (!studentId || typeof studentId !== "string") {
    throw new HttpsError("invalid-argument", "Не указан идентификатор ученика")
  }
  if (!DECORATION_ZONES.includes(zone)) {
    throw new HttpsError("invalid-argument", "Некорректная зона")
  }

  if (itemId) {
    const itemSnapshot = await inventoryCollectionRef(studentId).doc(itemId).get()
    if (!itemSnapshot.exists) {
      throw new HttpsError("failed-precondition", "Стикер не найден в инвентаре ученика")
    }
  }

  await studentRef(studentId)
    .collection(DECORATION_SUBCOLLECTION)
    .doc(DECORATION_DOC_ID)
    .set({ [zone]: itemId ?? null, updatedAt: FieldValue.serverTimestamp() }, { merge: true })

  logger.info("saveDecoration: saved", { studentId, zone, itemId: itemId ?? null })

  return { zone, itemId: itemId ?? null }
}

module.exports = {
  openCase,
  saveDecoration,
  pickWeightedSticker,
  DECORATION_ZONES,
  DECORATION_DOC_ID,
}
