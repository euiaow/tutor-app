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

function EditContactUrlPopover({ student, children }) {
  const isTelegram = student.platform === "telegram"
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState("")
  const [saving, setSaving] = useState(false)

  function handleOpenChange(nextOpen) {
    if (nextOpen) {
      setValue(isTelegram ? extractTelegramUsername(student.contactUrl) : (student.contactUrl ?? ""))
    }
    setOpen(nextOpen)
  }

  async function handleSave() {
    if (saving) return
    setSaving(true)
    try {
      const nextContactUrl = isTelegram ? buildTelegramContactUrl(value) : value.trim() || null
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
        {isTelegram ? (
          <Field label="Username в Telegram">
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={saving}
              placeholder="username"
              className={teacherInputCls}
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Просто имя пользователя, например ivanov — без @ и без ссылки
            </p>
          </Field>
        ) : (
          <Field label="Ссылка для связи">
            <input
              type="url"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={saving}
              placeholder="https://t.me/username или https://vk.com/username"
              className={teacherInputCls}
            />
          </Field>
        )}

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
