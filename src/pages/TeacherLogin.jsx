import { useState } from "react"
import { LoaderCircle, LogIn, AlertCircle } from "lucide-react"
import { signInTeacher } from "@/firebase/auth"
import { usePageTitle } from "@/lib/usePageTitle"

// Same layout/copy structure and glass-card treatment as the student login
// screen (components/auth/login-screen.jsx) — ported on request, swapping
// only the copy (teacher-specific) and the accent (teacher-theme's rose
// --gradient-orb instead of the student page's orange --gradient-warm).
// Email + password fields rather than PinInput's 4-digit grid: teacher
// auth is real Firebase email+password (signInTeacher), not a numeric
// access code. Multi-tenancy: the email field used to be a hardcoded
// TEACHER_EMAIL constant from back when there was only ever one teacher
// account — a second teacher's real password against that fixed email
// always failed as "wrong password" no matter what they typed. Removed;
// both fields now come from the form.
export function TeacherLogin() {
  usePageTitle("Вход")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email || !password || loading) return

    setLoading(true)
    setError("")

    try {
      await signInTeacher(email, password)
    } catch (err) {
      console.error("Failed to sign in:", err)
      setError("Неверный email или пароль")
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
        <p className="mt-2 text-sm text-muted-foreground">Введите email и пароль, чтобы открыть панель преподавателя</p>

        <form className="mt-7 flex flex-col gap-3" onSubmit={handleSubmit}>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (error) setError("")
            }}
            disabled={loading}
            autoFocus
            aria-label="Email"
            placeholder="Email"
            className="glass-tile h-16 w-full rounded-3xl text-center font-display text-2xl text-foreground outline-none transition-shadow focus:ring-2 focus:ring-ring/60 disabled:opacity-60"
          />

          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              if (error) setError("")
            }}
            disabled={loading}
            aria-label="Пароль"
            placeholder="Пароль"
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
            disabled={!email || !password || loading}
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
