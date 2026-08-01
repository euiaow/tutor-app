import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bell,
  CalendarDays,
  Plus,
  Pencil,
  Trash2,
  MessageCircle,
  FileText,
  MoreHorizontal,
  LogOut,
  CheckCircle2,
  ChevronRight,
  Link2,
} from "lucide-react";
import bgGlass from "@/assets/bg-glass.jpg";

export const Route = createFileRoute("/teacher")({
  head: () => ({
    meta: [
      { title: "Кабинет преподавателя — Lumina" },
      {
        name: "description",
        content:
          "Расписание, ближайшие и прошедшие уроки, ученики, финансы и приглашения — рабочий стол преподавателя.",
      },
      { property: "og:title", content: "Кабинет преподавателя — Lumina" },
      {
        property: "og:description",
        content: "Расписание, уроки, ученики и финансы в одном кабинете.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TeacherDashboard,
});

type Tag = { label: string; tone: "neutral" | "warm" | "ink" };

const upcoming = [
  {
    name: "Максим Гуренко",
    when: "30 июля, 22:00",
    tags: [{ label: "Школа", tone: "neutral" }] as Tag[],
    task: "Задание добавлено",
    hw: "ДЗ не прислано",
    hwDone: false,
    chat: false,
  },
  {
    name: "Костя Жариков",
    when: "31 июля, 16:00",
    tags: [
      { label: "Лит", tone: "warm" },
      { label: "ОГЭ", tone: "ink" },
    ] as Tag[],
    task: "Задание добавлено",
    hw: "ДЗ получено",
    hwDone: true,
    chat: true,
  },
  {
    name: "Ваня Иванов",
    when: "4 августа, 16:00",
    tags: [{ label: "Школа", tone: "neutral" }] as Tag[],
    task: "Задание не добавлено",
    hw: "ДЗ не прислано",
    hwDone: false,
    chat: false,
  },
];

const past = [
  { name: "Марк Кузьмин", when: "29 июля, 17:00", note: "Тип 6" },
  { name: "Костя Жариков", when: "29 июля, 12:35", note: "Доп. урок" },
];

const students = [
  {
    initials: "ВИ",
    name: "Ваня Иванов",
    tags: [{ label: "Школа", tone: "neutral" }] as Tag[],
    schedule: ["Вторник · 16:00"],
    profile: ["Предмет не указан", "Школьная программа"],
    chat: false,
  },
  {
    initials: "КЖ",
    name: "Костя Жариков",
    tags: [
      { label: "Лит", tone: "warm" },
      { label: "ОГЭ", tone: "ink" },
    ] as Tag[],
    schedule: ["Вторник · 18:30", "Пятница · 16:00"],
    profile: ["Литература", "ОГЭ"],
    chat: true,
  },
  {
    initials: "МГ",
    name: "Максим Гуренко",
    tags: [{ label: "Школа", tone: "neutral" }] as Tag[],
    schedule: ["Четверг · 19:00"],
    profile: ["Предмет не указан", "Школьная программа"],
    chat: false,
  },
  {
    initials: "МК",
    name: "Марк Кузьмин",
    tags: [
      { label: "Рус", tone: "warm" },
      { label: "ЕГЭ", tone: "ink" },
    ] as Tag[],
    schedule: ["Среда · 16:00"],
    profile: ["Русский язык", "ЕГЭ"],
    chat: true,
  },
];

const finance = [
  { name: "Ваня Иванов", tags: ["Школа"], balance: "0 занятий", low: true, rate: "—" },
  { name: "Максим Гуренко", tags: ["Школа"], balance: "0 занятий", low: true, rate: "—" },
  { name: "Костя Жариков", tags: ["Лит", "ОГЭ"], balance: "2 занятия", low: false, rate: "1500 ₽" },
  { name: "Марк Кузьмин", tags: ["Рус", "ЕГЭ"], balance: "4 занятия", low: false, rate: "1400 ₽" },
];

function Chip({ tag }: { tag: Tag }) {
  const tone =
    tag.tone === "warm"
      ? "bg-primary/15 text-primary"
      : tag.tone === "ink"
        ? "bg-ink/10 text-secondary-foreground"
        : "bg-white/60 text-muted-foreground";
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[0.68rem] font-medium ${tone}`}>
      {tag.label}
    </span>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-display text-[0.7rem] font-medium tracking-[0.02em] text-muted-foreground">
      {children}
    </p>
  );
}

function SectionTitle({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <h2 className="truncate text-xl sm:text-2xl">{title}</h2>
      {action}
    </div>
  );
}

const pillBase =
  "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors";
const pillGhost =
  `${pillBase} border border-white/60 bg-white/45 text-secondary-foreground backdrop-blur-md hover:bg-white/75`;
const pillMuted = `${pillBase} bg-white/30 text-muted-foreground`;
const pillDark = `${pillBase} bg-ink text-ink-foreground hover:opacity-90`;

function TeacherDashboard() {
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

      <div className="relative mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        {/* Header */}
        <header className="glass-soft grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-4xl px-5 py-4 sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl font-display text-sm text-primary-foreground"
              style={{ background: "var(--gradient-warm)" }}
            >
              Л
            </span>
            <div className="min-w-0">
              <p className="truncate font-display text-base sm:text-lg">Учебный портал</p>
              <p className="truncate text-xs text-muted-foreground">
                Анна Петрова · преподаватель
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button className="glass-inset relative grid h-10 w-10 place-items-center rounded-full">
              <Bell className="h-4 w-4 opacity-70" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" />
            </button>
            <Link to="/" className={`${pillGhost} hidden sm:inline-flex`}>
              Кабинет ученика
            </Link>
            <button className={`${pillGhost} px-3`}>
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Выйти</span>
            </button>
          </div>
        </header>

        {/* Summary strip */}
        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          {[
            { k: "Уроков на неделе", v: "8" },
            { k: "Учеников", v: "4" },
            { k: "ДЗ на проверке", v: "2" },
            { k: "Оплат ожидается", v: "2" },
          ].map((s) => (
            <div key={s.k} className="glass-soft rounded-3xl px-5 py-4">
              <p className="text-xs text-muted-foreground">{s.k}</p>
              <p className="mt-1 font-display text-2xl">{s.v}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1.35fr_1fr]">
          {/* Schedule / Google Calendar */}
          <section className="glass rounded-4xl p-5 sm:p-6">
            <SectionTitle
              title="Расписание"
              action={
                <button className={pillDark}>
                  <Plus className="h-4 w-4" />
                  Доп. урок
                </button>
              }
            />
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
              Google Calendar подключён
            </p>

            <div className="glass-inset mt-4 overflow-hidden rounded-3xl">
              <iframe
                title="Google Календарь преподавателя"
                src="https://calendar.google.com/calendar/embed?ctz=Europe%2FMoscow&mode=WEEK&showTitle=0&showPrint=0&showTabs=0&showCalendars=0&bgcolor=%23ffffff"
                className="h-[420px] w-full border-0 opacity-95 sm:h-[520px]"
                loading="lazy"
              />
            </div>
          </section>

          {/* Lessons column */}
          <div className="grid content-start gap-5">
            <section className="glass rounded-4xl p-5 sm:p-6">
              <SectionTitle title="Ближайшие уроки" />
              <ul className="mt-4 space-y-3">
                {upcoming.map((l) => (
                  <li key={l.name} className="glass-inset rounded-3xl p-4">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                      <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <p className="truncate font-medium">{l.name}</p>
                          {l.tags.map((t) => (
                            <Chip key={t.label} tag={t} />
                          ))}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">{l.when}</p>
                      </div>
                      <button className="glass-soft grid h-8 w-8 shrink-0 place-items-center rounded-full">
                        <MoreHorizontal className="h-4 w-4 opacity-60" />
                      </button>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      <span className="text-muted-foreground">{l.task}</span>
                      <span className={l.hwDone ? "text-primary" : "text-muted-foreground"}>
                        {l.hw}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button className={`${pillGhost} px-3 py-1.5 text-xs`}>Перенести</button>
                      <button className={`${pillBase} bg-destructive/10 px-3 py-1.5 text-xs text-destructive`}>
                        Отменить
                      </button>
                      <button className={`${pillDark} px-3 py-1.5 text-xs`}>Открыть</button>
                      {l.chat ? (
                        <button className={`${pillGhost} px-3 py-1.5 text-xs`}>
                          <MessageCircle className="h-3.5 w-3.5" />
                          Написать
                        </button>
                      ) : (
                        <span className={`${pillMuted} px-3 py-1.5 text-xs`}>
                          Связь не настроена
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="glass-soft rounded-4xl p-5 sm:p-6">
              <SectionTitle title="Прошедшие уроки" />
              <ul className="mt-4 space-y-3">
                {past.map((l) => (
                  <li
                    key={l.when}
                    className="glass-inset grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-3xl px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{l.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {l.when} · {l.note}
                      </p>
                    </div>
                    <button className={`${pillGhost} shrink-0 px-3 py-1.5 text-xs`}>
                      Открыть
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

        {/* Students */}
        <section className="mt-5">
          <SectionTitle
            title="Ученики"
            action={
              <button className={pillDark}>
                <Plus className="h-4 w-4" />
                Добавить ученика
              </button>
            }
          />
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {students.map((s) => (
              <article key={s.name} className="glass rounded-4xl p-5">
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                  <span className="glass-soft grid h-11 w-11 shrink-0 place-items-center rounded-2xl font-display text-xs">
                    {s.initials}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{s.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {s.tags.map((t) => (
                        <Chip key={t.label} tag={t} />
                      ))}
                    </div>
                  </div>
                  <button className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="glass-inset mt-4 rounded-3xl p-4">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                    <div className="min-w-0">
                      <Label>Расписание</Label>
                      {s.schedule.map((row) => (
                        <p key={row} className="text-sm text-secondary-foreground">
                          {row}
                        </p>
                      ))}
                    </div>
                    <Pencil className="h-3.5 w-3.5 shrink-0 opacity-40" />
                  </div>
                </div>

                <div className="glass-inset mt-3 rounded-3xl p-4">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                    <div className="min-w-0">
                      <Label>Профиль</Label>
                      {s.profile.map((row) => (
                        <p key={row} className="text-sm text-secondary-foreground">
                          {row}
                        </p>
                      ))}
                    </div>
                    <Pencil className="h-3.5 w-3.5 shrink-0 opacity-40" />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button className={`${pillGhost} px-3 py-1.5 text-xs`}>
                    <FileText className="h-3.5 w-3.5" />
                    Подготовить
                  </button>
                  {s.chat ? (
                    <button
                      className={`${pillBase} px-3 py-1.5 text-xs text-primary-foreground`}
                      style={{ background: "var(--gradient-warm)" }}
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      Написать
                    </button>
                  ) : (
                    <span className={`${pillMuted} px-3 py-1.5 text-xs`}>Связь не настроена</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Finance + invites */}
        <div className="mt-5 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <section className="glass rounded-4xl p-5 sm:p-6">
            <SectionTitle title="Финансы" />
            <div className="mt-4 space-y-2.5">
              <div className="hidden grid-cols-[minmax(0,1.4fr)_0.8fr_0.8fr_auto] gap-3 px-4 text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground sm:grid">
                <span>Имя</span>
                <span>Баланс</span>
                <span>Ставка/час</span>
                <span>Оплата</span>
              </div>
              {finance.map((r) => (
                <div
                  key={r.name}
                  className="glass-inset grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-3xl px-4 py-3 sm:grid-cols-[minmax(0,1.4fr)_0.8fr_0.8fr_auto]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {r.tags.map((t) => (
                        <Chip key={t} tag={{ label: t, tone: "neutral" }} />
                      ))}
                    </div>
                  </div>
                  <p
                    className={`hidden text-sm sm:block ${r.low ? "text-destructive" : "text-secondary-foreground"}`}
                  >
                    {r.balance}
                  </p>
                  <p className="hidden text-sm text-muted-foreground sm:block">{r.rate}</p>
                  <button className={`${pillGhost} shrink-0 px-3 py-1.5 text-xs`}>
                    <Plus className="h-3.5 w-3.5" />
                    Внести
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="glass-soft rounded-4xl p-5 sm:p-6">
            <SectionTitle
              title="Ожидают регистрации"
              action={
                <button className={`${pillGhost} px-3 py-1.5 text-xs`}>
                  <Plus className="h-3.5 w-3.5" />
                  Ссылка
                </button>
              }
            />
            <div className="glass-inset mt-4 rounded-3xl p-4">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">Олег</p>
                  <p className="text-xs text-muted-foreground">
                    Ссылка создана 27.07.2026, 21:16
                  </p>
                </div>
                <CalendarDays className="h-4 w-4 shrink-0 opacity-40" />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className={`${pillGhost} px-3 py-1.5 text-xs`}>
                  <Link2 className="h-3.5 w-3.5" />
                  Ссылка ВК
                </button>
                <button className={`${pillGhost} px-3 py-1.5 text-xs`}>
                  <Link2 className="h-3.5 w-3.5" />
                  Ссылка ТГ
                </button>
              </div>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Ученик появится в списке автоматически после регистрации по ссылке.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
