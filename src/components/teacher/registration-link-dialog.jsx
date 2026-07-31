import { useState } from "react"
import { AlertCircle, Plus } from "lucide-react"
import { Field, SolidBtn, TeacherDialog, TeacherDialogContent, TeacherDialogDescription, TeacherDialogTitle, teacherInputCls } from "@/components/teacher/theme-ui"
import { CopyableLink } from "@/components/teacher/copyable-link"
import { generateRegistrationLink } from "@/firebase/registration"
import { buildRegistrationLinks } from "@/lib/registration-links"

export function RegistrationLinkDialog() {
  const [open, setOpen] = useState(false)
  const [studentName, setStudentName] = useState("")
  const [status, setStatus] = useState("idle")
  const [error, setError] = useState("")
  const [token, setToken] = useState(null)

  const loading = status === "loading"
  const links = token ? buildRegistrationLinks(token) : null

  function reset() {
    setStudentName("")
    setStatus("idle")
    setError("")
    setToken(null)
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
            Создайте одноразовую ссылку и отправьте её ученику в Telegram или VK.
          </TeacherDialogDescription>

          {links ? (
            <div className="mt-5 flex flex-col gap-4">
              <CopyableLink label="Telegram" url={links.telegram} />
              <CopyableLink label="VK" url={links.vk} />
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
