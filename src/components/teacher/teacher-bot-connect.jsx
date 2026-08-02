import { useEffect, useState } from "react"
import { Check, Copy, Loader2 } from "lucide-react"
import {
  SolidBtn,
  TeacherCancelBtn,
  TeacherDialog,
  TeacherDialogContent,
  TeacherDialogDescription,
  TeacherDialogTitle,
  TeacherModalFooter,
  TeacherPopover,
  TeacherPopoverContent,
  TeacherPopoverTrigger,
} from "@/components/teacher/theme-ui"
import {
  disconnectTeacherPlatform,
  generateTeacherConnectToken,
  subscribeToTeacherContact,
} from "@/firebase/teacherConnect"
import { openExternalLink } from "@/lib/telegramWebApp"

const VK_COMMUNITY_CHAT_URL = "https://vk.ru/im/convo/-240507222?entrypoint=profile_page"

// Same shape as student-row.jsx's DeleteStudentDialog / pending-
// registrations.jsx's CancelRegistrationDialog — reused by pattern. Opened
// from a control that already lives inside the notifications bell's own
// open TeacherDialog, so `elevated` is required here, not optional (see
// TeacherDialogContent's own comment on why).
function DisconnectConfirmDialog({ platform, label, open, onOpenChange }) {
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState("")

  function handleOpenChange(nextOpen) {
    if (disconnecting) return
    onOpenChange(nextOpen)
    if (!nextOpen) setError("")
  }

  async function handleConfirm() {
    if (disconnecting) return
    setDisconnecting(true)
    setError("")
    try {
      await disconnectTeacherPlatform(platform)
      handleOpenChange(false)
    } catch (err) {
      console.error(`Failed to disconnect ${platform}:`, err)
      setError(err?.message || "Не удалось сбросить подключение")
      setDisconnecting(false)
    }
  }

  return (
    <TeacherDialog open={open} onOpenChange={handleOpenChange}>
      <TeacherDialogContent elevated>
        <TeacherDialogTitle>Сбросить подключение {label}?</TeacherDialogTitle>
        <TeacherDialogDescription>
          Уведомления перестанут приходить в этот канал, пока не подключите его заново.
        </TeacherDialogDescription>

        {error ? <p className="mt-2 text-sm font-semibold text-destructive">{error}</p> : null}

        <TeacherModalFooter className="mt-5">
          <TeacherCancelBtn onClick={() => handleOpenChange(false)} disabled={disconnecting} />
          <button
            type="button"
            onClick={handleConfirm}
            disabled={disconnecting}
            className="rounded-full bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {disconnecting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Сбрасываем...
              </span>
            ) : (
              "Сбросить"
            )}
          </button>
        </TeacherModalFooter>
      </TeacherDialogContent>
    </TeacherDialog>
  )
}

function TelegramConnectBody({ onDone }) {
  const [loading, setLoading] = useState(false)

  async function handleConnect() {
    setLoading(true)
    try {
      const { deepLink } = await generateTeacherConnectToken("telegram")
      window.open(deepLink, "_blank", "noopener,noreferrer")
      onDone()
    } catch (error) {
      console.error("Failed to generate Telegram connect link:", error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-foreground/80">Нажмите кнопку, чтобы подключить Telegram-бота</p>
      <SolidBtn onClick={handleConnect} disabled={loading}>
        {loading ? "Открываем..." : "Открыть Telegram"}
      </SolidBtn>
    </div>
  )
}

// The VK code is fetched as soon as the popover opens — the teacher's next
// step is copying it, not clicking anything first.
function VkConnectBody({ open }) {
  const [code, setCode] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }

    let cancelled = false
    generateTeacherConnectToken("vk")
      .then(({ code: newCode }) => {
        if (!cancelled) setCode(newCode)
      })
      .catch((error) => console.error("Failed to generate VK connect code:", error))

    return () => {
      cancelled = true
    }
  }, [open])

  async function handleCopy() {
    if (!code) return
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-foreground/80">
        Скопируйте код и отправьте его в{" "}
        <button
          type="button"
          onClick={() => openExternalLink(VK_COMMUNITY_CHAT_URL)}
          className="font-semibold text-primary underline underline-offset-2 hover:text-rose-deep"
        >
          сообщения нашего сообщества ВК
        </button>
      </p>
      <div className="glass-tile flex items-center justify-between gap-2 rounded-full px-4 py-2.5">
        <span className="min-w-0 break-all font-mono text-sm text-ink">{code ?? "…"}</span>
        <button
          type="button"
          onClick={handleCopy}
          disabled={!code}
          aria-label="Скопировать код"
          className="text-muted-foreground transition hover:text-rose-deep disabled:opacity-40"
        >
          {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
        </button>
      </div>
    </div>
  )
}

// Connected state needs no popover at all — status text and "Сбросить
// подключение" both sit directly in the row, always visible, so resetting a
// connection doesn't require an extra click to reveal it first. Only the
// "not connected" state opens a Popover (to connect).
function ConnectStatusRow({ label, platform, connected, renderConnectBody, popoverClassName }) {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  if (connected) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        <Check className="size-3.5 text-primary" aria-hidden="true" />
        <span className="text-foreground/80">Бот {label} подключён</span>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="ml-1 font-semibold text-muted-foreground underline underline-offset-2 hover:text-destructive"
        >
          Сбросить подключение
        </button>

        <DisconnectConfirmDialog platform={platform} label={label} open={confirmOpen} onOpenChange={setConfirmOpen} />
      </div>
    )
  }

  return (
    <TeacherPopover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <TeacherPopoverTrigger
        render={
          <button type="button" className="flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">Бот {label} не подключён</span>
            <span className="font-semibold text-primary hover:underline">Подключить →</span>
          </button>
        }
      />
      <TeacherPopoverContent align="start" className={popoverClassName}>
        {renderConnectBody({ open: popoverOpen, onDone: () => setPopoverOpen(false) })}
      </TeacherPopoverContent>
    </TeacherPopover>
  )
}

// Two independent connection statuses (Telegram/VK) for the teacher's own
// bot-notification channels — lives under the notification list in
// TeacherNotificationsBell's dialog.
export function TeacherBotConnectStatus() {
  const [contact, setContact] = useState({ telegramConnected: false, vkConnected: false })

  useEffect(() => {
    const unsubscribe = subscribeToTeacherContact(setContact, (error) =>
      console.error("Failed to load teacher bot connection status:", error),
    )
    return unsubscribe
  }, [])

  return (
    <div className="flex flex-col gap-2.5 border-t border-glass-border pt-3">
      <ConnectStatusRow
        label="Telegram"
        platform="telegram"
        connected={contact.telegramConnected}
        renderConnectBody={({ onDone }) => <TelegramConnectBody onDone={onDone} />}
      />
      <ConnectStatusRow
        label="ВК"
        platform="vk"
        connected={contact.vkConnected}
        popoverClassName="w-96"
        renderConnectBody={({ open }) => <VkConnectBody open={open} />}
      />
    </div>
  )
}
