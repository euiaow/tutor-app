import { useEffect, useState } from "react"
import { Clock, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { CopyableLink } from "@/components/teacher/copyable-link"
import {
  cancelRegistrationToken,
  subscribeToPendingRegistrationTokens,
} from "@/firebase/registration"
import { buildRegistrationLinks } from "@/lib/registration-links"

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
  const links = buildRegistrationLinks(item.token)

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
    <li className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-card-foreground">{item.studentName}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="size-3.5" aria-hidden="true" />
          {formatDate(item.createdAt)}
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:max-w-sm">
          <CopyableLink label="Telegram" url={links.telegram} />
          <CopyableLink label="VK" url={links.vk} />
        </div>
      </div>

      <Button
        type="button"
        variant="destructive"
        size="sm"
        onClick={handleCancel}
        disabled={cancelling}
        className="shrink-0"
      >
        <Trash2 aria-hidden="true" />
        {cancelling ? "Удаляем..." : "Удалить"}
      </Button>
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
