import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { Spinner } from "@/components/ui/spinner"
import { PublicLanding } from "@/pages/PublicLanding"
import { getTeacherBySlug } from "@/firebase/teachers"

// Multi-tenancy Phase 3: /app/:slug is the public, per-teacher landing page
// (QR codes, offline intensives, a link the teacher shares directly) — a
// sibling of /app (no slug, the shared Telegram bot menu button, see
// AppEntry.jsx), not a replacement for it. Looks the teacher up by slug via
// a public callable (no Firestore Rules can grant an anonymous visitor a
// direct read here, by design — see getTeacherBySlug in functions/index.js).
export function TeacherLanding() {
  const { slug } = useParams()
  const [state, setState] = useState({ status: "loading", teacher: null })

  useEffect(() => {
    let cancelled = false

    getTeacherBySlug(slug)
      .then((teacher) => {
        if (cancelled) return
        setState({ status: teacher ? "found" : "not-found", teacher })
      })
      .catch((error) => {
        console.error("Failed to load teacher by slug:", error)
        if (!cancelled) setState({ status: "not-found", teacher: null })
      })

    return () => {
      cancelled = true
    }
  }, [slug])

  if (state.status === "loading") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-4">
        <Spinner label="Загрузка..." />
      </main>
    )
  }

  if (state.status === "not-found") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10 text-center">
        <p className="text-sm text-muted-foreground">Страница не найдена</p>
      </main>
    )
  }

  return <PublicLanding teacher={state.teacher} />
}
