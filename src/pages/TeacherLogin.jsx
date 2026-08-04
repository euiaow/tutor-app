import { useState } from "react"
import { LoaderCircle, LogIn, AlertCircle } from "lucide-react"
import { signInTeacher } from "@/firebase/auth"
import { usePageTitle } from "@/lib/usePageTitle"

// TODO: заменить на реальный email аккаунта преподавателя, созданного
// вручную в Firebase Console → Authentication → Add user
const TEACHER_EMAIL = "Yfcnz200789088067160@yandex.ru"

// Same layout/copy structure and glass-card treatment as the student login
// screen (components/auth/login-screen.jsx) — ported on request, swapping
// only the copy (teacher-specific) and the accent (teacher-theme's rose
// --gradient-orb instead of the student page's orange --gradient-warm).
// The input itself stays a single password field rather than PinInput's
// 4-digit grid: teacher auth is Firebase email+password (signInTeacher),
// not a numeric access code, so porting PinInput's UI would break real
// passwords longer than 4 characters.
export function TeacherLogin() {
  usePageTitle("Вход")
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
    <main className="teacher-theme relative grid min-h-dvh place-items-center overflow-hidden px-5 py-14">
      <div aria-hidden className="bg-grain-blobs">
        <div className="blob-a" />
        <div className="blob-b" />
        <div className="grain-layer" />
      </div>

      <section className="glass-panel relative w-full max-w-sm rounded-4xl p-7 sm:p-9">
        <h1 className="font-display text-3xl leading-tight text-foreground">Вход для преподавателя</h1>
        <p className="mt-2 text-sm text-muted-foreground">Введите пароль, чтобы открыть панель преподавателя</p>

        <form className="mt-7" onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              if (error) setError("")
            }}
            disabled={loading}
            autoFocus
            aria-label="Пароль"
            className="glass-tile h-16 w-full rounded-3xl text-center font-display text-2xl text-foreground outline-none transition-shadow focus:ring-2 focus:ring-ring/60 disabled:opacity-60"
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
            disabled={!password || loading}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-4 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.01] disabled:opacity-55 disabled:hover:scale-100"
            style={{ background: "var(--gradient-orb)", boxShadow: "var(--shadow-soft)" }}
          >
            {loading ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                Входим...
              </>
            ) : (
              <>
                <LogIn className="h-4 w-4" aria-hidden="true" />
                Войти
              </>
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
          Доступ есть только у преподавателя.
        </p>
      </section>
    </main>
  )
}
