export function openExternalLink(url) {
  if (window.Telegram?.WebApp?.openLink) {
    window.Telegram.WebApp.openLink(url)
  } else {
    window.open(url, "_blank", "noopener,noreferrer")
  }
}
