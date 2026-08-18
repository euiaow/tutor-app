import { useEffect, useState } from "react"
import { Video } from "lucide-react"
import { Field, TeacherDialog, TeacherDialogContent, TeacherDialogDescription, TeacherDialogTitle, TeacherModalFooter, TeacherSaveBtn, teacherInputCls } from "@/components/teacher/theme-ui"
import { subscribeToVideoCallUrl, updateVideoCallUrl } from "@/firebase/videoCall"
import { auth } from "@/firebase/firebase"

export function VideoCallSettings() {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState("")
  const [value, setValue] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const uid = auth.currentUser?.uid
    if (!uid) return

    const unsub = subscribeToVideoCallUrl(
      uid,
      (data) => setUrl(data ?? ""),
      (error) => console.error("Failed to load video call url:", error),
    )
    return () => unsub()
  }, [])

  function handleOpenChange(nextOpen) {
    if (nextOpen) setValue(url)
    setOpen(nextOpen)
  }

  async function handleSave() {
    if (saving) return
    const uid = auth.currentUser?.uid
    if (!uid) return

    setSaving(true)
    try {
      await updateVideoCallUrl(uid, value.trim() || null)
      setOpen(false)
    } catch (error) {
      console.error("Failed to update video call url:", error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <TeacherDialog open={open} onOpenChange={handleOpenChange}>
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        title="Ссылка на видеозвонок"
        className="glass-tile grid size-10 place-items-center rounded-full text-foreground/70"
      >
        <Video className="size-4" aria-hidden="true" />
      </button>

      <TeacherDialogContent>
        <TeacherDialogTitle>Ссылка на видеозвонок</TeacherDialogTitle>
        <TeacherDialogDescription>
          Одна постоянная ссылка для всех уроков — покажется рядом с ближайшими уроками.
        </TeacherDialogDescription>

        <div className="mt-5 flex flex-col gap-4">
          <Field label="Ссылка">
            <input
              type="url"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={saving}
              placeholder="https://telemost.yandex.ru/..."
              className={teacherInputCls}
            />
          </Field>

          <TeacherModalFooter className="grid-cols-1">
            <TeacherSaveBtn onClick={handleSave} disabled={saving}>
              {saving ? "Сохраняем..." : "Сохранить"}
            </TeacherSaveBtn>
          </TeacherModalFooter>
        </div>
      </TeacherDialogContent>
    </TeacherDialog>
  )
}
