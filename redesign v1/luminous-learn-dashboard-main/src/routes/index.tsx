import { createFileRoute } from "@tanstack/react-router";
import {
  Bell,
  Clock,
  Paperclip,
  Sparkles,
  CalendarClock,
  X,
  ChevronRight,
} from "lucide-react";
import bgGlass from "@/assets/bg-glass.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Личный кабинет ученика — Lumina" },
      {
        name: "description",
        content:
          "Дашборд ученика: ближайший урок, домашние задания, материалы и прогресс обучения.",
      },
      { property: "og:title", content: "Личный кабинет ученика — Lumina" },
      {
        property: "og:description",
        content: "Ближайший урок, домашки, материалы и прогресс в одном месте.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const materials = [
  "Памятка поступившему с общежитием 2025.pdf",
  "cbh.cpp.txt",
  "piev_52021904331396.pdf",
];

function Dashboard() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <img
        src={bgGlass}
        alt=""
        aria-hidden="true"
        width={1920}
        height={1280}
        className="pointer-events-none fixed inset-0 h-full w-full object-cover"
      />

      <div className="relative mx-auto w-full max-w-3xl px-5 py-10 sm:py-14">
        {/* Header */}
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Добро пожаловать</p>
            <h1 className="truncate text-2xl font-semibold sm:text-3xl">
              Привет, Марк! ✌️
            </h1>
          </div>
          <div className="glass-soft grid h-14 w-14 shrink-0 place-items-center rounded-full font-display text-lg">
            М
          </div>
        </header>

        {/* Next lesson */}
        <section className="glass mt-8 rounded-4xl p-6 sm:p-8">
          <p className="font-display text-[0.7rem] font-medium tracking-[0.02em] text-muted-foreground">
            Следующий урок
          </p>
          <div className="mt-2 flex items-end justify-between gap-4">
            <h2 className="text-3xl leading-tight sm:text-[2.6rem]">
              5 августа, 16:00
            </h2>
            <span className="hidden h-16 w-16 shrink-0 rounded-full sm:block"
              style={{ background: "var(--gradient-warm)", boxShadow: "var(--shadow-soft)" }}
            />
          </div>

          <div className="glass-inset mt-6 rounded-3xl p-5">
            <p className="font-display text-[0.7rem] font-medium tracking-[0.02em] text-muted-foreground">
              Задание
            </p>
            <p className="mt-1 text-sm text-secondary-foreground">
              Задание пока не добавлено
            </p>
          </div>

          <div className="glass-inset mt-3 rounded-3xl p-5">
            <p className="font-display text-[0.7rem] font-medium tracking-[0.02em] text-muted-foreground">
              Моя домашка
            </p>
            <p className="mt-1 text-sm text-secondary-foreground">
              Вы ещё не отправили домашнее задание
            </p>
            <button className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm text-ink-foreground transition-transform hover:scale-[1.02]">
              <Paperclip className="h-4 w-4" />
              Прикрепить домашку
            </button>
            <p className="mt-3 text-xs text-muted-foreground">
              Или отправить в бот в ТГ/ВК
            </p>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button className="inline-flex items-center justify-center gap-2 rounded-full border border-white/60 bg-white/45 px-5 py-3 text-sm font-medium text-secondary-foreground backdrop-blur-md transition-colors hover:bg-white/70">
              <CalendarClock className="h-4 w-4" />
              Перенести урок
            </button>
            <button className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium text-destructive-foreground transition-transform hover:scale-[1.02]"
              style={{ background: "var(--gradient-warm)", boxShadow: "var(--shadow-soft)" }}
            >
              <X className="h-4 w-4" />
              Отменить урок
            </button>
          </div>
        </section>

        {/* Notification */}
        <section className="mt-5 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 rounded-4xl bg-ink px-6 py-5 text-ink-foreground shadow-[var(--shadow-soft)]">
          <Clock className="h-5 w-5 shrink-0 opacity-70" />
          <div className="min-w-0">
            <p className="text-sm leading-relaxed">
              Урок через 1 ч 59 мин (в 17:00)! Не забудь домашнее задание: сделай
              номер 5 и 6. Пришли фото сюда, если ещё не отправил(а).
            </p>
            <p className="mt-2 text-xs opacity-50">3 часа назад</p>
          </div>
          <button className="relative inline-flex shrink-0 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs">
            <Bell className="h-3.5 w-3.5" />
            Все
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-primary" />
          </button>
        </section>

        {/* Level + materials */}
        <div className="mt-5 grid gap-5 sm:grid-cols-[0.85fr_1.15fr]">
          <section className="glass-soft rounded-4xl p-6">
            <div className="flex items-center gap-3">
              <span
                className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-primary-foreground"
                style={{ background: "var(--gradient-warm)" }}
              >
                <Sparkles className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Твой уровень</p>
                <p className="font-display text-xl">1</p>
              </div>
              <span className="ml-auto text-xs text-muted-foreground">0%</span>
            </div>
            <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-white/50">
              <div
                className="h-full w-[6%] rounded-full"
                style={{ background: "var(--gradient-warm)" }}
              />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              До 2 уровня — 100 XP
            </p>
          </section>

          <section className="glass-soft rounded-4xl p-6">
            <h3 className="text-lg">Материалы к урокам</h3>
            <ul className="mt-4 space-y-2.5">
              {materials.map((m) => (
                <li key={m}>
                  <button className="glass-inset flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm text-secondary-foreground transition-colors hover:bg-white/70">
                    <Paperclip className="h-4 w-4 shrink-0 opacity-60" />
                    <span className="truncate">{m}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
              Показать все
              <ChevronRight className="h-4 w-4" />
            </button>
          </section>
        </div>
      </div>
    </main>
  );
}
