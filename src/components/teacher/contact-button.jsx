import { useState } from "react"
import { MessageCircle, MoreHorizontal, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
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
    <div className="mt-2 flex flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-sm">
      <input
        type="url"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={saving}
        placeholder="https://t.me/username или https://vk.com/username"
        className="h-10 rounded-lg border-2 border-border bg-secondary/40 px-3 text-sm font-medium text-foreground outline-none transition-all focus:border-primary focus:bg-card focus:ring-4 focus:ring-primary/15 disabled:opacity-50"
      />
      <p className="text-xs text-muted-foreground">
        Ссылка откроется в мессенджере при клике. Используй t.me/username для Telegram или
        vk.com/im?sel=ID для ВКонтакте.
      </p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" className="flex-1" onClick={onDone} disabled={saving}>
          Отмена
        </Button>
        <Button type="button" size="sm" className="flex-1" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : "Сохранить"}
        </Button>
      </div>
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
      <div className="flex h-9 items-stretch overflow-hidden rounded-lg border border-border bg-secondary">
        {url ? (
          <button
            type="button"
            onClick={() => openExternalLink(url)}
            className={`flex flex-1 items-center justify-center gap-1.5 px-3 text-sm font-semibold transition-colors ${
              isDefaultTelegram
                ? "bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100"
                : "text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            <MessageCircle className="size-4" aria-hidden="true" />
            Написать
          </button>
        ) : (
          <button
            type="button"
            disabled
            title="Ученик не подключил бота. Задайте ссылку вручную."
            className="flex flex-1 items-center justify-center gap-1.5 px-3 text-sm font-semibold text-muted-foreground opacity-60"
          >
            <MessageCircle className="size-4" aria-hidden="true" />
            Связь не настроена
          </button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex w-9 shrink-0 items-center justify-center border-l border-border text-secondary-foreground transition-colors hover:bg-secondary/80"
            aria-label="Ещё"
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => setEditing(true)}>Изменить ссылку</DropdownMenuItem>
            {student.contactUrl ? (
              <DropdownMenuItem onClick={handleReset}>Сбросить к исходной</DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {editing ? <EditContactUrlForm student={student} onDone={() => setEditing(false)} /> : null}
    </div>
  )
}
