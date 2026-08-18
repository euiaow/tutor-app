import { useState } from "react"
import { Check, Copy, GraduationCap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { buildSelfServiceLinks } from "@/lib/registration-links"

// The first thing a prospective student sees — a QR code at an offline
// event, or a link the teacher shares directly. Rendered only from
// TeacherLanding (/app/:slug) once a real teacher has been resolved by
// slug — no auth, no other data loading, just a static pitch + the two
// signup entry points, both carrying this teacher's slug so the bots know
// who to attribute the new student to (multi-tenancy Phase 3).
export function PublicLanding({ teacher }) {
  const [copied, setCopied] = useState(false)
  const links = buildSelfServiceLinks(teacher.slug)

  async function handleCopyVkCode() {
    try {
      await navigator.clipboard.writeText(links.vkSignupCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch (error) {
      console.error("Failed to copy VK signup code:", error)
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-border bg-[var(--card-opaque)] p-8 text-center shadow-xl shadow-primary/5 sm:p-10">
        <div className="flex flex-col items-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
            <GraduationCap className="size-8" aria-hidden="true" />
          </div>
          <h1 className="mt-6 text-2xl font-extrabold tracking-tight text-foreground text-balance">
            {teacher.name}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground text-pretty">
            Готовлю к ЕГЭ, ОГЭ и школьной программе — индивидуальные занятия,
            разбор тем и практика на реальных вариантах.
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-2 sm:flex-row">
          {/* A real <a> (via base-ui's `render` prop, keeping the exact same
              Button styling) instead of a window.open() click handler — a
              scripted window.open() showed unreliable back-navigation
              behavior after handing off to Telegram on desktop; a native
              anchor is the browser's own trusted mechanism for opening a
              link and doesn't carry that risk. */}
          <Button
            render={<a href={links.telegram} target="_blank" rel="noopener noreferrer" />}
            size="lg"
            className="h-12 flex-1"
          >
            Записаться через Telegram
          </Button>
          <Button
            render={<a href={links.vkGroupUrl} target="_blank" rel="noopener noreferrer" />}
            variant="outline"
            size="lg"
            className="h-12 flex-1"
          >
            Записаться через VK
          </Button>
        </div>

        <div className="mt-4 rounded-2xl border border-border bg-muted px-4 py-3 text-left">
          <p className="text-xs text-muted-foreground">В VK напишите сообществу первым сообщением этот код:</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate text-sm font-semibold text-foreground">{links.vkSignupCode}</code>
            <Button type="button" variant="outline" size="sm" onClick={handleCopyVkCode}>
              {copied ? (
                <>
                  <Check className="size-4" aria-hidden="true" />
                  Скопировано
                </>
              ) : (
                <>
                  <Copy className="size-4" aria-hidden="true" />
                  Скопировать
                </>
              )}
            </Button>
          </div>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Если ты уже заходил(а) в личный кабинет — просто закрой эту вкладку и вернись в свой браузер, ссылка на
          кабинет останется рабочей.
        </p>
      </section>
    </main>
  )
}
