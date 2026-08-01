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
import {
  topics,
  prototypes,
  paceMultiplier,
  progressVariants,
  type Topic,
} from "@/data/student";

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

function plural(n: number, forms: [string, string, string]) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}

function TopicList({
  items,
  showDates,
  muted,
}: {
  items: Topic[];
  showDates: boolean;
  muted?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;
  const visible = expanded ? items : items.slice(0, 3);

  return (
    <div>
      <ul className="space-y-2">
        {visible.map((t) => (
          <li key={t.title} className="flex items-start gap-3 text-sm">
            {t.review ? (
              <RotateCcw className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            ) : null}
            <span
              className={
                t.review
                  ? "min-w-0 flex-1 text-primary"
                  : `min-w-0 flex-1 ${muted ? "text-muted-foreground" : "text-secondary-foreground"}`
              }
            >
              {t.title}
            </span>
            {showDates && t.date ? (
              <span className="ml-4 shrink-0 text-xs text-muted-foreground">{t.date}</span>
            ) : null}
          </li>
        ))}
      </ul>
      {items.length > 3 ? (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-2.5 inline-flex items-center gap-1 text-xs font-medium text-primary"
        >
          {expanded ? "Свернуть" : `Показать все (${items.length})`}
        </button>
      ) : null}
    </div>
  );
}

function Column({
  title,
  icon,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  items: Topic[];
}) {
  const done = items.filter((t) => t.date);
  const todo = items.filter((t) => !t.date);

  return (
    <section className="glass-inset rounded-3xl p-5">
      <div className="flex items-center gap-2.5">
        {icon}
        <p className="font-display text-[0.7rem] font-medium">{title}</p>
        <span className="ml-auto text-sm">
          <b className="font-display">{done.length}</b>
          <span className="text-muted-foreground"> / {items.length}</span>
        </span>
      </div>

      {done.length > 0 ? (
        <div className="mt-4">
          <p className="mb-2.5 text-xs text-muted-foreground">Пройдено · {done.length}</p>
          <TopicList items={done} showDates />
        </div>
      ) : null}

      {todo.length > 0 ? (
        <div className={done.length > 0 ? "mt-5 border-t border-white/50 pt-4" : "mt-4"}>
          <p className="mb-2.5 text-xs text-muted-foreground">Осталось · {todo.length}</p>
          <TopicList items={todo} showDates={false} muted />
        </div>
      ) : (
        <p className="mt-5 border-t border-white/50 pt-4 text-xs text-muted-foreground">
          Все темы пройдены 🎉
        </p>
      )}
    </section>
  );
}

export function ProgressCard() {
  const [open, setOpen] = useState(false);
  const [variantId, setVariantId] = useState(progressVariants[0].id);
  const variant = progressVariants.find((v) => v.id === variantId) ?? progressVariants[0];

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
        <>
          <div className="mt-6 border-t border-white/50 pt-6">
            <div className="mb-4 flex flex-wrap gap-2">
              {progressVariants.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setVariantId(v.id)}
                  className={
                    v.id === variant.id
                      ? "rounded-full px-3.5 py-1.5 text-xs font-medium text-destructive-foreground"
                      : "rounded-full border border-white/60 bg-white/45 px-3.5 py-1.5 text-xs font-medium text-secondary-foreground backdrop-blur-md transition-colors hover:bg-white/70"
                  }
                  style={
                    v.id === variant.id
                      ? { background: "var(--gradient-warm)", boxShadow: "var(--shadow-soft)" }
                      : undefined
                  }
                >
                  {v.label}
                </button>
              ))}
            </div>

            <div
              className={`grid gap-6 ${variant.prototypes.length > 0 ? "sm:grid-cols-2" : "grid-cols-1"}`}
            >
              <Column
                title="Темы"
                icon={<BookOpen className="h-4 w-4 text-primary" />}
                items={variant.topics}
              />
              {variant.prototypes.length > 0 ? (
                <Column
                  title="Прототипы"
                  icon={<Layers className="h-4 w-4 text-primary" />}
                  items={variant.prototypes}
                />
              ) : null}
            </div>

            {variant.weeklyCount > 0 ? (
              <div className="glass-inset mt-4 flex items-center gap-3 rounded-3xl p-4">
                <Flame className="h-4 w-4 shrink-0 text-primary" />
                <p className="text-sm text-secondary-foreground">
                  На этой неделе пройдено{" "}
                  <b className="text-primary">
                    {variant.weeklyCount} {plural(variant.weeklyCount, ["тема", "темы", "тем"])}
                  </b>
                </p>
              </div>
            ) : null}
          </div>
        </>
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
