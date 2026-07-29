// Telegram bots only ever get a numeric chat/user id from the API, never a
// public @username — a t.me/<numeric id> link is not a real Telegram deep
// link (confirmed live: it 302s to telegram.org, which is exactly the
// "wrong link" symptom this was written to fix), so a raw-numeric
// telegramChatId can't be turned into a working link on its own. Only a
// non-numeric value (i.e. an actual username, which nothing in this app
// currently captures automatically) is worth linking to; otherwise fall
// through to null so the UI honestly shows "Связь не настроена" instead of
// a link that silently goes nowhere useful. The manual contactUrl override
// remains the practical way to set a working link for these students.
function isNumericId(value) {
  return /^-?\d+$/.test(value)
}

export function getContactUrl(student) {
  if (!student) return null
  if (student.contactUrl) return student.contactUrl

  if (student.platform === "telegram" && student.telegramChatId && !isNumericId(student.telegramChatId)) {
    return `https://t.me/${student.telegramChatId}`
  }

  if (student.platform === "vk" && student.vkPeerId) {
    return `https://vk.com/im?sel=${student.vkPeerId}`
  }

  return null
}
