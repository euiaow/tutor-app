import { useEffect, useState } from "react"
import { Check, Copy, Link2, Loader2, Trash2 } from "lucide-react"
import {
  GhostBtn,
  Panel,
  TeacherCancelBtn,
  TeacherDialog,
  TeacherDialogContent,
  TeacherDialogDescription,
  TeacherDialogTitle,
  TeacherModalFooter,
  Title,
} from "@/components/teacher/theme-ui"
import {
  cancelRegistrationToken,
  subscribeToPendingRegistrationTokens,
} from "@/firebase/registration"
import { buildRegistrationMessages } from "@/lib/registration-links"

// Same shape as student-row.jsx's DeleteStudentDialog — reused by pattern,
// not by import, since that one is private to student-row.jsx and keyed off
// studentId/studentName rather than a registration token.
function CancelRegistrationDialog({ token, studentName, open, onOpenChange }) {
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState("")

  function handleOpenChange(nextOpen) {
    if (cancelling) return
    onOpenChange(nextOpen)
    if (!nextOpen) setError("")
  }

  async function handleConfirm() {
    if (cancelling) return
    setCancelling(true)
    setError("")
    try {
      await cancelRegistrationToken(token)
      handleOpenChange(false)
    } catch (err) {
      console.error("Failed to cancel registration token:", err)
      setError(err?.message || "Не удалось удалить ссылку. Попробуйте ещё раз")
      setCancelling(false)
    }
  }

  return (
    <TeacherDialog open={open} onOpenChange={handleOpenChange}>
      <TeacherDialogContent>
        <TeacherDialogTitle>Удалить приглашение для {studentName}?</TeacherDialogTitle>
        <TeacherDialogDescription>Ссылка перестанет работать.</TeacherDialogDescription>

        {error ? <p className="mt-2 text-sm font-semibold text-destructive">{error}</p> : null}

        <TeacherModalFooter className="mt-5">
          <TeacherCancelBtn onClick={() => handleOpenChange(false)} disabled={cancelling} />
          <button
            type="button"
            onClick={handleConfirm}
            disabled={cancelling}
            className="rounded-full bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cancelling ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Удаляем...
              </span>
            ) : (
              "Удалить"
            )}
          </button>
        </TeacherModalFooter>
      </TeacherDialogContent>
    </TeacherDialog>
  )
}

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
  const [copiedChannel, setCopiedChannel] = useState(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const { telegram: telegramMessage, vk: vkMessage } = buildRegistrationMessages(item.token)

  async function handleCopy(channel, message) {
    try {
      await navigator.clipboard.writeText(message)
      setCopiedChannel(channel)
      setTimeout(() => setCopiedChannel((cur) => (cur === channel ? null : cur)), 1800)
    } catch (error) {
      console.error("Failed to copy link:", error)
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
          onClick={() => setConfirmOpen(true)}
          aria-label={`Удалить приглашение для ${item.studentName}`}
          className="text-muted-foreground/70 transition hover:text-destructive"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
      </div>

      <CancelRegistrationDialog
        token={item.token}
        studentName={item.studentName}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
      />
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
