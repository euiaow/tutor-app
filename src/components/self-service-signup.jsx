import { useState } from "react"
import { Copy, Check, GraduationCap } from "lucide-react"
import { Button } from "@/components/ui/button"

const SIGNUP_COMMAND = "/start signup"

// Only ever rendered from AppEntry when we're inside a Telegram Mini App
// (a telegramUserId was found) but no student is linked to it yet — so the
// instruction here is Telegram-specific, not a general "pick your
// platform" screen. window.Telegram.WebApp has no API to send a chat
// message as the user (only sendData, which the bot doesn't listen for),
// so the reliable path is "copy the command, paste it yourself" rather
// than trying to fake a tap.
export function SelfServiceSignup() {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(SIGNUP_COMMAND)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch (error) {
      console.error("Failed to copy signup command:", error)
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
            Похоже, ты ещё не зарегистрирован(а)
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-pretty">
            Напиши боту в этот чат команду, чтобы начать регистрацию:
          </p>
        </div>

        <div className="mt-6 flex items-center gap-2 rounded-2xl border border-border bg-muted px-4 py-3">
          <code className="flex-1 truncate text-sm font-semibold text-foreground">{SIGNUP_COMMAND}</code>
          <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
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

        <p className="mt-6 text-center text-xs text-muted-foreground">
          После регистрации открой кнопку меню ещё раз — кабинет откроется автоматически.
        </p>
      </section>
    </main>
  )
}
