import { useRef, useState } from "react";
import { KeyRound, Loader2, LogIn } from "lucide-react";
import { GrainBackground } from "@/components/GrainBackground";

export function LoginCard({ loading = false }: { loading?: boolean }) {
  const [digits, setDigits] = useState(["", "", "", ""]);
  const [pending, setPending] = useState(loading);
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  const busy = loading || pending;
  const filled = digits.every((d) => d !== "");

  function setDigit(i: number, value: string) {
    const v = value.replace(/\D/g, "").slice(-1);
    setDigits((prev) => prev.map((d, idx) => (idx === i ? v : d)));
    if (v && i < 3) refs.current[i + 1]?.focus();
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-5 py-14">
      <GrainBackground />

      <section className="glass relative w-full max-w-sm rounded-4xl p-7 sm:p-9">
        <div className="glass-soft grid h-14 w-14 place-items-center rounded-full">
          <KeyRound className="h-5 w-5 text-primary" />
        </div>

        <h1 className="mt-6 text-3xl leading-tight">Вход в аккаунт</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Введите 4-значный код доступа
        </p>

        <form
          className="mt-7"
          onSubmit={(e) => {
            e.preventDefault();
            setPending(true);
          }}
        >
          <div className="grid grid-cols-4 gap-3" aria-busy={busy}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                value={d}
                onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Backspace" && !digits[i] && i > 0)
                    refs.current[i - 1]?.focus();
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                aria-label={`Цифра ${i + 1}`}
                disabled={busy}
                className="glass-inset h-16 rounded-3xl text-center font-display text-2xl text-foreground outline-none transition-shadow focus:ring-2 focus:ring-ring/60 disabled:opacity-60"
              />
            ))}
          </div>

          <button
            type="submit"
            disabled={busy || !filled}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-4 text-sm font-medium text-destructive-foreground transition-transform hover:scale-[1.01] disabled:opacity-55 disabled:hover:scale-100"
            style={{ background: "var(--gradient-warm)", boxShadow: "var(--shadow-soft)" }}
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Проверяем код…
              </>
            ) : (
              <>
                <LogIn className="h-4 w-4" />
                Войти
              </>
            )}
          </button>
        </form>

        {busy && (
          <div className="glass-inset mt-5 flex items-center gap-3 rounded-3xl px-4 py-3">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inset-0 animate-ping rounded-full bg-primary/70" />
              <span className="relative h-2.5 w-2.5 rounded-full bg-primary" />
            </span>
            <p className="text-xs text-secondary-foreground">
              Проверяем доступ — это займёт пару секунд
            </p>
          </div>
        )}

        <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
          Код доступа можно узнать у преподавателя
        </p>
      </section>
    </main>
  );
}
