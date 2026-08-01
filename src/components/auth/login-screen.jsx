import { useState } from "react"
import { LoaderCircle, LogIn, AlertCircle } from "lucide-react"
import { PinInput } from "@/components/auth/pin-input"
import { StudentGrainBackground } from "@/components/student-grain-background"
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
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-5 py-14">
      <StudentGrainBackground />

      {/* Now that StudentGrainBackground sits behind this screen too, the
          earlier --card-opaque point-fix (needed only because there was no
          decorative backdrop) no longer applies — switched to the mockup's
          own translucent `glass` utility, explicitly requested. */}
      <section className="glass relative w-full max-w-sm rounded-4xl p-7 sm:p-9">
        <h1 className="font-display text-3xl leading-tight text-foreground">Вход в ученический портал</h1>
        <p className="mt-2 text-sm text-muted-foreground">Введите персональный код доступа, чтобы продолжить</p>

        {success ? (
          <div className="mt-7 rounded-3xl bg-chart-3/10 p-6 text-center" role="status">
            <p className="text-base font-bold text-foreground">Код принят!</p>
            <p className="mt-1 text-sm text-muted-foreground">Добро пожаловать обратно.</p>
          </div>
        ) : (
          <form
            className="mt-7"
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
              className={`mt-4 flex items-center justify-center gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive transition-all ${
                error ? "opacity-100" : "pointer-events-none h-0 overflow-hidden py-0 opacity-0"
              }`}
            >
              <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>

            <button
              type="submit"
              disabled={!isComplete || loading}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-4 text-sm font-medium text-destructive-foreground transition-transform hover:scale-[1.01] disabled:opacity-55 disabled:hover:scale-100"
              style={{ background: "var(--gradient-warm)", boxShadow: "var(--shadow-soft)" }}
            >
              {loading ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Проверяем...
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4" aria-hidden="true" />
                  Войти
                </>
              )}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
          Код доступа можно узнать у преподавателя.
        </p>
      </section>
    </main>
  )
}
