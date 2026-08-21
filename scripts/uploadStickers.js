// One-off manual script — not wired into any build/deploy step, run by
// hand whenever there's a new batch of real sticker art to upload.
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json node scripts/uploadStickers.js [stickers-raw-dir]
//
// [stickers-raw-dir] defaults to ./stickers-raw. The manifest is always
// read from ./stickers-manifest.json (repo root) — see
// stickers-manifest.example.json for the expected shape.
//
// For each manifest entry: uploads stickers-raw/{filename} to Firebase
// Storage at stickers/{caseId}/{filename} (same firebaseStorageDownloadTokens
// pattern functions/core/lessons.js's uploadHomeworkFile already uses, so
// the resulting URL behaves like every other file URL already stored in
// this app), then merges {id,name,rarity,weight,imageUrl} into
// stickerSets/{caseId}.stickers — replacing the existing entry with a
// matching id (e.g. a mock placeholder), appending anything with a new id,
// and leaving every sticker not mentioned in this manifest run untouched.

import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { randomUUID } from "node:crypto"
import admin from "firebase-admin"

const DEFAULT_STORAGE_BUCKET = "princessschool-e678c.firebasestorage.app"
const STICKER_SETS_COLLECTION = "stickerSets"

const CONTENT_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
}

const REQUIRED_FIELDS = ["filename", "caseId", "id", "name", "rarity", "weight"]
const VALID_RARITIES = new Set(["common", "rare", "epic", "legendary"])

function validateEntry(entry, index) {
  for (const field of REQUIRED_FIELDS) {
    const value = entry[field]
    if (value === undefined || value === null || value === "") {
      throw new Error(`Манифест: запись #${index} — пустое обязательное поле "${field}": ${JSON.stringify(entry)}`)
    }
  }
  if (!VALID_RARITIES.has(entry.rarity)) {
    throw new Error(
      `Манифест: запись #${index} (id="${entry.id}") — некорректная rarity "${entry.rarity}", допустимые значения: ${[...VALID_RARITIES].join(", ")}`,
    )
  }
  if (!Number.isFinite(Number(entry.weight)) || Number(entry.weight) <= 0) {
    throw new Error(`Манифест: запись #${index} (id="${entry.id}") — weight должен быть положительным числом`)
  }
}

async function loadManifest() {
  const manifestPath = path.resolve("stickers-manifest.json")
  if (!existsSync(manifestPath)) {
    throw new Error(`Манифест не найден: ${manifestPath}`)
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
  if (!Array.isArray(manifest) || manifest.length === 0) {
    throw new Error("Манифест пуст или не является массивом")
  }
  manifest.forEach(validateEntry)
  return manifest
}

async function uploadOne(bucket, stickersDir, entry) {
  const { filename, caseId, id, name, rarity, weight } = entry

  const localPath = path.join(stickersDir, filename)
  if (!existsSync(localPath)) {
    throw new Error(`Файл не найден: ${localPath} (caseId="${caseId}", id="${id}")`)
  }

  const ext = path.extname(filename).toLowerCase()
  const contentType = CONTENT_TYPES[ext]
  if (!contentType) {
    throw new Error(`Неизвестное расширение "${ext}" у файла "${filename}" — добавьте его в CONTENT_TYPES`)
  }

  const storagePath = `stickers/${caseId}/${filename}`
  const file = bucket.file(storagePath)
  const downloadToken = randomUUID()
  const buffer = await readFile(localPath)

  await file.save(buffer, {
    metadata: {
      contentType,
      cacheControl: "public, max-age=31536000",
      metadata: { firebaseStorageDownloadTokens: downloadToken },
    },
  })

  const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`

  console.log(`  ✓ ${filename} → ${storagePath}  [кейс ${caseId}, id "${id}"]`)

  return { id, name, rarity, weight: Number(weight), imageUrl }
}

// Replaces any existing sticker with a matching id (e.g. a mock
// placeholder), appends anything genuinely new, and leaves every sticker
// this manifest run doesn't mention completely untouched.
function mergeStickers(existingStickers, uploadedStickers) {
  const uploadedById = new Map(uploadedStickers.map((s) => [s.id, s]))
  const merged = existingStickers.map((sticker) => uploadedById.get(sticker.id) ?? sticker)
  for (const [id, sticker] of uploadedById) {
    if (!existingStickers.some((s) => s.id === id)) merged.push(sticker)
  }
  return merged
}

async function main() {
  const stickersDir = path.resolve(process.argv[2] || "./stickers-raw")
  if (!existsSync(stickersDir)) {
    throw new Error(`Папка с картинками не найдена: ${stickersDir}`)
  }
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error(
      "Не задана переменная окружения GOOGLE_APPLICATION_CREDENTIALS — укажите путь до JSON-ключа сервисного аккаунта",
    )
  }

  const manifest = await loadManifest()
  console.log(`Манифест: ${manifest.length} записей. Папка с файлами: ${stickersDir}\n`)

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || DEFAULT_STORAGE_BUCKET,
  })
  const db = admin.firestore()
  const bucket = admin.storage().bucket()

  console.log(`Storage bucket: ${bucket.name}\n`)
  console.log("Загрузка файлов...")

  const byCase = new Map() // caseId -> uploaded sticker[]
  for (const entry of manifest) {
    const uploaded = await uploadOne(bucket, stickersDir, entry)
    if (!byCase.has(entry.caseId)) byCase.set(entry.caseId, [])
    byCase.get(entry.caseId).push(uploaded)
  }

  console.log("\nОбновление Firestore...")
  for (const [caseId, uploadedStickers] of byCase) {
    const caseRef = db.collection(STICKER_SETS_COLLECTION).doc(caseId)
    const snapshot = await caseRef.get()
    if (!snapshot.exists) {
      console.warn(`  ! stickerSets/${caseId} не найден — пропущено (${uploadedStickers.length} стикеров не сохранены)`)
      continue
    }

    const existingStickers = Array.isArray(snapshot.data().stickers) ? snapshot.data().stickers : []
    const merged = mergeStickers(existingStickers, uploadedStickers)

    await caseRef.update({ stickers: merged })
    console.log(`  ✓ stickerSets/${caseId}: обновлено ${uploadedStickers.length} стикеров (всего в кейсе: ${merged.length})`)
  }

  console.log("\nГотово.")
}

main().catch((error) => {
  console.error("\nСкрипт завершился с ошибкой:", error.message)
  process.exitCode = 1
})
