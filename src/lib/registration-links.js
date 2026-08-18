export const TELEGRAM_BOT_USERNAME = "Anst_reg_bot"
export const VK_GROUP = "club240507222"

export function buildRegistrationLinks(token) {
  return {
    telegram: `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${token}`,
    vk: `https://vk.me/${VK_GROUP}?ref=${token}`,
  }
}

// Multi-tenancy Phase 3: self-service signup (no pre-issued token, unlike
// buildRegistrationLinks above) now needs the teacher's slug baked in, since
// the bot itself is shared across every teacher — see
// adapters/telegram.js's "/start signup_{slug}" and adapters/vk.js's
// "регистрация-{slug}" handling.
export function buildSelfServiceLinks(slug) {
  return {
    telegram: `https://t.me/${TELEGRAM_BOT_USERNAME}?start=signup_${slug}`,
    vkGroupUrl: `https://vk.com/${VK_GROUP}`,
    vkSignupCode: `регистрация-${slug}`,
  }
}

// Ready-to-send invite text per platform — what actually gets copied to the
// clipboard everywhere a registration invite is shared (both "Ожидают
// регистрации" and the "Добавить ученика" dialog), not the raw link alone.
export function buildRegistrationMessages(token) {
  const links = buildRegistrationLinks(token)

  return {
    telegram: `Привет! Вот твоя ссылка для регистрации на платформе: ${links.telegram}\nПерейди по ней и следуй инструкциям бота 🎓`,
    vk: `Привет! Вот твоя ссылка для регистрации на платформе: https://vk.me/${VK_GROUP}\nПерейди по ней, напиши боту и первым сообщением отправь вот этот код: ${token}`,
  }
}
