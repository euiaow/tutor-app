// Telegram bots only ever get a numeric chat/user id from the API, never a
// public @username. A numeric id can't be turned into a t.me/<id> link
// (Telegram 302-redirects that to telegram.org, confirmed live) — but it
// *can* be opened via the tg:// custom scheme, which Telegram's own apps
// register as a protocol handler: tg://user?id=<id> opens that user's chat
// directly in the Telegram app on iOS/Android/Desktop. In a plain browser
// with no Telegram app installed, this falls through to telegram.org same
// as before — expected, not a bug, since there's no way to address a
// private chat by internal id over plain HTTP(S) without an app registered
// to handle the scheme.
function isNumericId(value) {
  return /^-?\d+$/.test(value)
}

export function getContactUrl(student) {
  if (!student) return null
  if (student.contactUrl) return student.contactUrl

  if (student.platform === "telegram" && student.telegramChatId) {
    return isNumericId(student.telegramChatId)
      ? `tg://user?id=${student.telegramChatId}`
      : `https://t.me/${student.telegramChatId}`
  }

  if (student.platform === "vk" && student.vkPeerId) {
    return `https://vk.com/im?sel=${student.vkPeerId}`
  }

  return null
}

// True when the button is about to open the auto-derived Telegram link
// (tg://user?id=... or t.me/username) rather than a teacher-set override —
// used to visually flag "this is our best guess, not a confirmed link".
export function isDefaultTelegramContact(student) {
  return Boolean(student && student.platform === "telegram" && student.telegramChatId && !student.contactUrl)
}
