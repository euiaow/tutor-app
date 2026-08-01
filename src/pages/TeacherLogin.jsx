import { useState } from "react"
import { Lock, LoaderCircle, LogIn, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { signInTeacher } from "@/firebase/auth"

// TODO: заменить на реальный email аккаунта преподавателя, созданного
// вручную в Firebase Console → Authentication → Add user
const TEACHER_EMAIL = "Yfcnz200789088067160@yandex.ru"

export function TeacherLogin() {
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!password || loading) return

    setLoading(true)
    setError("")

    try {
      await signInTeacher(TEACHER_EMAIL, password)
    } catch (err) {
      console.error("Failed to sign in:", err)
      setError("Неверный пароль")
      setPassword("")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-border bg-[var(--card-opaque)] p-8 shadow-xl shadow-primary/5 sm:p-10">
        <div className="flex flex-col items-center text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
            <Lock className="size-8" aria-hidden="true" />
          </div>

          <h1 className="mt-6 text-2xl font-extrabold tracking-tight text-foreground text-balance">
            Вход для преподавателя
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-pretty">
            Введите пароль, чтобы открыть панель преподавателя
          </p>
        </div>

        <form className="mt-8 flex flex-col gap-6" onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              if (error) setError("")
            }}
            disabled={loading}
            placeholder="Пароль"
            autoFocus
            aria-label="Пароль"
            className="h-14 rounded-2xl border-2 border-border bg-secondary/40 px-4 text-center text-lg font-semibold text-foreground shadow-sm outline-none transition-all placeholder:text-muted-foreground/40 focus:border-primary focus:bg-card focus:shadow-md focus:ring-4 focus:ring-primary/15 disabled:opacity-50"
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
            disabled={!password || loading}
            className="h-14 rounded-2xl text-base font-bold shadow-lg shadow-primary/20 transition-transform active:scale-[0.98]"
          >
            {loading ? (
              <>
                <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
                Входим...
              </>
            ) : (
              <>
                <LogIn className="size-5" aria-hidden="true" />
                Войти
              </>
            )}
          </Button>
        </form>
      </section>
    </main>
  )
}
