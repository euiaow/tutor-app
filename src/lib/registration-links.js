const TELEGRAM_BOT_USERNAME = "Anst_reg_bot"
const VK_GROUP = "club240507222"

export function buildRegistrationLinks(token) {
  return {
    telegram: `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${token}`,
    vk: `https://vk.me/${VK_GROUP}?ref=${token}`,
  }
}
