// One-off backfill: wraps every student's legacy single `schedule` object
// into the new `scheduleSlots` array. Doesn't touch students that already
// have a scheduleSlots array, or students with no schedule at all. Run
// manually with:
//
//   node functions/scripts/migrateSchedule.js
//
// Not wired into `firebase deploy`.

const { db } = require("../core/firestore")

const BATCH_SIZE = 500

async function migrateSchedule() {
  const snapshot = await db.collection("students").get()

  let updated = 0
  let batch = db.batch()
  let opsInBatch = 0

  for (const doc of snapshot.docs) {
    const data = doc.data()
    const hasLegacySchedule = data.schedule && typeof data.schedule === "object"
    const alreadyMigrated = Array.isArray(data.scheduleSlots)

    if (!hasLegacySchedule || alreadyMigrated) {
      continue
    }

    batch.update(doc.ref, { scheduleSlots: [data.schedule] })
    updated += 1
    opsInBatch += 1

    if (opsInBatch >= BATCH_SIZE) {
      await batch.commit()
      batch = db.batch()
      opsInBatch = 0
    }
  }

  if (opsInBatch > 0) {
    await batch.commit()
  }

  console.log(`migrateSchedule: updated ${updated} student document(s)`)
}

migrateSchedule()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("migrateSchedule: failed", error)
    process.exit(1)
  })
