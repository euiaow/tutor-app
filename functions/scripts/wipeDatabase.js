// One-off full reset ahead of rebuilding the account structure from
// scratch (2 real teacher accounts + 10 cloned demo accounts — see the
// planned cloneTeacher.js companion script, not written yet).
//
// Deletes every Firestore top-level collection EXCEPT stickerSets (the
// global sticker catalog — not owned by any teacher, re-seeded separately
// via scripts/uploadStickers.js, not user data), clears every Storage file
// under materials/** (homework/material uploads), and deletes every
// Firebase Auth user (all teacher logins).
//
// SAFETY: dry-run by default. Nothing is touched unless you pass BOTH
// --mode=execute AND --confirm=WIPE_EVERYTHING. Always run --mode=report
// first and actually read the printed counts before ever running execute.
// There is no undo — the counts are your only chance to catch a surprise
// (e.g. a collection you forgot existed, an Auth user count higher than
// you expected) before it's gone for good.
//
//   node functions/scripts/wipeDatabase.js --mode=report
//   node functions/scripts/wipeDatabase.js --mode=execute --confirm=WIPE_EVERYTHING
//
// This environment has no local Admin SDK credentials (no ADC/service
// account) — same situation noted in migrateToPrograms.js. To actually run
// this, either run it from a machine with real ADC (gcloud auth
// application-default login, or GOOGLE_APPLICATION_CREDENTIALS pointing at
// a service account key for the right project), or wrap it as a temporary
// guarded onRequest function per this project's established one-off-script
// convention (techContext.md) — deploy, curl once, delete immediately
// after use. Given the blast radius here, running it locally with a
// confirmation prompt you control is strongly preferred over a public
// (even guarded) HTTPS endpoint.
//
// Recommended: run `gcloud firestore export gs://<bucket>/backups/<date>`
// before --mode=execute. Costs nothing meaningful and is the only way back
// if cloning/rebuilding afterwards turns up something you needed.

const { db } = require("../core/firestore")
const { getStorage } = require("firebase-admin/storage")
const { getAuth } = require("firebase-admin/auth")

// stickerSets: global catalog (functions/core/gamification.js), not
// per-teacher data — deliberately kept, not an oversight.
const EXCLUDED_COLLECTIONS = new Set(["stickerSets"])

// The only Storage path this codebase ever writes to (functions/core/
// lessons.js uploadHomeworkFile, functions/core/students.js cleanup) —
// see functions/core/students.js:326 for the existing per-student use of
// getStorage().bucket(), mirrored here.
const STORAGE_PREFIXES = ["materials/"]

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, value] = arg.replace(/^--/, "").split("=")
      return [key, value ?? true]
    }),
  )
  return {
    mode: args.mode === "execute" ? "execute" : "report",
    confirmed: args.confirm === "WIPE_EVERYTHING",
  }
}

async function reportCollections() {
  const collections = await db.listCollections()
  const counts = []
  for (const collection of collections) {
    if (EXCLUDED_COLLECTIONS.has(collection.id)) continue
    const snapshot = await collection.count().get()
    counts.push({ collection: collection.id, docCount: snapshot.data().count })
  }
  return counts
}

async function reportStorage() {
  const bucket = getStorage().bucket()
  const results = []
  for (const prefix of STORAGE_PREFIXES) {
    const [files] = await bucket.getFiles({ prefix })
    results.push({ prefix, fileCount: files.length })
  }
  return results
}

async function reportAuthUsers() {
  let count = 0
  let pageToken
  do {
    const result = await getAuth().listUsers(1000, pageToken)
    count += result.users.length
    pageToken = result.pageToken
  } while (pageToken)
  return count
}

async function deleteCollections() {
  const collections = await db.listCollections()
  let deleted = 0
  for (const collection of collections) {
    if (EXCLUDED_COLLECTIONS.has(collection.id)) {
      console.log(`wipeDatabase: skipping excluded collection "${collection.id}"`)
      continue
    }
    console.log(`wipeDatabase: deleting collection "${collection.id}"...`)
    await db.recursiveDelete(collection)
    deleted += 1
  }
  return deleted
}

async function deleteStorageFiles() {
  const bucket = getStorage().bucket()
  let deleted = 0
  for (const prefix of STORAGE_PREFIXES) {
    const [files] = await bucket.getFiles({ prefix })
    for (const file of files) {
      await file.delete()
      deleted += 1
    }
  }
  return deleted
}

async function deleteAllAuthUsers() {
  let deleted = 0
  let pageToken
  do {
    const result = await getAuth().listUsers(1000, pageToken)
    if (result.users.length > 0) {
      const uids = result.users.map((user) => user.uid)
      const deleteResult = await getAuth().deleteUsers(uids)
      deleted += deleteResult.successCount
      if (deleteResult.failureCount > 0) {
        console.error(
          `wipeDatabase: ${deleteResult.failureCount} auth user(s) failed to delete:`,
          deleteResult.errors,
        )
      }
    }
    pageToken = result.pageToken
  } while (pageToken)
  return deleted
}

async function run() {
  const { mode, confirmed } = parseArgs()

  if (mode === "report") {
    console.log("wipeDatabase: DRY RUN — nothing will be touched.\n")

    const collections = await reportCollections()
    console.log("Firestore collections that WOULD be deleted (recursively, incl. subcollections):")
    collections.forEach(({ collection, docCount }) => console.log(`  - ${collection}: ${docCount} doc(s)`))
    console.log(`\nExcluded (kept as-is): ${[...EXCLUDED_COLLECTIONS].join(", ")}`)

    const storage = await reportStorage()
    console.log("\nStorage files that WOULD be deleted:")
    storage.forEach(({ prefix, fileCount }) => console.log(`  - ${prefix}: ${fileCount} file(s)`))

    const authCount = await reportAuthUsers()
    console.log(`\nFirebase Auth users that WOULD be deleted: ${authCount}`)

    console.log("\nNothing was touched. Re-run with --mode=execute --confirm=WIPE_EVERYTHING to actually delete all of this.")
    return
  }

  if (!confirmed) {
    console.error("wipeDatabase: refusing to execute without --confirm=WIPE_EVERYTHING")
    process.exit(1)
  }

  console.log("wipeDatabase: EXECUTING — this is irreversible.\n")

  const deletedCollections = await deleteCollections()
  console.log(`\nwipeDatabase: deleted ${deletedCollections} collection(s) (recursively).`)

  const deletedFiles = await deleteStorageFiles()
  console.log(`wipeDatabase: deleted ${deletedFiles} Storage file(s).`)

  const deletedUsers = await deleteAllAuthUsers()
  console.log(`wipeDatabase: deleted ${deletedUsers} Auth user(s).`)

  console.log("\nwipeDatabase: done.")
}

module.exports = {
  reportCollections,
  reportStorage,
  reportAuthUsers,
  deleteCollections,
  deleteStorageFiles,
  deleteAllAuthUsers,
}

// Only runs when invoked directly (`node functions/scripts/wipeDatabase.js`)
// — see the file header for why this needs real ADC to run at all.
if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("wipeDatabase: failed", error)
      process.exit(1)
    })
}
