import { GraduationCap } from "lucide-react"

// Multi-tenancy Phase 3: replaces the old blind self-service-signup prompt
// (deleted — used to hand out a bare "/start signup" command that isn't
// enough to identify a teacher any more) for both AppEntry cases where no
// slug is known: a recognized-but-unregistered Telegram Mini App user, and
// a plain /app hit with no Telegram context at all. Neither can safely
// guess which teacher to attribute a new student to, so both now just point
// the visitor back to their tutor for a real personal link.
export function RegistrationNotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-border bg-[var(--card-opaque)] p-8 text-center shadow-xl shadow-primary/5 sm:p-10">
        <div className="flex flex-col items-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
            <GraduationCap className="size-8" aria-hidden="true" />
          </div>
          <h1 className="mt-6 text-2xl font-extrabold tracking-tight text-foreground text-balance">
            Похоже, вы ещё не зарегистрированы
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground text-pretty">
            Попросите вашего репетитора прислать вам персональную ссылку для регистрации.
          </p>
        </div>
      </section>
    </main>
  )
}
