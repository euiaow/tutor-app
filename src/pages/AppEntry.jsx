import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Spinner } from "@/components/ui/spinner"
import { SelfServiceSignup } from "@/components/self-service-signup"
import { PublicLanding } from "@/pages/PublicLanding"
import { findStudentIdByTelegramUserId } from "@/firebase/students"

function getTelegramUserId() {
  return window.Telegram?.WebApp?.initDataUnsafe?.user?.id ?? null
}

// Single entry point for both the Telegram Mini App menu button and a
// public QR code at offline events — resolves which of three screens to
// show at load time, then never re-checks (a redirect or one of the two
// static screens is the only thing this component ever renders).
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
      setScreen("landing")
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

        setScreen("signup")
      })
      .catch((error) => {
        console.error("Failed to resolve Telegram student:", error)
        if (!cancelled) setScreen("signup")
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

  if (screen === "signup") {
    return <SelfServiceSignup />
  }

  return <PublicLanding />
}
