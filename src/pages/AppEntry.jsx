import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Spinner } from "@/components/ui/spinner"
import { RegistrationNotFound } from "@/components/registration-not-found"
import { findStudentIdByTelegramUserId } from "@/firebase/students"

function getTelegramUserId() {
  return window.Telegram?.WebApp?.initDataUnsafe?.user?.id ?? null
}

// Entry point for the Telegram Mini App menu button — shared across every
// teacher's bot, so (multi-tenancy Phase 3) it can only ever do the
// "already-known Telegram user → their own dashboard" redirect; it can no
// longer offer blind self-service signup for an unrecognized user, since
// there's no way to know which teacher to attribute a new student to from
// here. The per-teacher signup entry point is /app/:slug (TeacherLanding),
// a sibling route, not something this component redirects to.
export function AppEntry() {
  const [screen, setScreen] = useState("checking")
  const navigate = useNavigate()

  useEffect(() => {
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.ready()
      window.Telegram.WebApp.expand()
    }

    const telegramUserId = getTelegramUserId()

    if (!telegramUserId) {
      // Opened outside the Telegram Mini App context entirely (a stray
      // link/bookmark to bare /app) — same "can't identify a teacher"
      // reasoning as the not-found case below applies here too.
      setScreen("not-found")
      return
    }

    let cancelled = false

    findStudentIdByTelegramUserId(telegramUserId)
      .then((studentId) => {
        if (cancelled) return

        if (studentId) {
          navigate(`/student/${studentId}?skipPin=true`, { replace: true })
          return
        }

        setScreen("not-found")
      })
      .catch((error) => {
        console.error("Failed to resolve Telegram student:", error)
        if (!cancelled) setScreen("not-found")
      })

    return () => {
      cancelled = true
    }
  }, [navigate])

  if (screen === "checking") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-4">
        <Spinner label="Загрузка..." />
      </main>
    )
  }

  return <RegistrationNotFound />
}
