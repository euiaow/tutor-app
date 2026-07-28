import { useState } from "react"
import { Link2, Loader2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
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
    if (!nextOpen) {
      reset()
    }
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
      <Button size="lg" onClick={() => setOpen(true)}>
        <Link2 aria-hidden="true" />
        Добавить ученика по ссылке
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogTitle>Ссылка регистрации ученика</DialogTitle>
          <DialogDescription>
            Создайте одноразовую ссылку и отправьте её ученику в Telegram или VK.
          </DialogDescription>

          {links ? (
            <div className="mt-6 flex flex-col gap-4">
              <CopyableLink label="Telegram" url={links.telegram} />
              <CopyableLink label="VK" url={links.vk} />
            </div>
          ) : (
            <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-foreground">
                Имя ученика
                <input
                  type="text"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  disabled={loading}
                  placeholder="Мария Иванова"
                  autoFocus
                  className="h-11 rounded-xl border-2 border-border bg-secondary/40 px-3.5 text-base font-medium text-foreground outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary focus:bg-card focus:ring-4 focus:ring-primary/15 disabled:opacity-50"
                />
              </label>

              <div
                aria-live="polite"
                className={`flex items-center gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive transition-all ${
                  error ? "opacity-100" : "pointer-events-none h-0 overflow-hidden py-0 opacity-0"
                }`}
              >
                <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>

              <Button
                type="submit"
                size="lg"
                disabled={!studentName.trim() || loading}
                className="h-12"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" aria-hidden="true" />
                    Создаём ссылку...
                  </>
                ) : (
                  "Создать ссылку"
                )}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
