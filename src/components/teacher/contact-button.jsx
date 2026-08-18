import { useState } from "react"
import { MessageCircle, MoreHorizontal } from "lucide-react"
import {
  Field,
  TeacherCancelBtn,
  TeacherModalFooter,
  TeacherPopover,
  TeacherPopoverContent,
  TeacherPopoverTrigger,
  TeacherSaveBtn,
  teacherInputCls,
} from "@/components/teacher/theme-ui"
import { buildTelegramContactUrl, extractTelegramUsername, getContactUrl } from "@/lib/contact"
import { updateStudentContactUrl } from "@/firebase/students"

// A real <a href> (not a programmatic window.open()) — mobile browsers only
// reliably hand off custom-scheme links (tg://user?id=..., and whatever
// App Link/Universal Link a t.me/vk.com URL resolves to) to the installed
// native app when the navigation is a direct result of a click on an actual
// anchor, not a scripted window.open() call. Inside the Telegram Mini App
// itself, window.Telegram.WebApp.openLink() is still used instead — that's
// the SDK's own sanctioned navigation path, not the window.open() bug this
// is fixing, so the click is intercepted only in that one case.
function ContactLink({ url, className, title, ariaLabel, children }) {
  if (!url) {
    return (
      <button type="button" disabled title={title} aria-label={ariaLabel} className={className}>
        {children}
      </button>
    )
  }

  function handleClick(event) {
    if (window.Telegram?.WebApp?.openLink) {
      event.preventDefault()
      window.Telegram.WebApp.openLink(url)
    }
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      title={title}
      aria-label={ariaLabel}
      className={className}
    >
      {children}
    </a>
  )
}

// A full https://t.me/... link (not the numeric tg://user?id=... form a
// bot-registered student without a manual override falls back to) is the
// only contactUrl shape this form re-derives a bare username from — every
// other shape (vk.com link, tg://, a custom URL) round-trips through the
// raw link field instead.
function isTelegramUsernameLink(url) {
  return /^https:\/\/t\.me\//i.test(url ?? "")
}

// Bare "t.me/username" / "vk.com/username" (no protocol) is a plausible
// paste — add https:// so the stored contactUrl is always a real URL.
// Anything else (already has a protocol, or an unrecognized shape) is
// stored exactly as typed, per spec — never blocks unusual input.
function normalizeRawLink(value) {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^(t\.me|vk\.com)\//i.test(trimmed)) {
    return `https://${trimmed}`
  }
  return trimmed
}

function EditContactUrlPopover({ student, children }) {
  const [open, setOpen] = useState(false)
  const [linkValue, setLinkValue] = useState("")
  const [usernameValue, setUsernameValue] = useState("")
  const [saving, setSaving] = useState(false)

  function handleOpenChange(nextOpen) {
    if (nextOpen) {
      if (isTelegramUsernameLink(student.contactUrl)) {
        setUsernameValue(extractTelegramUsername(student.contactUrl))
        setLinkValue("")
      } else {
        setUsernameValue("")
        setLinkValue(student.contactUrl ?? "")
      }
    }
    setOpen(nextOpen)
  }

  async function handleSave() {
    if (saving) return

    // Telegram username field wins when filled — same reasoning as the
    // old Telegram-only form: a bare username is easier to paste
    // correctly than a full link. Both empty means "don't touch the
    // existing value", not "clear it".
    let nextContactUrl
    if (usernameValue.trim()) {
      nextContactUrl = buildTelegramContactUrl(usernameValue)
    } else if (linkValue.trim()) {
      nextContactUrl = normalizeRawLink(linkValue)
    } else {
      setOpen(false)
      return
    }

    setSaving(true)
    try {
      await updateStudentContactUrl(student.id, nextContactUrl)
      setOpen(false)
    } catch (error) {
      console.error("Failed to update contact url:", error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <TeacherPopover open={open} onOpenChange={handleOpenChange}>
      {children}
      <TeacherPopoverContent>
        <Field label="Ссылка">
          <input
            type="text"
            value={linkValue}
            onChange={(e) => setLinkValue(e.target.value)}
            disabled={saving}
            placeholder="https://t.me/username или https://vk.com/username"
            className={teacherInputCls}
          />
        </Field>

        <Field label="Telegram username (без ссылки)">
          <input
            type="text"
            value={usernameValue}
            onChange={(e) => setUsernameValue(e.target.value)}
            disabled={saving}
            placeholder="username"
            className={teacherInputCls}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Если заполнено — используется вместо поля "Ссылка", без @ и без ссылки
          </p>
        </Field>

        <TeacherModalFooter>
          <TeacherCancelBtn onClick={() => setOpen(false)} disabled={saving} />
          <TeacherSaveBtn onClick={handleSave} disabled={saving}>
            {saving ? "Сохраняем..." : "Сохранить"}
          </TeacherSaveBtn>
        </TeacherModalFooter>
      </TeacherPopoverContent>
    </TeacherPopover>
  )
}

// Used in "Ближайшие уроки" — icon only, no menu. Настройка ссылки отсюда
// недоступна: если её ещё нет, кнопка просто disabled.
export function ContactIconButton({ student }) {
  const url = getContactUrl(student)

  return (
    <ContactLink
      url={url}
      title={url ? "Написать ученику" : "Связь не настроена"}
      ariaLabel="Написать ученику"
      className="glass-tile grid size-9 shrink-0 place-items-center rounded-full text-foreground/80 transition hover:text-rose-deep disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-foreground/80"
    >
      <MessageCircle className="size-4" aria-hidden="true" />
    </ContactLink>
  )
}

// Used in "Ученики" (collapsed + expanded row) — "Написать" text button
// (disabled only when there's no link to open) plus a "..." button that's
// always enabled and opens the link-editing popover regardless of whether
// a link is currently set.
export function ContactButton({ student }) {
  const url = getContactUrl(student)

  return (
    <div className="glass-tile inline-flex items-center overflow-hidden rounded-full">
      <ContactLink
        url={url}
        title={url ? "Написать ученику" : "Связь не настроена"}
        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-foreground/80 transition hover:text-rose-deep disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-foreground/80"
      >
        <MessageCircle className="size-3.5" aria-hidden="true" />
        Написать
      </ContactLink>

      <span className="h-5 w-px bg-glass-border" />

      <EditContactUrlPopover student={student}>
        <TeacherPopoverTrigger
          render={
            <button
              type="button"
              aria-label="Изменить ссылку для связи"
              title="Изменить ссылку для связи"
              className="grid size-8 place-items-center text-muted-foreground transition hover:text-rose-deep"
            >
              <MoreHorizontal className="size-4" aria-hidden="true" />
            </button>
          }
        />
      </EditContactUrlPopover>
    </div>
  )
}
