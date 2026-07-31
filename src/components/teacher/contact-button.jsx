import { useState } from "react"
import { Loader2, MessageCircle, MoreHorizontal } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { Field, TeacherCancelBtn, TeacherModalFooter, TeacherSaveBtn, teacherInputCls } from "@/components/teacher/theme-ui"
import { getContactUrl, isDefaultTelegramContact } from "@/lib/contact"
import { openExternalLink } from "@/lib/telegramWebApp"
import { updateStudentContactUrl } from "@/firebase/students"

function EditContactUrlForm({ student, onDone }) {
  const [value, setValue] = useState(student.contactUrl ?? "")
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (saving) return
    setSaving(true)
    try {
      await updateStudentContactUrl(student.id, value.trim() || null)
      onDone()
    } catch (error) {
      console.error("Failed to update contact url:", error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="glass-tile mt-2 flex flex-col gap-2 rounded-[1.25rem] p-3">
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
      <p className="text-xs text-muted-foreground">
        Ссылка откроется в мессенджере при клике. Используй t.me/username для Telegram или
        vk.com/im?sel=ID для ВКонтакте.
      </p>
      <TeacherModalFooter className="pt-0">
        <TeacherCancelBtn onClick={onDone} disabled={saving} />
        <TeacherSaveBtn onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mx-auto size-4 animate-spin" aria-hidden="true" /> : "Сохранить"}
        </TeacherSaveBtn>
      </TeacherModalFooter>
    </div>
  )
}

export function ContactButton({ student }) {
  const [editing, setEditing] = useState(false)
  const url = getContactUrl(student)
  const isDefaultTelegram = Boolean(url) && isDefaultTelegramContact(student)

  async function handleReset() {
    try {
      await updateStudentContactUrl(student.id, null)
    } catch (error) {
      console.error("Failed to reset contact url:", error)
    }
  }

  return (
    <div className="flex flex-col">
      <div className="glass-tile inline-flex items-center overflow-hidden rounded-full">
        {url ? (
          <button
            type="button"
            onClick={() => openExternalLink(url)}
            title={isDefaultTelegram ? "Ссылка определена автоматически" : "Написать ученику"}
            className={
              "inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold transition " +
              (isDefaultTelegram ? "text-[color:var(--balance-warn)]" : "text-foreground/80 hover:text-rose-deep")
            }
          >
            <MessageCircle className="size-3.5" aria-hidden="true" />
            Написать
          </button>
        ) : (
          <button
            type="button"
            disabled
            title="Ученик не подключил бота. Задайте ссылку вручную."
            className="inline-flex cursor-not-allowed items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-muted-foreground/50"
          >
            <MessageCircle className="size-3.5" aria-hidden="true" />
            Связь не настроена
          </button>
        )}

        <span className="h-5 w-px bg-glass-border" />

        <DropdownMenu>
          <DropdownMenuTrigger
            className="grid size-8 place-items-center text-muted-foreground transition hover:text-rose-deep"
            aria-label="Сменить ссылку для связи"
            title="Сменить ссылку для связи"
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="teacher-theme glass-panel rounded-[1.25rem] border-glass-border p-1.5">
            <DropdownMenuItem
              onClick={() => setEditing(true)}
              className="rounded-[0.75rem] text-foreground/80 data-[highlighted]:bg-glass-strong data-[highlighted]:text-rose-deep"
            >
              Изменить ссылку
            </DropdownMenuItem>
            {student.contactUrl ? (
              <DropdownMenuItem
                onClick={handleReset}
                className="rounded-[0.75rem] text-foreground/80 data-[highlighted]:bg-glass-strong data-[highlighted]:text-rose-deep"
              >
                Сбросить к исходной
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {editing ? <EditContactUrlForm student={student} onDone={() => setEditing(false)} /> : null}
    </div>
  )
}
