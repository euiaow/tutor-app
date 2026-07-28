import { useState } from "react"
import { GraduationCap, LoaderCircle, LogIn, AlertCircle } from "lucide-react"
import { PinInput } from "@/components/auth/pin-input"
import { Button } from "@/components/ui/button"
import { verifyStudentAccessCode } from "@/firebase/students"

export function LoginScreen({ studentId, onSuccess }) {
  const [pin, setPin] = useState(["", "", "", ""])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const code = pin.join("")
  const isComplete = code.length === 4

  const handleSubmit = async () => {
    if (!isComplete || loading) return
    setLoading(true)
    setError("")

    try {
      const isValid = await verifyStudentAccessCode(studentId, code)

      if (isValid) {
        localStorage.setItem(`auth_${studentId}`, "true")
        setSuccess(true)
        setTimeout(() => onSuccess?.(), 600)
      } else {
        setError("Неверный код доступа")
        setPin(["", "", "", ""])
      }
    } catch (err) {
      console.error("Failed to verify access code:", err)
      setError("Не удалось проверить код. Попробуйте ещё раз")
      setPin(["", "", "", ""])
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-xl shadow-primary/5 sm:p-10">
        <div className="flex flex-col items-center text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
            <GraduationCap className="size-8" aria-hidden="true" />
          </div>

          <h1 className="mt-6 text-2xl font-extrabold tracking-tight text-foreground text-balance">
            Вход в ученический портал
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-pretty">
            Введите персональный код доступа, чтобы продолжить
          </p>
        </div>

        {success ? (
          <div className="mt-8 rounded-2xl bg-chart-3/10 p-6 text-center" role="status">
            <p className="text-base font-bold text-foreground">Код принят!</p>
            <p className="mt-1 text-sm text-muted-foreground">Добро пожаловать обратно.</p>
          </div>
        ) : (
          <form
            className="mt-8 flex flex-col gap-6"
            onSubmit={(e) => {
              e.preventDefault()
              handleSubmit()
            }}
          >
            <PinInput
              value={pin}
              onChange={(next) => {
                setPin(next)
                if (error) setError("")
              }}
              hasError={!!error}
              disabled={loading}
              onComplete={() => {
                if (!loading) setTimeout(handleSubmit, 100)
              }}
            />

            <div
              aria-live="polite"
              className={`flex items-center justify-center gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive transition-all ${
                error ? "opacity-100" : "pointer-events-none h-0 overflow-hidden py-0 opacity-0"
              }`}
            >
              <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>

            <Button
              type="submit"
              size="lg"
              disabled={!isComplete || loading}
              className="h-14 rounded-2xl text-base font-bold shadow-lg shadow-primary/20 transition-transform active:scale-[0.98]"
            >
              {loading ? (
                <>
                  <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
                  Проверяем...
                </>
              ) : (
                <>
                  <LogIn className="size-5" aria-hidden="true" />
                  Войти
                </>
              )}
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Код доступа можно узнать у преподавателя.
        </p>
      </section>
    </main>
  )
}
