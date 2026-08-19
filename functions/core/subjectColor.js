// Backend twin of src/lib/subjects.js's getSubjectColorIndex — kept in sync
// by hand (CommonJS here vs. the frontend's ESM), same split as
// schedule.js's zonedTimeToUtc duplication. Used only by googleCalendar.js
// to pick a colorId; the frontend twin drives tag/chip colors in the UI.
function hashString(value) {
  let hash = 5381
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33 + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

const PALETTE_SIZE = 11

function getSubjectColorIndex(name) {
  if (!name) return 0
  return hashString(name) % PALETTE_SIZE
}

module.exports = { getSubjectColorIndex }
