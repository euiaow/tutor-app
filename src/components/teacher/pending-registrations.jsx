import { useEffect, useState } from "react"
import { Check, Copy, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  cancelRegistrationToken,
  subscribeToPendingRegistrationTokens,
} from "@/firebase/registration"
import { buildRegistrationLinks, VK_GROUP } from "@/lib/registration-links"

function formatDate(timestamp) {
  if (!timestamp?.toDate) {
    return "только что"
  }

  return timestamp.toDate().toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function PendingRegistrationItem({ item }) {
  const [cancelling, setCancelling] = useState(false)
  const [copiedChannel, setCopiedChannel] = useState(null)
  const links = buildRegistrationLinks(item.token)

  const telegramMessage = `Привет! Вот твоя ссылка для регистрации на платформе: ${links.telegram}\nПерейди по ней и следуй инструкциям бота 🎓`
  const vkMessage = `Привет! Вот твоя ссылка для регистрации на платформе: https://vk.me/${VK_GROUP}\nПерейди по ней, напиши боту и первым сообщением отправь вот этот код: ${item.token}`

  async function handleCopy(channel, message) {
    try {
      await navigator.clipboard.writeText(message)
      setCopiedChannel(channel)
      setTimeout(() => setCopiedChannel((cur) => (cur === channel ? null : cur)), 1800)
    } catch (error) {
      console.error("Failed to copy link:", error)
    }
  }

  async function handleCancel() {
    const confirmed = window.confirm(
      `Удалить приглашение для «${item.studentName}»? Ссылка перестанет работать.`,
    )
    if (!confirmed) return

    setCancelling(true)
    try {
      await cancelRegistrationToken(item.token)
    } catch (error) {
      console.error("Failed to cancel registration token:", error)
      window.alert("Не удалось удалить ссылку. Попробуйте ещё раз")
      setCancelling(false)
    }
  }

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate font-semibold text-card-foreground">{item.studentName}</p>
        <p className="text-xs text-muted-foreground">Ссылка создана {formatDate(item.createdAt)}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => handleCopy("vk", vkMessage)}>
          {copiedChannel === "vk" ? (
            <>
              <Check aria-hidden="true" />
              Скопировано
            </>
          ) : (
            <>
              <Copy aria-hidden="true" />
              Ссылка ВК
            </>
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => handleCopy("tg", telegramMessage)}
        >
          {copiedChannel === "tg" ? (
            <>
              <Check aria-hidden="true" />
              Скопировано
            </>
          ) : (
            <>
              <Copy aria-hidden="true" />
              Ссылка ТГ
            </>
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={handleCancel}
          disabled={cancelling}
          aria-label={`Удалить приглашение для ${item.studentName}`}
          className="shrink-0 text-muted-foreground hover:text-destructive"
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
    </li>
  )
}

export function PendingRegistrations() {
  const [tokens, setTokens] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const unsubscribe = subscribeToPendingRegistrationTokens(
      (data) => {
        setTokens(data)
        setLoading(false)
      },
      (firestoreError) => {
        console.error("Failed to load pending registrations:", firestoreError)
        setError("Не удалось загрузить список ожидающих регистрации")
        setLoading(false)
      },
    )

    return unsubscribe
  }, [])

  if (loading) {
    return <Spinner label="Загрузка ожидающих регистрации..." />
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="font-semibold text-destructive">{error}</p>
      </div>
    )
  }

  if (tokens.length === 0) {
    return null
  }

  return (
    <section aria-label="Ожидают регистрации" className="flex flex-col gap-3">
      <h2 className="text-lg font-bold text-foreground">Ожидают регистрации</h2>
      <ul className="flex flex-col gap-3">
        {tokens.map((item) => (
          <PendingRegistrationItem key={item.token} item={item} />
        ))}
      </ul>
    </section>
  )
}
