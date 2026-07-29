import { useEffect, useState } from "react"
import { Video, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { subscribeToVideoCallUrl, updateVideoCallUrl } from "@/firebase/videoCall"

export function VideoCallSettings() {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState("")
  const [value, setValue] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const unsub = subscribeToVideoCallUrl(
      (data) => setUrl(data ?? ""),
      (error) => console.error("Failed to load video call url:", error),
    )
    return () => unsub()
  }, [])

  function handleOpenChange(nextOpen) {
    if (nextOpen) {
      setValue(url)
    }
    setOpen(nextOpen)
  }

  async function handleSave() {
    if (saving) return
    setSaving(true)
    try {
      await updateVideoCallUrl(value.trim() || null)
      setOpen(false)
    } catch (error) {
      console.error("Failed to update video call url:", error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        className="flex h-11 items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
        title="Ссылка на видеозвонок"
      >
        <Video className="size-4" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-muted-foreground">Ссылка на видеозвонок</span>
          <input
            type="url"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={saving}
            placeholder="https://telemost.yandex.ru/..."
            className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground outline-none disabled:opacity-50"
          />
          <p className="text-xs text-muted-foreground">
            Одна постоянная ссылка для всех уроков — покажется рядом с ближайшими уроками.
          </p>
          <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : "Сохранить"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
