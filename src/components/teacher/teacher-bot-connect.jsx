import { useEffect, useState } from "react"
import { Check, Copy, Loader2 } from "lucide-react"
import {
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
import { VK_PERSONAL_GROUP, VK_SHARED_GROUP } from "@/lib/registration-links"
import { useVkGroupId } from "@/lib/user-prefs-context"

// null (never assigned a personal community — every new teacher, by design)
// resolves to SHARED here, same direction as registration-links.js's
// resolveVkGroup — this is the teacher's own vkGroupId, not a student's.
function vkCommunityChatUrl(vkGroupId) {
  const group = vkGroupId === VK_PERSONAL_GROUP.id ? VK_PERSONAL_GROUP : VK_SHARED_GROUP
  return `https://vk.ru/im/convo/-${group.id}?entrypoint=profile_page`
}

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

// The link is fetched as soon as the popover opens (same pattern as
// VkConnectBody's code fetch below) rather than on click — a click handler
// that awaits a network call before calling window.open() no longer counts
// as a "direct result of a click" to most browsers' popup blockers, so the
// window.open() silently gets blocked with no visible error. Fetching ahead
// of time lets the button render as a real <a href> instead, which every
// browser always allows regardless of timing (same reasoning as
// contact-button.jsx's ContactLink).
function TelegramConnectBody({ open, onDone }) {
  const [deepLink, setDeepLink] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!open) return

    let cancelled = false
    setDeepLink(null)
    setError(false)
    generateTeacherConnectToken("telegram")
      .then(({ deepLink: link }) => {
        if (!cancelled) setDeepLink(link)
      })
      .catch((err) => {
        console.error("Failed to generate Telegram connect link:", err)
        if (!cancelled) setError(true)
      })

    return () => {
      cancelled = true
    }
  }, [open])

  function handleClick(event) {
    if (window.Telegram?.WebApp?.openLink) {
      event.preventDefault()
      window.Telegram.WebApp.openLink(deepLink)
    }
    onDone()
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-foreground/80">Нажмите кнопку, чтобы подключить Telegram-бота</p>
      {error ? (
        <p className="text-sm font-semibold text-destructive">Не удалось получить ссылку</p>
      ) : (
        // A real <a href> (not SolidBtn's <button>) — needs to be a genuine
        // anchor for the popup-blocker fix above to actually work.
        <a
          href={deepLink ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!deepLink}
          onClick={deepLink ? handleClick : (event) => event.preventDefault()}
          className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:brightness-105 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
          style={{ background: "var(--gradient-orb)", boxShadow: "var(--shadow-soft)" }}
        >
          {deepLink ? "Открыть Telegram" : "Открываем..."}
        </a>
      )}
    </div>
  )
}

// The VK code is fetched as soon as the popover opens — the teacher's next
// step is copying it, not clicking anything first.
function VkConnectBody({ open }) {
  const vkGroupId = useVkGroupId()
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
          onClick={() => openExternalLink(vkCommunityChatUrl(vkGroupId))}
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
// bot-notification channels — lives in the Settings dialog's "Уведомления"
// subsection (moved there from the notifications bell's own dialog, where
// it used to sit directly under the notification list).
export function TeacherBotConnectStatus() {
  const [contact, setContact] = useState({ telegramConnected: false, vkConnected: false })
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    const unsubscribe = subscribeToTeacherContact(setContact, (error) => {
      console.error("Failed to load teacher bot connection status:", error)
      setLoadError(error)
    })
    return unsubscribe
  }, [])

  // A failed read (e.g. a Firestore Rules permission gap on
  // teachers/{uid}/integrations/{doc}) used to be indistinguishable from a
  // genuine "not connected" — the subscription's onError only logged to the
  // console and left `contact` at its default {false, false}, so the row
  // below read as "не подключён" either way. Surfacing the error explicitly
  // here means a status that's actually still correct server-side (bot
  // delivery uses the Admin SDK, which bypasses Rules entirely and would
  // keep working even while this client read fails) doesn't get misread as
  // a real disconnect.
  if (loadError) {
    return (
      <div className="flex flex-col gap-2.5">
        <p className="text-sm text-destructive">
          Не удалось загрузить статус подключения ботов ({loadError.code ?? loadError.message})
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
      <ConnectStatusRow
        label="Telegram"
        platform="telegram"
        connected={contact.telegramConnected}
        renderConnectBody={({ open, onDone }) => <TelegramConnectBody open={open} onDone={onDone} />}
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
