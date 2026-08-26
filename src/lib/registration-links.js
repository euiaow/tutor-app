// Two Telegram bots as of the Telegram personal/shared split (by analogy
// with the VK split below): PERSONAL is the original bot, SHARED is the new
// bot every other teacher's students register through. Usernames must stay
// in sync with the matching constants in functions/core/teacherConnect.js
// (backend can't import this ESM module, so the two are hand-kept parallel,
// not shared code).
export const TELEGRAM_PERSONAL_BOT = { key: "personal", username: "Anst_reg_bot" }
export const TELEGRAM_SHARED_BOT = { key: "shared", username: "Askk_edu_bot" }

// telegramBotKey here is always the *teacher's own* teachers/{uid}.telegramBotKey
// ("personal" | "shared" | null) — every function in this file builds a link
// for one of HER students, never a student's own field. null means "never
// explicitly given the personal bot", which by design is every new teacher
// — so it resolves to SHARED, the opposite default from a *student's* own
// vkGroupId/telegramBotKey fallback (see functions/core/reminderUtils.js,
// which protects pre-split legacy student records by falling back to
// PERSONAL instead — a genuinely different population than "teacher never
// assigned one").
function resolveTelegramBot(telegramBotKey) {
  return telegramBotKey === TELEGRAM_PERSONAL_BOT.key ? TELEGRAM_PERSONAL_BOT : TELEGRAM_SHARED_BOT
}

// Two VK communities as of the VK personal/shared split: PERSONAL is the
// original, fully-customized community, SHARED is the new community every
// other teacher's students register through. Ids/screen names must stay in
// sync with the matching constants in functions/adapters/vk.js (backend
// can't import this ESM module, so the two are hand-kept parallel, not
// shared code).
export const VK_PERSONAL_GROUP = { id: "240507222", screenName: "club240507222" }
export const VK_SHARED_GROUP = { id: "241047499", screenName: "askoedu" }

// Same reasoning as resolveTelegramBot above — vkGroupId here is always the
// *teacher's own* vkGroupId; null means "never assigned the personal
// community" (every new teacher, by design) and resolves to SHARED.
function resolveVkGroup(vkGroupId) {
  return vkGroupId === VK_PERSONAL_GROUP.id ? VK_PERSONAL_GROUP : VK_SHARED_GROUP
}

// `telegramBotKey`/`vkGroupId` are the *teacher's* own
// teachers/{uid}.telegramBotKey/vkGroupId — which bot/community a
// prospective student is sent to for registration.
export function buildRegistrationLinks(token, vkGroupId, telegramBotKey) {
  const vkGroup = resolveVkGroup(vkGroupId)
  const telegramBot = resolveTelegramBot(telegramBotKey)
  return {
    telegram: `https://t.me/${telegramBot.username}?start=${token}`,
    vk: `https://vk.me/${vkGroup.screenName}?ref=${token}`,
  }
}

// Multi-tenancy Phase 3: self-service signup (no pre-issued token, unlike
// buildRegistrationLinks above) now needs the teacher's slug baked in, since
// both bots are shared across every teacher — see adapters/telegram.js's
// "/start signup_{slug}" and adapters/vk.js's "регистрация-{slug}" handling.
export function buildSelfServiceLinks(slug, vkGroupId, telegramBotKey) {
  const vkGroup = resolveVkGroup(vkGroupId)
  const telegramBot = resolveTelegramBot(telegramBotKey)
  return {
    telegram: `https://t.me/${telegramBot.username}?start=signup_${slug}`,
    vkGroupUrl: `https://vk.com/${vkGroup.screenName}`,
    vkSignupCode: `регистрация-${slug}`,
  }
}

// Ready-to-send invite text per platform — what actually gets copied to the
// clipboard everywhere a registration invite is shared (both "Ожидают
// регистрации" and the "Добавить ученика" dialog), not the raw link alone.
export function buildRegistrationMessages(token, vkGroupId, telegramBotKey) {
  const links = buildRegistrationLinks(token, vkGroupId, telegramBotKey)
  const vkGroup = resolveVkGroup(vkGroupId)

  return {
    telegram: `Привет! Вот твоя ссылка для регистрации на платформе: ${links.telegram}\nПерейди по ней и следуй инструкциям бота 🎓`,
    vk: `Привет! Вот твоя ссылка для регистрации на платформе: https://vk.me/${vkGroup.screenName}\nПерейди по ней, напиши боту и первым сообщением отправь вот этот код: ${token}`,
  }
}
