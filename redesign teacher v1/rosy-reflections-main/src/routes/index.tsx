import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Bell,
  Calendar as CalendarIcon,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  FileText,
  Link2,
  ListChecks,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Video,
  X,
  CalendarClock,
  CircleSlash,
  Info,
  Play,
  Paperclip,
  Upload,
  BookOpen,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Учебный портал — кабинет преподавателя" },
      {
        name: "description",
        content:
          "Расписание, ближайшие уроки, ученики и финансы преподавателя в одном стеклянном интерфейсе.",
      },
      { property: "og:title", content: "Учебный портал — кабинет преподавателя" },
      {
        property: "og:description",
        content: "Расписание, уроки, прогресс учеников и финансы в одном кабинете.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

/* ---------- atoms ---------- */

function Tag({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "rose" }) {
  return (
    <span
      className={
        "rounded-full px-2.5 py-0.5 text-[11px] font-semibold " +
        (tone === "rose"
          ? "bg-primary/15 text-rose-deep"
          : "bg-glass-strong text-muted-foreground border border-glass-border")
      }
    >
      {children}
    </span>
  );
}

function Avatar({ initials }: { initials: string }) {
  return (
    <div
      className="flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-primary-foreground"
      style={{ background: "var(--gradient-orb)", boxShadow: "var(--shadow-soft)" }}
    >
      {initials}
    </div>
  );
}

function GhostBtn({
  children,
  className = "",
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "glass-tile inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-foreground/80 transition hover:text-rose-deep " +
        className
      }
    >
      {children}
    </button>
  );
}

function SolidBtn({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:brightness-105"
      style={{ background: "var(--gradient-orb)", boxShadow: "var(--shadow-soft)" }}
    >
      {children}
    </button>
  );
}

function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={"glass-panel rounded-[2rem] p-6 md:p-7 " + className}>{children}</section>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-xl tracking-tight text-ink md:text-2xl">{children}</h2>
  );
}

function Progress({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 w-40 overflow-hidden rounded-full bg-glass-strong">
        <div
          className="h-full rounded-full"
          style={{ width: `${value}%`, background: "var(--gradient-orb)" }}
        />
      </div>
      <span className="text-xs font-semibold text-muted-foreground">{value}%</span>
    </div>
  );
}

/* ---------- page ---------- */

const stats = [
  { value: "8", label: "Уроков на неделе" },
  { value: "4", label: "Учеников" },
  { value: "2", label: "ДЗ на проверке" },
  { value: "2", label: "Оплата ожидается" },
];

const days = [
  { d: "ВС", n: "26" },
  { d: "ПН", n: "27" },
  { d: "ВТ", n: "28" },
  { d: "СР", n: "29", today: true },
  { d: "ЧТ", n: "30" },
  { d: "ПТ", n: "31" },
  { d: "СБ", n: "1", weekend: true },
];
type LessonState = "movePending" | "moveAsk" | "moveDone" | "cancelPending" | "cancelAsk";

const stateLabel: Record<LessonState, string> = {
  movePending: "Ожидает подтверждения переноса",
  moveAsk: "Ученик предлагает перенос",
  moveDone: "Перенос подтверждён",
  cancelPending: "Ожидает подтверждения отмены",
  cancelAsk: "Ученик просит отменить",
};

const stateTone: Record<LessonState, "amber" | "green" | "red"> = {
  movePending: "amber",
  moveAsk: "amber",
  moveDone: "green",
  cancelPending: "red",
  cancelAsk: "red",
};

function StatusBadge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "amber" | "green" | "red" | "rose";
}) {
  const color =
    tone === "amber"
      ? "var(--balance-warn)"
      : tone === "green"
        ? "var(--balance-ok)"
        : tone === "red"
          ? "var(--balance-danger)"
          : "var(--rose-deep)";
  return (
    <span
      className="rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ color, borderColor: color, background: "color-mix(in oklab, currentColor 12%, transparent)" }}
    >
      {children}
    </span>
  );
}

type Lesson = {
  i: string;
  name: string;
  tags: string[];
  time: string;
  hw: string | null;
  done: boolean;
  topic: string;
  task: string;
  materials: string[];
  answer: string | null;
  state?: LessonState;
  newTime?: string;
  extra?: boolean;
};

const upcomingLessons: Lesson[] = [
  {
    i: "МГ",
    name: "Максим Гуренко",
    tags: ["Школа"],
    time: "30 июля, 22:00",
    hw: "ДЗ",
    done: false,
    topic: "Причастный оборот: обособление",
    task: "Упр. 214–216, разбор 5 предложений",
    materials: ["Конспект_причастия.pdf", "Карточки_практика.docx"],
    answer: null,
  },
  {
    i: "КЖ",
    name: "Костя Жариков",
    tags: ["Рус.", "ОГЭ"],
    time: "31 июля, 16:00",
    hw: "ДЗ",
    done: true,
    topic: "Сочинение 9.3: структура",
    task: "Написать сочинение по тексту Паустовского",
    materials: ["Клише_сочинение.pdf"],
    answer: "sochinenie_kostya.docx",
    extra: true,
  },
  {
    i: "МК",
    name: "Марк Кузьмин",
    tags: ["Рус.", "ЕГЭ"],
    time: "1 августа, 17:00",
    hw: "ДЗ",
    done: false,
    topic: "Задание 8: синтаксические нормы",
    task: "Прототипы 8.1–8.4",
    materials: ["Теория_задание8.pdf"],
    answer: null,
    state: "movePending",
    newTime: "2 августа, 17:00",
  },
  {
    i: "АК",
    name: "Алиса Ковалёва",
    tags: ["Рус.", "ОГЭ"],
    time: "2 августа, 12:00",
    hw: null,
    done: false,
    topic: "Изложение: сжатие текста",
    task: "Задание не назначено",
    materials: [],
    answer: null,
    state: "moveAsk",
    newTime: "3 августа, 12:00",
  },
  {
    i: "ВИ",
    name: "Ваня Иванов",
    tags: ["Школа"],
    time: "4 августа, 16:00",
    hw: null,
    done: false,
    topic: "Правописание НЕ с частями речи",
    task: "Задание не назначено",
    materials: [],
    answer: null,
    state: "moveDone",
    newTime: "5 августа, 16:00",
  },
  {
    i: "ЕС",
    name: "Егор Смирнов",
    tags: ["Школа"],
    time: "5 августа, 19:00",
    hw: null,
    done: false,
    topic: "Однородные члены предложения",
    task: "Упр. 88",
    materials: [],
    answer: null,
    state: "cancelPending",
  },
  {
    i: "КЖ",
    name: "Костя Жариков",
    tags: ["Рус.", "ОГЭ"],
    time: "6 августа, 18:00",
    hw: null,
    done: false,
    topic: "Разбор пробника",
    task: "Принести пробник",
    materials: [],
    answer: null,
    state: "cancelAsk",
    extra: true,
  },
];


const studyPlans = [
  { name: "Рус", type: "ЕГЭ", topics: 3, protos: 5 },
  { name: "Русский базовый", type: "ОГЭ", topics: 6, protos: 4 },
  { name: "Школьная программа 8 класс", type: "Школа", topics: 12, protos: 0 },
];

const hours = ["16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00"];

type FinanceRow = {
  i: string;
  name: string;
  tags: string[];
  bal: string;
  rate: string;
  left: number;
};

const finance: FinanceRow[] = [
  { i: "ВИ", name: "Ваня Иванов", tags: ["Школа"], bal: "Долг 1 500 ₽", rate: "1500 ₽", left: -1 },
  { i: "МГ", name: "Максим Гуренко", tags: ["Школа"], bal: "0 занятий", rate: "1400 ₽", left: 0 },
  {
    i: "КЖ",
    name: "Костя Жариков",
    tags: ["Рус.", "ОГЭ"],
    bal: "1 занятие",
    rate: "1500 ₽",
    left: 1,
  },
  {
    i: "МК",
    name: "Марк Кузьмин",
    tags: ["Рус.", "ЕГЭ"],
    bal: "4 занятия",
    rate: "1400 ₽",
    left: 4,
  },
];

/* приглушённые индикаторы баланса в общей гамме */
function balanceColor(left: number) {
  if (left <= 0) return "var(--balance-danger)";
  if (left === 1) return "var(--balance-warn)";
  return "var(--balance-ok)";
}

const pending = [
  { name: "Алиса Ковалёва", created: "28 июля" },
  { name: "Егор Смирнов", created: "28 июля" },
];

function Index() {
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [editStudent, setEditStudent] = useState(false);


  return (
    <main className="relative min-h-screen px-4 py-6 md:px-8 md:py-10">
      {/* fixed grainy background */}
      <div aria-hidden className="bg-grain-blobs">
        <div className="blob-a" />
        <div className="blob-b" />
        <div className="grain-layer" />
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        {/* header */}
        <header className="glass-panel flex items-center justify-between gap-4 rounded-[2rem] px-5 py-4">
          <div className="flex items-center gap-3">
            <Avatar initials="АП" />
            <div>
              <h1 className="font-display text-lg tracking-tight text-ink">Учебный портал</h1>
              <p className="text-xs text-muted-foreground">Анна Петрова · преподаватель</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="glass-tile grid size-10 place-items-center rounded-full text-foreground/70">
              <Video className="size-4" />
            </button>
            <button className="glass-tile relative grid size-10 place-items-center rounded-full text-foreground/70">
              <Bell className="size-4" />
              <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-primary" />
            </button>
            <GhostBtn className="px-4 py-2">
              <LogOut className="size-3.5" /> Выйти
            </GhostBtn>
          </div>
        </header>

        {/* stats */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="glass-panel rounded-[1.75rem] px-5 py-4">
              <div className="font-display text-3xl text-ink">{s.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>

        {/* расписание */}
        <Panel>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Title>Расписание</Title>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-1.5 rounded-full bg-primary" /> Google Calendar подключён
              </p>
            </div>
            <SolidBtn>
              <Plus className="size-3.5" /> Доп. урок
            </SolidBtn>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <SolidBtn>Сегодня</SolidBtn>
            <div className="flex items-center gap-1 text-muted-foreground">
              <button className="glass-tile grid size-8 place-items-center rounded-full">
                <ChevronLeft className="size-4" />
              </button>
              <button className="glass-tile grid size-8 place-items-center rounded-full">
                <ChevronRight className="size-4" />
              </button>
            </div>
            <span className="text-sm font-semibold text-ink">Июль – авг 2026</span>
            <button className="glass-tile ml-auto grid size-9 place-items-center rounded-full text-muted-foreground">
              <CalendarIcon className="size-4" />
            </button>
          </div>

          <div className="glass-tile mt-4 overflow-hidden rounded-[1.5rem]">
            <div className="grid grid-cols-[64px_repeat(7,1fr)] border-b border-glass-border text-center">
              <div />
              {days.map((d) => (
                <div
                  key={d.n}
                  className={
                    "py-3 " +
                    (d.today
                      ? "rounded-t-[1rem] text-primary-foreground"
                      : d.weekend
                        ? "text-rose-deep"
                        : "text-muted-foreground")
                  }
                  style={d.today ? { background: "var(--gradient-orb)" } : undefined}
                >
                  <div className="text-[10px] tracking-widest">{d.d}</div>
                  <div className="font-display text-lg">{d.n}</div>
                </div>
              ))}
            </div>
            {hours.map((h, i) => (
              <div
                key={h}
                className="grid h-12 grid-cols-[64px_repeat(7,1fr)] border-b border-glass-border/60 last:border-0"
              >
                <div className="pr-2 pt-1 text-right text-[10px] text-muted-foreground">{h}</div>
                {days.map((d) => (
                  <div key={d.n} className="relative border-l border-glass-border/50">
                    {i === 0 && d.n === "31" && (
                      <div className="absolute inset-x-1 top-1 rounded-lg bg-primary/20 px-2 py-1 text-[10px] font-semibold text-rose-deep">
                        КЖ 16:00
                      </div>
                    )}
                    {i === 6 && d.n === "29" && (
                      <div className="absolute inset-x-1 top-1 rounded-lg bg-primary/30 px-2 py-1 text-[10px] font-semibold text-rose-deep">
                        МГ 22:00
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Часовой пояс московских мероприятий: (GMT+03:00) Москва, стандартное время ·{" "}
            <a href="#" className="font-semibold text-rose-deep">
              Добавить в Календарь Google
            </a>
          </p>
        </Panel>

        {/* ближайшие уроки */}
        <Panel>
          <div className="flex items-center justify-between">
            <Title>Ближайшие уроки</Title>
            <button className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              Все уроки <ChevronRight className="size-3.5" />
            </button>
          </div>
          <ul className="mt-4 space-y-3">
            {upcomingLessons.map((l, idx) => (
              <li key={idx} className="glass-tile rounded-[1.5rem] p-3">

                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <button
                    onClick={() => setLesson(l)}
                    className="flex min-w-0 flex-1 basis-64 items-center gap-3 text-left"
                  >
                    <Avatar initials={l.i} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-ink">{l.name}</span>
                        {l.extra && <StatusBadge tone="rose">доп.</StatusBadge>}
                        {l.tags.map((t) => (
                          <Tag key={t} tone={t === "Школа" ? "muted" : "rose"}>
                            {t}
                          </Tag>
                        ))}
                        {l.state && (
                          <StatusBadge tone={stateTone[l.state]}>{stateLabel[l.state]}</StatusBadge>
                        )}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="size-3" />
                          {l.newTime && l.state !== "moveDone" ? (
                            <>
                              <span className="line-through opacity-70">{l.time}</span>
                              <ChevronRight className="size-3" />
                              <span className="font-semibold text-ink">{l.newTime}</span>
                            </>
                          ) : (
                            <span>{l.newTime ?? l.time}</span>
                          )}
                        </span>
                        {l.hw && (
                          <span className="flex items-center gap-1">
                            <FileText className="size-3" /> {l.hw}
                          </span>
                        )}
                        {l.done && (
                          <span className="flex items-center gap-1 font-semibold text-rose-deep">
                            <Check className="size-3" /> ДЗ готово
                          </span>
                        )}
                      </span>
                    </span>
                  </button>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {(l.state === "moveAsk" || l.state === "cancelAsk") && (
                      <>
                        <SolidBtn>
                          <Check className="size-3.5" />
                          {l.state === "cancelAsk" ? "Подтвердить отмену" : "Подтвердить"}
                        </SolidBtn>
                        <GhostBtn className="px-3 py-1.5">
                          <X className="size-3.5" /> Отклонить
                        </GhostBtn>
                        <span className="mx-0.5 h-5 w-px bg-glass-border" />
                      </>
                    )}
                    <GhostBtn className="px-3 py-1.5">
                      <CalendarClock className="size-3.5" /> Перенести
                    </GhostBtn>
                    <GhostBtn className="px-3 py-1.5">
                      <CircleSlash className="size-3.5" /> Отменить
                    </GhostBtn>
                    <GhostBtn className="px-3 py-1.5" onClick={() => setLesson(l)}>
                      <Info className="size-3.5" /> Подробнее
                    </GhostBtn>
                    <SolidBtn>
                      <Play className="size-3.5" /> Начать урок
                    </SolidBtn>
                  </div>
                </div>
              </li>
            ))}
          </ul>

        </Panel>

        {/* ученики */}
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Title>Ученики</Title>
            <SolidBtn>
              <Plus className="size-3.5" /> Добавить ученика
            </SolidBtn>
          </div>


          <div className="mt-4 space-y-3">
            <StudentRow initials="ВИ" name="Ваня Иванов" tags={["Школа"]} progress={0} />

            {/* expanded */}
            <div className="glass-tile rounded-[1.75rem] p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Avatar initials="КЖ" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">Костя Жариков</span>
                    <Tag tone="rose">Рус.</Tag>
                    <Tag tone="rose">ЕГЭ</Tag>
                  </div>
                  <div className="mt-1.5">
                    <Progress value={38} />
                  </div>
                </div>
                <GhostBtn className="px-4 py-2">
                  <Plus className="size-3.5" /> Урок
                </GhostBtn>
                <ContactControl />
                <button className="text-muted-foreground/70">
                  <ChevronUp className="size-4" />
                </button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="glass-tile rounded-[1.25rem] p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <CalendarIcon className="size-4 text-rose-deep" /> Расписание
                  </p>
                  <ul className="mt-3 space-y-1.5 text-sm">
                    <li className="flex justify-between text-muted-foreground">
                      <span>Вторник</span>
                      <span className="font-semibold text-ink">18:30</span>
                    </li>
                    <li className="flex justify-between text-muted-foreground">
                      <span>Пятница</span>
                      <span className="font-semibold text-ink">16:00</span>
                    </li>
                  </ul>
                  <div className="mt-3 space-y-1.5 border-t border-glass-border pt-3 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Предмет</span>
                      <span className="text-ink">Русский язык</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Цель</span>
                      <span className="text-ink">ЕГЭ</span>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5 border-t border-glass-border pt-3 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Учебный план</span>
                      <span className="text-ink">Русский ЕГЭ</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setEditStudent(true)}
                    className="mt-3 flex items-center gap-1 text-xs font-semibold text-rose-deep"
                  >
                    <Pencil className="size-3" /> Редактировать
                  </button>

                </div>

                <div className="glass-tile rounded-[1.25rem] p-4">
                  <p className="flex items-center justify-between text-sm font-semibold text-ink">
                    <span className="flex items-center gap-2">
                      <FileText className="size-4 text-rose-deep" /> Темы программы
                    </span>
                    <span className="text-xs text-muted-foreground">1/3</span>
                  </p>
                  <ul className="mt-3 space-y-2 text-sm">
                    <li className="flex items-center gap-2">
                      <span className="grid size-4 place-items-center rounded-full bg-primary/20 text-rose-deep">
                        <Check className="size-3" />
                      </span>
                      <span className="text-ink">Тема 1</span>
                      <span className="ml-auto text-[11px] text-muted-foreground">
                        30 июля, 07:29
                      </span>
                    </li>
                    {["т2", "т3"].map((t) => (
                      <li key={t} className="flex items-center gap-2 text-muted-foreground">
                        <span className="grid size-4 place-items-center rounded-full bg-glass-strong">
                          <X className="size-2.5" />
                        </span>
                        {t}
                      </li>
                    ))}
                  </ul>
                  <button className="mt-3 flex items-center gap-1 text-xs font-semibold text-rose-deep">
                    <Pencil className="size-3" /> Редактировать
                  </button>
                </div>


                <div className="glass-tile rounded-[1.25rem] p-4">
                  <p className="flex items-center justify-between text-sm font-semibold text-ink">
                    <span className="flex items-center gap-2">
                      <ListChecks className="size-4 text-rose-deep" /> Прототипы
                    </span>
                    <span className="text-xs text-muted-foreground">2/5</span>
                  </p>
                  <ul className="mt-3 space-y-2 text-sm">
                    {[
                      { n: "п1", ok: true },
                      { n: "п2", ok: false },
                      { n: "п3", ok: false },
                      { n: "п4", ok: true },
                      { n: "п5", ok: false },
                    ].map((p) => (
                      <li key={p.n} className="flex items-center gap-2">
                        <span
                          className={
                            "grid size-4 place-items-center rounded-full " +
                            (p.ok ? "bg-primary/20 text-rose-deep" : "bg-glass-strong")
                          }
                        >
                          {p.ok ? <Check className="size-3" /> : <X className="size-2.5" />}
                        </span>
                        <span className={p.ok ? "text-ink" : "text-muted-foreground"}>{p.n}</span>
                        {p.ok && (
                          <span className="ml-auto text-[11px] text-muted-foreground">
                            30 июля, 07:29
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <button className="mt-3 flex items-center gap-1 text-xs font-semibold text-rose-deep">
                    <Pencil className="size-3" /> Редактировать
                  </button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground/70 transition hover:text-destructive">
                  <Trash2 className="size-4" /> Удалить ученика
                </button>
                <div className="ml-auto flex flex-wrap items-center gap-3">
                  <GhostBtn className="px-4 py-2">
                    <Clock className="size-3.5" /> История уроков
                  </GhostBtn>
                  <SolidBtn>
                    <Plus className="size-3.5" /> Подготовить урок
                  </SolidBtn>
                </div>
              </div>

            </div>

            <StudentRow
              initials="МГ"
              name="Максим Гуренко"
              tags={["Школа"]}
              progress={12}
              contact={false}
            />
            <StudentRow initials="МК" name="Марк Кузьмин" tags={["Рус.", "ЕГЭ"]} progress={55} />
          </div>
        </Panel>

        {/* учебные планы */}
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Title>Учебные планы</Title>
            <SolidBtn onClick={() => setPlanOpen(true)}>
              <Plus className="size-3.5" /> Создать план
            </SolidBtn>
          </div>
          <ul className="mt-4 space-y-3">
            {studyPlans.map((p) => (
              <li
                key={p.name}
                className="glass-tile flex flex-wrap items-center gap-3 rounded-[1.5rem] px-4 py-3"
              >
                <BookOpen className="size-4 shrink-0 text-rose-deep" />
                <span className="font-semibold text-ink">{p.name}</span>
                <Tag tone="rose">{p.type}</Tag>
                <span className="text-xs text-muted-foreground">{p.topics} тем</span>
                <span className="text-xs text-muted-foreground">{p.protos} прототипов</span>
                <div className="ml-auto flex items-center gap-2">
                  <GhostBtn className="px-3.5 py-2">
                    <Pencil className="size-3.5" /> Редактировать
                  </GhostBtn>
                  <button className="text-muted-foreground/70 transition hover:text-destructive">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        {/* прошедшие + финансы */}
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel>
            <div className="flex items-center justify-between">
              <Title>Прошедшие уроки</Title>
              <button className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                Все <ChevronRight className="size-3.5" />
              </button>
            </div>
            <ul className="mt-4 divide-y divide-glass-border">
              {[
                { i: "МК", name: "Марк Кузьмин", tags: ["Рус.", "ЕГЭ"], time: "29 июля, 17:00" },
                { i: "КЖ", name: "Костя Жариков", tags: ["Рус.", "ОГЭ"], time: "29 июля, 12:35" },
              ].map((l) => (
                <li key={l.name} className="flex items-center gap-3 py-3">
                  <Avatar initials={l.i} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{l.name}</span>
                      {l.tags.map((t) => (
                        <Tag key={t} tone="rose">
                          {t}
                        </Tag>
                      ))}
                    </div>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="size-3" /> {l.time}
                    </p>
                  </div>
                  <button className="text-muted-foreground/70">
                    <MessageCircle className="size-4" />
                  </button>
                  <GhostBtn className="px-4 py-2">
                    <Plus className="size-3.5" /> Открыть
                  </GhostBtn>
                  <button className="text-muted-foreground/70">
                    <MoreHorizontal className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel>
            <Title>Финансы</Title>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <FileText className="size-3" /> Ученики с предоплатой и задолженностями
            </p>
            <ul className="mt-3 divide-y divide-glass-border">
              {finance.map((r) => (
                <li key={r.name} className="flex items-center gap-3 py-3">
                  <Avatar initials={r.i} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{r.name}</span>
                      {r.tags.map((t) => (
                        <Tag key={t} tone={t === "Школа" ? "muted" : "rose"}>
                          {t}
                        </Tag>
                      ))}
                    </div>
                  </div>
                  <span
                    className="w-24 text-right text-xs font-semibold"
                    style={{ color: balanceColor(r.left) }}
                  >
                    {r.bal}
                  </span>
                  <span className="w-16 text-right text-xs text-muted-foreground">{r.rate}</span>
                  <button className="text-xs font-semibold text-rose-deep">Оплата</button>
                  <button className="text-muted-foreground/70 transition hover:text-destructive">
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        {/* ожидают регистрации */}
        <Panel>
          <Title>Ожидают регистрации</Title>
          <ul className="mt-4 space-y-3">
            {pending.map((p) => (
              <li
                key={p.name}
                className="glass-tile flex flex-wrap items-center gap-3 rounded-[1.5rem] px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">{p.name}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Ссылка создана {p.created}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <GhostBtn className="px-3.5 py-2">
                    <Link2 className="size-3.5" /> Ссылка ВК
                  </GhostBtn>
                  <GhostBtn className="px-3.5 py-2">
                    <Link2 className="size-3.5" /> Ссылка ТГ
                  </GhostBtn>
                  <button
                    aria-label="Удалить приглашение"
                    className="text-muted-foreground/70 transition hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Ученик появится в списке автоматически после регистрации по ссылке.
          </p>
        </Panel>
      </div>

      {lesson && <LessonModal lesson={lesson} onClose={() => setLesson(null)} />}
      {planOpen && <PlanModal onClose={() => setPlanOpen(false)} />}
      {editStudent && <StudentEditModal onClose={() => setEditStudent(false)} />}

    </main>
  );
}

/* ---------- modals ---------- */

function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/25 p-4 backdrop-blur-sm">
      <div
        className={
          "glass-panel relative w-full rounded-[2rem] p-6 md:p-7 " +
          (wide ? "max-w-2xl" : "max-w-lg")
        }
      >
        <button
          onClick={onClose}
          className="absolute right-5 top-5 text-muted-foreground transition hover:text-rose-deep"
          aria-label="Закрыть"
        >
          <X className="size-4" />
        </button>
        <h3 className="font-display text-xl tracking-tight text-ink">{title}</h3>
        {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

const inputCls =
  "glass-tile w-full rounded-full px-4 py-2.5 text-sm text-ink outline-none placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring";

function LessonModal({ lesson, onClose }: { lesson: Lesson; onClose: () => void }) {
  return (
    <Modal
      wide
      title={lesson.name}
      subtitle={`${lesson.time} · ${lesson.tags.join(" · ")}`}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="glass-tile rounded-[1.25rem] p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <BookOpen className="size-4 text-rose-deep" /> Тема
          </p>
          <p className="mt-2 text-sm text-muted-foreground">{lesson.topic}</p>
        </div>

        <div className="glass-tile rounded-[1.25rem] p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <ListChecks className="size-4 text-rose-deep" /> Задание
          </p>
          <p className="mt-2 text-sm text-muted-foreground">{lesson.task}</p>
        </div>

        <div className="glass-tile rounded-[1.25rem] p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Paperclip className="size-4 text-rose-deep" /> Прикреплённые материалы
          </p>
          {lesson.materials.length ? (
            <ul className="mt-2 space-y-1.5">
              {lesson.materials.map((m) => (
                <li key={m} className="flex items-center gap-2 text-sm text-ink">
                  <FileText className="size-3.5 text-muted-foreground" /> {m}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Материалы не прикреплены</p>
          )}
          <button className="mt-3 flex items-center gap-1 text-xs font-semibold text-rose-deep">
            <Upload className="size-3" /> Прикрепить файл
          </button>
        </div>

        <div className="glass-tile rounded-[1.25rem] p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <FileText className="size-4 text-rose-deep" /> Ответ ученика
          </p>
          {lesson.answer ? (
            <div className="mt-2 flex items-center gap-2 rounded-[1rem] bg-primary/10 px-3 py-2 text-sm text-ink">
              <FileText className="size-3.5 text-rose-deep" /> {lesson.answer}
            </div>
          ) : (
            <p className="mt-2 rounded-[1rem] border border-dashed border-glass-border px-3 py-4 text-center text-sm text-muted-foreground">
              Ученик пока ничего не прислал
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <GhostBtn className="px-4 py-2">
            <CalendarClock className="size-3.5" /> Перенести
          </GhostBtn>
          <GhostBtn className="px-4 py-2">
            <CircleSlash className="size-3.5" /> Отменить
          </GhostBtn>
          <GhostBtn className="px-4 py-2">
            <Check className="size-3.5" /> Урок прошёл
          </GhostBtn>
          <div className="ml-auto">
            <SolidBtn>
              <Play className="size-3.5" /> Начать урок
            </SolidBtn>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function PlanModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="Новый учебный план"
      subtitle="Темы и прототипы шаблона программы."
      onClose={onClose}
    >
      <div className="space-y-4">
        <Field label="Название">
          <input className={inputCls} placeholder="Например, Русский ЕГЭ" />
        </Field>
        <Field label="Тип">
          <select className={inputCls} defaultValue="ЕГЭ">
            <option>ЕГЭ</option>
            <option>ОГЭ</option>
            <option>Школа</option>
          </select>
        </Field>
        <Field label="Темы">
          <div className="space-y-2">
            {["Причастный оборот", "Сложноподчинённые предложения"].map((t) => (
              <div key={t} className="flex items-center gap-2">
                <input className={inputCls} defaultValue={t} />
                <button
                  aria-label="Удалить тему"
                  className="glass-tile grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            <button className="w-full rounded-full border border-dashed border-glass-border px-4 py-2.5 text-sm font-semibold text-muted-foreground transition hover:text-rose-deep">
              + Добавить тему
            </button>
          </div>
        </Field>
        <Field label="Прототипы">
          <div className="space-y-2">
            {["Прототип 9.3", "Прототип 8"].map((t) => (
              <div key={t} className="flex items-center gap-2">
                <input className={inputCls} defaultValue={t} />
                <button
                  aria-label="Удалить прототип"
                  className="glass-tile grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            <button className="w-full rounded-full border border-dashed border-glass-border px-4 py-2.5 text-sm font-semibold text-muted-foreground transition hover:text-rose-deep">
              + Добавить прототип
            </button>
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            onClick={onClose}
            className="glass-tile rounded-full px-4 py-2.5 text-sm font-semibold text-foreground/80"
          >
            Отмена
          </button>
          <button
            onClick={onClose}
            className="rounded-full px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            style={{ background: "var(--gradient-orb)", boxShadow: "var(--shadow-soft)" }}
          >
            Сохранить
          </button>
        </div>
      </div>
    </Modal>
  );
}

function StudentEditModal({ onClose }: { onClose: () => void }) {
  const slots = [
    { day: "Вторник", time: "18:30" },
    { day: "Пятница", time: "16:00" },
  ];
  const subjects = ["Русский язык", "Литература", "Математика"];
  const selected = ["Русский язык"];

  return (
    <Modal
      wide
      title="Редактирование ученика"
      subtitle="Костя Жариков · расписание и профиль"
      onClose={onClose}
    >
      <div className="space-y-4">
        {/* расписание */}
        <div className="glass-tile rounded-[1.25rem] p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <CalendarIcon className="size-4 text-rose-deep" /> Расписание
          </p>
          <div className="mt-3 space-y-2">
            {slots.map((s) => (
              <div key={s.day} className="flex items-center gap-2">
                <select className={inputCls} defaultValue={s.day}>
                  {["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"].map(
                    (d) => (
                      <option key={d}>{d}</option>
                    ),
                  )}
                </select>
                <input type="time" className={inputCls + " max-w-36"} defaultValue={s.time} />
                <button
                  aria-label="Удалить слот"
                  className="glass-tile grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            <button className="w-full rounded-full border border-dashed border-glass-border px-4 py-2.5 text-sm font-semibold text-muted-foreground transition hover:text-rose-deep">
              + Добавить слот
            </button>
          </div>
        </div>

        {/* профиль */}
        <div className="glass-tile space-y-4 rounded-[1.25rem] p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <BookOpen className="size-4 text-rose-deep" /> Профиль ученика
          </p>

          <Field label="Предмет (можно несколько)">
            <div className="flex flex-wrap gap-2">
              {subjects.map((s) => {
                const on = selected.includes(s);
                return (
                  <button
                    key={s}
                    className={
                      "rounded-full px-3.5 py-1.5 text-xs font-semibold transition " +
                      (on
                        ? "text-primary-foreground"
                        : "glass-tile text-foreground/80 hover:text-rose-deep")
                    }
                    style={on ? { background: "var(--gradient-orb)" } : undefined}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Цель">
            <select className={inputCls} defaultValue="ЕГЭ">
              <option>ЕГЭ</option>
              <option>ОГЭ</option>
              <option>Школьная программа</option>
            </select>
          </Field>

          <Field label="Оплата в час">
            <input className={inputCls} defaultValue="1500 ₽" />
          </Field>

          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-ink">Автоматически напоминать об оплате</span>
            <button
              role="switch"
              aria-checked="true"
              className="relative h-6 w-11 shrink-0 rounded-full"
              style={{ background: "var(--gradient-orb)" }}
            >
              <span className="absolute right-0.5 top-0.5 size-5 rounded-full bg-white shadow" />
            </button>
          </div>

          <Field label="Учебный план">
            <select className={inputCls} defaultValue="Рус · ЕГЭ">
              {studyPlans.map((p) => (
                <option key={p.name}>{`${p.name} · ${p.type}`}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            onClick={onClose}
            className="glass-tile rounded-full px-4 py-2.5 text-sm font-semibold text-foreground/80"
          >
            Отмена
          </button>
          <button
            onClick={onClose}
            className="rounded-full px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            style={{ background: "var(--gradient-orb)", boxShadow: "var(--shadow-soft)" }}
          >
            Сохранить
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ContactControl({ enabled = true }: { enabled?: boolean }) {

  return (
    <div className="glass-tile inline-flex items-center overflow-hidden rounded-full">
      <button
        disabled={!enabled}
        className={
          "inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold transition " +
          (enabled
            ? "text-foreground/80 hover:text-rose-deep"
            : "cursor-not-allowed text-muted-foreground/50")
        }
        title={enabled ? "Написать ученику" : "Связь не настроена"}
      >
        <MessageCircle className="size-3.5" /> Написать
      </button>
      <span className="h-5 w-px bg-glass-border" />
      <button
        className="grid size-8 place-items-center text-muted-foreground transition hover:text-rose-deep"
        aria-label="Сменить ссылку для связи"
        title="Сменить ссылку для связи"
      >
        <MoreHorizontal className="size-4" />
      </button>
    </div>
  );
}

function StudentRow({
  initials,
  name,
  tags,
  progress,
  contact = true,
}: {
  initials: string;
  name: string;
  tags: string[];
  progress: number;
  contact?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[1.5rem] px-1 py-2">
      <Avatar initials={initials} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-ink">{name}</span>
          {tags.map((t) => (
            <Tag key={t} tone={t === "Школа" ? "muted" : "rose"}>
              {t}
            </Tag>
          ))}
        </div>
        <div className="mt-1.5">
          <Progress value={progress} />
        </div>
      </div>
      <GhostBtn className="px-4 py-2">
        <Plus className="size-3.5" /> Урок
      </GhostBtn>
      <ContactControl enabled={contact} />
      <button className="text-muted-foreground/70">
        <ChevronDown className="size-4" />
      </button>
    </div>
  );
}
