import { useState } from "react";
import { RotateCcw } from "lucide-react";
import type { Topic } from "@/data/student";

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

export function TopicColumn({
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
