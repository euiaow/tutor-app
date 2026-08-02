import { useState } from "react"
import { AlertCircle, Check, Copy, Plus } from "lucide-react"
import { Field, GhostBtn, SolidBtn, TeacherDialog, TeacherDialogContent, TeacherDialogDescription, TeacherDialogTitle, teacherInputCls } from "@/components/teacher/theme-ui"
import { generateRegistrationLink } from "@/firebase/registration"
import { buildRegistrationMessages } from "@/lib/registration-links"

export function RegistrationLinkDialog() {
  const [open, setOpen] = useState(false)
  const [studentName, setStudentName] = useState("")
  const [status, setStatus] = useState("idle")
  const [error, setError] = useState("")
  const [token, setToken] = useState(null)
  const [copiedChannel, setCopiedChannel] = useState(null)

  const loading = status === "loading"
  const messages = token ? buildRegistrationMessages(token) : null

  function reset() {
    setStudentName("")
    setStatus("idle")
    setError("")
    setToken(null)
    setCopiedChannel(null)
  }

  function handleOpenChange(nextOpen) {
    setOpen(nextOpen)
    if (!nextOpen) reset()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!studentName.trim() || loading) return

    setStatus("loading")
    setError("")

    try {
      const generatedToken = await generateRegistrationLink(studentName.trim())
      setToken(generatedToken)
      setStatus("success")
    } catch (err) {
      console.error("Failed to generate registration link:", err)
      setError(err?.message || "Не удалось создать ссылку регистрации")
      setStatus("error")
    }
  }

  async function handleCopy(channel, message) {
    try {
      await navigator.clipboard.writeText(message)
      setCopiedChannel(channel)
      setTimeout(() => setCopiedChannel((cur) => (cur === channel ? null : cur)), 1800)
    } catch (err) {
      console.error("Failed to copy invite text:", err)
    }
  }

  return (
    <>
      <SolidBtn onClick={() => setOpen(true)}>
        <Plus className="size-3.5" aria-hidden="true" />
        Добавить ученика
      </SolidBtn>

      <TeacherDialog open={open} onOpenChange={handleOpenChange}>
        <TeacherDialogContent>
          <TeacherDialogTitle>Ссылка регистрации ученика</TeacherDialogTitle>
          <TeacherDialogDescription>
            Создайте приглашение и отправьте его ученику в Telegram или VK.
          </TeacherDialogDescription>

          {messages ? (
            <div className="mt-5 flex flex-col gap-3">
              <GhostBtn onClick={() => handleCopy("vk", messages.vk)} className="justify-center py-2.5">
                {copiedChannel === "vk" ? (
                  <>
                    <Check className="size-3.5" aria-hidden="true" /> Скопировано
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5" aria-hidden="true" /> Скопировать приглашение для регистрации в VK
                  </>
                )}
              </GhostBtn>
              <GhostBtn onClick={() => handleCopy("tg", messages.telegram)} className="justify-center py-2.5">
                {copiedChannel === "tg" ? (
                  <>
                    <Check className="size-3.5" aria-hidden="true" /> Скопировано
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5" aria-hidden="true" /> Скопировать приглашение для регистрации в Telegram
                  </>
                )}
              </GhostBtn>
            </div>
          ) : (
            <form className="mt-5 flex flex-col gap-4" onSubmit={handleSubmit}>
              <Field label="Имя ученика">
                <input
                  type="text"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  disabled={loading}
                  placeholder="Мария Иванова"
                  autoFocus
                  className={teacherInputCls}
                />
              </Field>

              {error ? (
                <div className="flex items-center gap-2 rounded-[1rem] bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
                  <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              ) : null}

              <SolidBtn type="submit" className="w-full justify-center py-3 text-sm" disabled={!studentName.trim() || loading}>
                {loading ? "Создаём ссылку..." : "Создать ссылку"}
              </SolidBtn>
            </form>
          )}
        </TeacherDialogContent>
      </TeacherDialog>
    </>
  )
}
