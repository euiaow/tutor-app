import { useEffect, useState } from "react"
import { Check, Copy, Link2, Trash2 } from "lucide-react"
import { GhostBtn, Panel, Title } from "@/components/teacher/theme-ui"
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
    <li className="glass-tile flex flex-wrap items-center gap-3 rounded-[1.5rem] px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-ink">{item.studentName}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">Ссылка создана {formatDate(item.createdAt)}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <GhostBtn onClick={() => handleCopy("vk", vkMessage)} className="px-3.5 py-2">
          {copiedChannel === "vk" ? (
            <>
              <Check className="size-3.5" aria-hidden="true" /> Скопировано
            </>
          ) : (
            <>
              <Link2 className="size-3.5" aria-hidden="true" /> Ссылка ВК
            </>
          )}
        </GhostBtn>
        <GhostBtn onClick={() => handleCopy("tg", telegramMessage)} className="px-3.5 py-2">
          {copiedChannel === "tg" ? (
            <>
              <Check className="size-3.5" aria-hidden="true" /> Скопировано
            </>
          ) : (
            <>
              <Copy className="size-3.5" aria-hidden="true" /> Ссылка ТГ
            </>
          )}
        </GhostBtn>
        <button
          type="button"
          onClick={handleCancel}
          disabled={cancelling}
          aria-label={`Удалить приглашение для ${item.studentName}`}
          className="text-muted-foreground/70 transition hover:text-destructive disabled:opacity-50"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
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

  if (loading || error || tokens.length === 0) {
    if (loading) {
      return (
        <Panel>
          <p className="text-sm text-muted-foreground">Загрузка ожидающих регистрации...</p>
        </Panel>
      )
    }
    if (error) {
      return (
        <Panel>
          <p className="text-sm font-semibold text-destructive">{error}</p>
        </Panel>
      )
    }
    return null
  }

  return (
    <Panel>
      <Title>Ожидают регистрации</Title>
      <ul className="mt-4 space-y-3">
        {tokens.map((item) => (
          <PendingRegistrationItem key={item.token} item={item} />
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Ученик появится в списке автоматически после регистрации по ссылке.
      </p>
    </Panel>
  )
}
