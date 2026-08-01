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
import { getContactUrl } from "@/lib/contact"
import { openExternalLink } from "@/lib/telegramWebApp"
import { updateStudentContactUrl } from "@/firebase/students"

function EditContactUrlPopover({ student, children }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState("")
  const [saving, setSaving] = useState(false)

  function handleOpenChange(nextOpen) {
    if (nextOpen) setValue(student.contactUrl ?? "")
    setOpen(nextOpen)
  }

  async function handleSave() {
    if (saving) return
    setSaving(true)
    try {
      await updateStudentContactUrl(student.id, value.trim() || null)
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
    <button
      type="button"
      disabled={!url}
      onClick={() => url && openExternalLink(url)}
      title={url ? "Написать ученику" : "Связь не настроена"}
      aria-label="Написать ученику"
      className="glass-tile grid size-9 shrink-0 place-items-center rounded-full text-foreground/80 transition hover:text-rose-deep disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-foreground/80"
    >
      <MessageCircle className="size-4" aria-hidden="true" />
    </button>
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
      <button
        type="button"
        disabled={!url}
        onClick={() => url && openExternalLink(url)}
        title={url ? "Написать ученику" : "Связь не настроена"}
        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-foreground/80 transition hover:text-rose-deep disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-foreground/80"
      >
        <MessageCircle className="size-3.5" aria-hidden="true" />
        Написать
      </button>

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
