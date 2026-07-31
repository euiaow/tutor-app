import { GraduationCap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TELEGRAM_BOT_USERNAME, VK_GROUP } from "@/lib/registration-links"

const SIGNUP_TELEGRAM_URL = `https://t.me/${TELEGRAM_BOT_USERNAME}?start=signup`
const SIGNUP_VK_URL = `https://vk.com/${VK_GROUP}`

// The first thing a stranger sees — a QR code at an offline event, or
// someone poking at /app in a plain browser with no Telegram context at
// all. No auth, no data loading, just a static pitch + two signup entry
// points that hand off to the same bot-driven registration flow the
// teacher already uses for everyone else.
export function PublicLanding() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-xl shadow-primary/5 sm:p-10">
        <div className="flex flex-col items-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
            <GraduationCap className="size-8" aria-hidden="true" />
          </div>
          <h1 className="mt-6 text-2xl font-extrabold tracking-tight text-foreground text-balance">
            Princess School — репетитор по русскому языку и литературе
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
            render={<a href={SIGNUP_TELEGRAM_URL} target="_blank" rel="noopener noreferrer" />}
            size="lg"
            className="h-12 flex-1"
          >
            Записаться через Telegram
          </Button>
          <Button
            render={<a href={SIGNUP_VK_URL} target="_blank" rel="noopener noreferrer" />}
            variant="outline"
            size="lg"
            className="h-12 flex-1"
          >
            Записаться через VK
          </Button>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Если ты уже заходил(а) в личный кабинет — просто закрой эту вкладку и вернись в свой браузер, ссылка на
          кабинет останется рабочей.
        </p>
      </section>
    </main>
  )
}
