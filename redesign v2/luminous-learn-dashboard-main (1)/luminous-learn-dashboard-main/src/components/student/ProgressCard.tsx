import { useState } from "react";
import {
  TrendingUp,
  BookOpen,
  Layers,
  Flame,
  RotateCcw,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { topics, prototypes, paceMultiplier, recentCount, type Topic } from "@/data/student";

function Bar({ value }: { value: number }) {
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/55">
      <div
        className="h-full rounded-full"
        style={{ width: `${value}%`, background: "var(--gradient-warm)" }}
      />
    </div>
  );
}

function TopicList({ items, done }: { items: Topic[]; done: boolean }) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;
  const visible = expanded ? items : items.slice(0, 3);

  return (
    <div>
      <ul className="space-y-1.5">
        {visible.map((t) => (
          <li
            key={t.title}
            className="flex items-center gap-2 text-sm text-secondary-foreground"
          >
            <span className={t.review ? "text-primary" : "truncate"}>
              {t.review ? <RotateCcw className="h-3.5 w-3.5" /> : null}
            </span>
            <span className={`truncate ${t.review ? "text-primary" : ""}`}>{t.title}</span>
            {done && t.date ? (
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">{t.date}</span>
            ) : null}
          </li>
        ))}
      </ul>
      {items.length > 3 ? (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-2.5 inline-flex items-center gap-1 text-xs font-medium text-primary"
        >
          {expanded ? "Свернуть список" : `Показать все (${items.length})`}
        </button>
      ) : null}
    </div>
  );
}

function Group({ title, items }: { title: string; items: Topic[] }) {
  if (items.length === 0) return null;
  const done = items.filter((t) => t.date);
  const todo = items.filter((t) => !t.date);

  return (
    <section className="glass-inset rounded-3xl p-5">
      <p className="font-display text-[0.7rem] font-medium text-muted-foreground">{title}</p>
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        <div>
          <p className="mb-2.5 text-xs text-muted-foreground">Пройдено · {done.length}</p>
          <TopicList items={done} done />
        </div>
        <div>
          <p className="mb-2.5 text-xs text-muted-foreground">Осталось · {todo.length}</p>
          <TopicList items={todo} done={false} />
        </div>
      </div>
    </section>
  );
}

export function ProgressCard() {
  const [open, setOpen] = useState(false);

  const topicsDone = topics.filter((t) => t.date).length;
  const protoDone = prototypes.filter((t) => t.date).length;
  const total = topics.length + prototypes.length;
  const percent = Math.round(((topicsDone + protoDone) / total) * 100);

  return (
    <section className="glass-soft mt-5 rounded-4xl p-6 sm:p-7">
      <div className="flex items-center gap-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-primary-foreground"
          style={{ background: "var(--gradient-warm)" }}
        >
          <TrendingUp className="h-5 w-5" />
        </span>
        <h3 className="text-lg">Прогресс подготовки</h3>
        <span className="ml-auto font-display text-2xl text-primary">{percent}%</span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="glass-inset rounded-3xl p-4">
          <div className="flex items-center gap-2.5">
            <BookOpen className="h-4 w-4 text-primary" />
            <span className="text-sm text-secondary-foreground">Темы</span>
            <span className="ml-auto text-sm">
              <b className="font-display">{topicsDone}</b>
              <span className="text-muted-foreground"> / {topics.length}</span>
            </span>
          </div>
          <Bar value={(topicsDone / topics.length) * 100} />
        </div>

        {prototypes.length > 0 ? (
          <div className="glass-inset rounded-3xl p-4">
            <div className="flex items-center gap-2.5">
              <Layers className="h-4 w-4 text-primary" />
              <span className="text-sm text-secondary-foreground">Типы задач</span>
              <span className="ml-auto text-sm">
                <b className="font-display">{protoDone}</b>
                <span className="text-muted-foreground"> / {prototypes.length}</span>
              </span>
            </div>
            <Bar value={(protoDone / prototypes.length) * 100} />
          </div>
        ) : null}
      </div>

      <div className="glass-inset mt-3 flex items-start gap-3 rounded-3xl p-4">
        <Flame className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-sm text-secondary-foreground">
          За последние два занятия прошли{" "}
          <b className="text-primary">в {paceMultiplier.toLocaleString("ru-RU")} раза больше</b> тем,
          чем за предыдущие — отличная динамика!
        </p>
      </div>

      {open ? (
        <div className="mt-4 space-y-3">
          <Group title="Темы" items={topics} />
          <Group title="Прототипы" items={prototypes} />
          {recentCount > 0 ? (
            <p className="px-1 text-xs text-muted-foreground">
              За последние 7 дней пройдено {recentCount} темы — так держать.
            </p>
          ) : null}
        </div>
      ) : null}

      <button
        onClick={() => setOpen((v) => !v)}
        className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary"
      >
        {open ? "Свернуть" : "Подробнее"}
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
    </section>
  );
}
